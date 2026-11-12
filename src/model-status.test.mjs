import test from "node:test";
import assert from "node:assert/strict";
import {isModelStatusQuestion,modelStatusAnswer} from "./model-status.ts";

test("asks about Mikan's active model never need a public web lookup",()=>{
  for (const q of [
    "what llm are you using right now?", "which model are you running?",
    "Hey Mikan. What LLM are you using right now?",
    "Hey Mikan. Can you tell me which LLM you\'re using right now?",
    "what model are you currently using?", "What AI model is Mikan using?",
    "what model powers you?"
  ]) assert.equal(isModelStatusQuestion(q),true,q);
  for (const q of [
    "what are the best LLMs right now?", "which model has better benchmarks?",
    "search the web for a new model", "what model did Google release recently?"
  ]) assert.equal(isModelStatusQuestion(q),false,q);
});

test("reported provider and actual last model are separate",()=>{
  const settings={provider:"auto",model:"qwen3.5:9b",geminiModel:"gemini-3.8-flash",openrouterModel:"openrouter/free"};
  const answer=modelStatusAnswer(settings,[
    {role:"assistant",diagnostics:{model:"qwen3.5:9b",fallbackReason:"Gemini connection timed out after 35 seconds"}}
  ]);
  assert.match(answer,/configured for \*\*Auto\*\*/);
  assert.match(answer,/OpenRouter `openrouter\/free`/);
  assert.match(answer,/last model-generated reply used `qwen3\.5:9b`/);
  assert.match(answer,/timed out after 35 seconds/);
  assert.doesNotMatch(modelStatusAnswer({...settings,provider:"gemini"},[]),/last model-generated reply used/);
});

test("OpenRouter-only mode names its configured free router",()=>{
  const answer=modelStatusAnswer({
    provider:"openrouter",model:"qwen3.5:9b",
    geminiModel:"gemini-3.8-flash",openrouterModel:"openrouter/free"
  },[]);
  assert.match(answer,/OpenRouter `openrouter\/free`/);
  assert.match(answer,/free only/);
});
