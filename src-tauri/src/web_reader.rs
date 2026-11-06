use futures_util::StreamExt;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    net::{IpAddr, Ipv4Addr, SocketAddr, ToSocketAddrs},
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const MAX_HTML_BYTES: usize = 1_250_000;
const MAX_DOCUMENT_CHARS: usize = 16_000;
const MAX_CACHE_FILES: usize = 150;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDocument {
    pub title: String,
    pub url: String,
    pub content: String,
    pub fetched_at: u64,
    #[serde(default)]
    pub from_cache: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheInfo {
    pub pages: usize,
    pub bytes: u64,
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

// Conservative allowlist: public IPv4 only. No loopback, LAN, link-local, test,
// shared-address, multicast or reserved targets. IPv6 is rejected intentionally.
fn public_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(a == 0 || a == 10 || a == 127 || a >= 224
        || a == 169 && b == 254
        || a == 172 && (16..=31).contains(&b)
        || a == 192 && (b == 168 || b == 0 || b == 2 || b == 88 && c == 99)
        || a == 100 && (64..=127).contains(&b)
        || a == 198 && (b == 18 || b == 19 || b == 51 && c == 100)
        || a == 203 && b == 0 && c == 113
        || a == 192 && b == 0 && c == 0)
}

fn valid_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "Invalid webpage URL".to_string())?;
    let host = parsed.host_str().ok_or("Webpage URL has no hostname")?;
    if parsed.scheme() != "https"
        || parsed.port_or_known_default() != Some(443)
        || parsed.username() != ""
        || parsed.password().is_some()
        || host.parse::<IpAddr>().is_ok()
        || !host.contains('.')
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host.ends_with(".localhost")
    {
        return Err("Only public HTTPS webpages on the standard port are supported".into());
    }
    Ok(parsed)
}

fn cache_path(app: &tauri::AppHandle, url: &str) -> Result<PathBuf, String> {
    let folder = app.path().app_data_dir()
        .map_err(|e| format!("App storage unavailable: {e}"))?
        .join("web-cache");
    fs::create_dir_all(&folder).map_err(|e| format!("Cannot create web cache: {e}"))?;
    let key = format!("{:x}", Sha256::digest(url.as_bytes()));
    Ok(folder.join(format!("{key}.json")))
}

fn extracted_text(html: &str) -> (String, String) {
    let document = Html::parse_document(html);
    let title_selector = Selector::parse("title").expect("constant selector");
    let title = document.select(&title_selector).next()
        .map(|node| node.text().collect::<Vec<_>>().join(" ").trim().chars().take(180).collect::<String>())
        .filter(|t| !t.is_empty()).unwrap_or_else(|| "Webpage".into());

    let primary = Selector::parse("article h1, article h2, article h3, article p, article li, main h1, main h2, main h3, main p, main li").expect("selector");
    let fallback = Selector::parse("h1, h2, h3, p, li").expect("selector");
    let first: Vec<_> = document.select(&primary).collect();
    let nodes = if first.is_empty() { document.select(&fallback).collect::<Vec<_>>() } else { first };
    let mut content = String::new();
    for node in nodes {
        let text = node.text().collect::<Vec<_>>().join(" ");
        let cleaned = text.split_whitespace().collect::<Vec<_>>().join(" ");
        if cleaned.len() < 12 || content.contains(&cleaned) { continue; }
        if content.chars().count() + cleaned.chars().count() > MAX_DOCUMENT_CHARS {
            break;
        }
        content.push_str(&cleaned);
        content.push_str("\n\n");
    }
    (title, content.trim().to_owned())
}

fn prune_cache(folder: &std::path::Path) {
    let Ok(entries) = fs::read_dir(folder) else { return };
    let mut files: Vec<_> = entries.flatten().filter_map(|entry| {
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "json") {
            let meta = entry.metadata().ok()?;
            let modified = meta.modified().ok()?;
            Some((path, modified))
        } else { None }
    }).collect();
    files.sort_by_key(|(_, modified)| *modified);
    let excess = files.len().saturating_sub(MAX_CACHE_FILES);
    for (path, _) in files.into_iter().take(excess) {
        let _ = fs::remove_file(path);
    }
}

