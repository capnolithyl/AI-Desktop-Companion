//! Owner-controlled, read-only Notion knowledge library.
//! Notion data is reference content, NEVER persona canon or executable instructions.
use crate::memory;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use std::{collections::{HashMap, HashSet, VecDeque}, fs, path::PathBuf, time::Duration};
use tauri::{AppHandle, Manager};

const NOTION_VERSION: &str = "2025-09-03";
const MAX_PAGES: usize = 10_000;
const MAX_BLOCKS: usize = 100_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionStatus {
    connected: bool,
    all_pages: bool,
    pages: i64,
    chunks: i64,
    last_synced: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionPage {
    id: String,
    title: String,
    url: String,
    selected: bool,
    last_edited: String,
    is_database: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionHit {
    title: String,
    url: String,
    content: String,
    synced_at: i64,
}

struct CachedPage {
    id: String,
    title: String,
    url: String,
    chunks: Vec<String>,
    last_edited: String,
}

/// Metadata-only list for context routing. Never sends private page bodies
/// to the model just to decide whether the owner is talking about their work.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionCachedPage {
    id: String,
    title: String,
    url: String,
    chunk_count: i64,
    characters: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionDocument {
    id: String,
    title: String,
    url: String,
    synced_at: i64,
    chunks: Vec<String>,
}

fn db(app: &AppHandle) -> Result<Connection, String> {
    let conn = memory::open_db(app)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notion_config(
             key TEXT PRIMARY KEY, value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS notion_roots(
             id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
             selected INTEGER NOT NULL DEFAULT 0
         );
         CREATE TABLE IF NOT EXISTS notion_pages(
             id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
             last_edited TEXT NOT NULL, synced_at INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS notion_chunks(
             id INTEGER PRIMARY KEY, page_id TEXT NOT NULL
             REFERENCES notion_pages(id) ON DELETE CASCADE,
             title TEXT NOT NULL, content TEXT NOT NULL
         );
         CREATE VIRTUAL TABLE IF NOT EXISTS notion_fts USING fts5(
             title, content, tokenize='unicode61 remove_diacritics 2'
         );"
    ).map_err(|e| e.to_string())?;
    Ok(conn)
}

fn all_pages(conn: &Connection) -> Result<bool, String> {
    Ok(conn.query_row(
        "SELECT value FROM notion_config WHERE key='all_pages'",
        [], |r| r.get::<_, String>(0)
    ).unwrap_or_default() == "true")
}

fn token_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("notion-token.dpapi"))
}

#[cfg(target_os = "windows")]
mod credential {
    use std::{ffi::c_void, ptr, slice};

    #[repr(C)]
    struct DataBlob { cb_data: u32, pb_data: *mut u8 }

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(input: *const DataBlob, description: *const u16,
            entropy: *const DataBlob, reserved: *mut c_void,
            prompt: *const c_void, flags: u32, output: *mut DataBlob) -> i32;
        fn CryptUnprotectData(input: *const DataBlob, description: *mut *mut u16,
            entropy: *const DataBlob, reserved: *mut c_void,
            prompt: *const c_void, flags: u32, output: *mut DataBlob) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" { fn LocalFree(ptr: *mut c_void) -> *mut c_void; }

    fn run(data: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
        if data.len() > u32::MAX as usize { return Err("Credential is too large".into()); }
        let input = DataBlob { cb_data: data.len() as u32, pb_data: data.as_ptr() as *mut u8 };
        let mut output = DataBlob { cb_data: 0, pb_data: ptr::null_mut() };
        // Current Windows-user scope. Never set CRYPTPROTECT_LOCAL_MACHINE.
        let success = unsafe {
            if encrypt {
                CryptProtectData(&input, ptr::null(), ptr::null(), ptr::null_mut(),
                    ptr::null(), 1, &mut output)
            } else {
                CryptUnprotectData(&input, ptr::null_mut(), ptr::null(), ptr::null_mut(),
                    ptr::null(), 1, &mut output)
            }
        };
        if success == 0 { return Err("Windows could not unlock the Notion credential".into()); }
        let bytes = unsafe { slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec() };
        unsafe { LocalFree(output.pb_data as *mut c_void); }
        Ok(bytes)
    }
    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> { run(data, true) }
    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> { run(data, false) }
}

#[cfg(not(target_os = "windows"))]
mod credential {
    pub fn protect(_: &[u8]) -> Result<Vec<u8>, String> { Err("Notion credentials require Windows DPAPI".into()) }
    pub fn unprotect(_: &[u8]) -> Result<Vec<u8>, String> { Err("Notion credentials require Windows DPAPI".into()) }
}

fn get_token(app: &AppHandle) -> Result<Option<String>, String> {
    let path = token_path(app)?;
    if !path.exists() { return Ok(None); }
    let encrypted = fs::read(path).map_err(|e| e.to_string())?;
    let bytes = credential::unprotect(&encrypted)?;
    let token = String::from_utf8(bytes).map_err(|_| "Invalid stored credential".to_owned())?;
    Ok(Some(token))
}

fn need_token(app: &AppHandle) -> Result<String, String> {
    get_token(app)?.ok_or_else(|| "Connect Notion in Settings > Notion first".to_owned())
}

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(40))
        .build().map_err(|e| e.to_string())
}

