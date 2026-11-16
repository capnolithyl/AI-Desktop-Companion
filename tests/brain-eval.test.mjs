import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EVAL_FACTS,EVAL_SCENARIOS,runBrainEvaluation,brainEvalMetrics,
  brainEvalMarkdown,sameMeaning,scoreAnswer,brainMemoryEvidence,
  brainScenarioNumber,brainScenarioLabel,brainReplyQualityFlags
} from "../src/brain-eval.ts";

const byId=id=>EVAL_SCENARIOS.find(s=>s.id===id);

test("broad isolated test catalog covers multiple intentions and branches",()=>{
  assert.ok(EVAL_SCENARIOS.length>=30);
  assert.ok(EVAL_SCENARIOS.reduce((sum,s)=>sum+s.steps.length,0)>=75);
  assert.ok(new Set(EVAL_SCENARIOS.map(s=>s.group)).size>=5);
  assert.equal(new Set(EVAL_SCENARIOS.map(s=>s.id)).size,EVAL_SCENARIOS.length);
  assert.equal(new Set(EVAL_FACTS.map(f=>f.id)).size,EVAL_FACTS.length);
  assert.equal(byId("branch-a").steps[0].user,byId("branch-b").steps[0].user);
  assert.equal(byId("branch-a").steps[0].user,byId("branch-c").steps[0].user);
  assert.equal(byId("branch-a").steps[0].user,byId("branch-d").steps[0].user);
  assert.notEqual(byId("branch-a").steps.at(-1).user,byId("branch-b").steps.at(-1).user);
});

