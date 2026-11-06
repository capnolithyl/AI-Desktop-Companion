use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use std::{collections::HashSet, time::Duration};

const MAX_RESULT_BYTES: usize = 2_000_000;
const MAX_RESULTS: usize = 8;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
    pub engine: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_date: Option<String>,
}

fn local_searxng_url(endpoint: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(endpoint)
        .map_err(|_| "Enter a valid local SearXNG URL".to_owned())?;
    if parsed.scheme() != "http"
        || !matches!(parsed.host_str(), Some("127.0.0.1" | "localhost"))
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != "/"
    {
        return Err("SearXNG must use a local HTTP base URL such as http://127.0.0.1:8888".into());
    }
    Ok(format!(
        "http://{}:{}",
        parsed.host_str().unwrap(),
        parsed.port().unwrap_or(8888)
    ))
}

fn search_results(data: &Value) -> Vec<SearchResult> {
    let mut found = HashSet::new();
    let mut results = Vec::new();
    for item in data["results"].as_array().into_iter().flatten() {
        let Some(url) = item["url"].as_str() else { continue };
        let Ok(parsed) = reqwest::Url::parse(url) else { continue };
        if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
            continue;
        }
        if !found.insert(url.to_owned()) {
            continue;
        }
        let title = item["title"].as_str().unwrap_or(url).chars().take(160).collect();
        let content = item["content"].as_str().unwrap_or("").chars().take(550).collect();
        let engine = item["engine"].as_str().unwrap_or("").chars().take(60).collect();
        let published_date = item["publishedDate"].as_str()
            .or_else(|| item["pubdate"].as_str())
            .filter(|date| !date.trim().is_empty())
            .map(|date| date.chars().take(80).collect::<String>());
        results.push(SearchResult {
            title,
            url: url.to_owned(),
            content,
            engine,
            published_date,
        });
        if results.len() == MAX_RESULTS {
            break;
        }
    }
    results
}

#[tauri::command]
pub async fn web_search(endpoint: String, query: String) -> Result<Vec<SearchResult>, String> {
    web_search_impl(endpoint, query, false).await
}

/// Look for current reporting on upcoming releases instead of blindly taking
/// the highest-ranked, possibly years-old album announcement. If an engine
/// ignores SearXNG's time range, normal results still provide a fallback.
pub async fn web_search_recent(endpoint: String, query: String) -> Result<Vec<SearchResult>, String> {
    // A focused recent query may be too restrictive for some engines. Search
    // a broader album query concurrently, retaining a few fallback references.
    let broad_query = album_fallback_query(&query);
    let (fresh, general) = futures_util::future::join(
        web_search_impl(endpoint.clone(), query, true),
        web_search_impl(endpoint, broad_query, false),
    ).await;
    if fresh.is_err() && general.is_err() {
        return Err(fresh.err().unwrap_or_else(|| general.err().unwrap()));
    }

    let focus = query.split('"').nth(1).map(str::to_lowercase);
    let relevant = |item: &SearchResult| {
        focus.as_ref().is_none_or(|name| {
            item.title.to_lowercase().contains(name.as_str())
                || item.content.to_lowercase().contains(name.as_str())
        })
    };
    let mut combined = Vec::new();
    let mut seen = HashSet::new();
    // Prefer the recent query, while reserving room for fallback sources.
    for item in fresh.unwrap_or_default().into_iter().filter(&relevant).take(5)
        .chain(general.unwrap_or_default().into_iter().filter(&relevant))
    {
        if seen.insert(item.url.clone()) {
            combined.push(item);
            if combined.len() == MAX_RESULTS { break; }
        }
    }
    Ok(combined)
}

fn album_fallback_query(query: &str) -> String {
    // Keep only the canonical quoted artist name when available. Searching
    // for too many terms can otherwise return no results at all.
    if let Some((_, after_open)) = query.split_once('"') {
        if let Some((name, _)) = after_open.split_once('"') {
            if !name.trim().is_empty() {
                return format!("\"{}\" new album", name.trim());
            }
        }
    }
    query.replace("next album recording studio announcement", "new album")
}

async fn web_search_impl(endpoint: String, query: String, recent: bool) -> Result<Vec<SearchResult>, String> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 250 {
        return Err("Enter a search query between 1 and 250 characters".into());
    }

    let url = format!("{}/search", local_searxng_url(&endpoint)?);
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(22))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut params = vec![("q", query), ("format", "json")];
    if recent {
        params.push(("time_range", "year"));
    }
    let response = client
        .get(url)
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("Cannot reach SearXNG: {e}. Start it with tools/searxng/start.ps1."))?;

    if response.status() == reqwest::StatusCode::FORBIDDEN {
        return Err("SearXNG returned HTTP 403. Enable 'json' in search.formats in settings.yml.".into());
    }
    if !response.status().is_success() {
        return Err(format!("SearXNG returned HTTP {}.", response.status()));
    }
    if response.content_length().is_some_and(|n| n > MAX_RESULT_BYTES as u64) {
        return Err("SearXNG returned an unexpectedly large response".into());
    }

    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Search response interrupted: {e}"))?;
        if bytes.len() + chunk.len() > MAX_RESULT_BYTES {
            return Err("SearXNG returned an unexpectedly large response".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let data: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "SearXNG did not return JSON. Verify search.formats includes json.".to_owned())?;
    Ok(search_results(&data))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fallback_album_query_is_broad_and_canonically_quoted() {
        assert_eq!(
            album_fallback_query("\"cattle decapitation\" next album recording studio announcement"),
            "\"cattle decapitation\" new album"
        );
    }

    #[test]
    fn recent_merge_prefers_canonical_entity_results() {
        let items=serde_json::json!({"results":[
            {"title":"Cattle Decapitation new material", "url":"https://example.org/1", "content":"band"},
            {"title":"Unrelated metal news", "url":"https://example.org/2", "content":"other"},
            {"title":"Cattle Decapitation studio plans", "url":"https://example.org/3", "content":"2026"}
        ]});
        let results=search_results(&items);
        let focus="cattle decapitation";
        let found: Vec<_> = results.iter().filter(|x| {
            x.title.to_lowercase().contains(focus) || x.content.to_lowercase().contains(focus)
        }).collect();
        assert_eq!(found.len(), 2);
    }
    #[test]
    fn reject_non_local_urls() {
        assert!(local_searxng_url("https://example.com").is_err());
        assert!(local_searxng_url("http://192.168.0.1:8888").is_err());
        assert!(local_searxng_url("http://127.0.0.1:8888/other").is_err());
        assert!(local_searxng_url("http://127.0.0.1:8888").is_ok());
    }

    #[test]
    fn only_web_links_and_no_duplicates() {
        let input = serde_json::json!({"results":[
            {"title":"Valid","url":"https://example.org", "content":"Summary"},
            {"title":"Duplicate","url":"https://example.org"},
            {"title":"Unsafe","url":"javascript:alert(1)"}
        ]});
        let result = search_results(&input);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "Valid");
    }
}