async fn request(client: &reqwest::Client, token: &str, method: reqwest::Method,
    path: &str, body: Option<Value>) -> Result<Value, String>
{
    // No caller-supplied host or URL. Tokens must ONLY go to api.notion.com.
    if !path.starts_with("/v1/") { return Err("Invalid Notion endpoint".into()); }
    let url = format!("https://api.notion.com{path}");
    for attempt in 0..5 {
        let mut req = client.request(method.clone(), &url)
            .bearer_auth(token)
            .header("Notion-Version", NOTION_VERSION)
            .header("Accept", "application/json");
        if let Some(body) = body.as_ref() { req = req.json(body); }
        let response = req.send().await.map_err(|_| "Unable to reach Notion".to_owned())?;
        if response.status().as_u16() == 429 && attempt < 4 {
            let seconds = response.headers().get("retry-after")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<u64>().ok()).unwrap_or(1).clamp(1, 10);
            tokio::time::sleep(Duration::from_secs(seconds)).await;
            continue;
        }
        if !response.status().is_success() {
            let status = response.status();
            let error: Value = response.json().await.unwrap_or(Value::Null);
            let explanation = error["message"].as_str().unwrap_or("Check the integration's page access");
            // Do not include credential/header/request debug data in errors.
            return Err(format!("Notion returned {status}: {}", explanation.chars().take(240).collect::<String>()));
        }
        return response.json().await.map_err(|_| "Notion returned an invalid response".to_owned());
    }
    Err("Notion rate limit exceeded. Try syncing again".into())
}

fn rich_text(value: &Value) -> String {
    value.as_array().map(|parts| parts.iter()
        .filter_map(|part| part["plain_text"].as_str()
            .or_else(|| part["text"]["content"].as_str()))
        .collect::<String>()
    ).unwrap_or_default()
}

fn page_title(page: &Value) -> String {
    let properties = page["properties"].as_object();
    properties.and_then(|properties| properties.values().find_map(|prop| {
        if prop["type"].as_str() == Some("title") {
            Some(rich_text(&prop["title"]))
        } else { None }
    })).filter(|text| !text.is_empty()).unwrap_or_else(|| "Untitled Notion page".to_owned())
}

fn is_id(id: &str) -> bool {
    let compact = id.replace('-', "");
    compact.len() == 32 && compact.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn page_from_json(page: &Value) -> Option<NotionPage> {
    if page["object"].as_str()? != "page" { return None; }
    let id = page["id"].as_str()?;
    if !is_id(id) { return None; }
    Some(NotionPage {
        id: id.to_owned(),
        title: page_title(page),
        url: page["url"].as_str().filter(|url| url.starts_with("https://www.notion.so/"))
            .unwrap_or("").to_owned(),
        selected: false,
        last_edited: page["last_edited_time"].as_str().unwrap_or("").to_owned(),
        is_database: false,
    })
}

fn database_from_json(value: &Value) -> Option<NotionPage> {
    if value["object"].as_str()? != "database" { return None; }
    let id=value["id"].as_str()?;
    if !is_id(id) { return None; }
    Some(NotionPage {
        id:id.to_owned(),
        title:rich_text(&value["title"]).trim().to_owned(),
        url:value["url"].as_str().filter(|url| url.starts_with("https://www.notion.so/"))
            .unwrap_or("").to_owned(),
        selected:false,
        last_edited:value["last_edited_time"].as_str().unwrap_or("").to_owned(),
        is_database:true,
    })
}

async fn list_accessible(client: &reqwest::Client, token: &str) -> Result<Vec<NotionPage>, String> {
    let mut pages = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut body = json!({"page_size":100});
        if let Some(start) = &cursor { body["start_cursor"] = json!(start); }
        let response = request(client, token, reqwest::Method::POST,
            "/v1/search", Some(body)).await?;
        for value in response["results"].as_array().ok_or("Malformed Notion search result")? {
            if let Some(page) = page_from_json(value).or_else(|| database_from_json(value)) {
                pages.push(page);
            }
        }
        if pages.len() > MAX_PAGES { return Err("Too many Notion pages in workspace; use a smaller scope".into()); }
        if !response["has_more"].as_bool().unwrap_or(false) { break; }
        cursor = response["next_cursor"].as_str().map(str::to_owned);
        if cursor.is_none() { return Err("Notion search pagination is incomplete".into()); }
    }
    Ok(pages)
}

