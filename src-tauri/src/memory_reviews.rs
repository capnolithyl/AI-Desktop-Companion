//! Owner-reviewed memory corrections. Automatic extraction never overwrites
//! an existing curated fact or activates a proposed replacement on its own.
use crate::memory;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct MemoryReview {
    id: i64,
    existing_memory_id: Option<i64>,
    existing_interest_id: Option<i64>,
    existing_fact: Option<String>,
    proposed_fact: String,
    evidence: String,
    created_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct FactHistory {
    id: i64,
    memory_id: i64,
    previous_fact: String,
    replacement_fact: String,
    changed_at: i64,
}

/// Insert a reviewable proposal within the same transaction that logs an
/// automatic extraction run. A deleted conversation cannot leave a proposal.
pub(crate) fn stage_review(
    tx: &Transaction<'_>, related_id: Option<i64>, proposed_fact: &str,
    evidence: &str, source_message_id: &str
) -> Result<bool,String> {
    let existing:Option<(i64,String)>=if let Some(id)=related_id {
        tx.query_row("SELECT id,fact FROM user_memories WHERE id=?1",params![id],
            |row|Ok((row.get(0)?,row.get(1)?)))
            .optional().map_err(|e|e.to_string())?
    }else{None};
    if existing.as_ref().is_some_and(|(_,fact)| fact.eq_ignore_ascii_case(proposed_fact)) {
        return Ok(false);
    }
    let changed=tx.execute(
        "INSERT OR IGNORE INTO memory_fact_reviews
           (existing_memory_id,existing_fact,proposed_fact,evidence,source_message_id)
         VALUES(?1,?2,?3,?4,?5)",
        params![existing.as_ref().map(|(id,_)|id),
            existing.as_ref().map(|(_,text)|text),
            proposed_fact,evidence,source_message_id]
    ).map_err(|e|e.to_string())?;
    Ok(changed>0)
}

/// A correction may reference an interest, including legacy catch-all entries.
/// Never modify or delete the original item before the owner approves.
pub(crate) fn stage_interest_review(
    tx:&Transaction<'_>,interest_id:i64,proposed_fact:&str,
    evidence:&str,source_message_id:&str
)->Result<bool,String>{
    let original:Option<(String,String,String)>=tx.query_row(
        "SELECT name,kind,status FROM interest_items WHERE id=?1",
        params![interest_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))
    ).optional().map_err(|e|e.to_string())?;
    let Some((name,kind,status))=original else {return Ok(false)};
    let snapshot=format!("Interest ({kind}): {name} [{status}]");
    let changed=tx.execute(
        "INSERT OR IGNORE INTO memory_fact_reviews
         (existing_interest_id,existing_fact,proposed_fact,evidence,source_message_id)
         VALUES(?1,?2,?3,?4,?5)",
         params![interest_id,snapshot,proposed_fact,evidence,source_message_id]
    ).map_err(|e|e.to_string())?;
    Ok(changed>0)
}

fn list_reviews(db:&Connection)->Result<Vec<MemoryReview>,String> {
    let mut stmt=db.prepare(
        "SELECT r.id,r.existing_memory_id,r.existing_interest_id,r.existing_fact,
                r.proposed_fact,r.evidence,r.created_at
         FROM memory_fact_reviews r WHERE r.status='pending'
         ORDER BY r.created_at ASC,r.id ASC LIMIT 500"
    ).map_err(|e|e.to_string())?;
    let reviews=stmt.query_map([],|r|Ok(MemoryReview{
        id:r.get(0)?, existing_memory_id:r.get(1)?,existing_interest_id:r.get(2)?,
        existing_fact:r.get(3)?, proposed_fact:r.get(4)?,
        evidence:r.get(5)?,created_at:r.get(6)?
    })).map_err(|e|e.to_string())?
      .collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    Ok(reviews)
}

#[tauri::command]
pub fn memory_list_reviews(app:AppHandle)->Result<Vec<MemoryReview>,String> {
    list_reviews(&memory::open_db(&app)?)
}

