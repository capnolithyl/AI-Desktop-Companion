mod web_search;
mod source_priority;
mod web_reader;
mod search_service;
mod agent_tools;
mod gemini;
mod cloud_web_tools;
mod openrouter;
mod openrouter_stream;
mod research_intent;
mod source_enrichment;
mod evidence_pack;
mod recommendation_gate;
mod quantities;
mod attribution;
mod memory;
mod interest_memory;
mod memory_extraction;
mod memory_jobs;
mod memory_reviews;
mod advanced_memory;
mod session_memory;
mod voice;
mod screen_vision;
mod vision_region;
mod file_attachments;
mod iki_outfits;
mod avatar_motion;
mod notion;
use futures_util::{future::{AbortHandle, Abortable}, StreamExt};
use std::{collections::HashMap, sync::Mutex};
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
    #[serde(default)]
    images: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatRequest {
    request_id: String,
    endpoint: String,
    model: String,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    gemini_model: Option<String>,
    #[serde(default)]
    openrouter_model: Option<String>,
    #[serde(default)]
    cloud_allow_web: bool,
    messages: Vec<ChatMessage>,
    #[serde(default)]
    auto_search: bool,
    #[serde(default = "default_structured_research")]
    structured_research: bool,
    // The same TypeScript intent policy is used by Android and desktop.
    // Older API callers omit these and keep the original Rust behavior.
    #[serde(default)]
    research_route: Option<String>,
    #[serde(default)]
    research_query: Option<String>,
    #[serde(default)]
    research_task: Option<recommendation_gate::ResearchTask>,
    #[serde(default)]
    research_recent: bool,
    #[serde(default)]
    research_general_fallback: bool,
    #[serde(default)]
    thinking_requested: bool,
    #[serde(default)]
    searxng_endpoint: String,
    #[serde(default = "default_cache_hours")]
    cache_hours: u64,
    #[serde(default)]
    context_window: Option<u32>,
    #[serde(default)]
    prior_sources: Vec<web_search::SearchResult>,
    #[serde(default)]
    source_preferences: Vec<source_priority::SourcePreference>,
    #[serde(default)]
    source_topic: Option<String>,
}
fn general_knowledge_fallback_allowed(
    approved: bool,
    route: Option<&str>,
    recent: bool,
    task: Option<&recommendation_gate::ResearchTask>,
) -> bool {
    approved && route==Some("research") && !recent &&
        task.is_some_and(|item|
            item.kind==recommendation_gate::ResearchKind::Lookup &&
            item.source_url.is_none() && item.requirements.is_empty() &&
            item.roles.is_empty())
}
fn default_cache_hours() -> u64 { 24 }
fn default_structured_research() -> bool { true }
fn web_tools_allowed(auto_search: bool, research_route: Option<&str>) -> bool {
    // Backward-compatible with clients that omit research_route; a known
    // local-chat route has priority even when auto_search was left enabled.
    auto_search && research_route != Some("chat")
}
#[cfg(test)]
mod local_chat_route_tests {
    use super::*;
    #[test]
    fn personal_and_capability_chat_cannot_fall_through_to_web_planner() {
        assert!(!web_tools_allowed(true, Some("chat")));
        assert!(!web_tools_allowed(false, Some("research")));
        assert!(web_tools_allowed(true, Some("research")));
        assert!(web_tools_allowed(true, Some("factual")));
        // Keep legacy callers supported until they use explicit routing.
        assert!(web_tools_allowed(true, None));
    }
    #[test]
    fn source_optional_fallback_never_bypasses_verified_or_time_sensitive_tasks() {
        let general=recommendation_gate::ResearchTask::default();
        assert!(general_knowledge_fallback_allowed(true,Some("research"),false,Some(&general)));
        assert!(!general_knowledge_fallback_allowed(false,Some("research"),false,Some(&general)));
        assert!(!general_knowledge_fallback_allowed(true,Some("research"),true,Some(&general)));
        assert!(!general_knowledge_fallback_allowed(true,Some("chat"),false,Some(&general)));
        assert!(!general_knowledge_fallback_allowed(true,Some("research"),false,None));
        let verified=recommendation_gate::ResearchTask {
            kind:recommendation_gate::ResearchKind::Verify,..Default::default()
        };
        assert!(!general_knowledge_fallback_allowed(true,Some("research"),false,Some(&verified)));
        let discovery=recommendation_gate::ResearchTask {
            kind:recommendation_gate::ResearchKind::Discover,..Default::default()
        };
        assert!(!general_knowledge_fallback_allowed(true,Some("research"),false,Some(&discovery)));
        let linked=recommendation_gate::ResearchTask {
            source_url:Some("https://example.com".into()),..Default::default()
        };
        assert!(!general_knowledge_fallback_allowed(true,Some("research"),false,Some(&linked)));
        let measured=recommendation_gate::ResearchTask {
            requirements:vec![recommendation_gate::HardRequirement {
                quote:"under two hours".into(),relation:"lt".into(),limit:2.0,unit:"hours".into()
            }],..Default::default()
        };
        assert!(!general_knowledge_fallback_allowed(true,Some("research"),false,Some(&measured)));
    }
}
fn valid_context_window(context: Option<u32>) -> Option<u32> {
    context.filter(|v| matches!(*v, 4096 | 8192 | 16384 | 32768))
}

