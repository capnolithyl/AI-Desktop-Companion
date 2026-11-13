//! First memory layer: local conversation archive and explicit user facts.
//! Future self-identity / character canon and knowledge live in separate tables.
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path, time::{Duration, SystemTime, UNIX_EPOCH}};
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

pub(crate) fn initialize_database(connection: &Connection) -> Result<(), String> {
    // Populate the index once when upgrading an existing SQLite archive.
    // Opening the app repeatedly must never rebuild the index.
    let had_search: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='message_search')",
        [], |row| row.get(0)
    ).map_err(|e| e.to_string())?;
    let had_fact_search: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_memory_search')",
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
         -- Local lexical recall stays available while the optional embedding index syncs.
         CREATE VIRTUAL TABLE IF NOT EXISTS user_memory_search USING fts5(
           fact, category, tags, tokenize='unicode61 remove_diacritics 2'
         );
         CREATE TRIGGER IF NOT EXISTS user_memory_search_insert AFTER INSERT ON user_memories BEGIN
           INSERT INTO user_memory_search(rowid,fact,category,tags)
             VALUES(new.id,new.fact,new.category,new.tags_json);
         END;
         CREATE TRIGGER IF NOT EXISTS user_memory_search_delete AFTER DELETE ON user_memories BEGIN
           DELETE FROM user_memory_search WHERE rowid=old.id;
         END;
         CREATE TRIGGER IF NOT EXISTS user_memory_search_update AFTER UPDATE ON user_memories BEGIN
           DELETE FROM user_memory_search WHERE rowid=old.id;
           INSERT INTO user_memory_search(rowid,fact,category,tags)
             VALUES(new.id,new.fact,new.category,new.tags_json);
         END;
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
         -- Owner-curated media and interest records, independent of core facts.
         CREATE TABLE IF NOT EXISTS interest_items (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           name TEXT NOT NULL COLLATE NOCASE,
           kind TEXT NOT NULL CHECK(kind IN ('band','album','song','anime','show','movie','game','book','other')),
           status TEXT NOT NULL CHECK(status IN
             ('favorite','like','dislike','interested','experienced','unknown')),
           rating REAL CHECK(rating IS NULL OR rating BETWEEN 0 AND 10),
           notes TEXT NOT NULL DEFAULT '',
           tags_json TEXT NOT NULL DEFAULT '[]',
           source TEXT NOT NULL DEFAULT 'manual',
           source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
           source_quote TEXT NOT NULL DEFAULT '',
           created_at INTEGER NOT NULL DEFAULT (unixepoch()),
           updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
           UNIQUE(kind,name)
         );
         CREATE INDEX IF NOT EXISTS idx_interest_kind_status ON interest_items(kind,status);
         CREATE VIRTUAL TABLE IF NOT EXISTS interest_search USING fts5(
           name,kind,status,notes,tags,tokenize='unicode61 remove_diacritics 2'
         );
         CREATE TRIGGER IF NOT EXISTS interest_search_insert AFTER INSERT ON interest_items BEGIN
           INSERT INTO interest_search(rowid,name,kind,status,notes,tags)
             VALUES(new.id,new.name,new.kind,new.status,new.notes,new.tags_json);
         END;
         CREATE TRIGGER IF NOT EXISTS interest_search_delete AFTER DELETE ON interest_items BEGIN
           DELETE FROM interest_search WHERE rowid=old.id;
         END;
         CREATE TRIGGER IF NOT EXISTS interest_search_update AFTER UPDATE ON interest_items BEGIN
           DELETE FROM interest_search WHERE rowid=old.id;
           INSERT INTO interest_search(rowid,name,kind,status,notes,tags)
             VALUES(new.id,new.name,new.kind,new.status,new.notes,new.tags_json);
         END;
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
         -- Jobs retain only message references and model settings. Conversation
         -- deletion cascades into queued work, preventing memory resurrection.
         CREATE TABLE IF NOT EXISTS automatic_memory_jobs (
           assistant_message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
           user_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
           conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
           endpoint TEXT NOT NULL,
           model TEXT NOT NULL,
           context_window INTEGER,
           capture_user INTEGER NOT NULL CHECK(capture_user IN (0,1)),
           capture_character INTEGER NOT NULL CHECK(capture_character IN (0,1)),
           status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','failed')),
           attempts INTEGER NOT NULL DEFAULT 0,
           retry_after INTEGER NOT NULL DEFAULT 0,
           last_error TEXT,
           created_at INTEGER NOT NULL DEFAULT (unixepoch()),
           updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );
         CREATE INDEX IF NOT EXISTS idx_automatic_memory_jobs_due
           ON automatic_memory_jobs(status,retry_after,created_at);
         -- Corrections are suggestions, not automatic changes. A review is
         -- never injected as a current fact until the owner explicitly acts.
         CREATE TABLE IF NOT EXISTS memory_fact_reviews (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           existing_memory_id INTEGER REFERENCES user_memories(id) ON DELETE SET NULL,
           existing_fact TEXT,
           proposed_fact TEXT NOT NULL,
           evidence TEXT NOT NULL,
           source_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
           status TEXT NOT NULL DEFAULT 'pending'
             CHECK(status IN ('pending','replaced','saved','dismissed')),
           created_at INTEGER NOT NULL DEFAULT (unixepoch()),
           resolved_at INTEGER,
           UNIQUE(source_message_id, proposed_fact COLLATE NOCASE)
         );
         CREATE INDEX IF NOT EXISTS idx_memory_fact_reviews_pending
           ON memory_fact_reviews(status,created_at);
         CREATE TABLE IF NOT EXISTS memory_fact_history (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           memory_id INTEGER NOT NULL REFERENCES user_memories(id) ON DELETE CASCADE,
           previous_fact TEXT NOT NULL,
           replacement_fact TEXT NOT NULL,
           previous_source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
           previous_evidence TEXT,
           change_source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
           change_evidence TEXT NOT NULL,
           changed_at INTEGER NOT NULL DEFAULT (unixepoch())
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
    // Allow corrections to target older interest records without migrating or deleting them.
    let mut s=connection.prepare("PRAGMA table_info(memory_fact_reviews)").map_err(|e|e.to_string())?;
    let names=s.query_map([],|r|r.get::<_,String>(1)).map_err(|e|e.to_string())?
        .collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    drop(s);
    if !names.iter().any(|n|n=="existing_interest_id") {
        connection.execute("ALTER TABLE memory_fact_reviews ADD COLUMN existing_interest_id INTEGER REFERENCES interest_items(id) ON DELETE SET NULL",[]).map_err(|e|e.to_string())?;
    }
    let mut s=connection.prepare("PRAGMA table_info(automatic_memory_runs)").map_err(|e|e.to_string())?;
    let names=s.query_map([],|r|r.get::<_,String>(1)).map_err(|e|e.to_string())?
        .collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    drop(s);
    for column in ["user_saved","character_saved","interests_saved","review_queued","outcome_known"] {
        if !names.iter().any(|n|n==column) {
            connection.execute(&format!("ALTER TABLE automatic_memory_runs ADD COLUMN {column} INTEGER NOT NULL DEFAULT 0"),[]).map_err(|e|e.to_string())?;
        }
    }
    if !had_search {
        connection.execute(
            "INSERT INTO message_search(rowid,content)
             SELECT rowid,content FROM messages WHERE role='user'", []
        ).map_err(|e| format!("Cannot index existing conversations: {e}"))?;
    }
    if !had_fact_search {
        connection.execute(
            "INSERT INTO user_memory_search(rowid,fact,category,tags)
             SELECT id,fact,category,tags_json FROM user_memories", []
        ).map_err(|e| format!("Cannot index saved facts: {e}"))?;
    }
    migrate_interest_song_kind(connection)?;
    Ok(())
}

