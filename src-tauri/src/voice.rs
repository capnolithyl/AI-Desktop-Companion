//! Small, localhost-only bridge between the Tauri WebView and a local TTS service.
//! The Python Qwen3-TTS implementation stays optional and replaceable.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
#[cfg(target_os = "windows")]
use std::{fs::{self, OpenOptions}, io::Write, net::{SocketAddr, TcpStream}, path::PathBuf, process::{Child, Command, Stdio}, sync::{Mutex, OnceLock}};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const MAX_WAV_BYTES: usize = 12 * 1024 * 1024;
const MAX_REFERENCE_BYTES: usize = 6 * 1024 * 1024;

#[cfg(target_os = "windows")]
const DEFAULT_TTS_PORT: u16 = 8765;
const POCKET_TTS_PORT: u16 = 8766;
#[cfg(target_os = "windows")]
static OWN_TTS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
#[cfg(target_os = "windows")]
static OWN_POCKET: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

#[cfg(target_os = "windows")]
#[derive(Deserialize)]
struct PocketLaunchConfig {
    executable: PathBuf,
    reference: PathBuf,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize)]
struct VoiceLaunchConfig {
    python: PathBuf,
    server: PathBuf,
    device: Option<String>,
    #[serde(rename = "cloneSize")]
    clone_size: Option<String>,
}

#[cfg(target_os = "windows")]
fn launcher_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|root| PathBuf::from(root).join("Mikan").join("voice"))
}

#[cfg(target_os = "windows")]
fn load_launcher() -> Result<Option<VoiceLaunchConfig>, String> {
    let Some(root) = launcher_dir() else { return Ok(None) };
    let file = root.join("service.json");
    if !file.is_file() { return Ok(None) }
    let content = fs::read(&file).map_err(|e| format!("Cannot read voice startup settings: {e}"))?;
    let config: VoiceLaunchConfig = serde_json::from_slice(&content)
        .map_err(|_| "Invalid voice startup settings. Rerun scripts/setup-voice-autostart.ps1".to_string())?;
    if !config.python.is_absolute() || !config.server.is_absolute()
        || !config.python.is_file() || !config.server.is_file()
        || config.python.extension().and_then(|ext| ext.to_str()) != Some("exe")
        || config.server.extension().and_then(|ext| ext.to_str()) != Some("py")
    {
        return Err("Saved voice Python/server path has moved. Rerun scripts/setup-voice-autostart.ps1".into());
    }
    if config.device.as_deref().is_some_and(|device| !matches!(device, "auto" | "cuda:0" | "cpu"))
        || config.clone_size.as_deref().is_some_and(|size| !matches!(size, "1.7B" | "0.6B"))
    {
        return Err("Invalid local voice startup options".into());
    }
    Ok(Some(config))
}

#[cfg(target_os = "windows")]
fn port_reachable(port: u16) -> bool {
    TcpStream::connect_timeout(&SocketAddr::from(([127,0,0,1],port)),
        Duration::from_millis(120)).is_ok()
}

#[cfg(target_os = "windows")]
fn voice_port_reachable() -> bool { port_reachable(DEFAULT_TTS_PORT) }

#[cfg(target_os = "windows")]
fn load_pocket_launcher() -> Result<Option<PocketLaunchConfig>, String> {
    let Some(root) = launcher_dir() else { return Ok(None) };
    let file = root.join("pocket-service.json");
    if !file.is_file() { return Ok(None) }
    let content = fs::read(&file).map_err(|e| format!("Cannot read Pocket TTS settings: {e}"))?;
    let config: PocketLaunchConfig = serde_json::from_slice(&content)
        .map_err(|_| "Invalid Pocket settings; rerun scripts/setup-pocket-tts.ps1".to_string())?;
    if !config.executable.is_absolute() || !config.executable.is_file()
        || config.executable.file_name().and_then(|s| s.to_str()) != Some("pocket-tts.exe")
        || !config.reference.is_absolute() || !config.reference.is_file()
        || config.reference != root.join("mikan-reference.wav")
    {
        return Err("Saved Pocket TTS executable or reference moved. Rerun scripts/setup-pocket-tts.ps1".into());
    }
    Ok(Some(config))
}

