import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore, recall } from "../storage.mjs";
import { makeServer } from "../server.mjs";
import { generateReply, providerConfig } from "../providers.mjs";

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
    reopened.db.close();
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("NAS HTTP requires a key, streams replies and persists them",async()=>{
  const root=mkdtempSync(join(tmpdir(),"mikan-api-"));
  const store=openStore(join(root,"db.sqlite3"));
  const key="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const server=makeServer({
    store,key,config:{provider:"nvidia",model:"test",key:"not-a-real-provider-key"},
    generate:async ({history,onDelta})=>{
      assert.equal(history.at(-1).content,"Testing one two");
      onDelta("Me");onDelta("ow!");
      return "Meow!";
    }
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  try {
    assert.equal((await fetch(base+"/api/status")).status,401);
    const headers={Authorization:"Bearer "+key,"Content-Type":"application/json"};
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
