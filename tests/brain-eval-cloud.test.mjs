import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brainEvalModels } from "../src/brain-eval.ts";
import {
  CLOUD_EVAL_BUDGETS,brainCloudChoices,brainModelSelection,
  validateCloudTurnBudget,paceCloudBrainTurn,cloudRateLimitFailure,
  cloudTurnLimit,fitCloudScenarios,
  reserveOpenRouterFreeTurn
} from "../src/brain-eval-cloud.ts";

const settings={
  model:"qwen3.5:9b",
  nvidiaModel:"nvidia/nemotron-3-ultra-550b-a55b",
  openrouterModel:"openrouter/free",
  geminiModel:"gemini-3.8-flash"
};
const local=["qwen3.5:9b","gemma4:12b"];

test("Brain Lab offers every approved NVIDIA model plus configured free OpenRouter and Gemini",()=>{
  const choices=brainCloudChoices(settings);
  assert.equal(choices.filter(choice=>choice.provider==="nvidia").length,8);
  assert.ok(choices.some(choice=>choice.id==="openrouter:openrouter/free"));
  assert.ok(choices.some(choice=>choice.id==="gemini:gemini-3.8-flash"));
  const valid=[...local,...choices.map(choice=>choice.id)];
  assert.deepEqual(brainEvalModels(["qwen3.5:9b","nvidia:"+settings.nvidiaModel,
    "gemini:"+settings.geminiModel],settings.model,valid,"live"),
    ["qwen3.5:9b","nvidia:"+settings.nvidiaModel,"gemini:"+settings.geminiModel]);
  assert.equal(brainModelSelection("nvidia:"+settings.nvidiaModel,settings,local).provider,"nvidia");
  assert.equal(brainModelSelection("gemma4:12b",settings,local).provider,"local");
  assert.throws(()=>brainModelSelection("nvidia:random/unknown",settings,local),/approved/);
  assert.throws(()=>brainEvalModels(["nvidia:random/unknown"],settings.model,valid,"live"),/Choose/);
  assert.throws(()=>brainEvalModels(["openrouter:paid/model"],settings.model,valid,"live"),/Choose/);
  assert.throws(()=>brainEvalModels(["nvidia:"+settings.nvidiaModel],settings.model,valid,"routing"),/Live mode/);
});

test("Cloud selection never accepts paid OpenRouter identifiers or arbitrary Gemini model IDs",()=>{
  const configured={...settings,openrouterModel:"anthropic/claude-sonnet",
    geminiModel:"bad:gemini",nvidiaModel:"nvidia/not-listed"};
  const available=brainCloudChoices(configured);
  assert.ok(!available.some(x=>x.provider==="openrouter"));
  assert.ok(!available.some(x=>x.provider==="gemini"));
  assert.throws(()=>brainModelSelection("nvidia:nvidia/not-listed",configured,local));
  assert.ok(brainCloudChoices({...settings,openrouterModel:"meta/llama:free"})
    .some(choice=>choice.id==="openrouter:meta/llama:free"));
});

test("Cloud safety caps use full scenario TURN counts and worst-case API calls",()=>{
  const selected=brainCloudChoices(settings);
  const nvidia=selected.find(x=>x.provider==="nvidia");
  const openrouter=selected.find(x=>x.provider==="openrouter");
  const gemini=selected.find(x=>x.provider==="gemini");
  assert.equal(CLOUD_EVAL_BUDGETS.nvidia.estimatedCallsPerTurn,6);
  assert.equal(CLOUD_EVAL_BUDGETS.openrouter.estimatedCallsPerTurn,3);
  assert.equal(CLOUD_EVAL_BUDGETS.gemini.estimatedCallsPerTurn,5);
  validateCloudTurnBudget([nvidia,openrouter,gemini],8);
  assert.throws(()=>validateCloudTurnBudget([openrouter],9),/8 turns per model/);
  assert.throws(()=>validateCloudTurnBudget([gemini],9),/8 turns per model/);
  assert.throws(()=>validateCloudTurnBudget([nvidia],25),/24 turns per model/);
  validateCloudTurnBudget([brainModelSelection(local[0],settings,local)],200);
});

test("Sequential cloud pacing honors minimum interval and can be cancelled",async()=>{
  let current=Date.now();
  const waits=[];
  const signal=new AbortController().signal;
  const sleep=async ms=>{waits.push(ms);current+=ms;};
  const clock=()=>current;
  await paceCloudBrainTurn("nvidia",signal,()=>{},clock,sleep);
  await paceCloudBrainTurn("nvidia",signal,ms=>assert.equal(ms,15_000),clock,sleep);
  assert.deepEqual(waits,[15_000]);
  await paceCloudBrainTurn("openrouter",signal,()=>{},clock,sleep);
  await paceCloudBrainTurn("openrouter",signal,ms=>assert.equal(ms,20_000),clock,sleep);
  assert.deepEqual(waits,[15_000,20_000]);
  const cancelled=new AbortController();
  cancelled.abort();
  await assert.rejects(paceCloudBrainTurn("gemini",cancelled.signal),/stopped/);
});