#[derive(Default)]
struct ChatCancellation(Mutex<HashMap<String, AbortHandle>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatChunk {
    request_id: String,
    content: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatStats {
    output_tokens: Option<u64>,
    prompt_tokens: Option<u64>,
    total_duration_ns: Option<u64>,
    load_duration_ns: Option<u64>,
    prompt_eval_duration_ns: Option<u64>,
    eval_duration_ns: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatCompletion {
    content: String,
    stats: Option<ChatStats>,
    sources: Vec<web_search::SearchResult>,
    search_query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    search_trace: Option<source_priority::SearchTrace>,
    sources_carried_over: bool,
    research_audit: Option<evidence_pack::ResearchAudit>,
    model_used: String,
    fallback_reason: Option<String>,
}

fn local_origin(endpoint: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(endpoint)
        .map_err(|_| "Enter a valid local Ollama URL".to_string())?;
    if parsed.scheme() != "http"
        || !matches!(parsed.host_str(), Some("localhost" | "127.0.0.1"))
    {
        return Err("Only HTTP Ollama on localhost or 127.0.0.1 is supported".into());
    }
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != "/"
    {
        return Err("Enter just the local Ollama URL, without credentials or a path".into());
    }
    Ok(format!(
        "http://{}:{}",
        parsed.host_str().unwrap(),
        parsed.port().unwrap_or(11434)
    ))
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
    let response = client()?
        .get(url)
        .timeout(Duration::from_secs(12))
        .send()
        .await
        .map_err(|e| format!("Cannot reach Ollama: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Ollama returned HTTP {}", response.status()));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("Invalid Ollama response: {e}"))?;
    let mut names: Vec<String> = body["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|model| model["name"].as_str().map(str::to_owned))
        .collect();
    names.sort();
    Ok(names)
}

/// Optional local-only condensed-question pass. We call it only for ambiguous
/// factual follow-ups; ordinary conversation and manual commands stay fast.
#[tauri::command]
async fn condense_local_context(
    endpoint: String,
    model: String,
    prompt: String,
    context_window: Option<u32>,
    max_output_tokens: Option<u32>,
    timeout_ms: Option<u64>,
    plain_text: Option<bool>,
) -> Result<String, String> {
    if model.trim().is_empty() || model.len() > 120 || prompt.len() > 14500 {
        return Err("Invalid context request".into());
    }
    let url = format!("{}/api/chat", local_origin(&endpoint)?);
    let output_limit = max_output_tokens.unwrap_or(190).clamp(64, 500);
    let mut options = json!({"temperature": 0, "num_predict": output_limit});
    if let Some(ctx) = valid_context_window(context_window) {
        options["num_ctx"] = json!(ctx);
    }
    let mut payload = json!({
        "model": model,
        "stream": false,
        "think": false,
        "format": "json",
        "options": options,
        "messages": [{"role":"user","content":prompt}]
    });
    // Chapter-note recovery can request ordinary bullets. Do not force the
    // local 9B model into Ollama JSON grammar on its plain-text retry.
    // All existing callers keep the default JSON output constraint.
    if plain_text.unwrap_or(false) {
        payload.as_object_mut().expect("JSON object").remove("format");
    }
    let response = client()?
        .post(url)
        .json(&payload)
        .timeout(Duration::from_millis(timeout_ms.unwrap_or(
            if output_limit > 200 { 55_000 } else { 35_000 }
        ).clamp(3_000, 55_000)))
        .send()
        .await
        .map_err(|e| format!("Local context resolution unavailable: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Local context resolution returned HTTP {}", response.status()));
    }
    let output: Value = response.json().await
        .map_err(|e| format!("Invalid local context response: {e}"))?;
    Ok(output["message"]["content"].as_str().unwrap_or("").chars().take(3600).collect())
}

fn process_line(
    app: &tauri::AppHandle,
    request_id: &str,
    line: &[u8],
    content: &mut String,
    stats: &mut Option<ChatStats>,
    finished: &mut bool,
) -> Result<(), String> {
    if line.iter().all(u8::is_ascii_whitespace) {
        return Ok(());
    }
    let chunk: Value = serde_json::from_slice(line)
        .map_err(|e| format!("Invalid Ollama stream response: {e}"))?;
    if let Some(error) = chunk["error"].as_str() {
        return Err(error.to_owned());
    }

    if let Some(delta) = chunk["message"]["content"].as_str() {
        if !delta.is_empty() {
            content.push_str(delta);
            let _ = app.emit(
                "mikan://chat",
                ChatChunk {
                    request_id: request_id.to_owned(),
                    content: delta.to_owned(),
                },
            );
        }
    }

    if chunk["done"].as_bool().unwrap_or(false) {
        *finished = true;
        *stats = Some(ChatStats {
            output_tokens: chunk["eval_count"].as_u64(),
            prompt_tokens: chunk["prompt_eval_count"].as_u64(),
            total_duration_ns: chunk["total_duration"].as_u64(),
            load_duration_ns: chunk["load_duration"].as_u64(),
            prompt_eval_duration_ns: chunk["prompt_eval_duration"].as_u64(),
            eval_duration_ns: chunk["eval_duration"].as_u64(),
        });
    }
    Ok(())
}

#[tauri::command]
async fn chat_stream(
    app: tauri::AppHandle,
    request: ChatRequest,
) -> Result<ChatCompletion, String> {
    let request_id = request.request_id.clone();
    let (handle, registration) = AbortHandle::new_pair();
    {
        let state = app.state::<ChatCancellation>();
        state.0.lock().map_err(|_| "Cancellation state unavailable")?
            .insert(request_id.clone(), handle);
    }
    // Aborting drops the in-flight HTTP request, including during tool preparation.
    let result = Abortable::new(chat_stream_impl(app.clone(), request), registration).await;
    {
        let state = app.state::<ChatCancellation>();
        state.0.lock().map_err(|_| "Cancellation state unavailable")?
            .remove(&request_id);
    }
    match result {
        Ok(result) => result,
        Err(_) => Err("Generation stopped".into()),
    }
}

// Native-only trusted directory. No renderer-supplied filesystem paths.
fn brain_eval_report_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app.path().document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("Cannot determine report directory: {e}"))?;
    Ok(base.join("Mikan").join("Brain-Evaluations"))
}
#[tauri::command]
fn brain_eval_open_folder(app: tauri::AppHandle) -> Result<(), String> {
    let folder = brain_eval_report_directory(&app)?;
    if !folder.is_dir() { return Err("No Brain Lab reports have been saved yet".into()); }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe").arg(&folder)
            .spawn().map_err(|e| format!("Could not open File Explorer: {e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Opening report folders is only supported on Windows".into())
    }
}
#[tauri::command]
fn brain_eval_export(app: tauri::AppHandle, json_report: String, markdown_report: String) -> Result<String, String> {
    // User-triggered only. Never accept a path supplied from the renderer.
    // The existing report schema is synthetic, with no real personal memory contents.
    if json_report.len() > 4_000_000 || markdown_report.len() > 2_000_000 {
        return Err("Evaluation report is too large (4 MB JSON / 2 MB Markdown limits)".into());
    }
    let report: Value = serde_json::from_str(&json_report)
        .map_err(|_| "Cannot export invalid evaluation JSON".to_string())?;
    let folder = brain_eval_report_directory(&app)?;
    std::fs::create_dir_all(&folder)
        .map_err(|e| format!("Cannot create report folder: {e}"))?;
    // Derive the filename entirely from validated report metadata, not from
    // a renderer-supplied path or user conversation text. JSON + Markdown share
    // the same sortable UTC timestamp, model, scenario count and run suffix.
    let started = report.get("startedAt").and_then(Value::as_str).unwrap_or("");
    let stamp = started.get(..19)
        .filter(|s| s.as_bytes().get(10) == Some(&b'T')
            && s.chars().all(|c| c.is_ascii_digit() || c == '-' || c == ':' || c == 'T'))
        .map(|s| format!("{}_{}Z", &s[..10], s[11..].replace(':', "")))
        .unwrap_or_else(|| "unknown-date".to_string());
    let mode = match report.get("mode").and_then(Value::as_str) {
        Some("live") => "live",
        Some("routing") => "routing",
        _ => "unknown",
    };
    let model: String = report.get("model").and_then(Value::as_str).unwrap_or("unknown")
        .chars().take(32).map(|c| {
            let c = c.to_ascii_lowercase();
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' { c } else { '-' }
        }).collect();
    let model = if model.is_empty() { "unknown" } else { &model };
    let count = report.get("scenarios").and_then(Value::as_array)
        .map(|items| items.len().min(999)).unwrap_or(0);
    let attempts = report.get("attempts").and_then(Value::as_u64)
        .filter(|n| (1..=5).contains(n)).unwrap_or(1);
    let suffix: String = report.get("runId").and_then(Value::as_str).unwrap_or("")
        .split('-').next_back().unwrap_or("")
        .chars().filter(|c| c.is_ascii_alphanumeric()).take(12).collect();
    let suffix = if suffix.is_empty() { "unknown" } else { &suffix };
    let stem = format!("mikan-brain_{stamp}_{mode}_{model}_s{count:02}_r{attempts}_{suffix}");
    std::fs::write(folder.join(format!("{stem}.json")), json_report)
        .map_err(|e| format!("Cannot write JSON report: {e}"))?;
    std::fs::write(folder.join(format!("{stem}.md")), markdown_report)
        .map_err(|e| format!("Cannot write readable report: {e}"))?;
    Ok(folder.to_string_lossy().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedBrainEvaluation {
    json_report: String,
    markdown_report: String,
    folder: String,
}

/// Restore the most recent auto-export after a managed desktop restart.
/// No caller-provided paths and no writes to production memories or tools.
#[tauri::command]
fn brain_eval_load_latest(app: tauri::AppHandle) -> Result<Option<SavedBrainEvaluation>, String> {
    let mut newest: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    for base in [app.path().document_dir(), app.path().app_data_dir()] {
        let Ok(base) = base else { continue };
        let folder = base.join("Mikan").join("Brain-Evaluations");
        let Ok(entries) = std::fs::read_dir(folder) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
            if !name.starts_with("mikan-brain_") || !name.ends_with(".json") { continue }
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_file() || meta.len() > 4_000_000 { continue }
            let Ok(modified) = meta.modified() else { continue };
            if newest.as_ref().is_none_or(|(old, _)| modified > *old) {
                newest = Some((modified, path));
            }
        }
    }
    let Some((_, path)) = newest else { return Ok(None) };
    let json_report = std::fs::read_to_string(&path)
        .map_err(|_| "Could not read saved Brain Lab report".to_string())?;
    let report: Value = serde_json::from_str(&json_report)
        .map_err(|_| "The latest saved Brain Lab report is invalid JSON".to_string())?;
    let valid = report["version"] == 1
        && report["writesToRealMemories"] == false
        && report["runId"].as_str().is_some()
        && report["cases"].is_array()
        && (report["environment"] == "isolated-synthetic"
            || report["environment"] == "isolated-synthetic+live-public-web");
    if !valid {
        return Err("The latest report is not a supported synthetic Brain Lab export".into());
    }
    let markdown_path = path.with_extension("md");
    let markdown_report = std::fs::metadata(&markdown_path).ok()
        .filter(|meta| meta.is_file() && meta.len() <= 2_000_000)
        .and_then(|_| std::fs::read_to_string(markdown_path).ok())
        .unwrap_or_default();
    Ok(Some(SavedBrainEvaluation {
        json_report,
        markdown_report,
        folder: path.parent().unwrap_or(path.as_path()).to_string_lossy().to_string(),
    }))
}

#[tauri::command]
fn cancel_chat(app: tauri::AppHandle, request_id: String) -> Result<(), String> {
    let state = app.state::<ChatCancellation>();
    if let Some(handle) = state.0.lock().map_err(|_| "Cancellation state unavailable")?.get(&request_id) {
        handle.abort();
    }
    Ok(())
}

fn ollama_messages(messages: &[ChatMessage]) -> Vec<Value> {
    messages.iter().map(|m| {
        let mut value = json!({"role":m.role,"content":m.content});
        if !m.images.is_empty() {
            value["images"] = json!(m.images);
        }
        value
    }).collect()
}

async fn chat_stream_impl(
    app: tauri::AppHandle,
    request: ChatRequest,
) -> Result<ChatCompletion, String> {
    // Validate image sizes and encoding before sending owner-approved screenshots to any provider.
    screen_vision::validate_request_images(&request.messages)?;
    let provider = request.provider.as_deref().unwrap_or("local");
    let mut fallback_reason: Option<String> = None;
    if matches!(provider, "auto" | "openrouter") {
        // Auto is intentionally OpenRouter-free -> local. Gemini remains
        // available as a manual provider and is not retried on every timeout.
        if provider == "auto" {
            fallback_reason = openrouter::cooldown_reason()
                .map(|reason| format!("OpenRouter temporarily paused after: {reason}"));
        }
        if fallback_reason.is_none() {
            match openrouter::key() {
                Ok(Some(key)) => {
                    let emitted = std::sync::atomic::AtomicBool::new(false);
                    let result = match tokio::time::timeout(
                        Duration::from_secs(45),
                        openrouter::chat(&app, &request, &key, &emitted)
                    ).await {
                        Ok(result) => result,
                        Err(_) => {
                            if provider=="auto" {openrouter::note_slow_request();}
                            Err("OpenRouter timed out after 45 seconds (cloud deadline)".into())
                        }
                    };
                    match result {
                        Ok(completion) => return Ok(completion),
                        // Never switch to local Qwen after we have already
                        // streamed part of an OpenRouter answer. Otherwise
                        // its text/speech would be joined to a second model.
                        Err(reason) if emitted.load(std::sync::atomic::Ordering::Relaxed) =>
                            return Err(format!("OpenRouter stream interrupted after output began: {reason}")),
                        Err(reason) if provider=="openrouter" => return Err(reason),
                        Err(reason) => fallback_reason=Some(reason)
                    }
                },
                Ok(None) if provider=="openrouter" =>
                    return Err("Add an OpenRouter API key in Settings → AI & Models".into()),
                Ok(None) => fallback_reason=Some("No OpenRouter API key configured".into()),
                Err(reason) if provider=="openrouter" => return Err(reason),
                Err(reason) => fallback_reason=Some(reason)
            }
        }
    }
    if provider=="gemini" {
        // Only read-only web calls may be repeated after a failed cloud attempt.
        if provider == "auto" {
            fallback_reason = gemini::cooldown_reason()
                .map(|reason| format!("Gemini temporarily paused after: {reason}"));
        }
        if fallback_reason.is_none() {
            match gemini::key() {
                Ok(Some(key)) => {
                    // A slow or hung cloud connection must never hold a desktop
                    // chat hostage for minutes. This limits all Gemini tool rounds.
                    let cloud = tokio::time::timeout(
                        Duration::from_secs(35), gemini::chat(&app, &request, &key)
                    ).await;
                    let result = match cloud {
                        Ok(result) => result,
                        Err(_) => {
                            if provider == "auto" { gemini::note_slow_request(); }
                            Err("Gemini timed out after 35 seconds (cloud deadline)".into())
                        }
                    };
                    match result {
                        Ok(completion) => return Ok(completion),
                        Err(reason) if provider == "gemini" => return Err(reason),
                        Err(reason) => fallback_reason = Some(reason)
                    }
                },
                Ok(None) if provider == "gemini" =>
                    return Err("Add your Gemini API key under Settings → AI & Models".into()),
                Ok(None) => fallback_reason = Some("No Gemini API key configured".into()),
                Err(reason) if provider == "gemini" => return Err(reason),
                Err(reason) => fallback_reason = Some(reason)
            }
        }
        if let Some(ref reason) = fallback_reason {
            let _ = app.emit("mikan://activity", json!({
                "requestId":request.request_id,
                "text":format!("Cloud fallback: {reason}. Using local {}…",request.model)
            }));
        }
    }
    if request.model.trim().is_empty() {
        return Err("Select an installed model in Settings".into());
    }
    let url = format!("{}/api/chat", local_origin(&request.endpoint)?);
    let client = client()?;
    let mut messages = ollama_messages(&request.messages);
    // The actual model identity is runtime configuration, not a guess based on hardware.
    let identity = if fallback_reason.is_some() {
        format!("CURRENT INFERENCE ENGINE: This reply is generated by local Ollama model {}. Mikan is configured for Auto, but the cloud attempt was unavailable; details are recorded in application diagnostics. If asked which LLM is answering, name the local model accurately and do not guess.", request.model)
    } else {
        format!("CURRENT INFERENCE ENGINE: This reply is generated by local Ollama model {}. This runtime fact overrides old guesses about which model powers the current reply. Answer model-identity questions directly.", request.model)
    };
    let identity_message = json!({"role":"system","content":identity});
    messages.insert(0, identity_message.clone());
    let mut sources = Vec::new();
    let mut search_query: Option<String> = None;
    let mut search_trace: Option<source_priority::SearchTrace> = None;
    let mut sources_carried_over = false;
    let mut newly_researched = false;
    let mut research_audit = None;
    let mut optional_search_error: Option<String> = None;
    let selected_context = valid_context_window(request.context_window);
    // The chat route is authoritative. Even old clients that accidentally
    // leave auto_search enabled must not invoke web tools or carry unrelated
    // source excerpts into personal, persona or self-capability replies.
    let local_chat = request.research_route.as_deref() == Some("chat");
    let may_research = web_tools_allowed(request.auto_search, request.research_route.as_deref());
    let previous_sources = if local_chat { Vec::new() }
        else { research_intent::clean_prior_sources(&request.prior_sources) };
    let explicit_query = may_research.then(|| {
        research_intent::routed_research_query(
            &messages,
            request.research_route.as_deref(),
            request.research_query.as_deref(),
        )
    }).flatten();
    let explicit_search = explicit_query.is_some();
    let task = request.research_task.as_ref();
    let general_fallback=general_knowledge_fallback_allowed(
        request.research_general_fallback,request.research_route.as_deref(),
        request.research_recent,task
    );
    // A forecast about an already researched topic needs the cited evidence,
    // not another non-streaming tool-planning pass. Explicit searches still run.
    let reuse_prediction_evidence = explicit_query.is_none()
        && !previous_sources.is_empty()
        && research_intent::is_prediction_followup(&messages);

    if explicit_query.is_none() && !previous_sources.is_empty() {
        // Place carried evidence AFTER research-intent extraction so the extra
        // user-level data cannot be mistaken for a new topic in conversation.
        let insert_at = usize::from(messages.first().is_some_and(|m| m["role"] == "system"));
        messages.insert(insert_at, json!({
            "role": "system",
            "content": research_intent::prior_evidence_instruction()
        }));
        let last_user = messages.iter().rposition(|m| m["role"] == "user").unwrap_or(messages.len());
        messages.insert(last_user, json!({
            "role": "user",
            "content": format!("Previously retrieved evidence, NOT freshly searched.\n{}",
                research_intent::evidence_data(&previous_sources))
        }));
    }
    if may_research {
        if let Some(query) = explicit_query {
            // Explicit research intent: search the user's actual subject before the
            // model can reinterpret "Cattle Decapitation" as a slaughter procedure.
            // This path works for models without Ollama tool-calling support.
            let _ = app.emit("mikan://activity", json!({
                "requestId": request.request_id,
                "text": format!("Searching: {query}")
            }));
            if let Some(document)=task.and_then(|task|task.source_url.as_deref()) {
                if !research_intent::user_supplied_document_url(&messages,document) {
                    return Err("The requested public document URL was not supplied by the user".into());
                }
                let page=web_reader::read_page_impl(&app,document,false,request.cache_hours).await?;
                sources.push(web_search::SearchResult {
                    title:page.title,url:page.url,
                    content:source_enrichment::focused_page_excerpt(&page.content,&query),
                    engine:"direct webpage".into(),published_date:None
                });
            } else {
            sources = match source_priority::search_with_trace(
                request.searxng_endpoint.clone(),query.clone(),
                request.research_recent || research_intent::is_album_research(&messages),
                &request.source_preferences,request.source_topic.as_deref(),
                task.and_then(|t|t.subject.as_deref()),task.is_some()
            ).await {
                Ok(batch)=>{
                    search_trace=Some(batch.trace);
                    batch.sources
                },
                Err(error) if general_fallback => {
                    search_trace=Some(source_priority::SearchTrace{
                        attempted_queries:vec![query.clone()],raw_results:0,
                        returned_results:0,provisional_results:0,rejected_titles:vec![],
                        upstream_errors:vec![error.clone()]
                    });
                    optional_search_error=Some(error);
                    Vec::new()
                },
                Err(error)=>return Err(error)
            };
            }
            search_query = Some(query.clone());
            if sources.is_empty() && task.is_none() {
                if let Some(fallback) = research_intent::fallback_research_query(&messages, &query) {
                    let _ = app.emit("mikan://activity", json!({
                        "requestId": request.request_id,
                        "text": format!("Trying a broader search: {fallback}")
                    }));
                    let batch=source_priority::search_with_trace(
                        request.searxng_endpoint.clone(),fallback,false,
                        &request.source_preferences,request.source_topic.as_deref(),None,false
                    ).await?;
                    if let Some(trace)=search_trace.as_mut(){
                        trace.attempted_queries.extend(batch.trace.attempted_queries);
                        trace.raw_results+=batch.trace.raw_results;
                        trace.upstream_errors.extend(batch.trace.upstream_errors);
                        trace.returned_results=batch.sources.len();
                        trace.provisional_results+=batch.trace.provisional_results;
                        trace.rejected_titles.extend(batch.trace.rejected_titles);
                        trace.rejected_titles.truncate(4);
                    } else {search_trace=Some(batch.trace);}
                    sources=batch.sources;
                }
            }
            if let Some(trace)=search_trace.as_ref(){
                search_query=Some(trace.attempted_queries.join(" → "));
            }
            if sources.is_empty() {
                if general_fallback {
                    let _ = app.emit("mikan://activity", json!({
                        "requestId":request.request_id,
                        "text":"No public sources; answering general concepts locally…"
                    }));
                    // Do not pass unsourced snippets or fake numbered evidence.
                    // Allow stable conceptual explanations, never freshly verified facts.
                    messages.insert(1,json!({"role":"system","content":
                        "A background public lookup was attempted but no usable sources are available.                          The user asked for a general conceptual explanation, so answer from established                          model knowledge with appropriate uncertainty and without numbered citations.                          Do NOT invent source results, version numbers, dates, current status, exact                          biographical facts, strict quantitative claims, or source-verified recommendations.                          If live verification is essential, clearly say it remains unverified."}));
                    if optional_search_error.is_some() {
                        // The original networking failure remains observable via
                        // the attempted query; no private diagnostics enter prompts.
                    }
                } else {
                    let content = "SearXNG didn't return any relevant sources for that search.".to_owned();
                    return Ok(ChatCompletion {
                        content, stats: None, sources, search_query, search_trace, sources_carried_over,
                        research_audit, model_used: request.model.clone(), fallback_reason: fallback_reason.clone()
                    });
                }
            }

            // Structured research needs source-page context, not just search
            // previews that may blend neighboring works and unrelated numbers.
            // Read at most two safely validated HTTPS pages in parallel; a
            // failed page read leaves the original excerpt intact. The normal
            // lighter path remains for conversations without this setting.
            if task.and_then(|t|t.source_url.as_ref()).is_none() && (request.structured_research
                || research_intent::needs_primary_source_verification(&messages)) {
                let _ = app.emit("mikan://activity", json!({
                    "requestId": request.request_id,
                    "text": "Checking source pages…"
                }));
                source_enrichment::enrich_relevant_sources(
                    &app, &mut sources, &query, request.cache_hours
                ).await;
            }

            newly_researched = !sources.is_empty();
        } else if reuse_prediction_evidence {
            // Stream directly from the prior excerpts with the same [n] indexes
            // shown in the UI. Avoid an uncited answer from tool preflight.
            sources = previous_sources.clone();
            sources_carried_over = true;
        } else if request.research_route.as_deref() == Some("chat") {
            // Ordinary conversation doesn't need a non-streaming Ollama tool
            // planning call. Keep this fast and don't send private chat online.
            // Earlier clients without a route still use the original planner.
        } else {
            let plan = agent_tools::prepare(
                &app, &client, &url, &request.model, &request.request_id,
                &mut messages, &request.searxng_endpoint, request.cache_hours,
                selected_context,&request.source_preferences,request.source_topic.as_deref()
            ).await?;
            let newly_fetched = !plan.sources.is_empty();
            newly_researched = newly_fetched;
            if newly_fetched {
                // Source indexes must map to the sources displayed for THIS
                // answer. Drop carried snippets when new live tool results
                // supersede them to prevent ambiguous [1]/[2] citations.
                messages.retain(|message| {
                    let content = message["content"].as_str().unwrap_or("");
                    content != research_intent::prior_evidence_instruction()
                        && !content.starts_with("Previously retrieved evidence, NOT freshly searched.")
                });
            }
            sources = plan.sources;
            if !newly_fetched && !previous_sources.is_empty() {
                sources = previous_sources.clone();
                sources_carried_over = true;
            }
            if !newly_fetched {
                if let Some((content, data)) = plan.answer {
                    if content.trim().is_empty() {
                        return Err("The model returned no answer or tool requests".into());
                    }
                    let _ = app.emit("mikan://chat", ChatChunk {
                        request_id: request.request_id,
                        content: content.clone()
                    });
                    let stats = ChatStats {
                        output_tokens: data["eval_count"].as_u64(),
                        prompt_tokens: data["prompt_eval_count"].as_u64(),
                        total_duration_ns: data["total_duration"].as_u64(),
                        load_duration_ns: data["load_duration"].as_u64(),
                        prompt_eval_duration_ns: data["prompt_eval_duration"].as_u64(),
                        eval_duration_ns: data["eval_duration"].as_u64(),
                    };
                    return Ok(ChatCompletion { content, stats: Some(stats), sources, search_query, search_trace, sources_carried_over, research_audit, model_used: request.model.clone(), fallback_reason: fallback_reason.clone() });
                }
            }
        }
    }
    if !may_research && !previous_sources.is_empty() {
        sources = previous_sources;
        sources_carried_over = true;
    }
    if newly_researched {
        if explicit_search || request.structured_research {
            // A prior reply can resolve a reference in the local plan, but it
            // cannot supply facts to a newly sourced answer.
            messages = ollama_messages(&request.messages);
            messages.retain(|message| message["role"] == "system" || message["role"] == "user");
            messages.insert(0, identity_message);
        }
        messages.insert(1, json!({
            "role": "system", "content": research_intent::evidence_instruction()
        }));
        let evidence = if request.structured_research {
            let default_task = recommendation_gate::ResearchTask::default();
            let task = task.unwrap_or(&default_task);
            let mut user_turns: Vec<String> = request.messages.iter().rev()
                .filter(|message| message.role == "user")
                .take(5)
                .map(|message| message.content.chars().take(400).collect())
                .collect();
            user_turns.reverse();
            let user_request = user_turns.join("\n");
            let _ = app.emit("mikan://activity", json!({
                "requestId": request.request_id, "text": "Checking source evidence…"
            }));
            let evidence_started = std::time::Instant::now();
            // Identify entities before asking a small model for properties,
            // credits and measurements. The former recovery pass now supplies
            // the initial subject instead of repeating a malformed headline.
            let (leads,discovery_status)=if task.kind==recommendation_gate::ResearchKind::Discover {
                evidence_pack::discover_candidate_leads(
                    &client,&url,&request.model,&user_request,task,&sources,selected_context
                ).await
            } else {(Vec::new(),String::new())};
            let candidate_leads = leads.iter().map(|lead|
                format!("{} [source {}]",lead.title,lead.source)).collect();
            let mut initial_task=task.clone();
            if let Some(lead)=leads.first(){initial_task.subject=Some(lead.title.clone())}
            let mut evidence = evidence_pack::extract(
                &client, &url, &request.model, &user_request, &initial_task, &sources, selected_context
            ).await;
            let mut candidate_queries = Vec::new();
            // If a current, fact-seeking lookup is still unresolved, give real
            // first-party announcement pages one bounded discovery chance.
            // This uses only the subject from the already-approved public query.
            // It never infers that an announcement proves "latest" by itself.
            if task.uses_fact_evidence()
                && !evidence.audit.unresolved_details.is_empty()
                && task.source_url.is_none()
                && research_intent::needs_primary_source_verification(&messages) {
                if let Some(primary_query)=search_query.as_deref().and_then(|query|
                    source_priority::primary_followup_query(query,task.subject.as_deref())) {
                    let _=app.emit("mikan://activity",json!({
                        "requestId":request.request_id,
                        "text":"Checking an official announcement source…"
                    }));
                    if let Ok(mut more)=source_priority::search_for_task(
                        request.searxng_endpoint.clone(),primary_query.clone(),false,
                        &request.source_preferences,request.source_topic.as_deref(),
                        task.subject.as_deref()
                    ).await {
                        more.retain(|source|!sources.iter().any(|old|old.url==source.url));
                        more.truncate(4);
                        if !more.is_empty() {
                            source_enrichment::enrich_relevant_sources(
                                &app,&mut more,&primary_query,request.cache_hours
                            ).await;
                            sources.extend(more);
                            let checked=evidence_pack::extract(
                                &client,&url,&request.model,&user_request,task,&sources,selected_context
                            ).await;
                            let fewer_missing=checked.audit.unresolved_details.len() <
                                evidence.audit.unresolved_details.len();
                            let stronger_context=checked.audit.unresolved_details.len() ==
                                evidence.audit.unresolved_details.len()
                                && checked.audit.accepted > evidence.audit.accepted;
                            if checked.notes.is_some() && (fewer_missing || stronger_context) {
                                evidence=checked;
                            }
                        }
                    }
                    evidence.audit.followup_query=Some(primary_query);
                }
            }
            // Discovery has two different jobs: identify the *individual item*
            // and then verify its numeric limits / credits. For small local
            // models, attempting both in one source-extraction step often
            // mistakes an article headline for a game, book, movie or album.
            // Only enter this bounded fallback if the strict first attempt
            // couldn't supply a recommendation. Real public searches only.
            if task.kind == recommendation_gate::ResearchKind::Discover
                && evidence.notes.is_none() {
                let _ = app.emit("mikan://activity", json!({
                    "requestId": request.request_id,
                    "text": "Identifying individual source-backed candidates…"
                }));
                for lead in leads {
                    let Some(mut query) =
                        recommendation_gate::candidate_details_query(&lead.title,task)
                    else { continue };
                    // The first query was already screened for public/private
                    // boundaries by the local planner; retain its public topic
                    // to disambiguate similarly named films, games or albums.
                    if let Some(original) = search_query.as_deref()
                        .and_then(|value|value.split(" → ").next()) {
                        let contextual = format!("{query} {original}");
                        if contextual.chars().count() <= 180 { query = contextual; }
                    }
                    candidate_queries.push(query.clone());
                    let _ = app.emit("mikan://activity", json!({
                        "requestId": request.request_id,
                        "text": format!("Verifying {} against public sources…", lead.title)
                    }));
                    if let Ok(mut more) = source_priority::search_for_task(
                        request.searxng_endpoint.clone(), query.clone(),false,
                        &request.source_preferences,request.source_topic.as_deref(),Some(&lead.title)
                    ).await {
                        more.truncate(4);
                        if !more.is_empty() {
                            source_enrichment::enrich_relevant_sources(
                                &app, &mut more, &query, request.cache_hours
                            ).await;
                            // Keep source indexes stable so every final [n]
                            // points to the same displayed public URL.
                            for source in more {
                                if let Some(previous) = sources.iter_mut()
                                    .find(|item|item.url == source.url) {
                                    if previous.engine != "webpage excerpt" {
                                        *previous = source;
                                    }
                                } else { sources.push(source); }
                            }
                        }
                    }
                    let mut focused_task=task.clone();
                    focused_task.subject=Some(lead.title.clone());
                    let checked=evidence_pack::extract(
                        &client, &url, &request.model, &user_request,
                        &focused_task, &sources, selected_context
                    ).await;
                    evidence=checked;
                    if evidence.notes.is_some() { break; }
                }
            }
            // The original single broad follow-up remains a fallback only
            // when no candidate-specific lookup was possible.
            if candidate_queries.is_empty() {
            if let Some(query) = evidence.followup_query.take() {
                let _ = app.emit("mikan://activity", json!({
                    "requestId": request.request_id, "text": format!("Checking details: {query}")
                }));
                if let Ok(mut more) = web_search::web_search(
                    request.searxng_endpoint.clone(), query.clone()
                ).await {
                    more.truncate(3);
                    if !more.is_empty() {
                        source_enrichment::enrich_relevant_sources(
                            &app, &mut more, &query, request.cache_hours
                        ).await;
                        for source in more {
                            if let Some(previous) = sources.iter_mut().find(|item| item.url == source.url) {
                                if previous.engine != "webpage excerpt" {
                                    *previous = source;
                                }
                            } else {
                                sources.push(source);
                            }
                        }
                        let elapsed = evidence.audit.elapsed_ms;
                        evidence = evidence_pack::extract(
                            &client, &url, &request.model, &user_request, task, &sources, selected_context
                        ).await;
                        evidence.audit.elapsed_ms += elapsed;
                    }
                }
                evidence.audit.followup_query = Some(query);
            }
            }
            // Includes both local extraction and any genuine focused public
            // searches; the previous value counted only generation latency.
            evidence.audit.elapsed_ms = evidence_started.elapsed().as_millis() as u64;
            evidence.audit.candidate_leads = candidate_leads;
            evidence.audit.candidate_queries = candidate_queries;
            evidence.audit.candidate_discovery=(!discovery_status.is_empty()).then_some(discovery_status);

            research_audit = Some(evidence.audit);
            let Some(notes) = evidence.notes else {
                // Never give a scoped task a second chance to invent an answer
                // from the raw snippets after evidence extraction fails.
                let content = match task.kind {
                    recommendation_gate::ResearchKind::Discover =>
                        "The sources I found didn't give me enough evidence to recommend a match.".to_owned(),
                    recommendation_gate::ResearchKind::Verify |
                    recommendation_gate::ResearchKind::Lookup =>
                        if search_trace.as_ref().is_some_and(|trace|trace.provisional_results>0) {
                            "The search provider returned candidate pages, but none passed verification for the requested fact. I can't confidently identify the answer from those results.".to_owned()
                        } else {
                            evidence_pack::source_preview_fallback(&sources)
                                .unwrap_or_else(|| "I found no source-backed answer to the requested detail.".into())
                        },
                };
                let _ = app.emit("mikan://chat", ChatChunk {
                    request_id: request.request_id.clone(), content: content.clone()
                });
                return Ok(ChatCompletion {
                    content, stats: None, sources, search_query, search_trace, sources_carried_over,
                    research_audit, model_used: request.model.clone(),
                    fallback_reason: fallback_reason.clone()
                });
            };

            messages.insert(2, json!({
                "role": "system",
                "content": "Use only the numbered evidence notes for public facts in this reply. If the notes contain \
                    a candidate list, answer with those candidates and the facts established for each. For a request \
                    to verify a particular subject, report the supported details for that subject, including any mismatch \
                    with the user's criteria. Preserve the scope, range, and uncertainty of the source measurement. \
                    A general estimate does not establish a narrower kind of runtime. Say which requested detail is \
                    still unconfirmed when the evidence is incomplete. Absence of a fact from these notes is UNKNOWN, \
                    never evidence that an event, release or announcement did not happen. A related entity or its \
                    existence alone does not establish the requested status. Do not add factual conclusions beyond \
                    the accepted claims; cite the exact supporting numbered notes. Preserve the assistant's established personality and warmth even while researching. When natural, open with one short conversational sentence without factual claims, names, dates, or measurements. Do not turn the reply into an impersonal compliance report."
            }));
            notes
        } else {
            research_intent::evidence_data(&sources)
        };
        // Keep retrieved text at data priority and align citations with the UI.
        let last_user = messages.iter().rposition(|m| m["role"] == "user").unwrap_or(messages.len());
        messages.insert(last_user, json!({"role":"user","content":evidence}));
    }
    let mut payload = json!({
        "model": request.model,
        "messages": messages,
        "stream": true,
        "think": request.thinking_requested,
        "keep_alive": "10m"
    });
    let mut options = json!({});
    if let Some(num_ctx) = selected_context {
        options["num_ctx"] = json!(num_ctx);
    }
    // Preserve natural chat, but lower randomness when a visual/spatial
    // observation must be grounded in an image rather than guessed from text.
    if !sources.is_empty() {
        options["temperature"] = json!(0.35);
    } else if messages.iter().any(|m| m.get("images")
        .and_then(|images| images.as_array())
        .is_some_and(|images| !images.is_empty())) {
        options["temperature"] = json!(0.3);
    }
    if options.as_object().is_some_and(|items| !items.is_empty()) {
        payload["options"] = options;
    }
    let response = client.post(url)
        .json(&payload)
        .send().await.map_err(|e| format!("Ollama connection failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Ollama HTTP {status}: {}",
            body.chars().take(300).collect::<String>()
        ));
    }

    // Streaming transport can split UTF-8 sequences and JSON lines at arbitrary byte
    // boundaries. Buffer bytes until newline instead of lossy-decoding each chunk.
    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();
    let mut content = String::new();
    let mut stats = None;
    let mut finished = false;

    while let Some(result) = stream.next().await {
        let bytes = result.map_err(|e| format!("Ollama stream interrupted: {e}"))?;
        buffer.extend_from_slice(&bytes);
        while let Some(index) = buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = buffer.drain(..=index).collect();
            process_line(
                &app,
                &request.request_id,
                &line,
                &mut content,
                &mut stats,
                &mut finished,
            )?;
        }
    }
    if !buffer.is_empty() {
        process_line(
            &app,
            &request.request_id,
            &buffer,
            &mut content,
            &mut stats,
            &mut finished,
        )?;
    }
    if !finished {
        return Err("Ollama closed the stream without a completion response".into());
    }
    // The final text is returned as well as streamed so that no event-ordering
    // race can lose the last characters when the frontend removes its listener.
    Ok(ChatCompletion { content, stats, sources, search_query, search_trace, sources_carried_over, research_audit, model_used: request.model.clone(), fallback_reason })
}

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            // Every summon resets the UI to its compact chat surface.
            let _ = app.emit("mikan://opened", ());
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
        .manage(ChatCancellation::default())
        .manage(avatar_motion::AvatarWindowMotion::default())
        .manage(screen_vision::LiveVisionState::default())
        .manage(vision_region::RegionPickerState::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_models,
            gemini::gemini_key_status,
            gemini::gemini_save_key,
            gemini::gemini_remove_key,
            gemini::gemini_test_connection,
            openrouter::openrouter_key_status,
            openrouter::openrouter_save_key,
            openrouter::openrouter_remove_key,
            openrouter::openrouter_test_connection,
            web_search::web_search,
            search_service::search_service,
            web_reader::read_page,
            web_reader::web_cache_info,
            web_reader::clear_web_cache,
            chat_stream,
            condense_local_context,
            cancel_chat,
            brain_eval_export,
            brain_eval_load_latest,
            brain_eval_open_folder,
            voice::voice_health,
            voice::voice_synthesize,
            voice::voice_reference_status,
            voice::voice_save_reference,
            voice::voice_delete_reference,
            screen_vision::vision_monitors,
            screen_vision::vision_capture,
            screen_vision::vision_model_status,
            screen_vision::vision_live_status,
            screen_vision::vision_live_set,
            screen_vision::vision_live_latest,
            screen_vision::vision_live_configure,
            vision_region::vision_region_open,
            vision_region::vision_region_preview,
            vision_region::vision_region_complete,
            vision_region::vision_region_cancel,
            file_attachments::extract_document,
            iki_outfits::pick_iki_outfit,
            iki_outfits::pick_iki_outfit_folder,
            avatar_motion::avatar_motion_sample,
            notion::notion_status,
            notion::notion_connect,
            notion::notion_disconnect,
            notion::notion_list_pages,
            notion::notion_select_page,
            notion::notion_set_all,
            notion::notion_sync,
            notion::notion_recall,
            notion::notion_cached_pages,
            notion::notion_read_document,
            notion::notion_read_document_live,
            memory::memory_list_conversations,
            memory::memory_create_conversation,
            memory::memory_list_messages,
            memory::memory_search_archive,
            memory::memory_search_fact_ids,
            memory::memory_save_message,
            memory::memory_delete_conversation,
            memory::memory_list_facts,
            memory::memory_import_facts,
            memory::memory_export_facts,
            memory::memory_replace_facts,
            memory::memory_update_fact_metadata,
            memory::memory_add_fact,
            memory::memory_update_fact,
            memory::memory_delete_fact,
            memory::memory_list_character_facts,
            memory::memory_import_character_facts,
            interest_memory::memory_list_interests,
            interest_memory::memory_import_interests,
            interest_memory::memory_update_interest,
            interest_memory::memory_delete_interest,
            interest_memory::memory_search_interests,
            memory::memory_add_character_fact,
            memory::memory_update_character_fact,
            memory::memory_delete_character_fact,
            memory_extraction::memory_process_turn,
            memory_extraction::brain_eval_preview_memory,
            memory_jobs::memory_enqueue_turn,
            memory_jobs::memory_process_pending_jobs,
            memory_jobs::memory_jobs_status,
            memory_jobs::memory_retry_failed_jobs,
            memory_reviews::memory_list_reviews,
            memory_reviews::memory_resolve_review,
            memory_reviews::memory_list_fact_history,
            memory::memory_mark_recalled,
            memory::memory_pin_fact,
            session_memory::memory_session_candidate,
            session_memory::memory_save_session_summary,
            session_memory::memory_list_session_summaries,
            session_memory::memory_delete_session_summary,
            advanced_memory::memory_semantic_recall,
            advanced_memory::memory_semantic_status,
            toggle_companion,
            hide_companion
        ])
        .setup(|app| {
            advanced_memory::start_if_installed(app.handle());
            // Optional, previously registered local Qwen3-TTS uses the owner's
            // existing ROCm Python environment; never installs GPU packages.
            let _ = voice::start_if_configured();
            let show = MenuItem::with_id(app, "show", "Show / Hide Mikan", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Mikan", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Mikan Desktop Companion")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => toggle_window(app),
                    "quit" => {
                        voice::stop_if_started();
                        advanced_memory::stop_if_started();
                        app.exit(0);
                    },
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
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
            if window.label()=="main" {
                if let tauri::WindowEvent::Moved(position) = event {
                    window.app_handle().state::<avatar_motion::AvatarWindowMotion>().moved(*position);
                }
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _=window.hide();
                }
            } else if window.label()=="region-picker" {
                if let tauri::WindowEvent::Destroyed = event {
                    let state=window.app_handle().state::<vision_region::RegionPickerState>();
                    if let Ok(mut slot)=state.0.lock(){*slot=None;}
                    if let Some(main)=window.app_handle().get_webview_window("main") {
                        let _=main.show();
                        let _=main.set_focus();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Failed to start Mikan Companion");
}