pub async fn read_page_impl(
    app: &tauri::AppHandle,
    raw_url: &str,
    refresh: bool,
    ttl_hours: u64,
) -> Result<PageDocument, String> {
    let url = valid_url(raw_url)?;
    let url_str = url.as_str().to_owned();
    let path = cache_path(app, &url_str)?;
    let ttl = ttl_hours.clamp(1, 720) * 3600;

    if !refresh {
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(mut cached) = serde_json::from_slice::<PageDocument>(&bytes) {
                if cached.url == url_str && now_secs().saturating_sub(cached.fetched_at) < ttl {
                    cached.from_cache = true;
                    return Ok(cached);
                }
            }
        }
    }

    let host = url.host_str().ok_or("Missing hostname")?.to_owned();
    let host_for_dns = host.clone();
    let addresses = tauri::async_runtime::spawn_blocking(move || {
        (host_for_dns.as_str(), 443).to_socket_addrs()
            .map(|addrs| addrs.filter_map(|socket| match socket.ip() {
                IpAddr::V4(ip) if public_ipv4(ip) => Some(SocketAddr::new(IpAddr::V4(ip), 443)),
                _ => None,
            }).collect::<Vec<_>>())
    }).await.map_err(|e| e.to_string())?
        .map_err(|_| "Could not resolve the webpage hostname".to_owned())?;
    if addresses.is_empty() {
        return Err("The webpage does not resolve to a permitted public address".into());
    }

    // Pin checked DNS results so a second lookup cannot redirect us onto LAN.
    // No proxy or redirects, to prevent hops to private services.
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .resolve_to_addrs(&host, &addresses)
        .timeout(Duration::from_secs(18))
        .connect_timeout(Duration::from_secs(7))
        .build().map_err(|e| e.to_string())?;
    let response = client.get(url.clone())
        .header(reqwest::header::ACCEPT, "text/html, text/plain;q=0.9")
        .send().await.map_err(|e| format!("Webpage fetch failed: {e}"))?;
    if response.status().is_redirection() {
        return Err("This webpage redirects to another URL. Open it in your browser instead.".into());
    }
    if !response.status().is_success() {
        return Err(format!("Webpage returned HTTP {}", response.status()));
    }
    let content_type = response.headers().get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok()).unwrap_or("").to_lowercase();
    if !content_type.contains("text/html") && !content_type.contains("text/plain") {
        return Err("Only HTML and plaintext pages can be read".into());
    }
    if response.content_length().is_some_and(|length| length > MAX_HTML_BYTES as u64) {
        return Err("Page too large for the reader".into());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        if bytes.len().saturating_add(chunk.len()) > MAX_HTML_BYTES {
            return Err("Page exceeds the 1.25 MB reader limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8_lossy(&bytes);
    let (title, content) = if content_type.contains("text/plain") {
        ("Plaintext page".to_owned(), body.chars().take(MAX_DOCUMENT_CHARS).collect())
    } else {
        extracted_text(&body)
    };
    if content.trim().is_empty() {
        return Err("No readable article text was found on this page".into());
    }
    let document = PageDocument { title, url: url_str, content, fetched_at: now_secs(), from_cache: false };
    let serialized = serde_json::to_vec(&document).map_err(|e| e.to_string())?;
    fs::write(&path, serialized).map_err(|e| format!("Cannot cache webpage: {e}"))?;
    if let Some(dir) = path.parent() { prune_cache(dir); }
    Ok(document)
}

#[tauri::command]
pub async fn read_page(
    app: tauri::AppHandle,
    url: String,
    refresh: bool,
    ttl_hours: u64,
) -> Result<PageDocument, String> {
    read_page_impl(&app, &url, refresh, ttl_hours).await
}

#[tauri::command]
pub fn web_cache_info(app: tauri::AppHandle) -> Result<CacheInfo, String> {
    let folder = app.path().app_data_dir().map_err(|e| e.to_string())?.join("web-cache");
    let mut total = CacheInfo { pages: 0, bytes: 0 };
    if let Ok(entries) = fs::read_dir(folder) {
        for item in entries.flatten() {
            if item.path().extension().is_some_and(|e| e == "json") {
                if let Ok(meta) = item.metadata() {
                    total.pages += 1;
                    total.bytes += meta.len();
                }
            }
        }
    }
    Ok(total)
}

#[tauri::command]
pub fn clear_web_cache(app: tauri::AppHandle) -> Result<CacheInfo, String> {
    let folder = app.path().app_data_dir().map_err(|e| e.to_string())?.join("web-cache");
    if let Ok(entries) = fs::read_dir(folder) {
        for entry in entries.flatten() {
            if entry.path().extension().is_some_and(|e| e == "json") {
                fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
            }
        }
    }
    web_cache_info(app)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_addresses_are_rejected() {
        for addr in ["127.0.0.1","10.0.0.2","192.168.1.2","169.254.1.1","100.64.1.1","198.51.100.3"] {
            assert!(!public_ipv4(addr.parse().unwrap()));
        }
        assert!(public_ipv4("1.1.1.1".parse().unwrap()));
        assert!(valid_url("http://example.com").is_err());
        assert!(valid_url("https://localhost").is_err());
        assert!(valid_url("https://example.com:8443").is_err());
        assert!(valid_url("https://example.com/article").is_ok());
    }
    #[test]
    fn article_extraction() {
        let (title, text) = extracted_text("<html><head><title>Test</title></head><body><nav>IGNORE</nav><article><h1>Important Heading</h1><p>Hello from the important article.</p></article></body></html>");
        assert_eq!(title, "Test");
        assert!(text.contains("Hello from the important article."));
        assert!(!text.contains("IGNORE"));
    }
}
