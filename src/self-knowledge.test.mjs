import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITIES, CAPABILITY_RELEASE, isSelfKnowledgeQuestion,
  relevantCapabilities, capabilityState, selfKnowledgeContext
} from "./self-knowledge.ts";

test("feature registry tracks implemented, experimental and planned without duplicates",()=>{
  assert.match(CAPABILITY_RELEASE,/^\d+\.\d+\.\d+$/);
  assert.ok(CAPABILITIES.length>=15);
  assert.equal(new Set(CAPABILITIES.map(c=>c.id)).size,CAPABILITIES.length);
  assert.equal(CAPABILITIES.find(c=>c.id==="screen-vision")?.stage,"experimental");
  assert.equal(CAPABILITIES.find(c=>c.id==="semantic-memory")?.stage,"experimental");
  assert.equal(CAPABILITIES.find(c=>c.id==="self-knowledge")?.stage,"implemented");
});

test("self questions do not hijack everyday website or coding requests",()=>{
  assert.equal(isSelfKnowledgeQuestion("Can you help me build a website?"),false);
  assert.equal(isSelfKnowledgeQuestion("Let's debug this WordPress plugin"),false);
  assert.equal(isSelfKnowledgeQuestion("Can you see my screen?"),true);
  assert.equal(isSelfKnowledgeQuestion("How does Mikan remember things?"),true);
  assert.equal(isSelfKnowledgeQuestion("Can you search the web?"),true);
  assert.equal(isSelfKnowledgeQuestion("Can you read a PDF file?"),true);
  assert.equal(isSelfKnowledgeQuestion("Can you analyze an attached image?"),true);
  assert.equal(isSelfKnowledgeQuestion("What can you actually do?"),true);
});

test("offline, unchecked and unimplemented are different claims",()=>{
  const voice=CAPABILITIES.find(c=>c.id==="voice");
  const capture=CAPABILITIES.find(c=>c.id==="screen-vision");
  assert.equal(capabilityState(voice,{voice:"offline"}),"RUNTIME CHECK: UNAVAILABLE");
  assert.equal(capabilityState(voice,{}),"RUNTIME NOT CHECKED");
  assert.equal(capabilityState(voice,{voice:"ready"}),"RUNTIME CHECK: READY");
  assert.equal(capabilityState(capture,{vision:"offline"}),"RUNTIME CHECK: UNAVAILABLE");
  assert.equal(capabilityState(capture,{vision:"ready"}),"RUNTIME CHECK: READY");
});

test("source-grounded answers include correct limitations and read-only caveat",()=>{
  const screenshot=selfKnowledgeContext("Can you see my screen?",{ollama:"ready"});
  assert.match(screenshot,/screen capture/i);
  assert.match(screenshot,/RUNTIME NOT CHECKED/);
  assert.match(screenshot,/does not continuously watch/);
  const voice=selfKnowledgeContext("Can you speak?",{voice:"offline"});
  assert.match(voice,/RUNTIME CHECK: UNAVAILABLE/);
  const docs=selfKnowledgeContext("How does your own code work?",{},["READ-ONLY BUNDLED SOURCE CODE src/App.tsx"]);
  assert.match(docs,/READ-ONLY BUNDLED/);
  assert.match(docs,/no self-write/i);
  assert.equal(selfKnowledgeContext("Build me a WordPress plugin"),"");
});

test("features can be discovered with related words and catalog overview",()=>{
  assert.equal(relevantCapabilities("Can you see my screen?")[0].id,"screen-vision");
  assert.ok(relevantCapabilities("Can you clone a voice?").some(f=>f.id==="voice"));
  const overview=selfKnowledgeContext("What can you do?",{ollama:"ready",voice:"offline"});
  assert.match(overview,/Local LLM chat/);
  assert.match(overview,/source and documentation excerpts/i);
});
