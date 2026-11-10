//! First memory layer: local conversation archive and explicit user facts.
//! Future self-identity / character canon and knowledge live in separate tables.
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, time::Duration};
use tauri::{AppHandle, Manager};

pub(crate) fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create local memory directory: {e}"))?;
    let connection = Connection::open(dir.join("mikan-memory.sqlite3"))
        .map_err(|e| format!("Cannot open memory database: {e}"))?;
    connection.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
    initialize_database(&connection)?;
    Ok(connection)
}

fn initialize_database(connection: &Connection) -> Result<(), String> {
    // Populate the index once when upgrading an existing SQLite archive.
    // Opening the app repeatedly must never rebuild the index.
    let had_search: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='message_search')",
        [], |row| row.get(0)
    ).map_err(|e| e.to_string())?;
    connection.execute_batch(
        "PRAGMA foreign_keys=ON;
         PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS conversations (
           id TEXT PRIMARY KEY,
           title TEXT NOT NULL DEFAULT 'New conversation',
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS messages (
           id TEXT PRIMARY KEY,
           conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
           role TEXT NOT NULL CHECK(role IN ('user','assistant')),
           content TEXT NOT NULL,
           created_at INTEGER NOT NULL,
           metadata_json TEXT NOT NULL DEFAULT '{}'
         );
         CREATE INDEX IF NOT EXISTS idx_messages_conversation
           ON messages(conversation_id, created_at, id);
         CREATE TABLE IF NOT EXISTS session_summaries (
           conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
           summary TEXT NOT NULL,
           last_message_rowid INTEGER NOT NULL,
           updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );
         CREATE INDEX IF NOT EXISTS idx_session_summaries_updated
           ON session_summaries(updated_at DESC);
         CREATE TABLE IF NOT EXISTS user_memories (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           fact TEXT NOT NULL COLLATE NOCASE UNIQUE,
           category TEXT NOT NULL DEFAULT 'other',
           tags_json TEXT NOT NULL DEFAULT '[]',
           created_at INTEGER NOT NULL DEFAULT (unixepoch()),
           updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );
         CREATE TABLE IF NOT EXISTS user_memory_usage (
           memory_id INTEGER PRIMARY KEY REFERENCES user_memories(id) ON DELETE CASCADE,
           importance INTEGER NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
           reference_count INTEGER NOT NULL DEFAULT 0,
           last_accessed INTEGER
         );
         CREATE TABLE IF NOT EXISTS character_facts (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           persona_id TEXT NOT NULL,
           category TEXT NOT NULL CHECK(category IN
             ('favorites','likes','dislikes','hobbies','traits','other')),
           label TEXT NOT NULL,
           normalized_label TEXT NOT NULL,
           value TEXT NOT NULL,
           created_at INTEGER NOT NULL DEFAULT (unixepoch()),
           updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
           UNIQUE(persona_id,normalized_label)
         );
         CREATE INDEX IF NOT EXISTS idx_character_facts_persona
           ON character_facts(persona_id,category,updated_at);
         CREATE TABLE IF NOT EXISTS automatic_memory_sources (
           memory_kind TEXT NOT NULL CHECK(memory_kind IN ('user','character')),
           memory_id INTEGER NOT NULL,
           source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
           captured_at INTEGER NOT NULL DEFAULT (unixepoch()),
           evidence TEXT NOT NULL,
           PRIMARY KEY(memory_kind,memory_id)
         );
         CREATE TABLE IF NOT EXISTS automatic_memory_runs (
           assistant_message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
           processed_at INTEGER NOT NULL DEFAULT (unixepoch())
         );
         -- Search only user-authored messages, never generated assistant text.
         CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(
           content, tokenize='unicode61 remove_diacritics 2'
         );
         CREATE TRIGGER IF NOT EXISTS messages_search_insert AFTER INSERT ON messages
           WHEN new.role='user' BEGIN
             INSERT INTO message_search(rowid,content) VALUES(new.rowid,new.content);
           END;
         CREATE TRIGGER IF NOT EXISTS messages_search_delete AFTER DELETE ON messages
           WHEN old.role='user' BEGIN
             DELETE FROM message_search WHERE rowid=old.rowid;
           END;
         CREATE TRIGGER IF NOT EXISTS messages_search_update AFTER UPDATE ON messages BEGIN
             DELETE FROM message_search WHERE rowid=old.rowid AND old.role='user';
             INSERT INTO message_search(rowid,content)
               SELECT new.rowid,new.content WHERE new.role='user';
           END;"
    ).map_err(|e| format!("Cannot initialize memory database: {e}"))?;
    // Add metadata in place on older databases without disturbing user facts.
    let mut statement=connection.prepare("PRAGMA table_info(user_memories)").map_err(|e| e.to_string())?;
    let columns: Vec<String>=statement.query_map([], |row| row.get(1))
        .map_err(|e| e.to_string())?.collect::<Result<_,_>>().map_err(|e| e.to_string())?;
    drop(statement);
    if !columns.iter().any(|name| name=="category") {
        connection.execute("ALTER TABLE user_memories ADD COLUMN category TEXT NOT NULL DEFAULT 'other'",[])
            .map_err(|e| e.to_string())?;
    }
    if !columns.iter().any(|name| name=="tags_json") {
        connection.execute("ALTER TABLE user_memories ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'",[])
            .map_err(|e| e.to_string())?;
    }
    connection.execute_batch("CREATE INDEX IF NOT EXISTS idx_user_category ON user_memories(category);")
        .map_err(|e| e.to_string())?;
    if !had_search {
        connection.execute(
            "INSERT INTO message_search(rowid,content)
             SELECT rowid,content FROM messages WHERE role='user'", []
        ).map_err(|e| format!("Cannot index existing conversations: {e}"))?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    id: String,
    title: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    id: String,
    role: String,
    content: String,
    created_at: i64,
    metadata_json: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMemory {
    pub(crate) id: i64,
    pub(crate) fact: String,
    pub(crate) category: String,
    pub(crate) tags: Vec<String>,
    created_at: i64,
    updated_at: i64,
    importance: i64,
    reference_count: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMessage {
    id: String,
    role: String,
    content: String,
    created_at: i64,
    metadata_json: String,
}

fn valid_id(id: &str) -> bool {
    id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}

fn clean_fact(value: &str) -> Result<String, String> {
    let fact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if fact.is_empty() || fact.chars().count() > 500 {
        return Err("A memory must contain 1–500 characters".into());
    }
    Ok(fact)
}

const MEMORY_CATEGORIES: &[&str] = &[
    "profile","family","work","projects","interests","preferences","routines","other"
];
fn clean_category(value: &str) -> Result<String, String> {
    let category=value.trim().to_lowercase();
    if MEMORY_CATEGORIES.contains(&category.as_str()) { Ok(category) }
    else { Err("Unknown memory category".into()) }
}
fn clean_tags(tags: &[String]) -> Result<Vec<String>, String> {
    if tags.len()>8 { return Err("Use up to 8 tags per memory".into()); }
    let mut seen=std::collections::HashSet::new();
    let mut result=Vec::new();
    for value in tags {
        let tag=value.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
        if tag.is_empty() || tag.chars().count()>32 ||
            !tag.chars().all(|c| c.is_alphanumeric() || matches!(c,' '|'-'|'_')) {
            return Err("Tags must be 1–32 letters/numbers, spaces, - or _".into());
        }
        if seen.insert(tag.clone()) { result.push(tag); }
    }
    Ok(result)
}
fn read_memory(row: &rusqlite::Row<'_>) -> rusqlite::Result<UserMemory> {
    let tags_json: String=row.get(7)?;
    Ok(UserMemory {
        id:row.get(0)?, fact:row.get(1)?, created_at:row.get(2)?,
        updated_at:row.get(3)?, importance:row.get(4)?,
        reference_count:row.get(5)?, category:row.get(6)?,
        tags:serde_json::from_str(&tags_json).unwrap_or_default()
    })
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct IncomingMemory {
    fact: String,
    #[serde(default="default_category")]
    category: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    pinned: bool,
}
fn default_category() -> String { "other".into() }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct ImportResult { inserted: usize, duplicates: usize }

/// SQLite is authoritative. Import is all-or-nothing and never overwrites
/// an existing memory's text, category, tags or pin.
fn import_memories(db: &mut Connection, incoming: Vec<IncomingMemory>) -> Result<ImportResult, String> {
    if incoming.is_empty() || incoming.len()>1000 {
        return Err("Import 1–1000 facts at a time".into());
    }
    let mut validated=Vec::new();
    for item in incoming {
        validated.push((clean_fact(&item.fact)?,clean_category(&item.category)?,
            serde_json::to_string(&clean_tags(&item.tags)?).map_err(|e|e.to_string())?,item.pinned));
    }
    let tx=db.transaction().map_err(|e|e.to_string())?;
    let old:i64=tx.query_row("SELECT COUNT(*) FROM user_memories",[],|r|r.get(0))
        .map_err(|e|e.to_string())?;
    let (mut inserted,mut duplicates)=(0usize,0usize);
    for (fact,category,tags,pinned) in validated {
        let changed=tx.execute(
            "INSERT OR IGNORE INTO user_memories(fact,category,tags_json) VALUES(?1,?2,?3)",
            params![fact,category,tags]
        ).map_err(|e|e.to_string())?;
        if changed==0 { duplicates+=1; continue; }
        inserted+=1;
        if old+inserted as i64>2000 { return Err("Maximum 2000 stored facts".into()); }
        if pinned {
            tx.execute("INSERT INTO user_memory_usage(memory_id,importance) VALUES(last_insert_rowid(),95)",[])
                .map_err(|e|e.to_string())?;
        }
    }
    tx.commit().map_err(|e|e.to_string())?;
    Ok(ImportResult {inserted,duplicates})
}
#[tauri::command]
pub fn memory_import_facts(app: AppHandle, items: Vec<IncomingMemory>) -> Result<ImportResult, String> {
    import_memories(&mut open_db(&app)?,items)
}
#[tauri::command]
pub fn memory_update_fact_metadata(app: AppHandle, id: i64, category: String, tags: Vec<String>) -> Result<(), String> {
    let category=clean_category(&category)?;
    let tags=serde_json::to_string(&clean_tags(&tags)?).map_err(|e|e.to_string())?;
    let changed=open_db(&app)?.execute(
        "UPDATE user_memories SET category=?1,tags_json=?2,updated_at=unixepoch() WHERE id=?3",
        params![category,tags,id]
    ).map_err(|e|e.to_string())?;
    if changed==0 { return Err("Memory not found".into()); }
    Ok(())
}

#[tauri::command]
pub fn memory_list_conversations(app: AppHandle) -> Result<Vec<Conversation>, String> {
    let db = open_db(&app)?;
    let mut statement = db.prepare(
        "SELECT id,title,created_at,updated_at FROM conversations ORDER BY updated_at DESC LIMIT 200"
    ).map_err(|e| e.to_string())?;
    let rows = statement.query_map([], |row| Ok(Conversation {
        id: row.get(0)?, title: row.get(1)?, created_at: row.get(2)?, updated_at: row.get(3)?
    })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_create_conversation(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_id(&id) { return Err("Invalid conversation ID".into()); }
    let db = open_db(&app)?;
    db.execute(
        "INSERT OR IGNORE INTO conversations(id,title,created_at,updated_at)
         VALUES(?1,'New conversation',unixepoch(),unixepoch())",
        params![id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn memory_list_messages(app: AppHandle, conversation_id: String) -> Result<Vec<StoredMessage>, String> {
    if !valid_id(&conversation_id) { return Err("Invalid conversation ID".into()); }
    let db = open_db(&app)?;
    let mut statement = db.prepare(
        "SELECT id,role,content,created_at,metadata_json FROM messages
         WHERE conversation_id=?1 ORDER BY created_at ASC, rowid ASC LIMIT 10000"
    ).map_err(|e| e.to_string())?;
    let rows = statement.query_map(params![conversation_id], |row| Ok(StoredMessage {
        id: row.get(0)?, role: row.get(1)?, content: row.get(2)?,
        created_at: row.get(3)?, metadata_json: row.get(4)?
    })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_save_message(
    app: AppHandle, conversation_id: String, message: SaveMessage
) -> Result<(), String> {
    if !valid_id(&conversation_id) || !valid_id(&message.id) {
        return Err("Invalid message or conversation ID".into());
    }
    if message.role != "assistant" && message.role != "user" {
        return Err("Invalid message role".into());
    }
    if message.content.len() > 1_000_000 || message.metadata_json.len() > 200_000 {
        return Err("Message is too large for local memory".into());
    }
    // Metadata is optional diagnostics / web citation JSON from the UI, never SQL.
    if !message.metadata_json.is_empty() && serde_json::from_str::<serde_json::Value>(&message.metadata_json).is_err() {
        return Err("Invalid message metadata JSON".into());
    }
    let mut db = open_db(&app)?;
    let transaction = db.transaction().map_err(|e| e.to_string())?;
    let changed = transaction.execute(
        "INSERT INTO messages (id,conversation_id,role,content,created_at,metadata_json)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET content=excluded.content,metadata_json=excluded.metadata_json
         WHERE conversation_id=excluded.conversation_id",
        params![message.id,conversation_id,message.role,message.content,message.created_at,message.metadata_json]
    ).map_err(|e| e.to_string())?;
    if changed == 0 { return Err("Message belongs to a different conversation".into()); }
    if message.role == "user" {
        transaction.execute(
            "UPDATE conversations SET title=CASE WHEN title='New conversation'
              THEN substr(?1,1,70) ELSE title END, updated_at=unixepoch()
              WHERE id=?2",
            params![message.content.trim(),conversation_id]
        ).map_err(|e| e.to_string())?;
    } else {
        transaction.execute(
            "UPDATE conversations SET updated_at=unixepoch() WHERE id=?1",
            params![conversation_id]
        ).map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_delete_conversation(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_id(&id) { return Err("Invalid conversation ID".into()); }
    open_db(&app)?.execute("DELETE FROM conversations WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// A quotation of a past user message; this is episodic context, not a verified fact.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveMemoryHit {
    conversation_id: String,
    title: String,
    content: String,
    created_at: i64,
}

// Build literal FTS5 phrases, not user-supplied MATCH grammar. Even symbols,
// quotes and malformed queries cannot become SQLite query operators.
fn message_search_terms(query: &str) -> String {
    const STOP: &[&str] = &[
        "the","and","that","this","with","about","from","what","when","where",
        "which","would","could","should","have","been","your","mine","ours",
        "remember","earlier","before","after","please","help","want","need",
        "talked","discussed","conversation","last","time","said","tell","told",
        "something","anything","there","here","some","just","again","more",
        "can","you","are","was","were","for","our","how","did","does","she",
        "her","his","not","why","who","all","but","now","any"
    ];
    let mut unique = std::collections::HashSet::new();
    query.split(|c: char| !c.is_alphanumeric())
        .map(|term| term.to_lowercase())
        .filter(|term| (term.chars().count() >= 3
                       || (term.chars().count() >= 2 && term.chars().all(|c| c.is_ascii_digit())))
                       && !STOP.contains(&term.as_str()))
        .filter(|term| unique.insert(term.clone()))
        .take(8)
        .map(|term| format!(r#""{term}""#))
        .collect::<Vec<_>>().join(" OR ")
}

fn find_archive_messages(
    db: &Connection, query: &str, exclude_conversation: &str
) -> Result<Vec<ArchiveMemoryHit>, String> {
    if query.chars().count() > 800 { return Ok(vec![]); }
    let terms = message_search_terms(query);
    if terms.is_empty() { return Ok(vec![]); }
    let mut statement = db.prepare(
        "SELECT m.conversation_id,c.title,substr(m.content,1,500),m.created_at
         FROM message_search JOIN messages m ON m.rowid=message_search.rowid
         JOIN conversations c ON c.id=m.conversation_id
         WHERE message_search MATCH ?1 AND m.role='user'
           AND m.conversation_id<>?2
         ORDER BY bm25(message_search),m.created_at DESC LIMIT 16"
    ).map_err(|e| e.to_string())?;
    let rows = statement.query_map(params![terms,exclude_conversation], |row| Ok(ArchiveMemoryHit {
        conversation_id:row.get(0)?, title:row.get(1)?,
        content:row.get(2)?, created_at:row.get(3)?
    })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_search_archive(
    app: AppHandle, query: String, exclude_conversation: String
) -> Result<Vec<ArchiveMemoryHit>, String> {
    if !valid_id(&exclude_conversation) { return Err("Invalid conversation ID".into()); }
    find_archive_messages(&open_db(&app)?,&query,&exclude_conversation)
}

#[tauri::command]
pub fn memory_list_facts(app: AppHandle) -> Result<Vec<UserMemory>, String> {
    let db = open_db(&app)?;
    let mut statement = db.prepare(
        "SELECT m.id,m.fact,m.created_at,m.updated_at,
                COALESCE(u.importance,50),COALESCE(u.reference_count,0),m.category,m.tags_json
         FROM user_memories m LEFT JOIN user_memory_usage u ON m.id=u.memory_id
         ORDER BY m.updated_at DESC,m.id DESC LIMIT 2000"
    ).map_err(|e| e.to_string())?;
    let rows = statement.query_map([], read_memory).map_err(|e|e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_add_fact(app: AppHandle, fact: String) -> Result<UserMemory, String> {
    let fact = clean_fact(&fact)?;
    let db = open_db(&app)?;
    db.execute(
        "INSERT INTO user_memories(fact) VALUES(?1)
         ON CONFLICT(fact) DO UPDATE SET updated_at=unixepoch()",
        params![fact]
    ).map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT m.id,m.fact,m.created_at,m.updated_at,
                COALESCE(u.importance,50),COALESCE(u.reference_count,0),m.category,m.tags_json
         FROM user_memories m LEFT JOIN user_memory_usage u ON m.id=u.memory_id
         WHERE m.fact=?1 COLLATE NOCASE",
        params![fact], read_memory
    ).optional().map_err(|e| e.to_string())?
        .ok_or_else(|| "Could not read saved memory".to_string())
}

#[tauri::command]
pub fn memory_update_fact(app: AppHandle, id: i64, fact: String) -> Result<(), String> {
    let fact = clean_fact(&fact)?;
    let changed = open_db(&app)?.execute(
        "UPDATE user_memories SET fact=?1,updated_at=unixepoch() WHERE id=?2",
        params![fact,id]
    ).map_err(|e| e.to_string())?;
    if changed == 0 { return Err("Memory not found".into()); }
    Ok(())
}

#[tauri::command]
pub fn memory_delete_fact(app: AppHandle, id: i64) -> Result<(), String> {
    open_db(&app)?.execute("DELETE FROM user_memories WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}


/// Record which stored facts actually entered an answered prompt. A capped
/// usage bonus is used for later recall; deleted records cannot be recreated.
fn mark_recalled(db: &Connection, ids: &[i64]) -> Result<(), String> {
    let mut unique = std::collections::HashSet::new();
    for id in ids.iter().copied().take(20) {
        if id <= 0 || !unique.insert(id) { continue; }
        db.execute(
            "INSERT INTO user_memory_usage(memory_id,reference_count,last_accessed)
             SELECT id,1,unixepoch() FROM user_memories WHERE id=?1
             ON CONFLICT(memory_id) DO UPDATE
             SET reference_count=MIN(10000,user_memory_usage.reference_count+1),
                 last_accessed=unixepoch()",
            params![id]
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn memory_mark_recalled(app: AppHandle, ids: Vec<i64>) -> Result<(), String> {
    mark_recalled(&open_db(&app)?, &ids)
}

/// Optional owner-selected core-profile importance. This is deterministic,
/// never inferred from untrusted web content or silently overwritten by Mem0.
fn set_importance(db: &Connection, id: i64, pinned: bool) -> Result<(), String> {
    if id <= 0 { return Err("Invalid memory ID".into()); }
    let importance = if pinned {95} else {50};
    let changed = db.execute(
        "INSERT INTO user_memory_usage(memory_id,importance)
         SELECT id,?2 FROM user_memories WHERE id=?1
         ON CONFLICT(memory_id) DO UPDATE SET importance=excluded.importance",
        params![id,importance]
    ).map_err(|e| e.to_string())?;
    if changed==0 { return Err("Memory no longer exists".into()); }
    Ok(())
}

#[tauri::command]
pub fn memory_pin_fact(app: AppHandle, id: i64, pinned: bool) -> Result<(), String> {
    set_importance(&open_db(&app)?,id,pinned)
}

/// Canon facts are Mikan's fictional self-description, never user facts or webpage knowledge.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterFact {
    id: i64,
    persona_id: String,
    category: String,
    label: String,
    value: String,
    created_at: i64,
    updated_at: i64,
}

fn valid_persona_id(persona_id: &str) -> bool {
    !persona_id.is_empty() && persona_id.len() <= 64 &&
    persona_id.bytes().all(|byte| byte.is_ascii_lowercase() ||
        byte.is_ascii_digit() || byte == b'_' || byte == b'-')
}

fn clean_character_label(label: &str) -> Result<String, String> {
    let clean = label.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.is_empty() || clean.chars().count() > 80 {
        return Err("Character detail names must be 1–80 characters".into());
    }
    Ok(clean)
}

fn clean_character_value(value: &str) -> Result<String, String> {
    let clean = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.is_empty() || clean.chars().count() > 500 {
        return Err("Character detail values must be 1–500 characters".into());
    }
    Ok(clean)
}

fn valid_character_category(category: &str) -> bool {
    matches!(category, "favorites" | "likes" | "dislikes" | "hobbies" | "traits" | "other")
}

fn read_character_fact(row: &rusqlite::Row<'_>) -> rusqlite::Result<CharacterFact> {
    Ok(CharacterFact {
        id: row.get(0)?, persona_id: row.get(1)?, category: row.get(2)?,
        label: row.get(3)?, value: row.get(4)?,
        created_at: row.get(5)?, updated_at: row.get(6)?
    })
}

#[tauri::command]
pub fn memory_list_character_facts(app: AppHandle, persona_id: String) -> Result<Vec<CharacterFact>, String> {
    if !valid_persona_id(&persona_id) { return Err("Invalid persona ID".into()); }
    let db = open_db(&app)?;
    let mut statement = db.prepare(
        "SELECT id,persona_id,category,label,value,created_at,updated_at
         FROM character_facts WHERE persona_id=?1
         ORDER BY category ASC, label COLLATE NOCASE ASC LIMIT 500"
    ).map_err(|e| e.to_string())?;
    let rows = statement.query_map(params![persona_id], read_character_fact).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_add_character_fact(
    app: AppHandle, persona_id: String, category: String, label: String, value: String
) -> Result<CharacterFact, String> {
    if !valid_persona_id(&persona_id) { return Err("Invalid persona ID".into()); }
    if !valid_character_category(&category) { return Err("Invalid character category".into()); }
    let label = clean_character_label(&label)?;
    let value = clean_character_value(&value)?;
    let normalized = label.to_lowercase();
    let db = open_db(&app)?;
    db.execute(
        "INSERT INTO character_facts (persona_id,category,label,normalized_label,value)
         VALUES (?1,?2,?3,?4,?5)",
        params![persona_id,category,label,normalized,value]
    ).map_err(|error| {
        if matches!(&error, rusqlite::Error::SqliteFailure(e, _)
            if e.code == rusqlite::ErrorCode::ConstraintViolation) {
            "That character detail already exists. Edit its existing entry instead.".to_string()
        } else { error.to_string() }
    })?;
    db.query_row(
        "SELECT id,persona_id,category,label,value,created_at,updated_at
         FROM character_facts WHERE persona_id=?1 AND normalized_label=?2",
        params![persona_id, normalized], read_character_fact
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_update_character_fact(
    app: AppHandle, id: i64, persona_id: String, category: String, label: String, value: String
) -> Result<(), String> {
    if !valid_persona_id(&persona_id) { return Err("Invalid persona ID".into()); }
    if !valid_character_category(&category) { return Err("Invalid character category".into()); }
    let label = clean_character_label(&label)?;
    let value = clean_character_value(&value)?;
    let normalized = label.to_lowercase();
    let changed = open_db(&app)?.execute(
        "UPDATE character_facts SET category=?1,label=?2,normalized_label=?3,
         value=?4,updated_at=unixepoch() WHERE id=?5 AND persona_id=?6",
        params![category,label,normalized,value,id,persona_id]
    ).map_err(|e| e.to_string())?;
    if changed == 0 { return Err("Character detail not found".into()); }
    Ok(())
}

#[tauri::command]
pub fn memory_delete_character_fact(app: AppHandle, id: i64, persona_id: String) -> Result<(), String> {
    if !valid_persona_id(&persona_id) { return Err("Invalid persona ID".into()); }
    let changed = open_db(&app)?.execute(
        "DELETE FROM character_facts WHERE id=?1 AND persona_id=?2", params![id,persona_id]
    ).map_err(|e| e.to_string())?;
    if changed == 0 { return Err("Character detail not found".into()); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn referenced_and_pinned_facts_are_persistent_and_cascade_on_delete() {
        let db=Connection::open_in_memory().unwrap();
        initialize_database(&db).unwrap();
        db.execute("INSERT INTO user_memories(fact) VALUES ('The user is a WordPress developer')", []).unwrap();
        let id=db.last_insert_rowid();
        mark_recalled(&db,&[id,id,99999]).unwrap(); // no duplicate or resurrection
        set_importance(&db,id,true).unwrap();
        let (importance,count):(i64,i64)=db.query_row(
            "SELECT importance,reference_count FROM user_memory_usage WHERE memory_id=?1",
            params![id],|r| Ok((r.get(0)?,r.get(1)?))
        ).unwrap();
        assert_eq!((importance,count),(95,1));
        set_importance(&db,id,false).unwrap();
        let importance:i64=db.query_row("SELECT importance FROM user_memory_usage WHERE memory_id=?1",
            params![id],|r| r.get(0)).unwrap();
        assert_eq!(importance,50);
        db.execute("DELETE FROM user_memories WHERE id=?1",params![id]).unwrap();
        let metadata_count:i64=db.query_row("SELECT COUNT(*) FROM user_memory_usage",[],|r|r.get(0)).unwrap();
        assert_eq!(metadata_count,0);
        assert!(set_importance(&db,id,true).is_err());
    }

    #[test]
    fn import_is_atomic_and_deduplicates_without_overwriting_pins() {
        let mut db=Connection::open_in_memory().unwrap();
        initialize_database(&db).unwrap();
        db.execute("INSERT INTO user_memories(fact) VALUES('Likes Metal')",[]).unwrap();
        let existing=db.last_insert_rowid();
        set_importance(&db,existing,true).unwrap();
        let result=import_memories(&mut db,vec![
            IncomingMemory {fact:"likes metal".into(),category:"interests".into(),tags:vec![],pinned:false},
            IncomingMemory {fact:"Writes original songs".into(),category:"interests".into(),tags:vec!["music".into()],pinned:true},
            IncomingMemory {fact:"writes original songs".into(),category:"other".into(),tags:vec![],pinned:false}
        ]).unwrap();
        assert_eq!((result.inserted,result.duplicates),(1,2));
        let (category,tags,importance):(String,String,i64)=db.query_row(
            "SELECT m.category,m.tags_json,u.importance FROM user_memories m JOIN user_memory_usage u ON m.id=u.memory_id WHERE m.fact='Writes original songs'",[],
            |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
        assert_eq!((category.as_str(),tags.as_str(),importance),("interests",r#"["music"]"#,95));
        let original:i64=db.query_row("SELECT importance FROM user_memory_usage WHERE memory_id=?1",params![existing],|r|r.get(0)).unwrap();
        assert_eq!(original,95);
        assert!(import_memories(&mut db,vec![
            IncomingMemory {fact:"Valid".into(),category:"work".into(),tags:vec![],pinned:false},
            IncomingMemory {fact:" ".into(),category:"work".into(),tags:vec![],pinned:false}
        ]).is_err());
        let count:i64=db.query_row("SELECT COUNT(*) FROM user_memories",[],|r|r.get(0)).unwrap();
        assert_eq!(count,2);
    }
    #[test]
    fn legacy_user_memories_migrate_without_loss() {
        let db=Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE user_memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT, fact TEXT NOT NULL COLLATE NOCASE UNIQUE,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
          ); INSERT INTO user_memories(fact) VALUES('Existing fact');").unwrap();
        initialize_database(&db).unwrap();
        initialize_database(&db).unwrap();
        let row:(String,String,String)=db.query_row(
            "SELECT fact,category,tags_json FROM user_memories WHERE id=1",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
        assert_eq!(row,("Existing fact".into(),"other".into(),"[]".into()));
        assert!(clean_category("untrusted-instructions").is_err());
    }
    #[test]
    fn memory_facts_are_normalized_and_bounded() {
        assert_eq!(clean_fact("  I   love   metal  ").unwrap(), "I love metal");
        assert!(clean_fact("   ").is_err());
        assert!(clean_fact(&"x".repeat(501)).is_err());
        assert!(valid_id("123e4567-e89b-12d3-a456-426614174000"));
        assert!(!valid_id("../secrets"));
    }

    #[test]
    fn archive_schema_supports_cascading_deletion_and_deduplication() {
        let db = Connection::open_in_memory().unwrap();
        initialize_database(&db).unwrap();
        db.execute(
            "INSERT INTO conversations(id,title,created_at,updated_at) VALUES('chat','test',1,1)", []
        ).unwrap();
        db.execute(
            "INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES('msg','chat','user','hello',1)", []
        ).unwrap();
        db.execute("INSERT INTO user_memories(fact) VALUES('Likes orange')", []).unwrap();
        // The saved fact is case-insensitive unique.
        assert!(db.execute("INSERT INTO user_memories(fact) VALUES('likes ORANGE')", []).is_err());
        db.execute("DELETE FROM conversations WHERE id='chat'", []).unwrap();
        let messages: i64 = db.query_row("SELECT COUNT(*) FROM messages", [], |r| r.get(0)).unwrap();
        let facts: i64 = db.query_row("SELECT COUNT(*) FROM user_memories", [], |r| r.get(0)).unwrap();
        assert_eq!(messages, 0);
        assert_eq!(facts, 1); // Deleting chat never deletes explicit personal memory.
    }

    #[test]
    fn character_canon_is_independent_and_persona_scoped() {
        let db = Connection::open_in_memory().unwrap();
        initialize_database(&db).unwrap();
        db.execute("INSERT INTO user_memories(fact) VALUES ('The user loves black metal')", []).unwrap();

        let insert = "INSERT INTO character_facts
          (persona_id,category,label,normalized_label,value) VALUES (?1,?2,?3,?4,?5)";
        db.execute(insert, params!["mikan","favorites","Favorite music","favorite music","Synthwave"]).unwrap();
        db.execute(insert, params!["another","favorites","Favorite music","favorite music","Jazz"]).unwrap();
        assert!(db.execute(insert, params!["mikan","favorites","favorite MUSIC","favorite music","Black metal"]).is_err());

        let mikan: String = db.query_row(
            "SELECT value FROM character_facts WHERE persona_id='mikan' AND normalized_label='favorite music'",
            [], |row| row.get(0)
        ).unwrap();
        let other: String = db.query_row(
            "SELECT value FROM character_facts WHERE persona_id='another' AND normalized_label='favorite music'",
            [], |row| row.get(0)
        ).unwrap();
        assert_eq!(mikan, "Synthwave");
        assert_eq!(other, "Jazz");
        db.execute("DELETE FROM character_facts WHERE persona_id='mikan'", []).unwrap();
        let user_count: i64 = db.query_row("SELECT COUNT(*) FROM user_memories", [], |row| row.get(0)).unwrap();
        let other_count: i64 = db.query_row("SELECT COUNT(*) FROM character_facts WHERE persona_id='another'", [], |row| row.get(0)).unwrap();
        assert_eq!(user_count, 1);
        assert_eq!(other_count, 1);
    }

    #[test]
    fn character_canon_validates_types_and_can_migrate_existing_data() {
        let db = Connection::open_in_memory().unwrap();
        initialize_database(&db).unwrap();
        db.execute("INSERT INTO user_memories(fact) VALUES('Loves games')", []).unwrap();
        initialize_database(&db).unwrap(); // Upgrading should not wipe an earlier memory.
        let count: i64 = db.query_row("SELECT COUNT(*) FROM user_memories", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 1);
        assert!(valid_persona_id("mikan"));
        assert!(!valid_persona_id("../mikan"));
        assert_eq!(clean_character_label(" Favorite   color ").unwrap(), "Favorite color");
        assert!(clean_character_label("").is_err());
        assert!(clean_character_value(&"x".repeat(501)).is_err());
        assert!(valid_character_category("favorites"));
        assert!(!valid_character_category("instructions"));
    }

    #[test]
    fn archive_fts_searches_only_user_messages_and_tracks_changes() {
        let db=Connection::open_in_memory().unwrap();
        initialize_database(&db).unwrap();
        db.execute("INSERT INTO conversations(id,title,created_at,updated_at) VALUES('older','My site',1,1)",[]).unwrap();
        db.execute("INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES('u','older','user','I use WordPress for my websites',10)",[]).unwrap();
        db.execute("INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES('a','older','assistant','SuperSecretImaginedFacts',11)",[]).unwrap();
        let found=find_archive_messages(&db,"WordPress websites","current").unwrap();
        assert_eq!(found.len(),1);
        assert!(found[0].content.contains("WordPress"));
        assert!(find_archive_messages(&db,"SuperSecretImaginedFacts","current").unwrap().is_empty());
        assert!(find_archive_messages(&db,"WordPress","older").unwrap().is_empty());
        db.execute("UPDATE messages SET content='I now use Astro for websites' WHERE id='u'",[]).unwrap();
        assert!(find_archive_messages(&db,"WordPress","current").unwrap().is_empty());
        assert_eq!(find_archive_messages(&db,"Astro","current").unwrap().len(),1);
        db.execute("DELETE FROM conversations WHERE id='older'",[]).unwrap();
        assert!(find_archive_messages(&db,"Astro","current").unwrap().is_empty());
    }

    #[test]
    fn archive_search_migrates_old_messages_once_without_duplicates() {
        let db=Connection::open_in_memory().unwrap();
        db.execute_batch("PRAGMA foreign_keys=ON;
          CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT,created_at INTEGER,updated_at INTEGER);
          CREATE TABLE messages(id TEXT PRIMARY KEY,conversation_id TEXT,role TEXT,content TEXT,created_at INTEGER,metadata_json TEXT);
          INSERT INTO conversations VALUES('prior','Past talk',1,1);
          INSERT INTO messages VALUES('m','prior','user','I configured Vivaldi tab stacks',1,'{}');").unwrap();
        initialize_database(&db).unwrap();
        initialize_database(&db).unwrap();
        assert_eq!(find_archive_messages(&db,"Vivaldi","active").unwrap().len(),1);
        assert!(message_search_terms("WordPress \" OR injection").contains("wordpress"));
        assert_eq!(message_search_terms("??? ???"),"");
    }


}
