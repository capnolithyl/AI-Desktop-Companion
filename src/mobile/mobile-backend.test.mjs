import test from "node:test";
import assert from "node:assert/strict";

// The native bridge is global on Android; exercise exactly that boundary.
const packets = [];
globalThis.window = {
  MikanNative: {
    postMessage(json) { packets.push(JSON.parse(json)); }
  }
};
const { mobileBackend } = await import("./mobile-backend.ts");

async function memoryRoundTrip(action, args, response) {
  const pending = mobileBackend.memory(action, args);
  const request = packets.shift();
  assert.equal(request.method, "memory");
  assert.equal(request.action, action);
  assert.match(request.id, /^mobile-\d+$/);
  assert.equal(request.recordId, args.recordId);
  globalThis.window.__mikanReceive({
    toString() { return ""; }
  }.toString()); // invalid responses must not resolve pending
  globalThis.window.__mikanReceive(JSON.stringify({
    id: request.id, kind: "result", text: JSON.stringify(response)
  }));
  assert.deepEqual(await pending, response);
}

test("memory edits use a separate recordId and keep the transport ID", async () => {
  await memoryRoundTrip("updateFact", {
    recordId: 42, fact: "The user speaks German"
  }, { updated: true });
  await memoryRoundTrip("updateCanon", {
    recordId: 7, personaId: "mikan", category: "likes", label: "Music", value: "Metal"
  }, { updated: true });
});

test("delete operations retain their reply routing and report completion", async () => {
  await memoryRoundTrip("deleteFact", { recordId: 42 }, { deleted: true });
  await memoryRoundTrip("deleteCanon", { recordId: 7, personaId: "mikan" },
    { deleted: true });
});

test("malformed args cannot overwrite the bridge's response identifier", async () => {
  const promise = mobileBackend.memory("updateFact", { id: 999, recordId: 13, fact: "Updated" });
  const request = packets.shift();
  assert.match(request.id, /^mobile-\d+$/);
  assert.notEqual(request.id, 999);
  assert.equal(request.recordId, 13);
  globalThis.window.__mikanReceive(JSON.stringify({
    id: request.id, kind: "result", text: '{"updated":true}'
  }));
  assert.deepEqual(await promise, { updated: true });
});

test("a failed SQLite write rejects rather than pretending to save", async () => {
  const promise = mobileBackend.memory("updateFact", { recordId: 99, fact: "Test" });
  const request = packets.shift();
  globalThis.window.__mikanReceive(JSON.stringify({
    id: request.id, kind: "error", error: "Memory not found"
  }));
  await assert.rejects(promise, /Memory not found/);
});


test("factual generation uses a dedicated native low-temperature route and streams normally", async () => {
  const chunks=[];
  const promise=mobileBackend.generateResearch("Source-backed question", x=>chunks.push(x));
  const request=packets.shift();
  assert.equal(request.method,"generateResearch");
  assert.equal(request.prompt,"Source-backed question");
  globalThis.window.__mikanReceive(JSON.stringify({id:request.id,kind:"delta",text:"Verified "}));
  globalThis.window.__mikanReceive(JSON.stringify({id:request.id,kind:"result",text:"Verified answer"}));
  assert.deepEqual(chunks,["Verified "]);
  assert.equal(await promise,"Verified answer");
});

test("native background-generation errors reject so UI can mark message retryable", async () => {
  const promise=mobileBackend.generateResearch("Answer while app pauses",()=>{});
  const request=packets.shift();
  globalThis.window.__mikanReceive(JSON.stringify({
    id:request.id,kind:"error",error:"App moved to background. Tap Retry to regenerate."
  }));
  await assert.rejects(promise,/Tap Retry/);
});