async fn children(client: &reqwest::Client, token: &str, id: &str) -> Result<Vec<Value>, String> {
    if !is_id(id) { return Err("Invalid Notion block identifier".into()); }
    let mut output = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut path = format!("/v1/blocks/{id}/children?page_size=100");
        if let Some(start) = &cursor {
            // Notion cursors are opaque, never interpolate unchecked URL text.
            path.push_str("&start_cursor=");
            path.push_str(&start.bytes().map(|b| {
                if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
                    (b as char).to_string()
                } else { format!("%{b:02X}") }
            }).collect::<String>());
        }
        let response = request(client, token, reqwest::Method::GET, &path, None).await?;
        output.extend(response["results"].as_array()
            .ok_or("Malformed Notion block response")?.iter().cloned());
        if output.len() > MAX_BLOCKS { return Err("A Notion page exceeds the safe block limit".into()); }
        if !response["has_more"].as_bool().unwrap_or(false) { break; }
        cursor = response["next_cursor"].as_str().map(str::to_owned);
        if cursor.is_none() { return Err("Notion block pagination is incomplete".into()); }
    }
    Ok(output)
}

fn block_text(block: &Value) -> String {
    let kind = block["type"].as_str().unwrap_or("");
    let value = &block[kind];
    if kind == "child_page" { return String::new(); }
    if kind == "table_row" {
        return value["cells"].as_array().map(|cells|
            cells.iter().map(rich_text).collect::<Vec<_>>().join(" | ")
        ).unwrap_or_default();
    }
    let mut text = rich_text(&value["rich_text"]);
    if text.is_empty() { text = rich_text(&value["caption"]); }
    if kind == "to_do" {
        text = format!("{} {text}", if value["checked"].as_bool() == Some(true) {"[x]"} else {"[ ]"});
    }
    if kind.starts_with("heading_") && !text.is_empty() { text = format!("# {text}"); }
    text
}

async fn database_rows(client: &reqwest::Client, token: &str, id: &str)
    -> Result<Vec<NotionPage>, String>
{
    if !is_id(id) { return Err("Invalid Notion database ID".into()); }
    let metadata = request(client, token, reqwest::Method::GET,
        &format!("/v1/databases/{id}"), None).await?;
    let mut rows = Vec::new();
    for source in metadata["data_sources"].as_array().into_iter().flatten() {
        let Some(source_id) = source["id"].as_str().filter(|id| is_id(id)) else { continue };
        let mut cursor: Option<String> = None;
        loop {
            let mut body = json!({"page_size":100});
            if let Some(start) = &cursor { body["start_cursor"] = json!(start); }
            let response = request(client, token, reqwest::Method::POST,
                &format!("/v1/data_sources/{source_id}/query"), Some(body)).await?;
            for value in response["results"].as_array().into_iter().flatten() {
                if let Some(page) = page_from_json(value) { rows.push(page); }
            }
            if rows.len() > MAX_PAGES { return Err("Too many pages in a Notion database".into()); }
            if !response["has_more"].as_bool().unwrap_or(false) { break; }
            cursor = response["next_cursor"].as_str().map(str::to_owned);
            if cursor.is_none() { return Err("Notion data source pagination is incomplete".into()); }
        }
    }
    Ok(rows)
}

