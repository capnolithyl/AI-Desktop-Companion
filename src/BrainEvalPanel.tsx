import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, BrainCircuit, Download, Play, Square, RotateCw, CheckCircle2, XCircle, FolderOpen } from "lucide-react";
import type { Settings } from "./storage";
import { EVAL_SCENARIOS, brainEvalMetrics, brainEvalMarkdown, brainScenarioLabel, type EvalMode } from "./brain-eval";
import {
  subscribeBrainEval, getBrainEvalStatus, getBrainEvalReport, getBrainEvalModelReport, brainEvalHistory,
  clearBrainEvalHistory, startBrainEvaluation, stopBrainEvaluation,
  getBrainEvalCaseRecords, brainEvalEnvironment, reviewBrainEvalScenario
} from "./brain-eval-manager";
import {
  statusForScenario,summarizeCaseStatuses,type BrainCaseStatus
} from "./brain-eval-status";
import {
  readBrainEvalPresets,persistBrainEvalPresets,upsertBrainEvalPreset,
  removeBrainEvalPreset,type BrainEvalPresetConfig
} from "./brain-eval-presets";
import "./brain-eval.css";

function formatMs(value:number):string{return value>=1000?(value/1000).toFixed(1)+"s":value+"ms"}
const groups=Array.from(new Set(EVAL_SCENARIOS.map(s=>s.group)));
const totalFixtureTurns=EVAL_SCENARIOS.reduce((n,s)=>n+s.steps.length,0);