/// Resolve a correction deliberately. Replacing a fact preserves its ID,
/// category, tags and importance while retaining the previous value/history.
fn resolve(db:&mut Connection,id:i64,action:&str)->Result<(),String> {
    if !matches!(action,"replace"|"keep_both"|"dismiss") {
        return Err("Invalid memory review action".into());
    }
    let tx=db.transaction().map_err(|e|e.to_string())?;
    let (old_id,old_interest_id,old_snapshot,new_fact,evidence,source):(
        Option<i64>,Option<i64>,Option<String>,String,String,String
    )=tx.query_row(
        "SELECT existing_memory_id,existing_interest_id,existing_fact,proposed_fact,evidence,source_message_id
         FROM memory_fact_reviews WHERE id=?1 AND status='pending'",
        params![id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?))
    ).optional().map_err(|e|e.to_string())?
        .ok_or_else(||"Review not found or already resolved".to_string())?;

    if action=="replace" {
        if let Some(interest_id)=old_interest_id {
            let existing:Option<(String,String,String)>=tx.query_row(
                "SELECT name,kind,status FROM interest_items WHERE id=?1",
                params![interest_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))
            ).optional().map_err(|e|e.to_string())?;
            let Some((name,kind,status))=existing else {
                return Err("Existing interest was deleted. Dismiss this review.".into());
            };
            let snapshot=format!("Interest ({kind}): {name} [{status}]");
            if old_snapshot.as_deref()!=Some(snapshot.as_str()) {
                return Err("Existing interest changed since the review. Dismiss and review again.".into());
            }
            tx.execute("INSERT OR IGNORE INTO user_memories(fact) VALUES(?1)",params![new_fact])
                .map_err(|e|e.to_string())?;
            let new_id:i64=tx.query_row("SELECT id FROM user_memories WHERE fact=?1",
                params![new_fact],|r|r.get(0)).map_err(|e|e.to_string())?;
            tx.execute("DELETE FROM interest_items WHERE id=?1",params![interest_id])
                .map_err(|e|e.to_string())?;
            tx.execute("INSERT INTO memory_fact_history
                (memory_id,previous_fact,replacement_fact,change_source_message_id,change_evidence)
                VALUES(?1,?2,?3,?4,?5)",
                params![new_id,snapshot,new_fact,source,evidence]).map_err(|e|e.to_string())?;
            tx.execute(
                "INSERT INTO automatic_memory_sources(memory_kind,memory_id,source_message_id,evidence)
                 VALUES('user',?1,?2,?3)
                 ON CONFLICT(memory_kind,memory_id) DO UPDATE SET
                   source_message_id=excluded.source_message_id,
                   evidence=excluded.evidence,captured_at=unixepoch()",
                params![new_id,source,evidence]
            ).map_err(|e|e.to_string())?;
        } else {
        let existing_id=old_id.ok_or_else(||"No existing memory to replace".to_string())?;
        let present:String=tx.query_row("SELECT fact FROM user_memories WHERE id=?1",
            params![existing_id],|r|r.get(0)).optional().map_err(|e|e.to_string())?
            .ok_or_else(||"Existing memory was deleted. Save separately or dismiss.".to_string())?;
        if old_snapshot.as_deref()!=Some(present.as_str()) {
            return Err("Existing memory changed since this review. Dismiss and review the latest fact.".into());
        }
        let previous_source:Option<(Option<String>,String)>=tx.query_row(
            "SELECT source_message_id,evidence FROM automatic_memory_sources
             WHERE memory_kind='user' AND memory_id=?1",
            params![existing_id],|r|Ok((r.get(0)?,r.get(1)?))
        ).optional().map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO memory_fact_history
            (memory_id,previous_fact,replacement_fact,previous_source_message_id,
             previous_evidence,change_source_message_id,change_evidence)
            VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![existing_id,present,new_fact,
                previous_source.as_ref().and_then(|(id,_)|id.as_deref()),
                previous_source.as_ref().map(|(_,text)|text.as_str()),source,evidence]
        ).map_err(|e|e.to_string())?;
        tx.execute("UPDATE user_memories SET fact=?1,updated_at=unixepoch() WHERE id=?2",
            params![new_fact,existing_id]).map_err(|e|format!("Cannot replace memory: {e}"))?;
        tx.execute(
            "INSERT INTO automatic_memory_sources(memory_kind,memory_id,source_message_id,evidence)
             VALUES('user',?1,?2,?3)
             ON CONFLICT(memory_kind,memory_id) DO UPDATE SET
               source_message_id=excluded.source_message_id,
               evidence=excluded.evidence,captured_at=unixepoch()",
            params![existing_id,source,evidence]
        ).map_err(|e|e.to_string())?;
        }
    } else if action=="keep_both" {
        let changed=tx.execute("INSERT OR IGNORE INTO user_memories(fact) VALUES(?1)",
            params![new_fact]).map_err(|e|e.to_string())?;
        if changed>0 {
            let new_id=tx.last_insert_rowid();
            tx.execute(
                "INSERT INTO automatic_memory_sources(memory_kind,memory_id,source_message_id,evidence)
                 VALUES('user',?1,?2,?3)",params![new_id,source,evidence]
            ).map_err(|e|e.to_string())?;
        }
    }
    let state=match action {"replace"=>"replaced","keep_both"=>"saved",_=>"dismissed"};
    tx.execute(
        "UPDATE memory_fact_reviews SET status=?1,resolved_at=unixepoch()
         WHERE id=?2 AND status='pending'",params![state,id]
    ).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e|e.to_string())
}

#[tauri::command]
pub fn memory_resolve_review(app:AppHandle,id:i64,action:String)->Result<(),String> {
    resolve(&mut memory::open_db(&app)?,id,&action)
}

