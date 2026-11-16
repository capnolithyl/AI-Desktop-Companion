use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashSet, sync::{Mutex, OnceLock}, time::{Duration, Instant}};

const MAX_RESULT_BYTES: usize = 2_000_000;
const MAX_RESULTS: usize = 8;

// Each SearXNG query fans out to multiple external engines. Live Brain Lab
// can otherwise issue a burst of broad, preferred-domain and candidate
// searches, causing CAPTCHAs and 429s across *all* providers.
// Reserve request-start times locally; never sleep while holding the mutex.
// This is process-wide, including manual chat research and live diagnostics.
const MIN_SEARCH_SPACING: Duration = Duration::from_secs(3);

fn search_slot(next: Instant, now: Instant) -> (Duration, Instant) {
    let wait = next.saturating_duration_since(now);
    (wait, now + wait + MIN_SEARCH_SPACING)
}

async fn pace_live_search() {
    static NEXT_SEARCH: OnceLock<Mutex<Instant>> = OnceLock::new();
    let now = Instant::now();
    let wait = {
        let guard = NEXT_SEARCH.get_or_init(|| Mutex::new(now));
        let mut next = guard.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (wait, reserved) = search_slot(*next, now);
        *next = reserved;
        wait
    };
    if !wait.is_zero() {
        tokio::time::sleep(wait).await;
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
    pub engine: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_date: Option<String>,
}

pub(crate) fn local_searxng_url(endpoint: &str) -> Result<String, String> {
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

#[cfg(test)]
fn search_results(data: &Value) -> Vec<SearchResult> {
    search_results_limited(data, MAX_RESULTS)
}

fn search_results_limited(data: &Value, limit: usize) -> Vec<SearchResult> {
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
        if results.len() == limit {
            break;
        }
    }
    results
}

#[tauri::command]
pub async fn web_search(endpoint: String, query: String) -> Result<Vec<SearchResult>, String> {
    web_search_impl(endpoint, query, false).await
}

/// Rank a bounded pool before exposing the final eight results to the model.
pub(crate) async fn search_candidates(endpoint:String,query:String,recent:bool,limit:usize)
    -> Result<Vec<SearchResult>,String> {
    let found=web_search_impl_limited(endpoint.clone(),query.clone(),recent,limit).await;
    match found {
        Ok(items) if !items.is_empty() || !recent => Ok(items),
        Err(error) if !recent => Err(error),
        _ => web_search_impl_limited(endpoint,query,false,limit).await
    }
}

async fn web_search_impl(endpoint: String, query: String, recent: bool) -> Result<Vec<SearchResult>, String> {
    web_search_impl_limited(endpoint,query,recent,MAX_RESULTS).await
}

async fn web_search_impl_limited(endpoint:String,query:String,recent:bool,limit:usize) -> Result<Vec<SearchResult>,String> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 250 {
        return Err("Enter a search query between 1 and 250 characters".into());
    }

    let url = format!("{}/search", local_searxng_url(&endpoint)?);
    let client = reqwest::Client::builder()
        // Local Docker traffic must never be sent through a system HTTP proxy.
        // The service health check already uses the same direct-loopback policy.
        .no_proxy()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(22))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut params = vec![("q", query), ("format", "json")];
    if recent {
        params.push(("time_range", "year"));
    }
    pace_live_search().await;
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
    let results = search_results_limited(&data,limit);
    if results.is_empty() {
        // A healthy homepage says nothing about the upstream search engines.
        // Do not hide engine failures behind the ordinary "no matches" reply.
        let unavailable = data["unresponsive_engines"].as_array().map_or(0, |engines| engines.len());
        if unavailable > 0 {
            return Err(format!(
                "SearXNG returned no results and reported {unavailable} unresponsive engine(s). Check Docker logs, enabled engines and outbound internet access."
            ));
        }
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn search_slot_reservations_space_parallel_requests() {
        let now = Instant::now();
        let (first, next) = search_slot(now, now);
        assert_eq!(first, Duration::ZERO);
        let (second, next2) = search_slot(next, now);
        assert_eq!(second, MIN_SEARCH_SPACING);
        assert_eq!(next2, next + MIN_SEARCH_SPACING);
        let (after_cooldown, _) = search_slot(next2, now + Duration::from_secs(10));
        assert_eq!(after_cooldown, Duration::ZERO);
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
