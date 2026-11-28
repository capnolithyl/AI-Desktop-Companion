import test from "node:test";
import assert from "node:assert/strict";
import {openStore} from "../storage.mjs";
import {createHindsightRouter,createHindsightClient} from "../hindsight.mjs";
import {crc32} from "node:zlib";
import {buildArchive,archiveDocument} from "../hindsight-archive.mjs";
import {createHindsightImporter,OWNER_BANK,CHARACTER_BANK} from "../hindsight-import.mjs";

function unpack(zip){
  const entries={};let i=0;
  while(zip.readUInt32LE(i)===0x04034b50){
    const size=zip.readUInt32LE(i+18),nameSize=zip.readUInt16LE(i+26),start=i+30+nameSize+zip.readUInt16LE(i+28),data=zip.subarray(start,start+size);
    assert.equal(crc32(data),zip.readUInt32LE(i+14));entries[zip.toString("utf8",i+30,i+30+nameSize)]=JSON.parse(data);i=start+size;
  }
  assert.equal(zip.readUInt32LE(i),0x02014b50);return entries;
}
function fixture(){
  const store=openStore(":memory:");const db=store.db;
  db.exec("INSERT INTO user_memories(fact,category) VALUES('Owner likes metal','interests'); INSERT INTO interest_items(name,kind,status,notes,rating) VALUES('Cobalt Harbor','band','favorite','live shows',9); INSERT INTO character_facts(persona_id,category,label,normalized_label,value) VALUES('mikan','favorites','Color','color','Orange');");
  const chat=store.newConversation();store.append(chat.id,"user","I love tactical games");store.append(chat.id,"assistant","An unverified claim");store.append(chat.id,"user","My password is private");
  db.prepare("INSERT INTO session_summaries(conversation_id,summary,last_message_rowid) VALUES(?,?,?)").run(chat.id,"Owner enjoys tactical games",1);
  return store;
}
test("local preview, explicit consent, source preservation and distinct banks",async()=>{
  const store=fixture();const calls=[],archives=[];let current,ownerMode="ok";
  try{
    const client={health:async()=>({status:"healthy",database:"connected"}),archiveSupport:async()=>"documents",importArchive:async(bank,zip)=>{const entries=unpack(zip);assert.equal(entries["manifest.json"].schema_version,1);const docs=Object.values(entries).filter(d=>d.facts);archives.push({bank,docs});current=docs.length;return {operation_id:"op-"+archives.length};},operation:async()=>({status:"completed",result_metadata:{documents_imported:current,facts_imported:current}}),retain:async(bank,items)=>{calls.push({bank,items});return {success:true,items_count:items.length};},recall:async(bank)=>{if(bank===CHARACTER_BANK)return {results:[{id:"c",type:"world",text:"Mikan likes orange"}]};if(ownerMode==="timeout")throw Object.assign(Error("timeout"),{name:"TimeoutError"});return {results:ownerMode==="empty"?[]:[{id:"u",type:"world",text:"Owner likes metal"}]};}};
    const h=createHindsightRouter({db:store.db,localClient:client});
    await h.save({backend:"local",mode:"hindsight",capture:false,dreams:false,dailyBatches:3,dailyDreams:0});
    const imp=h.importer,categories=["facts","interests","character","summaries","messages"],p=imp.preview(categories);
    assert.equal(p.ready,5);assert.equal(p.total,6);assert.equal(p.counts.messages.blocked,1);assert.equal(calls.length,0);
    assert.throws(()=>imp.start({categories,digest:p.digest}),/approval/);
    imp.start({categories,digest:p.digest,consent:true});
    await h.tick({idleMs:1000,consent:false});assert.equal(calls.length,0);
    for(let i=0;i<4;i++)await h.tick({idleMs:61000,consent:false,allowLlm:false});
    assert.equal(imp.status().done,4);assert.equal(h.status().batchesToday,0);assert.equal(calls.length,0);
    await h.tick({idleMs:61000,consent:false});
    assert.equal(imp.status().done,5);assert.equal(imp.status().queued,0);assert.equal(h.status().batchesToday,1);
    assert.equal(archives.filter(c=>c.bank===CHARACTER_BANK).flatMap(c=>c.docs).length,1);
    assert.equal(archives.filter(c=>c.bank===OWNER_BANK).flatMap(c=>c.docs).length,3);
    assert.equal(archives.flatMap(c=>c.docs).find(d=>d.facts[0].text==="Owner likes metal").facts[0].fact_type,"world");
    assert.equal(calls.flatMap(c=>c.items).length,1);
    assert.ok(!JSON.stringify(calls).includes("An unverified claim"));assert.ok(!JSON.stringify(calls).includes("My password"));
    assert.equal(new Set([...archives.flatMap(c=>c.docs.map(d=>d.id)),...calls.flatMap(c=>c.items.map(i=>i.document_id))]).size,5);
    assert.equal(imp.preview(categories).ready,0);assert.equal(store.listMemories().length,1);
    let fallbackCalls=0;
    const base={text:"Pinned context",ids:[],auditLines:[]};
    const fallback=async()=>{fallbackCalls++;return {text:"fallback",ids:[],auditLines:[]};};
    const result=await h.context({question:"favorite color",history:[],base,fallback});
    assert.match(result.text,/Owner likes metal/);assert.doesNotMatch(result.text,/Mikan likes orange|fallback/);
    assert.equal(fallbackCalls,0);assert.equal(result.recallDiagnostics[0].bank,"owner");
    const self=await h.context({question:"favorite color",history:[],base,fallback,scope:"character",explicitRecall:true});
    assert.match(self.text,/MIKAN CHARACTER MEMORY/);assert.match(self.text,/Mikan likes orange/);
    assert.doesNotMatch(self.text,/Owner likes metal/);assert.equal(fallbackCalls,0);assert.equal(self.recallDiagnostics[0].bank,"character");
    ownerMode="empty";const empty=await h.context({question:"unrelated topic",history:[],base,fallback});assert.equal(empty.text,"Pinned context");assert.equal(empty.engine,"hindsight");assert.equal(fallbackCalls,0);assert.equal(empty.recallDiagnostics[0].status,"empty");
    const explicit=await h.context({question:"missing fact",history:[],base,fallback,explicitRecall:true});assert.equal(explicit.engine,"sqlite-fallback");assert.equal(fallbackCalls,1);
    ownerMode="timeout";const timed=await h.context({question:"missing fact",history:[],base,fallback});assert.equal(timed.engine,"sqlite-fallback");assert.equal(timed.recallDiagnostics[0].status,"timeout");assert.equal(fallbackCalls,2);assert.equal(h.status().lastRecallBanks[0].status,"timeout");
  }finally{store.db.close();}
});
test("preview invalidation, changed sources, pause/resume and interrupted submissions",()=>{
  const store=fixture();
  try{
    createHindsightRouter({db:store.db});
    let imp=createHindsightImporter({db:store.db}),categories=["facts","interests"],p=imp.preview(categories);
    store.db.exec("UPDATE user_memories SET fact='Owner likes jazz'");
    assert.throws(()=>imp.start({categories,digest:p.digest,consent:true}),/changed/);
    p=imp.preview(categories);imp.start({categories,digest:p.digest,consent:true});imp.pause();assert.equal(imp.next(),null);
    imp.resume();store.db.exec("UPDATE user_memories SET fact='Owner likes punk'");
    const batch=imp.next();assert.equal(batch.items.length,1);assert.equal(imp.status().skipped,1);
    imp=createHindsightImporter({db:store.db});assert.equal(imp.status().uncertain,1);assert.equal(imp.status().enabled,false);
    assert.throws(()=>imp.resume(),/inspection/);
    imp.acknowledge({key:batch.keys[0],decision:"confirmed"});assert.equal(imp.status().done,1);
    assert.equal(imp.preview(categories).ready,0);
  }finally{store.db.close();}
});

