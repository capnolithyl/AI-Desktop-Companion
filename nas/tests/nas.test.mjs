import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
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
    assert.equal((await fetch(base+"/api/library",{method:"POST",headers,body:JSON.stringify({action:"addFact",args:{fact:"A new owner-approved test fact"}})})).status,200);
    const library=await (await fetch(base+"/api/library",{headers})).json();
    assert.equal(library.facts[0].fact,"A new owner-approved test fact");
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
  const events='data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'+
    'data: {"choices":[{"delta":{"content":" there"}}]}\n\n'+'data: [DONE]\n\n';
  const chunks=[];
  const answer=await generateReply({
    config:{provider:"nvidia",model:"test-model",key:"some-secret-key"},
    system:"You are Mikan",history:[{role:"user",content:"Hi"}],
    onDelta:t=>chunks.push(t),
    fetchImpl:async()=>new Response(events,{status:200,headers:{"Content-Type":"text/event-stream"}})
  });
  assert.equal(answer,"Hello there");
  assert.deepEqual(chunks,["Hello"," there"]);
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

test("NAS learning is opt-in, quote-grounded and reviewable",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-learn-")),store=openStore(join(root,"memory.sqlite3"));
  const c=store.newConversation(),l=store.learning;
  const turn=(u,a)=>[store.append(c.id,"user",u),store.append(c.id,"assistant",a)];
  const response=async facts=>await l.processNext(async()=>JSON.stringify({facts,interests:[],canon:[]}),{});
  try{
    assert.equal(l.enqueue(...turn("I love coffee","Nice!"),c.id),false);
    l.setSettings({user:true,character:false});
    assert.equal(l.enqueue(...turn("My password is abc123","Okay"),c.id),false);
    assert.equal(l.enqueue(...turn("I love coffee","Nice!"),c.id),true);
    await response([{fact:"The user loves coffee",evidence:"I love coffee",scope:"long_term"},{fact:"The user likes tea",evidence:"I love tea",scope:"long_term"}]);
    assert.equal(store.library.execute("snapshot",{}).facts[0].fact,"The user loves coffee");
    assert.equal(l.getStatus().lastOutcome.saved,1);
    l.enqueue(...turn("Actually, I prefer tea instead of coffee","Got it"),c.id);
    const id=store.library.execute("snapshot",{}).facts[0].id;
    await response([{fact:"The user prefers tea instead of coffee",evidence:"Actually, I prefer tea instead of coffee",scope:"long_term",relatedId:id}]);
    const review=l.getStatus().reviews[0];assert.equal(review.targetId,id);
    assert.equal(store.library.execute("snapshot",{}).facts[0].fact,"The user loves coffee");
    l.resolve(review.id,"accept");
    assert.equal(store.library.execute("snapshot",{}).facts[0].fact,"The user prefers tea instead of coffee");
    assert.equal(l.getStatus().history.length,1);
    l.enqueue(...turn("I like pizza","Good"),c.id);
    await l.processNext(async()=>{throw Error("quota");},{});
    assert.equal(l.getStatus().failed,1);assert.equal(l.retry().count,1);
    l.setSettings({user:false,character:false});assert.equal(l.getStatus().queued,0);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});