test("OpenRouter conservative free allowance is reserved across runs and resets next UTC day",()=>{
  const records=new Map();
  const storage={
    getItem:key=>records.get(key)??null,
    setItem:(key,val)=>{records.set(key,val)}
  };
  for(let turn=1;turn<=10;turn++){
    assert.equal(reserveOpenRouterFreeTurn(storage,"2026-11-23"),30-turn*3);
  }
  assert.throws(()=>reserveOpenRouterFreeTurn(storage,"2026-11-23"),/daily allowance/);
  assert.equal(reserveOpenRouterFreeTurn(storage,"2026-11-24"),27);
  assert.ok(cloudRateLimitFailure("NVIDIA HTTP 429 (rate limit reached)"));
  assert.ok(cloudRateLimitFailure("Gemini RESOURCE_EXHAUSTED quota"));
  assert.ok(!cloudRateLimitFailure("Webpage returned no results"));
});

test("Cloud Brain Lab keeps isolated memory and preserves native provider API-key boundary",()=>{
  const manager=readFileSync(new URL("../src/brain-eval-manager.ts",import.meta.url),"utf8");
  const panel=readFileSync(new URL("../src/BrainEvalPanel.tsx",import.meta.url),"utf8");
  const backend=readFileSync(new URL("../server/index.mjs",import.meta.url),"utf8");
  assert.match(manager,/provider:selection\.provider/);
  assert.match(manager,/cloudAllowMemory:false/);
  assert.match(manager,/paceCloudBrainTurn\(selection\.provider/);
  assert.match(manager,/reserveOpenRouterFreeTurn\(localStorage\)/);
  assert.match(manager,/cloudKeyStatusCommand\(selection\.provider\)/);
  assert.match(manager,/controller\.abort\(\)/);
  assert.match(panel,/Compare local and free cloud models/);
  assert.match(backend,/allowedEvalModels\(desktop\)/);
  assert.match(backend,/NVIDIA_MODELS\.map\(model => "nvidia:"\+model\)/);
});


test("Cloud test budget explains all-scenarios silent rejection and fits whole tests",()=>{
  const cloud=brainCloudChoices(settings);
  const nvidia=cloud.find(choice=>choice.provider==="nvidia");
  const router=cloud.find(choice=>choice.provider==="openrouter");
  assert.equal(cloudTurnLimit([nvidia]),24);
  assert.equal(cloudTurnLimit([nvidia,router]),8);
  assert.equal(cloudTurnLimit([brainModelSelection(local[0],settings,local)]),null);
  const fixtures=[
    {id:"multi",steps:[1,2,3]},
    {id:"short",steps:[1,2]},
    {id:"third",steps:[1,2,3]},
    {id:"overflow",steps:[1]}
  ];
  assert.deepEqual(fitCloudScenarios(fixtures,8,1),["multi","short","third"]);
  assert.deepEqual(fitCloudScenarios(fixtures,8,2),["multi","overflow"]);
  assert.deepEqual(fitCloudScenarios(fixtures,3,5),[],
    "No test can fit when repetitions alone exceed quota");
});

test("Cloud run validation, any error and exact quota warning stay beside Run controls",()=>{
  const panel=readFileSync(new URL("../src/BrainEvalPanel.tsx",import.meta.url),"utf8");
  const run=panel.indexOf('className="save-button"');
  const alert=panel.indexOf('aria-live="assertive"');
  const monitor=panel.indexOf('aria-label="Brain Lab run progress"');
  const catalog=panel.indexOf('className="brain-eval-catalog"');
  assert.ok(run>=0 && alert>run && monitor>alert && catalog>monitor,
    "Run errors must be visible above the collapsed/expanded giant scenario list");
  assert.match(panel,/overCloudLimit/);
  assert.match(panel,/Fit cloud selection/);
  assert.match(panel,/fitCloudScenarios\(selected,cloudLimit,repeats\)/);
  assert.match(panel,/Could not start: /);
  const remote=readFileSync(new URL("../server/public/index.html",import.meta.url),"utf8");
  assert.match(remote,/brainLabQuotaNote/);
  assert.match(remote,/brainLabFitCloud/);
  assert.match(remote,/brainLabStartFeedback=error.message/);
  const bridge=readFileSync(new URL("../server/index.mjs",import.meta.url),"utf8");
  assert.match(bridge,/CLOUD_EVAL_TURN_LIMITS/);
  assert.match(bridge,/turns>maximum/);
});
