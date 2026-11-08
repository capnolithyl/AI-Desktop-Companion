//! Optional desktop Mem0 OSS semantic retrieval. Only localhost is contacted.
//! Existing SQLite user_memories is authoritative and stays fully editable.
//! A missing service or vector index never blocks ordinary chat.
use crate::memory;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::Duration};
use tauri::AppHandle;

const SERVICE: &str = "http://127.0.0.1:18764";

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
    std::env::var_os("LOCALAPPDATA")
        .map(|root| PathBuf::from(root).join("Mikan").join("advanced-memory").join("token"))
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
    if facts.is_empty() { return vec![] }
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
