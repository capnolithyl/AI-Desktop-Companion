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


/// Upgrade an existing search result in place, preserving its citation index.
/// A webpage read must not silently disappear because its search URL was
/// already present among the original snippets.
pub(crate) fn record_read_page(
    existing:&mut Vec<web_search::SearchResult>,
    title:&str,url:&str,content:&str
){
    let page=web_search::SearchResult {
        title:title.to_owned(),url:url.to_owned(),
        content:content.chars().take(4600).collect(),
        engine:"webpage".into(),published_date:None
    };
    if let Some(index)=existing.iter().position(|source|source.url==url){
        existing[index]=page;
    }else{
        add_sources(existing,&[page]);
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
                    record_read_page(sources,&page.title,&page.url,&page.content);
                    json!({"title":page.title,"url":page.url,
                        "content":page.content.chars().take(12000).collect::<String>()})
                },
                Err(e) => json!({"error":format!("Page unavailable: {e}")})
            }
        },
        _ => json!({"error":"Unsupported function"})
    }
}


#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn full_page_replaces_search_snippet_without_moving_citation_index(){
        let mut sources=vec![
            web_search::SearchResult{title:"First".into(),url:"https://one.test".into(),
                content:"search snippet".into(),engine:"search".into(),published_date:None},
            web_search::SearchResult{title:"Second".into(),url:"https://two.test".into(),
                content:"other".into(),engine:"search".into(),published_date:None}
        ];
        record_read_page(&mut sources,"Full primary page","https://one.test",
            "May 14 2027 Milwaukee Metal Fest is on the primary tour page.");
        assert_eq!(sources.len(),2);
        assert_eq!(sources[0].engine,"webpage");
        assert!(sources[0].content.contains("Milwaukee Metal Fest"));
        assert_eq!(sources[1].title,"Second");
    }
}
