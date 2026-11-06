mod web_search;
mod web_reader;
mod search_service;
mod agent_tools;
mod research_intent;
mod memory;
mod memory_extraction;
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
    let url = format!("{}/api/chat", local_origin(&request.endpoint)?);
    let client = client()?;
    let mut messages: Vec<Value> = request.messages.iter().map(|m| {
        json!({"role":m.role,"content":m.content})
    }).collect();
    let mut sources = Vec::new();
    let mut search_query: Option<String> = None;
    let mut sources_carried_over = false;
    let selected_context = valid_context_window(request.context_window);
    let previous_sources = research_intent::clean_prior_sources(&request.prior_sources);
    let explicit_query = request.auto_search
        .then(|| research_intent::explicit_research_query(&messages))
        .flatten();
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
    if request.auto_search {
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
                    content, stats: None, sources, search_query, sources_carried_over
                });
            }

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
        } else {
            let plan = agent_tools::prepare(
                &app, &client, &url, &request.model, &request.request_id,
                &mut messages, &request.searxng_endpoint, request.cache_hours,
                selected_context
            ).await?;
            let newly_fetched = !plan.sources.is_empty();
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
                    return Ok(ChatCompletion { content, stats: Some(stats), sources, search_query, sources_carried_over });
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
    if !request.auto_search && !previous_sources.is_empty() {
        sources = previous_sources;
        sources_carried_over = true;
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
    // Keep normal conversational creativity intact; use lower temperature
    // for source-grounded replies (including evidence carried between turns).
    if !sources.is_empty() {
        options["temperature"] = json!(0.2);
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
    Ok(ChatCompletion { content, stats, sources, search_query, sources_carried_over })
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
            cancel_chat,
            memory::memory_list_conversations,
            memory::memory_create_conversation,
            memory::memory_list_messages,
            memory::memory_save_message,
            memory::memory_delete_conversation,
            memory::memory_list_facts,
            memory::memory_add_fact,
            memory::memory_update_fact,
            memory::memory_delete_fact,
            memory::memory_list_character_facts,
            memory::memory_add_character_fact,
            memory::memory_update_character_fact,
            memory::memory_delete_character_fact,
            memory_extraction::memory_process_turn,
            toggle_companion,
            hide_companion
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show / Hide Mikan", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Mikan", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Mikan Desktop Companion")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => toggle_window(app),
                    "quit" => app.exit(0),
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
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("Failed to start Mikan Companion");
}
