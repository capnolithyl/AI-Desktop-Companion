import "../../src/memory-retrieval.test.mjs";
import "../../src/memory-budget.test.mjs";
import "../../src/session-memory.test.mjs";
import "../../tests/assistant-instructions.test.mjs";
import "../../src/runtime-context.test.mjs";
import "../../src/evidence-verification.test.mjs";
// Run the original desktop regression suites against the same shared modules.
import "../../src/notion-knowledge.test.mjs";
import "../../src/notion-reading.test.mjs";
import {publicIPv4,webURL,searchResults,readWeb,researchTurn,researchSettings} from "../research.mjs";
import {providerSettings,boundedHistory} from "../provider-settings.mjs";
import {updateControl} from "../update-control.mjs";
import {nasActivity} from "../../src/web/nas-activity.ts";
import {memoryNotice} from "../../src/web/memory-notifications.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore, recall } from "../storage.mjs";
import { makeServer } from "../server.mjs";
import { generateReply, providerConfig } from "../providers.mjs";
import { exportCompanionProfile, DEFAULT_COMPANION_PROFILE } from "../../src/companion-profile.ts";

test("NAS storage preserves and reuses desktop-compatible SQLite records",()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-nas-"));
  try {
    const path=join(root,"mikan-memory.sqlite3"), store=openStore(path);
    const chat=store.newConversation();
    store.append(chat.id,"user","What is my favorite music?");
    store.append(chat.id,"assistant","Tell me more.");
    store.addMemory("My favorite band is Shadows Fall.");
    assert.equal(store.messages(chat.id).length,2);
    assert.match(recall(store,"favorite band")[0],/Shadows Fall/);
    store.db.close();
    const reopened=openStore(path);
    assert.equal(reopened.messages(chat.id).length,2);
    assert.equal(reopened.listMemories().length,1);
    reopened.saveProfile({...DEFAULT_COMPANION_PROFILE,personality:{...DEFAULT_COMPANION_PROFILE.personality,flirtiness:95}});
    reopened.db.close();
    const again=openStore(path);
    assert.equal(again.getProfile().personality.flirtiness,95);
    again.db.close();
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("NAS history preserves insertion order for messages with identical timestamps",()=>{
  const store=openStore(":memory:");
  try{
    const chat=store.newConversation();
    const first=store.append(chat.id,"user","First");
    const second=store.append(chat.id,"assistant","Second");
    const third=store.append(chat.id,"user","Third");
    store.db.prepare("UPDATE messages SET created_at=? WHERE conversation_id=?").run(1700000000000,chat.id);
    assert.deepEqual(store.messages(chat.id).map(m=>m.id),[first.id,second.id,third.id]);
    assert.deepEqual(store.messages(chat.id,2).map(m=>m.id),[second.id,third.id]);
    assert.equal(store.messages(chat.id,1)[0].id,third.id);
    assert.ok(!("insertion_order" in store.messages(chat.id)[0]));
  }finally{store.db.close();}
});

test("NAS HTTP requires a key, streams replies and persists them",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-api-"));
  const store=openStore(join(root,"db.sqlite3"));
  const key="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const server=makeServer({
    store,key,config:{provider:"nvidia",model:"test",key:"not-a-real-provider-key"},
    generate:async ({history,onDelta,system})=>{
      assert.match(system,/Flirtiness 95\/100/);
      assert.match(system,/PERSONAL DETAIL ACCURACY/);assert.match(system,/CONVERSATION FOCUS/);assert.match(system,/America\/Detroit/);
      assert.match(system,/Never call me by my name/);
      assert.equal(history.at(-1).content,"Testing one two");
      onDelta("Me");onDelta("ow!");
      return "Meow!";
    }
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  try {
    const page=await fetch(base+"/legacy");
    assert.equal(page.status,200);
    const csp=page.headers.get("content-security-policy");
    const connect=csp.split(";").map(part=>part.trim()).find(part=>part.startsWith("connect-src "));
    assert.equal(connect,"connect-src 'self' data:");
    assert.match(csp,/script-src 'self';/);
    assert.equal((await fetch(base+"/api/status")).status,401);
    const headers={Authorization:"Bearer "+key,"Content-Type":"application/json"};
    assert.equal((await fetch(base+"/api/profile")).status,401);
    assert.equal((await fetch(base+"/api/library")).status,401);
    assert.equal((await fetch(base+"/api/learning")).status,401);
    assert.equal((await fetch(base+"/api/learning",{headers})).status,200);
    assert.equal((await fetch(base+"/api/library",{method:"POST",headers,body:JSON.stringify({action:"addFact",args:{fact:"A new owner-approved test fact"}})})).status,200);
    const library=await (await fetch(base+"/api/library",{headers})).json();
    assert.equal(library.facts[0].fact,"A new owner-approved test fact");
    store.library.execute("pinFact",{id:library.facts[0].id,pinned:true});
    assert.equal((await fetch(base+"/api/library",{method:"POST",headers,body:JSON.stringify({action:"constructor"})})).status,400);
    const profile=exportCompanionProfile({...DEFAULT_COMPANION_PROFILE,
      personality:{...DEFAULT_COMPANION_PROFILE.personality,flirtiness:95},
      communication:{...DEFAULT_COMPANION_PROFILE.communication,customGuidance:"Never call me by my name"}});
    assert.equal((await fetch(base+"/api/profile",{method:"PUT",headers,body:JSON.stringify(profile)})).status,200);
    const stored=await (await fetch(base+"/api/profile",{headers})).json();
    assert.equal(stored.profile.personality.flirtiness,95);
    const created=await (await fetch(base+"/api/conversations",{method:"POST",headers,body:"{}"})).json();
    const res=await fetch(base+"/api/chat",{method:"POST",headers,
      body:JSON.stringify({conversationId:created.id,text:"Testing one two"})});
    assert.equal(res.status,200);
    const events=await res.text();
    assert.match(events,/event: delta/);
    assert.match(events,/event: done/);
    const saved=await (await fetch(base+"/api/conversations/"+created.id+"/messages",{headers})).json();
    assert.deepEqual(saved.messages.map(x=>x.role),["user","assistant"]);
    assert.equal(saved.messages.at(-1).content,"Meow!");
    assert.equal((await fetch(base+"/api/memories",{headers:{Authorization:"Bearer wrong"}})).status,401);
    const activity=await (await fetch(base+"/api/learning/diagnostics/"+created.id,{headers})).json();
    assert.ok(!activity.events.some(e=>e.kind==="recall"&&e.payload.lines.some(line=>line.includes("A new owner-approved test fact"))),"Unrelated pins must not enter ordinary chat");
    assert.equal((await fetch(base+"/api/learning/diagnostics/"+created.id)).status,401);
  } finally {
    await new Promise(resolve=>server.close(resolve));store.db.close();
    rmSync(root,{recursive:true,force:true});
  }
});

test("provider settings require valid selected credentials",()=>{
  assert.throws(()=>providerConfig({MIKAN_PROVIDER:"nvidia"}),/API key/);
  const c=providerConfig({MIKAN_PROVIDER:"openrouter",MIKAN_MODEL:"openrouter/free",OPENROUTER_API_KEY:"123456789012"});
  assert.equal(c.provider,"openrouter");
});

test("OpenAI-compatible streaming parser forwards only assistant output",async()=>{
  const events='data: {"model":"actual/free-model","choices":[{"delta":{"content":"Hello"}}]}\n\n'+
    'data: {"choices":[{"delta":{"content":" there"}}]}\n\n'+'data: [DONE]\n\n';
  const chunks=[],models=[];
  const answer=await generateReply({
    config:{provider:"nvidia",model:"test-model",key:"some-secret-key"},
    system:"You are Mikan",history:[{role:"user",content:"Hi"}],
    onDelta:t=>chunks.push(t),onModel:m=>models.push(m),
    fetchImpl:async()=>new Response(events,{status:200,headers:{"Content-Type":"text/event-stream"}})
  });
  assert.equal(answer,"Hello there");
  assert.deepEqual(chunks,["Hello"," there"]);assert.deepEqual(models,["actual/free-model"]);
});

test("structured memory library preserves categories, pins, canon and interests; conversions roll back",()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-library-")),store=openStore(join(root,"memory.sqlite3"));
  const call=(action,args={})=>store.library.execute(action,args);
  try{
    const item={fact:"I love Shadows Fall",category:"preferences",tags:["metal"],pinned:true};
    assert.deepEqual(call("importFacts",{items:[item,item]}),{inserted:1,duplicates:1});
    const fact=call("snapshot").facts[0];
    assert.equal(fact.importance,95);assert.deepEqual(fact.tags,["metal"]);
    call("addCanon",{item:{category:"favorites",label:"Favorite band",value:"Finntroll"}});
    const band={name:"Shadows Fall",kind:"band",status:"favorite",rating:10,notes:"",tags:["metal"]};
    call("importInterests",{items:[band]});
    assert.throws(()=>call("moveFact",{id:fact.id,item:band}),/already exists/);
    assert.equal(call("snapshot").facts.length,1);
    const self=store.library.context("What is your favorite band?",null).text;
    assert.match(self,/Finntroll/);assert.doesNotMatch(self,/OWNER'S STRUCTURED INTEREST COLLECTION/);
    const old=store.newConversation(),current=store.newConversation();
    store.append(old.id,"user","The Beholder project is using Synology");
    store.append(old.id,"assistant","Fabricated unsupported claim about Synology");
    const recalled=store.library.context("What did we discuss about Synology?",current.id).text;
    assert.match(recalled,/The Beholder project is using Synology/);assert.doesNotMatch(recalled,/Fabricated unsupported claim/);
    call("deleteChat",{id:old.id});
    assert.doesNotMatch(store.library.context("What did we discuss about Synology?",current.id).text,/The Beholder project/);
    assert.throws(()=>call("constructor"),/Unknown memory operation/);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});


test("NAS learning follows model decisions while enforcing consent, evidence and review",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-learn-")),store=openStore(join(root,"memory.sqlite3"));
  const c=store.newConversation(),l=store.learning;
  const turn=(u,a)=>[store.append(c.id,"user",u),store.append(c.id,"assistant",a)];
  const response=async facts=>l.processNext(async()=>JSON.stringify({facts,interests:[],canon:[]}),{});
  const fact=(fact,evidence,extra={})=>({fact,evidence,scope:"long_term",action:"save",category:"preferences",tags:[],...extra});
  try{
    assert.equal(l.enqueue(...turn("I love coffee","Nice!"),c.id),false);
    l.setSettings({user:true,character:false});
    assert.equal(l.enqueue(...turn("My password is abc123","Okay"),c.id),false);
    assert.equal(l.enqueue(...turn("I love coffee","Nice!"),c.id),true);
    await response([fact("Coffee is a drink the user loves","I love coffee",{tags:["coffee"]}),fact("The user likes tea","I love tea"),fact("The user likes coffee","I love coffee",{action:"skip"})]);
    const record=store.library.execute("snapshot",{}).facts[0];
    assert.equal(record.fact,"Coffee is a drink the user loves");assert.deepEqual(record.tags,["coffee"]);
    assert.equal(l.getStatus().lastOutcome.saved,1);
    l.enqueue(...turn("Actually, I prefer tea instead of coffee","Got it"),c.id);
    await response([fact("The user prefers tea instead of coffee","Actually, I prefer tea instead of coffee",{relatedId:record.id,action:"save"})]);
    const review=l.getStatus().reviews[0];assert.equal(review.targetId,record.id);
    assert.equal(store.library.execute("snapshot",{}).facts[0].fact,record.fact);
    l.resolve(review.id,"accept");
    assert.equal(store.library.execute("snapshot",{}).facts[0].fact,"The user prefers tea instead of coffee");
    assert.equal(l.getStatus().history.length,1);
    l.enqueue(...turn("I like pizza","Good"),c.id);
    await response([fact("The user likes pizza","I like pizza",{relatedId:99999}),fact("The user likes pizza","I like pizza",{scope:"session"})]);
    assert.equal(l.getStatus().lastOutcome.saved,0);
    l.enqueue(...turn("I like pizza","Good"),c.id);
    await l.processNext(async()=>{throw Error("quota");},{});
    assert.equal(l.getStatus().failed,1);assert.equal(l.retry().count,1);
    l.setSettings({user:false,character:false});assert.equal(l.getStatus().queued,0);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("NAS extraction separates canon and interests, protects existing records and resumes queued work",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-learn-media-")),path=join(root,"memory.sqlite3");
  let store=openStore(path);
  try{
    store.learning.setSettings({user:true,character:true});
    const c=store.newConversation();
    const enqueue=(u,a)=>store.learning.enqueue(store.append(c.id,"user",u),store.append(c.id,"assistant",a),c.id);
    const run=async data=>store.learning.processNext(async()=>JSON.stringify({facts:[],interests:[],canon:[],...data}),{});
    const band={name:"Example Band",kind:"band",status:"favorite",evidence:"My favorite band is Example Band",action:"save",scope:"long_term"};
    enqueue("My favorite band is Example Band","Nice!");
    await run({interests:[band]});
    let s=store.library.execute("snapshot",{});
    assert.equal(s.interests[0].status,"favorite");
    store.library.execute("editInterest",{id:s.interests[0].id,item:{...s.interests[0],rating:9,notes:"Keep this"}});
    enqueue("I like Example Band","Nice!");
    await run({interests:[{...band,status:"like",evidence:"I like Example Band",action:"skip"}]});
    assert.equal(store.learning.getStatus().reviews.length,0);
    enqueue("I no longer enjoy Example Band","Got it");
    await run({interests:[{...band,status:"dislike",evidence:"I no longer enjoy Example Band"}]});
    assert.equal(store.learning.getStatus().reviews.length,1);
    assert.equal(store.library.execute("snapshot",{}).interests[0].status,"favorite");
    enqueue("What is your favorite color?","I have always been drawn to orange.");
    await run({canon:[{category:"favorites",label:"Favorite color",value:"orange",evidence:"I have always been drawn to orange.",action:"save",scope:"long_term"}]});
    s=store.library.execute("snapshot",{});
    assert.equal(s.characterFacts[0].value,"orange");assert.equal(s.facts.length,0);assert.equal(s.interests[0].rating,9);
    enqueue("I love tea","Nice!");
    store.db.close();store=openStore(path);
    assert.equal(store.learning.settings().user,true);assert.equal(store.learning.getStatus().queued,1);
    await run({facts:[{fact:"The user loves tea",evidence:"I love tea",action:"save",scope:"long_term",category:"preferences",tags:[]}]});
    assert.equal(store.library.execute("snapshot",{}).facts[0].fact,"The user loves tea");
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("Natural banter, hypothetical statements and contextual answers all reach the semantic model",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-semantic-")),store=openStore(join(root,"memory.sqlite3"));
  try{
    const c=store.newConversation(),l=store.learning;
    l.setSettings({user:true,character:true});
    const enqueue=(u,a="Nice!")=>l.enqueue(store.append(c.id,"user",u),store.append(c.id,"assistant",a),c.id);
    const exact="one of my favorite foods is Schnitzel. imagine that a german who likes schnitzel";
    const proposed={fact:"One of the user's favorite foods is Schnitzel",evidence:"one of my favorite foods is Schnitzel",action:"save",scope:"long_term",category:"preferences",tags:["food"]};
    let calls=0;
    assert.equal(enqueue(exact),true);
    await l.processNext(async req=>{calls++;const input=JSON.parse(req.history[0].content);assert.equal(input.currentUser,exact);return JSON.stringify({facts:[proposed],interests:[],canon:[]});},{});
    assert.equal(calls,1);
    assert.equal(store.library.execute("snapshot",{}).facts[0].fact,proposed.fact);
    assert.equal(l.getStatus().lastOutcome.saved,1);
    enqueue(exact);
    await l.processNext(async()=>JSON.stringify({facts:[proposed],interests:[],canon:[]}),{});
    assert.equal(l.getStatus().lastOutcome.saved,0);
    for(const phrase of ["Imagine that my favorite food is lobster","Pretend I love coffee","I am testing a feature today","Thanks!","My favorite food is sushi. But actually I hate sushi."]){
      assert.equal(enqueue(phrase),true);
      await l.processNext(async req=>{assert.equal(JSON.parse(req.history[0].content).currentUser,phrase);return JSON.stringify({facts:[],interests:[],canon:[]});},{});
    }
    enqueue("What else should we talk about?","What flavor of ice cream do you like best?");
    await l.processNext(async()=>JSON.stringify({facts:[],interests:[],canon:[]}),{});
    enqueue("Vanilla, hands down");
    await l.processNext(async req=>{
      const input=JSON.parse(req.history[0].content);
      assert.ok(input.recent.some(m=>m.content==="What flavor of ice cream do you like best?"));
      assert.ok(input.existing.facts.some(f=>f.fact===proposed.fact));
      return JSON.stringify({facts:[{fact:"The user prefers vanilla ice cream",evidence:"Vanilla, hands down",scope:"long_term",action:"save",category:"preferences",tags:["food"]}],interests:[],canon:[]});
    },{});
    assert.equal(store.library.execute("snapshot",{}).facts.length,2);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("committed memory outcomes and failures are delivered once per cursor",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-events-")),store=openStore(join(root,"memory.sqlite3"));
  try{
    const c=store.newConversation(),l=store.learning;
    l.setSettings({user:true,character:false});
    const baseline=l.events();
    const enqueue=u=>l.enqueue(store.append(c.id,"user",u),store.append(c.id,"assistant","Nice!"),c.id);
    enqueue("I like pears");
    await l.processNext(async()=>JSON.stringify({facts:[{fact:"The user likes pears",evidence:"I like pears",action:"save",scope:"long_term",category:"preferences",tags:[]}],interests:[],canon:[]}),{});
    const first=l.events(baseline.cursor);
    assert.equal(first.items.length,2);assert.equal(first.items[0].kind,"queued");assert.equal(first.items[1].payload.saved,1);
    assert.match(memoryNotice(first.items).message,/Remembered: The user likes pears/);
    assert.equal(store.library.execute("snapshot",{}).facts[0].fact,"The user likes pears");
    assert.deepEqual(l.events(first.cursor).items,[]);
    enqueue("Thanks");await l.processNext(async()=>JSON.stringify({facts:[],interests:[],canon:[]}),{});
    enqueue("I like tea");await l.processNext(async()=>{throw Error("synthetic private upstream failure");},{});
    const next=l.events(first.cursor);
    assert.equal(next.items.length,4);assert.equal(next.items[1].payload.saved,0);assert.equal(next.items[3].kind,"failed");assert.equal(next.items[3].payload.stage,"provider");
    assert.equal(memoryNotice(next.items.slice(0,2)),null);assert.equal(memoryNotice(next.items).warning,true);
    assert.equal(l.diagnostics(c.id).length,6);assert.ok(!JSON.stringify(next).includes("synthetic private"));
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("NAS activity persists across reconnect and stays conversation-scoped",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-activity-")),path=join(root,"db.sqlite3");
  let store=openStore(path);
  try{
    const chat=store.newConversation(),other=store.newConversation();
    store.learning.setSettings({user:true,character:false});
    const user=store.append(chat.id,"user","I love apricots"),assistant=store.append(chat.id,"assistant","Nice!");
    store.learning.recordRecall(chat.id,assistant.id,["Earlier saved context"]);
    store.learning.enqueue(user,assistant,chat.id);
    assert.ok(nasActivity(store.learning.diagnostics(chat.id)).some(e=>e.title==="Memory check queued"));
    await store.learning.processNext(async()=>JSON.stringify({facts:[{fact:"The user loves apricots",evidence:"I love apricots",action:"save",scope:"long_term",category:"preferences",tags:[]}],interests:[],canon:[]}),{});
    const entries=nasActivity(store.learning.diagnostics(chat.id));
    assert.ok(entries.some(e=>e.title==="Memory saved"&&e.lines.includes("The user loves apricots")));
    assert.ok(entries.some(e=>e.title==="Memory recalled"&&e.lines.includes("Earlier saved context")));
    assert.ok(!entries.some(e=>e.title==="Memory check queued"));
    assert.deepEqual(nasActivity(store.learning.diagnostics(other.id)),[]);
    const oldCursor=store.learning.events().cursor;
    store.db.prepare("DELETE FROM nas_learning_events WHERE kind='outcome' AND conversation_id=?").run(chat.id);
    store.db.close();store=openStore(path);
    assert.ok(nasActivity(store.learning.diagnostics(chat.id)).some(e=>e.title==="Memory saved"));
    assert.ok(store.learning.events().cursor>oldCursor);
    const recovered=store.learning.events().cursor;
    store.db.close();store=openStore(path);
    assert.equal(store.learning.events().cursor,recovered);
    assert.equal(nasActivity(store.learning.diagnostics(chat.id)).filter(e=>e.title==="Memory saved").length,1);
    store.library.execute("deleteChat",{id:chat.id});
    assert.deepEqual(store.learning.diagnostics(chat.id),[]);
    assert.equal(store.learning.events().cursor,recovered);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("maintenance gate prevents writes and reports idle while allowing health and status",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-maintenance-")),store=openStore(join(root,"db.sqlite3"));
  const maintenanceFile=join(root,"maintenance"),key="0123456789abcdef0123456789abcdef";
  const server=makeServer({store,key,maintenanceFile,config:{provider:"nvidia",model:"test",key:"not-a-real-provider-key"}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port,headers={Authorization:"Bearer "+key,"Content-Type":"application/json"};
  try{
    assert.equal((await (await fetch(base+"/api/health")).json()).maintenance,false);
    writeFileSync(maintenanceFile,"");
    const health=await (await fetch(base+"/api/health")).json();
    assert.equal(health.maintenance,true);assert.equal(health.idle,true);
    assert.equal((await fetch(base+"/api/conversations",{method:"POST",headers,body:"{}"})).status,503);
    assert.equal((await fetch(base+"/api/library",{method:"POST",headers,body:JSON.stringify({action:"addFact",args:{fact:"Should not persist"}})})).status,503);
    assert.equal((await fetch(base+"/api/status",{headers})).status,200);
    assert.equal(store.conversations().length,0);
    unlinkSync(maintenanceFile);
    assert.equal((await fetch(base+"/api/conversations",{method:"POST",headers,body:"{}"})).status,201);
  }finally{await new Promise(resolve=>server.close(resolve));store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("maintenance waits for an admitted reply to finish and rejects later writes",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-drain-")),store=openStore(join(root,"db.sqlite3"));
  const maintenanceFile=join(root,"maintenance"),key="0123456789abcdef0123456789abcdef",chat=store.newConversation();
  let entered,release;
  const started=new Promise(resolve=>entered=resolve),finish=new Promise(resolve=>release=resolve);
  const server=makeServer({store,key,maintenanceFile,config:{provider:"nvidia",model:"test",key:"synthetic-test-key"},generate:async()=>{entered();await finish;return "Finished";}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port,headers={Authorization:"Bearer "+key,"Content-Type":"application/json"};
  let pending;
  try{
    pending=fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({conversationId:chat.id,text:"Hello"})}).then(r=>r.text());
    // Reject immediately if the request finishes before entering generation.
    await Promise.race([started,pending.then(()=>{throw new Error("Chat ended before entering the mock generator");})]);
    writeFileSync(maintenanceFile,"");
    assert.equal((await (await fetch(base+"/api/health")).json()).idle,false);
    assert.equal((await fetch(base+"/api/conversations",{method:"POST",headers,body:"{}"})).status,503);
    release();await pending;
    assert.equal((await (await fetch(base+"/api/health")).json()).idle,true);
    assert.equal(store.messages(chat.id).at(-1).content,"Finished");
  }finally{release();if(pending)await pending.catch(()=>{});await new Promise(resolve=>server.close(resolve));store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("host update control only accepts fixed actions and tracks committed host results",()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-updates-"));
  try{
    const control=updateControl(root);
    assert.equal(control.get().host,null);
    assert.throws(()=>control.queue("check"),/not connected/);
    control.publish("current","a".repeat(40),"a".repeat(40));
    assert.throws(()=>control.queue("shell"),/Invalid update action/);
    assert.deepEqual(control.queue("check"),{queued:"check"});
    assert.throws(()=>control.queue("install"),/already queued/);
    assert.equal(control.take(),"check");assert.equal(control.take(),null);
    control.publish("available","a".repeat(40),"b".repeat(40));
    control.queue("install");assert.equal(control.take(),"install");
    control.publish("updated","b".repeat(40),"b".repeat(40));
    assert.equal(control.get().host.history[0].phase,"updated");
    assert.ok(control.get().host.lastBackup);
    assert.equal(control.get().pending,null);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("NAS provider selection persists, keeps keys write-only and budgets real requests",()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-providers-")),store=openStore(join(root,"db.sqlite3"));
  const file=join(root,"settings.json"),env={NVIDIA_API_KEY:"synthetic-nvidia-secret"};
  let time=100000000;
  try{
    const models=providerSettings({env,file,db:store.db,now:()=>time});
    assert.equal(models.active().provider,"nvidia");
    assert.throws(()=>models.save({provider:"openrouter",model:"paid/model",select:true}),/free route/);
    assert.throws(()=>models.save({provider:"gemini",select:true}),/Configure a key/);
    const next=models.save({provider:"openrouter",model:"openrouter/free",apiKey:"synthetic-router-secret",select:true,historyChars:16000});
    assert.doesNotMatch(JSON.stringify(next),/synthetic-/);
    const reopened=providerSettings({env,file,db:store.db,now:()=>time});
    assert.equal(reopened.active().provider,"openrouter");
    assert.equal(reopened.active().key,"synthetic-router-secret");
    assert.equal(reopened.active().historyChars,16000);
    for(let i=0;i<14;i++)reopened.reserve("openrouter");
    assert.equal(reopened.available("openrouter",2),false);
    assert.equal(reopened.available("openrouter",1),true);
    reopened.reserve("openrouter");
    assert.throws(()=>reopened.reserve("openrouter"),/budget reached/);
    time+=61000;
    assert.equal(reopened.available("openrouter"),true);
    reopened.cooldown("openrouter");assert.equal(models.available("openrouter"),false);time+=300001;assert.equal(reopened.available("openrouter"),true);
    assert.equal(boundedHistory([{role:"user",content:"old"},{role:"assistant",content:"past"},{role:"user",content:"latest"}],6).at(-1).content,"latest");
    reopened.save({provider:"openrouter",clearKey:true});
    assert.throws(()=>reopened.active(),/Configure/);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});
test("NAS cloud settings API is authenticated, selects the next turn and records provider model metadata",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-model-api-")),store=openStore(join(root,"db.sqlite3"));
  const key="01234567890123456789012345678901",headers={Authorization:"Bearer "+key,"Content-Type":"application/json"};
  const models=providerSettings({env:{NVIDIA_API_KEY:"synthetic-nvidia-secret",OPENROUTER_API_KEY:"synthetic-router-secret"},db:store.db});
  const server=makeServer({store,key,models,generate:async({config,onModel,onDelta})=>{
    assert.equal(config.provider,"openrouter");onModel("actual/free-model");onDelta("Hi");return "Hi";
  }});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  try{
    assert.equal((await fetch(base+"/api/models")).status,401);
    const response=await fetch(base+"/api/models",{method:"PUT",headers,body:JSON.stringify({provider:"openrouter",select:true})});
    assert.equal(response.status,200);assert.doesNotMatch(await response.text(),/synthetic-/);
    const c=store.newConversation();
    const r=await fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({conversationId:c.id,text:"Hello"})});
    assert.match(await r.text(),/event: done/);
    const {timing,...inference}=store.messages(c.id).at(-1).inference;
    assert.deepEqual(inference,{provider:"openrouter",requestedModel:"openrouter/free",actualModel:"actual/free-model",outcome:"completed"});
    assert.equal(timing.modelCalls,1);assert.ok(timing.totalMs>=0);assert.equal(timing.stages.at(-1).stage,"answer");
  }finally{await new Promise(resolve=>server.close(resolve));store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("NAS research rejects non-public destinations and retains source identities",async()=>{
  for(const ip of ["127.0.0.1","192.168.1.2","100.82.48.82","169.254.169.254","10.0.0.1","::1","224.1.2.3"])assert.equal(publicIPv4(ip),false);
  assert.equal(publicIPv4("8.8.8.8"),true);
  assert.equal(webURL("http://localhost:3847"),null);
  assert.equal(webURL("https://user:password@example.com"),null);
  assert.equal(searchResults({results:[{url:"https://example.com",title:"A"},{url:"https://example.com",title:"duplicate"},{url:"javascript:alert(1)"}]}).length,1);
  const result=await readWeb("https://example.com",async()=>({body:"<title>Test</title><script>secret</script><p>Evidence</p>",type:"text/html"}));
  assert.match(result.content,/Evidence/);assert.doesNotMatch(result.content,/secret/);
  await assert.rejects(readWeb("http://127.0.0.1"),/Non-public/);
});
test("model-led NAS research uses bounded public evidence and skips private chat",async()=>{
  let calls=0;const events=[],history=[{role:"user",content:"What is the latest public test release?"}];
  const search=async()=>{calls++;return [{url:"https://example.com/",title:"Release",content:"Preview",kind:"preview",publishedDate:"2026-11-24"}];};
  const read=async()=>({url:"https://example.com/",title:"Release notes",content:"Actual release",kind:"page",publishedDate:null});
  const skipped=await researchTurn({mode:"simple",history,generate:async()=>JSON.stringify({action:"none"}),canRequest:()=>true,search});
  assert.equal(calls,0);assert.equal(skipped.sources.length,0);
  let step=0;
  const found=await researchTurn({mode:"strict",history,generate:async()=>JSON.stringify(++step===1?{action:"search",query:"public release"}:{action:"none",readIndices:[1]}),canRequest:()=>true,search,read,activity:e=>events.push(e)});
  assert.equal(calls,1);assert.equal(found.sources.length,1);assert.equal(found.sources[0].kind,"page");assert.equal(found.sources[0].publishedDate,"2026-11-24");assert.equal(events.length,2);
});

test("NAS research respects opt-in, does not expose assistant memories to planner, and stops on provider quota",async()=>{
  const history=[{role:"assistant",content:"private assistant recall"},{role:"user",content:"Public topic"}];
  const never=async()=>{throw Error("Unexpected request");};
  assert.deepEqual(await researchTurn({mode:"off",history,generate:never,canRequest:()=>true,search:never}),{sources:[],note:""});
  await researchTurn({mode:"simple",history,generate:async request=>{
    assert.doesNotMatch(request.history[0].content,/private assistant recall/);
    return JSON.stringify({action:"none"});
  },canRequest:()=>true,search:never});
  await assert.rejects(researchTurn({mode:"strict",history,generate:async()=>{throw Object.assign(Error("quota"),{upstreamStatus:429});},canRequest:()=>true,search:never}),/quota/);
});
test("NAS research API persists opt-in and actual source activity",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-research-api-")),store=openStore(join(root,"db.sqlite3"));
  const key="01234567890123456789012345678901",headers={Authorization:"Bearer "+key,"Content-Type":"application/json"};
  const source={url:"https://example.com/",title:"Public source",content:"Public evidence",kind:"preview",publishedDate:null};
  const server=makeServer({store,key,config:{provider:"nvidia",model:"test",key:"synthetic-test-key"},
    search:async()=>[source],generate:async({system,onDelta})=>{
      if(system.startsWith("You are a read-only research planner"))return JSON.stringify({action:"search",query:"public example"});
      assert.match(system,/Public evidence/);onDelta("Public evidence [1]");return "Public evidence [1]";
    }});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  try{
    assert.equal((await fetch(base+"/api/research")).status,401);
    assert.equal((await (await fetch(base+"/api/research",{headers})).json()).mode,"off");
    assert.equal((await fetch(base+"/api/research",{method:"PUT",headers,body:JSON.stringify({mode:"simple"})})).status,200);
    const c=store.newConversation();
    const r=await fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({conversationId:c.id,text:"Find public example"})});
    assert.match(await r.text(),/event: done/);
    assert.equal(store.messages(c.id).at(-1).inference.sources[0].url,source.url);
    assert.ok(nasActivity(store.learning.diagnostics(c.id)).some(e=>e.kind==="search"&&e.title==="Web search"));
    assert.equal(researchSettings(store.db).get(),"simple");
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM nas_provider_requests").get().n,2);
  }finally{await new Promise(resolve=>server.close(resolve));store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("NAS planner receives live calendar grounding and general source selection guidance",async()=>{
  const requests=[];
  const history=[{role:"user",content:"What is the latest public release?"}];
  await researchTurn({mode:"strict",history,now:new Date("2031-02-03T00:00:00Z"),
    canRequest:()=>true,generate:async request=>{
      requests.push(request);
      return JSON.stringify(requests.length===1?{action:"search",query:"public release 2031",recent:true}:{action:"none",readIndices:[]});
    },search:async(query,recent)=>{
      assert.equal(query,"public release 2031");assert.equal(recent,true);
      return [{url:"https://example.com/",title:"Official changelog",content:"Release",kind:"preview",publishedDate:null}];
    }});
  assert.equal(requests.length,2);
  for(const request of requests){
    assert.match(request.system,/LIVE UTC DATE: 2031-02-03/);
    assert.match(request.system,/Do not constrain a current search to past years/);
    assert.match(request.system,/Read those before general marketing pages/);
  }
});

test("Brain Lab uses shared fixtures in isolated SQLite, preserves owner memory and records timings",async()=>{
  const {createBrainLab,seedEvalStore}=await import("../brain-lab.mjs");
  const root=mkdtempSync(join(tmpdir(),"mikan-brain-")),store=openStore(join(root,"db.sqlite3"));
  try{
    store.addMemory("Private owner fact must never enter test");
    const models=providerSettings({initial:{provider:"nvidia",model:"test",key:"synthetic-test-key"},db:store.db});
    const lab=createBrainLab({db:store.db,models,build:{commit:"test"},pace:async()=>{},search:async()=>{throw Error("No search expected");},
      requestModel:async({system,history,onDelta,onModel})=>{
        assert.doesNotMatch(system,/Private owner fact/);
        const answer=history.at(-1).content.includes("song")?"Winterglass":"Cobalt Harbor";
        onModel?.("test");onDelta(answer);return answer;
      }});
    assert.ok(lab.catalog().length>50);
    assert.throws(()=>lab.start({provider:"nvidia",model:"test",mode:"off",repetitions:5,scenarioIds:lab.catalog().filter(s=>s.supported).map(s=>s.id)}),/at most/);
    const started=lab.start({provider:"nvidia",model:"test",mode:"off",repetitions:1,scenarioIds:["branch-b"]});
    for(let i=0;i<100&&lab.isRunning();i++)await new Promise(r=>setTimeout(r,10));
    const report=lab.get(started.id);assert.equal(report.state,"finished");assert.equal(report.done,3);
    assert.ok(report.cases[0].steps.every(s=>s.timing.modelCalls===1));
    assert.ok(report.cases[0].steps.every(s=>!("grade" in s)&&!("failures" in s)&&!("qualityFlags" in s)));
    assert.equal(store.listMemories().length,1);assert.equal(store.conversations().length,0);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM nas_provider_requests").get().n,3);
    const fixture=seedEvalStore();try{assert.ok(fixture.listMemories().length>10);}finally{fixture.db.close();}
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("NAS knowledge preserves approved scenes and separates cloud permission and public cache",async()=>{
  const {createKnowledge,notionChunks}=await import("../knowledge.mjs");
  const {planKnowledge}=await import("../knowledge-plan.mjs");
  const {joinNotionChunks}=await import("../../src/notion-reading.ts");
  const root=mkdtempSync(join(tmpdir(),"mikan-knowledge-")),store=openStore(join(root,"db.sqlite3"));
  const chapter="11111111-1111-1111-1111-111111111111",scene="22222222-2222-2222-2222-222222222222";
  const rich=text=>[{plain_text:text}];
  const page=(id,title,properties={})=>({object:"page",id,properties:{Name:{type:"title",title:rich(title)},...properties}});
  const ch=page(chapter,"Chapter 1",{Scenes:{type:"relation",relation:[{id:scene}]}}),sc=page(scene,"1.1 Arrival");
  let fail=false,reads=0,clock=1700000000000;
  const lib=createKnowledge({db:store.db,file:join(root,"secret"),now:()=>clock,read:async url=>{reads++;return {url,title:"Public docs",kind:"page",content:"Original public documentation",publishedDate:null};},
    apiFactory:()=>({request:async path=>{if(path==="users/me")return {};if(fail)throw Error("offline");return path.endsWith(chapter)?ch:sc;},list:async path=>path==="search"?[ch,sc]:path.includes(scene)?[{type:"heading_1",heading_1:{rich_text:rich("Approved manuscript prose")}},{type:"paragraph",paragraph:{rich_text:rich("A lantern stood beside the window.")}}]:[{type:"heading_1",heading_1:{rich_text:rich("Planning notes")}},{type:"paragraph",paragraph:{rich_text:rich("Do not substitute this.")}}]})});
  try{
    assert.equal(joinNotionChunks(notionChunks("ü😀".repeat(2500))),"ü😀".repeat(2500));
    const status=await lib.connect("synthetic-notion-secret-only");
    assert.equal(status.connected,true);assert.equal(status.allowNotionCloud,false);assert.ok(!JSON.stringify(status).includes("synthetic-notion-secret-only"));
    lib.settings({allPages:true});lib.sync();for(let i=0;i<100&&lib.isRunning();i++)await new Promise(r=>setTimeout(r,5));
    assert.equal(lib.status().job.state,"finished");assert.equal(lib.status().pages.length,2);
    assert.equal(lib.candidates("Chapter 1",[]).length,0);
    lib.settings({allowNotionCloud:true});
    const candidates=lib.candidates("Chapter 1",[]);assert.ok(candidates.some(p=>p.id===chapter));
    const result=await lib.load(candidates.find(p=>p.id===chapter),"manuscript","Chapter 1","nvidia");
    assert.match(result.content,/A lantern stood beside the window/);assert.doesNotMatch(result.content,/Do not substitute this/);assert.match(result.coverage,/complete approved manuscript/);
    const planned=await planKnowledge({knowledge:lib,question:"Read chapter",history:[],previous:[],provider:"nvidia",canRequest:()=>true,generate:async()=>JSON.stringify({action:"knowledge",ids:[chapter],scope:"manuscript"})});
    assert.equal(planned.sources.length,1);assert.equal(planned.local,true);
    fail=true;lib.sync();for(let i=0;i<100&&lib.isRunning();i++)await new Promise(r=>setTimeout(r,5));assert.equal(lib.status().job.state,"failed");assert.equal(lib.status().pages.length,2);
    await lib.cachedRead("https://example.com/");const cached=await lib.cachedRead("https://example.com/");assert.equal(cached.fromCache,true);assert.equal(reads,1);
    clock+=3600001;await lib.cachedRead("https://example.com/",{recent:true});assert.equal(reads,2);
    lib.remove("notion",scene);await assert.rejects(lib.load(candidates.find(p=>p.id===chapter),"manuscript","Chapter 1","nvidia"),/offline|Linked scenes are missing/);
    lib.disconnect();assert.equal(lib.status().pages.length,0);assert.equal(lib.status().webPages.length,1);assert.equal(store.listMemories().length,0);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("NAS knowledge turns use cached manuscript without public search or memory extraction",async()=>{
  const {createKnowledge}=await import("../knowledge.mjs");
  const root=mkdtempSync(join(tmpdir(),"mikan-knowledge-http-")),store=openStore(join(root,"db.sqlite3"));
  const key="01234567890123456789012345678901",headers={Authorization:"Bearer "+key,"Content-Type":"application/json"};
  const lib=createKnowledge({db:store.db,read:async()=>{throw Error("Unexpected network read");}});
  const id="11111111-1111-1111-1111-111111111111";
  store.db.prepare("INSERT INTO notion_pages(id,title,url,last_edited,synced_at) VALUES(?,?,?,?,?)").run(id,"Chapter 1","https://www.notion.so/"+id.replaceAll("-",""),"",1700000000);
  const sceneProse=["A lantern stood beside the window.","Rain fell against the roof.","The door opened into a quiet hall.","A candle burned on the table."];
  for(const [index,prose] of sceneProse.entries()){
    const sceneId="22222222-2222-2222-2222-"+String(index+1).padStart(12,"0"),title="1."+(index+1)+" Scene";
    store.db.prepare("INSERT INTO notion_pages(id,title,url,last_edited,synced_at) VALUES(?,?,?,?,?)").run(sceneId,title,"https://www.notion.so/"+sceneId.replaceAll("-",""),"",1700000000);
    const content="# Approved manuscript prose\n\n"+prose;
    const chunk=store.db.prepare("INSERT INTO notion_chunks(page_id,title,content) VALUES(?,?,?)").run(sceneId,title,content);
    store.db.prepare("INSERT INTO notion_fts(rowid,title,content) VALUES(?,?,?)").run(chunk.lastInsertRowid,title,content);
    store.db.prepare("INSERT INTO notion_page_relations(page_id,property,target_id,position) VALUES(?,?,?,?)").run(id,"Scenes",sceneId,index);
  }
  lib.settings({allowNotionCloud:true});
  let publicCalls=0,modelCalls=0,rejectNext=false;
  const server=makeServer({store,key,knowledge:lib,config:{provider:"nvidia",model:"test",key:"synthetic-test-key"},search:async()=>{publicCalls++;throw Error("No public search permitted");},
    generate:async({system,onDelta,history})=>{
      modelCalls++;
      if(system.startsWith("You are a read-only LOCAL reference-library planner"))return JSON.stringify({action:"knowledge",ids:[id],scope:"manuscript"});
      for(const prose of sceneProse)assert.ok(system.includes(prose));
      assert.equal(history.length,1);assert.equal(history[0].role,"user");
      const answer=rejectNext?(rejectNext=false,'The narrator says "The black dragon flew over the castle."'):"The chapter begins with a lantern [1].";
      onDelta(answer);return answer;
    }});
  await new Promise(r=>server.listen(0,"127.0.0.1",r));const base="http://127.0.0.1:"+server.address().port;
  try{
    assert.equal((await fetch(base+"/api/knowledge")).status,401);
    assert.equal((await fetch(base+"/api/knowledge/document?kind=notion&id="+id)).status,401);
    assert.equal((await (await fetch(base+"/api/knowledge",{headers})).json()).pages.length,5);
    const c=store.newConversation();
    const r=await fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({conversationId:c.id,text:"Read the complete first chapter of Adikameg and tell me what you think"})});assert.match(await r.text(),/event: done/);
    const saved=store.messages(c.id).at(-1);assert.ok(saved.inference.sources?.length,saved.content);assert.equal(saved.inference.sources[0].kind,"notion");assert.match(saved.inference.sources[0].coverage,/4 scenes/);assert.ok(!JSON.stringify(saved.inference).includes("A lantern stood beside the window"));
    assert.equal(publicCalls,0);assert.equal(modelCalls,1);assert.equal(saved.inference.timing.modelCalls,1);
    assert.ok(store.learning.diagnostics(c.id).filter(e=>e.kind==="recall").every(e=>e.payload.lines.length===0));
    // Repeated explicit request uses the same desktop selector, not LLM routing.
    const repeat=await fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({conversationId:c.id,text:"Read the complete first chapter of Adikameg and give me your opinion on the writing, pacing, atmosphere and characters. Discuss all four scenes, but paraphrase everything. Do not use any direct quotations."})});
    assert.match(await repeat.text(),/event: done/);
    assert.ok(store.messages(c.id).at(-1).inference.sources?.length,store.messages(c.id).at(-1).content);
    assert.equal(store.messages(c.id).at(-1).inference.sources[0].id,id);
    assert.equal(modelCalls,2);
    rejectNext=true;
    const repair=await fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({conversationId:c.id,text:"Review chapter 1 of my book once more."})});
    const repaired=await repair.text();assert.doesNotMatch(repaired,/black dragon/);
    assert.match(store.messages(c.id).at(-1).content,/lantern/);
    assert.equal(store.messages(c.id).at(-1).inference.timing.modelCalls,2);
    assert.equal(modelCalls,4);
    const load=await fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({conversationId:c.id,text:"Read chapter 1 of my book again"})});
    assert.match(await load.text(),/event: done/);
    assert.match(store.messages(c.id).at(-1).content,/reloaded/);
    assert.equal(modelCalls,4);
    const missing=await fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({conversationId:c.id,text:"Read chapter 7 of my book"})});
    assert.match(await missing.text(),/event: done/);
    assert.doesNotMatch(store.messages(c.id).at(-1).content,/lantern/);
    assert.equal(modelCalls,4);
    assert.ok(store.learning.diagnostics(c.id).some(e=>e.kind==="skipped"&&e.payload.reason.includes("reference knowledge")));
    assert.equal(store.listMemories().length,0);
  }finally{await new Promise(r=>server.close(r));store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("NAS strict public research uses shared evidence guard and never streams rejected claims",async()=>{
  const {executeNasTurn}=await import("../turn.mjs");
  const root=mkdtempSync(join(tmpdir(),"mikan-strict-grounding-")),store=openStore(join(root,"db.sqlite3"));
  try{
    const chat=store.newConversation(),question="What is the release year of the studio album Winterglass?";
    store.append(chat.id,"user",question);
    const source={title:"Winterglass studio album release",url:"https://example.org/release",content:"The studio album Winterglass was released in 2023.",kind:"page",publishedDate:"2023-01-01"};
    let reserved=0;const chunks=[],events=[];
    const result=await executeNasTurn({store,conversationId:chat.id,question,selected:{provider:"nvidia",model:"test",historyChars:16000},mode:"strict",
      reserve:()=>reserved++,canRequest:()=>true,search:async()=>[source],read:async()=>source,
      requestModel:async({system,onDelta})=>{
        if(system.startsWith("You are a read-only research planner"))return JSON.stringify(reserved===1?{action:"search",query:"Winterglass studio album"}:{action:"none"});
        assert.match(system,/PERSONAL DETAIL ACCURACY/);assert.match(system,/America\/Detroit/);
        assert.match(system,/Winterglass was released in 2023/);
        const answer='The studio album "Winterglass" was released in 2023. [1]\nThey released an album titled "Invented Album" in 2028. [1]';
        onDelta(answer);return answer;
      },onDelta:part=>chunks.push(part),activity:e=>events.push(e)});
    assert.equal(reserved,3);assert.match(result.answer,/2023/);assert.doesNotMatch(result.answer,/Invented Album|2028/);
    assert.equal(chunks.join(""),result.answer);
    assert.ok(events.some(e=>e.title==="Research evidence audit"&&e.detail.includes("rejected 1")));
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("NAS uses shared deterministic memory selection and imported session continuity",()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-parity-memory-")),store=openStore(join(root,"db.sqlite3"));
  try{
    store.library.execute("importFacts",{items:[{fact:"The user currently lives in Bay City, Michigan.",category:"profile",tags:["location"],pinned:false},{fact:"The user likes black metal.",category:"preferences",tags:["music"],pinned:true}]});
    assert.match(store.library.context("What is happening near me?",null).text,/Bay City/);
    assert.equal(store.library.context("Hello",null).ids.length,0);
    const old=store.newConversation(),current=store.newConversation();
    store.db.prepare("INSERT INTO session_summaries(conversation_id,summary,last_message_rowid) VALUES(?,?,?)").run(old.id,'- Beholder NAS configuration [user said: "Beholder uses a Synology NAS"]',1);
    assert.match(store.library.context("Continue configuring Beholder",current.id).text,/EARLIER RELATED SESSION/);
    store.library.execute("deleteSummary",{id:old.id});
    assert.doesNotMatch(store.library.context("Continue configuring Beholder",current.id).text,/Synology NAS/);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});
test("session summary opt-in uses original evidence-checked merge and persists watermark",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-parity-session-")),store=openStore(join(root,"db.sqlite3"));
  try{
    const chat=store.newConversation();
    for(let i=0;i<6;i++){store.append(chat.id,"user","I am working on the Beholder project number "+i);store.append(chat.id,"assistant","Understood");}
    let calls=0;
    const generate=async()=>{calls++;return JSON.stringify({notes:[{note:"Beholder project",evidence:"I am working on the Beholder project number 0"},{note:"Invented detail",evidence:"I made a spaceship"}]});};
    const config={provider:"nvidia",model:"test"};
    await store.learning.processNext(generate,config);assert.equal(calls,0);
    store.learning.setSettings({user:false,character:false,sessions:true});
    await store.learning.processNext(generate,config);assert.equal(calls,1);
    const summaries=store.library.execute("snapshot",{}).sessionSummaries;
    assert.match(summaries[0].summary,/Beholder project/);assert.doesNotMatch(summaries[0].summary,/Invented detail/);
    await store.learning.processNext(generate,config);assert.equal(calls,1);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("structured NVIDIA evidence uses tool arguments and reports reasoning budget without exposing reasoning",async()=>{
 const usage=[],chunks=[];
 const tool={type:"function",function:{name:"submit_source_evidence",parameters:{type:"object"}}};
 const args='{"passages":[],"suggestions":[]}';
 const config={provider:"nvidia",model:"test",key:"synthetic-test-key"};
 const answer=await generateReply({config,system:"Evidence",history:[{role:"user",content:"Test"}],structuredTool:tool,onDelta:t=>chunks.push(t),onUsage:v=>usage.push(v),fetchImpl:async(_url,options)=>{
   const body=JSON.parse(options.body);assert.equal(body.stream,false);assert.equal(body.tool_choice,"required");assert.equal(body.max_tokens,4096);
   return Response.json({choices:[{finish_reason:"tool_calls",message:{reasoning_content:"private reasoning",tool_calls:[{function:{name:"submit_source_evidence",arguments:args}}]}}],usage:{completion_tokens:900,completion_tokens_details:{reasoning_tokens:800}}});
 }});
 assert.equal(answer,args);assert.deepEqual(chunks,[]);assert.equal(usage[0].reasoningTokens,800);assert.equal(usage[0].finishReason,"tool_calls");
 assert.doesNotMatch(JSON.stringify(usage),/private reasoning/);
 await assert.rejects(generateReply({config,system:"Test",history:[],structuredTool:tool,fetchImpl:async()=>Response.json({choices:[{finish_reason:"length",message:{content:""}}]})}),e=>e.code==="output-limit");
});
test("ordinary chat bypasses unrelated enabled knowledge catalogue and does not duplicate latest user message",async()=>{
 const {executeNasTurn}=await import("../turn.mjs");
 const root=mkdtempSync(join(tmpdir(),"mikan-route-")),store=openStore(join(root,"db.sqlite3"));
 try{
   const chat=store.newConversation(),question="I'm bored. Entertain me.";store.append(chat.id,"user",question);
   const knowledge={enabled:()=>true,notionPages:()=>[],candidates:()=>[{id:"doc",title:"Architecture Notes",kind:"notion"}]};
   let calls=0;
   const result=await executeNasTurn({store,conversationId:chat.id,question,selected:{provider:"nvidia",model:"test",historyChars:16000},mode:"strict",knowledge,reserve:()=>calls++,canRequest:()=>true,search:async()=>{throw Error("unexpected web");},requestModel:async({system,history,onDelta})=>{
     if(system.startsWith("You are a read-only research planner"))return '{"action":"none"}';
     assert.equal(history.length,1);assert.doesNotMatch(system,/Earlier owner message 1: I'm bored/);
     onDelta("Let's invent a ridiculous story.");return "Let's invent a ridiculous story.";
   }});
   assert.equal(calls,2);assert.match(result.answer,/story/);
 }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test("structured public planner preserves discovery task and quoted constraints",async()=>{
 const history=[{role:"user",content:"Recommend three horror anime with fewer than six episodes."},{role:"user",content:"Only ones that were released after 2010, please."}];
 const task={kind:"discover",requirements:[{quote:"fewer than six episodes",relation:"lt",limit:6,unit:"episodes"},{quote:"after 2010",relation:"gt",limit:2010,unit:"release year"}],roles:[],exclude:[]};
 const events=[];
 const result=await researchTurn({mode:"strict",history,canRequest:()=>true,generate:async args=>{
   assert.equal(args.structuredTool.function.name,"plan_public_research");assert.equal(args.maxTokens,2048);
   return JSON.stringify({action:"search",intent:"refine",query:"short horror anime",task,readIndices:[]});
 },search:async()=>[],activity:e=>events.push(e)});
 assert.equal(result.task.kind,"discover");assert.equal(result.task.requirements.length,2);assert.match(result.constraintQuestion,/fewer than six episodes/);
 assert.ok(events.some(e=>e.title==="Research task"));
});

test("followup retains previously validated task constraints even when planner omits the old limit",async()=>{
 const old={kind:"discover",requirements:[{quote:"fewer than six episodes",relation:"lt",limit:6,unit:"episodes"}],roles:[],exclude:[]};
 const history=[{role:"user",content:"Recommend horror anime with fewer than six episodes."},{role:"user",content:"Only ones released after 2010."}];
 const result=await researchTurn({mode:"strict",history,activeTask:old,canRequest:()=>true,generate:async()=>JSON.stringify({action:"search",intent:"refine",query:"short horror anime",task:{kind:"discover",requirements:[{quote:"after 2010",relation:"gt",limit:2010,unit:"release year"}],roles:[],exclude:[]}}),search:async()=>[]});
 assert.equal(result.task.requirements.length,2);
 assert.equal(result.task.requirements[0].unit,"episodes");
});

test("channel requests require upgraded host and reject arbitrary image tags",()=>{
 const root=mkdtempSync(join(tmpdir(),"mikan-channel-"));
 try{
  const control=updateControl(root);control.publish("current","a".repeat(40),"a".repeat(40));
  assert.throws(()=>control.queue("switch-preview"),/host scripts/);
  control.publish("current","a".repeat(40),"a".repeat(40),"stable");
  assert.throws(()=>control.queue("switch-ghcr.io/other/image"),/Invalid update action/);
  assert.deepEqual(control.queue("switch-preview"),{queued:"switch-preview"});
  assert.equal(control.take(),"switch-preview");
  control.publish("updated","b".repeat(40),"b".repeat(40),"preview");
  assert.equal(control.get().host.channel,"preview");
  assert.equal(control.get().host.history[0].channel,"preview");
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("native agent adapter preserves real tool calls and tool result messages",async()=>{
 const config={provider:"nvidia",model:"nvidia/nemotron-3-ultra-550b-a55b",key:"synthetic-test-key"};
 const call={id:"call_1",type:"function",function:{name:"search_web",arguments:'{"query":"Brian Fair Shadows Fall birth year"}'}};
 const agentTools=[{type:"function",function:{name:"search_web",parameters:{type:"object"}}}];
 const result=await generateReply({config,system:"test",agentTools,history:[{role:"user",content:"test"},{role:"assistant",content:null,tool_calls:[call]},{role:"tool",tool_call_id:"call_1",content:"test result"}],fetchImpl:async(_url,opts)=>{
   const body=JSON.parse(opts.body);assert.equal(body.stream,false);assert.equal(body.tool_choice,"auto");assert.equal(body.chat_template_kwargs.enable_thinking,false);assert.equal(body.messages.at(-1).tool_call_id,"call_1");assert.deepEqual(body.messages.at(-2).tool_calls,[call]);
   return Response.json({choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[call]}}]});
 }});
 assert.deepEqual(result.toolCalls,[call]);
});
test("agent executes actual calls, preserves natural queries and prevents unapproved reads",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let round=0,reads=0;const queries=[],events=[];
 const call=(id,name,args)=>({id,type:"function",function:{name,arguments:JSON.stringify(args)}});
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"What is the latest official model?"}],canRequest:()=>true,activity:e=>events.push(e),
   search:async q=>{queries.push(q);return [{url:"https://example.org/release",title:"Example model release",content:"Example Model 4 officially released."}]},
   read:async()=>{reads++;return {url:"https://example.org/release",title:"Release",content:"Example Model 4 officially released."};},
   generate:async args=>{
     round++;
     if(round===1)return {content:"",toolCalls:[call("a","search_web",{query:"Example model official release"})]};
     assert.equal(args.history.at(-1).role,"tool");
     if(round===2)return {content:"",toolCalls:[call("b","read_webpage",{url:"http://127.0.0.1/private"})]};
     assert.match(args.history.at(-1).content,/explicitly supplied/);
     return {content:"Example Model 4 officially released [1].",toolCalls:[]};
   },compose:async()=>{throw Error("A completed answer must not be regenerated");}});
 assert.deepEqual(queries,["Example model official release"]);assert.equal(reads,0);assert.match(result.answer,/Example Model 4/);assert.equal(round,3);
});

test("agent obeys no-browse and refuses unverified latest answer after skipped lookup",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");
 const common={mode:"simple",canRequest:()=>true,search:async()=>{throw Error("unexpected search")},read:async()=>{throw Error("unexpected read")},generate:async()=>({content:"NO_PUBLIC_RESEARCH",toolCalls:[]})};
 assert.equal(await agentResearch({...common,history:[{role:"user",content:"Don't browse. What is the latest model?"}]}),null);
 const skipped=await agentResearch({...common,history:[{role:"user",content:"What is the latest model?"}]});
 assert.match(skipped.answer,/could not complete a public lookup/);
});

test("agent reserves a separate normal answer request instead of disabling tools mid-turn",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let calls=0,composed=0;const events=[];
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"Recommend short horror anime."}],canRequest:slots=>calls+composed+(slots??1)<=3,activity:e=>events.push(e),
  search:async()=>[{url:"https://example.org/anime",title:"Lantern",content:"Lantern has four episodes."}],read:async()=>{throw Error("unexpected read");},
  generate:async args=>{calls++;assert.equal(args.agentToolChoice,"auto");assert.deepEqual(args.agentTools.map(t=>t.function.name),["search_web","read_webpage"]);return {content:"",toolCalls:[{id:"call"+calls,type:"function",function:{name:"search_web",arguments:JSON.stringify({query:"short horror anime "+calls})}}]};},
  compose:async args=>{composed++;assert.equal(args.agentTools,undefined);assert.equal(args.structuredTool,undefined);assert.equal(args.maxTokens,4096);assert.equal(args.agentEffort,"medium");assert.match(args.history[0].content,/Lantern has four episodes/);return "Lantern looks promising, with four episodes.";}}); 
 assert.equal(calls,2);assert.equal(composed,1);assert.match(result.answer,/Lantern looks promising/);assert.match(result.answer,/unverified/);assert.ok(events.some(e=>e.detail==="quota-reserve"));
});
test("agent strict synthesis retains earlier constraints and qualifies invalid citations without erasing prose",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let calls=0;
 const result=await agentResearch({mode:"strict",history:[{role:"user",content:"Find an anime under six episodes."},{role:"user",content:"Only after 2010."}],canRequest:()=>true,
 search:async()=>[{url:"https://example.org/anime",title:"Lantern",content:"Lantern has four episodes. It premiered in 2014."}],
 generate:async()=>++calls===1?{content:"",toolCalls:[{id:"1",type:"function",function:{name:"search_web",arguments:'{"query":"short anime after 2010"}'}}]}:{content:"RESEARCH_DONE",toolCalls:[]},
 compose:async args=>{assert.match(args.system,/check every material claim/);assert.match(args.history[0].content,/under six episodes/);assert.match(args.history[0].content,/Only after 2010/);return "Lantern has four episodes [1]. It premiered in 2014 [99].";}});
 assert.match(result.answer,/four episodes \[1\]/);assert.match(result.answer,/unverified reference/);assert.doesNotMatch(result.answer,/\[99\]/);
});
test("web extraction removes quoted template attributes and navigation without losing facts",async()=>{
 const result=await readWeb("https://example.org",async()=>({type:"text/html",body:"<html><head><title>Test</title></head><nav>menu links</nav><div data-mw='{\"template\":\"[[Hidden]] > broken markup <ref>\"}'><p>Lantern premiered in 2014 &amp; has 4 episodes.</p><p>Author&#x27;s name</p></div><footer>footer spam</footer></html>"}));
 assert.match(result.content,/Lantern premiered in 2014 & has 4 episodes/);
 assert.match(result.content,/Author's name/);assert.doesNotMatch(result.content,/template|Hidden|menu links|footer spam/);
});

test("native agent can finish an ordinary chat in one model call with no public tools executed",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let calls=0;
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"I'm bored. Entertain me."}],canRequest:()=>true,publicVoice:"Warm and playful",
 generate:async args=>{calls++;assert.equal(args.agentThinking,true);assert.match(args.system,/just answer/);assert.match(args.system,/Warm and playful/);return {content:"Let's invent a ridiculous story.",toolCalls:[]};},
 compose:async()=>{throw Error("unexpected synthesis")},search:async()=>{throw Error("unexpected search")}});
 assert.equal(calls,1);assert.equal(result.answer,"Let's invent a ridiculous story.");assert.deepEqual(result.researched.sources,[]);
});
test("native agent hands private-context requests to tool-free chat",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"Remind me what we discussed."}],canRequest:()=>true,
 generate:async()=>({content:"NEED_PRIVATE_CONTEXT",toolCalls:[]}),compose:async()=>{throw Error("unexpected compose")}});
 assert.equal(result,null);
});
test("native search guard accepts numeric comparisons but still rejects private identities and markup",async()=>{
 const {validateAgentQuery}=await import("../agent-research.mjs");
 assert.equal(validateAgentQuery("horror anime <6 episodes after 2010").query,"horror anime fewer than 6 episodes after 2010");
 assert.equal(validateAgentQuery("horror anime >=2011 <6 episodes").query,"horror anime at least 2011 fewer than 6 episodes");
 assert.equal(validateAgentQuery("my wife's birthday").search,false);
 assert.equal(validateAgentQuery("anime <script>alert(1)</script>").search,false);
 assert.equal(validateAgentQuery("Rowan birthday",[{category:"family",fact:"The fictional spouse is Rowan."}]).search,false);
});
test("blocked searches do not silently become verified answers or consume the whole tool budget",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let calls=0;const events=[];
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"Recommend short horror anime."}],canRequest:()=>true,diagnostics:true,activity:e=>events.push(e),
 generate:async()=>({content:"",toolCalls:[{id:"c"+(++calls),type:"function",function:{name:"search_web",arguments:'{"query":"my private address"}'}}]}),
 search:async()=>{throw Error("unexpected search")},compose:async args=>{assert.match(args.history[0].content,/No public lookup produced evidence/);return "I couldn't verify the titles online."; }});
 assert.equal(calls,2);assert.ok(events.some(e=>e.title==="Public query rejected"&&e.detail.includes("private context")));assert.match(result.answer,/No public sources were retrieved/);
});
test("native adapter explicitly enables thinking only for the experimental tool request",async()=>{
 const config={provider:"nvidia",model:"nvidia/nemotron-3-ultra-550b-a55b",key:"synthetic-test-key"};
 const result=await generateReply({config,system:"test",history:[{role:"user",content:"test"}],agentTools:[{type:"function",function:{name:"search_web",parameters:{type:"object"}}}],agentThinking:true,fetchImpl:async(_url,opts)=>{
 const body=JSON.parse(opts.body);assert.equal(body.chat_template_kwargs.enable_thinking,true);assert.equal(body.chat_template_kwargs.force_nonempty_content,undefined);
 return Response.json({choices:[{finish_reason:"stop",message:{content:"Natural answer",reasoning_content:"not returned"}}]});
 }});
 assert.deepEqual(result,{content:"Natural answer",toolCalls:[]});
});

test("year sequences are not telephone numbers, while ordinary contact details remain blocked",async()=>{
 const {validateAgentQuery}=await import("../agent-research.mjs");
 for(const q of ["latest officially released Qwen model 2024 2025","horror anime 2011 2012 2013 2024 episodes","horror anime 2010-2020"]){
   assert.equal(validateAgentQuery(q).search,true,q);
 }
 for(const q of ["555 123 4567","search +1 (989) 555-0123","contact 2024 2025","person example@example.org","search https://example.org/private"]){
   assert.equal(validateAgentQuery(q).search,false,q);
 }
});
test("medium effort uses the documented Ultra template without changing legacy requests",async()=>{
 const config={provider:"nvidia",model:"nvidia/nemotron-3-ultra-550b-a55b",key:"synthetic-test-key"};
 const bodyList=[];let usage;
 const result=await generateReply({config,system:"test",history:[{role:"user",content:"test"}],agentTools:[{type:"function",function:{name:"search_web",parameters:{type:"object"}}}],agentEffort:"medium",onUsage:v=>usage=v,fetchImpl:async(_url,opts)=>{
   bodyList.push(JSON.parse(opts.body));return Response.json({choices:[{finish_reason:"stop",message:{content:"Natural answer"}}]});
 }});
 assert.equal(result.content,"Natural answer");assert.deepEqual(bodyList[0].chat_template_kwargs,{enable_thinking:true,medium_effort:true});assert.equal(usage.reasoningEffort,"medium");
});
test("native fallback rejects length-truncated streaming prose and reports the partial output",async()=>{
 const config={provider:"nvidia",model:"nvidia/nemotron-3-ultra-550b-a55b",key:"synthetic-test-key"};
 const fetchImpl=async(_url,opts)=>{
   assert.deepEqual(JSON.parse(opts.body).chat_template_kwargs,{enable_thinking:false,force_nonempty_content:true});
   return new Response('data: {"choices":[{"delta":{"content":"Partial reply"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n');
 };
 await assert.rejects(()=>generateReply({config,system:"test",history:[{role:"user",content:"test"}],agentEffort:"none",rejectTruncated:true,fetchImpl}),e=>e.code==="output-limit"&&e.partial==="Partial reply");
});
test("native agent recovers a truncated final answer once without repeating research",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let rounds=0,searches=0;const attempts=[],events=[];
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"Find a short horror anime."}],canRequest:()=>true,activity:e=>events.push(e),
 search:async()=>{searches++;return [{url:"https://example.org/anime",title:"Lantern",content:"Lantern has four episodes."}];},
 generate:async args=>{assert.equal(args.agentEffort,"medium");assert.equal(args.maxTokens,4096);return ++rounds===1?{content:"",toolCalls:[{id:"1",type:"function",function:{name:"search_web",arguments:'{"query":"short horror anime"}'}}]}:{content:"RESEARCH_DONE",toolCalls:[]};},
 compose:async args=>{attempts.push(args);assert.equal(args.rejectTruncated,true);if(attempts.length===1)throw Object.assign(Error("output-limit"),{code:"output-limit",partial:"Lantern has"});return "Lantern has four episodes [1].";}});
 assert.equal(searches,1);assert.equal(attempts.length,2);assert.equal(attempts[0].agentEffort,"medium");assert.equal(attempts[1].agentEffort,"none");assert.equal(attempts[1].maxTokens,2048);assert.equal(result.answer,"Lantern has four episodes [1].");assert.ok(events.some(e=>e.title==="Answer recovery"));
});
test("truncated response is explicitly marked if no further quota remains",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let remaining=3;
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"Find a short horror anime."}],canRequest:(n=1)=>remaining>=n,
 search:async()=>[{url:"https://example.org/anime",title:"Lantern",content:"Lantern has four episodes."}],
 generate:async()=>{remaining--;return remaining===2?{content:"",toolCalls:[{id:"1",type:"function",function:{name:"search_web",arguments:'{"query":"short horror anime"}'}}]}:{content:"RESEARCH_DONE",toolCalls:[]};},
 compose:async()=>{remaining--;throw Object.assign(Error("output-limit"),{code:"output-limit",partial:"Lantern has four episodes [1]."});}});
 assert.match(result.answer,/Response incomplete: output limit reached/);assert.equal(remaining,0);
});
test("independent page reads execute concurrently with stable source IDs and ordered tool results",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let round=0,active=0,maxActive=0,reads=0;
 const call=(id,name,args)=>({id,type:"function",function:{name,arguments:JSON.stringify(args)}});
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"Find facts about Lantern."}],canRequest:()=>true,
 search:async()=>["a","b"].map(x=>({url:"https://example.org/"+x,title:x,content:"Preview "+x})),
 read:async url=>{reads++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,url.endsWith("/a")?20:5));active--;return {url,title:url,content:"Source evidence ".repeat(12)};},
 generate:async args=>{round++;if(round===1)return {content:"",toolCalls:[call("s","search_web",{query:"Lantern facts"})]};
 if(round===2)return {content:"",toolCalls:[call("a","read_webpage",{source:1}),call("b","read_webpage",{source:2}),call("duplicate","read_webpage",{source:1})]};
 assert.deepEqual(args.history.slice(-3).map(m=>m.tool_call_id),["a","b","duplicate"]);assert.equal(JSON.parse(args.history.at(-3).content).source.number,1);assert.equal(JSON.parse(args.history.at(-2).content).source.number,2);assert.match(args.history.at(-1).content,/Already read/);
 return {content:"Two sources agree [1][2].",toolCalls:[]};},
 compose:async()=>{throw Error("unexpected compose")}});
 assert.equal(reads,2);assert.equal(maxActive,2);assert.equal(result.researched.sources.length,2);
});
test("same-batch search cannot authorize a guessed source handle",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let round=0;
 const call=(id,name,args)=>({id,type:"function",function:{name,arguments:JSON.stringify(args)}});
 await agentResearch({mode:"simple",history:[{role:"user",content:"Find Lantern."}],canRequest:()=>true,search:async()=>[{url:"https://example.org/a",title:"Lantern",content:"Preview"}],
 read:async()=>{throw Error("guessed handle must never be read");},
 generate:async args=>{if(++round===1)return {content:"",toolCalls:[call("s","search_web",{query:"Lantern facts"}),call("r","read_webpage",{source:1})]};assert.match(args.history.at(-1).content,/explicitly supplied/);return {content:"Found Lantern [1].",toolCalls:[]};}});
});

