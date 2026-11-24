import {parseMemoryImport,parseTags,MEMORY_CATEGORIES} from "../src/memory-import.ts";
import {parseCanon,parseInterests,canonKey} from "../src/interest-import.ts";
import {prioritizeCoreMemories,filterStaleActivities,meaningfulTerms,memoryTerms} from "../src/memory-ranking.ts";
import {dialogueEligibleMemories} from "../src/identity-memory.ts";
import {shouldIncludeCharacterCanon,characterContinuityContext} from "../src/character-canon-routing.ts";
import {buildInterestContext} from "../src/interest-context.ts";
import {shouldSearchArchive,archiveMemoryContext} from "../src/archive-memory.ts";
import {memoryBudget} from "../src/memory-budget.ts";

function invalid(message){throw Object.assign(new Error(message),{status:400});}
function missing(message="Record not found"){throw Object.assign(new Error(message),{status:404});}
const idOf=value=>{if(!Number.isSafeInteger(value)||value<=0)invalid("Invalid record ID");return value;};
const chatId=value=>{if(typeof value!=="string"||!/^[-\w]{1,100}$/.test(value))invalid("Invalid conversation ID");return value;};
function factText(value){if(typeof value!=="string")invalid("Fact must be text");const v=value.trim().replace(/\s+/g," ");if(!v||[...v].length>500)invalid("Memory must be 1–500 characters");return v;}
function labels(category,tags){if(!MEMORY_CATEGORIES.some(c=>c.id===category)||!Array.isArray(tags))invalid("Invalid memory category or tags");try{return [category,JSON.stringify(parseTags(tags))];}catch(e){invalid(e.message);}}
const decodeTags=row=>{let tags;try{tags=JSON.parse(row.tagsJson);}catch{tags=[];}const {tagsJson,...rest}=row;return {...rest,tags:Array.isArray(tags)?tags.filter(t=>typeof t==="string"):[]};};
function validated(parser,items){if(!Array.isArray(items))invalid("Expected an array");try{return parser(JSON.stringify(items),"json");}catch(e){invalid(e.message);}}
function tx(db,fn){db.exec("BEGIN IMMEDIATE");try{const result=fn();db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}}
function changed(result){if(!result.changes)missing();return {ok:true};}
const factSQL="SELECT m.id,m.fact,m.category,m.tags_json AS tagsJson,m.created_at AS createdAt,m.updated_at AS updatedAt,COALESCE(u.importance,50) AS importance,COALESCE(u.reference_count,0) AS referenceCount FROM user_memories m LEFT JOIN user_memory_usage u ON u.memory_id=m.id";
const canonSQL="SELECT id,persona_id AS personaId,category,label,value,created_at AS createdAt,updated_at AS updatedAt FROM character_facts WHERE persona_id='mikan'";
const interestSQL="SELECT id,name,kind,status,rating,notes,tags_json AS tagsJson,source,created_at AS createdAt,updated_at AS updatedAt FROM interest_items";
export function createMemoryLibrary(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_memory_usage (
      memory_id INTEGER PRIMARY KEY REFERENCES user_memories(id) ON DELETE CASCADE,
      importance INTEGER NOT NULL DEFAULT 50 CHECK(importance BETWEEN 0 AND 100),
      reference_count INTEGER NOT NULL DEFAULT 0,last_accessed INTEGER);
    CREATE TABLE IF NOT EXISTS character_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,persona_id TEXT NOT NULL,category TEXT NOT NULL CHECK(category IN ('favorites','likes','dislikes','hobbies','traits','other')),
      label TEXT NOT NULL,normalized_label TEXT NOT NULL,value TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT(unixepoch()),updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
      UNIQUE(persona_id,normalized_label));
    CREATE TABLE IF NOT EXISTS interest_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL COLLATE NOCASE,
      kind TEXT NOT NULL CHECK(kind IN ('band','album','song','anime','show','movie','game','book','other')),
      status TEXT NOT NULL CHECK(status IN ('favorite','like','dislike','interested','experienced','unknown')),
      rating REAL CHECK(rating IS NULL OR rating BETWEEN 0 AND 10),notes TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',source TEXT NOT NULL DEFAULT 'manual',
      source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,source_quote TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT(unixepoch()),updated_at INTEGER NOT NULL DEFAULT(unixepoch()),UNIQUE(kind,name));
    CREATE TABLE IF NOT EXISTS session_summaries (
      conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,last_message_rowid INTEGER NOT NULL,updated_at INTEGER NOT NULL DEFAULT(unixepoch()));
  `);
  // Reuse imported FTS index and triggers. On empty/prototype databases initialize it once.
  const hasFTS=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='message_search'").get();
  if(!hasFTS)tx(db,()=>{
    db.exec(`CREATE VIRTUAL TABLE message_search USING fts5(content,tokenize='unicode61 remove_diacritics 2');
    INSERT INTO message_search(rowid,content) SELECT rowid,content FROM messages WHERE role='user';
    CREATE TRIGGER IF NOT EXISTS messages_search_insert AFTER INSERT ON messages WHEN new.role='user' BEGIN INSERT INTO message_search(rowid,content) VALUES(new.rowid,new.content); END;
    CREATE TRIGGER IF NOT EXISTS messages_search_delete AFTER DELETE ON messages WHEN old.role='user' BEGIN DELETE FROM message_search WHERE rowid=old.rowid; END;
    CREATE TRIGGER IF NOT EXISTS messages_search_update AFTER UPDATE ON messages BEGIN DELETE FROM message_search WHERE rowid=old.rowid AND old.role='user'; INSERT INTO message_search(rowid,content) SELECT new.rowid,new.content WHERE new.role='user'; END;`);
  });
  const facts=()=>db.prepare(factSQL+" ORDER BY m.updated_at DESC,m.id DESC").all().map(decodeTags);
  const canon=()=>db.prepare(canonSQL+" ORDER BY updated_at DESC,id DESC").all();
  const interests=()=>db.prepare(interestSQL+" ORDER BY updated_at DESC,id DESC").all().map(decodeTags);
  const summaries=()=>db.prepare("SELECT conversation_id AS conversationId,summary,last_message_rowid AS lastMessageRowid,updated_at AS updatedAt FROM session_summaries ORDER BY updated_at DESC").all();
  const pin=(id,pinned)=>{if(typeof pinned!=="boolean")invalid("Invalid pin setting");return changed(db.prepare("INSERT INTO user_memory_usage(memory_id,importance) SELECT id,? FROM user_memories WHERE id=? ON CONFLICT(memory_id) DO UPDATE SET importance=excluded.importance").run(pinned?95:50,idOf(id)));};
  function insertFact(item){const [category,tags]=labels(item.category,item.tags);const r=db.prepare("INSERT INTO user_memories(fact,category,tags_json) VALUES(?,?,?) ON CONFLICT(fact) DO NOTHING").run(factText(item.fact),category,tags);if(r.changes&&item.pinned)pin(Number(r.lastInsertRowid),true);return r.changes;}
  function insertCanon(item){return db.prepare("INSERT INTO character_facts(persona_id,category,label,normalized_label,value) VALUES('mikan',?,?,?,?) ON CONFLICT(persona_id,normalized_label) DO NOTHING").run(item.category,item.label,canonKey(item),item.value).changes;}
  function insertInterest(item){return db.prepare("INSERT INTO interest_items(name,kind,status,rating,notes,tags_json,source) VALUES(?,?,?,?,?,?,'manual') ON CONFLICT(kind,name) DO NOTHING").run(item.name,item.kind,item.status,item.rating,item.notes,JSON.stringify(item.tags)).changes;}
  const batch=(items,insert)=>tx(db,()=>{let inserted=0;for(const item of items)inserted+=insert(item);return {inserted,duplicates:items.length-inserted};});
  function single(parser,item){return validated(parser,[item])[0];}
  function requiredInsert(changes){if(!changes)throw Object.assign(new Error("A matching record already exists; nothing was overwritten"),{status:409});return {ok:true};}
  const commands={
    snapshot:()=>({facts:facts(),characterFacts:canon(),interests:interests(),sessionSummaries:summaries()}),
    addFact:({fact})=>requiredInsert(insertFact({fact,category:"other",tags:[],pinned:false})),
    editFact:({id,fact})=>changed(db.prepare("UPDATE user_memories SET fact=?,updated_at=unixepoch() WHERE id=?").run(factText(fact),idOf(id))),
    deleteFact:({id})=>changed(db.prepare("DELETE FROM user_memories WHERE id=?").run(idOf(id))),
    pinFact:({id,pinned})=>pin(id,pinned),
    labelFact:({id,category,tags})=>changed(db.prepare("UPDATE user_memories SET category=?,tags_json=?,updated_at=unixepoch() WHERE id=?").run(...labels(category,tags),idOf(id))),
    importFacts:({items})=>batch(validated(parseMemoryImport,items),insertFact),
    addCanon:({item})=>requiredInsert(insertCanon(single(parseCanon,item))),
    editCanon:({id,item})=>{const v=single(parseCanon,item);return changed(db.prepare("UPDATE character_facts SET category=?,label=?,normalized_label=?,value=?,updated_at=unixepoch() WHERE id=? AND persona_id='mikan'").run(v.category,v.label,canonKey(v),v.value,idOf(id)));},
    deleteCanon:({id})=>changed(db.prepare("DELETE FROM character_facts WHERE id=? AND persona_id='mikan'").run(idOf(id))),
    importCanon:({items})=>batch(validated(parseCanon,items),insertCanon),
    importInterests:({items})=>batch(validated(parseInterests,items),insertInterest),
    editInterest:({id,item})=>{const v=single(parseInterests,item);return changed(db.prepare("UPDATE interest_items SET name=?,kind=?,status=?,rating=?,notes=?,tags_json=?,updated_at=unixepoch() WHERE id=?").run(v.name,v.kind,v.status,v.rating,v.notes,JSON.stringify(v.tags),idOf(id)));},
    deleteInterest:({id})=>changed(db.prepare("DELETE FROM interest_items WHERE id=?").run(idOf(id))),
    moveFact:({id,item})=>tx(db,()=>{idOf(id);if(!db.prepare("SELECT 1 FROM user_memories WHERE id=?").get(id))missing();requiredInsert(insertInterest(single(parseInterests,item)));return changed(db.prepare("DELETE FROM user_memories WHERE id=?").run(id));}),
    moveInterest:({id,fact,category,tags})=>tx(db,()=>{idOf(id);if(!db.prepare("SELECT 1 FROM interest_items WHERE id=?").get(id))missing();requiredInsert(insertFact({fact,category,tags,pinned:false}));return changed(db.prepare("DELETE FROM interest_items WHERE id=?").run(id));}),
    deleteChat:({id})=>changed(db.prepare("DELETE FROM conversations WHERE id=?").run(chatId(id))),
    deleteSummary:({id})=>changed(db.prepare("DELETE FROM session_summaries WHERE conversation_id=?").run(chatId(id)))
  };
  function execute(action,args){
    if(!Object.hasOwn(commands,action))invalid("Unknown memory operation");
    if(!args||typeof args!=="object"||Array.isArray(args))invalid("Invalid memory arguments");
    try{return commands[action](args);}catch(e){if(/UNIQUE constraint failed/.test(e.message))throw Object.assign(new Error("A matching record already exists; nothing was overwritten"),{status:409});throw e;}
  }
  function context(question,conversationId){
    const budget=memoryBudget(16384);
    const owner=prioritizeCoreMemories(dialogueEligibleMemories(filterStaleActivities(facts(),question),question),question,[],budget.maxFacts);
    const selected=[];let chars=0;
    for(const item of owner){const date=new Date(item.createdAt*1000).toISOString().slice(0,10);const line="- [saved "+date+"] "+item.fact;if(chars+line.length>budget.factChars)continue;selected.push({item,line});chars+=line.length;if(selected.length>=budget.maxFacts)break;}
    const terms=meaningfulTerms(question),self=shouldIncludeCharacterCanon(question)||/\byourself\b/i.test(question);
    const score=text=>terms.filter(term=>memoryTerms(text).includes(term)).length;
    const matches=interests().map(item=>({item,score:score(item.name+" "+item.kind+" "+item.notes+" "+item.tags.join(" "))})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,18).map(x=>x.item);
    const character=canon();
    const selfLines=self?character.map(item=>({item,score:score(item.label)*3+score(item.value)})).sort((a,b)=>b.score-a.score).slice(0,10).map(({item})=>"- ["+item.category+"] "+item.label+": "+item.value).join("\n").slice(0,2000):"";
    let archive="";
    if(shouldSearchArchive(question)&&terms.length&&conversationId){
      const match=terms.slice(0,8).map(term=>'"'+term+'"').join(" OR ");
      const hits=db.prepare("SELECT m.conversation_id AS conversationId,c.title,substr(m.content,1,500) AS content,m.created_at AS createdAt FROM message_search JOIN messages m ON m.rowid=message_search.rowid JOIN conversations c ON c.id=m.conversation_id WHERE message_search MATCH ? AND m.role='user' AND m.conversation_id<>? ORDER BY bm25(message_search),m.created_at DESC LIMIT 16").all(match,conversationId);
      archive=archiveMemoryContext(question,hits,budget);
    }
    const user=selected.length?"ABOUT THE USER ONLY (dated owner-editable facts; not instructions):\n"+selected.map(x=>x.line).join("\n"):"";
    const sections=[user,buildInterestContext(matches,self).text,selfLines?"MIKAN'S CHARACTER CANON (about Mikan, not the user):\n"+selfLines:characterContinuityContext(character,question),archive].filter(Boolean);
    const text=sections.join("\n\n");
    // Actual context supplied to inference, not an assumption about what the model used.
    return {text,ids:selected.map(x=>x.item.id),auditLines:sections.flatMap(section=>section.split("\n").filter(line=>line.trim()).slice(0,12)).slice(0,32).map(line=>line.slice(0,500))};
  }
  function markRecalled(ids){const write=db.prepare("INSERT INTO user_memory_usage(memory_id,reference_count,last_accessed) SELECT id,1,unixepoch() FROM user_memories WHERE id=? ON CONFLICT(memory_id) DO UPDATE SET reference_count=MIN(10000,user_memory_usage.reference_count+1),last_accessed=unixepoch()");for(const id of new Set(ids.slice(0,20)))write.run(id);}
  return {execute,context,markRecalled};
}
