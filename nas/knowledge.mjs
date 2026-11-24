import {readFileSync,writeFileSync,renameSync,unlinkSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {joinNotionChunks,buildNotionChapterEvidence,readNotionChapter,notionManuscriptCharacterCount} from "../src/notion-reading.ts";
import {webURL} from "./research.mjs";
const invalid=(message,status=400)=>Object.assign(Error(message),{status});
const MAX_PAGES=1000,MAX_BLOCKS=30000,MAX_CHARS=16000000;
const idOk=id=>typeof id==="string"&&/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(id);
const canonical=id=>id.replaceAll("-","").toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
const rt=items=>Array.isArray(items)?items.map(x=>x.plain_text??x.text?.content??"").join(""):"";
const notionUrl=id=>"https://www.notion.so/"+id.replaceAll("-","");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function meta(value){
  if(!idOk(value?.id)||!["page","database","data_source"].includes(value.object))return null;
  const id=canonical(value.id),title=value.object==="page"?rt(Object.values(value.properties??{}).find(p=>p.type==="title")?.title):rt(value.title);
  return {id,title:title||"Untitled Notion "+value.object,url:notionUrl(id),kind:value.object,lastEdited:value.last_edited_time??""};
}
export function notionApi(token,{fetchImpl=fetch,wait=sleep}={}){
  let next=0;
  async function request(path,body){
    const delay=Math.max(0,next-Date.now());if(delay)await wait(delay);next=Date.now()+350;
    const response=await fetchImpl("https://api.notion.com/v1/"+path,{method:body?"POST":"GET",redirect:"error",signal:AbortSignal.timeout(30000),headers:{Authorization:"Bearer "+token,"Notion-Version":"2025-09-03","Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw invalid(response.status===429?"Notion rate limit reached; retry sync later":"Notion request failed (HTTP "+response.status+")",response.status===429?429:502);}
    const reader=response.body?.getReader();if(!reader)throw invalid("Empty Notion response",502);
    let size=0;const parts=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5000000)throw invalid("Notion response exceeds safe size",502);parts.push(Buffer.from(value));}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  }
  async function list(path,body=null,max=MAX_BLOCKS){
    let cursor=null;const result=[],seen=new Set();
    do{
      const params=new URLSearchParams({page_size:"100",...(cursor?{start_cursor:cursor}:{})});
      const data=await request(body?path:path+"?"+params,body?{...body,page_size:100,...(cursor?{start_cursor:cursor}:{})}:undefined);
      if(!Array.isArray(data.results))throw invalid("Incomplete Notion pagination",502);
      result.push(...data.results);if(result.length>max)throw invalid("Notion library exceeds safe sync limit");
      if(!data.has_more)break;
      cursor=data.next_cursor;if(typeof cursor!=="string"||!cursor||seen.has(cursor))throw invalid("Incomplete Notion pagination",502);seen.add(cursor);
    }while(true);
    return result;
  }
  return {request,list};
}
export function notionChunks(text){
  const chars=Array.from(text),out=[];
  for(let i=0;i<chars.length;i+=1580){out.push(chars.slice(i,i+1800).join(""));if(i+1800>=chars.length)break;}
  return out;
}
function blockText(block){
  const kind=block.type,v=block[kind]??{};
  if(kind==="table_row")return (v.cells??[]).map(rt).join(" | ");
  let text=rt(v.rich_text)||rt(v.caption);
  if(kind.startsWith("heading_")&&text)text="# "+text;
  if(kind==="to_do")text=(v.checked?"[x] ":"[ ] ")+text;
  return text;
}
async function collect(api,roots,progress){
  const queue=[...roots],seen=new Set(),pages=[];let blocks=0,chars=0;
  function enqueue(value){const row=meta(value);if(row)queue.push(row);}
  while(queue.length){
    const root=queue.shift(),id=root.id;
    if(seen.has(id))continue;seen.add(id);if(seen.size>MAX_PAGES)throw invalid("Library exceeds "+MAX_PAGES+" objects; select fewer pages");
    progress(pages.length,root.title);
    if(root.kind==="database"){
      const db=await api.request("databases/"+id);
      for(const src of db.data_sources??[])if(idOk(src.id))queue.push({id:canonical(src.id),kind:"data_source",title:src.name??root.title});
      continue;
    }
    if(root.kind==="data_source"){
      for(const row of await api.list("data_sources/"+id+"/query",{},MAX_PAGES))enqueue(row);
      continue;
    }
    const current=await api.request("pages/"+id),page=meta(current);
    if(!page)throw invalid("Invalid page metadata",502);
    const properties=[],relations=[];
    for(const [name,p] of Object.entries(current.properties??{})){
      if(p.type==="relation"){
        let rows=p.relation??[];
        if(p.has_more){
          if(typeof p.id!=="string")throw invalid("Incomplete relation property",502);
          rows=(await api.list("pages/"+id+"/properties/"+encodeURIComponent(p.id))).map(x=>x.relation);
        }
        for(const row of rows)if(idOk(row?.id))relations.push({property:name,id:canonical(row.id)});
      }else if(p.type!=="title"){
        const value=p.type==="rich_text"?rt(p.rich_text):["status","select"].includes(p.type)?p[p.type]?.name:p.type==="date"?p.date?.start:["number","checkbox","url"].includes(p.type)?p[p.type]:null;
        if(value!==null&&value!==undefined&&String(value).trim())properties.push("Notion property "+name+": "+String(value).slice(0,12000));
      }
    }
    const text=[];
    async function visit(parent,depth){
      if(depth>24)throw invalid("Notion nesting exceeds safe limit");
      for(const b of await api.list("blocks/"+parent+"/children")){
        if(++blocks>MAX_BLOCKS)throw invalid("Notion block limit exceeded");
        if(b.type==="child_page"||b.type==="child_database"){
          if(idOk(b.id))queue.push({id:canonical(b.id),kind:b.type==="child_page"?"page":"database",title:b[b.type]?.title??"Untitled"});continue;
        }
        const line=blockText(b);if(line.trim())text.push(line);
        if(b.has_children&&idOk(b.id))await visit(canonical(b.id),depth+1);
      }
    }
    await visit(id,0);
    const content=[...properties,...text].join("\n\n");if(content.length>1000000)throw invalid("A Notion page exceeds safe text budget");chars+=content.length;
    if(chars>MAX_CHARS)throw invalid("Knowledge library exceeds safe text budget");
    pages.push({...page,chunks:notionChunks(content),relations});
  }
  return pages;
}
export function createKnowledge({db,file="",apiFactory=notionApi,now=Date.now,read}){
  db.exec("CREATE TABLE IF NOT EXISTS notion_pages(id TEXT PRIMARY KEY,title TEXT NOT NULL,url TEXT NOT NULL,last_edited TEXT NOT NULL,synced_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS notion_chunks(id INTEGER PRIMARY KEY,page_id TEXT NOT NULL REFERENCES notion_pages(id) ON DELETE CASCADE,title TEXT NOT NULL,content TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS notion_fts USING fts5(title,content,tokenize='unicode61 remove_diacritics 2'); CREATE TABLE IF NOT EXISTS notion_page_relations(page_id TEXT NOT NULL,property TEXT NOT NULL,target_id TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(page_id,property,target_id)); CREATE TABLE IF NOT EXISTS nas_knowledge_config(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS nas_web_cache(url TEXT PRIMARY KEY,resolved_url TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,fetched_at INTEGER NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS nas_web_fts USING fts5(url UNINDEXED,title,content,tokenize='unicode61 remove_diacritics 2')");
  const get=(key,fallback)=>{const r=db.prepare("SELECT value FROM nas_knowledge_config WHERE key=?").get(key);return r?JSON.parse(r.value):fallback;};
  const set=(key,value)=>db.prepare("INSERT INTO nas_knowledge_config VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key,JSON.stringify(value));
  let token="",syncing=false,job={state:"idle",done:0,title:"",error:null},available=[];
  if(file){try{token=readFileSync(file,"utf8").trim();}catch(e){if(e.code!=="ENOENT")throw Error("Could not open Notion credential");}}
  const enabled=()=>get("allowNotionCloud",false)===true;
  const webEnabled=()=>get("cacheWeb",true)===true;
  function pages(){return db.prepare("SELECT p.id,p.title,p.url,p.synced_at AS syncedAt,p.last_edited AS lastEdited,COUNT(c.id) AS chunkCount,COALESCE(SUM(length(c.content)),0) AS characters FROM notion_pages p LEFT JOIN notion_chunks c ON c.page_id=p.id GROUP BY p.id ORDER BY p.title COLLATE NOCASE LIMIT 10000").all();}
  function webPages(){return db.prepare("SELECT url AS id,resolved_url AS url,title,length(content) AS characters,fetched_at AS fetchedAt FROM nas_web_cache ORDER BY fetched_at DESC LIMIT 200").all();}
  function status(){return {connected:!!token,allowNotionCloud:enabled(),cacheWeb:webEnabled(),allPages:get("allPages",false),selected:get("selected",[]),available,job:{...job},pages:pages(),webPages:webPages()};}
  function api(){if(!token)throw invalid("Connect Notion first",409);return apiFactory(token);}
  function idle(){if(syncing)throw invalid("Notion sync is running",409);}
  async function listWith(client){const result=(await client.list("search",{},MAX_PAGES)).map(meta).filter(Boolean);return [...new Map(result.map(r=>[r.id,r])).values()];}
  async function connect(secret){
    idle();if(typeof secret!=="string"||secret.length<20||secret.length>512||/\s/.test(secret))throw invalid("Enter a valid Notion integration secret");
    syncing=true;
    try{const client=apiFactory(secret);await client.request("users/me");const found=await listWith(client);
      if(file){const tmp=file+"."+randomUUID();try{writeFileSync(tmp,secret,{mode:0o600,flag:"wx"});renameSync(tmp,file);}catch{try{unlinkSync(tmp);}catch{}throw invalid("Could not save Notion credential",500);}}
      token=secret;available=found;set("allowNotionCloud",false);set("selected",[]);set("allPages",false);return status();
    }finally{syncing=false;}
  }
  async function refresh(){idle();syncing=true;try{available=await listWith(api());return status();}finally{syncing=false;}}
  function settings(patch){
    idle();
    if(patch?.selected!==undefined&&(!Array.isArray(patch.selected)||patch.selected.length>MAX_PAGES||patch.selected.some(id=>!idOk(id))))throw invalid("Invalid page selection");
    if(typeof patch?.allowNotionCloud==="boolean")set("allowNotionCloud",patch.allowNotionCloud);
    if(typeof patch?.cacheWeb==="boolean")set("cacheWeb",patch.cacheWeb);
    if(typeof patch?.allPages==="boolean")set("allPages",patch.allPages);
    if(patch?.selected!==undefined)set("selected",[...new Set(patch.selected.map(canonical))]);
    return status();
  }
  function tx(fn){db.exec("BEGIN IMMEDIATE");try{const value=fn();db.exec("COMMIT");return value;}catch(e){db.exec("ROLLBACK");throw e;}}
  function replacePages(rows){
    tx(()=>{db.exec("DELETE FROM notion_page_relations; DELETE FROM notion_fts; DELETE FROM notion_chunks; DELETE FROM notion_pages;");
      const page=db.prepare("INSERT INTO notion_pages(id,title,url,last_edited,synced_at) VALUES(?,?,?,?,?)"),chunk=db.prepare("INSERT INTO notion_chunks(page_id,title,content) VALUES(?,?,?)"),fts=db.prepare("INSERT INTO notion_fts(rowid,title,content) VALUES(?,?,?)"),rel=db.prepare("INSERT OR IGNORE INTO notion_page_relations(page_id,property,target_id,position) VALUES(?,?,?,?)");
      for(const p of rows){page.run(p.id,p.title,p.url,p.lastEdited,Math.floor(now()/1000));for(const [i,r] of p.relations.entries())rel.run(p.id,r.property,r.id,i);for(const c of p.chunks){const row=chunk.run(p.id,p.title,c);fts.run(row.lastInsertRowid,p.title,c);}}
    });
  }
  function sync(){
    idle();const client=api(),all=get("allPages",false),selected=get("selected",[]);
    if(!all&&!selected.length)throw invalid("Choose shared pages or all shared pages before syncing");
    syncing=true;job={state:"running",done:0,title:"Discovering pages",error:null};
    void (async()=>{try{
      available=await listWith(client);const roots=available.filter(r=>all||selected.includes(r.id));
      const rows=await collect(client,roots,(done,title)=>{job={state:"running",done,title,error:null};});
      replacePages(rows);job={state:"finished",done:rows.length,title:"",error:null};
    }catch(e){job={...job,state:"failed",error:e?.status?e.message:"Notion sync failed; previous cache preserved"};}
    finally{syncing=false;}})();
    return status();
  }
  function disconnect(){idle();if(file)try{unlinkSync(file);}catch(e){if(e.code!=="ENOENT")throw invalid("Could not remove credential",500);}token="";available=[];set("allowNotionCloud",false);set("allPages",false);set("selected",[]);replacePages([]);job={state:"idle",done:0,title:"",error:null};return status();}
  function document(id){
    if(!idOk(id))throw invalid("Invalid page ID");
    const p=db.prepare("SELECT id,title,url,synced_at AS syncedAt FROM notion_pages WHERE id=?").get(id);if(!p)throw invalid("Page is not cached",404);
    const chunks=id=>db.prepare("SELECT content FROM notion_chunks WHERE page_id=? ORDER BY id").all(id).map(r=>r.content);
    const targets=db.prepare("SELECT target_id FROM notion_page_relations WHERE page_id=? AND property='Scenes' ORDER BY position").all(id);
    const relatedPages=[];let missingRelatedPages=0;
    for(const t of targets){const scene=db.prepare("SELECT title,url FROM notion_pages WHERE id=?").get(t.target_id);if(scene)relatedPages.push({...scene,chunks:chunks(t.target_id)});else missingRelatedPages++;}
    const doc={...p,chunks:chunks(id),relatedPages,missingRelatedPages};
    if(doc.chunks.reduce((n,c)=>n+c.length,0)+relatedPages.reduce((n,s)=>n+s.chunks.reduce((x,c)=>x+c.length,0),0)>2000000)throw invalid("Document exceeds reading limit");
    return doc;
  }
  const terms=q=>[...new Set(String(q).normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu)??[])].filter(t=>t.length>=2).slice(0,24).map(t=>'"'+t+'"').join(" OR ");
  function candidates(question,history,previous=[]){
    const query=terms([...history.filter(m=>m.role==="user").slice(-3).map(m=>m.content),question].join(" "));
    const out=[];
    if(enabled()){
      const prior=previous.filter(s=>s.kind==="notion").map(s=>s.id);
      const rows=query?db.prepare("SELECT c.page_id AS id FROM notion_fts JOIN notion_chunks c ON c.id=notion_fts.rowid WHERE notion_fts MATCH ? ORDER BY bm25(notion_fts) LIMIT 100").all(query):[];
      const all=pages();const wanted=[...new Set([...prior,...rows.map(r=>r.id)])];
      const chosen=[...wanted.map(id=>all.find(p=>p.id===id)).filter(Boolean),...all.filter(p=>!wanted.includes(p.id))].slice(0,120);
      for(const p of chosen)out.push({id:p.id,title:p.title.slice(0,180),kind:"notion",url:p.url,syncedAt:p.syncedAt});
    }
    if(webEnabled()&&query){
      const rows=db.prepare("SELECT url,title FROM nas_web_fts WHERE nas_web_fts MATCH ? ORDER BY bm25(nas_web_fts) LIMIT 12").all(query);
      for(const p of rows){const row=db.prepare("SELECT fetched_at AS fetchedAt,resolved_url AS url FROM nas_web_cache WHERE url=?").get(p.url);if(row&&now()-row.fetchedAt<86400000)out.push({id:p.url,title:p.title.slice(0,180),kind:"cached-web",...row});}
    }
    return out;
  }
  async function load(p,scope,question,provider){
    if(p.kind==="notion"){
      if(!enabled())throw invalid("Notion cloud retrieval is disabled");
      const doc=document(p.id);
      let text,coverage="excerpt";
      if(scope==="manuscript"){
        const evidence=buildNotionChapterEvidence(doc);
        text=await readNotionChapter(doc,async()=>{throw Error("No auxiliary summarization");},()=>{},()=>false,provider==="nvidia"?48000:16384,"direct-only");
        coverage="complete approved manuscript ("+evidence.scenes.length+" scenes, "+notionManuscriptCharacterCount(evidence)+" characters)";
      }else if(scope==="full"){
        const original=joinNotionChunks(doc.chunks);if(doc.relatedPages.length||doc.missingRelatedPages)throw invalid("Select manuscript reading to include linked scenes");
        if(original.length>(provider==="nvidia"?75000:24000))throw invalid("Page exceeds direct reading budget; request a shorter section");
        text=original;coverage="complete cached page";
      }else{
        const query=terms(question);
        const hits=query?db.prepare("SELECT c.content FROM notion_fts JOIN notion_chunks c ON c.id=notion_fts.rowid WHERE notion_fts MATCH ? AND c.page_id=? ORDER BY bm25(notion_fts) LIMIT 6").all(query,p.id):[];
        text=(hits.length?hits.map(r=>r.content):doc.chunks.slice(0,2)).join("\n\n").slice(0,10000);
      }
      if(!text.trim())throw invalid("No readable cached text");
      return {id:p.id,url:doc.url,title:doc.title,kind:"notion",content:text,syncedAt:doc.syncedAt,coverage,publishedDate:null};
    }
    if(!webEnabled())throw invalid("Web cache disabled");
    const row=db.prepare("SELECT * FROM nas_web_cache WHERE url=?").get(p.id);
    if(!row)throw invalid("Cached webpage not found");
    return {id:p.id,url:row.resolved_url,title:row.title,kind:"cached-web",content:row.content,fetchedAt:row.fetched_at,coverage:"cached page excerpt",publishedDate:null};
  }
  async function cachedRead(value,{fresh=false,recent=false}={}){
    const url=webURL(value);if(!url)throw invalid("Invalid public URL");
    const key=url.href,cacheable=!url.search,old=cacheable?db.prepare("SELECT * FROM nas_web_cache WHERE url=?").get(key):null,ttl=recent?3600000:86400000;
    if(webEnabled()&&!fresh&&old&&now()-old.fetched_at<ttl)return {url:old.resolved_url,title:old.title,content:old.content,kind:"page",publishedDate:null,fetchedAt:old.fetched_at,fromCache:true};
    const result=await read(key),fetchedAt=now();
    if(webEnabled()&&cacheable&&!new URL(result.url).search)tx(()=>{
      db.prepare("INSERT INTO nas_web_cache VALUES(?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET resolved_url=excluded.resolved_url,title=excluded.title,content=excluded.content,fetched_at=excluded.fetched_at").run(key,result.url,result.title,result.content.slice(0,10000),fetchedAt);
      db.prepare("DELETE FROM nas_web_fts WHERE url=?").run(key);db.prepare("INSERT INTO nas_web_fts(url,title,content) VALUES(?,?,?)").run(key,result.title,result.content.slice(0,10000));
      db.exec("DELETE FROM nas_web_cache WHERE url NOT IN (SELECT url FROM nas_web_cache ORDER BY fetched_at DESC LIMIT 200); DELETE FROM nas_web_fts WHERE url NOT IN (SELECT url FROM nas_web_cache);");
    });
    return {...result,fetchedAt,fromCache:false};
  }
  function remove(kind,id){
    idle();tx(()=>{if(kind==="notion"){
      db.prepare("DELETE FROM notion_fts WHERE rowid IN (SELECT id FROM notion_chunks WHERE page_id=?)").run(id);db.prepare("DELETE FROM notion_page_relations WHERE page_id=?").run(id);db.prepare("DELETE FROM notion_chunks WHERE page_id=?").run(id);db.prepare("DELETE FROM notion_pages WHERE id=?").run(id);
    }else if(kind==="web"){db.prepare("DELETE FROM nas_web_fts WHERE url=?").run(id);db.prepare("DELETE FROM nas_web_cache WHERE url=?").run(id);}else throw invalid("Unknown knowledge kind");});return status();
  }
  function inspect(kind,id){if(kind==="notion"){const doc=document(id);return {title:doc.title,url:doc.url,content:joinNotionChunks(doc.chunks).slice(0,30000),relatedPages:doc.relatedPages.map(s=>({title:s.title,url:s.url})),missingRelatedPages:doc.missingRelatedPages};}if(kind==="web"){const row=db.prepare("SELECT title,resolved_url AS url,content FROM nas_web_cache WHERE url=?").get(id);if(row)return row;}throw invalid("Cached document not found",404);}
  return {status,connect,refresh,settings,sync,disconnect,candidates,load,cachedRead,remove,inspect,isRunning:()=>syncing,enabled,webEnabled};
}