test("native citations normalize provider line notation but never authorize nonexistent sources",async()=>{
 const {agentResearch,normalizeAgentCitations}=await import("../agent-research.mjs");let round=0;const events=[];
 assert.equal(normalizeAgentCitations("A【6†L1-L4】 B【10】 C[2]"),"A[6] B[10] C[2]");
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"Find Lantern facts."}],canRequest:()=>true,activity:e=>events.push(e),
 search:async()=>[{url:"https://example.org/a",title:"Lantern",kind:"preview",content:"Lantern has four episodes."}],
 generate:async()=>++round===1?{content:"",toolCalls:[{id:"s",type:"function",function:{name:"search_web",arguments:'{"query":"Lantern facts"}'}}]}:{content:"Lantern has four episodes 【1†L1-L4】. Another claim 【99】.",toolCalls:[]}});
 assert.match(result.answer,/four episodes \[1\]/);assert.match(result.answer,/unverified reference/);assert.doesNotMatch(result.answer,/【|†L|\[99\]/);assert.ok(events.some(e=>e.title==="Citation format normalized"));assert.equal(result.researched.agentEvidence.length,1);
});
test("native search lets model reserve source slots and returns only selected results",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let round=0,searches=0;
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"Find three Lantern facts."}],canRequest:()=>true,
 search:async()=>{searches++;return Array.from({length:8},(_,i)=>({url:"https://example.org/"+searches+"/"+i,title:"Lantern "+i,kind:"preview",content:"Candidate evidence"}));},
 generate:async args=>{round++;if(round>1){const out=JSON.parse(args.history.at(-1).content);assert.equal(out.sources.length,2);assert.equal(out.sources[0].number,(round-2)*2+1);}
 if(round<=4)return {content:"",toolCalls:[{id:"s"+round,type:"function",function:{name:"search_web",arguments:JSON.stringify({query:"Lantern candidate "+round,max_results:2})}}]};
 throw Error("unexpected round");},compose:async args=>{assert.equal(JSON.parse(args.history[0].content).sources.length,8);return "Candidate facts [1][3][5].";}});
 assert.equal(searches,4);assert.equal(result.researched.sources.length,8);
});
test("native follow-up uses bounded prior evidence and preserves retrieval date without searching again",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");const now=new Date("2026-11-24T20:00:00Z"),retrievedAt=now.getTime()-1000;
 const history=[{role:"user",content:"Find Lantern episodes."},{role:"assistant",content:"Untrusted old assistant prose."},{role:"user",content:"Only after 2010."}];
 const previousEvidence=[{url:"https://example.org/a",title:"Lantern",kind:"page",content:"Lantern premiered in 2014 and has four episodes.",retrievedAt}];
 const result=await agentResearch({mode:"simple",history,previousEvidence,now,canRequest:()=>true,
 search:async()=>{throw Error("unexpected search")},generate:async args=>{const input=JSON.parse(args.history[0].content);assert.equal(input.previousPublicSources[0].number,1);assert.equal(input.previousPublicSources[0].priorTurn,true);assert.doesNotMatch(args.history[0].content,/Untrusted old assistant prose/);return {content:"Lantern qualifies [1].",toolCalls:[]};}});
 assert.equal(result.answer,"Lantern qualifies [1].");assert.equal(result.researched.agentEvidence[0].retrievedAt,retrievedAt);
});
test("native follow-up does not treat reused evidence as fresh or carry private/stale sources",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");const now=new Date("2026-11-24T20:00:00Z"),retrievedAt=now.getTime()-1000;
 const history=[{role:"user",content:"Find Lantern status."},{role:"assistant",content:"Old reply."},{role:"user",content:"Verify its current status."}];
 const previousEvidence=[{url:"https://example.org/a",title:"Lantern",kind:"page",content:"Old status",retrievedAt},{url:"https://example.org/stale",kind:"preview",content:"Stale",retrievedAt:retrievedAt-90000000},{url:"https://example.org/private",kind:"notion",content:"Private doc",retrievedAt}];
 const result=await agentResearch({mode:"simple",history,previousEvidence,now,canRequest:()=>true,
 generate:async args=>{assert.equal(JSON.parse(args.history[0].content).previousPublicSources.length,1);return {content:"Still airing [1].",toolCalls:[]};}});
 assert.match(result.answer,/could not complete a public lookup/);assert.doesNotMatch(result.answer,/Still airing/);
});
test("native unrelated casual reply does not keep prior public sources attached",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");const now=new Date("2026-11-24T20:00:00Z");
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"Find Lantern facts."},{role:"assistant",content:"Old reply."},{role:"user",content:"Tell me a joke."}],previousEvidence:[{url:"https://example.org/a",kind:"page",content:"Lantern facts",retrievedAt:now.getTime()-1000}],now,canRequest:()=>true,generate:async()=>({content:"A joke.",toolCalls:[]})});
 assert.equal(result.answer,"A joke.");assert.deepEqual(result.researched.sources,[]);assert.equal(result.researched.agentEvidence,undefined);
});

