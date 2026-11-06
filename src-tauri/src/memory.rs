//! First memory layer: local conversation archive and explicit user facts.
//! Future self-identity / character canon and knowledge live in separate tables.
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, time::Duration};
use tauri::{AppHandle, Manager};

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create local memory directory: {e}"))?;
    let connection = Connection::open(dir.join("mikan-memory.sqlite3"))
        .map_err(|e| format!("Cannot open memory database: {e}"))?;
    connection.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
    initialize_database(&connection)?;
    Ok(connection)
}

fn initialize_database(connection: &Connection) -> Result<(), String> {
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
         CREATE TABLE IF NOT EXISTS user_memories (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           fact TEXT NOT NULL COLLATE NOCASE UNIQUE,
           created_at INTEGER NOT NULL DEFAULT (unixepoch()),
           updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );"
    ).map_err(|e| format!("Cannot initialize memory database: {e}"))?;
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
    id: i64,
    fact: String,
    created_at: i64,
    updated_at: i64,
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

#[tauri::command]
pub fn memory_list_facts(app: AppHandle) -> Result<Vec<UserMemory>, String> {
    let db = open_db(&app)?;
    let mut statement = db.prepare(
        "SELECT id,fact,created_at,updated_at FROM user_memories ORDER BY updated_at DESC,id DESC LIMIT 500"
    ).map_err(|e| e.to_string())?;
    let rows = statement.query_map([], |row| Ok(UserMemory {
        id: row.get(0)?, fact: row.get(1)?, created_at: row.get(2)?, updated_at: row.get(3)?
    })).map_err(|e| e.to_string())?;
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
        "SELECT id,fact,created_at,updated_at FROM user_memories WHERE fact=?1 COLLATE NOCASE",
        params![fact], |row| Ok(UserMemory {
            id: row.get(0)?, fact: row.get(1)?, created_at: row.get(2)?, updated_at: row.get(3)?
        })
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