/// SQLite cannot ALTER an existing CHECK constraint, so older interest
/// catalogs must be rebuilt once. Preserve all IDs, metadata and review FKs.
/// Trigger/index recreation keeps the existing FTS5 rowids usable unchanged.
fn migrate_interest_song_kind(db:&Connection)->Result<(),String>{
    let schema:String=db.query_row(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='interest_items'",
        [],|r|r.get(0)
    ).map_err(|e|e.to_string())?;
    if schema.contains("'song'"){return Ok(());}
    let old_sequence:Option<i64>=db.query_row(
        "SELECT seq FROM sqlite_sequence WHERE name='interest_items'",[],
        |r|r.get(0)
    ).optional().map_err(|e|e.to_string())?;
    let migrated=db.execute_batch(
        "PRAGMA foreign_keys=OFF;
         BEGIN IMMEDIATE;
         DROP TRIGGER IF EXISTS interest_search_insert;
         DROP TRIGGER IF EXISTS interest_search_delete;
         DROP TRIGGER IF EXISTS interest_search_update;
         CREATE TABLE interest_items_song_migration (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           name TEXT NOT NULL COLLATE NOCASE,
           kind TEXT NOT NULL CHECK(kind IN
             ('band','album','song','anime','show','movie','game','book','other')),
           status TEXT NOT NULL CHECK(status IN
             ('favorite','like','dislike','interested','experienced','unknown')),
           rating REAL CHECK(rating IS NULL OR rating BETWEEN 0 AND 10),
           notes TEXT NOT NULL DEFAULT '',
           tags_json TEXT NOT NULL DEFAULT '[]',
           source TEXT NOT NULL DEFAULT 'manual',
           source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
           source_quote TEXT NOT NULL DEFAULT '',
           created_at INTEGER NOT NULL DEFAULT (unixepoch()),
           updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
           UNIQUE(kind,name)
         );
         INSERT INTO interest_items_song_migration
           (id,name,kind,status,rating,notes,tags_json,source,
            source_message_id,source_quote,created_at,updated_at)
           SELECT id,name,kind,status,rating,notes,tags_json,source,
                  source_message_id,source_quote,created_at,updated_at
           FROM interest_items;
         DROP TABLE interest_items;
         ALTER TABLE interest_items_song_migration RENAME TO interest_items;
         CREATE INDEX idx_interest_kind_status ON interest_items(kind,status);
         CREATE TRIGGER interest_search_insert AFTER INSERT ON interest_items BEGIN
           INSERT INTO interest_search(rowid,name,kind,status,notes,tags)
             VALUES(new.id,new.name,new.kind,new.status,new.notes,new.tags_json);
         END;
         CREATE TRIGGER interest_search_delete AFTER DELETE ON interest_items BEGIN
           DELETE FROM interest_search WHERE rowid=old.id;
         END;
         CREATE TRIGGER interest_search_update AFTER UPDATE ON interest_items BEGIN
           DELETE FROM interest_search WHERE rowid=old.id;
           INSERT INTO interest_search(rowid,name,kind,status,notes,tags)
             VALUES(new.id,new.name,new.kind,new.status,new.notes,new.tags_json);
         END;
         COMMIT;
         PRAGMA foreign_keys=ON;"
    );
    if let Err(error)=migrated {
        let _=db.execute_batch("ROLLBACK; PRAGMA foreign_keys=ON;");
        return Err(format!("Could not upgrade interest song category: {error}"));
    }
    if let Some(seq)=old_sequence {
        db.execute("UPDATE sqlite_sequence SET seq=MAX(seq,?1) WHERE name='interest_items'",
            params![seq]).map_err(|e|e.to_string())?;
    }
    // Some earlier extractors filed explicit tracks as albums because "song"
    // was not a supported kind. Repair only automatically captured entries
    // whose own source quotation unambiguously says song/track (never imports).
    // Keep their IDs, notes, source, status and existing review references.
    db.execute(
        "UPDATE interest_items SET kind='song',updated_at=unixepoch()
         WHERE kind='album' AND source='conversation'
           AND (
             (instr(lower(source_quote),lower(name))>0
               AND (instr(' '||lower(source_quote)||' ',' song ')>0
                 OR instr(' '||lower(source_quote)||' ',' track ')>0)
               AND instr(' '||lower(source_quote)||' ',' album ')=0)
             OR EXISTS (
               SELECT 1 FROM messages m
               WHERE m.id=interest_items.source_message_id AND m.role='user'
                 AND instr(lower(m.content),lower(interest_items.name))>0
                 AND (instr(' '||lower(m.content)||' ',' song ')>0
                   OR instr(' '||lower(m.content)||' ',' track ')>0)
                 AND instr(' '||lower(m.content)||' ',' album ')=0
             )
           )
           AND NOT EXISTS (
             SELECT 1 FROM interest_items existing
             WHERE existing.kind='song' AND existing.name=interest_items.name
           )",[]
    ).map_err(|e|format!("Could not recover explicitly labeled songs: {e}"))?;
    let broken:Option<String>=db.query_row("PRAGMA foreign_key_check",[],|r|r.get(0))
        .optional().map_err(|e|e.to_string())?;
    if let Some(table)=broken{return Err(format!("Interest migration left invalid foreign keys in {table}"));}
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
    if incoming.is_empty() || incoming.len()>2000 {
        return Err("Import 1–2000 facts at a time".into());
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

// BM25-ranked lexical memory candidates, separate from conversation history.
pub(crate) fn find_fact_ids(db: &Connection, query: &str) -> Result<Vec<i64>, String> {
    if query.chars().count() > 800 { return Ok(vec![]); }
    let terms = message_search_terms(query);
    if terms.is_empty() { return Ok(vec![]); }
    let mut statement = db.prepare(
        "SELECT rowid FROM user_memory_search WHERE user_memory_search MATCH ?1
         ORDER BY bm25(user_memory_search) LIMIT 32"
    ).map_err(|e| e.to_string())?;
    let matches = statement.query_map(params![terms], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    matches.collect::<Result<Vec<i64>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_search_fact_ids(app: AppHandle, query: String) -> Result<Vec<i64>, String> {
    find_fact_ids(&open_db(&app)?, &query)
}

#[tauri::command]
pub fn memory_search_archive(
    app: AppHandle, query: String, exclude_conversation: String
) -> Result<Vec<ArchiveMemoryHit>, String> {
    if !valid_id(&exclude_conversation) { return Err("Invalid conversation ID".into()); }
    find_archive_messages(&open_db(&app)?,&query,&exclude_conversation)
}

fn list_user_facts(db: &Connection) -> Result<Vec<UserMemory>, String> {
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
pub fn memory_list_facts(app: AppHandle) -> Result<Vec<UserMemory>, String> {
    list_user_facts(&open_db(&app)?)
}

/// Round-trip JSON is accepted by the existing bulk importer. Historical IDs,
/// timestamps and recall counts are included as inspection metadata.
fn export_user_facts(db: &Connection) -> Result<(String, usize), String> {
    let facts = list_user_facts(db)?;
    let memories = facts.iter().map(|fact| serde_json::json!({
        "id": fact.id, "fact": fact.fact, "category": fact.category,
        "tags": fact.tags, "pinned": fact.importance >= 90,
        "importance": fact.importance, "referenceCount": fact.reference_count,
        "createdAt": fact.created_at, "updatedAt": fact.updated_at
    })).collect::<Vec<_>>();
    let text = serde_json::to_string_pretty(&serde_json::json!({
        "schema": "mikan-user-memories", "version": 1, "memories": memories
    })).map_err(|e| e.to_string())?;
    Ok((text, facts.len()))
}

/// Never overwrite an existing backup. A failed write aborts replacement.
fn save_user_facts_json(dir: &Path, text: &str) -> Result<String, String> {
    fs::create_dir_all(dir).map_err(|e| format!("Cannot create memory backup directory: {e}"))?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?.as_millis();
    let path = dir.join(format!("mikan-user-memories-{timestamp}.json"));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&path)
        .map_err(|e| format!("Cannot create memory backup: {e}"))?;
    file.write_all(text.as_bytes()).and_then(|_| file.sync_all())
        .map_err(|e| format!("Cannot finish memory backup: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFactsResult { path: String, count: usize }

#[tauri::command]
pub fn memory_export_facts(app: AppHandle) -> Result<ExportFactsResult, String> {
    let (json, count) = export_user_facts(&open_db(&app)?)?;
    let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let path = save_user_facts_json(&download_dir, &json)?;
    Ok(ExportFactsResult { path, count })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceFactsResult { inserted: usize, old_count: usize, backup_path: String }

/// Atomic swap of *user facts only*, with an on-disk backup created before
/// deleting anything. Chat history and character canon are never touched.
fn replace_user_facts(
    db: &mut Connection, incoming: Vec<IncomingMemory>, expected_count: usize,
    backup_dir: &Path
) -> Result<ReplaceFactsResult, String> {
    if incoming.is_empty() || incoming.len() > 2000 {
        return Err("Replacement needs 1–2000 reviewed facts".into());
    }
    let mut validated = Vec::with_capacity(incoming.len());
    let mut seen = std::collections::HashSet::new();
    for item in incoming {
        let fact = clean_fact(&item.fact)?;
        if !seen.insert(fact.to_lowercase()) {
            return Err(format!("Duplicate replacement fact: {fact}"));
        }
        validated.push((
            fact, clean_category(&item.category)?,
            serde_json::to_string(&clean_tags(&item.tags)?).map_err(|e| e.to_string())?,
            item.pinned
        ));
    }
    // IMMEDIATE reserves the writer lock before snapshotting, preventing a
    // concurrent automatic memory extraction from slipping past the backup.
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let actual_count: i64 = tx.query_row("SELECT COUNT(*) FROM user_memories", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if actual_count as usize != expected_count {
        return Err("Memories changed since preview. Refresh and review again.".into());
    }
    let (json, _) = export_user_facts(&tx)?;
    let backup_path = save_user_facts_json(backup_dir, &json)?;
    tx.execute("DELETE FROM automatic_memory_sources WHERE memory_kind='user'", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM user_memories", []).map_err(|e| e.to_string())?;
    for (fact, category, tags, pinned) in validated.iter() {
        tx.execute(
            "INSERT INTO user_memories(fact,category,tags_json) VALUES(?1,?2,?3)",
            params![fact, category, tags]
        ).map_err(|e| e.to_string())?;
        if *pinned {
            tx.execute(
                "INSERT INTO user_memory_usage(memory_id,importance) VALUES(last_insert_rowid(),95)",
                []
            ).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(ReplaceFactsResult { inserted: validated.len(),
        old_count: expected_count, backup_path })
}

#[tauri::command]
pub fn memory_replace_facts(
    app: AppHandle, items: Vec<IncomingMemory>, expected_count: usize, confirmation: String
) -> Result<ReplaceFactsResult, String> {
    if confirmation != "REPLACE" {
        return Err("Type REPLACE to confirm a full replacement".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?
        .join("memory-backups");
    replace_user_facts(&mut open_db(&app)?, items, expected_count, &dir)
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
         ORDER BY category ASC, label COLLATE NOCASE ASC LIMIT 2000"
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

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct IncomingCharacterFact {
    category: String,
    label: String,
    value: String,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct ImportCharacterResult { inserted: usize, duplicates: usize }

/// Import canon in one transaction, preserving all existing manually edited
/// or automatically established traits. Duplicate labels are skipped.
#[tauri::command]
pub fn memory_import_character_facts(
    app: AppHandle, persona_id: String, items: Vec<IncomingCharacterFact>
) -> Result<ImportCharacterResult,String> {
    if !valid_persona_id(&persona_id) { return Err("Invalid persona ID".into()); }
    if items.is_empty() || items.len()>2000 { return Err("Import 1–2000 character details".into()); }
    let validated = items.into_iter().map(|item| {
        if !valid_character_category(&item.category) {
            return Err("Invalid character category".to_string());
        }
        let label=clean_character_label(&item.label)?;
        let value=clean_character_value(&item.value)?;
        let normalized=label.to_lowercase();
        Ok((item.category,label,normalized,value))
    }).collect::<Result<Vec<_>,String>>()?;
    let mut db=open_db(&app)?;
    let tx=db.transaction().map_err(|e|e.to_string())?;
    let existing:i64=tx.query_row(
        "SELECT COUNT(*) FROM character_facts WHERE persona_id=?1",
        params![persona_id],|row|row.get(0)
    ).map_err(|e|e.to_string())?;
    let (mut inserted,mut duplicates)=(0usize,0usize);
    for (category,label,normalized,value) in validated {
        let changed=tx.execute(
            "INSERT OR IGNORE INTO character_facts(persona_id,category,label,normalized_label,value)
             VALUES(?1,?2,?3,?4,?5)",
            params![persona_id,category,label,normalized,value]
        ).map_err(|e|e.to_string())?;
        if changed>0 {inserted+=1;} else {duplicates+=1;}
        if existing+inserted as i64>2000 {return Err("Maximum 2000 character details".into());}
    }
    tx.commit().map_err(|e|e.to_string())?;
    Ok(ImportCharacterResult { inserted,duplicates })
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
    fn fact_search_backfills_and_tracks_updates() {
        let db = Connection::open_in_memory().unwrap();
        // Simulate the owner upgrading a database with existing facts.
        db.execute_batch(
            "CREATE TABLE user_memories (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               fact TEXT NOT NULL COLLATE NOCASE UNIQUE,
               category TEXT NOT NULL DEFAULT 'other',
               tags_json TEXT NOT NULL DEFAULT '[]',
               created_at INTEGER NOT NULL DEFAULT (unixepoch()),
               updated_at INTEGER NOT NULL DEFAULT (unixepoch())
             );
             INSERT INTO user_memories(fact) VALUES ('The user enjoys industrial metal');"
        ).unwrap();
        initialize_database(&db).unwrap();
        let ids = find_fact_ids(&db,"industrial metal").unwrap();
        assert_eq!(ids.len(),1);
        db.execute("UPDATE user_memories SET fact='The user enjoys synthwave' WHERE id=?1",
            params![ids[0]]).unwrap();
        assert!(find_fact_ids(&db,"industrial metal").unwrap().is_empty());
        assert_eq!(find_fact_ids(&db,"synthwave").unwrap(),ids);
        db.execute("DELETE FROM user_memories WHERE id=?1",params![ids[0]]).unwrap();
        assert!(find_fact_ids(&db,"synthwave").unwrap().is_empty());
        initialize_database(&db).unwrap();
    }

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
    fn exported_facts_round_trip_with_tags_and_pin_metadata() {
        let db = Connection::open_in_memory().unwrap();
        initialize_database(&db).unwrap();
        db.execute("INSERT INTO user_memories(fact,category,tags_json) VALUES(?1,?2,?3)",
            params!["Loves Fear Factory","interests",r#"["metal","fear factory"]"#]).unwrap();
        let id = db.last_insert_rowid();
        set_importance(&db,id,true).unwrap();
        let (json, count) = export_user_facts(&db).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(count,1);
        assert_eq!(parsed["memories"][0]["fact"],"Loves Fear Factory");
        assert_eq!(parsed["memories"][0]["category"],"interests");
        assert_eq!(parsed["memories"][0]["tags"][1],"fear factory");
        assert_eq!(parsed["memories"][0]["pinned"],true);
    }

    #[test]
    fn safe_rebuild_validates_and_keeps_other_memory_tables() {
        let mut db = Connection::open_in_memory().unwrap();
        initialize_database(&db).unwrap();
        db.execute("INSERT INTO user_memories(fact) VALUES('Old duplicate')",[]).unwrap();
        db.execute("INSERT INTO character_facts(persona_id,category,label,normalized_label,value)
            VALUES('mikan','favorites','Music','music','Synthwave')",[]).unwrap();
        db.execute("INSERT INTO conversations(id,title,created_at,updated_at)
            VALUES('chat','Our chat',1,1)",[]).unwrap();
        let dir = std::env::temp_dir().join(format!(
            "mikan-rebuild-tests-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let new_fact = || IncomingMemory {
            fact:"Loves Fear Factory".into(), category:"interests".into(),
            tags:vec!["music".into()], pinned:true
        };
        assert!(replace_user_facts(&mut db,vec![new_fact()],0,&dir).is_err());
        assert!(replace_user_facts(&mut db,vec![new_fact(),new_fact()],1,&dir).is_err());
        assert!(replace_user_facts(&mut db,vec![IncomingMemory {
            fact:"  ".into(), category:"other".into(), tags:vec![], pinned:false
        }],1,&dir).is_err());
        assert_eq!(db.query_row("SELECT COUNT(*) FROM user_memories",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        let result=replace_user_facts(&mut db,vec![new_fact()],1,&dir).unwrap();
        assert_eq!((result.old_count,result.inserted),(1,1));
        let backup=fs::read_to_string(&result.backup_path).unwrap();
        assert!(backup.contains("Old duplicate"));
        assert_eq!(db.query_row("SELECT COUNT(*) FROM character_facts",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        assert_eq!(db.query_row("SELECT COUNT(*) FROM conversations",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        let loaded=list_user_facts(&db).unwrap();
        assert_eq!(loaded.len(),1);
        assert_eq!(loaded[0].fact,"Loves Fear Factory");
        assert_eq!(loaded[0].importance,95);
        let _ = fs::remove_file(&result.backup_path);
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
    fn old_interest_schema_upgrades_in_place_without_losing_references_or_fts() {
        let db=Connection::open_in_memory().unwrap();
        db.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE interest_items (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               name TEXT NOT NULL COLLATE NOCASE,
               kind TEXT NOT NULL CHECK(kind IN
                 ('band','album','anime','show','movie','game','book','other')),
               status TEXT NOT NULL CHECK(status IN
                 ('favorite','like','dislike','interested','experienced','unknown')),
               rating REAL CHECK(rating IS NULL OR rating BETWEEN 0 AND 10),
               notes TEXT NOT NULL DEFAULT '',
               tags_json TEXT NOT NULL DEFAULT '[]',
               source TEXT NOT NULL DEFAULT 'manual',
               source_message_id TEXT,
               source_quote TEXT NOT NULL DEFAULT '',
               created_at INTEGER NOT NULL DEFAULT (unixepoch()),
               updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
               UNIQUE(kind,name)
             );
             INSERT INTO interest_items(id,name,kind,status,rating,notes,tags_json,source)
               VALUES(248,'The War Within','album','favorite',9.0,'Important','[\"metal\"]','import');
             INSERT INTO interest_items(id,name,kind,status,source,source_quote)
               VALUES(249,'Thoughts Without Words','album','favorite','conversation',
                 'my favorite Shadows Fall song is Thoughts Without Words');"
        ).unwrap();
        initialize_database(&db).unwrap();
        db.execute(
            "INSERT INTO memory_fact_reviews(existing_interest_id,proposed_fact,evidence,source_message_id)
             VALUES(248,'updated album','test',NULL)",[]
        ).err(); // source_message_id is non-null: validate the FK with real messages below.
        db.execute("INSERT INTO conversations(id,title,created_at,updated_at) VALUES('c','test',0,0)",[]).unwrap();
        db.execute("INSERT INTO messages(id,conversation_id,role,content,created_at)
             VALUES('u','c','user','test',0)",[]).unwrap();
        db.execute("INSERT INTO memory_fact_reviews(existing_interest_id,proposed_fact,evidence,source_message_id)
             VALUES(248,'updated album','test','u')",[]).unwrap();
        initialize_database(&db).unwrap();
        let saved:(i64,String,String,String)=db.query_row(
            "SELECT id,kind,notes,tags_json FROM interest_items WHERE name='The War Within'",
            [],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
        ).unwrap();
        assert_eq!(saved,(248,"album".into(),"Important".into(),r#"["metal"]"#.into()));
        let refs:i64=db.query_row(
            "SELECT count(*) FROM memory_fact_reviews WHERE existing_interest_id=248",[],
            |r|r.get(0)
        ).unwrap();
        assert_eq!(refs,1);
        let recovered:String=db.query_row(
            "SELECT kind FROM interest_items WHERE id=249",[],|r|r.get(0)).unwrap();
        assert_eq!(recovered,"song");
        db.execute("INSERT INTO interest_items(name,kind,status) VALUES
              ('Another Song','song','favorite')",[]).unwrap();
        let found:i64=db.query_row(
            "SELECT COUNT(*) FROM interest_search WHERE interest_search MATCH 'another'",[],
            |r|r.get(0)
        ).unwrap();
        assert_eq!(found,1);
        let checks:i64=db.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check",[],|r|r.get(0)).unwrap();
        assert_eq!(checks,0);
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
