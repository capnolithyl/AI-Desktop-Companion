//! Small, localhost-only bridge between the Tauri WebView and a local TTS service.
//! The Python Qwen3-TTS implementation stays optional and replaceable.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Url;
use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;

const MAX_WAV_BYTES: usize = 12 * 1024 * 1024;

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
    let response = client()?.get(url).timeout(Duration::from_secs(8)).send().await
        .map_err(|e| format!("Cannot reach local voice server: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Voice server returned HTTP {}", response.status()));
    }
    let value: Value = response.json().await.map_err(|_| "Invalid voice server health response".to_string())?;
    Ok(VoiceHealth {
        ready: value["status"] == "ok",
        model_loaded: value["model_loaded"].as_bool().unwrap_or(false),
        device: value["device"].as_str().map(str::to_owned),
    })
}

#[tauri::command]
pub async fn voice_synthesize(endpoint: String, text: String, voice_prompt: String) -> Result<String, String> {
    let url = service_url(&endpoint, "/synthesize")?;
    let text = text.trim();
    let prompt = voice_prompt.trim();
    if text.is_empty() || text.chars().count() > 900 {
        return Err("Speech text must contain 1–900 characters".into());
    }
    if prompt.is_empty() || prompt.chars().count() > 650 {
        return Err("Voice description must contain 1–650 characters".into());
    }
    let mut response = client()?.post(url)
        .json(&json!({"text": text, "voice_prompt": prompt, "language": "English"}))
        .timeout(Duration::from_secs(240))
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
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Voice audio interrupted: {e}"))? {
        if wav.len() + chunk.len() > MAX_WAV_BYTES {
            return Err("Voice server returned an oversized audio file".into());
        }
        wav.extend_from_slice(&chunk);
    }
    if wav.len() < 44 || !wav.starts_with(b"RIFF") || &wav[8..12] != b"WAVE" {
        return Err("Voice server did not return a valid WAV header".into());
    }
    Ok(STANDARD.encode(wav))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_plain_local_origins() {
        assert!(service_url("http://127.0.0.1:8765", "/health").is_ok());
        assert!(service_url("http://localhost:8765", "/health").is_ok());
        assert!(service_url("http://example.com:8765", "/health").is_err());
        assert!(service_url("https://127.0.0.1:8765", "/health").is_err());
        assert!(service_url("http://127.0.0.1:8765/other", "/health").is_err());
        assert!(service_url("http://127.0.0.1:8765/?x=1", "/health").is_err());
    }
}
