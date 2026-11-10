mod web_search;
mod web_reader;
mod search_service;
mod agent_tools;
mod research_intent;
mod source_enrichment;
mod evidence_pack;
mod memory;
mod memory_extraction;
mod advanced_memory;
mod session_memory;
mod voice;
mod screen_vision;
mod vision_region;
mod file_attachments;
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
    searxng_endpoint: String,
    #[serde(default = "default_cache_hours")]
    cache_hours: u64,
    #[serde(default)]
    context_window: Option<u32>,
    #[serde(default)]
    prior_sources: Vec<web_search::SearchResult>,
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
    sources_carried_over: bool,
    research_audit: Option<evidence_pack::ResearchAudit>,
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
    let payload = json!({
        "model": model,
        "stream": false,
        "think": false,
        "format": "json",
        "options": options,
        "messages": [{"role":"user","content":prompt}]
    });
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

#[tauri::command]
fn cancel_chat(app: tauri::AppHandle, request_id: String) -> Result<(), String> {
    let state = app.state::<ChatCancellation>();
    if let Some(handle) = state.0.lock().map_err(|_| "Cancellation state unavailable")?.get(&request_id) {
        handle.abort();
    }
    Ok(())
}

async fn chat_stream_impl(
    app: tauri::AppHandle,
    request: ChatRequest,
) -> Result<ChatCompletion, String> {
    if request.model.trim().is_empty() {
        return Err("Select an installed model in Settings".into());
    }
    screen_vision::validate_request_images(&request.messages)?;
    let url = format!("{}/api/chat", local_origin(&request.endpoint)?);
    let client = client()?;
    let mut messages: Vec<Value> = request.messages.iter().map(|m| {
        let mut value = json!({"role":m.role,"content":m.content});
        if !m.images.is_empty() {
            value["images"] = json!(m.images);
        }
        value
    }).collect();
    let mut sources = Vec::new();
    let mut search_query: Option<String> = None;
    let mut sources_carried_over = false;
    let mut newly_researched = false;
    let mut research_audit = None;
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
            sources = if research_intent::is_album_research(&messages) {
                web_search::web_search_recent(request.searxng_endpoint.clone(), query.clone()).await?
            } else {
                web_search::web_search(request.searxng_endpoint.clone(), query.clone()).await?
            };
            search_query = Some(query.clone());
            if sources.is_empty() {
                if let Some(fallback) = research_intent::fallback_research_query(&messages, &query) {
                    let _ = app.emit("mikan://activity", json!({
                        "requestId": request.request_id,
                        "text": format!("Trying a broader search: {fallback}")
                    }));
                    sources = web_search::web_search(request.searxng_endpoint.clone(), fallback.clone()).await?;
                    // Log both actual search requests rather than pretending
                    // the narrower query found the final source results.
                    search_query = Some(format!("{query} → {fallback}"));
                }
            }
            if sources.is_empty() {
                let content = "SearXNG couldn't find relevant sources, even after a broader search. Try a shorter topic or search manually with /search.".to_owned();
                return Ok(ChatCompletion {
                    content, stats: None, sources, search_query, sources_carried_over,
                    research_audit
                });
            }

            // Time-sensitive research benefits from fuller source passages.
            // Search previews can omit key qualifiers, dates and distinctions
            // between related entities or separate stages of a project.
            if research_intent::needs_primary_source_verification(&messages) {
                let _ = app.emit("mikan://activity", json!({
                    "requestId": request.request_id,
                    "text": "Checking source pages…"
                }));
                source_enrichment::enrich_relevant_sources(
                    &app, &mut sources, &query, request.cache_hours
                ).await;
            }

            newly_researched = true;
            // Previous assistant text can contain hallucinations. For web research
            // retain only the user's conversation context, not prior model claims.
            messages.retain(|m| m["role"] == "system" || m["role"] == "user");
            let rules = research_intent::evidence_instruction();
            let excerpts = research_intent::evidence_data(&sources);
            let insert_at = usize::from(messages.first().is_some_and(|m| m["role"] == "system"));
            messages.insert(insert_at, json!({"role":"system","content": rules}));
            // Put untrusted search data immediately before the latest user turn.
            // This keeps external content out of system instructions.
            let last_user = messages.iter().rposition(|m| m["role"] == "user").unwrap_or(messages.len());
            messages.insert(last_user, json!({"role":"user","content": excerpts}));
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
                selected_context
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
                    return Ok(ChatCompletion { content, stats: Some(stats), sources, search_query, sources_carried_over, research_audit });
                }
            } else {
                // Even a model-initiated tool call must end with a source-focused
                // generation step, not an unchecked pre-generated answer.
                let rules = research_intent::evidence_instruction();
                let insert_at = usize::from(messages.first().is_some_and(|m| m["role"] == "system"));
                messages.insert(insert_at, json!({"role":"system","content": rules}));
                // Tool results are JSON and do not have stable [1], [2] labels.
                // Supply an aligned numbered index as lower-trust data so the
                // generated citations match the sources displayed in the UI.
                messages.push(json!({
                    "role": "user",
                    "content": research_intent::evidence_data(&sources)
                }));
                // Never put external snippets into the authoritative system message.
            }
        }
    }
    if !may_research && !previous_sources.is_empty() {
        sources = previous_sources;
        sources_carried_over = true;
    }
    if request.structured_research && newly_researched && !sources.is_empty() {
        let _ = app.emit("mikan://activity", json!({
            "requestId": request.request_id,
            "text": "Checking source-anchored facts…"
        }));
        let latest_question = request.messages.iter().rev()
            .find(|message| message.role == "user")
            .map(|message| message.content.as_str()).unwrap_or("");
        let (notes, audit) = evidence_pack::extract(
            &client, &url, &request.model, latest_question, &sources, selected_context
        ).await;
        research_audit = Some(audit);
        if let Some(notes) = notes {
            let insert_at = usize::from(messages.first().is_some_and(|m| m["role"] == "system"));
            messages.insert(insert_at, json!({
                "role":"system",
                "content": "RESEARCH CHECKPOINT\nThe application ran a separate structured evidence extraction pass before this answer.\nThe only automatic validation performed is: cited source exists, quoted text\noccurs inside that source's retrieved excerpt, subject occurs inside the quote,\nand numeric anchors in the candidate claim occur inside the quote.\nDo not call extracted candidate claims verified facts; an exact quotation can\nstill be misleading, outdated, misinterpreted, or inconsistent with another source.\nUse the quotes as an aid to reason carefully, alongside the full source excerpts.\nDo not let extraction change your personality or make your reply feel robotic.\n"
            }));
            let latest_user = messages.iter().rposition(|message| message["role"] == "user")
                .unwrap_or(messages.len());
            messages.insert(latest_user, json!({"role":"user","content":notes}));
        }
    }
    let mut payload = json!({
        "model": request.model,
        "messages": messages,
        "stream": true,
        "think": false
    });
    let mut options = json!({});
    if let Some(num_ctx) = selected_context {
        options["num_ctx"] = json!(num_ctx);
    }
    // Preserve natural chat, but lower randomness when a visual/spatial
    // observation must be grounded in an image rather than guessed from text.
    if !sources.is_empty() {
        options["temperature"] = json!(0.2);
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
    Ok(ChatCompletion { content, stats, sources, search_query, sources_carried_over, research_audit })
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
        .manage(screen_vision::LiveVisionState::default())
        .manage(vision_region::RegionPickerState::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_models,
            web_search::web_search,
            search_service::search_service,
            web_reader::read_page,
            web_reader::web_cache_info,
            web_reader::clear_web_cache,
            chat_stream,
            condense_local_context,
            cancel_chat,
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
            notion::notion_status,
            notion::notion_connect,
            notion::notion_disconnect,
            notion::notion_list_pages,
            notion::notion_select_page,
            notion::notion_set_all,
            notion::notion_sync,
            notion::notion_recall,
            memory::memory_list_conversations,
            memory::memory_create_conversation,
            memory::memory_list_messages,
            memory::memory_search_archive,
            memory::memory_save_message,
            memory::memory_delete_conversation,
            memory::memory_list_facts,
            memory::memory_import_facts,
            memory::memory_update_fact_metadata,
            memory::memory_add_fact,
            memory::memory_update_fact,
            memory::memory_delete_fact,
            memory::memory_list_character_facts,
            memory::memory_add_character_fact,
            memory::memory_update_character_fact,
            memory::memory_delete_character_fact,
            memory_extraction::memory_process_turn,
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
