//! Shared read-only cloud web tools; no private file access or mutations.
use crate::{source_priority, web_reader, web_search, ChatRequest};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

pub(crate) fn add_sources(
    existing: &mut Vec<web_search::SearchResult>,
    incoming: &[web_search::SearchResult]
) {
    for item in incoming {
        if existing.len() >= 8 { break; }
        if !existing.iter().any(|previous| previous.url == item.url) {
            existing.push(item.clone());
        }
    }
}

pub(crate) async fn execute_tool(
    app: &AppHandle, request: &ChatRequest, name: &str, args: &Value,
    sources: &mut Vec<web_search::SearchResult>, provider: &str
) -> Value {
    match name {
        "search_web" => {
            let query = args["query"].as_str().unwrap_or("").trim();
            if query.is_empty() || query.len() > 300 {
                return json!({"error":"Provide a short specific search query"});
            }
            let _ = app.emit("mikan://activity", json!({
                "requestId":request.request_id,"text":format!("{provider} searching: {query}")
            }));
            match source_priority::search(
                request.searxng_endpoint.clone(),query.to_owned(),false,
                &request.source_preferences,request.source_topic.as_deref()
            ).await {
                Ok(found) => {
                    add_sources(sources, &found);
                    json!({"results":found})
                },
                Err(e) => json!({"error":format!("Search unavailable: {e}")})
            }
        },
        "read_webpage" => {
            let url = args["url"].as_str().unwrap_or("");
            let _ = app.emit("mikan://activity", json!({
                "requestId":request.request_id,"text":format!("{provider} reading a webpage…")
            }));
            match web_reader::read_page_impl(app,url,false,request.cache_hours).await {
                Ok(page) => {
                    add_sources(sources,&[web_search::SearchResult {
                        title:page.title.clone(),url:page.url.clone(),
                        content:page.content.chars().take(400).collect(),
                        engine:"webpage".into(),published_date:None
                    }]);
                    json!({"title":page.title,"url":page.url,
                        "content":page.content.chars().take(12000).collect::<String>()})
                },
                Err(e) => json!({"error":format!("Page unavailable: {e}")})
            }
        },
        _ => json!({"error":"Unsupported function"})
    }
}

