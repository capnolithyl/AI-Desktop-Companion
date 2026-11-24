import {useState} from "react";
import {Check,RotateCw,X} from "lucide-react";
import type {LearningStatus,NasClient} from "./nas-client";

export function NasLearningReviews({status,client,onChanged}:{status:LearningStatus;client:NasClient;onChanged:()=>Promise<void>}){
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [confirm,setConfirm]=useState<number|null>(null);
  async function act(work:()=>Promise<unknown>){
    if(working)return;setWorking(true);setError("");
    try{await work();await onChanged();setConfirm(null);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setWorking(false);}
  }
  const kind=(k:string)=>k==="fact"?"About you":k==="canon"?"About Mikan":"Interests";
  return <section className="memory-reviews" aria-label="NAS memory suggestions">
    <div className="memory-review-heading"><strong>Memory suggestions ({status.reviews.length})</strong><button className="secondary-action" disabled={working} onClick={()=>void act(async()=>{})}><RotateCw size={13}/> Refresh</button></div>
    <p className="memory-explainer">The model decides which durable memories to save, suggest for review or skip. Changes to established facts, interests or canon need your approval. Learning uses a separate cloud request for each privacy-eligible completed turn; evidence and permissions are validated before writing.</p>
    <label className="memory-explainer"><input type="checkbox" checked={status.settings.sessions??false} disabled={working} onChange={e=>void act(()=>client.saveLearning({...status.settings,sessions:e.target.checked}))}/> Automatically summarize past conversations using the selected cloud provider</label>
    <p className="memory-explainer">Optional. Sends bounded, privacy-filtered user messages for evidence-backed session notes after six answered turns. Off by default; separate from permanent facts and character canon.</p>
    <p className="memory-explainer">Extraction queue: {status.queued} waiting or processing, {status.failed} requiring attention.
      {status.failed>0&&<button className="secondary-action" disabled={working} onClick={()=>void act(()=>client.retryLearning())}>Retry failed jobs</button>}
    </p>
    {error&&<p className="memory-error" role="alert">{error}</p>}
    {status.lastOutcome&&<details className="memory-session-notes"><summary>Last extraction: {status.lastOutcome.saved} saved, {status.lastOutcome.reviewQueued} suggested</summary>
      {status.lastOutcome.proposed!==undefined&&<p className="memory-explainer">Model proposed {status.lastOutcome.proposed}; {status.lastOutcome.validated??0} passed validation.</p>}
      {status.lastOutcome.entries.map((e,i)=><div key={i} className="memory-item"><small>{kind(e.kind)} · {e.status}</small><p>{e.description}</p><small>Evidence: “{e.evidence}”</small></div>)}
    </details>}
    {status.reviews.map(r=><article className="memory-item" key={r.id}>
      <small>{kind(r.kind)} · {r.kind==="canon"?"Mikan said":"You said"}: “{r.evidence}”</small>
      {r.current&&<p><strong>Currently saved:</strong> {r.current}</p>}
      <p><strong>Suggested:</strong> {r.description}</p>
      <div className="memory-actions">
        {r.targetId!==null&&confirm!==r.id?<button disabled={working} onClick={()=>setConfirm(r.id)}>Review replacement</button>:<button disabled={working} onClick={()=>void act(()=>client.resolveLearning(r.id,"accept"))}><Check size={13}/>{r.targetId!==null?"Confirm replacement":"Save suggestion"}</button>}
        {confirm===r.id&&<button onClick={()=>setConfirm(null)}>Cancel</button>}
        <button disabled={working} onClick={()=>void act(()=>client.resolveLearning(r.id,"dismiss"))}><X size={13}/> Dismiss</button>
      </div>
    </article>)}
    {!!status.history.length&&<details className="memory-session-notes"><summary>Approved corrections ({status.history.length})</summary>{status.history.map(h=><p key={h.id}><small>{kind(h.kind)}</small> {h.previous} → {h.replacement}</p>)}</details>}
  </section>;
}
