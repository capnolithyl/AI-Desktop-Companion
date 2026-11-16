// Isolated fixtures only. These tests never invoke Ollama or public search.
import test from "node:test";
import assert from "node:assert/strict";
import {planDesktopWebExecution,resolvePublicWebExecution} from "../src/turn-execution-policy.ts";
import {planPublicWebTools,publicDocumentUrls,parseWebToolDecision} from "../src/unified-planner.ts";
import {runBrainEvaluation,brainEvalMetrics} from "../src/brain-eval.ts";
import {reviewResearchCompletion} from "../src/evidence-verification.ts";

const permitted={canPlanPublicWeb:true,blockedReason:null,cloudMaySearch:false};
test("query transport retains model-selected entity type and rechecks privacy",()=>{
  const plan=entityType=>parseWebToolDecision(JSON.stringify({web:{search:true,query:"Aurora latest releases",
    task:{kind:"lookup",entityType,details:["release versions"],requirements:[],roles:[],exclude:[]}}}),true,[]);
  assert.match(plan("language models").query,/Aurora latest releases language models/);
  assert.equal(plan("https://private.example/token").search,false);
});
test("semantic conversation wins over an old research route; permissions still win over the model",()=>{
  const old={mode:"research",query:"Aurora release"};
  assert.equal(resolvePublicWebExecution(permitted,old,{search:false,method:"not-needed"}).autoSearch,false);
  assert.equal(resolvePublicWebExecution(permitted,old,{search:false,method:"fallback"}).autoSearch,false);
  assert.equal(resolvePublicWebExecution({...permitted,blockedReason:"private"},old,{search:true,query:"Aurora"}).autoSearch,false);
  assert.equal(resolvePublicWebExecution(permitted,{mode:"factual"}).researchRoute,"factual");
});

test("public factual follow-ups reach semantic planning",()=>{
  const p=planDesktopWebExecution({question:"Did it change driver support?",autoSearch:true,provider:"local",
    planMode:"factual",notion:false,personalTurn:false,capabilityQuestion:false,existingSearch:false,
    attachment:false,screenshot:false,liveFrame:false,roleplay:false});
  assert.equal(p.canPlanPublicWeb,true);
});

test("document reads are selected semantically and restricted to exact public user locators",async()=>{
  const url="https://github.com/example/project";
  const task={kind:"lookup",subject:"example/project",entityType:"repository",details:["memory documentation"],
    sourceUrl:url,requirements:[],roles:[],exclude:[]};
  const options={automaticWebEnabled:true,sourcePreferences:[],history:[{role:"user",content:`Look up ${url}`}],
    activePublicQuery:"example project repository"};
  const ask=sourceUrl=>planPublicWebTools("What does the README say about memory?",[],async()=>
    JSON.stringify({intent:"refine",web:{search:true,query:"example project memory documentation",task:{...task,sourceUrl}}}),options);
  const read=await ask(url);
  assert.equal(read.task.sourceUrl,url);
  assert.deepEqual(read.task.details,["memory documentation"]);
  assert.equal((await ask("https://different.example/document")).search,false);
  assert.deepEqual(publicDocumentUrls(["https://127.0.0.1/test https://private.local/a https://example.org/a?token=secret https://u:p@example.org/a"]),[]);
});

test("Brain Lab forwards the factual tool path, sources and recency through the execution contract",async()=>{
  const sources=[{title:"Aurora release",url:"https://example.org/releases",content:"Aurora adds Vulkan support.",engine:"unit fixture"}];
  const seen=[];
  const report=await runBrainEvaluation({mode:"live",model:"isolated-fixture",repetitions:1,liveWeb:true,
    scenarios:[{id:"unit-followup",label:"Unit follow-up",group:"Unit",steps:[
      {user:"Search for the latest Aurora release",expect:{web:true}},
      {user:"And did it change driver support?",expect:{web:true}},
      {user:"That sounds useful, thanks.",expect:{web:false}}
    ]}],
    planWeb:async text=>({search:!text.startsWith("That"),query:"Aurora driver support",method:"ai-planned",reason:"Unit decision"}),
    infer:async input=>{seen.push(input);return {text:"Unit answer requiring review.",webExecution:{
      query:input.webRequest.researchQuery??null,results:input.webRequest.autoSearch?sources:[],sourcesCarriedOver:false}}}
  });
  assert.equal(seen[1].webRequest.researchRoute,"research");
  assert.deepEqual(seen[1].messages[1].sources,sources);
  assert.equal(seen[2].webRequest.autoSearch,false);
  assert.ok(report.cases[0].steps.every(s=>s.reviewRequired));
  assert.equal(brainEvalMetrics(report).liveSearches,2);
});


test("a failed final draft recovers source-anchored partial facts without inventing missing details",()=>{
  const quote="Cora Vale was born in 1975 and sings for Amber Glass.";
  const sources=[{title:"Biography",url:"https://example.org/bio",content:quote}];
  const audit={status:"partial",accepted:1,rejected:0,elapsedMs:1,note:"Unit fixture",
    acceptedDetails:[{source:1,subject:"Cora Vale",claim:"Cora Vale was born in 1975.",quote}],
    unresolvedDetails:["current tour dates"]};
  const recovered=reviewResearchCompletion("Cora Vale was born in 2024. [1]",sources,audit);
  assert.match(recovered.text,/1975/);
  assert.doesNotMatch(recovered.text,/2024/);
  assert.match(recovered.text,/Still unconfirmed: current tour dates/);
  assert.equal(reviewResearchCompletion("A casual reaction",[],undefined),null);
  const malformed={...audit,acceptedDetails:[{...audit.acceptedDetails[0],quote:"Fabricated source passage"}]};
  assert.equal(reviewResearchCompletion("An album released in 2024. [1]",sources,malformed).usable,false);
});
