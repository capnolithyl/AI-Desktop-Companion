import {useEffect,useState} from "react";
import {BrainCircuit,Play,Square,ListChecks,ChartNoAxesCombined,Download,Search,ChevronLeft,ChevronRight,FlaskConical} from "lucide-react";
import type {NasClient,NasModels,BrainScenario,BrainReport,BrainSummary,ResearchMode,CloudProvider} from "./nas-client";
import {NasTiming} from "./NasTiming";
import {CLOUD_EVAL_BUDGETS,fitCloudScenarios} from "../brain-eval-cloud";
import "../brain-eval.css";
type Tab="run"|"scenarios"|"results";
const PAGE_SIZE=16;
const stateName:Record<string,string>={running:"Running",stopping:"Stopping",finished:"Finished",stopped:"Stopped",failed:"Failed",quota:"Quota reached",interrupted:"Interrupted"};
export function NasBrainLab({client,models,busy}:{client:NasClient;models:NasModels;busy:boolean}){
  const [catalog,setCatalog]=useState<BrainScenario[]>([]),[report,setReport]=useState<BrainReport|null>(null),[history,setHistory]=useState<BrainSummary[]>([]),[view,setView]=useState<BrainReport|null>(null),[running,setRunning]=useState(false),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState("");
  const [choice,setChoice]=useState(JSON.stringify([models.provider,models.model])),[mode,setMode]=useState<ResearchMode>("strict"),[repetitions,setRepetitions]=useState(1),[numbers,setNumbers]=useState(""),[filter,setFilter]=useState(""),[category,setCategory]=useState("all");
  const [publicAgent,setPublicAgent]=useState(false);
  const [ids,setIds]=useState<string[]>([]),[tab,setTab]=useState<Tab>("run"),[page,setPage]=useState(0);
  const [provider,model]=JSON.parse(choice) as [CloudProvider,string];
  const options=models.providers.filter(p=>p.configured).flatMap(p=>p.models.map(m=>({provider:p.provider,model:m,id:JSON.stringify([p.provider,m])})));
  const selected=catalog.filter(s=>ids.includes(s.id));
  const turns=selected.reduce((n,s)=>n+s.turns,0)*repetitions,limit=CLOUD_EVAL_BUDGETS[provider].maxTurns;
  const locked=running||working;
  const groups=[...new Set(catalog.map(s=>s.group))];
  const filtered=catalog.filter(s=>(category==="all"||s.group===category)&&(s.label+" "+s.group+" "+s.number).toLowerCase().includes(filter.toLowerCase()));
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),safePage=Math.min(page,pages-1);
  const visible=filtered.slice(safePage*PAGE_SIZE,(safePage+1)*PAGE_SIZE);
  async function refresh(){const s=await client.brainStatus();setReport(s.current);setHistory(s.history);setRunning(s.running);}
  useEffect(()=>{let live=true;let updating=false;const poll=async()=>{if(updating)return;updating=true;try{const s=await client.brainStatus();if(live){setReport(s.current);setHistory(s.history);setRunning(s.running);setLoading(false);}}catch(e){if(live)setError(String(e));}finally{updating=false;}};void client.brainCatalog().then(c=>{if(live)setCatalog(c);}).catch(e=>{if(live)setError(String(e));});void poll();const timer=setInterval(()=>void poll(),2500);return()=>{live=false;clearInterval(timer);};},[client]);
  async function start(){setWorking(true);setError("");setView(null);try{await client.startBrain({provider,model,mode,scenarioIds:ids,repetitions,publicAgent:provider==="nvidia"&&publicAgent});await refresh();}catch(e){setError(String(e));}finally{setWorking(false);}}
  async function stop(){setWorking(true);try{await client.stopBrain();await refresh();}catch(e){setError(String(e));}finally{setWorking(false);}}
  function selectNumbers(){const values=numbers.split(",").map(v=>Number(v.trim()));const found=catalog.filter(s=>s.supported&&values.includes(s.number));if(!found.length||found.length!==new Set(values).size){setError("Enter supported scenario numbers separated by commas.");return;}setIds(found.map(s=>s.id));setError("");}
  const shown=view??report,steps=shown?.cases.flatMap(c=>c.steps)??[];
  const exportReport=()=>{if(!shown)return;const url=URL.createObjectURL(new Blob([JSON.stringify(shown,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="mikan-nas-brain-"+shown.id+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <div className="brain-eval-panel nas-brain-lab">
    <header className="brain-workspace-header"><div className="brain-workspace-icon"><BrainCircuit size={29}/></div><div><h2>Brain Lab</h2><p>Live model evaluations on Beholder. Real research, isolated synthetic memories, measurable results.</p></div></header>
    <nav className="brain-workspace-tabs" aria-label="Brain Lab sections">
      <button type="button" className={tab==="run"?"active":""} aria-pressed={tab==="run"} onClick={()=>setTab("run")}><Play size={17}/> Run</button>
      <button type="button" className={tab==="scenarios"?"active":""} aria-pressed={tab==="scenarios"} onClick={()=>setTab("scenarios")}><ListChecks size={18}/> Scenarios <small>{ids.length} selected</small></button>
      <button type="button" className={tab==="results"?"active":""} aria-pressed={tab==="results"} onClick={()=>setTab("results")}><ChartNoAxesCombined size={18}/> Results</button>
    </nav>
    {error&&<p className="brain-eval-message nas-brain-error" role="alert">{error}</p>}
    {report&&<section className={"brain-eval-run-monitor nas-brain-monitor "+(running?"running":report.state==="finished"?"complete":report.state==="failed"?"failed":"stopped")} aria-live="polite">
      <div className="brain-eval-run-heading"><strong>{stateName[report.state]??report.state}</strong><span>{report.done}/{report.total} turns</span></div>
      <progress max={report.total||1} value={report.done}/><div className="brain-eval-run-details"><span>{report.model}</span><span>{report.currentLabel}</span></div>
      <div className="brain-eval-actions">{running&&<button className="secondary-action" disabled={working} onClick={()=>void stop()}><Square size={14}/> Stop run</button>}<button className="secondary-action" onClick={()=>{setView(null);setTab("results");}}>View results</button></div>
    </section>}
    {tab==="run"&&<div className="brain-workspace-view">
      <div className="brain-section-heading"><h3>Run configuration</h3><span>One model per run</span></div>
      <div className="brain-eval-toolbar nas-brain-toolbar">
        <label className="nas-brain-model-field">Cloud model<select value={choice} onChange={e=>setChoice(e.target.value)} disabled={locked}>{options.map(o=><option key={o.id} value={o.id}>{o.provider} · {o.model}</option>)}</select></label>
        <label>Research mode<select value={mode} disabled={locked} onChange={e=>setMode(e.target.value as ResearchMode)}><option value="strict">Strict</option><option value="simple">Simple</option><option value="off">Off</option></select></label>
        {provider==="nvidia"&&<label>Research engine<select value={publicAgent?"agent":"legacy"} disabled={locked} onChange={e=>setPublicAgent(e.target.value==="agent")}><option value="legacy">Existing pipeline</option><option value="agent">Native tools (experimental)</option></select></label>}
        <label>Repetitions<select value={repetitions} disabled={locked} onChange={e=>setRepetitions(Number(e.target.value))}>{[1,2,3,5].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>
      </div>
      <section className="brain-eval-actionbar">
        <div className="brain-eval-metrics">
          <div className="brain-eval-metric"><span>Selected scenarios</span><strong>{ids.length}</strong><small>Shared desktop catalog</small></div>
          <div className="brain-eval-metric"><span>Turns per run</span><strong>{turns}<small> / {limit}</small></strong><small>Cloud budget</small></div>
          <div className="brain-eval-metric"><span>Minimum spacing</span><strong>{CLOUD_EVAL_BUDGETS[provider].minimumIntervalMs/1000}s</strong><small>Between turn starts</small></div>
        </div>
        <div className="brain-eval-cloud-budget"><strong>{turns>limit?"Selection exceeds provider limit":ids.length?"Selection ready":"Select scenarios to begin"}</strong><span>{turns>limit?"Reduce repetitions or fit the selection.":"All cloud calls share the NAS quota ledger."}</span>{turns>limit&&<button className="secondary-action" disabled={locked} onClick={()=>setIds(fitCloudScenarios(selected.map(s=>({...s,steps:Array.from({length:s.turns})})),limit,repetitions))}>Fit selection</button>}</div>
        <div className="brain-eval-action-buttons"><button className="save-button" disabled={loading||busy||locked||!ids.length||turns>limit||!options.some(o=>o.id===choice)} onClick={()=>void start()}><Play size={17}/> Run scenarios</button><button className="secondary-action" onClick={()=>setTab("scenarios")}><ListChecks size={16}/> Choose scenarios</button></div>
      </section>
      <details className="brain-eval-explainer"><summary>How evaluations work</summary><p>Tests use the production NAS pipeline, isolated synthetic SQLite memory and real public search when enabled. Reports contain raw responses, sources and diagnostics without automatic scoring. Runs continue on Beholder when this panel closes.</p></details>
    </div>}
    {tab==="scenarios"&&<div className="brain-workspace-view">
      <div className="brain-section-heading"><h3>Select scenarios</h3><span>{catalog.filter(s=>s.supported).length} supported · {ids.length} selected · {turns}/{limit} turns</span></div>
      <div className="brain-eval-number-select"><label htmlFor="nas-brain-numbers">Quick select by number</label><div className="brain-eval-number-row"><input id="nas-brain-numbers" placeholder="e.g. 1, 20, 84" value={numbers} onChange={e=>setNumbers(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!locked)selectNumbers();}}/><button disabled={locked} onClick={selectNumbers}>Select numbers</button></div><small>Scenario numbers match desktop Brain Lab.</small></div>
      <div className="brain-eval-toolbar nas-brain-filters"><label>Category<select value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}}><option value="all">All categories</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label><label>Search<div className="nas-brain-search"><Search size={16}/><input placeholder="Find scenarios" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}/></div></label></div>
      <div className="brain-eval-select-actions"><button disabled={locked} onClick={()=>setIds(prev=>[...new Set([...prev,...visible.filter(s=>s.supported).map(s=>s.id)])])}>Select page</button><button disabled={locked} onClick={()=>setIds([])}>Clear selection</button><button className="brain-return-to-run" onClick={()=>setTab("run")}>Return to run</button></div>
      <div className="brain-eval-catalog" role="group" aria-label="Select scenarios">
        {visible.map(s=><div className={"brain-eval-test-row"+(ids.includes(s.id)?" nas-brain-selected":"")} key={s.id}><label><input type="checkbox" checked={ids.includes(s.id)} disabled={!s.supported||locked} onChange={e=>setIds(prev=>e.target.checked?[...prev,s.id]:prev.filter(id=>id!==s.id))}/><span><strong>#{s.number} · {s.label}</strong><small>{s.group} · {s.turns} {s.turns===1?"turn":"turns"}</small></span></label>{!s.supported?<span className="brain-eval-status untested">Unsupported</span>:ids.includes(s.id)?<span className="nas-brain-selected-label">Selected</span>:null}</div>)}
        {!visible.length&&<p className="brain-eval-muted-note">No matching scenarios.</p>}
      </div>
      <div className="brain-scenario-pagination"><button disabled={safePage===0} onClick={()=>setPage(safePage-1)}><ChevronLeft size={15}/> Previous</button><span>{safePage+1} / {pages}</span><button disabled={safePage+1>=pages} onClick={()=>setPage(safePage+1)}>Next <ChevronRight size={15}/></button></div>
    </div>}
    {tab==="results"&&<div className="brain-workspace-view">
      <div className="brain-section-heading"><h3>Results &amp; diagnostics</h3><span>{shown?.model??"No run yet"}</span></div>
      <div className="brain-eval-toolbar nas-brain-report-picker"><label>Saved reports<select value={view?.id??""} onChange={e=>{const id=e.target.value;if(!id)setView(null);else void client.brainReport(id).then(setView).catch(e=>setError(String(e)));}}><option value="">Current run</option>{history.map(h=><option key={h.id} value={h.id}>{new Date(h.startedAt).toLocaleString()} · {h.model} · {h.state}</option>)}</select></label>{shown&&<button className="secondary-action" onClick={exportReport}><Download size={16}/> Export JSON</button>}</div>
      {shown?<><div className="brain-eval-metrics"><div className="brain-eval-metric"><span>Responses</span><strong>{steps.filter(s=>s.answer!==undefined).length}/{shown.total}</strong><small>Captured turns</small></div><div className="brain-eval-metric"><span>Mean response time</span><strong>{steps.length?(steps.reduce((n,s)=>n+s.timing.totalMs,0)/steps.length/1000).toFixed(2):"0"}s</strong><small>Wall time per attempted turn</small></div><div className="brain-eval-metric"><span>Model calls</span><strong>{steps.reduce((n,s)=>n+s.timing.modelCalls,0)}</strong><small>Including planning and repair</small></div></div>
        <div className="brain-eval-traces">{shown.cases.map(c=><details className="service-panel" key={c.id+":"+c.repeat}><summary className="brain-eval-summary"><strong>#{c.number} · {c.label}</strong><span>Repeat {c.repeat} · {c.steps.length} turns</span></summary>{c.steps.map((s,i)=><div key={i} className="brain-eval-step"><div><strong>{s.user}</strong>{s.error&&<span className="brain-eval-bad">Execution interrupted</span>}</div>{s.answer&&<p className="brain-eval-answer">{s.answer}</p>}{s.error&&<small className="brain-eval-bad">{s.error}</small>}<small>Actual model: {s.actualModel??"not reported"} · Memory IDs: {s.selectedMemoryIds?.join(", ")||"none"}</small><NasTiming timing={s.timing}/>{s.events.map((e,j)=><small key={j}>{e.title} · {e.detail} {e.lines.join(" | ")}</small>)}{s.sources?.map((source,j)=><details className="nas-brain-source" key={j}><summary>[{j+1}] {source.title}</summary><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a><p>{source.content}</p></details>)}</div>)}</details>)}</div>
      </>:<div className="brain-empty-results"><FlaskConical size={38}/><strong>No results yet</strong><p>Choose scenarios and run a live evaluation to see the results here.</p><button className="secondary-action" onClick={()=>setTab("run")}>Configure run</button></div>}
    </div>}
  </div>;
}
