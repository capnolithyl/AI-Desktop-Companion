//! Owner's media/interests collection. Separate from autobiographical facts and Mikan canon.
//! All imports run in one transaction; existing records are never overwritten by bulk imports.
use crate::memory;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const KINDS: &[&str] = &["band","album","anime","show","movie","game","book","other"];
const STATUSES: &[&str] = &["favorite","like","dislike","interested","experienced","unknown"];

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingInterest {
    pub name: String,
    pub kind: String,
    pub status: String,
    #[serde(default)]
    pub rating: Option<f64>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub tags: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterestItem {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub status: String,
    pub rating: Option<f64>,
    pub notes: String,
    pub tags: Vec<String>,
    pub source: String,
    pub created_at: i64,
    pub updated_at: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterestImportResult { pub inserted: usize, pub duplicates: usize }

fn normalized(value: &str, limit: usize, label: &str) -> Result<String, String> {
    let clean = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.is_empty() || clean.chars().count() > limit {
        return Err(format!("{label} must contain 1–{limit} characters"));
    }
    Ok(clean)
}
fn checked(mut item: IncomingInterest) -> Result<IncomingInterest, String> {
    item.name = normalized(&item.name, 180, "Interest name")?;
    item.kind = item.kind.trim().to_lowercase();
    item.status = item.status.trim().to_lowercase();
    if !KINDS.contains(&item.kind.as_str()) || !STATUSES.contains(&item.status.as_str()) {
        return Err("Unknown collection kind or relationship".into());
    }
    if item.rating.is_some_and(|v| !v.is_finite() || !(0.0..=10.0).contains(&v)) {
        return Err("Ratings must be between 0 and 10".into());
    }
    item.notes = item.notes.split_whitespace().collect::<Vec<_>>().join(" ");
    if item.notes.chars().count() > 500 { return Err("Notes are limited to 500 characters".into()); }
    if item.tags.len() > 8 { return Err("Up to eight tags per item".into()); }
    let mut tags = Vec::new();
    for tag in item.tags {
        let value = tag.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
        if value.is_empty() || value.chars().count() > 32 ||
            !value.chars().all(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_')) {
            return Err("Invalid interest tag".into());
        }
        if !tags.contains(&value) { tags.push(value); }
    }
    item.tags = tags;
    Ok(item)
}
fn read(row: &rusqlite::Row<'_>) -> rusqlite::Result<InterestItem> {
    let tags: String = row.get(6)?;
    Ok(InterestItem {
        id:row.get(0)?,name:row.get(1)?,kind:row.get(2)?,
        status:row.get(3)?,rating:row.get(4)?,notes:row.get(5)?,
        tags:serde_json::from_str(&tags).unwrap_or_default(),
        source:row.get(7)?,created_at:row.get(8)?,updated_at:row.get(9)?
    })
}
const SELECT: &str = "SELECT id,name,kind,status,rating,notes,tags_json,source,created_at,updated_at FROM interest_items";

#[tauri::command]
pub fn memory_list_interests(app: AppHandle) -> Result<Vec<InterestItem>, String> {
    let db = memory::open_db(&app)?;
    let mut stmt = db.prepare(&format!("{SELECT} ORDER BY kind,name COLLATE NOCASE LIMIT 5000"))
        .map_err(|e| e.to_string())?;
    let rows=stmt.query_map([],read).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_import_interests(app: AppHandle, items: Vec<IncomingInterest>) -> Result<InterestImportResult,String> {
    if items.is_empty() || items.len()>3000 { return Err("Import 1–3000 interests at a time".into()); }
    let validated = items.into_iter().map(checked).collect::<Result<Vec<_>,_>>()?;
    let mut db = memory::open_db(&app)?;
    let tx = db.transaction().map_err(|e|e.to_string())?;
    let total: i64 = tx.query_row("SELECT COUNT(*) FROM interest_items",[],|row|row.get(0))
        .map_err(|e|e.to_string())?;
    let (mut inserted,mut duplicates)=(0usize,0usize);
    for item in validated {
        let tags=serde_json::to_string(&item.tags).map_err(|e|e.to_string())?;
        let changed=tx.execute(
            "INSERT OR IGNORE INTO interest_items(name,kind,status,rating,notes,tags_json,source)
             VALUES (?1,?2,?3,?4,?5,?6,'import')",
            params![item.name,item.kind,item.status,item.rating,item.notes,tags]
        ).map_err(|e|e.to_string())?;
        if changed==0 { duplicates+=1; } else { inserted+=1; }
        if total+inserted as i64>5000 { return Err("Collection limit is 5000 items".into()); }
    }
    tx.commit().map_err(|e|e.to_string())?;
    Ok(InterestImportResult { inserted,duplicates })
}
#[tauri::command]
pub fn memory_update_interest(app: AppHandle, id: i64, item: IncomingInterest) -> Result<(), String> {
    let item=checked(item)?;
    let db=memory::open_db(&app)?;
    let tags=serde_json::to_string(&item.tags).map_err(|e|e.to_string())?;
    let changed=db.execute(
        "UPDATE interest_items SET name=?1,kind=?2,status=?3,rating=?4,notes=?5,
         tags_json=?6,updated_at=unixepoch() WHERE id=?7",
        params![item.name,item.kind,item.status,item.rating,item.notes,tags,id]
    ).map_err(|e|e.to_string())?;
    if changed==0 { return Err("Collection item not found".into()); }
    Ok(())
}
#[tauri::command]
pub fn memory_delete_interest(app: AppHandle, id: i64) -> Result<(),String> {
    let db=memory::open_db(&app)?;
    if db.execute("DELETE FROM interest_items WHERE id=?1",params![id])
        .map_err(|e|e.to_string())?==0 {return Err("Collection item not found".into());}
    Ok(())
}

/// A direct, explicit owner preference may promote a curated media entry from
/// like/unknown/experienced/interested to favorite. All other curated statuses
/// remain protected; no duplicate and no changes to notes, rating, tags or ID.
fn explicit_favorite(text:&str)->bool {
    text.split(|c:char|!c.is_alphabetic()).any(|word|
        word.eq_ignore_ascii_case("favorite") || word.eq_ignore_ascii_case("favourite"))
}
pub(crate) fn insert_from_conversation(
    db:&Connection, item:IncomingInterest, source_id:&str,
    evidence:&str, user_message:&str
)->Result<bool,String>{
    let item=checked(item)?;
    let owner_favorite=item.status=="favorite" && explicit_favorite(user_message);
    let tags=serde_json::to_string(&item.tags).map_err(|e|e.to_string())?;
    let changed=db.execute(
        "INSERT INTO interest_items
         (name,kind,status,rating,notes,tags_json,source,source_message_id,source_quote)
         VALUES (?1,?2,?3,?4,?5,?6,'conversation',?7,?8)
         ON CONFLICT(kind,name) DO UPDATE SET
           status=excluded.status,source_quote=excluded.source_quote,
           source_message_id=excluded.source_message_id,updated_at=unixepoch()
         WHERE interest_items.status<>excluded.status
           AND (interest_items.source='conversation'
             OR (?9=1 AND excluded.status='favorite'
                 AND interest_items.status IN ('like','interested','experienced','unknown')))",
        params![item.name,item.kind,item.status,item.rating,item.notes,tags,
            source_id,evidence,owner_favorite]
    ).map_err(|e|e.to_string())?;
    Ok(changed>0)
}

fn category_for_query(q: &str) -> Vec<&'static str> {
    let words: Vec<&str> = q.split(|c:char| !c.is_alphanumeric()).filter(|s| !s.is_empty()).collect();
    let any=|terms: &[&str]| words.iter().any(|w| terms.contains(w));
    let mut result=Vec::new();
    if any(&["band","bands","music","artist","artists","song","songs","metal","rock","listen","listening"]) {
        result.extend(["band","album"]);
    }
    if any(&["anime","manga"]) {result.push("anime");}
    if any(&["movie","movies","film","films","cinema"]) {result.push("movie");}
    if any(&["show","shows","series","tv","television"]) {result.extend(["show","anime"]);}
    if any(&["game","games","gaming","play","playing","rpg"]) {result.push("game");}
    if any(&["book","books","novel","novels","read","reading"]) {result.push("book");}
    result
}
#[tauri::command]
pub fn memory_search_interests(app: AppHandle, query: String) -> Result<Vec<InterestItem>,String> {
    if query.chars().count()>2000 {return Err("Search query is too long".into());}
    let q=query.to_lowercase();
    let kinds=category_for_query(&q);
    let overall_favorites=q.contains("my favorite") || q.contains("my favourite")
        || q.contains("my top picks");
    let ignored=&["are","the","what","when","where","who","which","would","should","could","about","that",
        "this","have","with","some","into","your","mine","mikan","tell","does",
        "recommend","recommendation","recommendations","favorite","favorites","favourite",
        "like","likes","liked","dislike","watch","watched","listen","listened",
        "already","ever","best","good","know","interested","something","anything"];
    let terms:Vec<String>=q.split(|c:char| !c.is_alphanumeric())
        .filter(|v|v.chars().count()>=3 && !ignored.contains(v) && !kinds.contains(v))
        .take(8).map(|v|format!("{v}*")).collect();
    if terms.is_empty() && kinds.is_empty() && !overall_favorites{return Ok(vec![]);}
    let db=memory::open_db(&app)?;
    let mut found=Vec::new();
    if overall_favorites && kinds.is_empty() {
        let mut stmt=db.prepare(
            "SELECT id,name,kind,status,rating,notes,tags_json,source,created_at,updated_at
             FROM interest_items WHERE status='favorite'
             ORDER BY updated_at DESC LIMIT 18"
        ).map_err(|e|e.to_string())?;
        let matches=stmt.query_map([],read).map_err(|e|e.to_string())?
            .collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        found.extend(matches);
    }
    if !terms.is_empty(){
        let match_query=terms.join(" OR ");
        let mut stmt=db.prepare(
            "SELECT i.id,i.name,i.kind,i.status,i.rating,i.notes,i.tags_json,i.source,i.created_at,i.updated_at
             FROM interest_search s JOIN interest_items i ON i.id=s.rowid
             WHERE interest_search MATCH ?1 ORDER BY bm25(interest_search),i.updated_at DESC LIMIT 16"
        ).map_err(|e|e.to_string())?;
        let hits=stmt.query_map(params![match_query],read).map_err(|e|e.to_string())?
            .collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        found.extend(hits);
    }
    // Broad 'recommend anime' queries get curated favorites without loading
    // thousands of unrelated records. Exact title matches remain first.
    for kind in kinds {
        let mut stmt=db.prepare(
            "SELECT id,name,kind,status,rating,notes,tags_json,source,created_at,updated_at
             FROM interest_items WHERE kind=?1
             ORDER BY CASE status WHEN 'favorite' THEN 0 WHEN 'like' THEN 1
                  WHEN 'dislike' THEN 2 WHEN 'experienced' THEN 3
                  WHEN 'interested' THEN 4 ELSE 5 END,
                  rating DESC,updated_at DESC LIMIT 12"
        ).map_err(|e|e.to_string())?;
        let entries=stmt.query_map(params![kind],read).map_err(|e|e.to_string())?
            .collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        for entry in entries {
            if !found.iter().any(|it: &InterestItem| it.id==entry.id){found.push(entry);}
            if found.len()>=24 {break;}
        }
        if found.len()>=24 {break;}
    }
    found.truncate(24);
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalization_rejects_invalid_rating_and_status() {
        let input=IncomingInterest {name:" Higurashi ".into(),kind:"anime".into(),
            status:"favorite".into(),rating:Some(10.0),notes:"".into(),tags:vec![]};
        assert_eq!(checked(input.clone()).unwrap().name,"Higurashi");
        let mut invalid=input.clone();invalid.rating=Some(12.0);
        assert!(checked(invalid).is_err());
        let mut invalid=input;invalid.status="watched".into();
        assert!(checked(invalid).is_err());
    }
    #[test]
    fn separate_sqlite_collection_tracks_fts_and_protects_curated_entries() {
        let db=Connection::open_in_memory().unwrap();
        memory::initialize_database(&db).unwrap();
        db.execute(
            "INSERT INTO conversations(id,title,created_at,updated_at) VALUES('c','test',0,0)",[]
        ).unwrap();
        db.execute(
            "INSERT INTO messages(id,conversation_id,role,content,created_at)
             VALUES('u','c','user','I love Higurashi',0)",[]
        ).unwrap();
        let mut preference=IncomingInterest {
            name:"Higurashi".into(),kind:"anime".into(),status:"like".into(),
            rating:None,notes:String::new(),tags:vec![]
        };
        assert!(insert_from_conversation(&db,preference.clone(),"u","I love Higurashi","I love Higurashi").unwrap());
        assert!(!insert_from_conversation(&db,preference.clone(),"u","I love Higurashi","I love Higurashi").unwrap());
        let hits:i64=db.query_row(
            "SELECT count(*) FROM interest_search WHERE interest_search MATCH 'higurashi'",
            [],|r|r.get(0)
        ).unwrap();
        assert_eq!(hits,1);
        preference.status="dislike".into();
        assert!(insert_from_conversation(&db,preference,"u","I dislike Higurashi","I dislike Higurashi").unwrap());
        let saved:String=db.query_row(
            "SELECT status FROM interest_items WHERE name='Higurashi'",[],|r|r.get(0)
        ).unwrap();
        assert_eq!(saved,"dislike");
        db.execute(
            "INSERT INTO interest_items(name,kind,status,source) VALUES('Bathory','band','favorite','import')",[]
        ).unwrap();
        let curated=IncomingInterest {
            name:"bathory".into(),kind:"band".into(),status:"dislike".into(),
            rating:None,notes:String::new(),tags:vec![]
        };
        assert!(!insert_from_conversation(&db,curated,"u","I dislike Bathory","I dislike Bathory").unwrap());
        let preserved:String=db.query_row(
            "SELECT status FROM interest_items WHERE name='Bathory'",[],|r|r.get(0)
        ).unwrap();
        assert_eq!(preserved,"favorite");
    }
    #[test]
    fn newer_explicit_favorite_upgrades_import_without_losing_curated_data() {
        let db=Connection::open_in_memory().unwrap();
        memory::initialize_database(&db).unwrap();
        db.execute(
            r#"INSERT INTO interest_items(name,kind,status,rating,notes,tags_json,source)
               VALUES('Shadows Fall','band','like',8.5,'Existing note','["metal"]','import')"#,
            []
        ).unwrap();
        let old_id:i64=db.query_row("SELECT id FROM interest_items",[],|r|r.get(0)).unwrap();
        let fav=IncomingInterest{
            name:"shadows fall".into(),kind:"band".into(),status:"favorite".into(),
            rating:None,notes:String::new(),tags:vec![]
        };
        assert!(insert_from_conversation(&db,fav.clone(),"message-1",
            "shadows fall","my favorite band is shadows fall").unwrap());
        assert!(!insert_from_conversation(&db,fav,"message-1",
            "shadows fall","my favorite band is shadows fall").unwrap());
        let result:(i64,String,String,String,String,f64)=db.query_row(
            "SELECT id,status,source,notes,tags_json,rating FROM interest_items",[],
            |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?))
        ).unwrap();
        assert_eq!(result.0,old_id);
        assert_eq!(result.1,"favorite");
        assert_eq!(result.2,"import");
        assert_eq!(result.3,"Existing note");
        assert_eq!(result.4,r#"["metal"]"#);
        assert_eq!(result.5,8.5);
        let count:i64=db.query_row("SELECT COUNT(*) FROM interest_items",[],|r|r.get(0)).unwrap();
        assert_eq!(count,1);
    }

    #[test]
    fn curator_protection_blocks_vague_or_conflicting_statuses() {
        let db=Connection::open_in_memory().unwrap();
        memory::initialize_database(&db).unwrap();
        db.execute(
            "INSERT INTO interest_items(name,kind,status,source)
             VALUES('Sakura Trick','anime','like','manual')",[]
        ).unwrap();
        let fav=IncomingInterest{
            name:"Sakura Trick".into(),kind:"anime".into(),status:"favorite".into(),
            rating:None,notes:String::new(),tags:vec![]
        };
        assert!(!insert_from_conversation(&db,fav.clone(),"message-2",
            "Sakura Trick","I like Sakura Trick").unwrap());
        assert!(insert_from_conversation(&db,fav.clone(),"message-3",
            "Sakura Trick","Sakura Trick is my favourite anime").unwrap());
        let weaker=IncomingInterest{status:"like".into(),..fav.clone()};
        assert!(!insert_from_conversation(&db,weaker,"message-4",
            "Sakura Trick","I like Sakura Trick").unwrap());
        let contrary=IncomingInterest{status:"dislike".into(),..fav};
        assert!(!insert_from_conversation(&db,contrary,"message-5",
            "Sakura Trick","I dislike Sakura Trick").unwrap());
        let status:String=db.query_row("SELECT status FROM interest_items",[],|r|r.get(0)).unwrap();
        assert_eq!(status,"favorite");
    }

    #[test]
    fn kind_detection_does_not_treat_generic_chat_as_collection_search() {
        assert!(category_for_query("hello there").is_empty());
        assert_eq!(category_for_query("recommend anime"),vec!["anime"]);
        assert_eq!(category_for_query("favorite metal bands"),vec!["band","album"]);
    }
}
