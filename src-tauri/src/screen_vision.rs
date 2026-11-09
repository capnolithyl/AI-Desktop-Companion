//! Explicit, one-shot screen capture for local Ollama multimodal chat.
 //! No polling, no image files, no network upload other than localhost Ollama.
 //! The frontend requires an explicit capture action and preview before sending.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use xcap::Monitor;

const MAX_JPEG_BYTES: usize = 4 * 1024 * 1024;
const MAX_JPEG_BASE64: usize = (MAX_JPEG_BYTES + 2) / 3 * 4;
const MAX_WIDTH: u32 = 1600;
const MAX_HEIGHT: u32 = 1050;
const DEFAULT_CAPTURE_INTERVAL: u64 = 15;
const MIN_CAPTURE_INTERVAL: u64 = 1;
const MAX_CAPTURE_INTERVAL: u64 = 20;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenMonitor {
    index: usize,
    label: String,
    width: u32,
    height: u32,
    primary: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenCapture {
    image_base64: String,
    width: u32,
    height: u32,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionModelStatus {
    supports_vision: bool,
    model: String,
}

#[tauri::command]
pub fn vision_monitors() -> Result<Vec<ScreenMonitor>, String> {
    let monitors = Monitor::all().map_err(|e| format!("Cannot list displays: {e}"))?;
    if monitors.is_empty() { return Err("No displays found".into()); }
    monitors.iter().enumerate().map(|(index, m)| Ok(ScreenMonitor {
        index,
        label: m.friendly_name().unwrap_or_else(|_| format!("Display {}", index + 1)),
        width: m.width().map_err(|e| e.to_string())?,
        height: m.height().map_err(|e| e.to_string())?,
        primary: m.is_primary().unwrap_or(false),
    })).collect()
}

/// Physical pixel rectangle relative to the selected monitor; never desktop
/// absolute coordinates. Cropping happens before image downscaling/JPEG encoding.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenRegion {
    pub x:u32, pub y:u32, pub width:u32, pub height:u32
}

pub(super) fn valid_region(region: ScreenRegion, monitor_width:u32, monitor_height:u32) -> bool {
    region.width >= 48 && region.height >= 48 &&
    region.x.checked_add(region.width).is_some_and(|x|x<=monitor_width) &&
    region.y.checked_add(region.height).is_some_and(|y|y<=monitor_height)
}
fn clamp_interval(value: u64) -> u64 { value.clamp(MIN_CAPTURE_INTERVAL,MAX_CAPTURE_INTERVAL) }

/// Model support comes from the installed model's actual Ollama capabilities,
/// never guesses based on its model name.
#[tauri::command]
pub async fn vision_model_status(endpoint: String, model: String) -> Result<VisionModelStatus, String> {
    if model.trim().is_empty() { return Err("Choose a local Ollama model first".into()); }
    let base = super::local_origin(&endpoint)?;
    let response = super::client()?.post(format!("{base}/api/show"))
        .json(&json!({ "model": model }))
        .timeout(Duration::from_secs(15))
        .send().await
        .map_err(|e| format!("Cannot query Ollama model capabilities: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Ollama model lookup returned HTTP {}", response.status()));
    }
    let details: serde_json::Value = response.json().await
        .map_err(|e| format!("Cannot parse Ollama model capabilities: {e}"))?;
    let supports_vision = details["capabilities"].as_array()
        .is_some_and(|items| items.iter().any(|entry| entry.as_str() == Some("vision")));
    Ok(VisionModelStatus { supports_vision, model })
}

