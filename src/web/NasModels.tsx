import {useState} from "react";
import {Cpu,KeyRound} from "lucide-react";
import type {NasClient,NasModels as Models,ProviderEntry,NasModelPatch,CloudProvider} from "./nas-client";
const names:Record<CloudProvider,string>={nvidia:"NVIDIA",openrouter:"OpenRouter",gemini:"Gemini"};
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
    <label className="setting-field">Model{entry.provider==="nvidia"?<select value={model} onChange={e=>setModel(e.target.value)}>{entry.models.map(m=><option key={m}>{m}</option>)}</select>:<input value={model} onChange={e=>setModel(e.target.value)} maxLength={120}/>}</label>
    {entry.provider==="openrouter"&&<small>Free routes only: openrouter/free or a model ending in :free.</small>}
    <label className="setting-field"><span><KeyRound size={14}/> New API key (optional)</span><input type="password" autoComplete="new-password" value={key} maxLength={512} placeholder="Leave blank to keep current key" onChange={e=>setKey(e.target.value)}/></label>
    <div className="nas-profile-actions"><button className="secondary-action" disabled={saving||busy} onClick={()=>void save(patch)}>Save</button>
      <button className="secondary-action" disabled={saving||busy||(!entry.configured&&!key.trim())} onClick={()=>void save({...patch,select:true})}>Save &amp; select</button>
      {entry.credentialSource==="nas"&&<button className="secondary-action" disabled={saving||busy} onClick={()=>void save({provider:entry.provider,clearKey:true})}>Remove saved key</button>}
    </div>
    <small>Text chat only in this NAS build. Native tool support not yet verified.</small>
    {message&&<p role="status">{message}</p>}
  </section>;
}
export function NasModels({models,client,onChanged,busy}:{models:Models;client:NasClient;onChanged:(models:Models)=>void;busy:boolean}){
  const [notice,setNotice]=useState("");
  const [saving,setSaving]=useState(false);
  return <>
    <div className="control-page-note"><Cpu size={20}/> Cloud inference runs independently of your PC. Keys are never returned to the browser.</div>
    <div className="settings-section-title">Models &amp; providers</div>
    {models.providers.map(entry=><ProviderForm key={entry.provider} entry={entry} selected={models.provider===entry.provider} client={client} onChanged={onChanged} busy={busy}/>)}
    <div className="settings-section-title">Context and request budgets</div>
    <section className="control-form-section">
      <label className="setting-field">Recent conversation character budget<select value={models.historyChars} disabled={saving||busy} onChange={async e=>{setSaving(true);setNotice("");try{onChanged(await client.saveModels({provider:models.provider,historyChars:Number(e.target.value)}));}catch(error){setNotice(String(error));}finally{setSaving(false);}}}>{[16000,32000,64000].map(n=><option key={n} value={n}>{n.toLocaleString()} characters</option>)}</select></label>
      <small>This is a history budget, not an exact model token window. Retrieved memories and instructions are additional.</small>
      <p>NAS safeguards: NVIDIA 30 requests/min, OpenRouter 15/min and 40 per UTC day, Gemini 5/min. Chat and automatic learning share these budgets. Provider limits may be lower; HTTP 429 pauses that provider for five minutes, with no automatic retry.</p>
      <p>Keys entered here are stored in a restricted server-side file on Beholder, included in private NAS backups. Gemini access depends on your API project's billing and quota settings.</p>
      {notice&&<p role="alert">{notice}</p>}
    </section>
  </>;
}
