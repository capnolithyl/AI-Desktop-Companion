import { useMemo, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, BrainCircuit, Download, Play, Square, RotateCw, CheckCircle2, XCircle } from "lucide-react";
import type { Settings } from "./storage";
import { EVAL_SCENARIOS, brainEvalMetrics, brainEvalMarkdown, brainScenarioLabel, type EvalMode } from "./brain-eval";
import {
  subscribeBrainEval, getBrainEvalStatus, getBrainEvalReport, brainEvalHistory,
  clearBrainEvalHistory, startBrainEvaluation, stopBrainEvaluation,
  getBrainEvalCaseRecords, brainEvalEnvironment, reviewBrainEvalScenario
} from "./brain-eval-manager";
import {
  statusForScenario,summarizeCaseStatuses,type BrainCaseStatus
} from "./brain-eval-status";
import "./brain-eval.css";

function formatMs(value:number):string{return value>=1000?(value/1000).toFixed(1)+"s":value+"ms"}
const groups=Array.from(new Set(EVAL_SCENARIOS.map(s=>s.group)));
const totalFixtureTurns=EVAL_SCENARIOS.reduce((n,s)=>n+s.steps.length,0);

export function BrainEvalPanel({settings}:{settings:Settings}){
  const [mode,setMode]=useState<EvalMode>("routing");
  const [category,setCategory]=useState("All categories");
  const [statusFilter,setStatusFilter]=useState<"all"|BrainCaseStatus>("all");
  const [search,setSearch]=useState("");
  const [selectedIds,setSelectedIds]=useState<ReadonlySet<string>>(
    ()=>new Set(EVAL_SCENARIOS.map(s=>s.id))
  );
  const [repeats,setRepeats]=useState(1);
  const [message,setMessage]=useState("");
  const runtime=useSyncExternalStore(subscribeBrainEval,getBrainEvalStatus,getBrainEvalStatus);
  const report=getBrainEvalReport();
  const history=brainEvalHistory();
  const busy=runtime.phase==="running";
  const progress={done:runtime.done,total:runtime.total,label:runtime.label};
  const records=getBrainEvalCaseRecords();
  const environment=brainEvalEnvironment(mode,settings.model);
  const statuses=useMemo(()=>
    new Map(EVAL_SCENARIOS.map(s=>[s.id,statusForScenario(s,records,environment)])),
    [records,mode,settings.model]
  );
  const totals=summarizeCaseStatuses(EVAL_SCENARIOS,records,environment);
  const searchTerm=search.trim().toLocaleLowerCase();
  const visible=EVAL_SCENARIOS.filter(s=>
    (category==="All categories"||s.group===category)&&
    (statusFilter==="all"||statuses.get(s.id)?.status===statusFilter)&&
    (!searchTerm||[s.id,s.group,brainScenarioLabel(s.id,s.label)]
      .some(value=>value.toLocaleLowerCase().includes(searchTerm)))
  );
  const selected=EVAL_SCENARIOS.filter(s=>selectedIds.has(s.id));
  const toggle=(id:string,checked:boolean)=>setSelectedIds(previous=>{
    const next=new Set(previous);
    if(checked)next.add(id);else next.delete(id);
    return next;
  });
  const selectOnly=(ids:ReadonlyArray<string>)=>setSelectedIds(new Set(ids));
  const unresolved=new Set<BrainCaseStatus>(["failed","review","incomplete","untested","stale"]);
  const selectUnresolved=()=>selectOnly(EVAL_SCENARIOS
    .filter(s=>unresolved.has(statuses.get(s.id)!.status)).map(s=>s.id));
  const selectRegression=()=>{
    const passed=EVAL_SCENARIOS.filter(s=>statuses.get(s.id)?.status==="passed");
    // A stable sample across groups, even as the scenario catalog grows.
    const sample=passed.filter((_,i)=>i%7===0);
    selectOnly(sample.map(s=>s.id));
  };
  const metrics=report?brainEvalMetrics(report):null;
  const previousRun=history.find(h=>h.id!==report?.runId)??null;

  function run(){
    try{
      startBrainEvaluation(settings,{
        mode,repetitions:repeats,scenarioIds:selected.map(s=>s.id)
      });
      setMessage("Running independently from Settings. You may close this panel or browser.");
    }catch(error){setMessage("Could not start: "+String(error))}
  }
  function stop(){
    stopBrainEvaluation();
    setMessage("Requested cancellation.");
  }
  async function exportReport(){
    if(!report)return;
    try{
      const path=await invoke<string>("brain_eval_export",{
        jsonReport:JSON.stringify(report,null,2),markdownReport:brainEvalMarkdown(report)
      });
      setMessage("Saved JSON + Markdown reports to "+path);
    }catch(error){setMessage("File export failed: "+String(error))}
  }
  async function copyMarkdown(){
    if(!report)return;
    try{await navigator.clipboard.writeText(brainEvalMarkdown(report));setMessage("Readable Markdown report copied.")}
    catch(error){setMessage("Clipboard unavailable: "+String(error))}
  }

  return <div className="brain-eval-panel">
    <div className="settings-section-title"><BrainCircuit size={17}/> Brain lab · P0 reliability</div>
    <details className="brain-eval-explainer">
      <summary>What Brain Lab tests <span>Isolated synthetic scenarios · no real tool calls</span></summary>
      <p>Brain Lab tests Mikan's routing and local model using synthetic facts.
        Fast mode doesn't call Ollama; Live mode calls the configured local model.
        Neither mode performs real web searches or writes to saved memories.
        This is a diagnostic harness, not a full end-to-end production test.</p>
    </details>
    <div className="brain-eval-toolbar">
      <label>Test mode
        <select value={mode} disabled={busy} onChange={e=>setMode(e.target.value as EvalMode)}>
          <option value="routing">Fast · production routing and lexical recall</option>
          <option value="live">Live · routing + local model conversation</option>
        </select>
      </label>
      <label>Category
        <select value={category} disabled={busy} onChange={e=>setCategory(e.target.value)}>
          <option>All categories</option>
          {groups.map(group=><option key={group}>{group}</option>)}
        </select>
      </label>
      <label>Show status
        <select value={statusFilter} disabled={busy}
          onChange={e=>setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">All statuses</option>
          <option value="failed">Failed</option>
          <option value="review">Needs review</option>
          <option value="stale">Stale / newer build</option>
          <option value="untested">Never tested</option>
          <option value="incomplete">Incomplete</option>
          <option value="passed">Passed</option>
        </select>
      </label>
      <label>Repeat each scenario
        <select value={repeats} disabled={busy} onChange={e=>setRepeats(Number(e.target.value))}>
          {[1,2,3,5].map(n=><option key={n} value={n}>{n}×</option>)}
        </select>
      </label>
      <label className="brain-eval-find">Find scenario
        <input type="search" value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="Search #65, anime, singer…" aria-label="Find Brain Lab scenario" />
      </label>
    </div>
    <div className="brain-eval-status-summary">
      {(["passed","failed","review","stale","untested","incomplete"] as const).map(status=>
        <span className={"brain-eval-status "+status} key={status}>{status}: {totals[status]}</span>
      )}
    </div>
    {totals.stale>0&&<p className="brain-eval-muted-note">
      Stale means tested with an older build or fixture. Those are previous results, not new failures.
    </p>}
    <div className="brain-eval-select-actions">
      <button type="button" disabled={busy} onClick={()=>selectOnly(visible.map(s=>s.id))}>Select visible ({visible.length})</button>
      <button type="button" disabled={busy} onClick={selectUnresolved}>Select unresolved</button>
      <button type="button" disabled={busy} onClick={selectRegression}>Passed regression sample</button>
      <button type="button" disabled={busy} onClick={()=>selectOnly([])}>Clear selection</button>
    </div>
    <div className="brain-eval-actions brain-eval-actionbar">
      <button type="button" className="save-button" disabled={busy||selected.length===0} onClick={()=>void run()}>
        <Play size={15}/> Run {selected.length} scenarios ({selected.reduce((n,s)=>n+s.steps.length,0)*repeats} turns)
      </button>
      {busy&&<button type="button" className="secondary-action" onClick={stop}><Square size={14}/> Stop</button>}
      {report&&<button type="button" className="secondary-action" onClick={()=>void exportReport()}>
        <Download size={15}/> Export JSON + Markdown
      </button>}
      {report&&<button type="button" className="secondary-action" onClick={()=>void copyMarkdown()}>Copy readable report</button>}
    </div>
    <div className="brain-eval-catalog-header">
      <strong>Scenarios</strong>
      <span>Showing {visible.length} of {EVAL_SCENARIOS.length} · {selected.length} selected</span>
    </div>
    <div className="brain-eval-catalog" role="group" aria-label="Select Brain Lab scenarios">
      {visible.length===0&&<p className="brain-eval-subtitle">No scenarios match this filter.</p>}
      {visible.map(s=>{
        const view=statuses.get(s.id)!;
        return <div className="brain-eval-test-row" key={s.id}>
          <label title={s.note??s.group}>
            <input type="checkbox" checked={selectedIds.has(s.id)} disabled={busy}
              onChange={e=>toggle(s.id,e.target.checked)} />
            <span><strong>{brainScenarioLabel(s.id,s.label)}</strong><small>{s.group} · {s.steps.length} turns
              {view.record?(" · Last: "+new Date(view.record.at).toLocaleString()+
                " · "+view.record.repetitions+"×"):""}</small></span>
          </label>
          <span className={"brain-eval-status "+view.status}>{view.status}
            {view.status==="stale"&&view.previous?" ("+view.previous+")":""}</span>
          {view.status==="review"&&<div className="brain-eval-review-actions">
            <button type="button" disabled={busy}
              onClick={()=>{try{reviewBrainEvalScenario(s.id,mode,settings.model,"passed")}
                catch(error){setMessage(String(error))}}}>Approve</button>
            <button type="button" disabled={busy}
              onClick={()=>{try{reviewBrainEvalScenario(s.id,mode,settings.model,"failed")}
                catch(error){setMessage(String(error))}}}>Fail</button>
          </div>}
        </div>;
      })}
    </div>
    <p className="brain-eval-muted-note">
      Catalog: {EVAL_SCENARIOS.length} scenarios, {totalFixtureTurns} turns. Use the category, status or search filters to narrow the list.
    </p>
    {busy&&<div className="brain-eval-progress" role="status">
      <progress max={Math.max(1,progress.total)} value={progress.done}/>
      <span>{progress.done}/{progress.total} turns · {progress.label}</span>
    </div>}
    {(message||runtime.error||busy||runtime.phase==="complete"||runtime.phase==="stopped")&&
      <p className="brain-eval-message" role="status">
        {runtime.error??message??runtime.label}
        {runtime.savedFolder?" · Automatically saved: "+runtime.savedFolder:""}
      </p>}
    {metrics&&report&&<>
      <div className="settings-section-title"><Activity size={17}/> Results dashboard</div>
      <div className="brain-eval-metrics">
        {([
          ["No detected failures",metrics.passRate+"%",metrics.passed+"/"+metrics.turns+" turns, includes unverified"],
          ["Verified checks",metrics.verifiedPassRate+"%",metrics.verifiedPassed+"/"+metrics.turns+" turns"],
          ["Exact route labels",metrics.routes+"%","diagnostic; labels alone don't fail a test"],
          ["Functional routing",metrics.behavioralRouting+"%","search-intent behavior"],
          ["Web decisions",metrics.webAgreement+"%",metrics.webChecks+" observed · "+metrics.unnecessaryWeb+" extra · "+metrics.missedWeb+" missed"],
          ["Memory fact coverage",metrics.recall+"%",metrics.memoryRecordMisses+" exact row misses · "+
            metrics.memoryDistractors+" extra records"],
          ["Factual answers",metrics.answers===null?"Not run":metrics.answers+"%",metrics.answerChecks+" graded turns"],
          ["Conversation reviews",String(metrics.reviewTurns),metrics.qualityFlagTurns+" potential quality warnings"],
          ["Model speed",metrics.tokensPerSecond===null?"Not measured":metrics.tokensPerSecond+" tok/s","generation only"],
          ["Elapsed",formatMs(metrics.elapsedMs),metrics.cases+" scenario runs"]
        ] as const).map(([label,value,note])=><div key={label} className="brain-eval-metric">
          <span>{label}</span><strong>{value}</strong><small>{note}</small>
        </div>)}
      </div>
      {previousRun&&<p className="brain-eval-subtitle">
        Previous run: {previousRun.passRate}% ({previousRun.model}, {previousRun.mode})
        {previousRun.mode===report.mode?" · change "+(metrics.passRate-previousRun.passRate>=0?"+":"")+
          (metrics.passRate-previousRun.passRate).toFixed(1)+" points":" · different mode, not directly comparable"}.
      </p>}
      <div className="brain-eval-groups">
        {Array.from(new Set(report.cases.map(c=>c.group))).map(group=>{
          const cases=report.cases.filter(c=>c.group===group);
          const turns=cases.flatMap(c=>c.steps);
          const passed=turns.filter(t=>t.pass).length;
          return <div className="brain-eval-group" key={group}>
            <span>{group}</span>
            <div className="brain-eval-bar"><span style={{width:(turns.length?passed/turns.length*100:0)+"%"}}/></div>
            <strong>{passed}/{turns.length}</strong>
          </div>
        })}
      </div>
      {report.mode==="live" && metrics.reviewTurns>0&&
        <p className="brain-eval-message">
          {metrics.reviewTurns} conversational replies require qualitative review.
          Automated routing and memory checks may pass even when a reply is awkward or irrelevant.
          Open the scenario traces to compare the model response with each conversation goal.
        </p>}
      <div className="settings-section-title">Scenario traces</div>
      <div className="brain-eval-traces">
        {report.cases.map((test,index)=><details className="service-panel" key={test.id+"-"+test.repeat}
          open={(!test.pass||test.steps.some(step=>step.reviewRequired))&&index<5}>
          <summary className="brain-eval-summary">
            {!test.pass?<XCircle size={16}/>:test.steps.some(step=>step.reviewRequired)
              ?<Activity size={16}/>:<CheckCircle2 size={16}/>}
            <strong>{brainScenarioLabel(test.id,test.label)}</strong>
            <span>{test.pass&&test.steps.some(step=>step.reviewRequired)?"REVIEW · ":""}
              Run {test.repeat} · {test.steps.filter(s=>s.pass).length}/{test.steps.length} · {formatMs(test.elapsedMs)}</span>
          </summary>
          {test.steps.map((step,i)=><div className="brain-eval-step" key={i}>
            <div><strong>{i+1}. {step.user}</strong>
              <span className={!step.pass?"brain-eval-bad":step.reviewRequired?"brain-eval-review":"brain-eval-ok"}>
                {!step.pass?"FAIL":step.reviewRequired?"REVIEW":"PASS"}
              </span></div>
            {step.expected.conversationGoal&&<small className="brain-eval-goal">
              Review goal: {step.expected.conversationGoal}
            </small>}
            <small>Route {step.actualRoute} (expected label {step.expected.route??"any"};
              exact {step.routeLabelMatch?"matched":"different, informational"});
              predicted web {step.plannedWeb===null?"unobserved":String(step.plannedWeb)};
              expected {step.expected.web??(step.expected.route==="research"?true:step.expected.route==="chat"?false:"unspecified")};
              planner {step.webPlannerDecision?.search?"requested":step.webPlannerDecision?"skipped":"not run"}</small>
            <small>Memory IDs selected: {step.selectedMemoryIds.join(", ")||"none"};
              uncovered facts: {step.missingMemoryIds.join(", ")||"none"};
              raw missing IDs: {step.missingMemoryRecordIds?.join(", ")||"none"};
              unrelated records: {step.distractorMemoryIds?.join(", ")||"none"};
              explicitly excluded: {step.unexpectedMemoryIds.join(", ")||"none"}</small>
            {!!step.memoryEvidence?.length &&<small>Evidence: {step.memoryEvidence
              .map(e=>"#"+e.expectedId+" supplied by "+(e.supportingIds.join(", ")||"nothing"))
              .join("; ")}</small>}
            {step.answer&&<p className="brain-eval-answer">{step.answer}</p>}
            {step.inferenceStats&&<small>Model: {step.modelUsed??"local"} · output {step.inferenceStats.outputTokens??"?"} tokens ·
              generation {(step.inferenceStats.evalDurationNs??0)>0?
                ((step.inferenceStats.outputTokens??0)*1e9/(step.inferenceStats.evalDurationNs??1)).toFixed(1)+" tok/s":"n/a"}</small>}
            {step.answerFailures.map(reason=><small className="field-error" key={reason}>{reason}</small>)}
            {step.qualityFlags?.map(flag=><small className="brain-eval-review" key={flag}>
              Review warning: {flag}
            </small>)}
            {step.error&&<small className="field-error">{step.error}</small>}
          </div>)}
        </details>)}
      </div>
    </>}
    <details className="brain-eval-explainer">
      <summary>How to interpret the scores <span>Read before approving tests</span></summary>
      <p><strong>Fast:</strong> deterministic routing and lexical memory selection, no LLM.
        <strong> Live:</strong> local Ollama plus simulated web planning, without real external searches or memory writes.</p>
      <p>Unobserved decisions are not verified. Natural conversations require human review, and
        factual checks are phrase/concept heuristics rather than a semantic judge.
        Exact route labels and memory-row IDs are diagnostic, not proof of a bad response.</p>
      <p>Repeated runs measure variability. Test results are scoped to the model, mode, build and
        scenario definition; unselected results remain intact. Reports are saved automatically
        on your PC, and browser-triggered runs continue after closing the tab.</p>
    </details>
    {history.length>0&&<details className="service-panel">
      <summary><strong>Previous run history ({history.length})</strong></summary>
      {history.map(item=><div className="brain-eval-history" key={item.id}>
        <span>{new Date(item.at).toLocaleString()} · {item.mode} · {item.model}</span>
        <strong>{item.passRate}%</strong>
      </div>)}
      <button type="button" className="secondary-action" onClick={clearBrainEvalHistory}>
        <RotateCw size={14}/> Clear local history
      </button>
    </details>}
  </div>;
}