test("native agent persists newly read pages even when fetch completes after turn start",async()=>{
 const {agentResearch}=await import("../agent-research.mjs");let round=0;const now=new Date("2026-11-24T20:00:00Z");
 const result=await agentResearch({mode:"simple",history:[{role:"user",content:"Find Lantern facts."}],now,canRequest:()=>true,
 search:async()=>[{url:"https://example.org/a",title:"Lantern",kind:"preview",content:"Lantern preview."}],
 read:async()=>({url:"https://example.org/a",title:"Lantern",kind:"page",content:"Lantern has four episodes. ".repeat(8),fetchedAt:now.getTime()+3000,fromCache:false}),
 generate:async()=>{round++;return round===1?{content:"",toolCalls:[{id:"s",type:"function",function:{name:"search_web",arguments:'{"query":"Lantern facts"}'}}]}:round===2?{content:"",toolCalls:[{id:"r",type:"function",function:{name:"read_webpage",arguments:'{"source":1}'}}]}:{content:"Lantern has four episodes [1].",toolCalls:[]};}});
 assert.equal(result.researched.agentEvidence.length,1);assert.equal(result.researched.agentEvidence[0].kind,"page");assert.equal(result.researched.agentEvidence[0].retrievedAt,now.getTime());
});

test("quota diagnostics distinguish rolling local limits, cooldown and upstream response",()=>{
 const store=openStore(":memory:");let time=1795572120000;
 try{
 const models=providerSettings({initial:{provider:"nvidia",model:"test",key:"synthetic-test-key"},db:store.db,now:()=>time});
 for(let i=0;i<30;i++)models.reserve("nvidia");
 assert.equal(models.quota("nvidia").requestsLastMinute,30);assert.equal(models.quota("nvidia").reason,"local-minute");
 assert.throws(()=>models.reserve("nvidia"),e=>e.code==="local-minute"&&e.quota.remainingMinute===0);
 time+=60001;assert.equal(models.quota("nvidia").remainingMinute,30);
 models.observe("nvidia",{status:429,headers:{"retry-after":"10"}});models.cooldown("nvidia");
 assert.equal(models.quota("nvidia").reason,"cooldown");assert.equal(models.quota("nvidia").waitMs,300000);assert.equal(models.quota("nvidia").lastRejection.status,429);
 time+=300001;assert.equal(models.quota("nvidia").reason,null);
 }finally{store.db.close();}
});
test("provider exposes safe quota headers and HTTP status without raw response bodies",async()=>{
 const {quotaHeaders}=await import("../providers.mjs");
 const headers=new Headers({"retry-after":"15","x-ratelimit-remaining-requests":"0","authorization":"Bearer secret","x-ratelimit-reset":"private-data"});
 assert.deepEqual(quotaHeaders(headers),{"retry-after":"15","x-ratelimit-remaining-requests":"0"});
 const seen=[];
 await assert.rejects(()=>generateReply({config:{provider:"nvidia",model:"test",key:"synthetic-test-key"},system:"test",history:[],onResponse:r=>seen.push(r),fetchImpl:async()=>new Response("private upstream details",{status:429,headers})}),e=>e.upstreamStatus===429&&!e.message.includes("private"));
 assert.deepEqual(seen,[{status:429,headers:{"retry-after":"15","x-ratelimit-remaining-requests":"0"}}]);
});

