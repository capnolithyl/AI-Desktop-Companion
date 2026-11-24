import {useEffect,useState} from "react";
import type {NasClient,NasModels,BrainScenario,BrainReport,BrainSummary,ResearchMode,CloudProvider} from "./nas-client";
import {NasTiming} from "./NasTiming";
import {CLOUD_EVAL_BUDGETS} from "../brain-eval-cloud";
export function NasBrainLab({client,models,busy}:{client:NasClient;models:NasModels;busy:boolean}){
  const [catalog,setCatalog]=useState<BrainScenario[]>([]),[report,setReport]=useState<BrainReport|null>(null),[history,setHistory]=useState<BrainSummary[]>([]),[view,setView]=useState<BrainReport|null>(null),[running,setRunning]=useState(false),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState("");
  const [choice,setChoice]=useState(JSON.stringify([models.provider,models.model])),[mode,setMode]=useState<ResearchMode>("strict"),[repetitions,setRepetitions]=useState(1),[numbers,setNumbers]=useState(""),[filter,setFilter]=useState("");
  const [ids,setIds]=useState<string[]>([]);
  const [provider,model]=JSON.parse(choice) as [CloudProvider,string];
  const options=models.providers.filter(p=>p.configured).flatMap(p=>p.models.map(m=>({provider:p.provider,model:m,id:JSON.stringify([p.provider,m])})));
  const turns=catalog.filter(s=>ids.includes(s.id)).reduce((n,s)=>n+s.turns,0)*repetitions,limit=CLOUD_EVAL_BUDGETS[provider].maxTurns;
  async function refresh(){const s=await client.brainStatus();setReport(s.current);setHistory(s.history);setRunning(s.running);}
  useEffect(()=>{let live=true;let updating=false;const poll=async()=>{if(updating)return;updating=true;try{const s=await client.brainStatus();if(live){setReport(s.current);setHistory(s.history);setRunning(s.running);setLoading(false);}}catch(e){if(live)setError(String(e));}finally{updating=false;}};void client.brainCatalog().then(c=>{if(live)setCatalog(c);}).catch(e=>{if(live)setError(String(e));});void poll();const timer=setInterval(()=>void poll(),2500);return()=>{live=false;clearInterval(timer);};},[client]);
  async function start(){setWorking(true);setError("");setView(null);try{await client.startBrain({provider,model,mode,scenarioIds:ids,repetitions});await refresh();}catch(e){setError(String(e));}finally{setWorking(false);}}
  async function stop(){setWorking(true);try{await client.stopBrain();await refresh();}catch(e){setError(String(e));}finally{setWorking(false);}}
  function selectNumbers(){const values=numbers.split(",").map(v=>Number(v.trim()));const selected=catalog.filter(s=>s.supported&&values.includes(s.number));if(!selected.length||selected.length!==new Set(values).size){setError("Enter supported scenario numbers separated by commas.");return;}setIds(selected.map(s=>s.id));setError("");}
  const shown=view??report,steps=shown?.cases.flatMap(c=>c.steps)??[];
  return <><div className="settings-section-title">Brain Lab · Beholder</div>
    <p className="settings-note">Live, isolated synthetic tests use the production NAS pipeline and quota ledger. Public research uses real SearXNG. Human review remains required for source accuracy and subjective answers.</p>
    <section className="control-form-section"><label>Model<select value={choice} onChange={e=>setChoice(e.target.value)} disabled={running||working}>{options.map(o=><option key={o.id} value={o.id}>{o.provider} · {o.model}</option>)}</select></label>
      <label>Research<select value={mode} disabled={running||working} onChange={e=>setMode(e.target.value as ResearchMode)}><option value="strict">Strict</option><option value="simple">Simple</option><option value="off">Off</option></select></label>
      <label>Repetitions<select value={repetitions} disabled={running||working} onChange={e=>setRepetitions(Number(e.target.value))}>{[1,2,3,5].map(n=><option key={n}>{n}</option>)}</select></label>
      <p>{turns}/{limit} turns · {ids.length} scenarios · one model per run</p>
      <button disabled={loading||busy||running||working||!ids.length||turns>limit||!options.some(o=>o.id===choice)} onClick={()=>void start()}>Run scenarios</button> {running&&<button disabled={working} onClick={()=>void stop()}>Stop</button>}
      {error&&<p role="alert">{error}</p>}
      {report&&<><p role="status">{report.state} · {report.done}/{report.total} · {report.currentLabel}</p><progress style={{width:"100%"}} max={report.total||1} value={report.done}/></>}
    </section>
    <details className="control-form-section" open={!running}><summary>Scenario selection</summary>
      <input placeholder="Scenario numbers, e.g. 1, 20" value={numbers} onChange={e=>setNumbers(e.target.value)}/><button disabled={running||working} onClick={selectNumbers}>Select numbers</button>
      <button disabled={running||working} onClick={()=>setIds([])}>Clear</button>
      <input placeholder="Filter scenarios" value={filter} onChange={e=>setFilter(e.target.value)}/>
      {catalog.filter(s=>(s.label+" "+s.group+" "+s.number).toLowerCase().includes(filter.toLowerCase())).map(s=><label key={s.id} style={{display:"block"}}><input type="checkbox" checked={ids.includes(s.id)} disabled={!s.supported||running||working} onChange={e=>setIds(prev=>e.target.checked?[...prev,s.id]:prev.filter(id=>id!==s.id))}/> #{s.number} {s.label} ({s.turns}){!s.supported?" · unsupported":""}</label>)}
    </details>
    <section className="control-form-section"><label>Saved reports<select value={view?.id??""} onChange={e=>{const id=e.target.value;if(!id)setView(null);else void client.brainReport(id).then(setView).catch(e=>setError(String(e)));}}><option value="">Current run</option>{history.map(h=><option key={h.id} value={h.id}>{new Date(h.startedAt).toLocaleString()} · {h.model} · {h.state}</option>)}</select></label>
      {shown&&<><p>{steps.filter(s=>s.grade==="passed").length} passed · {steps.filter(s=>s.grade==="failed").length} failed · {steps.filter(s=>s.grade==="review").length} review</p><button onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(shown,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="mikan-nas-brain-"+shown.id+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export report</button>
      {shown.cases.map(c=><details key={c.id+":"+c.repeat}><summary>#{c.number} {c.label} · repeat {c.repeat}</summary>{c.steps.map((s,i)=><div key={i} className="control-form-section"><strong>{s.grade} · {s.user}</strong><p>{s.answer}</p>{s.failures.map((f,j)=><p key={j}>{f}</p>)}{s.reviewGoal&&<p>{s.reviewGoal}</p>}<small>Actual model: {s.actualModel??"not reported"} · Memory IDs: {s.selectedMemoryIds?.join(", ")||"none"}</small><NasTiming timing={s.timing}/>{s.events.map((e,j)=><p key={j}>{e.title} · {e.detail} {e.lines.join(" | ")}</p>)}{s.sources?.map((source,j)=><details key={j}><summary>[{j+1}] {source.title}</summary><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a><p>{source.content}</p></details>)}</div>)}</details>)}</>}
    </section></>;
}
