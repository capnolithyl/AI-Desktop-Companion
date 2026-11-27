import {useEffect,useState} from "react";
import type {NasClient,ImportCategory,HindsightImportStatus,HindsightImportPreview} from "./nas-client";
const sections:{id:ImportCategory;label:string;detail:string}[]=[
  {id:"facts",label:"About You",detail:"Saved personal facts, tags, dates and pins"},
  {id:"interests",label:"Interests",detail:"Ratings, statuses, notes and preferences"},
  {id:"character",label:"About Mikan",detail:"Fictional character canon in a separate bank"},
  {id:"summaries",label:"Chat summaries",detail:"Existing derived session summaries"},
  {id:"messages",label:"Historical owner messages (optional)",detail:"Original user messages only; not assistant replies. Can use substantial LLM quota."}
];
export function NasHindsightImport({client,active,dailyBatches,batchesToday}:{client:NasClient;active:boolean;dailyBatches:number;batchesToday:number}){
  const [categories,setCategories]=useState<ImportCategory[]>(["facts","interests","character","summaries"]),[preview,setPreview]=useState<HindsightImportPreview|null>(null),[status,setStatus]=useState<HindsightImportStatus|null>(null),[consent,setConsent]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState("");
  useEffect(()=>{let live=true;const poll=async()=>{try{const s=await client.hindsightImport();if(live)setStatus(s);}catch(e){if(live)setError(String(e));}};void poll();const timer=setInterval(()=>void poll(),5000);return()=>{live=false;clearInterval(timer);};},[client]);
  async function inspect(page=0){setWorking(true);setError("");try{const p=await client.previewHindsightImport(categories,page);if(preview&&preview.digest!==p.digest)setConsent(false);setPreview(p);}catch(e){setError(String(e));setPreview(null);}finally{setWorking(false);}}
  async function action(name:string,args:object={}){setWorking(true);setError("");try{setStatus(await client.changeHindsightImport(name,args));if(name==="start"||name==="discard"){setPreview(null);setConsent(false);}}catch(e){setError(String(e));}finally{setWorking(false);}}
  const pending=!!status&&(status.queued>0||status.sending>0);
  return <><div className="settings-section-title">Import existing memories</div>
    <section className="control-form-section">
      <p>Build native Hindsight ZIP archives from existing SQLite records and import their facts directly on Beholder. No extraction LLM is needed for the first four categories. Original records stay intact. This is a one-time copy, not automatic edit/delete synchronization.</p>
      {!active&&<p className="settings-note">Save Hindsight + Local retrieval to start or resume an import.</p>}
      {sections.map(s=><label key={s.id}><input type="checkbox" checked={categories.includes(s.id)} disabled={working||pending} onChange={e=>{setCategories(old=>e.target.checked?[...old,s.id]:old.filter(c=>c!==s.id));setPreview(null);setConsent(false);}}/>{s.label}<small>{s.detail}</small></label>)}
      <p className="settings-note">Curated records and summaries bypass extraction and are indexed locally. Hindsight consolidation and dreams may still send approved facts to its configured LLM. Optional historical owner messages require extraction and use the normal quota. Recognized credentials are blocked; historical messages and summaries also use the existing privacy filter. No raw assistant messages are imported. Skipped and changed records are reported rather than silently overwritten.</p>
      <button className="secondary-action" disabled={working||!categories.length||pending} onClick={()=>void inspect()}>Preview import</button>
      {preview&&<><p><strong>{preview.ready} new eligible records / {preview.total} reviewed records</strong></p>
        {sections.filter(s=>preview.counts[s.id]).map(s=><p key={s.id}>{s.label}: {preview.counts[s.id]?.ready} ready · {preview.counts[s.id]?.blocked} blocked/requires review · {preview.counts[s.id]?.total} total</p>)}
        <details open><summary>Review source records ({preview.page+1}/{preview.pages})</summary>{preview.rows.map(r=><details key={r.key}><summary>{r.key} · {r.status}</summary>{r.reason&&<p>{r.reason}</p>}{r.text&&<p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{r.text}</p>}</details>)}
        <button className="secondary-action" disabled={working||preview.page===0} onClick={()=>void inspect(preview.page-1)}>Previous</button><button className="secondary-action" disabled={working||preview.page+1>=preview.pages} onClick={()=>void inspect(preview.page+1)}>Next</button></details>
      </>}
      <label><input type="checkbox" checked={consent} disabled={working} onChange={e=>setConsent(e.target.checked)}/> I approve this import and possible cloud LLM processing of the selected records during consolidation, dreaming or optional historical message extraction.</label>
      {preview&&<button className="save-button" disabled={working||!active||!consent||!preview.ready||pending||!!status?.uncertain} onClick={()=>void action("start",{categories,digest:preview.digest,consent})}>Start approved import</button>}
      {error&&<p role="alert">{error}</p>}
    </section>
    {status&&<section className="control-form-section">
      <strong>{status.sending?(status.archivePending?"Hindsight indexing archive…":"Submitting batch…"):status.uncertain?"Needs review":status.enabled?(batchesToday>=dailyBatches&&status.queued===status.byCategory.messages.queued?"Historical messages waiting for daily budget":"Import queued (runs when idle)"):status.queued?"Paused":"Import progress"}</strong>
      <progress max={Math.max(1,status.queued+status.sending+status.done+status.uncertain+status.skipped)} value={status.done+status.skipped+status.uncertain}/>
      <p>{status.done} imported · {status.queued} queued · {status.sending} sending · {status.skipped} skipped · {status.uncertain} uncertain</p>
      {sections.map(s=>{const c=status.byCategory[s.id];return c&&Object.values(c).some(Boolean)?<p key={s.id}>{s.label}: {c.done} imported / {c.queued+c.sending+c.done+c.uncertain+c.skipped} approved</p>:null;})}
      <p className="settings-note">Native archives contain up to 64 records per batch and do not use the daily retain limit. Optional raw owner messages share the retain budget ({batchesToday}/{dailyBatches}). Runs after 60 seconds of chat inactivity; native operation IDs survive restart. Consolidation may still use LLM tokens. No automatic retries of uncertain writes.</p>
      {status.enabled&&<button className="secondary-action" disabled={working} onClick={()=>void action("pause")}>Pause after current batch</button>}
      {!status.enabled&&status.queued>0&&<button className="save-button" disabled={working||!active||!consent||!!status.uncertain} onClick={()=>void action("resume",{consent})}>Resume approved import</button>}
      {status.queued>0&&<button className="secondary-action" disabled={working||!!status.sending} onClick={()=>void action("discard")}>Discard pending queue</button>}
      {status.issues.map(issue=><details key={issue.key}><summary>{issue.key} · {issue.status}</summary><p>{issue.reason}</p><p style={{overflowWrap:"anywhere"}}>Bank: {issue.bank}<br/>Document: {issue.documentId}</p>{issue.status==="uncertain"&&<><p>Inspect the document in private Hindsight management before confirming. Skipping does not delete an already retained document.</p><button className="secondary-action" disabled={working||!consent} onClick={()=>void action("acknowledge",{key:issue.key,decision:"confirmed"})}>I verified the document exists</button><button className="secondary-action" disabled={working} onClick={()=>void action("acknowledge",{key:issue.key,decision:"skip"})}>Skip without retry</button></>}</details>)}
    </section>}
  </>;
}