test("Groq is selectable without exposing its key or permitting arbitrary model IDs",()=>{
 const store=openStore(":memory:");
 try{
  const models=providerSettings({env:{NVIDIA_API_KEY:"synthetic-nvidia-secret"},db:store.db});
  const view=models.save({provider:"groq",model:"openai/gpt-oss-120b",apiKey:"synthetic-groq-secret",select:true});
  assert.equal(models.active().provider,"groq");
  assert.equal(models.active().key,"synthetic-groq-secret");
  assert.ok(!JSON.stringify(view).includes("synthetic-groq-secret"));
  assert.deepEqual(view.providers.find(p=>p.provider==="groq").models,["openai/gpt-oss-120b","openai/gpt-oss-20b"]);
  assert.equal(models.quota("groq").minuteLimit,30);
  assert.equal(models.quota("groq").dayLimit,1000);
  assert.throws(()=>models.save({provider:"groq",model:"unknown-model"}),/Invalid model/);
 }finally{store.db.close();}
});
test("Groq native tool request uses supported GPT-OSS parameters and reports token usage",async()=>{
 const config={provider:"groq",model:"openai/gpt-oss-120b",key:"synthetic-groq-secret"},usage=[];
 const call={id:"c1",type:"function",function:{name:"search_web",arguments:'{"query":"short horror anime"}'}};
 const result=await generateReply({config,system:"test",history:[{role:"user",content:"test"}],agentTools:[{type:"function",function:{name:"search_web",parameters:{type:"object"}}}],agentEffort:"medium",maxTokens:4096,onUsage:v=>usage.push(v),fetchImpl:async(url,opts)=>{
  assert.equal(url,"https://api.groq.com/openai/v1/chat/completions");
  const body=JSON.parse(opts.body);assert.equal(body.max_completion_tokens,2048);assert.equal(body.max_tokens,undefined);
  assert.equal(body.reasoning_effort,"medium");assert.equal(body.include_reasoning,false);
  assert.equal(body.chat_template_kwargs,undefined);assert.equal(body.tool_choice,"auto");
  return Response.json({choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[call]}}],usage:{prompt_tokens:500,completion_tokens:100}});
 }});
 assert.deepEqual(result.toolCalls,[call]);assert.equal(usage[0].inputTokens,500);
});
test("Groq stream uses native usage metadata and keeps reasoning separate from displayed text",async()=>{
 const usage=[],deltas=[];
 const result=await generateReply({config:{provider:"groq",model:"openai/gpt-oss-20b",key:"synthetic-groq-secret"},system:"test",history:[{role:"user",content:"hi"}],onUsage:v=>usage.push(v),onDelta:v=>deltas.push(v),fetchImpl:async(_url,opts)=>{
 const body=JSON.parse(opts.body);assert.equal(body.stream,true);assert.equal(body.reasoning_effort,"low");assert.equal(body.stream_options,undefined);
 return new Response('data: {"choices":[{"delta":{"reasoning":"hidden"}}]}\n\ndata: {"choices":[{"delta":{"content":"Hi!"},"finish_reason":"stop"}],"x_groq":{"usage":{"prompt_tokens":500,"completion_tokens":25}}}\n\ndata: [DONE]\n\n');
 }});
 assert.equal(result,"Hi!");assert.deepEqual(deltas,["Hi!"]);assert.equal(usage[0].inputTokens,500);
});

