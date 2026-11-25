import {useState,useEffect} from "react";
import {Cpu,KeyRound} from "lucide-react";
import type {NasClient,NasModels as Models,ProviderEntry,NasModelPatch,CloudProvider,TokenUsage,TokenWindows} from "./nas-client";
const names:Record<CloudProvider,string>={nvidia:"NVIDIA",openrouter:"OpenRouter",gemini:"Gemini",groq:"Groq"};
function ProviderForm({entry,selected,client,onChanged,busy}:{entry:ProviderEntry;selected:boolean;client:NasClient;onChanged:(models:Models)=>void;busy:boolean}){
  const [model,setModel]=useState(entry.model);
  const [key,setKey]=useState("");
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  async function save(patch:NasModelPatch){
    setSaving(true);setMessage("");
    try{onChanged(await client.saveModels(patch));setKey("");setMessage("Saved on Beholder.");}
    catch(e){setMessage(e instanceof Error?e.message:String(e));}
    finally{setSaving(false);}
  }
  const patch={provider:entry.provider,model:model.trim(),...(key.trim()?{apiKey:key.trim()}:{})};
  return <section className="control-form-section">
    <strong>{names[entry.provider]} {selected?"· Active":""}</strong>
    <p>{entry.configured?"Key configured ("+entry.credentialSource+")":"No API key configured"}</p>
    <label className="setting-field">Model{(entry.provider==="nvidia"||entry.provider==="groq")?<select value={model} onChange={e=>setModel(e.target.value)}>{entry.models.map(m=><option key={m}>{m}</option>)}</select>:<input value={model} onChange={e=>setModel(e.target.value)} maxLength={120}/>}</label>
    {entry.provider==="openrouter"&&<small>Free routes only: openrouter/free or a model ending in :free.</small>}
    {entry.provider==="groq"&&<small>Use an API key from a free Groq organization. Free-tier token limits apply; no automatic upgrade or paid fallback.</small>}
    <label className="setting-field"><span><KeyRound size={14}/> New API key (optional)</span><input type="password" autoComplete="new-password" value={key} maxLength={512} placeholder="Leave blank to keep current key" onChange={e=>setKey(e.target.value)}/></label>
    <div className="nas-profile-actions"><button className="secondary-action" disabled={saving||busy} onClick={()=>void save(patch)}>Save</button>
      <button className="secondary-action" disabled={saving||busy||(!entry.configured&&!key.trim())} onClick={()=>void save({...patch,select:true})}>Save &amp; select</button>
      {entry.credentialSource==="nas"&&<button className="secondary-action" disabled={saving||busy} onClick={()=>void save({provider:entry.provider,clearKey:true})}>Remove saved key</button>}
    </div>
    <small>Text chat only in this NAS build. Native tool support not yet verified.</small>
    {message&&<p role="status">{message}</p>}
  </section>;
}
export function NasTokenUsage({client,models,compact=false}:{client:NasClient;models:Models;compact?:boolean}){
  const [data,setData]=useState<TokenUsage|null>(null),[error,setError]=useState(false),[scope,setScope]=useState<"model"|"provider">("model");
  useEffect(()=>{
    let live=true,pending=false;
    const refresh=async()=>{if(pending||document.visibilityState==="hidden")return;pending=true;try{const next=await client.tokenUsage();if(live){setData(next);setError(false);}}catch{if(live)setError(true);}finally{pending=false;}};
    void refresh();const timer=window.setInterval(()=>void refresh(),5000);
    document.addEventListener("visibilitychange",refresh);
    return()=>{live=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[client]);
  const group=data?.groups[models.provider],windows=scope==="provider"?group?.total:group?.models[models.model];
  const fmt=(n:number)=>n.toLocaleString(),labels:Record<keyof TokenWindows,string>={minute:"1 min",hour:"1 hour",day:"24 hours",utcToday:"Today (UTC)"};
  const groqLimit=models.provider==="groq"&&scope==="model"?8000:null;
  const table=windows?<><table className="nas-token-table"><thead><tr><th>Window</th><th>Input</th><th>Output</th></tr></thead><tbody>{(["minute","hour","day","utcToday"] as const).map(key=>{const v=windows[key];return <tr key={key}><th scope="row">{labels[key]}</th><td title={v.missingInput+" calls without input counts"}>{fmt(v.input)}{v.missingInput?"*":""}</td><td title={v.missingOutput+" calls without output counts"}>{fmt(v.output)}{v.missingOutput?"*":""}</td></tr>;})}</tbody></table>
    {groqLimit!==null&&<div className="nas-token-meter"><progress max={groqLimit} value={Math.min(groqLimit,windows.minute.input+windows.minute.output)} aria-label="Recorded tokens against advertised Groq free tier limit"/><small>{fmt(windows.minute.input+windows.minute.output)} / 8,000 tokens · free-tier reference</small></div>}
    <small>{windows.minute.calls} calls in the past minute · {windows.day.failed} failed calls / 24h</small>
    {windows.day.missingInput+windows.day.missingOutput>0&&<small>* Partial totals: some calls did not return usage. Failed requests may have consumed tokens.</small>}</>:<small>{error?"Token tracker unavailable.":"Loading token usage…"}</small>;
  const body=<><div className="nas-token-heading"><strong>Token usage</strong>{!compact&&<select aria-label="Token usage scope" value={scope} onChange={e=>setScope(e.target.value as "model"|"provider")}><option value="model">Selected model</option><option value="provider">All models on provider</option></select>}</div>{table}
    {group?.quota.reason==="cooldown"&&<small className="nas-token-warning">Provider cooldown · {Math.ceil(group.quota.waitMs/1000)}s remaining</small>}
    {!compact&&group&&scope==="model"&&<><div className="nas-token-heading"><strong>24-hour breakdown</strong></div><table className="nas-token-table"><thead><tr><th>Source</th><th>Input</th><th>Output</th></tr></thead><tbody>{(["chat","brain-lab","memory"] as const).map(key=><tr key={key}><th scope="row">{({chat:"Chat & research","brain-lab":"Brain Lab",memory:"Memory worker"})[key]}</th><td>{fmt(group.sources[key].input)}{group.sources[key].missingInput?"*":""}</td><td>{fmt(group.sources[key].output)}{group.sources[key].missingOutput?"*":""}</td></tr>)}</tbody></table></>}
    {!compact&&data&&<small>Tracking since {new Date(data.since).toLocaleString()}. Rolling minute/hour/24h windows use request start times. Today uses UTC. Output includes reasoning when reported; reasoning is not added twice. Recorded Beholder usage, not your provider's remaining balance or other apps' usage.</small>}{error&&data&&<small>Refresh failed; showing last recorded snapshot.</small>}</>;
  return <div className={"nas-token-usage"+(compact?" compact":"")}>{body}</div>;
}
export function NasModels({models,client,onChanged,busy}:{models:Models;client:NasClient;onChanged:(models:Models)=>void;busy:boolean}){
  const [notice,setNotice]=useState("");
  const [saving,setSaving]=useState(false);
  return <>
    <div className="control-page-note"><Cpu size={20}/> Cloud inference runs independently of your PC. Keys are never returned to the browser.</div>
    <div className="settings-section-title">Inference usage</div><section className="control-form-section"><NasTokenUsage client={client} models={models}/></section>
    <div className="settings-section-title">Models &amp; providers</div>
    {models.providers.map(entry=><ProviderForm key={entry.provider} entry={entry} selected={models.provider===entry.provider} client={client} onChanged={onChanged} busy={busy}/>)}
    <div className="settings-section-title">Context and request budgets</div>
    <section className="control-form-section">
      <label className="setting-field">Recent conversation character budget<select value={models.historyChars} disabled={saving||busy} onChange={async e=>{setSaving(true);setNotice("");try{onChanged(await client.saveModels({provider:models.provider,historyChars:Number(e.target.value)}));}catch(error){setNotice(String(error));}finally{setSaving(false);}}}>{[16000,32000,64000].map(n=><option key={n} value={n}>{n.toLocaleString()} characters</option>)}</select></label>
      <small>This is a history budget, not an exact model token window. Retrieved memories and instructions are additional.</small>
      <p>NAS safeguards: NVIDIA 30 requests/min, OpenRouter 15/min and 40 per UTC day, Gemini 5/min, Groq 30/min and 1,000 per UTC day. Chat and automatic learning share these budgets. Provider limits may be lower; HTTP 429 pauses that provider for five minutes, with no automatic retry.</p>
      <p>Keys entered here are stored in a restricted server-side file on Beholder, included in private NAS backups. Gemini access depends on your API project's billing and quota settings.</p>
      {notice&&<p role="alert">{notice}</p>}
    </section>
  </>;
}
