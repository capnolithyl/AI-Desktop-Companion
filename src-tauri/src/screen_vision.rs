//! Explicit, one-shot screen capture for local Ollama multimodal chat.
 //! No polling, no image files, no network upload other than localhost Ollama.
 //! The frontend requires an explicit capture action and preview before sending.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage};
use serde::Serialize;
use serde_json::json;
use std::{thread, time::Duration};
use tauri::Manager;
use xcap::Monitor;

const MAX_JPEG_BYTES: usize = 4 * 1024 * 1024;
const MAX_JPEG_BASE64: usize = (MAX_JPEG_BYTES + 2) / 3 * 4;
const MAX_WIDTH: u32 = 1600;
const MAX_HEIGHT: u32 = 1050;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenMonitor {
    index: usize,
    label: String,
    width: u32,
    height: u32,
    primary: bool,
}

#[derive(Serialize)]
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

fn encode_capture(index: usize) -> Result<ScreenCapture, String> {
    let monitors = Monitor::all().map_err(|e| format!("Cannot list displays: {e}"))?;
    let monitor = monitors.get(index).ok_or("Selected display no longer exists")?;
    let label = monitor.friendly_name().unwrap_or_else(|_| format!("Display {}", index + 1));
    let captured = monitor.capture_image().map_err(|e| format!("Screen capture failed: {e}"))?;
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
pub async fn vision_capture(app: tauri::AppHandle, monitor_index: usize) -> Result<ScreenCapture, String> {
    // Temporarily remove Mikan's always-on-top window from the screenshot.
    // The window is restored even when capture or encoding returns an error.
    let window = app.get_webview_window("main").ok_or("Mikan's window is unavailable")?;
    let was_visible = window.is_visible().map_err(|e| e.to_string())?;
    if was_visible { window.hide().map_err(|e| format!("Could not hide overlay: {e}"))?; }
    let result = tauri::async_runtime::spawn_blocking(move || {
        thread::sleep(Duration::from_millis(280));
        encode_capture(monitor_index)
    }).await.map_err(|e| format!("Capture task failed: {e}"));
    if was_visible {
        let _ = window.show();
        let _ = window.set_focus();
    }
    result?
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
    fn allow_bounded_jpeg_on_last_user_message() {
        let mut image = vec![0xff,0xd8,0xff]; image.extend(vec![0u8;24]);image.extend([0xff,0xd9]);
        assert!(validate_request_images(&[user(vec![STANDARD.encode(image)])]).is_ok());
    }
}
