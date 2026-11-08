import { useState } from "react";
import { ArrowLeft, RefreshCw, Search, Sparkles } from "lucide-react";
import { CAPABILITIES, CAPABILITY_RELEASE, capabilityState, type RuntimeReadiness } from "./self-knowledge";

export function CapabilitiesPanel({
  onClose, onRefresh, onAsk, health, checking
}:{
  onClose:()=>void;
  onRefresh:()=>void;
  onAsk:(query:string)=>void;
  health:RuntimeReadiness;
  checking:boolean;
}){
  const [filter,setFilter]=useState("");
  const terms=filter.toLowerCase().trim();
  const matches=CAPABILITIES.filter(feature=>!terms||[
    feature.label,feature.description,feature.category,...feature.keywords
  ].join(" ").toLowerCase().includes(terms));
  const totalBuilt=CAPABILITIES.filter(f=>f.stage!=="planned").length;
  return <section className="drawer" role="dialog" aria-label="Mikan capabilities">
    <header className="drawer-header">
      <button className="back-button" title="Back to companion" onClick={onClose}><ArrowLeft size={19}/></button>
      <div className="drawer-title"><strong>My capabilities</strong>
        <span>Desktop v{CAPABILITY_RELEASE} · {totalBuilt} built or experimental · {CAPABILITIES.length-totalBuilt} planned</span>
      </div>
      <button type="button" className="secondary-action" title="Recheck local services"
        onClick={onRefresh} disabled={checking}>
        <RefreshCw size={14} className={checking?"spin":undefined}/> Check
      </button>
    </header>
    <div className="capability-search">
      <Search size={15}/>
      <input value={filter} onChange={e=>setFilter(e.target.value)}
        placeholder="Find a feature…" aria-label="Filter Mikan capabilities"/>
    </div>
    <div className="capability-list">
      {!matches.length&&<p>No matching features in this build's registry.</p>}
      {matches.map(feature=><article key={feature.id} className="capability-card">
        <div className="capability-card-head">
          <strong>{feature.label}</strong>
          <span className="capability-stage">{feature.stage}</span>
        </div>
        <p>{feature.description}</p>
        <div className="capability-foot">
          <span>{capabilityState(feature,health)}</span>
          {feature.stage!=="planned"&&<button type="button" title={"Ask Mikan about "+feature.label}
            onClick={()=>onAsk("How does your "+feature.label.toLowerCase()+" work?")}>
            <Sparkles size={13}/> Ask
          </button>}
        </div>
      </article>)}
    </div>
    <footer className="drawer-footer">
      Source and docs are a read-only snapshot of this installer. Runtime indicators refresh on request; no self-editing permissions.
    </footer>
  </section>;
}