test("scenario numbers stay stable when a subset is selected",()=>{
  assert.equal(EVAL_SCENARIOS.length,83);
  assert.equal(brainScenarioNumber(EVAL_SCENARIOS[0].id),1);
  assert.equal(brainScenarioNumber(EVAL_SCENARIOS[72].id),73);
  assert.match(brainScenarioLabel(EVAL_SCENARIOS[0].id,EVAL_SCENARIOS[0].label),/^#01 · /);
  assert.match(brainScenarioLabel(EVAL_SCENARIOS[72].id,EVAL_SCENARIOS[72].label),/^#73 · /);
  assert.deepEqual(["verification-movie-runtime","verification-album-songs",
      "verification-book-author","verification-game-playtime"]
    .map(brainScenarioNumber),[74,75,76,77],
    "old scenario numbers stay stable while new proof cases append");
  assert.deepEqual(["correction-entity-type","correction-known-dislike",
      "correction-reference-exclusion","correction-challenged-source"]
    .map(brainScenarioNumber),[78,79,80,81],
    "new correction scenarios append without changing any old numbers");
  assert.equal(brainScenarioNumber("temporal-old-announcement"),82,
    "new time-aware source review must not renumber existing cases");
  assert.equal(brainScenarioNumber("reaction-after-anime-news"),83,
    "opinion/memory test appends after existing scenarios");
  assert.equal(brainScenarioLabel("not-in-catalog","Custom test"),"Custom test");
});
test("live stale-announcement regression requires real search and human date reasoning",async()=>{
  const scenario=byId("temporal-old-announcement");
  assert.equal(scenario.steps.length,2);
  assert.ok(scenario.steps.every(step=>step.expect.web===true));
  assert.ok(scenario.steps.every(step=>step.expect.conversationGoal.includes("date")
    || step.expect.conversationGoal.includes("clock")));
  const report=await runBrainEvaluation({
    scenarios:[scenario],mode:"live",model:"fixture-only",repetitions:1,
    planWeb:async()=>({search:true,query:"Chainsmoker Cat anime current airing status",
      reason:"Verify more recent reporting"}),
    infer:async()=> "A February article announced a July premiere, but the current outcome needs checking."
  });
  const second=report.cases[0].steps[1];
  assert.equal(second.webPass,true);
  assert.equal(second.answerPass,null,"A plausible-sounding recap is not proof of correct temporal reasoning");
  assert.equal(second.reviewRequired,true);
});

test("anime news to yuri reaction to explicit recommendation is tested as separate intents",async()=>{
  const scenario=byId("reaction-after-anime-news");
  assert.equal(scenario.steps.length,3);
  assert.deepEqual(scenario.steps.map(s=>s.expect.web),[true,false,true]);
  const personal=scenario.steps[1];
  assert.equal(personal.expect.route,"chat");
  assert.ok(personal.expect.conversationGoal.includes("Do NOT search"));
  assert.equal(personal.expect.memoryCapture.minUserFacts,2);
  assert.ok(personal.expect.memoryCapture.reviewGoals.some(goal=>goal.includes("drinking")));
  assert.ok(personal.expect.memoryCapture.reviewGoals.some(goal=>goal.includes("smoking")));
  const calls=[];
  const memoryCalls=[];
  const report=await runBrainEvaluation({
    scenarios:[scenario],mode:"live",model:"test-only",repetitions:1,
    planWeb:async(question)=>{
      calls.push(question);
      const search=question===scenario.steps[0].user || question===scenario.steps[2].user;
      return {search,query:search?"Chainsmoker Cat anime yuri recommendations":"",
        reason:search?"Actual public lookup":"Personal opinion, no lookup needed",
        intent:search?"new":"chat"};
    },
    infer:async()=> "I can see why the heavy drinking would put you off.",
    previewMemory:async input=>{
      memoryCalls.push(input);
      return {userFacts:[
        {fact:"The user loves yuri anime.",evidence:"i love yuri anime"},
        {fact:"The user disliked the drinking scenes in Botan Kamiina Fully Blossoms When Drunk.",
          evidence:"i hate the drinking part. it was so gross at some point."}
      ],interestItems:[{
        kind:"anime",name:"Botan Kamiina Fully Blossoms When Drunk",status:"experienced",
        evidence:"i watched botan kamiina fully blossoms when drunk recently"
      }],writesToRealMemories:false};
    }
  });
  assert.deepEqual(report.cases[0].steps.map(s=>s.webPass),[true,true,true]);
  assert.equal(report.cases[0].steps[1].memoryCapturePass,true);
  assert.equal(report.cases[0].steps[1].memoryCapturePreview.userFacts.length,2);
  assert.equal(report.cases[0].steps[1].memoryCapturePreview.writesToRealMemories,false);
  assert.equal(report.cases[0].steps[1].reviewRequired,true);
  assert.equal(memoryCalls.length,1,"Only the owner's preference turn warrants extraction");
  assert.equal(memoryCalls[0].user,personal.user);
  assert.equal(memoryCalls[0].priorUser,scenario.steps[0].user);
  assert.equal(calls.length,3);
  assert.equal(report.writesToRealMemories,false);
  assert.match(brainEvalMarkdown(report),/Read-only memory review expectations/);
  assert.match(brainEvalMarkdown(report),/Proposed user fact \(not saved\)/);
});

test("unrequested research and missing memory captures are not silently graded as success",async()=>{
  const scenario=byId("reaction-after-anime-news");
  const unwanted=await runBrainEvaluation({
    scenarios:[scenario],mode:"live",model:"test-only",repetitions:1,
    planWeb:async()=>({search:true,query:"catgirl anime smoking new shows",
      reason:"Incorrectly interpreted opinion as discovery"}),
    infer:async()=> "I couldn't find a recommendation.",
    previewMemory:async()=>({userFacts:[],interestItems:[],writesToRealMemories:false})
  });
  assert.equal(unwanted.cases[0].steps[1].webPass,false,
    "A needless search after a personal reaction is a real failure");
  assert.equal(unwanted.cases[0].steps[1].memoryCapturePass,false);
  const missing=await runBrainEvaluation({
    scenarios:[scenario],mode:"live",model:"test-only",repetitions:1,
    planWeb:async()=>({search:false,reason:"No research"}),
    infer:async()=> "The drinking focus was unpleasant."
  });
  assert.equal(missing.cases[0].steps[1].memoryCapturePass,null);
  assert.equal(missing.cases[0].steps[1].memoryCapturePreview,undefined);
});

test("a richer synthetic memory can prove the same fact without matching an exact record ID",()=>{
  assert.deepEqual(brainMemoryEvidence([109,120],[120]),[
    {expectedId:109,supportingIds:[120]},
    {expectedId:120,supportingIds:[120]}
  ]);
  assert.deepEqual(brainMemoryEvidence([120],[109]),[
    {expectedId:120,supportingIds:[]}
  ]);
  assert.deepEqual(brainMemoryEvidence([102],[101]),[
    {expectedId:102,supportingIds:[]}
  ]);
});
test("observed web decision matters more than exact research route label",async()=>{
  const report=await runBrainEvaluation({
    mode:"live",scenarios:[byId("search-github")],model:"fake",repetitions:1,
    planWeb:async()=>({search:true,query:"desktop companion GitHub features",reason:"Need actual repo evidence"}),
    infer:async()=> "The actual repository would need checking."
  });
  const step=report.cases[0].steps[0];
  assert.equal(step.actualRoute,"chat");
  assert.equal(step.routeLabelMatch,false);
  assert.equal(step.webPass,true);
  assert.equal(step.routePass,true);
  assert.equal(step.pass,true);
});
test("review-only heuristics flag rambling answers without inventing a semantic judgment",()=>{
  const conversational={conversationGoal:"Respond briefly and respect the user's constraints."};
  const runaway=("Wait, no. Actually, scratch that! Oops, let me try again. ").repeat(20);
  const flagged=brainReplyQualityFlags(runaway,conversational,770);
  assert.ok(flagged.some(x=>x.includes("Long reply")));
  assert.ok(flagged.some(x=>x.includes("self-correction")));
  assert.deepEqual(brainReplyQualityFlags("That sounds cool!",conversational,8),[]);
  assert.deepEqual(brainReplyQualityFlags(undefined,conversational,0),[]);
});
test("semantic persona correction is human-reviewed instead of phrase-matched",async()=>{
  const report=await runBrainEvaluation({
    mode:"live",model:"test-only",repetitions:1,
    scenarios:[byId("separate-personas")],
    infer:async({stepIndex})=>stepIndex===0?"Your favorite color is moss green.":
      "Not at all. Your preferences and mine are separate."
  });
  const corrected=report.cases[0].steps[1];
  assert.equal(corrected.answerPass,null);
  assert.equal(corrected.reviewRequired,true);
  assert.equal(corrected.pass,true);
});

test("corrected public identity requires an updated public query",async()=>{
  const scenario=byId("correction-entity-type");
  const report=await runBrainEvaluation({
    mode:"live",model:"test-only",repetitions:1,scenarios:[scenario],
    planWeb:async(question)=>question.includes("Norwegian")
      ? {search:true,query:"Immortal Norwegian black metal band",
          reason:"The user clarified which public entity they meant"}
      : {search:false,reason:"Initial name is ambiguous"},
    infer:async()=> "Immortal is a Norwegian black metal band."
  });
  const turn=report.cases[0].steps[1];
  assert.equal(turn.webPlannerDecision.query,"Immortal Norwegian black metal band");
  assert.equal(turn.pass,true);
  assert.equal(turn.reviewRequired,true);
  assert.equal(turn.webExecution,undefined,
    "A planning-only unit test must never fabricate actual public search results");
});

test("a corrected preference must become a structured exclusion",async()=>{
  const scenario=byId("correction-known-dislike");
  const run=async(exclude)=>runBrainEvaluation({
    mode:"live",model:"test-only",repetitions:1,scenarios:[scenario],
    planWeb:async(question)=>({search:true,
      query:question.includes("Exclude")?"Fire Emblem alternatives tactical RPG":"tactical RPG Fire Emblem alternatives",
      reason:"Check tactical RPG options",
      task:{kind:"discover",requirements:[],roles:[],exclude}
    }),
    infer:async()=> "The options need source verification."
  });
  const missing=await run([]);
  assert.ok(missing.cases[0].steps[1].answerFailures.some(f=>f.includes("XCOM")));
  assert.equal(missing.cases[0].steps[1].pass,false);
  const fixed=await run(["XCOM"]);
  assert.ok(!fixed.cases[0].steps[1].answerFailures.some(f=>f.includes("XCOM")));
  assert.equal(fixed.cases[0].steps[1].pass,true);
});

test("semantic answer assertion isn't exact wording or case-sensitive",()=>{
  assert.equal(sameMeaning("Absolutely! The singer is Nora Vale.","nora vale"),true);
  assert.deepEqual(scoreAnswer("Your favorite BAND is Cobalt Harbor, of course.",{
    answerIncludes:["Cobalt Harbor"]
  }),[]);
  assert.equal(scoreAnswer("I don't know", {answerIncludes:["Cobalt Harbor"]}).length,1);
  assert.equal(sameMeaning("I do not know yet.","no"),false);
  assert.equal(sameMeaning("No, Rowan is your spouse.","no"),true);
  assert.equal(scoreAnswer("Yes, Rowan is your child", {answerExcludes:["yes Rowan"]}).length,1);
});

test("casual conversations cover varied non-question dialogue and maintain explicit review goals",()=>{
  const casual=EVAL_SCENARIOS.filter(s=>s.group==="Natural conversation");
  assert.ok(casual.length>=18);
  assert.ok(casual.reduce((total,s)=>total+s.steps.length,0)>=50);
  assert.ok(casual.some(s=>s.steps.every(step=>!step.user.trim().endsWith("?"))));
  for(const scenario of casual){
    assert.ok(scenario.steps.length>=2);
    for(const step of scenario.steps){
      assert.equal(step.expect.route,"chat");
      assert.equal(step.expect.web,false);
      assert.ok(step.expect.conversationGoal?.length>30);
      assert.ok(step.expect.stubReply?.length>2);
    }
  }
});

test("non-factual live replies require human review, never get free semantic passes",async()=>{
  const scenario=EVAL_SCENARIOS.find(s=>s.id==="conversation-venting");
  const result=await runBrainEvaluation({
    scenarios:[scenario],mode:"live",model:"fake-model",repetitions:1,
    infer:async()=> "Here's an irrelevant answer about stock earnings."
  });
  const turns=result.cases[0].steps;
  assert.ok(turns.every(turn=>turn.reviewRequired));
  assert.ok(turns.every(turn=>turn.answerPass===null));
  assert.equal(brainEvalMetrics(result).reviewTurns,turns.length);
  assert.equal(brainEvalMetrics(result).verifiedPassed,0);
  assert.equal(brainEvalMetrics(result).unverifiedTurns,turns.length);
  assert.equal(brainEvalMetrics(result).answerChecks,0);
  assert.match(brainEvalMarkdown(result),/Conversation review goal/);
});

test("implicit conversational research has both discovery and deliberate no-search controls",()=>{
  const fixtures=EVAL_SCENARIOS.filter(s=>s.group==="Conversational discovery");
  assert.ok(fixtures.length>=15);
  assert.ok(fixtures.some(s=>s.steps.some(step=>step.expect.web===true)));
  assert.ok(fixtures.some(s=>s.steps.every(step=>step.expect.web===false)));
  assert.ok(fixtures.some(s=>s.steps.some(step=>step.expect.web===true)
    && s.steps.some(step=>step.expect.web===false)));
  assert.equal(byId("discovery-bands-wish").steps[0].expect.web,true);
  assert.equal(byId("discovery-wish-not-a-search").steps[0].expect.web,false);
  assert.equal(byId("discovery-wish-but-no-recommendations").steps[1].expect.web,false);
  assert.ok(fixtures.every(s=>s.steps.every(step=>step.expect.conversationGoal)));
});

test("fast mode cannot claim implicit AI web-planning succeeded without observing it",async()=>{
  const result=await runBrainEvaluation({
    scenarios:[byId("discovery-bands-wish")],mode:"routing",model:"fixture-only",repetitions:1
  });
  const planned=result.cases[0].steps[0];
  assert.equal(planned.expected.web,true);
  assert.equal(planned.webPass,null);
  assert.equal(planned.reviewRequired,true);
  assert.ok(brainEvalMetrics(result).webUnobserved>=1);
  assert.match(brainEvalMarkdown(result),/REVIEW/);
});

test("live web-planner decisions distinguish desired recommendations from unwanted search",async()=>{
  const wanted=await runBrainEvaluation({
    scenarios:[byId("discovery-bands-wish")],mode:"live",model:"fake",repetitions:1,
    planWeb:async()=>({search:true,query:"bands similar to Immortal black metal",reason:"Real recommendations need discovery"}),
    infer:async()=>"I can find other bands with that icy sound."
  });
  assert.equal(wanted.cases[0].steps[0].webPass,true);
  const unwanted=await runBrainEvaluation({
    scenarios:[byId("discovery-wish-not-a-search")],mode:"live",model:"fake",repetitions:1,
    planWeb:async()=>({search:true,query:"Immortal recommendations",reason:"Bad search"}),
    infer:async()=>"I know how you feel."
  });
  assert.equal(unwanted.cases[0].steps[0].webPass,false);
});

test("live Brain Lab passes conversation history to web planning for independent discovery scenarios",async()=>{
  const selected=["discovery-bands-wish","discovery-anime","discovery-games",
    "discovery-tech-tool"].map(byId);
  const calls=[];
  const result=await runBrainEvaluation({
    scenarios:selected,mode:"live",model:"fixture-model",repetitions:1,
    planWeb:async(question,previous)=>{
      calls.push({question,previous:previous.map(turn=>({...turn}))});
      return {search:true,query:"public topics refined by latest constraints",
        reason:"The earlier public discovery request is still active"};
    },
    infer:async()=>"I can check current public options against those constraints."
  });
  for(const scenario of selected){
    const steps=result.cases.find(c=>c.id===scenario.id).steps;
    assert.equal(steps[0].webPass,true,scenario.id+" initial request");
    assert.equal(steps[1].webPass,true,scenario.id+" follow-up constraint");
    assert.equal(steps[1].canPlanPublicWeb,true,scenario.id+" policy eligibility");
    const followup=calls.find(c=>c.question===scenario.steps[1].user);
    assert.ok(followup,scenario.id+" planner invoked for refinement");
    assert.equal(followup.previous[0].role,"user");
    assert.equal(followup.previous[0].content,scenario.steps[0].user);
  }
});
test("planner history snapshots never mutate after later turns are appended",async()=>{
  const observed=[];
  await runBrainEvaluation({
    scenarios:[byId("discovery-bands-wish")],
    mode:"live",model:"fixture-model",repetitions:1,
    planWeb:async(_question,previous)=>{
      // Keep the original object, not a copy, to catch retroactive mutation.
      observed.push(previous);
      return {search:true,query:"similar raw black metal bands",reason:"Refining discovery"};
    },
    infer:async()=>"Let's compare some similar bands."
  });
  assert.equal(observed.length,2);
  assert.deepEqual(observed[0],[],"First call must remain empty after test completion");
  assert.deepEqual(observed[1].map(turn=>turn.role),["user","assistant"]);
  assert.equal(observed[1][0].content,
    "Man, I wish there were more bands that sound like Immortal.");
});
test("a casual book discussion can turn into discovery and carry a third-turn constraint",async()=>{
  const requested=[];
  const report=await runBrainEvaluation({
    scenarios:[byId("discovery-book")],mode:"live",model:"fixture-model",repetitions:1,
    planWeb:async(question,previous)=>{
      // The runner appends later turns to the same array. Capture the
      // planner's input *at invocation time*, not its eventual final state.
      requested.push({question,previous:previous.map(turn=>({...turn}))});
      return {search:!question.startsWith("I finished"),reason:"Refined public book discovery"};
    },
    infer:async()=>"I'll look for shorter liminal-horror options."
  });
  const steps=report.cases[0].steps;
  assert.deepEqual(steps.map(step=>step.expected.web),[false,true,true]);
  assert.deepEqual(steps.map(step=>step.webPass),[true,true,true]);
  const last=requested.find(x=>x.question==="Prefer something short this time.");
  assert.ok(last);
  assert.deepEqual(last.previous.filter(x=>x.role==="user").map(x=>x.content),[
    "I finished The Hollow Places and loved the weird in-between spaces.",
    "I wish there were more books with that kind of liminal horror."
  ]);
});
test("web-planning context is isolated per scenario and explicit research opt-outs remain local",async()=>{
  const chosen=[byId("discovery-wish-but-no-recommendations"),
    byId("discovery-wish-not-a-search"),byId("discovery-bands-just-gushing")];
  const calls=[];
  const report=await runBrainEvaluation({
    scenarios:chosen,mode:"live",model:"fixture-model",repetitions:1,
    planWeb:async(question,previous)=>{
      calls.push({question,previous:previous.map(turn=>({...turn}))});
      const optOut=/not asking for recommendations|just venting/i.test(question);
      const discovery=/more bands that sounded like Immortal/i.test(question);
      return {search:discovery&&!optOut,reason:"Use current turn preference"};
    },
    infer:async()=>"Let's talk about it."
  });
  assert.equal(report.cases.find(c=>c.id==="discovery-wish-but-no-recommendations")
    .steps[1].webPass,true);
  assert.equal(report.cases.find(c=>c.id==="discovery-wish-not-a-search")
    .steps[0].plannedWeb,false);
  assert.equal(report.cases.find(c=>c.id==="discovery-bands-just-gushing")
    .steps[0].plannedWeb,false);
  assert.ok(calls.filter(c=>c.previous.length===0).length>=1,
    "A new scenario never inherits earlier synthetic user turns");
});
test("factual answers are still checked even when web execution is unobserved",async()=>{
  const report=await runBrainEvaluation({
    mode:"live",scenarios:[byId("branch-a")],model:"fake",repetitions:1,
    infer:async({messages})=>{
      const question=messages.at(-1).content;
      if(question.includes("favorite band"))return "Cobalt Harbor";
      if(question.includes("favorite song"))return "I don't know";
      return "Nora Vale";
    }
  });
  const [first,second,third]=report.cases[0].steps;
  assert.equal(first.answerPass,true);
  assert.equal(second.answerPass,false);
  assert.equal(third.answerPass,true);
  assert.equal(third.routeLabelMatch,false);
  assert.equal(third.routePass,true);
  assert.equal(third.reviewRequired,true);
  assert.ok(brainEvalMarkdown(report).includes("#01"));
});
test("planning tests use independent context across repeated branching paths",async()=>{
  const samples=[byId("branch-a"),byId("branch-b"),byId("branch-c"),byId("branch-d")];
  const report=await runBrainEvaluation({scenarios:samples,repetitions:2,mode:"routing",model:"fixture-only"});
  assert.equal(report.cases.length,8);
  assert.equal(report.cases[0].steps.length,3);
  assert.equal(report.liveWebEnabled,false);
  assert.equal(report.writesToRealMemories,false);
  const a=report.cases.find(c=>c.id==="branch-a");
  const d=report.cases.find(c=>c.id==="branch-d");
  assert.equal(a.steps[0].user,d.steps[0].user);
  assert.notEqual(a.steps[1].user,d.steps[1].user);
  assert.equal(brainEvalMetrics(report).turns,24);
  assert.match(brainEvalMarkdown(report),/Scenario|singer after favorite song/);
});

test("live harness accepts a model adapter and records replies without mutating fixtures",async()=>{
  const original=JSON.stringify(EVAL_FACTS);
  const mock=async ({messages}) => {
    const last=messages.at(-1).content;
    return last.includes("favorite band")?"Your favorite band is Cobalt Harbor.":"Nora Vale";
  };
  const report=await runBrainEvaluation({
    scenarios:[byId("branch-a")],repetitions:1,mode:"live",model:"mock-9b",infer:mock
  });
  assert.equal(report.cases.length,1);
  assert.equal(report.cases[0].steps[0].answerPass,true);
  assert.equal(typeof report.cases[0].steps[1].answerPass,"boolean");
  assert.equal(original,JSON.stringify(EVAL_FACTS));
});

test("live web evaluation preflight uses real SearXNG, not fake source results or HTTP-only readiness",()=>{
  const manager=readFileSync(new URL("../src/brain-eval-manager.ts",import.meta.url),"utf8");
  const service=readFileSync(new URL("../src-tauri/src/search_service.rs",import.meta.url),"utf8");
  const search=readFileSync(new URL("../src-tauri/src/web_search.rs",import.meta.url),"utf8");
  assert.match(manager,/action:"probe",endpoint:settings\.searxngEndpoint/);
  assert.match(manager,/step\.expect\.web===true \|\| step\.expect\.route==="research"/);
  assert.match(manager,/if\(probe\.state!=="ready"\)throw new Error/);
  assert.match(service,/source_priority::search\(\s*endpoint, "Python programming language"/);
  assert.match(service,/"no-results"/);
  assert.match(search,/\.no_proxy\(\)/);
  assert.match(search,/unresponsive_engines/);
});

test("a real-source research turn cannot pass merely because planning succeeded",async()=>{
  const result=await runBrainEvaluation({
    scenarios:[byId("search-website")],mode:"live",model:"local-test",repetitions:1,
    liveWeb:true,
    planWeb:async()=>({search:true,query:"What is python.org?",reason:"Check current official site"}),
    infer:async()=>({text:"The sources didn't provide enough evidence.",webExecution:{
      query:"What is python.org?",sourcesCarriedOver:false,
      // Recorded public source excerpt, not a web-search simulation. This unit
      // test checks scorekeeping only; Live Brain Lab must contact real SearXNG.
      results:[{title:"Welcome to Python.org",url:"https://www.python.org/",
        content:"The official home of the Python Programming Language.",engine:"google cse"}],
      researchAudit:{status:"unavailable",accepted:0,rejected:2,elapsedMs:100,
        note:"No factual claims matched the retrieved excerpts.",taskKind:"lookup"}
    }})
  });
  const step=result.cases[0].steps[0];
  assert.equal(step.webPass,true,"the search decision itself was correct");
  assert.equal(step.webExecution.results.length,1,"realistic nonempty search results");
  assert.equal(step.evidencePass,false,"no validated answer");
  assert.equal(step.pass,false,"no more false-green research");
  assert.equal(result.cases[0].pass,false);
  assert.equal(brainEvalMetrics(result).evidenceFailures,1);
  assert.match(brainEvalMarkdown(result),/NO VERIFIED ANSWER/);
});

test("manual cancellation cannot silently run the scenario catalog",async()=>{
  const controller=new AbortController();
  controller.abort();
  const report=await runBrainEvaluation({
    scenarios:EVAL_SCENARIOS,repetitions:5,mode:"routing",
    model:"fixture-only",signal:controller.signal
  });
  assert.equal(report.cases.length,0);
  assert.equal(brainEvalMetrics(report).turns,0);
});

test("desktop Brain Lab has a real scrolling viewport and no nested clipped catalog",()=>{
  const read=(path)=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
  const app=read("App.tsx");
  const styles=read("styles.css");
  const brainCss=read("brain-eval.css");
  const panel=read("BrainEvalPanel.tsx");
  assert.match(app,/settingsTab === "brain" \? "settings-body settings-brain"/);
  assert.match(styles,/\.settings-layout > \.settings-body\.settings-brain\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styles,/\.settings-layout\.brain-lab-layout \.settings-tabs/);
  assert.doesNotMatch(brainCss,/\.brain-eval-catalog\{[^}]*max-height/s);
  assert.match(panel,/brain-eval-actionbar/);
  assert.match(panel,/brain-eval-find/);
  assert.match(panel,/brain-eval-explainer/);
});

test("live planner sees previous approved research task and clears it after a no-search turn",async()=>{
  const observations=[];
  const scenarios=[byId("discovery-bands-wish"),
    byId("discovery-wish-but-no-recommendations")];
  const report=await runBrainEvaluation({
    scenarios,mode:"live",model:"fixture-model",repetitions:1,
    planWeb:async(question,_previous,context)=>{
      observations.push({question,context:{...context}});
      const optOut=question.startsWith("Not asking")||question.startsWith("Thanks");
      return optOut
        ?{search:false,reason:"Explicitly ended the task"}
        :{search:true,query:"black metal bands with raw guitar atmosphere",
          reason:"Continuing public discovery"};
    },
    infer:async()=>"Synthetic response."
  });
  const first=observations.filter(x=>x.question==="Man, I wish there were more bands that sound like Immortal.");
  assert.equal(first.length,1);
  assert.equal(first[0].context.activePublicQuery,undefined);
  const followup=observations.find(x=>x.question==="Especially their raw, cold guitar atmosphere.");
  assert.equal(followup.context.activePublicQuery,"black metal bands with raw guitar atmosphere");
  const decline=observations.find(x=>x.question==="Not asking for recommendations, by the way. Just venting.");
  assert.equal(decline.context.activePublicQuery,"black metal bands with raw guitar atmosphere");
  const afterDecline=observations.find(x=>x.question==="Thanks, I just really love that style.");
  assert.equal(afterDecline.context.activePublicQuery,undefined);
  assert.equal(report.cases[0].steps[1].activePublicQuery,"black metal bands with raw guitar atmosphere");
  assert.equal(report.cases[1].steps[2].activePublicQuery,undefined);
});

test("isolated Live reply adapter is told that planned public research was not executed",async()=>{
  const seen=[];
  const scenarios=[byId("discovery-anime"),byId("discovery-bands-just-gushing")];
  const report=await runBrainEvaluation({
    scenarios,mode:"live",model:"fixture",repetitions:1,
    planWeb:async(question)=>question.includes("horror anime")||question.includes("six episodes")
      ?{search:true,query:"short horror anime OVAs",reason:"Synthetic discovery plan"}
      :{search:false,reason:"Casual conversation"},
    infer:async({messages,researchPlanned})=>{
      seen.push({question:messages.at(-1).content,researchPlanned});
      return "I would verify current public options before giving exact details.";
    }
  });
  const discovered=seen.find(x=>x.question==="Ideally something under six episodes.");
  assert.equal(discovered.researchPlanned,true);
  const casual=seen.find(x=>x.question==="I love Immortal's sound so much.");
  // Model planning is deliberately a mock; this verifies the boolean is
  // passed through, not that Qwen made a correct semantic judgment.
  assert.equal(casual.researchPlanned,false);
  assert.equal(report.cases[0].steps.length,2);
});

test("Live web passes the current public research query to the real inference adapter and records sources",async()=>{
  const searched=[];
  const scenarios=[byId("discovery-bands-wish")];
  const report=await runBrainEvaluation({
    scenarios,mode:"live",model:"fixture-model",repetitions:1,liveWeb:true,
    planWeb:async question=>({
      search:true,query:question.includes("Especially")
        ?"bands similar to Immortal with raw cold guitars"
        :"bands similar to Immortal black metal",
      reason:"Public discovery"
    }),
    infer:async({researchQuery,selectedMemories})=>{
      searched.push({researchQuery,selectedMemories});
      return {text:"I found a cited result [1].",
        webExecution:{query:researchQuery,results:[{
          title:"Real source result",url:"https://example.org/artist",
          content:"Public search excerpt",engine:"searxng"
        }],sourcesCarriedOver:false}};
    }
  });
  assert.equal(report.liveWebEnabled,true);
  assert.equal(report.environment,"isolated-synthetic+live-public-web");
  assert.deepEqual(searched.map(x=>x.researchQuery),[
    "bands similar to Immortal black metal",
    "bands similar to Immortal with raw cold guitars"]);
  assert.deepEqual(searched.map(x=>x.selectedMemories),[[],[]]);
  assert.equal(report.cases[0].steps[0].webExecution.results[0].url,"https://example.org/artist");
  assert.equal(report.cases[0].steps[1].webExecution.results.length,1);
  assert.equal(brainEvalMetrics(report).liveSearches,2);
  assert.equal(brainEvalMetrics(report).liveSearchesWithSources,2);
  assert.equal(brainEvalMetrics(report).liveSources,2);
  assert.match(brainEvalMarkdown(report),/PUBLIC WEB ENABLED/);
  assert.match(brainEvalMarkdown(report),/https:\/\/example\.org\/artist/);
  assert.equal(report.writesToRealMemories,false);
});

test("Live web never searches for a user who ended discovery or a private Notion route",async()=>{
  const called=[];
  const chosen=[byId("discovery-wish-but-no-recommendations"),
    byId("notion-without-web")];
  const report=await runBrainEvaluation({
    scenarios:chosen,mode:"live",model:"fixture",repetitions:1,liveWeb:true,
    planWeb:async question=>({
      search:!question.includes("Not asking")&&!question.includes("Thanks"),
      query:"bands similar to Immortal black metal",reason:"Mock semantic task choice"
    }),
    infer:async({messages,researchQuery})=>{
      called.push({text:messages.at(-1).content,researchQuery});
      return {text:"No unsanctioned web request.",
        webExecution:{query:null,results:[],sourcesCarriedOver:false}};
    }
  });
  assert.equal(called.find(x=>x.text.startsWith("Not asking")).researchQuery,undefined);
  assert.equal(called.find(x=>x.text.startsWith("Thanks")).researchQuery,undefined);
  assert.ok(report.cases.find(c=>c.id==="notion-without-web").steps.every(x=>x.blockedReason));
  assert.equal(report.writesToRealMemories,false);
});

test("production Brain Lab Live adapter delegates actual search to Rust chat_stream, not a mock result",()=>{
  const code=readFileSync(new URL("../src/brain-eval-manager.ts",import.meta.url),"utf8");
  assert.match(code,/autoSearch:!!researchQuery/);
  assert.match(code,/researchRoute:researchQuery\?"research":"chat"/);
  assert.match(code,/researchQuery:researchQuery\|\|undefined/);
  assert.match(code,/searxngEndpoint:settings\.searxngEndpoint/);
  assert.match(code,/sources\?:Array/);
  assert.match(code,/liveWeb:true/);
});

test("candidate-first recovery is restricted to source-grounded names and genuine SearXNG",()=>{
  const lib=readFileSync(new URL("../src-tauri/src/lib.rs",import.meta.url),"utf8");
  const evidence=readFileSync(new URL("../src-tauri/src/evidence_pack.rs",import.meta.url),"utf8");
  const gate=readFileSync(new URL("../src-tauri/src/recommendation_gate.rs",import.meta.url),"utf8");
  assert.match(lib,/discover_candidate_leads\(/);
  assert.match(lib,/candidate_details_query\(/);
  assert.match(lib,/web_search::web_search\(/);
  assert.match(lib,/focused_task\.subject=Some\(lead\.title\.clone\(\)\)/);
  assert.match(evidence,/normalize\(&source\.content\)\.contains\(&normalize\(quote\)\)/);
  assert.match(evidence,/validate_leads\(proposals,sources,&task\.exclude\)/);
  assert.match(gate,/not_the_named_target_subject/);
});

test("live report shows candidate-first attempts but cannot call a failed shortlist a success",async()=>{
  const report=await runBrainEvaluation({
    scenarios:[byId("verification-game-playtime")],mode:"live",
    model:"fixture",repetitions:1,liveWeb:true,
    planWeb:async()=>({search:true,query:"short horror games under two hours",
      reason:"Search real game runtimes"}),
    infer:async({researchQuery})=>({
      text:"The found sources did not establish a safe recommendation.",
      webExecution:{query:researchQuery,results:[{
        title:"Indie horror game list",url:"https://example.org/list",
        content:"A listing of several games.",engine:"test"}],
        sourcesCarriedOver:false,researchAudit:{
          status:"no_supported_matches",accepted:0,rejected:2,elapsedMs:1000,
          note:"Insufficient evidence",candidateLeads:["Iron Lung [source 1]"],
          candidateQueries:["\"Iron Lung\" duration short horror game"],
          recommendationTask:true,recommendationApproved:[],
          recommendationRejected:2
        }}
    })
  });
  const step=report.cases[0].steps[0];
  assert.equal(step.evidencePass,false);
  assert.equal(step.pass,false);
  assert.match(brainEvalMarkdown(report),/Source-identified candidates: Iron Lung/);
  assert.match(brainEvalMarkdown(report),/Attempted candidate-specific public lookup/);
});

test("native Brain Lab report recovery reopens the last autosaved report after restart",()=>{
  const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  const manager=readFileSync(new URL("../src/brain-eval-manager.ts",import.meta.url),"utf8");
  const rust=readFileSync(new URL("../src-tauri/src/lib.rs",import.meta.url),"utf8");
  assert.match(app,/restoreBrainEvalReport\(\)/);
  assert.match(manager,/brain_eval_load_latest/);
  assert.match(manager,/report=candidate/);
  assert.match(rust,/fn brain_eval_load_latest\(/);
  assert.match(rust,/brain_eval_load_latest,/);
  assert.match(rust,/join\("Brain-Evaluations"\)/);
  assert.match(rust,/writesToRealMemories/);
});

test("Live report preserves source extraction diagnostics without declaring a claim verified",async()=>{
  const report=await runBrainEvaluation({
    scenarios:[byId("discovery-bands-wish")],mode:"live",
    model:"fixture",repetitions:1,liveWeb:true,
    planWeb:async()=>({search:true,query:"black metal bands similar to Immortal",
      reason:"Public research"}),
    infer:async({researchQuery})=>({
      text:"There is a related artist in the search preview [1].",
      webExecution:{
        query:researchQuery,results:[{title:"Music article",
          url:"https://example.org/music",content:"The source names an artist.",
          engine:"test"}],sourcesCarriedOver:false,
        researchAudit:{status:"used",accepted:2,rejected:1,
          elapsedMs:1200,note:"Exact quotes matched; claims remain unverified."}
      }
    })
  });
  const step=report.cases[0].steps[0];
  assert.equal(step.webExecution.researchAudit.accepted,2);
  assert.equal(brainEvalMetrics(report).evidencePasses,2);
  assert.equal(brainEvalMetrics(report).evidenceFacts,4);
  assert.equal(brainEvalMetrics(report).evidenceUnavailable,0);
  assert.equal(step.reviewRequired,true);
  assert.equal(step.answerPass,null);
  assert.match(brainEvalMarkdown(report),/Structured evidence extraction: used/);
  assert.match(brainEvalMarkdown(report),/not independently fact-verified|not verified factual correctness/i);
});

test("Live screen reports admitted and rejected recommendation candidates without certifying their factual correctness",async()=>{
  const report=await runBrainEvaluation({
    scenarios:[byId("discovery-anime")],mode:"live",model:"fixture",
    repetitions:1,liveWeb:true,
    planWeb:async()=>({search:true,query:"horror anime less than six episodes",
      reason:"Public discovery"}),
    infer:async({messages,researchQuery})=>{
      const noMatch=messages.at(-1).content.includes("six episodes");
      return {
        text:noMatch
          ?"I couldn't confirm any matches satisfying your episode limit."
          :"I can investigate short horror anime with sources.",
        webExecution:{
          query:researchQuery,sourcesCarriedOver:false,
          results:[{title:"Horror anime guide",url:"https://example.org/anime",
            content:"Pet Shop of Horrors is a four-episode series.",engine:"test"}],
          researchAudit:noMatch
            ?{status:"no_supported_matches",accepted:0,rejected:2,elapsedMs:800,
              note:"No candidates passed",recommendationTask:true,
              recommendationApproved:[],recommendationRejected:2,constraintsChecked:1}
            :{status:"shortlist",accepted:1,rejected:1,elapsedMs:900,
              note:"Source screened",recommendationTask:true,
              recommendationApproved:["Pet Shop of Horrors"],recommendationRejected:1,
              constraintsChecked:0}
        }
      };
    }
  });
  const metrics=brainEvalMetrics(report);
  assert.equal(metrics.shortlistTurns,2);
  assert.equal(metrics.shortlistedItems,1);
  assert.equal(metrics.rejectedItems,3);
  assert.equal(metrics.noSupportedMatches,1);
  assert.equal(metrics.evidencePasses,1);
  assert.equal(report.cases[0].steps[1].webExecution.researchAudit.recommendationRejected,2);
  assert.match(brainEvalMarkdown(report),/Screened recommendation shortlists/);
  assert.match(brainEvalMarkdown(report),/Pet Shop of Horrors/);
  assert.equal(report.cases[0].steps[0].answerPass,null,
    "Screened excerpts never automatically certify reply accuracy");
});

test("Live report preserves normalized measurements and typed authors/directors without marking answers fact-checked",async()=>{
  const details=[{
    source:1,title:"The Hollow Places",creator:"T. Kingfisher",
    identityQuote:"The Hollow Places was written by T. Kingfisher.",
    fitQuote:"The Hollow Places is an atmospheric horror novel.",
    measurements:[{source:1,value:190,unit:"pages",
      quote:"The Hollow Places has 190 pages in this edition."}],
    relations:[{role:"author",name:"T. Kingfisher",source:1,
      quote:"The Hollow Places was written by T. Kingfisher."}]
  }];
  const report=await runBrainEvaluation({
    scenarios:[byId("discovery-book")],mode:"live",model:"fixture",
    repetitions:1,liveWeb:true,
    planWeb:async()=>({search:true,query:"short atmospheric horror books",
      reason:"Public discovery"}),
    infer:async({researchQuery})=>({
      text:"The Hollow Places is a possible title [1].",
      webExecution:{query:researchQuery,results:[{title:"Book catalog",
        url:"https://example.org/book",engine:"test",content:"book evidence"}],
        sourcesCarriedOver:false,researchAudit:{
          status:"shortlist",accepted:1,rejected:0,elapsedMs:300,note:"Structural proof",
          recommendationTask:true,recommendationApproved:["The Hollow Places"],
          recommendationRejected:1,constraintsChecked:1,featuresChecked:0,
          exclusionsChecked:0,relationsChecked:1,recommendationDetails:details
        }}
    })
  });
  const first=report.cases[0].steps[0];
  assert.equal(first.webExecution.researchAudit.recommendationDetails[0].relations[0].role,"author");
  assert.equal(first.webExecution.researchAudit.recommendationDetails[0].measurements[0].value,190);
  assert.ok(brainEvalMetrics(report).attributedRoles>=1);
  assert.match(brainEvalMarkdown(report),/Attribution \[1\]: author = T\. Kingfisher/);
  assert.equal(first.answerPass,null);
  assert.equal(first.reviewRequired,true);
});

test("Live research carries the previous public result into a focused verification",async()=>{
  const title = "Lantern Harbor";
  const limit = {quote:"under two hours",relation:"lt",limit:2,unit:"hours"};
  const discovery = {kind:"discover",requirements:[limit],roles:[],exclude:[]};
  const verification = {kind:"verify",subject:title,requirements:[limit],
    roles:["director","studio"],exclude:[]};
  const report = await runBrainEvaluation({
    scenarios:[byId("verification-movie-runtime")],mode:"live",model:"fixture-model",
    repetitions:1,liveWeb:true,build:"test-build",
    planWeb:async(_question,previous,context)=>{
      if(!previous.length) return {
        search:true,query:"creepy animated films",task:discovery,reason:"Find a film"
      };
      assert.deepEqual(context.publicSubjects,[title]);
      assert.ok(context.publicAnswer.includes(title));
      assert.equal(context.activePublicQuery,"creepy animated films");
      return {search:true,query:title+" director production company",task:verification,
        reason:"Check details for the previously suggested film"};
    },
    infer:async({researchQuery,researchTask,stepIndex})=>{
      assert.deepEqual(researchTask,stepIndex===0 ? discovery : verification);
      if(stepIndex===1) assert.equal(researchQuery,title+" director production company");
      return {
        text:title,
        webExecution:{
          query:researchQuery,results:[{title,url:"https://example.org/film",
            content:"Catalog entry",engine:"fixture"}],sourcesCarriedOver:false,
          researchAudit:{status:"shortlist",accepted:1,rejected:0,elapsedMs:0,
            note:"fixture",taskKind:researchTask.kind,taskSubject:researchTask.subject,
            recommendationApproved:[title]}
        }
      };
    }
  });
  assert.equal(report.build,"test-build");
  assert.match(brainEvalMarkdown(report),/Research task: verify \| Lantern Harbor/);
});

test("the local planner also supplies the task for a pre-routed search",async()=>{
  const task={kind:"discover",requirements:[
    {quote:"fewer than ten songs",relation:"lt",limit:10,unit:"songs"}
  ],roles:["artist"],exclude:[]};
  let observed=false;
  const report=await runBrainEvaluation({
    scenarios:[byId("verification-album-songs")],mode:"live",model:"fixture-model",
    repetitions:1,liveWeb:true,
    planWeb:async()=>({search:true,query:"moody metal albums under ten tracks",task,reason:"Find fitting albums"}),
    infer:async({stepIndex,researchQuery,researchTask})=>{
      if(stepIndex===0){
        observed=true;
        assert.equal(researchQuery,"moody metal albums under ten tracks");
        assert.deepEqual(researchTask,task);
      }
      return "A sourced album.";
    }
  });
  assert.equal(report.cases[0].steps[0].actualRoute,"research");
  assert.equal(observed,true);
  assert.equal(report.cases[0].steps[0].error,undefined);
});
