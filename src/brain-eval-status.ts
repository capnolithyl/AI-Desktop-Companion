/**
 * Branching Brain Lab scenario outcomes, deliberately independent of any
 * particular user prompt, routing pattern, model provider or storage engine.
 *
 * A "passed" evaluation is only valid for the same model + mode + app build +
 * scenario definition. Ambiguous conversational turns need a human review;
 * they never silently turn green because the model produced nonempty text.
 */
import type { EvalCaseResult, EvalMode, EvalReport, EvalScenario } from "./brain-eval.ts";

export type BrainCaseGrade="passed"|"failed"|"review"|"incomplete";
export type BrainCaseStatus=BrainCaseGrade|"untested"|"stale";
export type BrainCaseRecord={
  id:string;mode:EvalMode;model:string;build:string;fixtureHash:string;
  grade:BrainCaseGrade; reviewed?:"passed"|"failed";
  runId:string;at:string;repetitions:number;executed:number;
  checksPassed:number;checksTotal:number;needsReview:boolean;
};
export type BrainCaseView={
  id:string;status:BrainCaseStatus;previous:BrainCaseGrade|null;
  record:BrainCaseRecord|null;
};
export type BrainCaseEnvironment={mode:EvalMode;model:string;build:string};

const MAX_RECORDS=600;
function isGrade(value:unknown):value is BrainCaseGrade{
  return value==="passed"||value==="failed"||value==="review"||value==="incomplete";
}
export function fixtureHash(scenario:EvalScenario):string{
  // Not cryptographic. Protects previous results when wording/expectations change.
  const source=JSON.stringify({steps:scenario.steps,group:scenario.group});
  let hash=2166136261;
  for(let i=0;i<source.length;i++){
    hash=Math.imul(hash ^ source.charCodeAt(i),16777619)>>>0;
  }
  return hash.toString(16).padStart(8,"0");
}
export function caseGrade(
  cases:ReadonlyArray<EvalCaseResult>,expectedTurns:number,expectedRepetitions:number
):BrainCaseGrade{
  if(cases.length!==expectedRepetitions ||
    cases.some(c=>c.steps.length!==expectedTurns))return "incomplete";
  if(cases.some(c=>!c.pass || c.steps.some(s=>!s.pass)))return "failed";
  if(cases.some(c=>c.steps.some(s=>s.reviewRequired)))return "review";
  return "passed";
}
export function gradeReportCases(
  report:EvalReport,scenarios:ReadonlyArray<EvalScenario>,build:string
):BrainCaseRecord[]{
  const byId=new Map(scenarios.map(s=>[s.id,s]));
  return report.scenarios.flatMap(id=>{
    const scenario=byId.get(id);
    const cases=report.cases.filter(c=>c.id===id);
    if(!scenario||!cases.length)return [];
    const steps=cases.flatMap(c=>c.steps);
    return [{
      id,model:report.model,mode:report.mode,build,
      fixtureHash:fixtureHash(scenario),grade:caseGrade(cases,scenario.steps.length,report.attempts),
      runId:report.runId,at:report.finishedAt,repetitions:report.attempts,executed:cases.length,
      checksPassed:steps.filter(s=>s.pass).length,checksTotal:steps.length,
      needsReview:steps.some(s=>s.reviewRequired)
    }];
  });
}
export function parseCaseRecords(input:unknown):BrainCaseRecord[]{
  if(!Array.isArray(input))return [];
  return input.slice(0,MAX_RECORDS).filter((x):x is BrainCaseRecord=>{
    const r=x as BrainCaseRecord|null;
    return !!r&&typeof r==="object" &&
      typeof r.id==="string"&&/^[a-z0-9-]{1,90}$/.test(r.id) &&
      (r.mode==="routing"||r.mode==="live") &&
      typeof r.model==="string"&&r.model.length<=150 &&
      typeof r.build==="string"&&r.build.length<=150 &&
      typeof r.fixtureHash==="string"&&/^[0-9a-f]{8}$/.test(r.fixtureHash) &&
      isGrade(r.grade)&&typeof r.runId==="string"&&r.runId.length<=100 &&
      typeof r.at==="string"&&r.at.length<=40 &&
      Number.isSafeInteger(r.repetitions)&&r.repetitions>=1&&r.repetitions<=5 &&
      Number.isSafeInteger(r.executed)&&r.executed>=1&&r.executed<=5 &&
      Number.isSafeInteger(r.checksPassed)&&r.checksPassed>=0 &&
      Number.isSafeInteger(r.checksTotal)&&r.checksTotal>=0 &&
      typeof r.needsReview==="boolean" &&
      (r.reviewed===undefined||r.reviewed==="passed"||r.reviewed==="failed");
  });
}
export function mergeCaseRecords(
  prior:ReadonlyArray<BrainCaseRecord>,updates:ReadonlyArray<BrainCaseRecord>
):BrainCaseRecord[]{
  const items=[...updates,...prior];
  const seen=new Set<string>();
  return items.filter(record=>{
    const key=record.id+"|"+record.mode+"|"+record.model;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  }).slice(0,MAX_RECORDS);
}
export function statusForScenario(
  scenario:EvalScenario,records:ReadonlyArray<BrainCaseRecord>,env:BrainCaseEnvironment
):BrainCaseView{
  const record=records.find(r=>r.id===scenario.id&&r.mode===env.mode&&r.model===env.model)??null;
  if(!record)return {id:scenario.id,status:"untested",previous:null,record:null};
  const prior=record.grade==="review"&&record.reviewed ? record.reviewed:record.grade;
  const stale=record.build!==env.build||record.fixtureHash!==fixtureHash(scenario);
  return {id:scenario.id,status:stale?"stale":prior,previous:prior,record};
}
export function summarizeCaseStatuses(
  scenarios:ReadonlyArray<EvalScenario>,records:ReadonlyArray<BrainCaseRecord>,env:BrainCaseEnvironment
){
  const items=scenarios.map(s=>statusForScenario(s,records,env));
  const counts={passed:0,failed:0,review:0,incomplete:0,untested:0,stale:0};
  for(const item of items)counts[item.status]++;
  return counts;
}
