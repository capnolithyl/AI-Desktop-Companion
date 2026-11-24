import {useEffect,useState} from "react";
import {RefreshCw,Download,History,AlertTriangle} from "lucide-react";
import type {NasClient,NasUpdateStatus,UpdatePhase} from "./nas-client";
const labels:Record<UpdatePhase,string>={checking:"Checking registry…",current:"Up to date",available:"Update available",installing:"Installing / checking…",deferred:"Waiting for idle or next check",updated:"Update installed",failed:"Update failed", "rolled-back":"Rolled back to previous version"};
const date=(n:number|null|undefined)=>n?new Date(n).toLocaleString():"Not recorded";
export function NasUpdates({client}:{client:NasClient}){
  const [state,setState]=useState<NasUpdateStatus|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [history,setHistory]=useState(false);
  useEffect(()=>{
    let cancelled=false,polling=false;
    const poll=async()=>{
      if(polling)return;polling=true;
      try{const next=await client.updates();if(!cancelled){setState(next);setError("");}}
      catch{if(!cancelled)setError("Update status temporarily unavailable. Retrying…");}
      finally{polling=false;}
    };
    void poll();const timer=window.setInterval(()=>void poll(),3000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[client]);
  const request=async(action:"check"|"install")=>{
    setWorking(true);setError("");
    try{await client.requestUpdate(action);setState(await client.updates());}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  };
  const host=state?.host,waiting=working||!!state?.pending||host?.phase==="checking"||host?.phase==="installing";
  const update=!!host?.available&&host.available!==state?.build.commit;
  return <>
    <div className="control-page-note"><RefreshCw size={20}/> Beholder installs tested experimental builds automatically when idle. Your memories are backed up before each deployment.</div>
    <div className="settings-section-title">Software updates</div>
    <section className="control-form-section">
      <p>Installed version: <strong>{state?.build.version??"Loading…"}</strong> · {state?.build.commit.slice(0,8)}</p>
      <p>Channel: Experimental · Automatic checks every five minutes</p>
      <p role="status">{state?.pending?"Queued: "+state.pending:host?labels[host.phase]:"Waiting for host updater connection"}</p>
      {host&&<><p>Latest known build: {host.available?.slice(0,8)??"Unknown"}</p><p>Last checked: {date(host.checkedAt)}</p><p>Last recorded deployment backup: {date(host.lastBackup)}</p></>}
      {state&&!host&&<p className="settings-note">The host update-control task must be installed once. Existing automatic updates still work.</p>}
      {error&&<p role="alert"><AlertTriangle size={14}/> {error}</p>}
      <div className="nas-profile-actions">
        <button className="secondary-action" disabled={!host||waiting} onClick={()=>void request("check")}><RefreshCw size={15}/> Check for updates</button>
        <button className="secondary-action" disabled={!host||waiting||!update} onClick={()=>void request("install")}><Download size={15}/> Install now</button>
        <button className="secondary-action" onClick={()=>setHistory(v=>!v)}><History size={15}/> {history?"Hide":"View"} update history</button>
      </div>
      <small>Manual requests are picked up at the next host task run. Active replies are never interrupted; reload when the new build is ready.</small>
      {history&&<div>{host?.history.length?host.history.map((entry,i)=><p key={entry.at+":"+i}>{date(entry.at)} · {labels[entry.phase]} · {entry.installed?.slice(0,8)??"Unknown"}</p>):<p>No recorded deployment history yet.</p>}</div>}
    </section>
  </>;
}
