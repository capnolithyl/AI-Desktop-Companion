//! Durable local-only automatic memory work queue.
//! Conversation/message IDs are retained, never a second copy of private text.
//! Interrupted jobs recover on startup; finished jobs are idempotent via
//! automatic_memory_runs. No user fact is overwritten by background work.
use crate::{local_origin, memory, memory_extraction};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

const MAX_ATTEMPTS: i64 = 3;
const STALE_SECONDS: i64 = 240;
static DRAINING: AtomicBool = AtomicBool::new(false);

struct DrainGuard;
impl Drop for DrainGuard {
    fn drop(&mut self) { DRAINING.store(false, Ordering::Release); }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryJobRequest {
    endpoint: String,
    model: String,
    conversation_id: String,
    user_message_id: String,
    assistant_message_id: String,
    capture_user: bool,
    capture_character: bool,
    context_window: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryOutcome {
    user_saved: usize,
    character_saved: usize,
    interests_saved: usize,
    review_queued: usize,
    processed_at: i64,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryJobStatus {
    processed: usize,
    user_saved: usize,
    character_saved: usize,
    interests_saved: usize,
    review_queued: usize,
    queued: i64,
    failed: i64,
    last_outcome: Option<MemoryOutcome>,
}

struct Job {
    assistant_message_id: String,
    conversation_id: String,
    user_message_id: String,
    endpoint: String,
    model: String,
    context_window: Option<u32>,
    capture_user: bool,
    capture_character: bool,
    attempts: i64,
}

fn valid_id(value: &str) -> bool {
    value.len() == 36 && value.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}

fn enqueue(db: &Connection, request: &MemoryJobRequest) -> Result<bool, String> {
    if !request.capture_user && !request.capture_character { return Ok(false); }
    if ![&request.conversation_id,&request.user_message_id,&request.assistant_message_id]
        .iter().all(|id| valid_id(id)) { return Err("Invalid source message identifier".into()); }
    if request.model.trim().is_empty() || request.model.len()>120 { return Err("Invalid model".into()); }
    // Never allow a saved job to turn an external URL into an inference endpoint.
    local_origin(&request.endpoint)?;
    let changed=db.execute(
        "INSERT INTO automatic_memory_jobs
         (assistant_message_id,user_message_id,conversation_id,endpoint,model,
          context_window,capture_user,capture_character)
         SELECT ?1,?2,?3,?4,?5,?6,?7,?8
         WHERE EXISTS (
           SELECT 1 FROM messages a JOIN messages u ON u.conversation_id=a.conversation_id
           WHERE a.id=?1 AND a.conversation_id=?3 AND a.role='assistant'
             AND u.id=?2 AND u.role='user'
         )
         AND NOT EXISTS(SELECT 1 FROM automatic_memory_runs WHERE assistant_message_id=?1)
         ON CONFLICT(assistant_message_id) DO NOTHING",
        params![request.assistant_message_id,request.user_message_id,request.conversation_id,
            request.endpoint,request.model,
            request.context_window.filter(|n| matches!(*n,4096|8192|16384|32768)),
            request.capture_user,request.capture_character]
    ).map_err(|e| e.to_string())?;
    Ok(changed>0)
}

#[tauri::command]
pub fn memory_enqueue_turn(app: AppHandle, request: MemoryJobRequest) -> Result<bool,String> {
    enqueue(&memory::open_db(&app)?, &request)
}

fn status(db: &Connection) -> Result<MemoryJobStatus,String> {
    let queued=db.query_row("SELECT COUNT(*) FROM automatic_memory_jobs
        WHERE status IN ('queued','processing')",[],|r|r.get(0))
        .map_err(|e|e.to_string())?;
    let failed=db.query_row("SELECT COUNT(*) FROM automatic_memory_jobs
        WHERE status='failed'",[],|r|r.get(0))
        .map_err(|e|e.to_string())?;
    let last_outcome=db.query_row(
        "SELECT user_saved,character_saved,interests_saved,review_queued,processed_at
         FROM automatic_memory_runs WHERE outcome_known=1
         ORDER BY processed_at DESC,rowid DESC LIMIT 1",[],|r|Ok(MemoryOutcome {
             user_saved:r.get(0)?,character_saved:r.get(1)?,interests_saved:r.get(2)?,
             review_queued:r.get(3)?,processed_at:r.get(4)?
         })
    ).optional().map_err(|e|e.to_string())?;
    Ok(MemoryJobStatus{queued,failed,last_outcome,..Default::default()})
}

#[tauri::command]
pub fn memory_jobs_status(app:AppHandle)->Result<MemoryJobStatus,String> {
    status(&memory::open_db(&app)?)
}

fn claim(db: &mut Connection) -> Result<Option<Job>,String> {
    let tx=db.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e|e.to_string())?;
    tx.execute(
        "UPDATE automatic_memory_jobs SET status='failed',
         last_error='Interrupted on too many attempts',updated_at=unixepoch()
         WHERE status='processing' AND attempts>=?1 AND updated_at<unixepoch()-?2",
        params![MAX_ATTEMPTS,STALE_SECONDS]
    ).map_err(|e|e.to_string())?;
    let mut job:Option<Job>=tx.query_row(
        "SELECT assistant_message_id,conversation_id,user_message_id,endpoint,model,
                context_window,capture_user,capture_character,attempts
         FROM automatic_memory_jobs WHERE
           ((status='queued' AND retry_after<=unixepoch())
             OR (status='processing' AND updated_at<unixepoch()-?1))
           AND attempts<?2
         ORDER BY created_at,assistant_message_id LIMIT 1",
         params![STALE_SECONDS,MAX_ATTEMPTS],
         |row|Ok(Job{
            assistant_message_id:row.get(0)?,conversation_id:row.get(1)?,
            user_message_id:row.get(2)?,endpoint:row.get(3)?,
            model:row.get(4)?,context_window:row.get(5)?,
            capture_user:row.get(6)?,capture_character:row.get(7)?,
            attempts:row.get(8)?
         })
    ).optional().map_err(|e|e.to_string())?;
    if let Some(ref mut job)=job {
        tx.execute(
            "UPDATE automatic_memory_jobs SET status='processing',
              attempts=attempts+1,updated_at=unixepoch()
             WHERE assistant_message_id=?1",params![job.assistant_message_id]
        ).map_err(|e|e.to_string())?;
        job.attempts+=1;
    }
    tx.commit().map_err(|e|e.to_string())?;
    Ok(job)
}

#[tauri::command]
pub fn memory_retry_failed_jobs(app:AppHandle)->Result<usize,String> {
    let changed=memory::open_db(&app)?.execute(
        "UPDATE automatic_memory_jobs SET status='queued',attempts=0,
          retry_after=0,last_error=NULL,updated_at=unixepoch() WHERE status='failed'",[]
    ).map_err(|e|e.to_string())?;
    Ok(changed)
}

#[tauri::command]
pub async fn memory_process_pending_jobs(app: AppHandle) -> Result<MemoryJobStatus,String> {
    // Two UI triggers must not compete for Ollama. RAII releases the lock even
    // when Tauri cancels this async command while shutting down.
    if DRAINING.compare_exchange(false,true,Ordering::AcqRel,Ordering::Acquire).is_err() {
        return status(&memory::open_db(&app)?);
    }
    let _guard=DrainGuard;
    let mut totals=MemoryJobStatus::default();
    for _ in 0..3 {
        let job={
            let mut db=memory::open_db(&app)?;
            claim(&mut db)?
        };
        let Some(job)=job else {break};
        let outcome=memory_extraction::memory_process_turn(
            app.clone(),job.endpoint,job.model,job.conversation_id,
            job.user_message_id,job.assistant_message_id.clone(),
            job.capture_user,job.capture_character,job.context_window
        ).await;
        let db=memory::open_db(&app)?;
        match outcome {
            Ok(saved) => {
                db.execute("DELETE FROM automatic_memory_jobs WHERE assistant_message_id=?1",
                    params![job.assistant_message_id]).map_err(|e|e.to_string())?;
                totals.processed+=1;
                totals.user_saved+=saved.user_saved;
                totals.character_saved+=saved.character_saved;
                totals.interests_saved+=saved.interests_saved;
                totals.review_queued+=saved.review_queued;
            },
            Err(err) => {
                // Keep the original message references for owner-controlled retry.
                // A bad local model cannot trap the queue in an infinite hot loop.
                let state=if job.attempts>=MAX_ATTEMPTS {"failed"} else {"queued"};
                let delay=if job.attempts>=MAX_ATTEMPTS {0} else {60*job.attempts};
                db.execute(
                    "UPDATE automatic_memory_jobs SET status=?2,retry_after=unixepoch()+?3,
                     last_error=?4,updated_at=unixepoch() WHERE assistant_message_id=?1",
                    params![job.assistant_message_id,state,delay,err.chars().take(350).collect::<String>()]
                ).map_err(|e|e.to_string())?;
            }
        }
    }
    let remaining=status(&memory::open_db(&app)?)?;
    totals.queued=remaining.queued;
    totals.failed=remaining.failed;
    Ok(totals)
}

#[cfg(test)]
mod tests {
    use super::*;
    const CONVO:&str="11111111-1111-4111-8111-111111111111";
    const USER:&str="22222222-2222-4222-8222-222222222222";
    const ASSIST:&str="33333333-3333-4333-8333-333333333333";

    fn fixture()->Connection {
        let db=Connection::open_in_memory().unwrap();
        memory::initialize_database(&db).unwrap();
        db.execute("INSERT INTO conversations(id,created_at,updated_at) VALUES(?1,1,1)",params![CONVO]).unwrap();
        for (id,role) in [(USER,"user"),(ASSIST,"assistant")] {
            db.execute("INSERT INTO messages(id,conversation_id,role,content,created_at)
                VALUES (?1,?2,?3,'Example',1)",params![id,CONVO,role]).unwrap();
        }
        db
    }
    fn request()->MemoryJobRequest {
        MemoryJobRequest{endpoint:"http://127.0.0.1:11434".into(),model:"qwen3.5:9b".into(),
            conversation_id:CONVO.into(),user_message_id:USER.into(),
            assistant_message_id:ASSIST.into(),capture_user:true,capture_character:false,
            context_window:Some(16384)}
    }
    #[test]
    fn jobs_are_idempotent_and_cascade_when_chat_is_deleted() {
        let db=fixture();
        assert!(enqueue(&db,&request()).unwrap());
        assert!(!enqueue(&db,&request()).unwrap());
        assert_eq!(status(&db).unwrap().queued,1);
        db.execute("DELETE FROM conversations WHERE id=?1",params![CONVO]).unwrap();
        assert_eq!(status(&db).unwrap().queued,0);
    }
    #[test]
    fn claimed_jobs_retry_without_being_lost_or_duplicated() {
        let mut db=fixture();
        enqueue(&db,&request()).unwrap();
        let first=claim(&mut db).unwrap().unwrap();
        assert_eq!(first.attempts,1);
        assert!(claim(&mut db).unwrap().is_none()); // no concurrent claim
        db.execute("UPDATE automatic_memory_jobs SET status='queued',retry_after=0
            WHERE assistant_message_id=?1",params![ASSIST]).unwrap();
        assert_eq!(claim(&mut db).unwrap().unwrap().attempts,2);
    }
    #[test]
    fn successfully_processed_turns_cannot_be_queued_again() {
        let db=fixture();
        db.execute("INSERT INTO automatic_memory_runs(assistant_message_id) VALUES(?1)",
            params![ASSIST]).unwrap();
        assert!(!enqueue(&db,&request()).unwrap());
    }
}
