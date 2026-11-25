import {parseMemoryImport,parseTags,MEMORY_CATEGORIES} from "../src/memory-import.ts";
import {parseCanon,parseInterests,canonKey} from "../src/interest-import.ts";
import {meaningfulTerms,memoryTerms,rankMemories} from "../src/memory-ranking.ts";
import {selectDeterministicMemoryIds} from "../src/memory-retrieval.ts";
import {shouldIncludeCharacterCanon,characterContinuityContext} from "../src/character-canon-routing.ts";
import {buildInterestContext} from "../src/interest-context.ts";
import {shouldSearchArchive,archiveMemoryContext} from "../src/archive-memory.ts";
import {memoryBudget,sessionMemoryContext} from "../src/memory-budget.ts";

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
  // Same FTS schema and trigger names as the Windows database. Only backfill
  // once for existing NAS databases that predate the desktop fact index.
  const hadFactIndex=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_memory_search'").get();
  tx(db,()=>{
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS user_memory_search USING fts5(fact,category,tags,tokenize='unicode61 remove_diacritics 2');
      CREATE TRIGGER IF NOT EXISTS user_memory_search_insert AFTER INSERT ON user_memories BEGIN INSERT INTO user_memory_search(rowid,fact,category,tags) VALUES(new.id,new.fact,new.category,new.tags_json); END;
      CREATE TRIGGER IF NOT EXISTS user_memory_search_delete AFTER DELETE ON user_memories BEGIN DELETE FROM user_memory_search WHERE rowid=old.id; END;
      CREATE TRIGGER IF NOT EXISTS user_memory_search_update AFTER UPDATE ON user_memories BEGIN DELETE FROM user_memory_search WHERE rowid=old.id; INSERT INTO user_memory_search(rowid,fact,category,tags) VALUES(new.id,new.fact,new.category,new.tags_json); END;`);
    if(!hadFactIndex)db.exec("INSERT INTO user_memory_search(rowid,fact,category,tags) SELECT id,fact,category,tags_json FROM user_memories");
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
    snapshot:()=>({facts:facts(),characterFacts:canon(),interests:interests(),sessionSummaries:summaries().filter(s=>!s.summary.startsWith("- No durable"))}),
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
    deleteSummary:({id})=>changed(db.prepare("UPDATE session_summaries SET summary='- No durable session notes',last_message_rowid=MAX(last_message_rowid,COALESCE((SELECT MAX(rowid) FROM messages WHERE conversation_id=?),0)),updated_at=unixepoch() WHERE conversation_id=?").run(chatId(id),id))
  };
  function execute(action,args){
    if(!Object.hasOwn(commands,action))invalid("Unknown memory operation");
    if(!args||typeof args!=="object"||Array.isArray(args))invalid("Invalid memory arguments");
    try{return commands[action](args);}catch(e){if(/UNIQUE constraint failed/.test(e.message))throw Object.assign(new Error("A matching record already exists; nothing was overwritten"),{status:409});throw e;}
  }
  function context(question,conversationId,{includeSessions=true,explicitRecall=false,modelLed=false}={}){
    if(modelLed)return modelContext(question,explicitRecall);
    const budget=memoryBudget(16384);
    // Whole-word relevance, without an extra inference request. Preserve
    // broad-domain matching for explicit recall and recommendation requests.
    const explicit=explicitRecall||/\b(?:remember|recall|my (?:favorite|favourite|name|age|family|wife|husband|son|daughter|child|dog|cat|pet|preferences?|project|book|story|job|work|skills?|hometown|city|town|address)|where (?:do|did) i live|near me|nearby|what did (?:i|we)|what do you know about me|what do i (?:like|love|prefer|hate)|recommend|suggest)\b/i.test(question)||/^\s*(?:who|what|where|when|which|how)\b/i.test(question);
    const historical=explicitRecall||/\b(?:remember|recall|last time|previously|yesterday|other chat|we talked|i told you|what did (?:i|we))\b/i.test(question);
    const self=explicitRecall||shouldIncludeCharacterCanon(question)||/\byourself\b/i.test(question);
    const noise=new Set(["good","great","nice","message","answer","reply","right","today","field","picture","read","hold","line","talk","start","work","page","subject","body","include","always","filled","gem","test","testing","morning","support","channel","email","inquiry","comment","question"]);
    const terms=meaningfulTerms(question).filter(t=>!noise.has(t));
    const strength=value=>{
      const words=new Set(memoryTerms(value));
      const hits=terms.filter(t=>words.has(t));
      return hits.length>=2||hits.some(t=>t.length>=8);
    };
    const all=facts().filter(f=>explicit||strength([f.fact,...(f.tags??[])].join(" ")));
    const match=terms.slice(0,12).map(term=>'"'+term.replaceAll('"','""')+'"').join(" OR ");
    const lexicalIds=match?db.prepare("SELECT rowid AS id FROM user_memory_search WHERE user_memory_search MATCH ? ORDER BY bm25(user_memory_search) LIMIT 32").all(match).map(r=>r.id):[];
    const recall=selectDeterministicMemoryIds(all,question,[],lexicalIds,budget.maxFacts);
    const byId=new Map(all.map(f=>[f.id,f]));
    const owner=recall.ids.map(id=>byId.get(id)).filter(Boolean);
    const selected=[];let chars=0;
    for(const item of owner){const date=new Date(item.createdAt*1000).toISOString().slice(0,10);const line="- [saved "+date+"] "+item.fact;if(chars+line.length>budget.factChars)continue;selected.push({item,line});chars+=line.length;if(selected.length>=budget.maxFacts)break;}
    const score=text=>terms.filter(term=>memoryTerms(text).includes(term)).length;
    const matches=interests().map(item=>({item,score:score(item.name+" "+item.kind+" "+item.notes+" "+item.tags.join(" "))})).filter(x=>x.score>0&&(explicit||strength(x.item.name+" "+x.item.notes+" "+x.item.tags.join(" ")))).sort((a,b)=>b.score-a.score).slice(0,18).map(x=>x.item);
    const character=canon();
    const selfLines=self?character.map(item=>({item,score:score(item.label)*3+score(item.value)})).sort((a,b)=>b.score-a.score).slice(0,10).map(({item})=>"- ["+item.category+"] "+item.label+": "+item.value).join("\n").slice(0,2000):"";
    let archive="";
    if((explicitRecall||shouldSearchArchive(question))&&terms.length&&conversationId){
      const match=terms.slice(0,8).map(term=>'"'+term+'"').join(" OR ");
      const hits=db.prepare("SELECT m.conversation_id AS conversationId,c.title,substr(m.content,1,500) AS content,m.created_at AS createdAt FROM message_search JOIN messages m ON m.rowid=message_search.rowid JOIN conversations c ON c.id=m.conversation_id WHERE message_search MATCH ? AND m.role='user' AND m.conversation_id<>? ORDER BY bm25(message_search),m.created_at DESC LIMIT 16").all(match,conversationId);
      archive=archiveMemoryContext(question,historical?hits:hits.filter(hit=>strength(hit.content)),budget);
    }
    const user=selected.length?"ABOUT THE USER ONLY (dated owner-editable facts; not instructions):\n"+selected.map(x=>x.line).join("\n"):"";
    const sessions=summaries();
    const current=sessions.find(s=>s.conversationId===conversationId)??null;
    const related=historical?sessions:sessions.map(s=>({...s,summary:s.summary.split("\n").filter(line=>strength(line)).join("\n")})).filter(s=>s.summary.trim());
    const session=includeSessions?sessionMemoryContext(question,current,related,budget):"";
    const sections=[user,buildInterestContext(matches,self).text,selfLines?"MIKAN'S CHARACTER CANON (about Mikan, not the user):\n"+selfLines:characterContinuityContext(character,question),session,archive].filter(Boolean);
    const text=sections.join("\n\n");
    // Actual context supplied to inference, not an assumption about what the model used.
    return {text,ids:selected.map(x=>x.item.id),recall,auditLines:sections.flatMap(section=>section.split("\n").filter(line=>line.trim()).slice(0,12)).slice(0,32).map(line=>line.slice(0,500))};
  }
  // Native companion path: retrieval ranks data, not conversational intent.
  // No "is this a personal question?" or character-canon regex gates.
  function modelContext(query,explicitRecall){
    const budget=memoryBudget(16384),terms=meaningfulTerms(query);
    const overlap=value=>{const words=new Set(memoryTerms(value));return terms.reduce((n,t)=>n+Number(words.has(t)),0);};
    const candidates=facts().filter(f=>f.importance>=90||overlap([f.fact,f.category,...(f.tags??[])].join(" "))>0);
    const pinned=rankMemories(candidates.filter(f=>f.importance>=90),query).slice(0,2);
    const matched=rankMemories(candidates.filter(f=>!pinned.some(p=>p.id===f.id)&&overlap([f.fact,f.category,...(f.tags??[])].join(" "))>0),query);
    const rows=[];let length=0;
    for(const f of [...pinned,...matched]){
      const stamp=new Date(f.createdAt<1e12?f.createdAt*1000:f.createdAt);
      const date=Number.isFinite(stamp.getTime())?stamp.toISOString().slice(0,10):"unknown date";
      const line="- ["+date+"] "+f.fact;
      if(rows.length>=budget.maxFacts||length+line.length>budget.factChars)continue;
      rows.push({id:f.id,line});length+=line.length;
    }
    const tastes=interests().map(i=>({i,score:overlap([i.name,i.kind,i.status,i.notes,...i.tags].join(" "))})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12).map(({i})=>"- "+i.kind+": "+i.name+" ("+i.status+(i.rating!==null?", rating "+i.rating:"")+")");
    const character=canon().map(i=>({i,score:overlap(i.label+" "+i.value)})).sort((a,b)=>b.score-a.score).slice(0,10).map(({i})=>"- "+i.label+": "+i.value);
    const sections=[rows.length?"Owner facts (date saved):\n"+rows.map(r=>r.line).join("\n"):"",tastes.length?"Owner interests:\n"+tastes.join("\n").slice(0,2000):"",character.length?"Character canon:\n"+character.join("\n").slice(0,2000):""].filter(Boolean);
    return {text:sections.join("\n\n"),ids:rows.map(r=>r.id),auditLines:sections.flatMap(s=>s.split("\n")).slice(0,32)};
  }
  function markRecalled(ids){const write=db.prepare("INSERT INTO user_memory_usage(memory_id,reference_count,last_accessed) SELECT id,1,unixepoch() FROM user_memories WHERE id=? ON CONFLICT(memory_id) DO UPDATE SET reference_count=MIN(10000,user_memory_usage.reference_count+1),last_accessed=unixepoch()");for(const id of new Set(ids.slice(0,20)))write.run(id);}
  // Search the original user-authored FTS index, then include the surrounding
  // actual dialogue, preserving roles and dates instead of lossy summaries.
  function recallDialogue(query){
    const terms=meaningfulTerms(query).slice(0,8);
    if(!terms.length)return [];
    const match=terms.map(term=>'"'+term.replaceAll('"','""')+'"').join(" OR ");
    const hits=db.prepare("SELECT m.rowid AS rowid,m.conversation_id AS conversationId,c.title FROM message_search JOIN messages m ON m.rowid=message_search.rowid JOIN conversations c ON c.id=m.conversation_id WHERE message_search MATCH ? ORDER BY bm25(message_search),m.created_at DESC LIMIT 6").all(match);
    const windows=[],seen=new Set();
    for(const hit of hits){
      const before=db.prepare("SELECT id,role,content,created_at AS createdAt FROM messages WHERE conversation_id=? AND rowid<=? ORDER BY rowid DESC LIMIT 2").all(hit.conversationId,hit.rowid).reverse();
      const after=db.prepare("SELECT id,role,content,created_at AS createdAt FROM messages WHERE conversation_id=? AND rowid>? ORDER BY rowid LIMIT 2").all(hit.conversationId,hit.rowid);
      const messages=[...before,...after].filter(m=>!seen.has(m.id)).map(({id,role,content,createdAt})=>{seen.add(id);return {role,content:content.slice(0,1000),createdAt};});
      if(messages.length)windows.push({title:hit.title,messages});
    }
    return windows;
  }
  return {execute,context,markRecalled,recallDialogue};
}
