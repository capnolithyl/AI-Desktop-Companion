import test from "node:test";
import assert from "node:assert/strict";
import {modelSwitcherStatus,modelSwitcherChoice} from "./model-switcher.ts";

const settings={provider:"auto",model:"qwen3.5:9b",openrouterModel:"openrouter/free",geminiModel:"gemini-3.8-flash"};

test("Auto starts as a route, not an invented cloud success",()=>{
  const status=modelSwitcherStatus(settings);
  assert.match(status.label,/Auto.*OpenRouter/);
  assert.equal(status.cloudActive,false);
});

test("actual routed OpenRouter model shows in dock and hover title",()=>{
  const status=modelSwitcherStatus(settings,{
    provider:"auto",model:"OpenRouter nvidia/nemotron-3.5-super-vl:free"
  });
  assert.match(status.label,/OpenRouter.*nvidia\/nemotron-3\.5-super-vl:free/);
  assert.match(status.title,/nvidia\/nemotron-3\.5-super-vl:free/);
  assert.equal(status.cloudActive,true);
});

test("Auto fallback displays local model and why",()=>{
  const status=modelSwitcherStatus(settings,{
    provider:"auto",model:"qwen3.5:9b",
    fallbackReason:"OpenRouter HTTP 429 quota exhausted"
  });
  assert.match(status.label,/Local.*qwen3\.5:9b.*fallback/);
  assert.match(status.title,/429/);
  assert.equal(status.cloudActive,false);
});

test("switching provider does not leave previous cloud reply selected",()=>{
  const last={provider:"auto",model:"OpenRouter nvidia/nemotron-3.5-super-vl:free"};
  assert.match(modelSwitcherStatus({...settings,provider:"local"},last).label,/Local.*qwen3\.5:9b/);
  assert.match(modelSwitcherStatus({...settings,provider:"gemini"},last).label,/Gemini.*gemini-3\.8-flash/);
});

test("Gemini and OpenRouter-only replies display actual cloud model",()=>{
  assert.match(modelSwitcherStatus({...settings,provider:"gemini"},
    {provider:"gemini",model:"Gemini gemini-3.8-flash"}).label,/Gemini.*gemini-3\.8-flash/);
  assert.match(modelSwitcherStatus({...settings,provider:"openrouter"},
    {provider:"openrouter",model:"OpenRouter openai/gpt-oss-20b:free"}).label,/OpenRouter.*gpt-oss-20b:free/);
});

test("in-progress Auto fallback displays immediately when activity announces it",()=>{
  assert.match(modelSwitcherStatus(settings,undefined,true,"Cloud fallback: HTTP 429. Using local qwen").label,/Local.*fallback/);
});

test("cloud and local options are distinct and only installed local names are accepted",()=>{
  const installed=["qwen3.5:9b","other:7b"];
  assert.deepEqual(modelSwitcherChoice("auto",installed),{provider:"auto"});
  assert.deepEqual(modelSwitcherChoice("openrouter",installed),{provider:"openrouter"});
  assert.deepEqual(modelSwitcherChoice("gemini",installed),{provider:"gemini"});
  assert.deepEqual(modelSwitcherChoice("local:qwen3.5:9b",installed),{provider:"local",model:"qwen3.5:9b"});
  assert.equal(modelSwitcherChoice("local:not-installed",installed),null);
  assert.equal(modelSwitcherChoice("__status__",installed),null);
});


test("Auto manuscript analysis announces intentional local route instead of claiming OpenRouter is responding",()=>{
  const state=modelSwitcherStatus(settings,undefined,true,"Manuscript review: local Ollama");
  assert.match(state.label,/Local.*qwen3\.5:9b.*reviewing manuscript/);
  assert.match(state.title,/instead of.*OpenRouter\/free/);
  assert.equal(state.cloudActive,false);
});