test("thinking effort defaults to medium for Groq, persists and rejects unsupported values",()=>{
 const root=mkdtempSync(join(tmpdir(),"mikan-effort-")),store=openStore(join(root,"db.sqlite3"));
 try{
  const file=join(root,"providers.json"),env={GROQ_API_KEY:"synthetic-groq-secret",NVIDIA_API_KEY:"synthetic-nvidia-secret"};
  const models=providerSettings({env,file,db:store.db});
  const view=models.save({provider:"groq",select:true});
  assert.equal(view.reasoningEffort,"medium");assert.deepEqual(view.reasoningOptions,["low","medium","high"]);
  models.save({provider:"groq",reasoningEffort:"high"});
  assert.throws(()=>models.save({provider:"groq",reasoningEffort:"none"}),/Unsupported reasoning/);
  const reopened=providerSettings({env,file,db:store.db});assert.equal(reopened.active().reasoningEffort,"high");
  assert.equal(reopened.save({provider:"nvidia",select:true}).reasoningEffort,"auto");
  assert.equal(reopened.save({provider:"groq",select:true}).reasoningEffort,"high");
 }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});
test("ordinary Groq chat uses selected thinking effort without an extra inference call",async()=>{
 const {executeNasTurn}=await import("../turn.mjs"),store=openStore(":memory:");
 try{
  const chat=store.newConversation(),question="That's a funny story.";store.append(chat.id,"user",question);
  let calls=0;
  await executeNasTurn({store,conversationId:chat.id,question,selected:{provider:"groq",model:"openai/gpt-oss-120b",historyChars:16000,reasoningEffort:"medium"},mode:"off",reserve:()=>calls++,canRequest:()=>true,requestModel:async args=>{assert.equal(args.agentEffort,"medium");args.onDelta("Haha!");return "Haha!";}});
  assert.equal(calls,1);
 }finally{store.db.close();}
});

