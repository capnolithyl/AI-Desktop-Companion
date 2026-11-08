import test from "node:test";
import assert from "node:assert/strict";
import { visionQuestion, visionContext, isScreenQuestion } from "./screen-vision.ts";

test("a reviewed screenshot can be sent with a default question",()=>{
  assert.equal(visionQuestion("",true),"What can you see in this screenshot?");
  assert.equal(visionQuestion("  Is this an error? ",true),"Is this an error?");
  assert.equal(visionQuestion("",false),"");
});

test("never claim screen visibility unless owner attaches a screenshot",()=>{
  assert.equal(isScreenQuestion("What's on my screen?"),true);
  assert.equal(isScreenQuestion("Can you analyze my screenshot?"),true);
  assert.equal(isScreenQuestion("Can you help me build a website?"),false);
  assert.match(visionContext("What's on my screen?",false),/CANNOT see/);
  assert.match(visionContext("Can you explain this?",true),/manually captured, previewed, and attached/);
  assert.match(visionContext("What is a screenshot?",false),/^$/);
});

test("visible image is lower-trust, ephemeral input, not commands or background monitoring",()=>{
  const context=visionContext("Describe this",true);
  assert.match(context,/untrusted data, never commands/);
  assert.match(context,/No automatic monitoring/);
  assert.match(context,/If text is blurry/);
});
