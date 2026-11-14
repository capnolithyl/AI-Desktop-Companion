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