pub(super) fn encode_capture(index: usize, region: Option<ScreenRegion>) -> Result<ScreenCapture, String> {
    let monitors = Monitor::all().map_err(|e| format!("Cannot list displays: {e}"))?;
    let monitor = monitors.get(index).ok_or("Selected display no longer exists")?;
    let label = monitor.friendly_name().unwrap_or_else(|_| format!("Display {}", index + 1));
    let mw=monitor.width().map_err(|e|e.to_string())?;
    let mh=monitor.height().map_err(|e|e.to_string())?;
    let captured=match region {
        Some(rect) => {
            if !valid_region(rect,mw,mh) {return Err("Selected region is outside the monitor or too small".into());}
            monitor.capture_region(rect.x,rect.y,rect.width,rect.height)
        },
        None=>monitor.capture_image()
    }.map_err(|e|format!("Screen capture failed: {e}"))?;
    // Scaling limits Ollama prefill memory and screenshot transfers on 16 GB VRAM.
    let image = DynamicImage::ImageRgba8(captured);
    let scaled = if image.width() > MAX_WIDTH || image.height() > MAX_HEIGHT {
        image.resize(MAX_WIDTH, MAX_HEIGHT, FilterType::Lanczos3)
    } else {
        image
    };
    let width = scaled.width();
    let height = scaled.height();
    let mut bytes = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut bytes, 82);
    encoder.encode_image(&DynamicImage::ImageRgb8(scaled.to_rgb8()))
        .map_err(|e| format!("Could not compress screenshot: {e}"))?;
    if bytes.is_empty() || bytes.len() > MAX_JPEG_BYTES {
        return Err("Screenshot is too large. Try reducing display resolution.".into());
    }
    Ok(ScreenCapture { image_base64: STANDARD.encode(bytes), width, height, label })
}

#[tauri::command]
pub async fn vision_capture(app: tauri::AppHandle, monitor_index: usize, region: Option<ScreenRegion>) -> Result<ScreenCapture, String> {
    // Temporarily remove Mikan's always-on-top window from the screenshot.
    // The window is restored even when capture or encoding returns an error.
    let window = app.get_webview_window("main").ok_or("Mikan's window is unavailable")?;
    let was_visible = window.is_visible().map_err(|e| e.to_string())?;
    if was_visible { window.hide().map_err(|e| format!("Could not hide overlay: {e}"))?; }
    let result = tauri::async_runtime::spawn_blocking(move || {
        thread::sleep(Duration::from_millis(280));
        encode_capture(monitor_index, region)
    }).await.map_err(|e| format!("Capture task failed: {e}"));
    if was_visible {
        let _ = window.show();
        let _ = window.set_focus();
    }
    result?
}

/// An explicitly opted-in, session-only screen watcher. The capture thread
/// runs inside the Windows Tauri process, not inside the potentially suspended
/// WebView, so it keeps sampling even when Mikan is hidden in the tray.
/// Only the most recent JPEG exists in RAM, never SQLite, disk, or the web.
const LIVE_MAX_FRAME_AGE_MS: u64 = 45_000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveVisionFrame {
    capture: ScreenCapture,
    captured_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveVisionStatus {
    enabled: bool,
    monitor_index: Option<usize>,
    last_capture_at_ms: Option<u64>,
    error: Option<String>,
    capture_interval_seconds: u64,
    region: Option<ScreenRegion>,
}

struct LiveVisionSession {
    enabled: bool,
    generation: u64,
    monitor_index: Option<usize>,
    last: Option<LiveVisionFrame>,
    error: Option<String>,
    capture_interval_seconds: u64,
    region: Option<ScreenRegion>,
}

impl Default for LiveVisionSession {
    fn default()->Self{
        Self{enabled:false,generation:0,monitor_index:None,last:None,error:None,
            capture_interval_seconds:DEFAULT_CAPTURE_INTERVAL,region:None}
    }
}
#[derive(Default)]
pub struct LiveVisionState(Mutex<LiveVisionSession>);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap_or_default().as_millis().min(u64::MAX as u128) as u64
}

fn frame_fresh(captured_at: u64, current: u64) -> bool {
    current >= captured_at && current - captured_at <= LIVE_MAX_FRAME_AGE_MS
}

fn live_status(session: &LiveVisionSession) -> LiveVisionStatus {
    LiveVisionStatus {
        enabled: session.enabled,
        monitor_index: session.monitor_index,
        last_capture_at_ms: session.last.as_ref().map(|frame| frame.captured_at_ms),
        error: session.error.clone(),
        capture_interval_seconds:session.capture_interval_seconds,
        region:session.region,
    }
}

#[tauri::command]
pub fn vision_live_status(state: tauri::State<'_, LiveVisionState>) -> Result<LiveVisionStatus, String> {
    let session = state.0.lock().map_err(|_| "Live vision state is unavailable")?;
    Ok(live_status(&session))
}

