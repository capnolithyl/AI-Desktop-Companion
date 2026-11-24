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


/// The model sometimes asks for *new announcements* using a string of only
/// earlier years. If at least two previous years are constraining a
/// clearly current-looking query, remove those stale year filters and include
/// the owner's current year. This is search-query repair after the model chose
/// to browse, not another automatic web-routing classifier.
pub(crate) fn repair_stale_news_query(query:&str,current_year:Option<u16>)->Option<String>{
    let year=current_year.filter(|year|(2020..=2099).contains(year))?;
    let lower=query.to_ascii_lowercase();
    let current_terms=["latest","newest","upcoming","new album","new release",
        "new record","announcement","announced","recent news"];
    if !current_terms.iter().any(|term|lower.contains(term)){return None;}
    let parse_year=|word:&str|->Option<u16>{
        let cleaned=word.trim_matches(|c:char|!c.is_ascii_digit());
        if cleaned.len()==4 && cleaned.bytes().all(|c|c.is_ascii_digit()){
            cleaned.parse::<u16>().ok().filter(|year|(2020..=2099).contains(year))
        }else{None}
    };
    let words=query.split_whitespace().collect::<Vec<_>>();
    let years=words.iter().filter_map(|word|parse_year(word)).collect::<Vec<_>>();
    if years.len()<2 || years.iter().any(|found|*found>=year){return None;}
    let base=words.into_iter().filter(|word|parse_year(word).is_none())
        .collect::<Vec<_>>().join(" ");
    let refreshed=format!("{base} {year}");
    (refreshed.chars().count()<=250).then_some(refreshed)
}

/// Upgrade an existing search result in place, preserving its citation index.
/// A webpage read must not silently disappear because its search URL was
/// already present among the original snippets.
pub(crate) fn record_read_page(
    existing:&mut Vec<web_search::SearchResult>,
    title:&str,url:&str,content:&str
){
    // A previously owner-directed direct read must remain a direct read
    // after evidence enrichment reloads the same URL. Keep source timestamps.
    let previous=existing.iter().find(|source|source.url==url);
    let direct=previous.is_some_and(|source|source.engine=="direct webpage");
    let page=web_search::SearchResult {
        title:title.to_owned(),url:url.to_owned(),
        content:content.chars().take(9000).collect(),
        engine:if direct {"direct webpage"} else {"webpage"}.into(),
        published_date:previous.and_then(|source|source.published_date.clone())
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
                request.searxng_endpoint.clone(),query.to_owned(),
                request.research_recent || args["recent"].as_bool()==Some(true),
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
    fn news_query_repair_anchors_stale_multi_year_search_to_current_year(){
        assert_eq!(repair_stale_news_query(
            "Cattle Decapitation Terrasite 2023 new album announcement 2024 2025",
            Some(2026)).as_deref(),
            Some("Cattle Decapitation Terrasite new album announcement 2026"));
        assert!(repair_stale_news_query("Napoleon wars 1805 1815",Some(2026)).is_none());
        assert!(repair_stale_news_query("2023 2024 tax filing",Some(2026)).is_none());
        assert!(repair_stale_news_query("latest Vulkan release 2026",Some(2026)).is_none());
        assert!(repair_stale_news_query("new album announced 2025",Some(2026)).is_none());
        assert!(repair_stale_news_query(
            "new album announcement 2024 2025",None).is_none());
    }
    #[test]
    fn evidence_enrichment_cannot_erase_a_direct_document_read(){
        let url="https://example.org/readme";
        let mut sources=vec![web_search::SearchResult{
            title:"README".into(),url:url.into(),
            content:"Initial owner-authorized page content.".into(),
            engine:"direct webpage".into(),published_date:Some("2026-11-23".into())
        }];
        record_read_page(&mut sources,"README",url,
            "The actual owner's README includes explicit details about memory and notes.");
        assert_eq!(sources[0].engine,"direct webpage");
        assert_eq!(sources[0].published_date.as_deref(),Some("2026-11-23"));
        assert_eq!(sources.len(),1);
    }

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
