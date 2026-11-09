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
  assert.equal((await request(base + "/api/state")).status, 401);
  assert.equal((await request(base + "/api/state", "GET", {Authorization:"Bearer wrong"})).status, 401);
  assert.equal((await request(base + "/api/state", "GET", authorized)).status, 200);
  assert.equal((await request(base + "/api/send", "POST", {...authorized,"Content-Type":"application/json"}, {text:"hi"})).status, 409);

  assert.equal((await request(agent + "/agent/next", "GET", {"X-Mikan-Agent":"desktop", Origin:"https://evil.example"})).status, 403);
  assert.equal((await request(agent + "/agent/next", "GET", {"X-Mikan-Agent":"desktop"})).status, 200);
  const history = [{id:"one",role:"user",content:"Hello from the desktop",createdAt:100}];
  assert.equal((await request(agent + "/agent/state", "POST", desktopHeaders, {
    conversationId:"same-desktop-conversation",model:"qwen3.5:9b",busy:false,messages:history
  })).status, 200);
  const state = await (await request(base + "/api/state", "GET", authorized)).json();
  assert.equal(state.connected, true);
  assert.equal(state.conversationId, "same-desktop-conversation");
  assert.deepEqual(state.messages, history);

  const jsonHeaders = {...authorized,"Content-Type":"application/json"};
  assert.equal((await request(base + "/api/send", "POST", jsonHeaders, {text:"/search my files"})).status, 400);
  assert.equal((await request(base + "/api/send", "POST", jsonHeaders, {text:"What do you remember about me?"})).status, 202);
  assert.equal((await request(base + "/api/send", "POST", jsonHeaders, {text:"second turn"})).status, 409);
  const job = (await (await request(agent + "/agent/next", "GET", desktopHeaders)).json()).job;
  assert.equal(job.text, "What do you remember about me?");
  assert.ok(job.id);
  assert.equal((await request(agent + "/agent/ack", "POST", desktopHeaders, {id:job.id})).status, 200);
  assert.equal((await (await request(agent + "/agent/next", "GET", desktopHeaders)).json()).job, null);

  assert.equal((await request(base + "/api/report", "POST", jsonHeaders, {note:"She forgot something"})).status, 201);
  const report = JSON.parse(readFileSync(reportsPath,"utf8").trim());
  assert.equal(report.note, "She forgot something");
  assert.equal(report.conversationId, "same-desktop-conversation");
  assert.equal(report.messages[0].content, "Hello from the desktop");
});