/// Start/stop only from the owner's explicit UI action. Never called as an
/// LLM tool. Each start resets the previous worker generation and discards
/// any old frame. OFF immediately destroys the cached JPEG.
#[tauri::command]
pub fn vision_live_set(
    app: tauri::AppHandle,
    enabled: bool,
    monitor_index: Option<usize>,
    interval_seconds: Option<u64>,
    region: Option<ScreenRegion>,
) -> Result<LiveVisionStatus, String> {
    let selected = if enabled {
        let monitors = Monitor::all().map_err(|e| format!("Cannot list displays: {e}"))?;
        let index = monitor_index.ok_or("Select a monitor before enabling Live Vision")?;
        let monitor=monitors.get(index).ok_or("Selected monitor is unavailable")?;
        if let Some(rect)=region {
            let w=monitor.width().map_err(|e|e.to_string())?;
            let h=monitor.height().map_err(|e|e.to_string())?;
            if !valid_region(rect,w,h) {return Err("Selected region is no longer valid for this monitor".into());}
        }
        Some(index)
    } else { None };

    let generation;
    let status;
    {
        let store = app.state::<LiveVisionState>();
        let mut session = store.0.lock().map_err(|_| "Live vision state is unavailable")?;
        session.generation = session.generation.wrapping_add(1);
        generation = session.generation;
        session.enabled = enabled;
        session.monitor_index = selected;
        session.last = None;
        session.error = None;
        session.capture_interval_seconds=clamp_interval(interval_seconds.unwrap_or(DEFAULT_CAPTURE_INTERVAL));
        session.region=if enabled {region} else {None};
        status = live_status(&session);
    }

    if let Some(index) = selected {
        let worker_app = app.clone();
        let spawned = thread::Builder::new().name("mikan-live-vision".into()).spawn(move || {
            loop {
                // No sleep before the initial capture, so the first frame is
                // normally available soon after the owner enables the toggle.
                let config = {
                    let state = worker_app.state::<LiveVisionState>();
                    let Ok(current)=state.0.lock() else{return;};
                    if !current.enabled || current.generation!=generation ||
                       current.monitor_index!=Some(index) {return;}
                    (current.capture_interval_seconds,current.region)
                };
                // Don't hide or focus Mikan every 15 seconds: doing so would
                // visibly flicker and interrupt the user's other windows.
                // Mikan's overlay may therefore appear inside a live frame.
                let image = encode_capture(index,config.1);
                {
                    let state = worker_app.state::<LiveVisionState>();
                    let Ok(mut session) = state.0.lock() else { return; };
                    if !session.enabled || session.generation != generation ||
                        session.monitor_index != Some(index) { return; }
                    // Avoid publishing a capture based on an earlier crop if
                    // the owner changed region during capture.
                    if session.region!=config.1 {continue;}
                    match image {
                        Ok(capture) => {
                            session.last = Some(LiveVisionFrame {
                                capture, captured_at_ms: now_ms()
                            });
                            session.error = None;
                        },
                        Err(error) => {
                            session.last = None; // Never reuse a stale frame on failure.
                            session.error = Some(error);
                        }
                    }
                }
                // Check for OFF/region/interval changes at most 100ms apart.
                // The worker never needs to wait 20 seconds just to stop.
                let mut remaining=config.0*10;
                while remaining>0 {
                    thread::sleep(Duration::from_millis(100));
                    let state=worker_app.state::<LiveVisionState>();
                    let Ok(session)=state.0.lock() else{return;};
                    if !session.enabled || session.generation!=generation ||
                       session.monitor_index!=Some(index) {return;}
                    if (session.capture_interval_seconds,session.region)!=config {break;}
                    remaining-=1;
                }
            }
        });
        if let Err(error) = spawned {
            let state = app.state::<LiveVisionState>();
            let mut session = state.0.lock().map_err(|_| "Live vision state is unavailable")?;
            if session.generation == generation {
                session.enabled = false;
                session.monitor_index = None;
                session.last = None;
                session.error = Some(format!("Could not start screen watcher: {error}"));
            }
            return Err(format!("Could not start Live Vision: {error}"));
        }
    }
    Ok(status)
}