enum Todo { BlockId(String, usize), Block(Value, usize) }

async fn fetch_page_text(client: &reqwest::Client, token: &str, page: &NotionPage,
    discovered: &mut VecDeque<NotionPage>) -> Result<Vec<String>, String>
{
    if page.is_database {
        discovered.extend(database_rows(client,token,&page.id).await?);
        return Ok(Vec::new());
    }
    let mut blocks = Vec::new();
    let mut todo = vec![Todo::BlockId(page.id.clone(), 0)];
    let mut processed = 0usize;
    while let Some(item) = todo.pop() {
        match item {
            Todo::BlockId(id, depth) => {
                if depth > 24 { return Err(format!("Nested content too deep: {}",page.title)); }
                let descendants = children(client, token, &id).await?;
                for block in descendants.into_iter().rev() { todo.push(Todo::Block(block, depth)); }
            }
            Todo::Block(block, depth) => {
                processed += 1;
                if processed > MAX_BLOCKS { return Err(format!("Page has too many blocks: {}",page.title)); }
                let kind = block["type"].as_str().unwrap_or("");
                if kind == "child_page" {
                    if let Some(id) = block["id"].as_str().filter(|id| is_id(id)) {
                        let title = block["child_page"]["title"].as_str().unwrap_or("Untitled page");
                        discovered.push_back(NotionPage {
                            id: id.to_owned(), title: title.to_owned(),
                            url: format!("https://www.notion.so/{}", id.replace('-', "")),
                            selected: false,
                            last_edited: block["last_edited_time"].as_str().unwrap_or("").to_owned(),
                            is_database:false,
                        });
                    }
                    continue;
                }
                if kind == "child_database" {
                    if let Some(id) = block["id"].as_str().filter(|id| is_id(id)) {
                        discovered.extend(database_rows(client, token, id).await?);
                    }
                    continue;
                }
                let content = block_text(&block);
                if !content.trim().is_empty() { blocks.push(content); }
                if block["has_children"].as_bool() == Some(true) {
                    if let Some(id) = block["id"].as_str().filter(|id| is_id(id)) {
                        todo.push(Todo::BlockId(id.to_owned(), depth + 1));
                    }
                }
            }
        }
    }
    Ok(blocks)
}

fn chunk_text(blocks: &[String]) -> Vec<String> {
    // Split on Unicode character boundaries, with overlap for passages spanning chunks.
    let all = blocks.join("\n\n");
    let chars: Vec<char> = all.chars().collect();
    let mut chunks = Vec::new();
    let mut start = 0usize;
    while start < chars.len() {
        let end = (start + 1800).min(chars.len());
        chunks.push(chars[start..end].iter().collect());
        if end == chars.len() { break; }
        start = end - 220;
    }
    chunks
}