test("unrelated proper names in pasted anecdotes do not trigger knowledge planning",async()=>{
 const {planKnowledge}=await import("../knowledge-plan.mjs");
 const question="Subject: Newsletter inquiry\nChurch: St. Francis Xavier\nMessage body: I want to be the mission.";
 const pages=[{id:"doc",title:"Architecture Notes",url:"https://example.org/notes",syncedAt:1}];
 const knowledge={enabled:()=>true,notionPages:()=>pages,candidates:()=>pages.map(p=>({...p,kind:"notion"}))};
 const result=await planKnowledge({knowledge,history:[{role:"user",content:question}],previous:[],question,provider:"groq",canRequest:()=>true,generate:async()=>{throw Error("unexpected knowledge planner");}});
 assert.equal(result,null);
});
test("weak unrelated memory matches are omitted from NAS conversation context",()=>{
 const store=openStore(":memory:");
 try{
  const c=store.newConversation();
  store.library.execute("importFacts",{items:[{fact:"The user likes music.",category:"preferences",tags:["music"],pinned:false},{fact:"The user has read a story about a picture.",category:"preferences",tags:["book"],pinned:false}]});
  const memory=store.library.context("Subject: Newsletter picture\nMessage body: Please include a comment on page 1.",c.id);
  assert.deepEqual(memory.ids,[]);
  assert.doesNotMatch(memory.text,/story about a picture/);
  assert.match(store.library.context("What's my favorite music?",c.id).text,/likes music/);
 }finally{store.db.close();}
});