#[cfg(target_os = "windows")]
fn stop_owned_voice(holder: Option<&Mutex<Option<Child>>>) {
    if let Some(holder) = holder {
        if let Ok(mut owned) = holder.lock() {
            if let Some(mut child) = owned.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn start_pocket_if_configured() -> Result<bool, String> {
    let Some(config) = load_pocket_launcher()? else { return Ok(false) };
    if port_reachable(POCKET_TTS_PORT) { return Ok(false) }
    let holder = OWN_POCKET.get_or_init(||Mutex::new(None));
    let mut owned = holder.lock().map_err(|_| "Pocket startup lock unavailable".to_string())?;
    if let Some(child) = owned.as_mut() {
        match child.try_wait() {
            Ok(None) => return Ok(false),
            Ok(Some(_)) | Err(_) => *owned = None,
        }
    }
    if port_reachable(POCKET_TTS_PORT) { return Ok(false) }
    let root = launcher_dir().ok_or("Voice data folder unavailable")?;
    let log_path = root.join("pocket-service.log");
    if fs::metadata(&log_path).is_ok_and(|info|info.len()>5*1024*1024) {
        let _ = fs::remove_file(&log_path);
    }
    let mut output = OpenOptions::new().create(true).append(true).open(&log_path)
        .map_err(|e| format!("Cannot open Pocket voice log: {e}"))?;
    let _ = writeln!(output, "Starting registered Pocket TTS CPU service...");
    let errors = output.try_clone().map_err(|e| e.to_string())?;
    let directory = config.executable.parent().ok_or("Invalid Pocket executable path")?;
    let mut command = Command::new(&config.executable);
    command.args(["serve", "--host", "127.0.0.1", "--port", "8766", "--language", "english"])
        .arg("--default-voice").arg(&config.reference).current_dir(directory)
        .stdout(Stdio::from(output)).stderr(Stdio::from(errors));
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    *owned = Some(command.spawn()
        .map_err(|e| format!("Could not start Pocket TTS CPU service: {e}"))?);
    Ok(true)
}

/// Only start the owner's existing, deliberately registered Python environment.
/// Model weights remain unloaded until speech is requested. Never run pip,
/// modify ROCm, or launch another server when the configured port is occupied.
pub fn start_if_configured() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let Some(config) = load_launcher()? else { return Ok(false) };
        if voice_port_reachable() { return Ok(false) }
        let holder = OWN_TTS.get_or_init(||Mutex::new(None));
        let mut owned = holder.lock().map_err(|_| "Voice startup lock unavailable".to_string())?;
        if let Some(child) = owned.as_mut() {
            match child.try_wait() {
                Ok(None) => return Ok(false), // Already starting; do not spawn twice.
                Ok(Some(_)) => { *owned = None; }
                Err(_) => { *owned = None; }
            }
        }
        if voice_port_reachable() { return Ok(false) }
        let root = launcher_dir().ok_or("Voice data folder unavailable")?;
        let log_path = root.join("tts-service.log");
        if fs::metadata(&log_path).is_ok_and(|info|info.len()>5*1024*1024) {
            let _ = fs::remove_file(&log_path); // Bounded diagnostic log, not speech text.
        }
        let mut output = OpenOptions::new().create(true).append(true).open(&log_path)
            .map_err(|e| format!("Cannot create voice diagnostic log: {e}"))?;
        let _ = writeln!(output, "Starting registered local voice service...");
        let error_output = output.try_clone().map_err(|e| e.to_string())?;
        let directory = config.server.parent().ok_or("Invalid local TTS script")?;
        let mut command = Command::new(&config.python);
        command.arg(&config.server).current_dir(directory)
            .stdout(Stdio::from(output)).stderr(Stdio::from(error_output));
        if let Some(device) = config.device.filter(|v|v!="auto") {
            command.env("MIKAN_TTS_DEVICE",device);
        }
        if let Some(size) = config.clone_size {
            command.env("MIKAN_TTS_CLONE_SIZE",size);
        }
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW on Windows.
        *owned = Some(command.spawn()
            .map_err(|e| format!("Could not start registered voice service: {e}"))?);
        return Ok(true);
    }
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

/// A crashed managed server is retried on the next voice/connection request,
/// and late-starting Python is given a few seconds to bind its local port.
async fn ensure_managed_voice(endpoint: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let url = service_url(endpoint,"/health")?;
        // Release GPU VRAM when switching to the CPU voice. Likewise, stop an
        // idle owned Pocket child when switching back. Never kill manual servers.
        if url.port_or_known_default() == Some(POCKET_TTS_PORT) {
            stop_owned_voice(OWN_TTS.get());
        } else if url.port_or_known_default() == Some(DEFAULT_TTS_PORT) {
            stop_owned_voice(OWN_POCKET.get());
        }
        if url.port_or_known_default() == Some(POCKET_TTS_PORT) && !port_reachable(POCKET_TTS_PORT) {
            if load_pocket_launcher()?.is_none() {
                return Err("Pocket TTS is not registered. Run scripts/setup-pocket-tts.ps1 from the repo.".into());
            }
            start_pocket_if_configured()?;
            for _ in 0..60 {
                if port_reachable(POCKET_TTS_PORT) { break; }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
        if url.port_or_known_default() == Some(DEFAULT_TTS_PORT)
            && load_launcher()?.is_some() && !voice_port_reachable()
        {
            start_if_configured()?;
            for _ in 0..24 {
                if voice_port_reachable() { break; }
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = endpoint;
    Ok(())
}

/// Quit a voice service owned by this instance, without interfering with a
/// manually started owner process on the same localhost port.
pub fn stop_if_started() {
    #[cfg(target_os = "windows")]
    for holder in [OWN_TTS.get(), OWN_POCKET.get()] {
        stop_owned_voice(holder);
    }
}

fn is_pocket_endpoint(endpoint: &str) -> Result<bool, String> {
    Ok(service_url(endpoint, "/health")?.port_or_known_default() == Some(8766))
}

/// Pocket /tts streams a RIFF header claiming a billion frames. Once all
/// chunks arrive, rewrite sizes to make a normal seekable WAV for WebView2.
fn finalize_pocket_wav(wav: &mut [u8]) -> Result<(), String> {
    if wav.len() < 44 || !wav.starts_with(b"RIFF") || &wav[8..16] != b"WAVEfmt "
        || &wav[36..40] != b"data" {
        return Err("Pocket TTS returned an unsupported or incomplete WAV".into());
    }
    let riff = (wav.len() - 8) as u32;
    let data = (wav.len() - 44) as u32;
    wav[4..8].copy_from_slice(&riff.to_le_bytes());
    wav[40..44].copy_from_slice(&data.to_le_bytes());
    Ok(())
}

fn service_url(endpoint: &str, path: &str) -> Result<Url, String> {
    let mut url = Url::parse(endpoint).map_err(|_| "Enter a valid local voice service URL".to_string())?;
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("Voice service must be an HTTP localhost origin without a path or credentials".into());
    }
    url.set_path(path);
    Ok(url)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceHealth {
    ready: bool,
    model_loaded: bool,
    device: Option<String>,
}

#[tauri::command]
pub async fn voice_health(endpoint: String) -> Result<VoiceHealth, String> {
    let url = service_url(&endpoint, "/health")?;
    ensure_managed_voice(&endpoint).await?;
    let response = client()?.get(url).timeout(Duration::from_secs(8)).send().await
        .map_err(|e| format!("Cannot reach local voice server: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Voice server returned HTTP {}", response.status()));
    }
    let value: Value = response.json().await.map_err(|_| "Invalid voice server health response".to_string())?;
    if is_pocket_endpoint(&endpoint)? {
        return Ok(VoiceHealth {
            ready: value["status"] == "healthy",
            model_loaded: true, device: Some("CPU (Pocket TTS)".to_owned()),
        });
    }
    Ok(VoiceHealth {
        ready: value["status"] == "ok",
        model_loaded: value["model_loaded"].as_bool().unwrap_or(false),
        device: value["device"].as_str().map(str::to_owned),
    })
}

#[tauri::command]
pub async fn voice_synthesize(endpoint: String, text: String, voice_prompt: String) -> Result<String, String> {
    let pocket = is_pocket_endpoint(&endpoint)?;
    let started = Instant::now();
    let url = service_url(&endpoint, if pocket { "/tts" } else { "/synthesize" })?;
    ensure_managed_voice(&endpoint).await?;
    let text = text.trim();
    let prompt = voice_prompt.trim();
    if text.is_empty() || text.chars().count() > 900 {
        return Err("Speech text must contain 1–900 characters".into());
    }
    if prompt.is_empty() || prompt.chars().count() > 650 {
        return Err("Voice description must contain 1–650 characters".into());
    }
    let request = client()?.post(url);
    let request = if pocket {
        // reqwest 0.12 without default features has no .form() API.
        // The existing Url query-pair serializer uses identical form encoding.
        let mut form = Url::parse("http://localhost/").map_err(|e| e.to_string())?;
        form.query_pairs_mut().append_pair("text", text);
        let body = form.query().unwrap_or_default().to_owned();
        request.header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded").body(body)
    } else {
        request.json(&json!({"text": text, "voice_prompt": prompt, "language": "English"}))
    };
    let mut response = request.timeout(Duration::from_secs(240))
        .send().await.map_err(|e| format!("Voice generation failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!("Voice server HTTP {status}: {}", detail.chars().take(350).collect::<String>()));
    }
    if response.content_length().is_some_and(|n| n > MAX_WAV_BYTES as u64) {
        return Err("Voice server returned an oversized audio file".into());
    }
    let mut wav = Vec::new();
    let mut first_audio_ms = None;
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Voice audio interrupted: {e}"))? {
        if wav.len() + chunk.len() > MAX_WAV_BYTES {
            return Err("Voice server returned an oversized audio file".into());
        }
        wav.extend_from_slice(&chunk);
        if wav.len() > 44 && first_audio_ms.is_none() {
            first_audio_ms = Some(started.elapsed().as_millis());
        }
    }
    if wav.len() < 44 || !wav.starts_with(b"RIFF") || &wav[8..12] != b"WAVE" {
        return Err("Voice server did not return a valid WAV header".into());
    }
    if pocket {
        finalize_pocket_wav(&mut wav)?;
        #[cfg(target_os = "windows")]
        if let Some(root) = launcher_dir() {
            if let Ok(mut log) = OpenOptions::new().create(true).append(true)
                .open(root.join("pocket-client.log")) {
                // Never log user text or the reference recording.
                let _ = writeln!(log,
                    "[tts-pocket] chars={} bytes={} first_audio_bytes_ms={} total_ms={}",
                    text.chars().count(), wav.len(), first_audio_ms.unwrap_or(0),
                    started.elapsed().as_millis());
            }
        }
    }
    Ok(STANDARD.encode(wav))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_plain_local_origins() {
        assert!(service_url("http://127.0.0.1:8765", "/health").is_ok());
        assert!(is_pocket_endpoint("http://127.0.0.1:8766").unwrap());
        assert!(!is_pocket_endpoint("http://127.0.0.1:8765").unwrap());
        assert!(service_url("http://localhost:8765", "/health").is_ok());
        assert!(service_url("http://example.com:8765", "/health").is_err());
        assert!(service_url("https://127.0.0.1:8765", "/health").is_err());
        assert!(service_url("http://127.0.0.1:8765/other", "/health").is_err());
        assert!(service_url("http://127.0.0.1:8765/?x=1", "/health").is_err());
    }
    #[test]
    fn repairs_pocket_http_wav_header() {
        let mut wav=vec![0u8; 44+480];
        wav[..4].copy_from_slice(b"RIFF");
        wav[8..16].copy_from_slice(b"WAVEfmt ");
        wav[36..40].copy_from_slice(b"data");
        wav[40..44].copy_from_slice(&(2_000_000_000u32).to_le_bytes());
        finalize_pocket_wav(&mut wav).unwrap();
        assert_eq!(&wav[4..8], &(516u32).to_le_bytes());
        assert_eq!(&wav[40..44], &(480u32).to_le_bytes());
        assert!(finalize_pocket_wav(&mut wav[..25]).is_err());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceReference {
    configured: bool,
    transcript: Option<String>,
    duration_seconds: Option<f32>,
}

async fn reference_response(response: reqwest::Response) -> Result<VoiceReference, String> {
    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        let message = serde_json::from_str::<Value>(&detail).ok()
            .and_then(|value| value["error"].as_str().map(str::to_owned))
            .unwrap_or_else(|| detail.chars().take(200).collect());
        return Err(format!("Voice reference HTTP {status}: {message}"));
    }
    response.json::<VoiceReferenceWire>().await
        .map(|reference| VoiceReference {
            configured: reference.configured,
            transcript: reference.transcript,
            duration_seconds: reference.duration_seconds,
        })
        .map_err(|_| "Invalid voice reference response".into())
}

#[derive(serde::Deserialize)]
struct VoiceReferenceWire {
    configured: bool,
    transcript: Option<String>,
    duration_seconds: Option<f32>,
}

#[tauri::command]
pub async fn voice_reference_status(endpoint: String) -> Result<VoiceReference, String> {
    if is_pocket_endpoint(&endpoint)? {
        ensure_managed_voice(&endpoint).await?;
        #[cfg(target_os = "windows")]
        {
            let root=launcher_dir().ok_or("Voice data folder unavailable")?;
            let wav=root.join("mikan-reference.wav");
            let txt=root.join("mikan-reference.txt");
            let transcript=fs::read_to_string(&txt).ok();
            return Ok(VoiceReference {
                configured: wav.is_file() && transcript.as_ref().is_some_and(|t| !t.trim().is_empty()),
                transcript, duration_seconds: None
            });
        }
        #[cfg(not(target_os = "windows"))]
        return Ok(VoiceReference { configured: false, transcript: None, duration_seconds: None });
    }
    let url = service_url(&endpoint, "/reference")?;
    ensure_managed_voice(&endpoint).await?;
    let response = client()?.get(url).timeout(Duration::from_secs(10)).send().await
        .map_err(|e| format!("Cannot read voice reference: {e}"))?;
    reference_response(response).await
}

#[tauri::command]
pub async fn voice_save_reference(endpoint: String, audio_base64: String, ref_text: String) -> Result<VoiceReference, String> {
    if is_pocket_endpoint(&endpoint)? {
        return Err("Switch to Qwen3-TTS to update the shared reference, then rerun Pocket setup.".into());
    }
    let url = service_url(&endpoint, "/reference")?;
    ensure_managed_voice(&endpoint).await?;
    if !(1..=2000).contains(&ref_text.trim().chars().count()) {
        return Err("Enter the exact spoken transcript (1–2000 characters)".into());
    }
    if audio_base64.len() > MAX_REFERENCE_BYTES * 4 / 3 + 8 {
        return Err("Reference WAV must be under 6 MB".into());
    }
    let bytes = STANDARD.decode(&audio_base64).map_err(|_| "Invalid reference audio encoding".to_string())?;
    if bytes.len() < 44 || bytes.len() > MAX_REFERENCE_BYTES || !bytes.starts_with(b"RIFF") || &bytes[8..12] != b"WAVE" {
        return Err("Choose a WAV recording under 6 MB".into());
    }
    let response = client()?.post(url)
        .json(&json!({"audio_base64": audio_base64, "ref_text": ref_text.trim()}))
        .timeout(Duration::from_secs(35))
        .send().await.map_err(|e| format!("Cannot save voice reference: {e}"))?;
    reference_response(response).await
}

#[tauri::command]
pub async fn voice_delete_reference(endpoint: String) -> Result<VoiceReference, String> {
    if is_pocket_endpoint(&endpoint)? {
        return Err("Switch to Qwen3-TTS to manage the shared voice reference.".into());
    }
    let url = service_url(&endpoint, "/reference")?;
    ensure_managed_voice(&endpoint).await?;
    let response = client()?.delete(url).timeout(Duration::from_secs(15)).send().await
        .map_err(|e| format!("Cannot remove voice reference: {e}"))?;
    reference_response(response).await
}
