import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBridge } from "../server/index.mjs";

test("browser relay requires a private key and delegates to the desktop, not a second model", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mikan-remote-"));
  const reportsPath = join(directory, "issues.jsonl");
  const key = "this-is-a-test-only-key-with-at-least-32-characters";
  const bridge = createBridge({ key, reportsPath });
  const onListen = (server) => new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  const publicPort = await onListen(bridge.publicServer);
  await onListen(bridge.agentServer);
  const base = "http://127.0.0.1:" + publicPort;
  const agent = "http://127.0.0.1:" + bridge.agentServer.address().port;
  const authorized = { Authorization: "Bearer " + key };
  const desktopHeaders = { "X-Mikan-Agent": "desktop", "Content-Type": "application/json" };
  const request = (url, method = "GET", headers = {}, body) =>
    fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  t.after(async () => {
    await Promise.all([bridge.publicServer, bridge.agentServer].map((s) =>
      new Promise((resolve) => s.close(resolve))));
    rmSync(directory, { recursive: true, force: true });
  });

  const home = await request(base + "/");
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Remote Companion/);
  const engine = await request(base + "/avatar-engine.js");
  assert.equal(engine.status, 200);
  assert.match(await engine.text(), /MikanRemoteAvatar/);
  assert.equal((await request(base + "/api/state")).status, 401);
  assert.equal((await request(base + "/api/state", "GET", {Authorization:"Bearer wrong"})).status, 401);
  assert.equal((await request(base + "/api/state", "GET", authorized)).status, 200);
  assert.equal((await request(base + "/api/send", "POST", {...authorized,"Content-Type":"application/json"}, {text:"hi"})).status, 409);

  assert.equal((await request(agent + "/agent/next", "GET", {"X-Mikan-Agent":"desktop", Origin:"https://evil.example"})).status, 403);
  assert.equal((await request(agent + "/agent/next", "GET", {"X-Mikan-Agent":"desktop"})).status, 200);
  const history = [{id:"one",role:"user",content:"Hello from the desktop",createdAt:100}];
  assert.equal((await request(agent + "/agent/state", "POST", desktopHeaders, {
    conversationId:"same-desktop-conversation",model:"qwen3.5:9b",busy:false,messages:history,
    conversations:[
      {id:"same-desktop-conversation",title:"Our first chat",updatedAt:200},
      {id:"older-chat",title:"Old conversation",updatedAt:100}
    ],
    avatar:{id:"default",name:"Original Mikan",custom:false,verticalOffset:10}
  })).status, 200);
  const state = await (await request(base + "/api/state", "GET", authorized)).json();
  assert.equal(state.connected, true);
  assert.equal(state.conversationId, "same-desktop-conversation");
  assert.deepEqual(state.messages, history);
  assert.equal(state.conversations[1].title, "Old conversation");
  assert.equal(state.avatar.id, "default");
  assert.equal((await request(base + "/api/avatar/model")).status, 401);
  const bundled = await request(base + "/api/avatar/model", "GET", authorized);
  assert.equal(bundled.status, 200);
  assert.match(bundled.headers.get("content-type"), /application\/json/);
  // A different private hostname must not bypass the relay's host allowlist.
  assert.equal((await request(base + "/api/state","GET", {...authorized,Host:"evil.example"})).status,403);

  const jsonHeaders = {...authorized,"Content-Type":"application/json"};
  assert.equal((await request(base + "/api/send", "POST", jsonHeaders, {text:"/search my files"})).status, 400);
  assert.equal((await request(base + "/api/send", "POST", jsonHeaders, {text:"What do you remember about me?"})).status, 202);
  assert.equal((await request(base + "/api/send", "POST", jsonHeaders, {text:"second turn"})).status, 409);
  const job = (await (await request(agent + "/agent/next", "GET", desktopHeaders)).json()).job;
  assert.equal(job.text, "What do you remember about me?");
  assert.equal(job.kind, "send");
  assert.ok(job.id);
  assert.equal((await request(agent + "/agent/ack", "POST", desktopHeaders, {id:job.id})).status, 200);
  assert.equal((await (await request(agent + "/agent/next", "GET", desktopHeaders)).json()).job, null);
  assert.equal((await request(base + "/api/conversation", "POST", jsonHeaders, {action:"open",conversationId:"not-here"})).status,404);
  assert.equal((await request(base + "/api/conversation","POST", {"Content-Type":"application/json"}, {action:"new"})).status,401);
  assert.equal((await request(base + "/api/conversation", "POST", jsonHeaders, {action:"open",conversationId:"older-chat"})).status,202);
  const openJob = (await (await request(agent + "/agent/next", "GET", desktopHeaders)).json()).job;
  assert.equal(openJob.kind, "open_chat");
  assert.equal(openJob.conversationId, "older-chat");
  assert.equal((await request(agent + "/agent/ack", "POST", desktopHeaders, {id:openJob.id})).status,200);
  assert.equal((await request(base + "/api/conversation", "POST", jsonHeaders, {action:"new"})).status,202);
  const newJob = (await (await request(agent + "/agent/next", "GET", desktopHeaders)).json()).job;
  assert.equal(newJob.kind, "new_chat");
  assert.equal((await request(agent + "/agent/ack", "POST", desktopHeaders, {id:newJob.id})).status,200);
  // The browser only receives the active custom rig, never a path supplied by its request.
  assert.equal((await request(agent + "/agent/state", "POST", desktopHeaders, {
    conversationId:"older-chat",model:"qwen3.5:9b",busy:false,messages:[],
    conversations:[{id:"older-chat",title:"Old conversation",updatedAt:100}],
    avatar:{id:"file:custom.iki",name:"Custom sweater",custom:true,revision:100}
  })).status,200);
  assert.equal((await request(base + "/api/avatar/model","GET",authorized)).status,404);
  const demoRig = JSON.stringify({name:"private rig",parameters:[]});
  assert.equal((await request(agent + "/agent/avatar-rig","POST",desktopHeaders,{id:"file:custom.iki",rig:demoRig})).status,200);
  assert.deepEqual(await (await request(base + "/api/avatar/model","GET",authorized)).json(),JSON.parse(demoRig));
  assert.equal((await request(agent + "/agent/avatar-rig","POST",desktopHeaders,{id:"file:other.iki",rig:demoRig})).status,400);

  assert.equal((await request(base + "/api/report", "POST", jsonHeaders, {note:"She forgot something"})).status, 201);
  const report = JSON.parse(readFileSync(reportsPath,"utf8").trim());
  assert.equal(report.note, "She forgot something");
  assert.equal(report.conversationId, "older-chat");
});
