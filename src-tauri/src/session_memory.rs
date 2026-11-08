//! Local-first conversation/session summaries, deliberately separate from
//! user facts and character canon. Only the owner's actual user messages are
//! used for summary evidence; the local LLM prepares candidate topic notes.
use crate::memory;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    conversation_id: String,
    summary: String,
    last_message_rowid: i64,
    updated_at: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCandidate {
    conversation_id: String,
    previous_summary: String,
    last_message_rowid: i64,
    expected_previous_rowid: i64,
    user_messages: Vec<String>,
}
fn valid_id(value: &str) -> bool {
    value.len() == 36 && value.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}
fn collect_candidate(
    db: &Connection, conversation_id: &str, force: bool
) -> Result<Option<SessionCandidate>, String> {
    if !valid_id(conversation_id) { return Err("Invalid conversation ID".into()); }
    let (previous_summary, expected_previous_rowid): (String, i64) = db.query_row(
        "SELECT summary,last_message_rowid FROM session_summaries WHERE conversation_id=?1",
        params![conversation_id], |r| Ok((r.get(0)?, r.get(1)?))
    ).optional().map_err(|e| e.to_string())?.unwrap_or_default();
    // Never summarize a pending user message before Mikan has replied.
    let latest: Option<i64> = db.query_row(
        "SELECT MAX(rowid) FROM messages
         WHERE conversation_id=?1 AND role='assistant' AND length(content)>0",
        params![conversation_id], |r| r.get(0)
    ).map_err(|e| e.to_string())?;
    let Some(last_message_rowid) = latest else { return Ok(None) };
    if last_message_rowid <= expected_previous_rowid { return Ok(None); }

    let mut stmt = db.prepare(
        "SELECT content FROM messages
         WHERE conversation_id=?1 AND role='user' AND rowid>?2 AND rowid<?3
         ORDER BY rowid DESC LIMIT 30"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![conversation_id,expected_previous_rowid,last_message_rowid],
        |r| r.get::<_,String>(0))
        .map_err(|e| e.to_string())?;
    let mut user_messages: Vec<String> = rows.collect::<Result<_,_>>()
        .map_err(|e| e.to_string())?;
    user_messages.retain(|s| !s.trim().is_empty());
    // Refresh after six answered turns, or when explicitly leaving a session
    // containing at least two new user turns.
    if user_messages.len() < if force {2} else {6} { return Ok(None) }
    user_messages.reverse();
    Ok(Some(SessionCandidate {
        conversation_id: conversation_id.into(),
        previous_summary,
        last_message_rowid,
        expected_previous_rowid,
        user_messages: user_messages.into_iter()
            .map(|s| s.chars().take(360).collect()).collect()
    }))
}
fn store_summary(db: &Connection, conversation_id: &str, summary: &str,
    last_message_rowid: i64, expected_previous_rowid: i64
) -> Result<bool, String> {
    if !valid_id(conversation_id) || summary.trim().is_empty()
        || summary.chars().count() > 1800 || last_message_rowid <= expected_previous_rowid {
        return Err("Invalid session summary".into());
    }
    // Reject stale results and prevent writing onto a deleted conversation.
    // A newer summary cannot be overwritten by a delayed model completion.
    let changed = db.execute(
        "INSERT INTO session_summaries(conversation_id,summary,last_message_rowid,updated_at)
         SELECT id,?2,?3,unixepoch() FROM conversations WHERE id=?1
         ON CONFLICT(conversation_id) DO UPDATE SET
           summary=excluded.summary,
           last_message_rowid=excluded.last_message_rowid,
           updated_at=excluded.updated_at
         WHERE session_summaries.last_message_rowid=?4
           AND excluded.last_message_rowid>session_summaries.last_message_rowid",
        params![conversation_id,summary,last_message_rowid,expected_previous_rowid]
    ).map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

#[tauri::command]
pub fn memory_session_candidate(
    app: AppHandle, conversation_id: String, force: bool
) -> Result<Option<SessionCandidate>, String> {
    collect_candidate(&memory::open_db(&app)?, &conversation_id, force)
}
#[tauri::command]
pub fn memory_save_session_summary(
    app: AppHandle, conversation_id: String, summary: String,
    last_message_rowid: i64, expected_previous_rowid: i64
) -> Result<bool, String> {
    store_summary(&memory::open_db(&app)?, &conversation_id, &summary,
        last_message_rowid, expected_previous_rowid)
}
#[tauri::command]
pub fn memory_list_session_summaries(app: AppHandle) -> Result<Vec<SessionSummary>, String> {
    let db = memory::open_db(&app)?;
    let mut stmt = db.prepare(
        "SELECT conversation_id,summary,last_message_rowid,updated_at
         FROM session_summaries ORDER BY updated_at DESC,last_message_rowid DESC LIMIT 30"
    ).map_err(|e| e.to_string())?;
    let records = stmt.query_map([], |r| Ok(SessionSummary {
        conversation_id: r.get(0)?, summary: r.get(1)?,
        last_message_rowid: r.get(2)?, updated_at: r.get(3)?
    })).map_err(|e| e.to_string())?;
    records.collect::<Result<_,_>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_delete_session_summary(app: AppHandle, conversation_id: String) -> Result<(), String> {
    if !valid_id(&conversation_id) { return Err("Invalid conversation ID".into()); }
    memory::open_db(&app)?.execute(
        "DELETE FROM session_summaries WHERE conversation_id=?1",
        params![conversation_id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Connection {
        let conn=Connection::open_in_memory().unwrap();
        // Initialize a minimum schema exercising the same FK and timestamp
        // rules without needing a Tauri app in native unit tests.
        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE conversations(id TEXT PRIMARY KEY, updated_at INTEGER);
             CREATE TABLE messages(id TEXT PRIMARY KEY,conversation_id TEXT,
               role TEXT,content TEXT);
             CREATE TABLE session_summaries(
               conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
               summary TEXT NOT NULL,last_message_rowid INTEGER NOT NULL,updated_at INTEGER NOT NULL);"
        ).unwrap();
        conn
    }
    const ID: &str = "11111111-1111-4111-8111-111111111111";
    #[test]
    fn only_completed_dialogue_qualifies_and_previous_watermark_is_respected() {
        let conn=db();
        conn.execute("INSERT INTO conversations(id,updated_at) VALUES(?1,1)", params![ID]).unwrap();
        for i in 0..6 {
            conn.execute("INSERT INTO messages(id,conversation_id,role,content) VALUES(?1,?2,'user',?3)",
                params![format!("u{i}"),ID,format!("I worked on project {i}")]).unwrap();
            conn.execute("INSERT INTO messages(id,conversation_id,role,content) VALUES(?1,?2,'assistant','Okay')",
                params![format!("a{i}"),ID]).unwrap();
        }
        conn.execute("INSERT INTO messages(id,conversation_id,role,content) VALUES('u-last',?1,'user','Pending')",
            params![ID]).unwrap();
        let candidate=collect_candidate(&conn,ID,false).unwrap().unwrap();
        assert_eq!(candidate.user_messages.len(),6);
        assert!(!candidate.user_messages.iter().any(|t| t=="Pending"));
        assert!(store_summary(&conn,ID,"- Projects: user worked on projects.",
            candidate.last_message_rowid,0).unwrap());
        assert!(collect_candidate(&conn,ID,false).unwrap().is_none());
        // Do not allow duplicate/stale worker writes.
        assert!(!store_summary(&conn,ID,"- Older conflicting summary",
            candidate.last_message_rowid,0).unwrap());
    }
    #[test]
    fn summary_cascades_on_chat_deletion() {
        let conn=db();
        conn.execute("INSERT INTO conversations(id,updated_at) VALUES(?1,1)",params![ID]).unwrap();
        assert!(store_summary(&conn,ID,"- Old user topic",1,0).unwrap());
        conn.execute("DELETE FROM conversations WHERE id=?1",params![ID]).unwrap();
        let n:i64=conn.query_row("SELECT COUNT(*) FROM session_summaries",[],|r|r.get(0)).unwrap();
        assert_eq!(n,0);
        assert!(!store_summary(&conn,ID,"- Don't resurrect",2,1).unwrap());
    }
}