test("live research engine defaults to native and persists explicit legacy selection",()=>{
 const store=openStore(":memory:");
 try{const settings=researchSettings(store.db);assert.equal(settings.engine(),"native");settings.saveEngine("legacy");assert.equal(researchSettings(store.db).engine(),"legacy");assert.throws(()=>settings.saveEngine("unknown"),/Invalid research engine/);assert.equal(settings.get(),"off");}
 finally{store.db.close();}
});
test("excited follow-up uses full conversation in one private answer without repeated public search",async()=>{
 const {executeNasTurn}=await import("../turn.mjs"),store=openStore(":memory:");
 try{
  const chat=store.newConversation();store.append(chat.id,"user","Any news about the new album?");
  store.append(chat.id,"assistant","They plan to record next year.",{researchTask:{kind:"lookup",subject:"new album"}});
  const question="dude i'm so excited";store.append(chat.id,"user",question);
  let calls=0;
  const result=await executeNasTurn({store,conversationId:chat.id,question,selected:{provider:"groq",model:"openai/gpt-oss-120b",historyChars:16000,reasoningEffort:"medium"},mode:"simple",publicAgent:true,reserve:()=>calls++,canRequest:()=>true,search:async()=>{throw Error("unexpected search");},requestModel:async args=>{assert.equal(args.agentTools,undefined);assert.equal(args.history.at(-2).content,"They plan to record next year.");assert.match(args.system,/DIALOGUE STYLE/);return "That is going to be a long wait!";}});
  assert.equal(calls,1);assert.deepEqual(result.researched.sources,[]);
 }finally{store.db.close();}
});
test("owner dialogue examples persist as private voice configuration",async()=>{
 const {assistantVoiceGuidance}=await import("../../src/assistant-voice.ts");
 const store=openStore(":memory:");
 try{store.saveProfile({...DEFAULT_COMPANION_PROFILE,communication:{...DEFAULT_COMPANION_PROFILE.communication,dialogueExamples:"User: Fixed it.\nAssistant: Victory!"}});
 assert.match(assistantVoiceGuidance(store.getProfile()),/Victory!/);assert.match(assistantVoiceGuidance(store.getProfile()),/DIALOGUE STYLE/);}
 finally{store.db.close();}
});

