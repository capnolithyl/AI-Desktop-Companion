import test from "node:test";
import assert from "node:assert/strict";
import {openStore} from "../storage.mjs";
import {createHindsightRouter} from "../hindsight.mjs";
import {createHindsightImporter,OWNER_BANK,CHARACTER_BANK} from "../hindsight-import.mjs";

function fixture(){
  const store=openStore(":memory:");const db=store.db;
  db.exec("INSERT INTO user_memories(fact,category) VALUES('Owner likes metal','interests'); INSERT INTO interest_items(name,kind,status,notes,rating) VALUES('Cobalt Harbor','band','favorite','live shows',9); INSERT INTO character_facts(persona_id,category,label,normalized_label,value) VALUES('mikan','favorites','Color','color','Orange');");
  const chat=store.newConversation();store.append(chat.id,"user","I love tactical games");store.append(chat.id,"assistant","An unverified claim");store.append(chat.id,"user","My password is private");
  db.prepare("INSERT INTO session_summaries(conversation_id,summary,last_message_rowid) VALUES(?,?,?)").run(chat.id,"Owner enjoys tactical games",1);
  return store;
}
test("local preview, explicit consent, source preservation and distinct banks",async()=>{
  const store=fixture();const calls=[];
  try{
    const client={health:async()=>({status:"healthy",database:"connected"}),retain:async(bank,items)=>{calls.push({bank,items});return {success:true,items_count:items.length};},recall:async(bank)=>({results:bank===CHARACTER_BANK?[{id:"c",type:"world",text:"Mikan likes orange"}]:[{id:"u",type:"world",text:"Owner likes metal"}]})};
    const h=createHindsightRouter({db:store.db,localClient:client});
    await h.save({backend:"local",mode:"hindsight",capture:false,dreams:false,dailyBatches:3,dailyDreams:0});
    const imp=h.importer,categories=["facts","interests","character","summaries","messages"],p=imp.preview(categories);
    assert.equal(p.ready,5);assert.equal(p.total,6);assert.equal(p.counts.messages.blocked,1);assert.equal(calls.length,0);
    assert.throws(()=>imp.start({categories,digest:p.digest}),/approval/);
    imp.start({categories,digest:p.digest,consent:true});
    await h.tick({idleMs:1000,consent:false});assert.equal(calls.length,0);
    for(let i=0;i<3;i++)await h.tick({idleMs:61000,consent:false});
    assert.equal(imp.status().done,5);assert.equal(imp.status().queued,0);assert.equal(h.status().batchesToday,3);
    assert.equal(calls.filter(c=>c.bank===CHARACTER_BANK).flatMap(c=>c.items).length,1);
    assert.equal(calls.filter(c=>c.bank===OWNER_BANK).flatMap(c=>c.items).length,4);
    assert.ok(!JSON.stringify(calls).includes("An unverified claim"));assert.ok(!JSON.stringify(calls).includes("My password"));
    assert.equal(new Set(calls.flatMap(c=>c.items.map(i=>i.document_id))).size,5);
    assert.equal(imp.preview(categories).ready,0);assert.equal(store.listMemories().length,1);
    const result=await h.context({question:"favorite color",history:[],base:{text:"",ids:[],auditLines:[]},fallback:{text:"fallback",ids:[],auditLines:[]}});
    assert.match(result.text,/MIKAN CHARACTER MEMORY/);assert.match(result.text,/Mikan likes orange/);
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