fn status(app: &AppHandle) -> Result<NotionStatus, String> {
    let conn = db(app)?;
    let pages = conn.query_row("SELECT COUNT(*) FROM notion_pages", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let chunks = conn.query_row("SELECT COUNT(*) FROM notion_chunks", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let last_synced = conn.query_row("SELECT MAX(synced_at) FROM notion_pages", [],
        |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(NotionStatus { connected: get_token(app)?.is_some(), all_pages: all_pages(&conn)?,
        pages, chunks, last_synced })
}

#[tauri::command]
pub fn notion_status(app: AppHandle) -> Result<NotionStatus, String> { status(&app) }

#[tauri::command]
pub async fn notion_connect(app: AppHandle, token: String) -> Result<NotionStatus, String> {
    let token = token.trim();
    if token.len() < 12 || token.len() > 2048 || token.chars().any(char::is_whitespace) {
        return Err("Paste a valid Notion internal integration secret".into());
    }
    request(&http()?, token, reqwest::Method::GET, "/v1/users/me", None).await?;
    let encrypted = credential::protect(token.as_bytes())?;
    fs::write(token_path(&app)?, encrypted).map_err(|_| "Could not save the protected Notion token".to_owned())?;
    let conn = db(&app)?;
    // Switching workspaces cannot leak the previous connection's cached documents.
    conn.execute_batch("DELETE FROM notion_fts; DELETE FROM notion_chunks; DELETE FROM notion_pages; DELETE FROM notion_roots; DELETE FROM notion_config;")
        .map_err(|e| e.to_string())?;
    status(&app)
}

#[tauri::command]
pub fn notion_disconnect(app: AppHandle) -> Result<NotionStatus, String> {
    let path = token_path(&app)?;
    if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
    let conn = db(&app)?;
    conn.execute_batch("DELETE FROM notion_fts; DELETE FROM notion_chunks; DELETE FROM notion_pages; DELETE FROM notion_roots; DELETE FROM notion_config;")
        .map_err(|e| e.to_string())?;
    status(&app)
}

#[tauri::command]
pub async fn notion_list_pages(app: AppHandle) -> Result<Vec<NotionPage>, String> {
    let token = need_token(&app)?;
    let pages = list_accessible(&http()?, &token).await?;
    let conn = db(&app)?;
    for page in &pages {
        conn.execute("INSERT INTO notion_roots(id,title,url,selected) VALUES(?1,?2,?3,0)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url",
            params![page.id,page.title,page.url]).map_err(|e| e.to_string())?;
    }
    let mut stmt = conn.prepare("SELECT id FROM notion_roots WHERE selected=1")
        .map_err(|e| e.to_string())?;
    let selected: HashSet<String> = stmt.query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    Ok(pages.into_iter().map(|mut page| {
        page.selected = selected.contains(&page.id);
        page
    }).collect())
}

#[tauri::command]
pub fn notion_select_page(app: AppHandle, id: String, selected: bool) -> Result<(), String> {
    if !is_id(&id) { return Err("Invalid Notion page ID".into()); }
    let conn = db(&app)?;
    let affected = conn.execute("UPDATE notion_roots SET selected=?2 WHERE id=?1",
        params![id, selected]).map_err(|e| e.to_string())?;
    if affected == 0 { return Err("Refresh the accessible page list first".into()); }
    Ok(())
}

#[tauri::command]
pub fn notion_set_all(app: AppHandle, enabled: bool) -> Result<NotionStatus, String> {
    let conn = db(&app)?;
    conn.execute("INSERT INTO notion_config(key,value) VALUES('all_pages',?1)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![if enabled {"true"} else {"false"}]).map_err(|e| e.to_string())?;
    status(&app)
}

#[tauri::command]
pub async fn notion_sync(app: AppHandle) -> Result<NotionStatus, String> {
    let token = need_token(&app)?;
    let client = http()?;
    // Do not hold a SQLite connection or statement across async HTTP requests.
    let (all, selected_roots) = {
        let conn = db(&app)?;
        let all = all_pages(&conn)?;
        let selected = {
            let mut stmt = conn.prepare("SELECT id,title,url FROM notion_roots WHERE selected=1")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| Ok(NotionPage {
                id:r.get(0)?, title:r.get(1)?, url:r.get(2)?, selected:true,
                last_edited:String::new(),is_database:false,
            })).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?
        };
        (all, selected)
    };
    if !all && selected_roots.is_empty() {
        return Err("Choose pages or enable 'All shared pages' before syncing".into());
    }
    // Recheck current permissions on *every* sync. If the owner has revoked
    // access, drop that page from the new index instead of retaining stale data.
    let available = list_accessible(&client, &token).await?;
    let roots: Vec<NotionPage> = if all {
        available
    } else {
        let selected_ids:HashSet<String>=selected_roots.into_iter().map(|page|page.id).collect();
        // Use fresh metadata so database roots are not mistaken for pages.
        available.into_iter().filter(|page| selected_ids.contains(&page.id)).collect()
    };
    let mut queue: VecDeque<NotionPage> = roots.into();
    let mut visited = HashSet::new();
    let mut cached = Vec::new();
    while let Some(page) = queue.pop_front() {
        if !visited.insert(page.id.clone()) { continue; }
        if visited.len() > MAX_PAGES { return Err("Notion library exceeds the safe page limit".into()); }
        let blocks = fetch_page_text(&client, &token, &page, &mut queue).await?;
        cached.push(CachedPage { id:page.id, title:page.title, url:page.url,
            chunks:chunk_text(&blocks), last_edited:page.last_edited });
    }
    // A failed/partial fetch leaves the previous offline library intact.
    let mut conn = db(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch("DELETE FROM notion_fts; DELETE FROM notion_chunks; DELETE FROM notion_pages;")
        .map_err(|e| e.to_string())?;
    for page in cached {
        tx.execute("INSERT INTO notion_pages(id,title,url,last_edited,synced_at)
            VALUES(?1,?2,?3,?4,unixepoch())",
            params![page.id,page.title,page.url,page.last_edited])
            .map_err(|e| e.to_string())?;
        for chunk in page.chunks {
            tx.execute("INSERT INTO notion_chunks(page_id,title,content) VALUES(?1,?2,?3)",
                params![page.id,page.title,chunk]).map_err(|e| e.to_string())?;
            let id = tx.last_insert_rowid();
            tx.execute("INSERT INTO notion_fts(rowid,title,content) VALUES(?1,?2,?3)",
                params![id,page.title,chunk]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    status(&app)
}

/// List cached pages without a Notion network call or an integration token.
#[tauri::command]
pub fn notion_cached_pages(app: AppHandle) -> Result<Vec<NotionCachedPage>, String> {
    let conn = db(&app)?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.title, p.url, COUNT(c.id), COALESCE(SUM(length(c.content)),0)
         FROM notion_pages p LEFT JOIN notion_chunks c ON c.page_id=p.id
         GROUP BY p.id ORDER BY p.title COLLATE NOCASE LIMIT 10000"
    ).map_err(|e| e.to_string())?;
    stmt.query_map([], |r| Ok(NotionCachedPage {
        id:r.get(0)?, title:r.get(1)?, url:r.get(2)?,
        chunk_count:r.get(3)?, characters:r.get(4)?
    })).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

/// Read every indexed section of a single explicitly selected page in its
/// original order. Large chapters are processed section-by-section locally,
/// never forced into one 16K-token prompt.
#[tauri::command]
pub fn notion_read_document(app: AppHandle, id: String) -> Result<NotionDocument, String> {
    if !is_id(&id) { return Err("Invalid cached Notion page ID".into()); }
    let conn = db(&app)?;
    let page: Option<(String,String,i64)> = conn.query_row(
        "SELECT title,url,synced_at FROM notion_pages WHERE id=?1",
        params![id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))
    ).optional().map_err(|e| e.to_string())?;
    let (title,url,synced_at) = page.ok_or("That Notion page is not in the synced library")?;
    let mut stmt = conn.prepare(
        "SELECT content FROM notion_chunks WHERE page_id=?1 ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let chunks: Vec<String> = stmt.query_map(params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?;
    if chunks.iter().map(|s| s.len()).sum::<usize>() > 2_000_000 {
        return Err("This page exceeds the local single-document reading limit".into());
    }
    Ok(NotionDocument { id, title, url, synced_at, chunks })
}

fn fts_terms(query: &str) -> String {
    const STOP: &[&str] = &[
        "what","when","where","which","who","why","how","this","that","with","from",
        "about","could","would","should","please","tell","more","think","some","there",
        "have","does","did","was","were","are","the","and","for","you","your",
        "mikan","hey","chapter","book","notes","story","character"
    ];
    let mut seen = HashSet::new();
    query.split(|c:char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|word| word.chars().count()>2 && !STOP.contains(&word.as_str()))
        .filter(|word| seen.insert(word.clone()))
        .take(8).map(|word| format!("\"{word}\"")).collect::<Vec<_>>().join(" OR ")
}

fn query_hits(conn: &Connection, query: &str) -> Result<Vec<NotionHit>, String> {
    let terms = fts_terms(query);
    if terms.is_empty() { return Ok(Vec::new()); }
    // Search more candidates, then cap each page to two excerpts so one
    // repeated chapter title cannot consume the entire context budget.
    let mut stmt = conn.prepare(
        "SELECT c.title,p.url,c.content,p.synced_at,c.page_id
         FROM notion_fts f
         JOIN notion_chunks c ON c.id=f.rowid
         JOIN notion_pages p ON p.id=c.page_id
         WHERE notion_fts MATCH ?1
         ORDER BY bm25(notion_fts, 12.0, 1.0), c.id LIMIT 60"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![terms], |r| Ok((
        NotionHit {
            title:r.get(0)?, url:r.get(1)?, content:r.get(2)?, synced_at:r.get(3)?
        },
        r.get::<_,String>(4)?
    ))).map_err(|e| e.to_string())?;
    let mut hits = Vec::new();
    let mut per_page: HashMap<String,usize> = HashMap::new();
    for row in rows {
        let (hit,id) = row.map_err(|e| e.to_string())?;
        let count = per_page.entry(id).or_default();
        if *count >= 2 { continue; }
        *count += 1;
        hits.push(hit);
        if hits.len() >= 9 { break; }
    }
    Ok(hits)
}

#[tauri::command]
pub fn notion_recall(app: AppHandle, query: String) -> Result<Vec<NotionHit>, String> {
    if query.len() > 3000 { return Err("Notion query too long".into()); }
    query_hits(&db(&app)?, &query)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fts_uses_content_terms_not_prompt_noise() {
        assert_eq!(fts_terms("Hey Mikan, tell me about Charlotte's origin"),
            "\"charlotte\" OR \"origin\"");
        assert_eq!(fts_terms("what about the book?"), "");
    }
    #[test]
    fn recognizes_database_roots_without_treating_them_as_page_blocks() {
        let database=json!({
            "object":"database","id":"4046859f-be62-8108-aeed-fbbd5b61c7d5",
            "title":[{"plain_text":"Charlotte Chapters"}],
            "url":"https://www.notion.so/123",
            "last_edited_time":"2026-11-10T12:00:00Z"
        });
        let root=database_from_json(&database).unwrap();
        assert!(root.is_database);
        assert_eq!(root.title,"Charlotte Chapters");
        assert!(page_from_json(&database).is_none());
    }
    #[test]
    fn chunker_handles_utf8_and_overlap() {
        let blocks = vec!["🐈".repeat(2000)];
        let chunks = chunk_text(&blocks);
        assert!(chunks.len() > 1);
        assert!(chunks[0].contains("🐈"));
        assert!(chunks[1].contains("🐈"));
    }
    #[test]
    fn uuid_validation_rejects_url_injection() {
        assert!(is_id("4046859f-be62-8108-aeed-fbbd5b61c7d5"));
        assert!(!is_id("..%2f..%2f"));
    }
    #[test]
    fn cached_document_preserves_chunk_order_and_bounds() {
        // A chapter may span dozens of chunks. Read all, not a FTS top-five.
        let conn=Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE notion_pages(id TEXT PRIMARY KEY,title TEXT,url TEXT,
                last_edited TEXT,synced_at INTEGER);
             CREATE TABLE notion_chunks(id INTEGER PRIMARY KEY,page_id TEXT,title TEXT,content TEXT);
             CREATE VIRTUAL TABLE notion_fts USING fts5(title,content);"
        ).unwrap();
        conn.execute("INSERT INTO notion_pages VALUES('a','Chapter Three','https://www.notion.so/a','',100)",[]).unwrap();
        for i in 1..=12 {
            conn.execute("INSERT INTO notion_chunks(page_id,title,content) VALUES('a','Chapter Three',?1)",
                params![format!("Scene {i}: narrative content")]).unwrap();
            let rowid=conn.last_insert_rowid();
            conn.execute("INSERT INTO notion_fts(rowid,title,content) VALUES(?1,'Chapter Three',?2)",
                params![rowid,format!("Scene {i}: narrative content")]).unwrap();
        }
        assert_eq!(query_hits(&conn,"Chapter Three").unwrap().len(),2);
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM notion_chunks WHERE page_id='a'",[],|r|r.get::<_,i64>(0)).unwrap(),12);
    }
    #[test]
    fn offline_index_retrieves_sourced_passages() {
        let conn=Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE notion_pages(id TEXT PRIMARY KEY,title TEXT,url TEXT,
                last_edited TEXT,synced_at INTEGER);
             CREATE TABLE notion_chunks(id INTEGER PRIMARY KEY,page_id TEXT,title TEXT,content TEXT);
             CREATE VIRTUAL TABLE notion_fts USING fts5(title,content);"
        ).unwrap();
        conn.execute("INSERT INTO notion_pages VALUES('a','Charlotte','https://www.notion.so/a','',100)",[]).unwrap();
        conn.execute("INSERT INTO notion_chunks VALUES(1,'a','Charlotte','Charlotte and Meridian lore')",[]).unwrap();
        conn.execute("INSERT INTO notion_fts(rowid,title,content) VALUES(1,'Charlotte','Charlotte and Meridian lore')",[]).unwrap();
        assert_eq!(query_hits(&conn,"Charlotte mythology").unwrap().len(),1);
    }
}