test("live retain failures pause the import, and switching away suspends queued imports",async()=>{
  const store=fixture();let attempts=0;
  try{
    const client={health:async()=>({status:"healthy",database:"connected"}),archiveSupport:async()=>"documents",importArchive:async()=>{attempts++;throw Error("transport timeout");}};
    const h=createHindsightRouter({db:store.db,legacyClient:client,localClient:client});
    const settings={mode:"hindsight",capture:false,dreams:false,dailyBatches:12,dailyDreams:0};
    await h.save({...settings,backend:"local"});
    const categories=["facts","character"],p=h.importer.preview(categories);
    h.importer.start({categories,digest:p.digest,consent:true});
    await h.save({...settings,backend:"legacy"});
    await h.tick({idleMs:61000,consent:false});assert.equal(attempts,0);assert.equal(h.importer.status().enabled,false);
    await h.save({...settings,backend:"local"});
    await h.tick({idleMs:61000,consent:false});assert.equal(attempts,0);
    h.importer.resume();await h.tick({idleMs:61000,consent:false});assert.equal(attempts,1);
    assert.equal(h.importer.status().uncertain,1);assert.equal(h.importer.status().queued,1);assert.equal(h.importer.status().enabled,false);
    await h.tick({idleMs:61000,consent:false});assert.equal(attempts,1);
    assert.equal(h.status().batchesToday,0);
  }finally{store.db.close();}
});

test("accepted archive operation survives restart, cannot be submitted twice",()=>{
  const store=fixture();
  try{
    createHindsightRouter({db:store.db});
    let imp=createHindsightImporter({db:store.db}),categories=["facts","interests"],p=imp.preview(categories);
    imp.start({categories,digest:p.digest,consent:true});const batch=imp.next();
    assert.equal(batch.items.length,2);imp.accepted(batch,"archive-op");
    imp=createHindsightImporter({db:store.db});assert.equal(imp.status().uncertain,0);assert.equal(imp.status().archivePending,true);
    assert.equal(imp.pending().operationId,"archive-op");assert.equal(imp.next(),null);
    imp.finish(imp.pending(),true);assert.equal(imp.status().done,2);
  }finally{store.db.close();}
});
test("native multipart archive uses skip, never restore or overwrite",async()=>{
  const calls=[];const client=createHindsightClient({fetcher:async(url,opts)=>{
    calls.push({url:String(url),opts});
    return {ok:true,json:async()=>calls.length===1?{paths:{"/v1/default/banks/{bank_id}/document-transfer":{post:{}}}}:{operation_id:"op"}};
  }});
  const kind=await client.archiveSupport();assert.equal(kind,"documents");
  const zip=buildArchive([archiveDocument({document_id:"test-doc",content:"Owner likes metal",metadata:{updated_at:"2026-11-27T00:00:00Z"}},"facts")]);
  await client.importArchive(OWNER_BANK,zip,kind);assert.match(calls[1].url,/document-transfer\?on_conflict=skip$/);assert.equal(calls[1].opts.redirect,"error");
  assert.deepEqual(Buffer.from(await calls[1].opts.body.get("file").arrayBuffer()),zip);
});
