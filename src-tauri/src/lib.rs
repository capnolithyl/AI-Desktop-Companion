use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[derive(Clone, Deserialize, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatRequest {
    request_id: String,
    endpoint: String,
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatChunk {
    request_id: String,
    content: String,
    done: bool,
}

fn local_origin(endpoint: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(endpoint).map_err(|_| "Enter a valid local Ollama URL".to_string())?;
    if parsed.scheme() != "http" || !matches!(parsed.host_str(), Some("localhost" | "127.0.0.1")) {
        return Err("For this prototype, only HTTP Ollama on localhost or 127.0.0.1 is allowed".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() || parsed.query().is_some() {
        return Err("Credentials and query strings are not supported in the endpoint URL".into());
    }
    if parsed.path() != "/" {
        return Err("Enter the base Ollama address, without /api or another path".into());
    }
    let host = parsed.host_str().unwrap();
    let port = parsed.port().unwrap_or(11434);
    Ok(format!("http://{host}:{port}"))
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_models(endpoint: String) -> Result<Vec<String>, String> {
    let url = format!("{}/api/tags", local_origin(&endpoint)?);
    let response = client()?.get(url).timeout(Duration::from_secs(12)).send().await
        .map_err(|e| format!("Cannot reach Ollama: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Ollama returned HTTP {}", response.status()));
    }
    let body: Value = response.json().await.map_err(|e| format!("Invalid Ollama response: {e}"))?;
    let mut names: Vec<String> = body["models"].as_array()
        .into_iter().flatten()
        .filter_map(|v| v["name"].as_str().map(str::to_owned))
        .collect();
    names.sort();
    Ok(names)
}

#[tauri::command]
async fn chat_stream(app: tauri::AppHandle, request: ChatRequest) -> Result<(), String> {
    if request.model.trim().is_empty() {
        return Err("Select an installed model in Settings".into());
    }

    let url = format!("{}/api/chat", local_origin(&request.endpoint)?);
    let response = client()?.post(url)
        .json(&json!({
            "model": request.model,
            "messages": request.messages,
            "stream": true,
            "think": false
        }))
        .send().await.map_err(|e| format!("Ollama connection failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let error = response.text().await.unwrap_or_default();
        return Err(format!("Ollama HTTP {status}: {}", error.chars().take(300).collect::<String>()));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    while let Some(result) = stream.next().await {
        let bytes = result.map_err(|e| format!("Streaming interrupted: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(newline) = buffer.find('\n') {
            let line = buffer[..newline].trim().to_owned();
            buffer.drain(..=newline);
            if line.is_empty() { continue; }
            let chunk: Value = serde_json::from_str(&line)
                .map_err(|e| format!("Invalid stream data: {e}"))?;
            if let Some(error) = chunk["error"].as_str() {
                return Err(error.to_owned());
            }
            let content = chunk["message"]["content"].as_str().unwrap_or_default().to_owned();
            let done = chunk["done"].as_bool().unwrap_or(false);
            if !content.is_empty() || done {
                let _ = app.emit("mikan://chat", ChatChunk {
                    request_id: request.request_id.clone(),
                    content,
                    done,
                });
            }
        }
    }

    if !buffer.trim().is_empty() {
        if let Ok(chunk) = serde_json::from_str::<Value>(buffer.trim()) {
            if let Some(content) = chunk["message"]["content"].as_str() {
                let _ = app.emit("mikan://chat", ChatChunk {
                    request_id: request.request_id,
                    content: content.to_owned(),
                    done: true,
                });
            }
        }
    }
    Ok(())
}

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[tauri::command]
fn toggle_companion(app: tauri::AppHandle) {
    toggle_window(&app);
}

#[tauri::command]
fn hide_companion(window: tauri::WebviewWindow) {
    let _ = window.hide();
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_models, chat_stream, toggle_companion, hide_companion
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show / Hide Mikan", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Mikan", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Mikan Desktop Companion")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => toggle_window(app),
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        toggle_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("Failed to start Mikan Companion");
}