test("persistent token meter separates model, provider, source, windows and unknown usage",()=>{
 const store=openStore(":memory:");
 let time=Date.UTC(2026,10,25,16);
 try{
  const models=providerSettings({db:store.db,env:{GROQ_API_KEY:"synthetic-groq-secret"},now:()=>time});
  models.save({provider:"groq",select:true});
  const add=(model,source,age,usage,failed=false)=>models.recordUsage({provider:"groq",model,source,startedAt:time-age,usage,failed});
  add("openai/gpt-oss-120b","chat",1000,{inputTokens:2000,outputTokens:300,reasoningTokens:100});
  add("openai/gpt-oss-120b","memory",120000,{inputTokens:800,outputTokens:20});
  add("openai/gpt-oss-120b","brain-lab",7200000,{inputTokens:1000,outputTokens:500});
  add("openai/gpt-oss-120b","chat",100,null,true);
  add("openai/gpt-oss-20b","chat",1000,{inputTokens:500,outputTokens:100});
  const snapshot=models.tokenUsage().groups.groq;
  const m=snapshot.models["openai/gpt-oss-120b"];
  assert.equal(m.minute.input,2000);assert.equal(m.minute.output,300);assert.equal(m.minute.reasoning,100);
  assert.equal(m.minute.missingInput,1);assert.equal(m.minute.failed,1);
  assert.equal(m.hour.input,2800);assert.equal(m.day.input,3800);assert.equal(snapshot.total.minute.input,2500);
  assert.equal(snapshot.sources.memory.input,800);assert.equal(snapshot.sources["brain-lab"].output,500);
  time+=61000;
  assert.equal(providerSettings({db:store.db,now:()=>time}).tokenUsage().groups.groq.models["openai/gpt-oss-120b"].minute.calls,0);
 }finally{store.db.close();}
});
test("token endpoint is authenticated and includes real provider adapter usage via chat",async()=>{
 const store=openStore(":memory:"),key="12345678901234567890123456789012";
 const server=makeServer({store,key,config:{provider:"groq",model:"openai/gpt-oss-120b",key:"synthetic-groq-secret"},generate:async args=>{
  args.onUsage({inputTokens:900,outputTokens:80,reasoningTokens:30,maxTokens:2048});args.onDelta("Hello.");return "Hello.";
 }});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const base="http://127.0.0.1:"+server.address().port,headers={Authorization:"Bearer "+key,"Content-Type":"application/json"};
 try{
  assert.equal((await fetch(base+"/api/token-usage")).status,401);
  const chat=store.newConversation();
  const response=await fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({conversationId:chat.id,text:"Hi"})});await response.text();
  const data=await (await fetch(base+"/api/token-usage",{headers})).json();
  assert.equal(data.groups.groq.total.minute.input,900);assert.equal(data.groups.groq.total.minute.output,80);
  assert.equal(data.groups.groq.sources.chat.calls,1);assert.ok(!JSON.stringify(data).includes("synthetic-groq-secret"));
 }finally{await new Promise(resolve=>server.close(resolve));store.db.close();}
});

test("Cerebras configuration is selectable, persisted, model-validated and trial-safe",()=>{
 const root=mkdtempSync(join(tmpdir(),"mikan-cerebras-")),store=openStore(join(root,"db.sqlite3"));
 try{
  const file=join(root,"providers.json");
  const models=providerSettings({db:store.db,file});
  const view=models.save({provider:"cerebras",apiKey:"synthetic-cerebras-secret",model:"gpt-oss-120b",select:true});
  assert.equal(view.reasoningEffort,"medium");assert.equal(view.cerebrasTier,"trial");assert.equal(models.quota("cerebras").minuteLimit,5);
  assert.ok(!JSON.stringify(view).includes("synthetic-cerebras-secret"));
  assert.throws(()=>models.save({provider:"cerebras",model:"not-supported"}),/Invalid model/);
  assert.throws(()=>models.save({provider:"cerebras",reasoningEffort:"none"}),/Unsupported reasoning/);
  models.save({provider:"cerebras",cerebrasTier:"paid",reasoningEffort:"high"});
  const reopened=providerSettings({db:store.db,file});assert.equal(reopened.active().reasoningEffort,"high");assert.equal(reopened.quota("cerebras").minuteLimit,1000);
 }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});
test("Cerebras stream uses its own documented parameters and counts usage",async()=>{
 const usage=[],deltas=[];
 const result=await generateReply({config:{provider:"cerebras",model:"gpt-oss-120b",key:"synthetic-cerebras-secret"},system:"test",history:[{role:"user",content:"Hi"}],agentEffort:"medium",onUsage:v=>usage.push(v),onDelta:v=>deltas.push(v),fetchImpl:async(url,opts)=>{
  assert.equal(url,"https://api.cerebras.ai/v1/chat/completions");const body=JSON.parse(opts.body);
  assert.equal(body.reasoning_format,"hidden");assert.equal(body.reasoning_effort,"medium");assert.equal(body.include_reasoning,undefined);assert.equal(body.stream_options,undefined);assert.equal(body.max_completion_tokens,4096);
  return new Response('data: {"choices":[{"delta":{"content":"Hi!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":600,"completion_tokens":35,"completion_tokens_details":{"reasoning_tokens":20}}}\n\ndata: [DONE]\n\n');
 }});
 assert.equal(result,"Hi!");assert.deepEqual(deltas,["Hi!"]);assert.equal(usage[0].inputTokens,600);assert.equal(usage[0].outputTokens,35);assert.equal(usage[0].reasoningTokens,20);
});
test("Cerebras supports native tool call and tool result continuation",async()=>{
 const call={id:"call_1",type:"function",function:{name:"search_web",arguments:'{"query":"public topic"}'}};
 const config={provider:"cerebras",model:"gpt-oss-120b",key:"synthetic-cerebras-secret"},agentTools=[{type:"function",function:{name:"search_web",parameters:{type:"object"}}}];
 const history=[{role:"user",content:"Find public topic"}];
 const first=await generateReply({config,system:"test",history,agentTools,agentEffort:"medium",fetchImpl:async(_url,opts)=>{
  const body=JSON.parse(opts.body);assert.equal(body.stream,false);assert.equal(body.tool_choice,"auto");assert.equal(body.parallel_tool_calls,false);assert.equal(body.max_completion_tokens,2048);
  return Response.json({choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[call]}}],usage:{prompt_tokens:1000,completion_tokens:100}});
 }});
 assert.deepEqual(first.toolCalls,[call]);
 const second=await generateReply({config,system:"test",history:[...history,{role:"assistant",content:null,tool_calls:first.toolCalls},{role:"tool",tool_call_id:call.id,content:"Public evidence"}],agentTools,fetchImpl:async(_url,opts)=>{
  const body=JSON.parse(opts.body);assert.deepEqual(body.messages.at(-1),{role:"tool",tool_call_id:"call_1",content:"Public evidence"});
  return Response.json({choices:[{finish_reason:"stop",message:{content:"Found it."}}],usage:{prompt_tokens:1200,completion_tokens:50}});
 }});
 assert.equal(second.content,"Found it.");
});

test("foreground chat preempts an in-flight memory job without losing it or running two requests at once",async()=>{
  const store=openStore(":memory:"),key="12345678901234567890123456789012";
  const chat=store.newConversation(),user=store.append(chat.id,"user","I love pears."),assistant=store.append(chat.id,"assistant","Pears are excellent.");
  store.learning.setSettings({user:true,character:false});store.learning.enqueue(user,assistant,chat.id);
  let memoryStarted,started=new Promise(resolve=>{memoryStarted=resolve;}),inferenceActive=0,chatCalls=0,interrupted=false;
  const server=makeServer({store,key,config:{provider:"groq",model:"openai/gpt-oss-120b",key:"synthetic-groq-secret"},memoryIdleMs:100,memoryPollMs:5,
    generate:async args=>{
      inferenceActive++;assert.equal(inferenceActive,1);
      try{
        if(args.system.startsWith("You are Mikan's memory decision engine")){
          memoryStarted();
          await new Promise((resolve,reject)=>{if(args.signal.aborted)reject(args.signal.reason);else args.signal.addEventListener("abort",()=>reject(args.signal.reason),{once:true});});
          return '{"facts":[],"interests":[],"canon":[]}';
        }
        chatCalls++;assert.equal(interrupted,true);args.onDelta("I'm here.");return "I'm here.";
      }finally{inferenceActive--;if(args.signal?.aborted)interrupted=true;}
    }});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port,headers={Authorization:"Bearer "+key,"Content-Type":"application/json"};
  let timer;
  try{
    await Promise.race([started,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Memory worker did not start")),3000);})]);clearTimeout(timer);
    const status=await (await fetch(base+"/api/status",{headers})).json();
    assert.equal(status.busy,false);assert.equal(status.memoryBusy,true);
    const response=await fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({conversationId:chat.id,text:"Hi again"})});
    assert.equal(response.status,200);assert.match(await response.text(),/I'm here/);
    assert.equal(chatCalls,1);assert.equal(interrupted,true);
    const original=store.db.prepare("SELECT status FROM nas_learning_jobs WHERE assistant_id=?").get(assistant.id);
    assert.equal(original.status,"queued");assert.equal(store.learning.getStatus().failed,0);
    assert.equal(store.messages(chat.id).at(-1).content,"I'm here.");
  }finally{clearTimeout(timer);await new Promise(resolve=>server.close(resolve));store.db.close();}
});
test("interrupted memory result is not persisted even if the model returns after abort",async()=>{
  const store=openStore(":memory:");
  try{
    const chat=store.newConversation(),controller=new AbortController();
    const user=store.append(chat.id,"user","I love pears."),assistant=store.append(chat.id,"assistant","Pears are excellent.");
    store.learning.setSettings({user:true,character:false});store.learning.enqueue(user,assistant,chat.id);
    const result=JSON.stringify({facts:[{action:"save",scope:"long_term",fact:"The user loves pears",category:"preferences",tags:[],evidence:"I love pears",relatedId:null}],interests:[],canon:[]});
    await store.learning.processNext(async()=>{controller.abort();return result;},{provider:"groq",model:"test"},{signal:controller.signal});
    assert.equal(store.learning.getStatus().queued,1);assert.equal(store.learning.getStatus().failed,0);assert.equal(store.listMemories().length,0);
    await store.learning.processNext(async()=>result,{provider:"groq",model:"test"});
    assert.equal(store.learning.getStatus().queued,0);assert.equal(store.listMemories().length,1);
  }finally{store.db.close();}
});