export function BrainEvalPanel({settings,availableModels}:{settings:Settings;availableModels:readonly string[]}){
  const [mode,setMode]=useState<EvalMode>("routing");
  const [researchMode,setResearchMode]=useState<Settings["researchMode"]>(settings.researchMode);
  const [mikanifyAnswer,setMikanifyAnswer]=useState(settings.mikanifyAnswer);
  const [presets,setPresets]=useState(readBrainEvalPresets);
  const [presetName,setPresetName]=useState("");
  const [presetChoice,setPresetChoice]=useState("");
  const [category,setCategory]=useState("All categories");
  const [statusFilter,setStatusFilter]=useState<"all"|BrainCaseStatus>("all");
  const [search,setSearch]=useState("");
  const [selectedIds,setSelectedIds]=useState<ReadonlySet<string>>(
    ()=>new Set(EVAL_SCENARIOS.map(s=>s.id))
  );
  const [repeats,setRepeats]=useState(1);
  const [viewModel,setViewModel]=useState("");
  const [selectedModels,setSelectedModels]=useState<ReadonlySet<string>>(()=>new Set([settings.model]));
  const localModels=[...new Set([settings.model,...availableModels])];
  const modelsToRun=mode==="live"?localModels.filter(model=>selectedModels.has(model)): [settings.model];
  const [numberSelection,setNumberSelection]=useState("");
  const [numberFeedback,setNumberFeedback]=useState("Enter scenario numbers such as 20, 21, 83.");
  const [catalogOpen,setCatalogOpen]=useState(true);
  const [message,setMessage]=useState("");
  const [lastExportFolder,setLastExportFolder]=useState<string|null>(null);
  const resultsRef=useRef<HTMLDivElement>(null);
  const runtime=useSyncExternalStore(subscribeBrainEval,getBrainEvalStatus,getBrainEvalStatus);
  const report=(viewModel?getBrainEvalModelReport(viewModel):null)??getBrainEvalReport();
  const history=brainEvalHistory();
  const busy=runtime.phase==="running";
  const progress={done:runtime.done,total:runtime.total,label:runtime.label};
  const reportFolder=runtime.savedFolder??lastExportFolder;
  const progressPercent=progress.total>0
    ?Math.round(Math.min(progress.done,progress.total)/progress.total*100):0;
  const records=getBrainEvalCaseRecords();
  const environment=brainEvalEnvironment(mode,viewModel||settings.model,researchMode,mikanifyAnswer);
  const statuses=useMemo(()=>
    new Map(EVAL_SCENARIOS.map(s=>[s.id,statusForScenario(s,records,environment)])),
    [records,mode,settings.model,viewModel,researchMode,mikanifyAnswer]
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
  const selectScenarioNumbers=()=>{
    const entries=numberSelection.trim().split(/[,;\s]+/).filter(Boolean);
    if(!entries.length){
      setNumberFeedback("Enter at least one scenario number.");
      return;
    }
    const invalid=entries.find(value=>{
      if(!/^#?\d+$/.test(value))return true;
      const number=Number(value.replace(/^#/,""));
      return !Number.isInteger(number)||number<1||number>EVAL_SCENARIOS.length;
    });
    if(invalid){
      setNumberFeedback("Unknown scenario: "+invalid+". Choose numbers 1–"+EVAL_SCENARIOS.length+".");
      return;
    }
    const numbers=[...new Set(entries.map(value=>Number(value.replace(/^#/,""))))];
    selectOnly(numbers.map(number=>EVAL_SCENARIOS[number-1].id));
    setCatalogOpen(true);
    setNumberFeedback("Selected "+numbers.length+" scenario(s): "+numbers.map(number=>"#"+number).join(", "));
  };
  const unresolved=new Set<BrainCaseStatus>(["failed","review","incomplete","untested","stale"]);
  const selectUnresolved=()=>selectOnly(EVAL_SCENARIOS
    .filter(s=>unresolved.has(statuses.get(s.id)!.status)).map(s=>s.id));
  const selectRegression=()=>{
    const passed=EVAL_SCENARIOS.filter(s=>statuses.get(s.id)?.status==="passed");
    // A stable sample across groups, even as the scenario catalog grows.
    const sample=passed.filter((_,i)=>i%7===0);
    selectOnly(sample.map(s=>s.id));
  };
  const currentPresetConfig=():BrainEvalPresetConfig=>({
    mode,researchMode,mikanifyAnswer,repetitions:repeats as BrainEvalPresetConfig["repetitions"],
    scenarioIds:selected.map(s=>s.id),models:[...selectedModels],
    category,statusFilter,search
  });
  function savePreset(){
    try{
      const next=upsertBrainEvalPreset(presets,presetName,currentPresetConfig());
      persistBrainEvalPresets(next);
      setPresets(next);
      const saved=next.find(p=>p.name.toLocaleLowerCase()===presetName.trim().toLocaleLowerCase())!;
      setPresetChoice(saved.name);
      setPresetName(saved.name);
      setMessage("Saved Brain Lab preset: "+saved.name+".");
    }catch(error){setMessage("Could not save preset: "+String(error))}
  }
  function loadPreset(){
    if(busy)return;
    const preset=presets.find(item=>item.name===presetChoice);
    if(!preset){setMessage("Select a saved preset first.");return}
    const config=preset.config;
    const allowedIds=new Set(EVAL_SCENARIOS.map(s=>s.id));
    const knownIds=config.scenarioIds.filter(id=>allowedIds.has(id));
    const unknownIds=config.scenarioIds.filter(id=>!allowedIds.has(id));
    if(config.scenarioIds.length>0&&!knownIds.length){setMessage("This preset has no scenarios in the current catalog; nothing was loaded.");return}
    const knownModels=config.models.filter(model=>localModels.includes(model));
    const missingModels=config.models.filter(model=>!localModels.includes(model));
    setMode(config.mode);
    setResearchMode(config.researchMode??settings.researchMode);
    setMikanifyAnswer(config.mikanifyAnswer===true);
    setRepeats(config.repetitions);
    setSelectedIds(new Set(knownIds));
    setSelectedModels(new Set(knownModels));
    setCategory(config.category==="All categories"||groups.includes(config.category)
      ?config.category:"All categories");
    setStatusFilter(config.statusFilter);
    setSearch(config.search);
    setPresetName(preset.name);
    setCatalogOpen(true);
    setMessage("Loaded "+preset.name+" ("+knownIds.length+" scenarios, "+
      (config.mode==="live"?knownModels.length:1)+" model(s))."+
      (unknownIds.length?" "+unknownIds.length+" unavailable scenario(s) skipped.":"")+
      (missingModels.length?" Missing Ollama models: "+missingModels.join(", ")+". Select installed models before running.":""));
  }
  function deletePreset(){
    if(busy||!presetChoice)return;
    if(!window.confirm('Delete Brain Lab preset "'+presetChoice+'"?'))return;
    try{
      const next=removeBrainEvalPreset(presets,presetChoice);
      persistBrainEvalPresets(next);
      setPresets(next);
      setMessage("Deleted preset: "+presetChoice+".");
      setPresetChoice("");
    }catch(error){setMessage("Could not delete preset: "+String(error))}
  }
  const metrics=report?brainEvalMetrics(report):null;
  const previousRun=history.find(h=>h.id!==report?.runId)??null;

  function run(){
    try{
      startBrainEvaluation(settings,{
        mode,researchMode,mikanifyAnswer,repetitions:repeats,scenarioIds:selected.map(s=>s.id),
        ...(mode==="live"?{models:modelsToRun}:{}),
      },localModels);
      setMessage("");
      setLastExportFolder(null);
      setViewModel("");
      // The large checklist used to bury progress and completion results.
      // Collapse it during a run, retaining the exact owner selection.
      setCatalogOpen(false);
    }catch(error){setMessage("Could not start: "+String(error))}
  }
  function stop(){
    stopBrainEvaluation();
    setMessage("");
  }
  async function exportReport(){
    if(!report)return;
    try{
      const path=await invoke<string>("brain_eval_export",{
        jsonReport:JSON.stringify(report,null,2),markdownReport:brainEvalMarkdown(report)
      });
      setLastExportFolder(path);
      setMessage("Saved JSON + Markdown reports.");
    }catch(error){setMessage("File export failed: "+String(error))}
  }
  async function openReportFolder(){
    try{await invoke("brain_eval_open_folder");}
    catch(error){setMessage("Could not open report folder: "+String(error))}
  }
  async function copyMarkdown(){
    if(!report)return;
    try{await navigator.clipboard.writeText(brainEvalMarkdown(report));setMessage("Readable Markdown report copied.")}
    catch(error){setMessage("Clipboard unavailable: "+String(error))}
  }

  return <div className="brain-eval-panel">
    <div className="settings-section-title"><BrainCircuit size={17}/> Brain lab · P0 reliability</div>
    <details className="brain-eval-explainer">
      <summary>What Brain Lab tests <span>Isolated memories · Live uses real SearXNG</span></summary>
      <p>Brain Lab tests Mikan's routing and local model using synthetic facts.
        Fast mode stays offline. Live mode calls the configured local model and
        runs approved public searches through the same Rust/SearXNG path as desktop chat.
        Real search snippets are returned to the model and recorded with their URLs.
        Neither mode writes to saved memories or private connected apps.
        Live runs containing web scenarios first verify a real public search returns actual sources;
        an empty or broken SearXNG response stops the run before any misleading scores are recorded.
        Conversation quality still needs human review. Simple uses source-reading without the JSON fact extractor;
        Strict keeps the previous experimental extraction path. Each gets separate scenario grades.</p>
    </details>
    <section className="brain-eval-presets" aria-label="Saved Brain Lab configurations">
      <div className="brain-eval-presets-header">
        <strong>Saved test presets</strong>
        <small>Restore scenarios, models, repetitions and filters · never runs automatically</small>
      </div>
      <div className="brain-eval-preset-controls">
        <label>Saved presets
          <select value={presetChoice} disabled={busy} onChange={e=>{
            const name=e.target.value;
            setPresetChoice(name);
            const preset=presets.find(p=>p.name===name);
            if(preset)setPresetName(preset.name);
          }}>
            <option value="">Choose a preset…</option>
            {presets.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy||!presetChoice} onClick={loadPreset}>Load</button>
        <button type="button" disabled={busy||!presetChoice} onClick={deletePreset}>Delete</button>
      </div>
      <div className="brain-eval-preset-controls">
        <label>Preset name
          <input type="text" maxLength={60} disabled={busy} value={presetName}
            placeholder="e.g. Model research shootout"
            onChange={e=>setPresetName(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();savePreset();}}}/>
        </label>
        <button type="button" disabled={busy||!presetName.trim()}
          onClick={savePreset}>Save current</button>
      </div>
      <small>Saving with an existing name updates that preset. Presets stay on this device.</small>
    </section>
    <div className="brain-eval-toolbar">
      <label>Test mode
        <select value={mode} disabled={busy} onChange={e=>setMode(e.target.value as EvalMode)}>
          <option value="routing">Fast · production routing and lexical recall</option>
          <option value="live">Live · local model + actual public SearXNG</option>
        </select>
      </label>
      <label>Research interpreter
        <select value={researchMode} disabled={busy||mode!=="live"}
          onChange={e=>setResearchMode(e.target.value as Settings["researchMode"])}>
          <option value="simple">Simple · read sources directly</option>
          <option value="strict">Strict · parked evidence pipeline</option>
        </select>
      </label>
      <label className="brain-eval-mikanify">
        <span>Mikanify answer 🐈</span>
        <input type="checkbox" checked={mikanifyAnswer}
          disabled={busy||mode!=="live"||researchMode!=="simple"}
          aria-label="Mikanify answer (experimental second local pass)"
          onChange={e=>setMikanifyAnswer(e.target.checked)}/>
        <small>Optional local restyle; the report saves both original and rewritten research answers.</small>
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
    {mode==="live"&&<section className="brain-eval-model-picker" aria-label="Models to compare">
      <div className="brain-eval-model-heading">
        <strong>Run across installed Ollama models</strong>
        <span>{modelsToRun.length} selected · sequential, one at a time</span>
      </div>
      <div className="brain-eval-model-actions">
        <button type="button" disabled={busy} onClick={()=>setSelectedModels(new Set([settings.model]))}>Current only</button>
        <button type="button" disabled={busy} onClick={()=>setSelectedModels(new Set(localModels.slice(0,10)))}>Select up to 10</button>
      </div>
      <div className="brain-eval-model-list">
        {localModels.map(model=><label key={model}>
          <input type="checkbox" disabled={busy}
            checked={selectedModels.has(model)}
            onChange={event=>setSelectedModels(old=>{
              const next=new Set(old);
              if(event.target.checked)next.add(model);else next.delete(model);
              return next;
            })}/>
          <span>{model}{model===settings.model?" · current":""}</span>
        </label>)}
      </div>
      <small>Each selected model runs the same scenarios in a fresh isolated conversation with its own report and saved results. Cloud models aren't included yet.</small>
    </section>}
    <div className="brain-eval-status-summary">
      {(["passed","failed","review","stale","untested","incomplete"] as const).map(status=>
        <span className={"brain-eval-status "+status} key={status}>{status}: {totals[status]}</span>
      )}
    </div>
    {totals.stale>0&&<p className="brain-eval-muted-note">
      Stale means tested with an older build or fixture. Those are previous results, not new failures.
    </p>}
    <div className="brain-eval-number-select">
      <label htmlFor="brain-eval-numbers">Select scenario numbers</label>
      <div className="brain-eval-number-row">
        <input id="brain-eval-numbers" type="text" value={numberSelection}
          disabled={busy} placeholder="20, 21, 83"
          aria-describedby="brain-eval-number-feedback"
          onChange={e=>setNumberSelection(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();selectScenarioNumbers();}}}/>
        <button type="button" disabled={busy} onClick={selectScenarioNumbers}>Select these</button>
      </div>
      <small id="brain-eval-number-feedback" role="status">{numberFeedback}</small>
    </div>
    <div className="brain-eval-select-actions">
      <button type="button" disabled={busy} onClick={()=>selectOnly(visible.map(s=>s.id))}>Select visible ({visible.length})</button>
      <button type="button" disabled={busy} onClick={selectUnresolved}>Select unresolved</button>
      <button type="button" disabled={busy} onClick={selectRegression}>Passed regression sample</button>
      <button type="button" disabled={busy} onClick={()=>selectOnly([])}>Clear selection</button>
    </div>
    <div className="brain-eval-actionbar">
      <div className="brain-eval-actions brain-eval-action-buttons">
        <button type="button" className="save-button" disabled={busy||selected.length===0||modelsToRun.length===0||modelsToRun.length>10} onClick={()=>void run()}>
          <Play size={15}/> Run {selected.length} scenarios × {modelsToRun.length} model{modelsToRun.length===1?"":"s"} ({selected.reduce((n,s)=>n+s.steps.length,0)*repeats*modelsToRun.length} turns)
        </button>
        {busy&&<button type="button" className="secondary-action" onClick={stop}><Square size={14}/> Stop</button>}
        {report&&!busy&&<button type="button" className="secondary-action"
          onClick={()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"})}>
          <Activity size={14}/> View results
        </button>}
        {report&&<button type="button" className="secondary-action" onClick={()=>void exportReport()}>
          <Download size={15}/> Export JSON + Markdown
        </button>}
        {report&&<button type="button" className="secondary-action" onClick={()=>void copyMarkdown()}>Copy readable report</button>}
      </div>
      <section className={"brain-eval-run-monitor "+runtime.phase} aria-label="Brain Lab run progress">
        <div className="brain-eval-run-heading" role="status" aria-live="polite">
          <strong>
            {runtime.phase==="running"?<Activity size={15} aria-hidden="true"/>:
              runtime.phase==="complete"?<CheckCircle2 size={15} aria-hidden="true"/>:
              runtime.phase==="failed"?<XCircle size={15} aria-hidden="true"/>:
              runtime.phase==="stopped"?<Square size={14} aria-hidden="true"/>:
              <BrainCircuit size={15} aria-hidden="true"/>}
            {runtime.phase==="running"?"Running evaluation":
              runtime.phase==="complete"?"Evaluation finished":
              runtime.phase==="failed"?"Evaluation failed":
              runtime.phase==="stopped"?"Evaluation stopped":"Ready for evaluation"}
          </strong>
          <span>{progress.total>0?progressPercent+"%":"Ready"}</span>
        </div>
        <progress aria-label="Brain Lab completed turns" max={Math.max(1,progress.total)}
          value={Math.min(progress.done,Math.max(1,progress.total))}/>
        <div className="brain-eval-run-details">
          <span>{progress.total>0
            ?progress.done+" / "+progress.total+" turns completed"
            :"Select scenarios and start a run"}</span>
          <span>{runtime.phase==="running"?progress.label:
            runtime.phase==="idle"?"Runs continue if you close Settings.":
            runtime.label+(runtime.finishedAt?" · "+new Date(runtime.finishedAt).toLocaleString():"")}</span>
        </div>
        {runtime.phase==="complete"&&runtime.results&&<small className="brain-eval-run-summary">
          {runtime.results.passed}/{runtime.results.turns} turns had no automated failures.
          {runtime.results.reviewTurns>0
            ?" "+runtime.results.reviewTurns+" turns require human review.":""}
        </small>}
        {runtime.error&&<small className="brain-eval-run-error" role="alert">{runtime.error}</small>}
        {reportFolder&&<small className="brain-eval-run-saved">
          Reports saved: <button type="button" className="brain-eval-folder-link"
            title="Open in Windows File Explorer" onClick={()=>void openReportFolder()}>
            <FolderOpen size={12} aria-hidden="true"/>{reportFolder}
          </button>
        </small>}
      </section>
    </div>
    <details className="brain-eval-catalog-disclosure" open={catalogOpen}
      onToggle={e=>setCatalogOpen(e.currentTarget.open)}>
      <summary className="brain-eval-catalog-header">
        <strong>Scenarios {catalogOpen?"▾":"▸"}</strong>
        <span>Showing {visible.length} of {EVAL_SCENARIOS.length} · {selected.length} selected
          {catalogOpen?" · click to collapse":" · click to expand"}</span>
      </summary>
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
              onClick={()=>{try{reviewBrainEvalScenario(s.id,mode,viewModel||settings.model,"passed",researchMode,mikanifyAnswer)}
                catch(error){setMessage(String(error))}}}>Approve</button>
            <button type="button" disabled={busy}
              onClick={()=>{try{reviewBrainEvalScenario(s.id,mode,viewModel||settings.model,"failed",researchMode,mikanifyAnswer)}
                catch(error){setMessage(String(error))}}}>Fail</button>
          </div>}
        </div>;
      })}
      </div>
    </details>
    <p className="brain-eval-muted-note">
      Catalog: {EVAL_SCENARIOS.length} scenarios, {totalFixtureTurns} turns. Use the category, status or search filters to narrow the list.
    </p>
    {message&&<p className="brain-eval-message" role="status">{message}</p>}
    {runtime.comparison && runtime.comparison.length>1&&<section className="brain-eval-comparison">
      <strong>Model comparison · same scenarios and repetitions</strong>
      <label className="brain-eval-model-trace-picker">Inspect a model's full run
        <select value={viewModel} onChange={event=>setViewModel(event.target.value)}>
          <option value="">Latest completed model</option>
          {runtime.comparison.map(item=><option key={item.reportId} value={item.model}>{item.model}</option>)}
        </select>
      </label>
      <div className="brain-eval-comparison-scroll">
        <table>
          <thead><tr><th>Model</th><th>Automated checks passed</th><th>Needs human review</th><th>No review needed</th><th>Web misses</th><th>Sources</th><th>Time</th></tr></thead>
          <tbody>{runtime.comparison.map(entry=><tr key={entry.reportId}>
            <th scope="row">{entry.model}</th>
            <td>{entry.metrics.passed}/{entry.metrics.turns}</td>
            <td>{entry.metrics.reviewTurns}/{entry.metrics.turns}</td>
            <td>{entry.metrics.verifiedPassed}/{entry.metrics.turns}</td>
            <td>{entry.metrics.missedWeb}</td>
            <td>{entry.metrics.liveSources}</td>
            <td>{formatMs(entry.metrics.elapsedMs)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <small>Automated passes are not proof of factual correctness. Review each model's saved JSON/Markdown report for evidence quality and personality.</small>
    </section>}
    {metrics&&report&&<>
      <div ref={resultsRef} className="settings-section-title brain-eval-results-anchor">
        <Activity size={17}/> Results dashboard · {report.model}
      </div>
      <div className="brain-eval-metrics">
        {([
          ["No detected failures",metrics.passRate+"%",metrics.passed+"/"+metrics.turns+" turns, includes unverified"],
          ["Verified checks",metrics.verifiedPassRate+"%",metrics.verifiedPassed+"/"+metrics.turns+" turns"],
          ["Exact route labels",metrics.routes+"%","diagnostic; labels alone don't fail a test"],
          ["Functional routing",metrics.behavioralRouting+"%","search-intent behavior"],
          ["Web decisions",metrics.webAgreement+"%",metrics.webChecks+" observed · "+metrics.unnecessaryWeb+" extra · "+metrics.missedWeb+" missed"],
          ["Real web searches",String(metrics.liveSearches),metrics.liveSearchesWithSources+
            " with sources · "+metrics.liveSources+" returned snippets"],
          ["Evidence failures",String(metrics.evidenceFailures),"searches with no accepted evidence; not a verified answer"],
          ["Source-anchored facts",String(metrics.evidenceFacts),metrics.evidencePasses+
            " search turns with exact quotes · "+metrics.evidenceUnavailable+
            " without matched extracts · not independently fact-verified"],
          ["Recommendation shortlist",String(metrics.shortlistedItems)+" admitted",metrics.rejectedItems+
            " rejected · "+metrics.noSupportedMatches+" turns with no supported matches"],
          ["Verified roles",String(metrics.attributedRoles),metrics.excludedReferences+
            " prior reference(s) excluded"],
          ["Memory fact coverage",metrics.recall+"%",metrics.memoryRecordMisses+" exact row misses · "+
            metrics.memoryDistractors+" extra records"],
          ["Factual answers",metrics.answers===null?"Not run":metrics.answers+"%",metrics.answerChecks+" graded turns"],
          ["Conversation reviews",String(metrics.reviewTurns),metrics.qualityFlagTurns+" potential quality warnings"],
          ["Read-only memory previews",String(metrics.memoryPreviews),metrics.memoryPreviewMisses+" minimum-fact misses; review meaning manually"],
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
            {step.expected.memoryCapture&&<div className="brain-eval-goal">
              <strong>Memory capture review (isolated, nothing saved)</strong>
              {step.expected.memoryCapture.reviewGoals.map(goal=><small key={goal}>{goal}</small>)}
              <small>Structurally validated user facts: {step.memoryCapturePreview?.userFacts.length??"not observed"}
                {" · minimum "+step.expected.memoryCapture.minUserFacts}
                {" · "+(step.memoryCapturePass===null?"not measured":step.memoryCapturePass?"count met":"count missed")}
              </small>
              {step.memoryCapturePreview?.userFacts.map((fact,i)=><small key={"user-"+i}>
                Proposed user memory: {fact.fact} | Exact user quote: {fact.evidence}
              </small>)}
              {step.memoryCapturePreview?.interestItems.map((item,i)=><small key={"interest-"+i}>
                Proposed interest: {item.kind} / {item.name} / {item.status} | Quote: {item.evidence}
              </small>)}
            </div>}
            <small>Route {step.actualRoute} (expected label {step.expected.route??"any"};
              exact {step.routeLabelMatch?"matched":"different, informational"});
              predicted web {step.plannedWeb===null?"unobserved":String(step.plannedWeb)};
              expected {step.expected.web??(step.expected.route==="research"?true:step.expected.route==="chat"?false:"unspecified")};
              planner {step.webPlannerDecision?.search?"requested":step.webPlannerDecision?"skipped":"not run"}
              {step.plannerElapsedMs!==undefined?" · "+formatMs(step.plannerElapsedMs):""}</small>
            {step.webExecution?.query&&<small>
              SearXNG executed: {step.webExecution.query} ·
              {step.webExecution.results.length} source previews
            </small>}
            {step.webExecution?.researchAudit&&<small>
              Evidence extraction: {step.webExecution.researchAudit.status} ·
              {step.webExecution.researchAudit.accepted} quote-matched ·
              {step.webExecution.researchAudit.rejected} rejected ·
              {step.webExecution.researchAudit.extractionAttempts??1} extraction attempt(s)
            </small>}
            {step.webExecution?.researchAudit?.candidateLeads?.length ? <small>
              Named candidate leads: {step.webExecution.researchAudit.candidateLeads.join(", ")}
            </small> : null}
            {step.webExecution?.researchAudit?.candidateQueries?.map((query,i)=><small
              key={query+"-"+i}>Attempted candidate-specific lookup: {query}</small>)}
            {step.webExecution?.researchAudit?.acceptedDetails?.map((fact,i)=><small
              key={fact.source+"-"+fact.subject+"-"+i}>
              Supported fact [{fact.source}]: {fact.subject} · {fact.claim}
              <span title={fact.quote}> · Quote: {fact.quote.slice(0,240)}</span>
            </small>)}
            {step.webExecution?.researchAudit?.rejectedDetails?.map((reason,i)=><small
              key={reason+"-"+i} className="brain-eval-review">Rejected evidence: {reason}</small>)}
            {step.webExecution?.researchAudit?.recommendationTask&&<small>
              Screened shortlist: {step.webExecution.researchAudit.recommendationApproved?.join(", ")||"no supported matches"} ·
              {step.webExecution.researchAudit.recommendationRejected??0} rejected ·
              {step.webExecution.researchAudit.constraintsChecked??0} hard limits ·
              {step.webExecution.researchAudit.featuresChecked??0} style/genre criteria ·
              {step.webExecution.researchAudit.relationsChecked??0} typed roles ·
              {step.webExecution.researchAudit.exclusionsChecked??0} prior references excluded
            </small>}
            {step.webExecution?.researchAudit?.recommendationDetails?.map((candidate,i)=><small key={candidate.title+"-"+i}>
              Verified candidate [{candidate.source}] {candidate.title}
              {candidate.relations.map(r=>" · "+r.role+": "+r.name).join("")}
              {candidate.measurements.map(m=>" · "+m.value+" "+m.unit).join("")}
            </small>)}
            {step.webExecution?.results.map((src,i)=><small key={src.url}>
              Source [{i+1}]: {src.title} · {src.url}
            </small> )}
            <small>Memory IDs selected: {step.selectedMemoryIds.join(", ")||"none"};
              uncovered facts: {step.missingMemoryIds.join(", ")||"none"};
              raw missing IDs: {step.missingMemoryRecordIds?.join(", ")||"none"};
              unrelated records: {step.distractorMemoryIds?.join(", ")||"none"};
              explicitly excluded: {step.unexpectedMemoryIds.join(", ")||"none"}</small>
            {!!step.memoryEvidence?.length &&<small>Evidence: {step.memoryEvidence
              .map(e=>"#"+e.expectedId+" supplied by "+(e.supportingIds.join(", ")||"nothing"))
              .join("; ")}</small>}
            {step.originalAnswer!==undefined&&<div className="brain-eval-comparison">
              <strong>Original researched answer (before Mikanify)</strong>
              <p className="brain-eval-answer">{step.originalAnswer}</p>
              <small>Mikanify {step.mikanifyApplied?"applied":"not applied, original retained"}
                {step.mikanifyElapsedMs!==undefined?" · "+formatMs(step.mikanifyElapsedMs):""}
              </small>
              {step.mikanifyError&&<small className="field-error">
                Style pass error: {step.mikanifyError}</small>}
              <strong>Final answer {step.mikanifyApplied?"after Mikanify":"(original)"}</strong>
            </div>}
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
        <strong> Live:</strong> local Ollama plus real public SearXNG searches when allowed,
        with actual evidence returned to the reply model. Neither mode writes real memories.</p>
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
