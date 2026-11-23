import test from "node:test";
import assert from "node:assert/strict";
import {
  BRAIN_EVAL_PRESET_KEY,parseBrainEvalPresets,upsertBrainEvalPreset,
  removeBrainEvalPreset,readBrainEvalPresets,persistBrainEvalPresets
} from "../src/brain-eval-presets.ts";

const config={
  mode:"live",repetitions:3,scenarioIds:["research-current-model","verification-book-author"],
  models:["qwen3.5:9b","gemma4:12b"],
  category:"Web search",statusFilter:"review",search:"latest official"
};

test("named Brain Lab presets preserve all run settings and work after a reload",()=>{
  const memory=new Map();
  const old=globalThis.localStorage;
  globalThis.localStorage={
    getItem:key=>memory.get(key)??null,
    setItem:(key,val)=>memory.set(key,val)
  };
  try{
    const saved=upsertBrainEvalPreset([],"  Research shootout  ",config);
    assert.equal(saved[0].name,"Research shootout");
    persistBrainEvalPresets(saved);
    assert.ok(memory.has(BRAIN_EVAL_PRESET_KEY));
    assert.deepEqual(readBrainEvalPresets(),saved);
    assert.deepEqual(saved[0].config,config);
    const updated=upsertBrainEvalPreset(saved,"RESEARCH SHOOTOUT",
      {...config,repetitions:5,models:["ministral-3:14b"]});
    assert.equal(updated.length,1,"same name is an explicit update, not a duplicate");
    assert.equal(updated[0].config.repetitions,5);
    assert.deepEqual(removeBrainEvalPreset(updated,updated[0].name),[]);
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old}
});

test("preset reader refuses malformed, invalid and duplicated stored entries",()=>{
  const raw=[
    {name:"Valid",config},
    {name:"valid",config},
    {name:"Dangerous",config:{...config,mode:"something-else"}},
    {name:"Bad list",config:{...config,scenarioIds:[23]}},
    {name:"Bad repeat",config:{...config,repetitions:100}},
    {name:"Bad models",config:{...config,models:Array(11).fill("qwen:9b")}},
    {name:"",config}
  ];
  assert.deepEqual(parseBrainEvalPresets(raw),[{name:"Valid",config}]);
  assert.deepEqual(parseBrainEvalPresets({entries:raw}),[]);
  assert.deepEqual(parseBrainEvalPresets(null),[]);
  assert.deepEqual(parseBrainEvalPresets("malicious"),[]);
});

test("preset capacity, names, and stored metadata are bounded",()=>{
  assert.throws(()=>upsertBrainEvalPreset([]," ",config));
  assert.throws(()=>upsertBrainEvalPreset([],"x".repeat(61),config));
  const rows=Array.from({length:25},(_,i)=>({name:"Preset "+i,config}));
  assert.throws(()=>upsertBrainEvalPreset(rows,"Preset extra",config),/Maximum/);
  assert.equal(upsertBrainEvalPreset(rows,"Preset 5",config).length,25);
  const extras=[{name:"Persisted",config,credential:"not a preset field"}];
  assert.deepEqual(parseBrainEvalPresets(extras),[{name:"Persisted",config}]);
});

test("preset load code explicitly filters missing scenarios and models and never runs tests",async()=>{
  const {readFileSync}=await import("node:fs");
  const ui=readFileSync(new URL("../src/BrainEvalPanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/config\.scenarioIds\.filter\(id=>allowedIds\.has\(id\)\)/);
  assert.match(ui,/config\.models\.filter\(model=>localModels\.includes\(model\)\)/);
  assert.match(ui,/setSelectedIds\(new Set\(knownIds\)\)/);
  assert.match(ui,/setSelectedModels\(new Set\(knownModels\)\)/);
  assert.match(ui,/Select installed models before running/);
});

test("desktop and browser relay expose manual named preset controls",async()=>{
  const {readFileSync}=await import("node:fs");
  const desktop=readFileSync(new URL("../src/BrainEvalPanel.tsx",import.meta.url),"utf8");
  const remote=readFileSync(new URL("../server/public/index.html",import.meta.url),"utf8");
  assert.match(desktop,/Saved test presets/);
  assert.match(desktop,/persistBrainEvalPresets\(next\)/);
  assert.match(remote,/id="brainLabPresetSave"/);
  assert.match(remote,/id="brainLabPresetLoad"/);
  assert.match(remote,/id="brainLabPresetDelete"/);
  assert.match(remote,/localStorage\.setItem\(brainLabPresetStorageKey/);
  assert.match(remote,/brainLabSelectedIds=new Set\(known\)/);
  assert.match(remote,/brainLabSelectedModels=new Set\(loadedModels\)/);
  assert.doesNotMatch(remote.slice(remote.indexOf("function loadBrainLabPreset()"),
    remote.indexOf("function deleteBrainLabPreset()")),/startBrainEvaluation|action:"start"/);
});

test("presets keep the chosen interpreter but legacy presets remain valid",()=>{
  const strict={...config,researchMode:"strict"};
  assert.deepEqual(parseBrainEvalPresets([{name:"Strict comparison",config:strict}])[0].config,strict);
  assert.equal(parseBrainEvalPresets([{name:"Legacy",config}])[0].config.researchMode,undefined);
  assert.equal(parseBrainEvalPresets([{name:"Unexpected",config:{...config,researchMode:"unsafe"}}])[0].config.researchMode,undefined);
});

test("Mikanify toggle survives named presets; older presets default to the unmodified draft",()=>{
  const styled={...config,researchMode:"simple",mikanifyAnswer:true};
  assert.deepEqual(parseBrainEvalPresets([{name:"Mikanified",config:styled}])[0].config,styled);
  assert.equal(parseBrainEvalPresets([{name:"Legacy",config}])[0].config.mikanifyAnswer,undefined);
  assert.equal(parseBrainEvalPresets([{name:"Invalid",config:{...styled,mikanifyAnswer:"yes"}}])[0].config.mikanifyAnswer,undefined);
});
