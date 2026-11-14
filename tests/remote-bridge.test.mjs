import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Script } from "node:vm";
import { request as httpRequest } from "node:http";
import { createBridge } from "../server/index.mjs";

test("browser relay requires a private key and delegates to the desktop, not a second model", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mikan-remote-"));
  const reportsPath = join(directory, "issues.jsonl");
  const key = "this-is-a-test-only-key-with-at-least-32-characters";
  const published = [];
  const bridge = createBridge({ key, reportsPath, issuePublisher: async issue => {
    published.push(issue);
    return "https://github.com/capnolithyl/AI-Desktop-Companion/issues/999";
  }});
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
  // Iki uses fetch(data:image/png;base64,...) then createImageBitmap(). The
  // previous connect-src 'self' blocked embedded atlas decoding on mobile.
  // Keep connect-src tight: same-origin and data: only, never wildcards.
  const policy = home.headers.get("content-security-policy") || "";
  const connectDirective = policy.split(";").map(x => x.trim()).find(x => x.startsWith("connect-src "));
  assert.equal(connectDirective, "connect-src 'self' data:");
  assert.match(policy, /img-src 'self' data:/);
  assert.equal(connectDirective.includes("*"), false);
  const html = await home.text();
  assert.match(html, /Remote Companion/);
  // Keep the phone's chat surface uncluttered: controls live inside the
  // accessible hamburger settings drawer, not the header or composer.
  const mainView = html.split('<div id="app" class="shell">')[1]
    ?.split('<div id="settingsSheet" class="settings-overlay" hidden>')[0];
  const settingsView = html.split('<div id="settingsSheet" class="settings-overlay" hidden>')[1]
    ?.split('<div id="reportPanel" role="dialog"')[0];
  assert.ok(mainView && settingsView, "Remote app and settings drawer exist");
  assert.match(mainView, /id="menuToggle"[^>]+aria-controls="settingsSheet"/);
  assert.match(settingsView, /role="dialog" aria-modal="true"/);
  for (const control of ["conversationSelect", "newChat", "modelSelect",
    "refreshModels", "enlargeAvatar", "lock", "report", "showModelName",
    "showAvatarLabel"]) {
    assert.match(settingsView, new RegExp('id="' + control + '"'), control + " belongs in settings");
    assert.doesNotMatch(mainView, new RegExp('id="' + control + '"'), control + " is hidden from chat");
  }
  assert.match(mainView, /id="avatarCanvas"/);
  assert.match(mainView, /id="message"/);
  assert.match(html, /mikan-remote-display/);
  assert.match(html, /sessionStorage\.removeItem\("mikan-remote-key"\)/);
  // Catch syntax errors in the lightweight inline browser UI before packaging.
  const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inlineScript, "Browser UI script exists");
  assert.doesNotThrow(() => new Script(inlineScript[1]));
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
    provider:"local", models:["qwen3.5:9b","gpt-oss:20b"],
    openrouterModel:"openrouter/free", geminiModel:"gemini-3.8-flash",
    modelStatus:{label:"● Local · qwen3.5:9b",title:"Ollama qwen3.5:9b"},
    controlsBlocked:false,
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
  assert.deepEqual(state.models, ["qwen3.5:9b","gpt-oss:20b"]);
  assert.equal(state.provider, "local");
  assert.match(state.modelStatus.label, /qwen3.5:9b/);
  assert.equal((await request(base + "/api/avatar/model")).status, 401);
  const bundled = await request(base + "/api/avatar/model", "GET", authorized);
  assert.equal(bundled.status, 200);
  assert.match(bundled.headers.get("content-type"), /application\/json/);
  // A different private hostname must not bypass the relay's host allowlist.
  const rejectedHostStatus = await new Promise((resolve, reject) => {
    const raw = httpRequest({
      hostname: "127.0.0.1", port: publicPort, path: "/api/state",
      method: "GET", headers: { ...authorized, host: "evil.example" }
    }, response => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    raw.on("error", reject);
    raw.end();
  });
  assert.equal(rejectedHostStatus, 403);

  const jsonHeaders = {...authorized,"Content-Type":"application/json"};

  // Brain Lab is controlled by the authenticated phone but runs only on desktop.
  // The relay never executes Ollama or stores the owner's real memory.
  const remoteCatalog=[
    {id:"branch-a",label:"Favorite band branch",group:"Branching context",turns:3},
    {id:"discovery-bands-wish",label:"Implicit recommendations",group:"Conversational discovery",turns:2}
  ];
  const evalState=(phase,controlsBlocked=false)=>({
    conversationId:"same-desktop-conversation",model:"qwen3.5:9b",
    busy:false,controlsBlocked,messages:history,
    models:["qwen3.5:9b"],provider:"local",brainEvalCatalog:remoteCatalog,
    brainEval:{phase,done:phase==="running"?1:0,total:6,
      model:"qwen3.5:9b",startedAt:"2026-11-14T22:00:00.000Z",
      results:phase==="complete"?{passRate:83.3,recall:95,webAgreement:80,reviewTurns:2}:null}
  });
  assert.equal((await request(agent + "/agent/state","POST",desktopHeaders,evalState("idle"))).status,200);
  assert.equal((await request(base + "/api/brain-eval/result?format=json","GET",authorized)).status,404);
  assert.equal((await request(base + "/api/brain-eval","POST",{"Content-Type":"application/json"},
    {action:"start",mode:"live",repetitions:1,scenarioIds:["branch-a"]})).status,401);
  assert.equal((await request(base + "/api/brain-eval","POST",jsonHeaders,
    {action:"start",mode:"live",repetitions:7,scenarioIds:["branch-a"]})).status,400);
  assert.equal((await request(base + "/api/brain-eval","POST",jsonHeaders,
    {action:"start",mode:"live",repetitions:1,scenarioIds:["unknown-scenario"]})).status,400);
  assert.equal((await request(base + "/api/brain-eval","POST",jsonHeaders,
    {action:"start",mode:"live",repetitions:3,scenarioIds:["branch-a","discovery-bands-wish"]})).status,202);
  assert.equal((await request(base + "/api/brain-eval","POST",jsonHeaders,
    {action:"start",mode:"live",repetitions:3,scenarioIds:["branch-a"]})).status,409);
  const evalJob=(await (await request(agent + "/agent/next","GET",desktopHeaders)).json()).job;
  assert.equal(evalJob.kind,"start_brain_eval");
  assert.deepEqual(evalJob.evalOptions,{
    mode:"live",repetitions:3,scenarioIds:["branch-a","discovery-bands-wish"]
  });
  assert.equal((await request(agent + "/agent/ack","POST",desktopHeaders,{id:evalJob.id})).status,200);
  assert.equal((await request(agent + "/agent/state","POST",desktopHeaders,evalState("running",true))).status,200);
  const runningEval=await (await request(base + "/api/state","GET",authorized)).json();
  assert.equal(runningEval.brainEval.phase,"running");
  assert.equal(runningEval.brainEval.done,1);
  assert.equal((await request(base + "/api/send","POST",jsonHeaders,{text:"interrupt the GPU"})).status,409);
  assert.equal((await request(base + "/api/brain-eval","POST",jsonHeaders,
    {action:"start",mode:"routing",repetitions:1,scenarioIds:["branch-a"]})).status,409);
  assert.equal((await request(base + "/api/brain-eval","POST",jsonHeaders,{action:"stop"})).status,202);
  const stopEvalJob=(await (await request(agent + "/agent/next","GET",desktopHeaders)).json()).job;
  assert.equal(stopEvalJob.kind,"stop_brain_eval");
  assert.equal((await request(agent + "/agent/ack","POST",desktopHeaders,{id:stopEvalJob.id})).status,200);
  assert.equal((await request(agent + "/agent/brain-eval/report","POST",desktopHeaders,{
    report:{runId:"eval-bad",version:1,environment:"production",cases:[]},markdown:"# test"
  })).status,400);
  const sampleEval={runId:"eval-1234567890-abcde",version:1,environment:"isolated-synthetic",
    liveWebEnabled:false,writesToRealMemories:false,cases:[]};
  assert.equal((await request(agent + "/agent/brain-eval/report","POST",desktopHeaders,{
    report:sampleEval,markdown:"# Synthetic test results"
  })).status,200);
  assert.equal((await request(base + "/api/brain-eval/result?format=json")).status,401);
  assert.equal((await request(base + "/api/brain-eval/result?format=anything","GET",authorized)).status,400);
  const downloadedEval=await request(base + "/api/brain-eval/result?format=json","GET",authorized);
  assert.equal(downloadedEval.status,200);
  assert.match(downloadedEval.headers.get("content-disposition"),/\.json/);
  assert.equal((await downloadedEval.json()).runId,sampleEval.runId);
  const downloadedMd=await request(base + "/api/brain-eval/result?format=markdown","GET",authorized);
  assert.equal(downloadedMd.status,200);
  assert.equal(await downloadedMd.text(),"# Synthetic test results");
  const completeReply=await request(agent + "/agent/state","POST",desktopHeaders,evalState("complete"));
  assert.equal(completeReply.status,200);
  assert.equal((await completeReply.json()).reportId,sampleEval.runId);
  assert.equal((await (await request(base + "/api/state","GET",authorized)).json()).reportAvailable,true);
  // Resume the rest of the legacy relay tests after a detached run finishes.
  assert.equal((await request(agent + "/agent/state","POST",desktopHeaders,{
    conversationId:"same-desktop-conversation",model:"qwen3.5:9b",
    busy:false,controlsBlocked:false,messages:history,
    models:["qwen3.5:9b","gpt-oss:20b"],provider:"local",
    conversations:[{id:"same-desktop-conversation",title:"Our first chat",updatedAt:200},
      {id:"older-chat",title:"Old conversation",updatedAt:100}],
    avatar:{id:"default",name:"Original Mikan",custom:false}
  })).status,200);

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

  // Remote model selection uses the installed list from desktop, never arbitrary
  // model IDs, URLs or new credentials supplied by the phone.
  assert.equal((await request(base + "/api/model","POST",{"Content-Type":"application/json"},
    {action:"switch",choice:"local:gpt-oss:20b"})).status,401);
  assert.equal((await request(base + "/api/model","POST",jsonHeaders,
    {action:"switch",choice:"local:not-installed"})).status,400);
  assert.equal((await request(base + "/api/model","POST",jsonHeaders,
    {action:"switch",choice:"local:http://somehost"})).status,400);
  assert.equal((await request(base + "/api/model","POST",jsonHeaders,
    {action:"switch",choice:"__status__"})).status,400);
  assert.equal((await request(base + "/api/model","POST",jsonHeaders,
    {action:"switch",choice:"local:gpt-oss:20b"})).status,202);
  assert.equal((await request(base + "/api/model","POST",jsonHeaders,
    {action:"refresh"})).status,409);
  const modelJob = (await (await request(agent + "/agent/next","GET",desktopHeaders)).json()).job;
  assert.equal(modelJob.kind,"switch_model");
  assert.equal(modelJob.modelChoice,"local:gpt-oss:20b");
  assert.equal((await request(agent + "/agent/ack","POST",desktopHeaders,{id:modelJob.id})).status,200);
  for (const choice of ["auto","openrouter","gemini"]) {
    assert.equal((await request(base + "/api/model","POST",jsonHeaders,
      {action:"switch",choice})).status,202);
    const job = (await (await request(agent + "/agent/next","GET",desktopHeaders)).json()).job;
    assert.equal(job.kind,"switch_model");
    assert.equal(job.modelChoice,choice);
    assert.equal((await request(agent + "/agent/ack","POST",desktopHeaders,{id:job.id})).status,200);
  }
  assert.equal((await request(base + "/api/model","POST",jsonHeaders,
    {action:"refresh"})).status,202);
  const refreshJob = (await (await request(agent + "/agent/next","GET",desktopHeaders)).json()).job;
  assert.equal(refreshJob.kind,"refresh_models");
  assert.equal((await request(agent + "/agent/ack","POST",desktopHeaders,{id:refreshJob.id})).status,200);
  assert.equal((await request(agent + "/agent/state","POST",desktopHeaders,{
    conversationId:"same-desktop-conversation",model:"qwen3.5:9b",
    provider:"auto", models:["qwen3.5:9b"],controlsBlocked:true,busy:false
  })).status,200);
  assert.equal((await request(base + "/api/model","POST",jsonHeaders,
    {action:"switch",choice:"auto"})).status,409);
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

  const privateExcerpt = "PRIVATE CHAT: Don't post my diary";
  const privateFact = "PRIVATE MEMORY FACT: my secret identity";
  assert.equal((await request(agent + "/agent/state", "POST", desktopHeaders, {
    conversationId:"older-chat",model:"qwen3.5:9b",provider:"auto",busy:false,
    messages:[
      {id:"u",role:"user",createdAt:100,content:privateExcerpt},
      {id:"a",role:"assistant",createdAt:101,content:"I couldn't access a file."}
    ],
    reportDiagnostics:{
      desktopVersion:"0.9.8",contextWindow:16384,
      avatar:{status:"ready",fps:59.9,speaking:false,error:"C:\\private\\user\\file.txt"},
      messages:[{id:"a",role:"assistant",failed:true,diagnostics:{
        model:"qwen3.5:9b",provider:"auto",elapsedMs:1200,firstTokenMs:330,
        memory:{storedFacts:11,semanticService:"ready",semanticCandidates:3,
          strongSemanticMatches:2,selectedFacts:1,facts:[{fact:privateFact}]},
        toolPlan:{method:"web-search",freshSources:2,publicWebAllowed:true,
          query:"PRIVATE SEARCH QUERY"},
        notion:{cachedPages:1,readSucceeded:false,fullReadAttempted:true,
          page:"PRIVATE MANUSCRIPT TITLE"},
        stats:{promptTokens:300,outputTokens:55}
      }}]
    }
  })).status,200);
  // Local-only reports preserve excerpts and diagnostics; nothing is published.
  assert.equal((await request(base + "/api/report", "POST", jsonHeaders,
    {note:"She forgot something"})).status, 201);
  const report = JSON.parse(readFileSync(reportsPath,"utf8").trim());
  assert.equal(report.note, "She forgot something");
  assert.equal(report.conversationId, "older-chat");
  assert.equal(report.messages[0].content, privateExcerpt);
  assert.equal(report.diagnostics.desktopVersion, "0.9.8");
  assert.equal(report.diagnostics.messages[0].diagnostics.memory.strongSemanticMatches, 2);
  assert.equal(report.diagnostics.messages[0].diagnostics.toolPlan.method, "web-search");
  assert.equal(report.diagnostics.messages[0].diagnostics.notion.readSucceeded, false);
  assert.equal(report.diagnostics.messages[0].diagnostics.memory.facts, undefined);
  assert.equal(published.length, 0);
  assert.equal((await request(base + "/api/report/preview","POST",
    {"Content-Type":"application/json"}, {note:"Bug"})).status,401);
  const preview = await (await request(base + "/api/report/preview","POST",jsonHeaders,
    {note:"Mikan ignored research results"})).json();
  assert.match(preview.title,/\[Remote\] Mikan issue report/);
  assert.match(preview.body,/memoryMatches=2/);
  assert.match(preview.body,/webSources=2/);
  assert.doesNotMatch(preview.body,/PRIVATE CHAT|PRIVATE MEMORY|PRIVATE SEARCH|PRIVATE MANUSCRIPT|private\\user/i);
  assert.doesNotMatch(preview.body,/conversationId|C:\\/i);
  assert.equal((await request(base + "/api/report","POST",jsonHeaders,
    {note:"Mikan ignored research results",destination:"both",previewId:"wrong"})).status,409);
  assert.equal((await request(base + "/api/report","POST",jsonHeaders,
    {note:"Mikan ignored research results",destination:"github"})).status,409);
  const uploaded = await request(base + "/api/report","POST",jsonHeaders,
    {note:"Mikan ignored research results",destination:"both",previewId:preview.previewId});
  assert.equal(uploaded.status,201);
  const result = await uploaded.json();
  assert.equal(result.saved,true);
  assert.match(result.githubUrl,/\/issues\/999$/);
  assert.equal(published.length,1);
  assert.equal(published[0].title,preview.title);
  assert.equal(published[0].body,preview.body);
  const localReports = readFileSync(reportsPath,"utf8").trim().split("\n").map(JSON.parse);
  assert.equal(localReports.length,2);
  assert.equal(localReports[1].github.url,result.githubUrl);
  assert.equal((await request(base + "/api/report","POST",jsonHeaders,
    {note:"Mikan ignored research results",destination:"both",previewId:preview.previewId})).status,409);
  // Invalid destinations must never spawn GitHub or append files.
  assert.equal((await request(base + "/api/report","POST",jsonHeaders,
    {note:"irrelevant",destination:"delete_repo"})).status,400);
  assert.equal(published.length,1);
});
