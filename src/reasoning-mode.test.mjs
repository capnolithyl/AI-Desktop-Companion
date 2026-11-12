import test from "node:test";
import assert from "node:assert/strict";
import {shouldUseLocalThinking} from "./reasoning-mode.ts";

test("fast mode preserves responsive ordinary chat",()=>{
  assert.equal(shouldUseLocalThinking("fast","Analyze this complicated problem","qwen3.5:9b"),false);
  assert.equal(shouldUseLocalThinking("auto","Hello!","qwen3.5:9b"),false);
});
test("auto enables Qwen thinking only for demanding questions",()=>{
  assert.equal(shouldUseLocalThinking("auto","Compare these two approaches","qwen3.5:9b"),true);
  assert.equal(shouldUseLocalThinking("auto","Help me debug the routing logic","qwen3.5:9b"),true);
  assert.equal(shouldUseLocalThinking("auto","Thanks!","qwen3.5:9b"),false);
});
test("deep mode only enables known thinking-capable model families",()=>{
  assert.equal(shouldUseLocalThinking("deep","Hi","qwen3.5:9b"),true);
  assert.equal(shouldUseLocalThinking("deep","Hi","unknown-model:latest"),false);
});
