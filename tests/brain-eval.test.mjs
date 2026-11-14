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
  assert.equal(EVAL_SCENARIOS.length,73);
  assert.equal(brainScenarioNumber(EVAL_SCENARIOS[0].id),1);
  assert.equal(brainScenarioNumber(EVAL_SCENARIOS[72].id),73);
  assert.match(brainScenarioLabel(EVAL_SCENARIOS[0].id,EVAL_SCENARIOS[0].label),/^#01 · /);
  assert.match(brainScenarioLabel(EVAL_SCENARIOS[72].id,EVAL_SCENARIOS[72].label),/^#73 · /);
  assert.equal(brainScenarioLabel("not-in-catalog","Custom test"),"Custom test");
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
    "discovery-tech-tool","discovery-book"].map(byId);
  const calls=[];
  const result=await runBrainEvaluation({
    scenarios:selected,mode:"live",model:"fixture-model",repetitions:1,
    planWeb:async(question,previous)=>{
      calls.push({question,previous});
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
test("web-planning context is isolated per scenario and explicit research opt-outs remain local",async()=>{
  const chosen=[byId("discovery-wish-but-no-recommendations"),
    byId("discovery-wish-not-a-search"),byId("discovery-bands-just-gushing")];
  const calls=[];
  const report=await runBrainEvaluation({
    scenarios:chosen,mode:"live",model:"fixture-model",repetitions:1,
    planWeb:async(question,previous)=>{
      calls.push({question,previous});
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
