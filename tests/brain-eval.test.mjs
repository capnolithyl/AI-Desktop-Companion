import test from "node:test";
import assert from "node:assert/strict";
import {
  EVAL_FACTS,EVAL_SCENARIOS,runBrainEvaluation,brainEvalMetrics,
  brainEvalMarkdown,sameMeaning,scoreAnswer
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
