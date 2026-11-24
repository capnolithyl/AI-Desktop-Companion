import {useEffect,useState} from "react";
import {RefreshCw,Download,History,AlertTriangle} from "lucide-react";
import type {NasClient,NasUpdateStatus,UpdatePhase,UpdateAction,UpdateChannel} from "./nas-client";
const labels:Record<UpdatePhase,string>={checking:"Checking registry…",current:"Up to date",available:"Update available",installing:"Installing / checking…",deferred:"Waiting for idle or next check",updated:"Update installed",failed:"Update failed", "rolled-back":"Rolled back to previous version"};
const date=(n:number|null|undefined)=>n?new Date(n).toLocaleString():"Not recorded";
export function NasUpdates({client}:{client:NasClient}){
  const [state,setState]=useState<NasUpdateStatus|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [pollError,setPollError]=useState("");
  const [history,setHistory]=useState(false);
  const [selection,setSelection]=useState<UpdateChannel|null>(null);
  useEffect(()=>{
    let cancelled=false,polling=false;
    const poll=async()=>{
      if(polling)return;polling=true;
      try{const next=await client.updates();if(!cancelled){setState(next);setPollError("");}}
      catch{if(!cancelled)setPollError("Update status temporarily unavailable. Retrying…");}
      finally{polling=false;}
    };
    void poll();const timer=window.setInterval(()=>void poll(),3000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[client]);
  const request=async(action:UpdateAction)=>{
    setWorking(true);setError("");
    try{await client.requestUpdate(action);setSelection(null);setState(await client.updates());}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  };
  const host=state?.host,waiting=working||!!state?.pending||host?.phase==="checking"||host?.phase==="installing";
  const chosen=selection??host?.channel??"stable";
  const update=!!host?.available&&(host.phase==="available"||host.available!==state?.build.commit)&&host.phase!=="failed"&&host.phase!=="rolled-back";
  return <>
    <div className="control-page-note"><RefreshCw size={20}/> Beholder installs tested builds from your selected channel automatically when idle. Your memories are backed up before each deployment.</div>
    <div className="settings-section-title">Software updates</div>
    <section className="control-form-section">
      <p>Installed version: <strong>{state?.build.version??"Loading…"}</strong> · {state?.build.commit.slice(0,8)}</p>
      <p>Selected channel: <strong>{host?.channel==="preview"?"Experimental":"Stable"}</strong> · Automatic checks every five minutes</p>
      {host?.channel?<><label className="settings-note">Update channel <select value={chosen} disabled={waiting} onChange={e=>setSelection(e.target.value as UpdateChannel)}><option value="stable">Stable (main)</option><option value="preview">Experimental (preview)</option></select></label>
      {chosen!==host.channel&&<div className="control-page-note"><AlertTriangle size={18}/> {chosen==="preview"?"Experimental builds may have regressions. This opts into future preview updates.":"Return to main while preserving the current data. Only backward-compatible preview database changes are allowed."} <button className="secondary-action" disabled={waiting} onClick={()=>void request(chosen==="preview"?"switch-preview":"switch-stable")}>Switch and install {chosen==="preview"?"experimental":"stable"}</button></div>}</>:host&&<p className="settings-note">Channel switching requires a one-time upgrade of both root-owned host updater scripts. Stable updates remain active.</p>}
      <p role="status">{state?.pending?"Queued: "+state.pending:host?labels[host.phase]:"Waiting for host updater connection"}</p>
      {host&&<><p>Latest known build: {host.available?.slice(0,8)??"Unknown"}</p><p>Last checked: {date(host.checkedAt)}</p><p>Last recorded deployment backup: {date(host.lastBackup)}</p></>}
      {state&&!host&&<p className="settings-note">The host update-control task must be installed once. Existing automatic updates still work.</p>}
      {(error||pollError)&&<p role="alert"><AlertTriangle size={14}/> {error||pollError}</p>}
      <div className="nas-profile-actions">
        <button className="secondary-action" disabled={!host||waiting} onClick={()=>void request("check")}><RefreshCw size={15}/> Check for updates</button>
        <button className="secondary-action" disabled={!host||waiting||!update} onClick={()=>void request("install")}><Download size={15}/> Install now</button>
        <button className="secondary-action" onClick={()=>setHistory(v=>!v)}><History size={15}/> {history?"Hide":"View"} update history</button>
      </div>
      <small>Manual requests are picked up at the next host task run. Active replies are never interrupted; reload when the new build is ready.</small>
      {history&&<div>{host?.history.length?host.history.map((entry,i)=><p key={entry.at+":"+i}>{date(entry.at)} · {labels[entry.phase]} · {entry.channel==="preview"?"Experimental":"Stable"} · {entry.installed?.slice(0,8)??"Unknown"}</p>):<p>No recorded deployment history yet.</p>}</div>}
    </section>
  </>;
}