#[tauri::command]
pub fn memory_list_fact_history(app:AppHandle)->Result<Vec<FactHistory>,String> {
    let db=memory::open_db(&app)?;
    let mut stmt=db.prepare(
        "SELECT id,memory_id,previous_fact,replacement_fact,changed_at
         FROM memory_fact_history ORDER BY changed_at DESC,id DESC LIMIT 100"
    ).map_err(|e|e.to_string())?;
    let history=stmt.query_map([],|r|Ok(FactHistory{
        id:r.get(0)?,memory_id:r.get(1)?,previous_fact:r.get(2)?,
        replacement_fact:r.get(3)?,changed_at:r.get(4)?
    })).map_err(|e|e.to_string())?
      .collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    Ok(history)
}

#[cfg(test)]
mod tests {
    use super::*;
    const CONVO:&str="11111111-1111-4111-8111-111111111111";
    const USER:&str="22222222-2222-4222-8222-222222222222";
    fn fixture()->(Connection,i64) {
        let db=Connection::open_in_memory().unwrap();
        memory::initialize_database(&db).unwrap();
        db.execute("INSERT INTO conversations(id,created_at,updated_at) VALUES(?1,1,1)",params![CONVO]).unwrap();
        db.execute("INSERT INTO messages(id,conversation_id,role,content,created_at)
            VALUES(?1,?2,'user','I no longer like metal',1)",params![USER,CONVO]).unwrap();
        db.execute("INSERT INTO user_memories(fact) VALUES('The user likes metal')",[]).unwrap();
        let id=db.last_insert_rowid();
        (db,id)
    }
    #[test]
    fn reviewed_interest_replacement_moves_legacy_preference_to_user_fact() {
        let (mut db,_)=fixture();
        db.execute(
            "INSERT INTO interest_items(name,kind,status,source)
             VALUES('Schnitzel','other','favorite','conversation')",[]
        ).unwrap();
        let id=db.last_insert_rowid();
        let tx=db.transaction().unwrap();
        assert!(stage_interest_review(&tx,id,"The user prefers another food",
            "I prefer another food now",USER).unwrap());
        tx.commit().unwrap();
        let review_id=list_reviews(&db).unwrap()[0].id;
        assert_eq!(list_reviews(&db).unwrap()[0].existing_interest_id,Some(id));
        resolve(&mut db,review_id,"replace").unwrap();
        let n:i64=db.query_row("SELECT COUNT(*) FROM interest_items WHERE id=?1",
            params![id],|r|r.get(0)).unwrap();
        assert_eq!(n,0);
        let fact:String=db.query_row(
            "SELECT fact FROM user_memories WHERE fact='The user prefers another food'",
            [],|r|r.get(0)).unwrap();
        assert_eq!(fact,"The user prefers another food");
        let old:String=db.query_row("SELECT previous_fact FROM memory_fact_history
            WHERE previous_fact LIKE 'Interest (%'",[],|r|r.get(0)).unwrap();
        assert!(old.contains("Schnitzel"));
    }
    #[test]
    fn reviewed_replacement_preserves_id_and_fact_history() {
        let (mut db,old_id)=fixture();
        let tx=db.transaction().unwrap();
        assert!(stage_review(&tx,Some(old_id),"The user dislikes metal",
            "I no longer like metal",USER).unwrap());
        tx.commit().unwrap();
        let id=list_reviews(&db).unwrap()[0].id;
        assert_eq!(list_reviews(&db).unwrap()[0].existing_memory_id,Some(old_id));
        resolve(&mut db,id,"replace").unwrap();
        let updated:String=db.query_row("SELECT fact FROM user_memories WHERE id=?1",
            params![old_id],|r|r.get(0)).unwrap();
        assert_eq!(updated,"The user dislikes metal");
        assert!(memory::find_fact_ids(&db,"likes").unwrap().is_empty());
        let history:String=db.query_row("SELECT previous_fact FROM memory_fact_history",[],
            |r|r.get(0)).unwrap();
        assert_eq!(history,"The user likes metal");
        assert!(list_reviews(&db).unwrap().is_empty());
        assert!(resolve(&mut db,id,"replace").is_err());
    }
    #[test]
    fn dismissal_does_not_change_existing_facts_and_deleted_chat_cascades() {
        let (mut db,old_id)=fixture();
        let tx=db.transaction().unwrap();
        stage_review(&tx,Some(old_id),"The user dislikes metal","I no longer like metal",USER).unwrap();
        tx.commit().unwrap();
        let id=list_reviews(&db).unwrap()[0].id;
        resolve(&mut db,id,"dismiss").unwrap();
        let original:String=db.query_row("SELECT fact FROM user_memories WHERE id=?1",
            params![old_id],|r|r.get(0)).unwrap();
        assert_eq!(original,"The user likes metal");
        assert!(list_reviews(&db).unwrap().is_empty());
        let tx=db.transaction().unwrap();
        stage_review(&tx,Some(old_id),"The user listens to punk","I no longer like metal",USER).unwrap();
        tx.commit().unwrap();
        assert_eq!(list_reviews(&db).unwrap().len(),1);
        db.execute("DELETE FROM conversations WHERE id=?1",params![CONVO]).unwrap();
        assert!(list_reviews(&db).unwrap().is_empty());
    }
}
