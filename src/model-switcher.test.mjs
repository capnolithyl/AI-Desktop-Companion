import test from "node:test";
import assert from "node:assert/strict";
import {NVIDIA_MODELS,modelSwitcherStatus,modelSwitcherChoice,unsuccessfulInferenceLabel} from "./model-switcher.ts";

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

test("NVIDIA selector accepts the eight supported cloud model IDs",()=>{
  const newModels=[
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "nvidia/nemotron-3.5-bolt-e4b",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "poolside/laguna-xs-2.1",
    "moonshotai/kimi-k3.1-pro"
  ];
  assert.equal(NVIDIA_MODELS.length,8);
  for (const model of newModels) assert.ok(NVIDIA_MODELS.includes(model),model);
  for (const model of NVIDIA_MODELS) {
    assert.deepEqual(modelSwitcherChoice("nvidia:"+model,[]),{provider:"nvidia",nvidiaModel:model});
  }
  assert.equal(modelSwitcherChoice("nvidia:unapproved",[]),null);
  const model="nvidia/nemotron-3.5-lightning-30b-a3b";
  const state=modelSwitcherStatus({...settings,provider:"nvidia",nvidiaModel:model},
    {provider:"nvidia",model:"NVIDIA "+model});
  assert.match(state.label,/NVIDIA.*nemotron-3\.5-lightning/);
  assert.equal(state.cloudActive,true);
});

test("a failed NVIDIA request is not reported as the configured local Gemma model",()=>{
  const configured={...settings,provider:"nvidia",nvidiaModel:"nvidia/nemotron-3-ultra-550b-a55b",model:"gemma4:12b"};
  assert.match(unsuccessfulInferenceLabel(configured),/NVIDIA nvidia\/nemotron-3-ultra-550b-a55b/);
  assert.doesNotMatch(unsuccessfulInferenceLabel(configured),/gemma4/);
  assert.match(unsuccessfulInferenceLabel({...configured,provider:"auto"}),/provider not confirmed/);
  assert.equal(unsuccessfulInferenceLabel({...configured,provider:"local"}),"gemma4:12b");
});
