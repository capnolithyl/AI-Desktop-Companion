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

test("NAS HTTP requires a key, streams replies and persists them",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-api-"));
  const store=openStore(join(root,"db.sqlite3"));
  const key="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const server=makeServer({
    store,key,config:{provider:"nvidia",model:"test",key:"not-a-real-provider-key"},
    generate:async ({history,onDelta,system})=>{
      assert.match(system,/Flirtiness 95\/100/);
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
    assert.ok(activity.events.some(e=>e.kind==="recall"&&e.payload.lines.length));
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
    for(let i=0;i<15;i++)reopened.reserve("openrouter");
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
    lib.remove("notion",scene);await assert.rejects(lib.load(candidates.find(p=>p.id===chapter),"manuscript","Chapter 1","nvidia"),/Linked scenes are missing/);
    lib.disconnect();assert.equal(lib.status().pages.length,0);assert.equal(lib.status().webPages.length,1);assert.equal(store.listMemories().length,0);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});
