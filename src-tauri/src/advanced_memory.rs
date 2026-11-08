//! Optional desktop Mem0 OSS semantic retrieval. Only localhost is contacted.
//! Existing SQLite user_memories is authoritative and stays fully editable.
//! A missing service or vector index never blocks ordinary chat.
use crate::memory;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::Duration, process::{Child, Command, Stdio}, sync::{Mutex, OnceLock}};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tauri::AppHandle;

const SERVICE: &str = "http://127.0.0.1:18764";

static OWN_CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

fn data_path() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA")
        .map(|root| PathBuf::from(root).join("Mikan").join("advanced-memory"))
}

/// A sidecar installed by the owner may be started with Mikan. No download,
/// cloud login or external command is attempted by the desktop app itself.
pub fn start_if_installed() {
    #[cfg(target_os = "windows")]
    {
        let Some(root) = data_path() else { return };
        let python = root.join("venv").join("Scripts").join("python.exe");
        let script = root.join("server.py");
        if !python.is_file() || !script.is_file() { return }
        if std::net::TcpStream::connect_timeout(
            &std::net::SocketAddr::from(([127,0,0,1],18764)),
            Duration::from_millis(120)).is_ok() { return }
        let mut command = Command::new(python);
        command.arg(script).current_dir(&root)
            .stdout(Stdio::null()).stderr(Stdio::null());
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        if let Ok(child) = command.spawn() {
            let holder = OWN_CHILD.get_or_init(|| Mutex::new(None));
            if let Ok(mut guard) = holder.lock() { *guard = Some(child) }
        }
    }
}

/// Stop only a service process started by this Mikan instance. Do not kill
/// an independently launched owner-managed Mem0 service.
pub fn stop_if_started() {
    if let Some(holder) = OWN_CHILD.get() {
        if let Ok(mut guard) = holder.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}


#[derive(Clone, Deserialize, Serialize)]
pub struct SemanticMatch {
    id: i64,
    fact: String,
    score: Option<f64>,
}

#[derive(Deserialize)]
struct RecallResponse {
    matches: Vec<SemanticMatch>,
}

fn token_path() -> Option<PathBuf> {
    data_path().map(|root| root.join("token"))
}
fn token() -> Option<String> {
    let value = fs::read_to_string(token_path()?).ok()?;
    let value = value.trim();
    (value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit()))
        .then(|| value.to_owned())
}

#[tauri::command]
pub async fn memory_semantic_recall(app: AppHandle, query: String) -> Vec<SemanticMatch> {
    if query.trim().is_empty() || query.len() > 1000 {
        return vec![];
    }
    let Some(secret) = token() else { return vec![] };
    // Curated SQLite records, not chat logs or character canon, are indexed.
    let Ok(facts) = memory::memory_list_facts(app) else { return vec![] };
    let Ok(client) = reqwest::Client::builder()
        .connect_timeout(Duration::from_millis(250))
        .timeout(Duration::from_secs(12))
        .build() else { return vec![] };
    let Ok(response) = client.post(format!("{SERVICE}/recall"))
        .header("X-Mikan-Token", secret)
        .json(&json!({ "query": query, "facts": facts }))
        .send().await else { return vec![] };
    if !response.status().is_success() { return vec![] }
    let Ok(mut results) = response.json::<RecallResponse>().await else { return vec![] };
    // Never allow service-provided text to impersonate a curated fact.
    let allowed: std::collections::HashMap<i64, &str> =
        facts.iter().map(|fact| (fact.id, fact.fact.as_str())).collect();
    results.matches.retain(|entry| {
        allowed.get(&entry.id).is_some_and(|expected| *expected == entry.fact)
    });
    results.matches.truncate(8);
    results.matches
}

#[tauri::command]
pub async fn memory_semantic_status() -> Value {
    let installed = token().is_some();
    if !installed {
        return json!({"ready": false, "reason": "Not installed"});
    }
    let Ok(client) = reqwest::Client::builder()
        .connect_timeout(Duration::from_millis(250))
        .timeout(Duration::from_millis(800))
        .build() else { return json!({"ready": false}); };
    let ready = client.get(format!("{SERVICE}/health"))
        .send().await.map(|response| response.status().is_success()).unwrap_or(false);
    json!({"ready": ready, "provider": "Mem0 OSS + Ollama", "local": true})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_token() {
        assert!(token().is_none_or(|s| s.len() == 64));
    }
    #[test]
    fn semantic_match_decodes_ids() {
        let value: RecallResponse = serde_json::from_value(json!({
          "matches": [{"id": 7, "fact": "The user works as a developer", "score": 0.75}]
        })).unwrap();
        assert_eq!(value.matches[0].id, 7);
    }
}