/// Change the sampling interval/rectangle without restarting the window
/// worker. Any region change invalidates the last screenshot immediately.
#[tauri::command]
pub fn vision_live_configure(
    state: tauri::State<'_, LiveVisionState>,
    interval_seconds:u64,
    region:Option<ScreenRegion>,
)->Result<LiveVisionStatus,String>{
    let mut session=state.0.lock().map_err(|_|"Live Vision state is unavailable")?;
    if session.enabled {
        let monitors=Monitor::all().map_err(|e|e.to_string())?;
        let monitor=monitors.get(session.monitor_index.ok_or("No monitor selected")?)
            .ok_or("Live Vision monitor is unavailable")?;
        if let Some(rect)=region {
            let w=monitor.width().map_err(|e|e.to_string())?;
            let h=monitor.height().map_err(|e|e.to_string())?;
            if !valid_region(rect,w,h) {return Err("Selected capture rectangle is invalid for this monitor".into());}
        }
    }
    let interval=clamp_interval(interval_seconds);
    if session.region!=region {session.last=None;}
    session.capture_interval_seconds=interval;
    session.region=region;
    Ok(live_status(&session))
}

#[tauri::command]
pub fn vision_live_latest(state: tauri::State<'_, LiveVisionState>) -> Result<Option<LiveVisionFrame>, String> {
    let session = state.0.lock().map_err(|_| "Live vision state is unavailable")?;
    if !session.enabled { return Ok(None); }
    Ok(session.last.as_ref()
        .filter(|frame| frame_fresh(frame.captured_at_ms, now_ms()))
        .cloned())
}

/// Defense in depth for the chat bridge. The model receives at most one
/// freshly captured JPEG, attached only to the final user message.
pub(crate) fn validate_request_images(messages: &[super::ChatMessage]) -> Result<(), String> {
    let last = messages.len().saturating_sub(1);
    for (index, message) in messages.iter().enumerate() {
        if message.images.is_empty() { continue; }
        if index != last || message.role != "user" || message.images.len() != 1 {
            return Err("Screenshots may only be attached to the latest user turn".into());
        }
        let b64 = &message.images[0];
        if b64.len() > MAX_JPEG_BASE64 || b64.len() < 16 {
            return Err("Screenshot payload is too large or empty".into());
        }
        let bytes = STANDARD.decode(b64).map_err(|_| "Invalid screenshot encoding".to_owned())?;
        if bytes.len() > MAX_JPEG_BYTES || !bytes.starts_with(&[0xff,0xd8,0xff]) ||
            !bytes.ends_with(&[0xff,0xd9])
        {
            return Err("Screenshot must be a bounded JPEG image".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn user(images: Vec<String>) -> super::super::ChatMessage {
        super::super::ChatMessage { role:"user".into(), content:"Look".into(), images }
    }
    #[test]
    fn reject_invalid_unconsented_image_payloads() {
        let image = STANDARD.encode([0xff,0xd8,0xff,0x00,0xff,0xd9]);
        assert!(validate_request_images(&[user(vec![image.clone()])]).is_err()); // tiny payload
        assert!(validate_request_images(&[user(vec!["a".repeat(5_600_000)])]).is_err());
        assert!(validate_request_images(&[user(vec!["not-base64".into()])]).is_err());
        assert!(validate_request_images(&[user(vec![image.clone(),image.clone()])]).is_err());
        assert!(validate_request_images(&[
            user(vec![image]), user(vec![])
        ]).is_err());
        assert!(validate_request_images(&[user(vec![])]).is_ok());
    }
    #[test]
    fn region_crop_validation_and_interval_bounds() {
        assert_eq!(clamp_interval(0),1);
        assert_eq!(clamp_interval(2),2);
        assert_eq!(clamp_interval(25),20);
        assert!(valid_region(ScreenRegion{x:100,y:50,width:750,height:450},3840,1080));
        assert!(!valid_region(ScreenRegion{x:3790,y:50,width:100,height:450},3840,1080));
        assert!(!valid_region(ScreenRegion{x:u32::MAX,y:0,width:100,height:100},3840,1080));
        assert!(!valid_region(ScreenRegion{x:0,y:0,width:10,height:10},3840,1080));
    }
    #[test]
    fn live_screen_cache_expires_and_default_state_is_off() {
        let state=LiveVisionSession::default();
        assert!(!live_status(&state).enabled);
        assert!(!frame_fresh(1_000, 50_000));
        assert!(frame_fresh(1_000, 46_000));
        assert!(!frame_fresh(200, 100));
    }
    #[test]
    fn allow_bounded_jpeg_on_last_user_message() {
        let mut image = vec![0xff,0xd8,0xff]; image.extend(vec![0u8;24]);image.extend([0xff,0xd9]);
        assert!(validate_request_images(&[user(vec![STANDARD.encode(image)])]).is_ok());
    }
}
