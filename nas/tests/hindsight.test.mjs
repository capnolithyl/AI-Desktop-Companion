import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHindsightClient,createHindsight,formatHindsight,recallContext} from "../hindsight.mjs";
test("bounded metadata preserves event and mention dates",()=>{
  const lines=formatHindsight({results:[{id:"a",type:"observation",text:"Moved to Hamburg",occurred_start:"2026-11-27",mentioned_at:"2026-11-28"}]});
  assert.equal(JSON.parse(lines[0]).occurred_start,"2026-11-27");
  assert.equal(JSON.parse(lines[0]).mentioned_at,"2026-11-28");
});
test("recall prefers observations, no reflect or redirect",async()=>{
  let call;const client=createHindsightClient({fetcher:async(url,opts)=>{call={url:String(url),opts};return {ok:true,json:async()=>({results:[]})};}});
  await client.recall("sandbox","music");
  assert.match(call.url,/sandbox\/memories\/recall$/);
  assert.equal(JSON.parse(call.opts.body).prefer_observations,true);
  assert.equal(call.opts.redirect,"error");
});
test("unavailable recall can fall back, strict benchmark cannot",async()=>{
  const client={recall:async()=>{throw Error("offline");}};
  assert.equal(await recallContext(client,"test","q",{text:""}),null);
  await assert.rejects(recallContext(client,"test","q",{text:""},{strict:true}));
});
test("default off, explicit consent, idle queue and daily dream caps",async()=>{
  const db=new DatabaseSync(":memory:");db.exec("CREATE TABLE conversations(id TEXT PRIMARY KEY); CREATE TABLE messages(id TEXT PRIMARY KEY,content TEXT); INSERT INTO conversations VALUES('c'); INSERT INTO messages VALUES('u','I love metal');");
  let retained=0,dreamed=0,clock=Date.parse("2026-11-27T12:00:00Z");const client={health:async()=>({status:"healthy",database:"connected"}),retain:async()=>{retained++;return {success:true};},models:async()=>({items:[]}),create:async()=>{dreamed++;return {operation_id:"op"};},operation:async()=>({status:"completed"})};
  const h=createHindsight({db,client,now:()=>clock});const u={id:"u",content:"I love metal"};
  assert.equal(h.enqueue(u,"c",true),false);
  await h.save({mode:"hindsight",capture:true,dreams:true,dailyBatches:1,dailyDreams:1});
  assert.equal(h.enqueue(u,"c",false),false);
  assert.equal(h.enqueue(u,"c",true),true);
  await h.tick({idleMs:1000,consent:true});assert.equal(retained,0);
  await h.tick({idleMs:61000,consent:true});assert.equal(retained,1);
  await h.tick({idleMs:31*60000,consent:true});assert.equal(dreamed,1);
  await h.tick({idleMs:31*60000,consent:true});await h.tick({idleMs:31*60000,consent:true});assert.equal(dreamed,1);
  db.close();
});

test("empty benchmark recall is valid, not a transport failure",async()=>{const r=await recallContext({recall:async()=>({results:[]})},"test","q",{text:"",ids:[],auditLines:[]},{strict:true});assert.equal(r.engine,"hindsight");assert.deepEqual(r.auditLines,[]);});
