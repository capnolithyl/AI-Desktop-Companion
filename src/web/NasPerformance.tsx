import {useEffect,useState} from "react";
import {Check,Copy,RefreshCw,Activity} from "lucide-react";
import type {NasClient,NasModels,PerformanceReport,PerformanceGroup,TimingDistribution} from "./nas-client";
const seconds=(ms:number|null|undefined)=>ms==null?"—":(ms/1000).toFixed(2)+"s";
const key=(g:PerformanceGroup)=>JSON.stringify([g.provider,g.model]);
const providerNames:Record<string,string>={arli:"Arli AI",nvidia:"NVIDIA",groq:"Groq",cerebras:"Cerebras",gemini:"Gemini",openrouter:"OpenRouter"};
const modelName=(id:string)=>(id.split("/").at(-1)??id).replaceAll("-"," ");
function DistributionRow({name,d}:{name:string;d:TimingDistribution}){
 return <tr><th scope="row">{name}</th><td>{d.count}</td><td>{seconds(d.mean)}</td><td>{seconds(d.p50)}</td><td>{seconds(d.p95)}</td><td>{seconds(d.min)}</td><td>{seconds(d.max)}</td></tr>;
}
export function NasPerformance({models,client,onChanged,busy}:{models:NasModels;client:NasClient;onChanged:(models:NasModels)=>void;busy:boolean}){
 const [days,setDays]=useState<1|7|30>(7),[data,setData]=useState<PerformanceReport|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[revision,setRevision]=useState(0);
 const [choice,setChoice]=useState(""),[metric,setMetric]=useState("Turn / chat"),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState(""),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState("");
 useEffect(()=>{let live=true;setLoading(true);setError("");client.performance(days).then(next=>{if(live)setData(next);}).catch(e=>{if(live)setError(e instanceof Error?e.message:String(e));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[client,days,revision]);
 const groups=data?.groups??[],selected=groups.find(g=>key(g)===choice)??groups.find(g=>g.provider===models.provider&&g.model===models.model)??groups[0];
 const metricKeys=Object.keys(selected?.metrics??{}),currentMetric=metricKeys.includes(metric)?metric:metricKeys.find(k=>k==="Turn / chat")??metricKeys[0];
 async function copy(){if(!data)return;setCopyError("");try{await navigator.clipboard.writeText(JSON.stringify(data,null,2));setCopied(true);}catch{setCopyError("Clipboard unavailable. Open Mikan in a secure browser context.");}}
 useEffect(()=>{if(!copied)return;const t=window.setTimeout(()=>setCopied(false),2500);return()=>window.clearTimeout(t);},[copied]);
 async function toggle(value:boolean){setSaving(true);setSaveError("");try{onChanged(await client.saveModels({provider:models.provider,nativeStreaming:value}));}catch(e){setSaveError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}}
 const trend=selected?.daily.filter(d=>currentMetric&&d.metrics[currentMetric])??[];
 const max=Math.max(1,...trend.map(d=>d.metrics[currentMetric!].mean??0));
 return <div className="nas-performance">
  <div className="control-page-note"><Activity size={20}/> Compare real Beholder response times, not advertised provider speed.</div>
  <section className="control-form-section">
    <strong>Native reply streaming</strong>
    <label className="nas-performance-toggle"><input type="checkbox" checked={models.nativeStreaming!==false} disabled={busy||saving} onChange={e=>void toggle(e.target.checked)}/><span>Stream native-agent replies as text arrives</span></label>
    <small>Applies to new chats and Brain Lab turns using NVIDIA, Groq, Cerebras or Arli. Disable for a model with incompatible streamed tools. No automatic retry or change of model.</small>
    {saveError&&<p role="alert">{saveError}</p>}
  </section>
  <section className="control-form-section">
    <div className="nas-performance-heading"><strong>Performance history</strong><button type="button" className="secondary-action" disabled={loading} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={15}/> Refresh</button><button type="button" className="secondary-action" disabled={!data||loading} onClick={()=>void copy()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?"Copied!":"Copy report"}</button></div>
    <div className="nas-performance-windows" role="group" aria-label="Performance time range">{([1,7,30] as const).map(d=><button key={d} type="button" aria-pressed={days===d} onClick={()=>setDays(d)}>{d===1?"24 hours":d+" days"}</button>)}</div>
    {loading&&<small>Loading performance measurements…</small>}{error&&<p role="alert">{error}{data?" Showing last available report.":""}</p>}{copyError&&<p role="alert">{copyError}</p>}
    {data&&<><small>Last {data.days===1?"24 hours":data.days+" days"} · {data.coverage.calls} API attempts · {data.coverage.chatTraces} chat traces · {data.coverage.brainLabTraces} Brain Lab traces · {new Date(data.observedAt).toLocaleString()}</small>
    {data.truncated&&<small>Report sample limit reached. Showing newest measurements in each source.</small>}
    {!groups.length?<p>No performance data for this period yet.</p>:<>
     <div className="nas-performance-scroll"><table><thead><tr><th>Model</th><th>Calls</th><th>Chat mean</th><th>First text</th><th>Chat p95</th><th>Failed calls</th></tr></thead><tbody>{groups.map(g=><tr key={key(g)} className={selected&&key(g)===key(selected)?"nas-performance-selected":""}><th scope="row"><button type="button" className="nas-performance-model" onClick={()=>setChoice(key(g))}><strong>{modelName(g.model)}</strong><small>{providerNames[g.provider]??g.provider} · {g.model}</small></button></th><td>{g.calls}</td><td>{seconds(g.metrics["Turn / chat"]?.mean)}</td><td>{seconds(g.metrics["First visible text / chat"]?.mean)}</td><td>{seconds(g.metrics["Turn / chat"]?.p95)}</td><td>{g.failedCalls}</td></tr>)}</tbody></table></div>
    </>}
    </>}
  </section>
  {selected&&<section className="control-form-section">
   <strong>{modelName(selected.model)} · {providerNames[selected.provider]??selected.provider}</strong><small>{selected.model}{selected.actualModels.length?" · Reported: "+selected.actualModels.join(", "):""}</small>
   <small>{selected.turns} turns · {selected.failedTurns} failed turns · {selected.calls} API attempts</small>
   <label className="setting-field">Daily trend<select value={currentMetric??""} onChange={e=>setMetric(e.target.value)}>{metricKeys.map(k=><option key={k}>{k}</option>)}</select></label>
   <div className="nas-performance-trend">{trend.map(day=>{const d=day.metrics[currentMetric!];return <div key={day.date}><span>{day.date}</span><div className="nas-performance-bar"><i style={{width:(d.mean??0)/max*100+"%"}}/></div><strong>{seconds(d.mean)}</strong><small>{d.count} samples</small></div>;})}</div>
   <small>Daily mean duration · UTC dates · days without samples omitted</small>
   <div className="nas-performance-scroll"><table><thead><tr><th>Measurement</th><th>N</th><th>Mean</th><th>P50</th><th>P95</th><th>Min</th><th>Max</th></tr></thead><tbody>{Object.entries(selected.metrics).map(([name,d])=><DistributionRow key={name} name={name} d={d}/>)}</tbody></table></div>
  </section>}
  {data&&<details className="service-panel"><summary>What is measured?</summary>{data.notes.map((note,i)=><p key={i}>{note}</p>)}</details>}
 </div>;
}
