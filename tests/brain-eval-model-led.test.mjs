import test from "node:test";
import assert from "node:assert/strict";
import {modelLedBrainExecution} from "../src/brain-eval-model-led.ts";
import {runBrainEvaluation,EVAL_SCENARIOS} from "../src/brain-eval.ts";
import {localPlannerErrorReason} from "../src/unified-planner.ts";

const scenario=id=>EVAL_SCENARIOS.find(item=>item.id===id);
const policy=(url,allowed=true)=>({
  canPlanPublicWeb:allowed,blockedReason:allowed?null:"Personal memory question",
  cloudMaySearch:false,...(url?{publicDocumentUrl:url}:{})
});

test("NVIDIA model-led Brain Lab never invokes a local Ollama planner",async()=>{
  let plannerCalls=0;
  const webFlags=[];
  const report=await runBrainEvaluation({
    mode:"live",provider:"nvidia",model:"nvidia:fixture-ultra",
    modelLedWeb:true,liveWeb:true,repetitions:1,
    scenarios:[scenario("discovery-release-curiosity")],
    planWeb:async()=>{plannerCalls++;throw new Error("Ollama should not be called")},
    infer:async input=>{
      webFlags.push(input.nativeWebAllowed);
      return {text:"I cannot verify a release without public sources.",
        webExecution:{query:null,results:[],sourcesCarriedOver:false}};
    }
  });
  assert.equal(plannerCalls,0);
  assert.equal(report.webPlanningMode,"native-model-led");
  assert.deepEqual(webFlags,[true,true]);
  assert.equal(report.cases[0].steps[0].plannerElapsedMs,undefined);
  assert.equal(report.cases[0].steps[0].webPlannerDecision,undefined);
});

test("model-led web permission keeps personal-memory turns private",async()=>{
  const flags=[];
  await runBrainEvaluation({
    mode:"live",provider:"nvidia",model:"fixture",modelLedWeb:true,
    repetitions:1,scenarios:[scenario("no-private-search")],
    infer:async input=>{
      flags.push(input.nativeWebAllowed);
      return "Cobalt Harbor is your favorite band";
    }
  });
  assert.deepEqual(flags,[true,false]);
});

test("model-led directed URL reads preserve exact URLs and follow-up source",()=>{
  const url="https://github.com/capnolithyl/AI-Desktop-Companion";
  const first="Look up "+url;
  const read=modelLedBrainExecution(policy(url),{mode:"research",recent:false},first,[],{});
  assert.equal(read.researchTask?.kind,"document");
  assert.equal(read.researchTask?.sourceUrl,url);
  assert.equal(read.researchQuery?.includes(url),false);
  const follow=modelLedBrainExecution(policy(),{mode:"factual",recent:false},
    "What did the README say about memory?",[{role:"user",content:first}],
    {activeTask:read.researchTask,activePublicQuery:read.researchQuery});
  assert.equal(follow.researchTask?.sourceUrl,url);
  const wrong=modelLedBrainExecution(policy(undefined,false),{mode:"research"},
    first,[],{});
  assert.equal(wrong.autoSearch,false);
  assert.equal(wrong.researchRoute,"chat");
});

test("planner error diagnostics distinguish timeout and connection failures safely",()=>{
  assert.equal(localPlannerErrorReason("Local context resolution unavailable: timed out contacting http://127.0.0.1:11434/api/chat"),
    "Local Ollama planner timed out");
  assert.equal(localPlannerErrorReason("Local context resolution returned HTTP 404"),
    "Local Ollama planner returned HTTP 404");
  assert.equal(localPlannerErrorReason("connection refused at http://private.host:1234"),
    "Local Ollama planner connection failed");
  assert.doesNotMatch(localPlannerErrorReason("token=secretX at http://private.host"),/secretX|private.host/);
});

test("model-led explicit public research uses provider tools, not generic deterministic search",()=>{
  const run=modelLedBrainExecution(policy(),{mode:"research",query:"search term",recent:true},
    "What's the latest Vulkan release?",[],{});
  assert.equal(run.researchRoute,"research");
  assert.equal(run.researchQuery,undefined);
  assert.equal(run.autoSearch,false);
  assert.equal(run.researchGeneralFallback,false);
});

test("referential memory retrieval recovers named facts without editing public queries",async()=>{
  const {contextualMemoryQuery}=await import("../src/brain-eval-memory-context.ts");
  const prior=[
    {role:"user",content:"Tell me about Cobalt Harbor and Lantern Desk."},
    {role:"assistant",content:"A made-up reply with a distracting third entity."},
    {role:"user",content:"Which one uses TypeScript?"}
  ];
  const local=contextualMemoryQuery("And who sings for the other one?",prior);
  assert.match(local,/Cobalt Harbor/);
  assert.match(local,/Lantern Desk/);
  assert.doesNotMatch(local,/distracting third entity/);
  assert.equal(contextualMemoryQuery("Tell me about an unrelated game.",prior),
    "Tell me about an unrelated game.");

  const seen=[];
  await runBrainEvaluation({
    mode:"live",provider:"nvidia",model:"fixture",modelLedWeb:true,
    repetitions:1,scenarios:[scenario("ambiguous-references")],
    infer:async args=>{
      seen.push({ids:args.selectedMemories.map(f=>f.id),web:args.nativeWebAllowed});
      return {text:"Fixture response",webExecution:{query:null,results:[],sourcesCarriedOver:false}};
    }
  });
  assert.ok(seen[2].ids.includes(103),
    "The third turn must retrieve the remembered vocalist through user-context recall");
});
