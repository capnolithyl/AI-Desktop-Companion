import test from "node:test";
import assert from "node:assert/strict";
import {shouldUseLocalThinking,localThinkingChoice} from "./reasoning-mode.ts";

test("Auto does not overthink casual statements mentioning reasoning",()=>{
  const chat="still working on your brain lol. i didn't realize it'd be this difficult to implement memories, reasoning and web search";
  assert.equal(shouldUseLocalThinking("auto",chat,"qwen3.5:9b"),false);
  assert.equal(shouldUseLocalThinking("auto",chat,"qwen3.5:9b","quick"),false);
  assert.equal(localThinkingChoice("auto",chat,"qwen3.5:9b","quick").reason,"planner-quick");
  assert.equal(shouldUseLocalThinking("auto","Debugging my routing logic is hard","qwen3.5:9b"),false);
});
test("Explicit tasks and semantic planner decisions can request depth",()=>{
  assert.equal(shouldUseLocalThinking("auto","Compare these approaches","qwen3.5:9b"),true);
  assert.equal(shouldUseLocalThinking("auto","Help me debug the routing logic","qwen3.5:9b"),true);
  assert.equal(shouldUseLocalThinking("auto","Explain tradeoffs","qwen3.5:9b","deliberate"),true);
  assert.equal(shouldUseLocalThinking("auto","Compare these approaches","qwen3.5:9b","quick"),false);
});
test("Fast and Deep override optional planning for supported models",()=>{
  assert.equal(shouldUseLocalThinking("fast","Analyze this","qwen3.5:9b","deliberate"),false);
  assert.equal(shouldUseLocalThinking("deep","Hi","qwen3.5:9b","quick"),true);
  assert.equal(shouldUseLocalThinking("deep","Hi","unknown-model:latest","deliberate"),false);
});
