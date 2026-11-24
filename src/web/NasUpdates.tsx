import {useEffect,useState} from "react";
import {RefreshCw,Download,History,AlertTriangle,ShieldCheck,FlaskConical,Check,ChevronRight} from "lucide-react";
import type {NasClient,NasUpdateStatus,UpdatePhase,UpdateAction,UpdateChannel} from "./nas-client";
const labels:Record<UpdatePhase,string>={checking:"Checking registry…",current:"Up to date",available:"Update available",installing:"Installing / checking…",deferred:"Waiting for idle or next check",updated:"Update installed",failed:"Update failed", "rolled-back":"Rolled back to previous version"};
const date=(n:number|null|undefined)=>n?new Date(n).toLocaleString():"Not recorded";
const channels=[
  {id:"stable",name:"Stable",branch:"main",description:"Reliable, approved releases for everyday use.",icon:ShieldCheck},
  {id:"preview",name:"Experimental",branch:"preview",description:"Try new features and brain experiments before release.",icon:FlaskConical},
] as const;
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
    <section className="control-form-section nas-updates">
      <p>Installed version: <strong>{state?.build.version??"Loading…"}</strong> · {state?.build.commit.slice(0,8)}</p>
      <p>Selected channel: <strong>{host?.channel==="preview"?"Experimental":"Stable"}</strong> · Automatic checks every five minutes</p>
      {host?.channel?<><fieldset className="nas-channel-picker" disabled={waiting}>
        <legend>Update channel</legend>
        <div className="nas-channel-grid">
          {channels.map(({id,name,branch,description,icon:Icon})=><label key={id} className={"nas-channel-card"+(chosen===id?" is-selected":"")}>
            <input type="radio" name="nas-update-channel" value={id} checked={chosen===id} onChange={()=>setSelection(id)}/>
            <span className="nas-channel-icon"><Icon size={23} strokeWidth={1.7}/></span>
            <span className="nas-channel-copy">
              <span className="nas-channel-title">{name}{host.channel===id&&<span className="nas-channel-active">Active</span>}</span>
              <span className="nas-channel-description">{description}</span>
              <code className="nas-channel-branch">{branch}</code>
            </span>
            <span className="nas-channel-radio" aria-hidden="true">{chosen===id&&<Check size={13} strokeWidth={2.5}/>}</span>
          </label>)}
        </div>
      </fieldset>
      {chosen!==host.channel&&<div className="nas-channel-confirm"><div className="nas-channel-warning"><AlertTriangle size={19}/><div><strong>{chosen==="preview"?"Try experimental builds?":"Return to stable?"}</strong><small>{chosen==="preview"?"Preview builds may have regressions. You'll receive future preview updates automatically.":"Return to main with your current data. Preview database changes must be backward-compatible."} Your data is backed up before deployment.</small></div></div><div className="nas-channel-confirm-actions"><button type="button" className="secondary-action" disabled={waiting} onClick={()=>setSelection(null)}>Cancel</button><button type="button" className="nas-channel-switch" disabled={waiting} onClick={()=>void request(chosen==="preview"?"switch-preview":"switch-stable")}>Switch and install {chosen==="preview"?"experimental":"stable"} <ChevronRight size={16}/></button></div></div>}</>:host&&<p className="settings-note">Channel switching requires a one-time upgrade of both root-owned host updater scripts. Stable updates remain active.</p>}
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
