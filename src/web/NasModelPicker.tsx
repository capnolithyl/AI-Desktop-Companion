import {useId,useRef,useState} from "react";
import {Check,ChevronDown,Search,X,Layers,RefreshCw} from "lucide-react";
import type {CloudProvider,ProviderEntry} from "./nas-client";
import {filterModels,modelChoiceKey,providerNames,readableModelName,type ModelChoice} from "./nas-model-catalog";

type Props={entries:ProviderEntry[];current:ModelChoice;onSelect:(choice:ModelChoice)=>void;disabled?:boolean;label?:string;onRefresh?:()=>Promise<void>};
const PAGE_SIZE=60;
export function NasModelPicker({entries,current,onSelect,disabled=false,label="Choose inference model",onRefresh}:Props){
  const dialog=useRef<HTMLDialogElement>(null),search=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const heading=useId();
  const [provider,setProvider]=useState<CloudProvider|"all">(current.provider),[query,setQuery]=useState(""),[limit,setLimit]=useState(PAGE_SIZE);
  const [refreshing,setRefreshing]=useState(false),[error,setError]=useState(""),[opened,setOpened]=useState(false);
  const available=entries.filter(e=>e.models.length>0);
  const activeFilter=provider==="all"||available.some(e=>e.provider===provider)?provider:"all";
  const results=opened?filterModels(available,activeFilter,query,current):[];
  const key=modelChoiceKey(current);
  function open(){
    setProvider(available.some(e=>e.provider===current.provider)?current.provider:"all");
    setQuery("");setLimit(PAGE_SIZE);setError("");
    dialog.current?.showModal();setOpened(true);
    // Do not summon Android’s keyboard until the owner taps search.
    if(!window.matchMedia("(pointer: coarse)").matches)search.current?.focus({preventScroll:true});
  }
  async function refresh(){if(!onRefresh)return;setRefreshing(true);setError("");try{await onRefresh();setLimit(PAGE_SIZE);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setRefreshing(false);}}
  return <div className="nas-model-picker">
    <button ref={trigger} type="button" className="nas-model-trigger" aria-label={label+": "+providerNames[current.provider]+" "+current.model} aria-haspopup="dialog" disabled={disabled||!available.length} onClick={open}>
      <Layers size={17} aria-hidden="true"/><span><strong>{readableModelName(current.model)}</strong><small>{providerNames[current.provider]}</small></span><ChevronDown size={17} aria-hidden="true"/>
    </button>
    <dialog ref={dialog} className="nas-model-dialog" aria-labelledby={heading} onClose={()=>{setOpened(false);trigger.current?.focus({preventScroll:true});}} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
      <div className="nas-model-dialog-inner">
        <header className="nas-model-dialog-header"><div><h2 id={heading}>{label}</h2><small>Select a provider or search its models.</small></div><button type="button" aria-label="Close model picker" className="nas-model-close" onClick={()=>dialog.current?.close()}><X size={20}/></button></header>
        <div className="nas-model-filters" role="group" aria-label="Filter providers">
          {available.length>1&&<button type="button" aria-pressed={activeFilter==="all"} onClick={()=>{setProvider("all");setLimit(PAGE_SIZE);}}>All providers</button>}
          {available.map(e=><button key={e.provider} type="button" aria-pressed={activeFilter===e.provider} onClick={()=>{setProvider(e.provider);setLimit(PAGE_SIZE);}}>{providerNames[e.provider]} <small>{e.models.length}</small></button>)}
        </div>
        <div className="nas-model-search"><Search size={18} aria-hidden="true"/><input ref={search} type="search" aria-label="Search model names" placeholder="Search models…" value={query} onChange={e=>{setQuery(e.target.value);setLimit(PAGE_SIZE);}}/></div>
        <div className="nas-model-count"><span aria-live="polite">{results.length} {results.length===1?"model":"models"}</span>{onRefresh&&available.some(e=>e.provider==="arli")&&(activeFilter==="all"||activeFilter==="arli")&&<button type="button" className="nas-model-refresh" disabled={disabled||refreshing} onClick={()=>void refresh()}><RefreshCw size={14}/>{refreshing?"Refreshing…":"Refresh Arli"}</button>}</div>
        {error&&<p role="alert" className="nas-model-error">{error}</p>}
        <div className="nas-model-results">
          {results.slice(0,limit).map(choice=>{const selected=modelChoiceKey(choice)===key;return <button key={modelChoiceKey(choice)} type="button" className="nas-model-option" aria-pressed={selected} disabled={disabled||refreshing} onClick={()=>{dialog.current?.close();if(!selected)onSelect(choice);}}><span><strong>{readableModelName(choice.model)}</strong><small>{providerNames[choice.provider]} · {choice.model}</small></span>{selected&&<Check size={19} aria-label="Selected"/>}</button>;})}
          {!results.length&&<p className="nas-model-empty">No matches. Try a different search or provider.</p>}
          {results.length>limit&&<button type="button" className="nas-model-more" onClick={()=>setLimit(n=>n+PAGE_SIZE)}>Show more ({results.length-limit} remaining)</button>}
        </div>
      </div>
    </dialog>
  </div>;
}
