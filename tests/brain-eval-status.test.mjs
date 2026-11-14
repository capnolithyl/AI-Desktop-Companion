import test from "node:test";
import assert from "node:assert/strict";
import {
  caseGrade,fixtureHash,gradeReportCases,parseCaseRecords,mergeCaseRecords,
  statusForScenario,summarizeCaseStatuses
} from "../src/brain-eval-status.ts";

const scenario={
  id:"context-followup",label:"Context follow-up",group:"Branching context",
  steps:[{user:"Who sings for them?",expect:{conversationGoal:"Follow prior musical referent"}}]
};
const step=(pass=true,reviewRequired=false)=>({pass,reviewRequired});
const single=(pass=true,reviewRequired=false)=>({
  id:scenario.id,repeat:1,label:scenario.label,group:scenario.group,
  pass,elapsedMs:1,steps:[step(pass,reviewRequired)]
});
const report=(cases,attempts=1)=>({
  version:1,runId:"eval-12345-abcde",startedAt:"2026-11-14T20:00:00Z",
  finishedAt:"2026-11-14T20:10:00Z",mode:"live",model:"qwen3.5:9b",
  attempts,scenarios:[scenario.id],environment:"isolated-synthetic",
  liveWebEnabled:false,writesToRealMemories:false,cases
});
const env=(build="0.9.8+abc")=>({mode:"live",model:"qwen3.5:9b",build});

test("per-scenario grade never treats unreviewed dialogue as passed",()=>{
  assert.equal(caseGrade([single(true,true)],1,1),"review");
  assert.equal(caseGrade([single(false,true)],1,1),"failed");
  assert.equal(caseGrade([single(true,false)],1,1),"passed");
  assert.equal(caseGrade([single(true,false)],1,2),"incomplete");
  assert.equal(caseGrade([{...single(),steps:[]}],1,1),"incomplete");
});
test("missing web-planner evidence cannot be approved into a false green pass",()=>{
  const unobserved={...single(true,true),
    steps:[{...step(true,true),webPass:null,expected:{web:true,route:"any"}}]};
  assert.equal(caseGrade([unobserved],1,1),"incomplete");
  const observed={...single(true,true),
    steps:[{...step(true,true),webPass:true,expected:{web:true,route:"any"}}]};
  assert.equal(caseGrade([observed],1,1),"review");
});

test("all repetitions must pass or the scenario remains failed",()=>{
  assert.equal(caseGrade([single(),{...single(false),repeat:2}],1,2),"failed");
  assert.equal(caseGrade([single(),{...single(true,true),repeat:2}],1,2),"review");
  assert.equal(caseGrade([single(),{...single(),repeat:2}],1,2),"passed");
});
test("updates apply only to rerun scenarios without erasing previous results",()=>{
  const existing=gradeReportCases(report([single()]),[scenario],"0.9.8+abc");
  const other={...existing[0],id:"unrelated-case",grade:"failed"};
  const updates=gradeReportCases(report([single(false)]),[scenario],"0.9.8+abc");
  const combined=mergeCaseRecords([other,...existing],updates);
  assert.equal(combined.length,2);
  assert.equal(combined.find(x=>x.id===scenario.id).grade,"failed");
  assert.equal(combined.find(x=>x.id==="unrelated-case").grade,"failed");
});
test("new build, model and test fixtures invalidate earlier passes",()=>{
  const stored=gradeReportCases(report([single()]),[scenario],"0.9.8+abc");
  assert.equal(statusForScenario(scenario,stored,env()).status,"passed");
  const stale=statusForScenario(scenario,stored,env("0.9.8+different"));
  assert.equal(stale.status,"stale");
  assert.equal(stale.previous,"passed");
  assert.equal(statusForScenario(scenario,stored,{...env(),model:"another-model"}).status,"untested");
  assert.equal(statusForScenario(scenario,stored,{...env(),mode:"routing"}).status,"untested");
  const changed={...scenario,steps:[{user:"A different question",expect:{route:"chat"}}]};
  assert.notEqual(fixtureHash(changed),fixtureHash(scenario));
  assert.equal(statusForScenario(changed,stored,env()).status,"stale");
});
test("human reviews are separate from automatic factual checks",()=>{
  const pending=gradeReportCases(report([single(true,true)]),[scenario],"0.9.8+abc");
  assert.equal(statusForScenario(scenario,pending,env()).status,"review");
  const approved=[{...pending[0],reviewed:"passed"}];
  assert.equal(statusForScenario(scenario,approved,env()).status,"passed");
  const rejected=[{...pending[0],reviewed:"failed"}];
  assert.equal(statusForScenario(scenario,rejected,env()).status,"failed");
  assert.equal(statusForScenario(scenario,rejected,env("0.9.9+new")).status,"stale");
});
test("malformed persisted records are discarded rather than trusted",()=>{
  const valid=gradeReportCases(report([single()]),[scenario],"0.9.8+abc");
  assert.deepEqual(parseCaseRecords([{},null,{...valid[0],grade:"green"},valid[0]]),valid);
});
test("dashboard summary separates passed, failed, review, stale, untested",()=>{
  const a=gradeReportCases(report([single()]),[scenario],"0.9.8+abc")[0];
  const scenarios=[scenario,
    {...scenario,id:"failed"},
    {...scenario,id:"review"},
    {...scenario,id:"old"},
    {...scenario,id:"untested"}
  ];
  const records=[
    a,{...a,id:"failed",grade:"failed"},
    {...a,id:"review",grade:"review"},
    {...a,id:"old",build:"0.9.7+old"}
  ];
  const counts=summarizeCaseStatuses(scenarios,records,env());
  assert.deepEqual(counts,{
    passed:1,failed:1,review:1,incomplete:0,untested:1,stale:1
  });
});
