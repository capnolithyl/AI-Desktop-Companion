//! Owner-reviewed moves between autobiographical facts and structured Interests.
//! Both tables remain independent. Moves are atomic, protect against duplicates,
//! and never run an LLM or delete a source before the destination is inserted.
use crate::{interest_memory::{self, IncomingInterest}, memory};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::AppHandle;

fn fact_to_interest(db:&mut Connection,id:i64,item:IncomingInterest)->Result<(),String>{
    let item=interest_memory::checked(item)?;
    let tx=db.transaction().map_err(|e|e.to_string())?;
    let original:Option<String>=tx.query_row(
        "SELECT fact FROM user_memories WHERE id=?1",params![id],|r|r.get(0)
    ).optional().map_err(|e|e.to_string())?;
    let original=original.ok_or("About you memory not found")?;
    let count:i64=tx.query_row("SELECT COUNT(*) FROM interest_items",[],|r|r.get(0))
        .map_err(|e|e.to_string())?;
    if count>=5000 {return Err("Interest collection is full (5000 items)".into());}
    let tags=serde_json::to_string(&item.tags).map_err(|e|e.to_string())?;
    // Conflict is an error, NOT INSERT OR IGNORE: never remove a memory
    // unless the destination is new and persisted successfully.
    if tx.execute(
        "INSERT OR IGNORE INTO interest_items
            (name,kind,status,rating,notes,tags_json,source,source_quote)
         VALUES (?1,?2,?3,?4,?5,?6,'manual-conversion',?7)",
        params![item.name,item.kind,item.status,item.rating,item.notes,tags,original]
    ).map_err(|e|e.to_string())?==0 {
        return Err("That interest already exists. Edit the existing entry instead; nothing was moved.".into());
    }
    if tx.execute("DELETE FROM user_memories WHERE id=?1",params![id])
        .map_err(|e|e.to_string())?!=1 {
        return Err("Source memory changed during conversion".into());
    }
    tx.commit().map_err(|e|e.to_string())
}

fn interest_to_fact(
    db:&mut Connection,id:i64,fact:String,category:String,tags:Vec<String>
)->Result<(),String>{
    let fact=memory::clean_fact(&fact)?;
    let category=memory::clean_category(&category)?;
    let tags=serde_json::to_string(&memory::clean_tags(&tags)?)
        .map_err(|e|e.to_string())?;
    let tx=db.transaction().map_err(|e|e.to_string())?;
    let exists:bool=tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM interest_items WHERE id=?1)",
        params![id],|r|r.get(0)
    ).map_err(|e|e.to_string())?;
    if !exists {return Err("Interest not found".into());}
    let count:i64=tx.query_row("SELECT COUNT(*) FROM user_memories",[],|r|r.get(0))
        .map_err(|e|e.to_string())?;
    if count>=2000 {return Err("About you memory is full (2000 facts)".into());}
    if tx.execute(
        "INSERT OR IGNORE INTO user_memories(fact,category,tags_json)
         VALUES(?1,?2,?3)",params![fact,category,tags]
    ).map_err(|e|e.to_string())?==0 {
        return Err("That About you fact already exists. Nothing was moved.".into());
    }
    if tx.execute("DELETE FROM interest_items WHERE id=?1",params![id])
        .map_err(|e|e.to_string())?!=1 {
        return Err("Source interest changed during conversion".into());
    }
    tx.commit().map_err(|e|e.to_string())
}

#[tauri::command]
pub fn memory_convert_fact_to_interest(
    app:AppHandle,id:i64,item:IncomingInterest
)->Result<(),String>{
    fact_to_interest(&mut memory::open_db(&app)?,id,item)
}
#[tauri::command]
pub fn memory_convert_interest_to_fact(
    app:AppHandle,id:i64,fact:String,category:String,tags:Vec<String>
)->Result<(),String>{
    interest_to_fact(&mut memory::open_db(&app)?,id,fact,category,tags)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture()->Connection{
        let db=Connection::open_in_memory().unwrap();
        memory::initialize_database(&db).unwrap();
        db
    }
    fn interest(name:&str)->IncomingInterest {
        IncomingInterest{name:name.into(),kind:"album".into(),status:"like".into(),
            rating:None,notes:"The user called it cool".into(),tags:vec!["metal".into()]}
    }
    #[test]
    fn moves_fact_and_interest_without_creating_copies(){
        let mut db=fixture();
        db.execute("INSERT INTO user_memories(fact,category) VALUES
            ('The user thinks album Karma Bloody Karma is cool','other')",[]).unwrap();
        let id:i64=db.query_row("SELECT id FROM user_memories",[],|r|r.get(0)).unwrap();
        fact_to_interest(&mut db,id,interest("Karma Bloody Karma")).unwrap();
        let fact_count:i64=db.query_row("SELECT COUNT(*) FROM user_memories",[],|r|r.get(0)).unwrap();
        assert_eq!(fact_count,0);
        let (moved_id,status,source):(i64,String,String)=db.query_row(
            "SELECT id,status,source FROM interest_items",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))
        ).unwrap();
        assert_eq!((status.as_str(),source.as_str()),("like","manual-conversion"));
        interest_to_fact(&mut db,moved_id,
            "The user likes the album Karma Bloody Karma".into(),
            "interests".into(),vec!["metal".into()]).unwrap();
        let interest_count:i64=db.query_row("SELECT COUNT(*) FROM interest_items",[],|r|r.get(0)).unwrap();
        assert_eq!(interest_count,0);
        let stored:(String,String)=db.query_row(
            "SELECT fact,category FROM user_memories",[],|r|Ok((r.get(0)?,r.get(1)?))
        ).unwrap();
        assert_eq!(stored.1,"interests");
        assert!(stored.0.contains("Karma Bloody Karma"));
    }
    #[test]
    fn duplicates_or_bad_input_never_delete_source(){
        let mut db=fixture();
        db.execute("INSERT INTO user_memories(fact) VALUES('Humanure was boring')",[]).unwrap();
        db.execute("INSERT INTO interest_items(name,kind,status) VALUES('Humanure','album','dislike')",[]).unwrap();
        let fid:i64=db.query_row("SELECT id FROM user_memories",[],|r|r.get(0)).unwrap();
        let iid:i64=db.query_row("SELECT id FROM interest_items",[],|r|r.get(0)).unwrap();
        assert!(fact_to_interest(&mut db,fid,interest("Humanure")).is_err());
        assert!(interest_to_fact(&mut db,iid,"Humanure was boring".into(),
            "other".into(),vec![]).is_err());
        assert!(fact_to_interest(&mut db,fid,interest("")).is_err());
        let facts:i64=db.query_row("SELECT COUNT(*) FROM user_memories",[],|r|r.get(0)).unwrap();
        let items:i64=db.query_row("SELECT COUNT(*) FROM interest_items",[],|r|r.get(0)).unwrap();
        assert_eq!((facts,items),(1,1));
    }
}
