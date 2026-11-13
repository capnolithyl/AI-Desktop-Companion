import { useMemo, useState, type ChangeEvent } from "react";
import { Check, FileUp, Plus, Trash2, X } from "lucide-react";
import type { InterestItem } from "./memory-client";
import { parseTags } from "./memory-import";
import {
  INTEREST_KINDS, INTEREST_STATUSES, interestKey, parseInterests,
  type ImportFormat, type IncomingInterest, type InterestKind, type InterestStatus
} from "./interest-import";

type Props = {
  items: InterestItem[];
  onImport: (items: IncomingInterest[]) => Promise<{inserted:number;duplicates:number}>;
  onEdit: (id:number, item:IncomingInterest) => Promise<void>;
  onDelete: (id:number) => Promise<void>;
};
const nameOf = (value:string) => value.replace(/^./,s=>s.toUpperCase());
const empty: IncomingInterest={name:"",kind:"band",status:"unknown",rating:null,notes:"",tags:[]};
function entryOf(value:InterestItem): IncomingInterest {
  return {name:value.name,kind:value.kind,status:value.status,rating:value.rating,
    notes:value.notes,tags:[...value.tags]};
}
export function InterestCollectionTab({items,onImport,onEdit,onDelete}:Props){
  const [format,setFormat]=useState<ImportFormat>("text");
  const [content,setContent]=useState("");
  const [kind,setKind]=useState<InterestKind>("band");
  const [status,setStatus]=useState<InterestStatus>("unknown");
  const [rows,setRows]=useState<IncomingInterest[]>([]);
  const [excluded,setExcluded]=useState<Set<number>>(()=>new Set());
  const [editing,setEditing]=useState<number|null>(null);
  const [entry,setEntry]=useState<IncomingInterest>(empty);
  const [addTags,setAddTags]=useState("");
  const [editingEntry,setEditingEntry]=useState<IncomingInterest>(empty);
  const [editTags,setEditTags]=useState("");
  const [search,setSearch]=useState("");
  const [filterKind,setFilterKind]=useState<string>("all");
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<string|null>(null);
  const [working,setWorking]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState<number|null>(null);
  const existing=useMemo(()=>new Set(items.map(interestKey)),[items]);
  const duplicates=useMemo(()=>{
    const seen=new Set(existing),found=new Set<number>();
    rows.forEach((row,i)=>{const key=interestKey(row);if(seen.has(key))found.add(i);else seen.add(key);});
    return found;
  },[rows,existing]);
  const chosen=rows.filter((_,i)=>!duplicates.has(i)&&!excluded.has(i));
  const filtered=items.filter(item=>(filterKind==="all" || item.kind===filterKind) &&
    [item.name,item.kind,item.status,item.notes,...item.tags].join(" ").toLowerCase().includes(search.toLowerCase()));

  function preview(text=content,mode=format){
    try{
      const parsed=parseInterests(text,mode,{kind,status});
      setRows(parsed);setExcluded(new Set());setError(null);setResult(null);
    }catch(e){setRows([]);setError(String(e instanceof Error?e.message:e));}
  }
  async function chooseFile(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    if(file.size>3_000_000){setError("File must be under 3 MB");return;}
    const ext=file.name.toLowerCase().split(".").pop();
    const mode:ImportFormat=ext==="json"?"json":ext==="csv"?"csv":"text";
    if(!["json","csv","txt","md"].includes(ext??"")){
      setError("Choose JSON, CSV, TXT or Markdown");return;
    }
    try{const raw=await file.text();setContent(raw);setFormat(mode);preview(raw,mode);}
    catch(e){setError(String(e));}
  }
  async function run(work:()=>Promise<void>){
    if(working)return;
    setWorking(true);setError(null);setResult(null);
    try{await work();}catch(e){setError(String(e instanceof Error?e.message:e));}
    finally{setWorking(false);}
  }
  function updateRow(index:number,patch:Partial<IncomingInterest>){
    setRows(current=>current.map((item,i)=>index===i?{...item,...patch}:item));
  }
  async function importRows(){
    await run(async()=>{
      if(!chosen.length)throw Error("No new entries selected");
      const outcome=await onImport(chosen);
      setResult(`Added ${outcome.inserted} interests. ${duplicates.size+outcome.duplicates} duplicates skipped.`);
      setRows([]);setContent("");
    });
  }

  return <>
    <p className="memory-explainer">
      Your music, anime, movies, shows, games and books live here rather than in core identity memories.
      "Experienced" means watched, listened, read or played, <strong>not</strong> automatically liked.
      Mikan retrieves only relevant entries for a conversation.
    </p>
    <details className="memory-import" open={false}>
      <summary><FileUp size={16}/> Bulk import interests (JSON / CSV / text)</summary>
      <p>JSON fields: name, kind, status, rating (0–10), notes, tags. CSV needs a name or title column.
        Plain text accepts one title per line. Existing matching titles within the same kind are preserved.</p>
      <div className="memory-import-controls">
        <label>Default kind (for text or missing columns)
          <select value={kind} onChange={e=>{setKind(e.target.value as InterestKind);setRows([]);}}>
            {INTEREST_KINDS.map(k=><option key={k} value={k}>{nameOf(k)}</option>)}
          </select>
        </label>
        <label>Default relationship
          <select value={status} onChange={e=>{setStatus(e.target.value as InterestStatus);setRows([]);}}>
            {INTEREST_STATUSES.map(s=><option key={s} value={s}>{nameOf(s)}</option>)}
          </select>
        </label>
        <label>Import a file
          <input type="file" accept=".json,.csv,.txt,.md" disabled={working} onChange={e=>void chooseFile(e)}/>
        </label>
        <label>Paste format
          <select value={format} onChange={e=>{setFormat(e.target.value as ImportFormat);setRows([]);}}>
            <option value="text">One title per line</option><option value="json">JSON</option><option value="csv">CSV</option>
          </select>
        </label>
        <textarea rows={4} value={content} disabled={working} aria-label="Interest import content"
          placeholder={"Bathory\nEmperor\nSonata Arctica"}
          onChange={e=>{setContent(e.target.value);setRows([]);}}/>
        <button type="button" className="secondary-action" disabled={working||!content.trim()}
          onClick={()=>preview()}><Plus size={14}/> Preview</button>
      </div>
      {rows.length>0 && <>
        <div className="memory-import-summary"><strong>{chosen.length} new entries ready</strong>
          <span>{duplicates.size} duplicate titles skipped · {rows.length} total rows</span></div>
        <p className="memory-explainer">Review the preview below before importing. Only the first 60 rows are displayed; the full file is imported.</p>
        <div className="memory-import-preview">
          {rows.slice(0,60).map((row,i)=><div className="memory-import-row" key={i}>
            <label className="memory-import-fact">
              <input type="checkbox" checked={!duplicates.has(i)&&!excluded.has(i)}
                disabled={working||duplicates.has(i)} onChange={e=>setExcluded(old=>{
                  const next=new Set(old);if(e.target.checked)next.delete(i);else next.add(i);return next;
                })}/>
              <span>{row.name}</span>
              <small>{duplicates.has(i)?"Already saved":""}</small>
            </label>
            {!duplicates.has(i) && <div className="memory-import-row-controls">
              <label>Kind <select value={row.kind} disabled={working}
                onChange={e=>updateRow(i,{kind:e.target.value as InterestKind})}>
                {INTEREST_KINDS.map(v=><option key={v} value={v}>{nameOf(v)}</option>)}
              </select></label>
              <label>Relationship <select value={row.status} disabled={working}
                onChange={e=>updateRow(i,{status:e.target.value as InterestStatus})}>
                {INTEREST_STATUSES.map(v=><option key={v} value={v}>{nameOf(v)}</option>)}
              </select></label>
              <label>Rating (0–10) <input type="number" min="0" max="10" step=".5" value={row.rating??""}
                onChange={e=>updateRow(i,{rating:e.target.value===""?null:Number(e.target.value)})}/></label>
            </div>}
          </div>)}
        </div>
        <button className="save-button memory-import-confirm" type="button"
          disabled={working||!chosen.length} onClick={()=>void importRows()}>
          <Check size={14}/> Import {chosen.length} interests
        </button>
      </>}
    </details>
    <form className="memory-add collection-add" onSubmit={e=>{
      e.preventDefault();
      void run(async()=>{
        if(!entry.name.trim())throw Error("Enter a title");
        const result=await onImport([{...entry,tags:parseTags(addTags)}]);
        if(!result.inserted)throw Error("Already in your collection. Edit the existing entry.");
        setEntry(empty);setAddTags("");setResult("Interest saved.");
      });
    }}>
      <input aria-label="Interest title" placeholder="Add a band, anime, film…" maxLength={180}
        value={entry.name} onChange={e=>setEntry(v=>({...v,name:e.target.value}))}/>
      <div className="memory-import-row-controls">
        <label>Kind <select value={entry.kind} onChange={e=>setEntry(v=>({...v,kind:e.target.value as InterestKind}))}>
          {INTEREST_KINDS.map(v=><option key={v} value={v}>{nameOf(v)}</option>)}
        </select></label>
        <label>Relationship <select value={entry.status} onChange={e=>setEntry(v=>({...v,status:e.target.value as InterestStatus}))}>
          {INTEREST_STATUSES.map(v=><option key={v} value={v}>{nameOf(v)}</option>)}
        </select></label>
        <label>Rating <input type="number" min="0" max="10" step=".5" value={entry.rating??""}
          onChange={e=>setEntry(v=>({...v,rating:e.target.value===""?null:Number(e.target.value)}))}/></label>
      </div>
      <label>Notes <textarea rows={2} maxLength={500} value={entry.notes}
        onChange={e=>setEntry(v=>({...v,notes:e.target.value}))}/></label>
      <label>Tags (comma-separated) <input value={addTags} maxLength={300}
        onChange={e=>setAddTags(e.target.value)}/></label>
      <button className="save-button" type="submit" disabled={working||!entry.name.trim()}>
        <Plus size={15}/> Add interest</button>
    </form>
    {error && <p className="memory-error" role="alert">{error}</p>}
    {result && <p className="memory-import-success" role="status"><Check size={14}/>{result}</p>}
    <div className="memory-filter">
      <input aria-label="Search interests" placeholder="Search your collections" value={search}
        onChange={e=>setSearch(e.target.value)}/>
      <select value={filterKind} aria-label="Filter collection kind" onChange={e=>setFilterKind(e.target.value)}>
        <option value="all">All types</option>
        {INTEREST_KINDS.map(v=><option key={v} value={v}>{nameOf(v)}</option>)}
      </select>
      <small>{filtered.length} of {items.length} entries</small>
    </div>
    {filtered.slice(0,100).map(item=><article className="memory-item" key={item.id}>
      {editing===item.id ? <>
        <div className="character-form character-edit">
          <input aria-label="Edit interest title" value={editingEntry.name} maxLength={180}
            onChange={e=>setEditingEntry(v=>({...v,name:e.target.value}))}/>
          <div className="memory-import-row-controls">
            <label>Kind <select value={editingEntry.kind}
              onChange={e=>setEditingEntry(v=>({...v,kind:e.target.value as InterestKind}))}>
              {INTEREST_KINDS.map(v=><option key={v} value={v}>{nameOf(v)}</option>)}
            </select></label>
            <label>Relationship <select value={editingEntry.status}
              onChange={e=>setEditingEntry(v=>({...v,status:e.target.value as InterestStatus}))}>
              {INTEREST_STATUSES.map(v=><option key={v} value={v}>{nameOf(v)}</option>)}
            </select></label>
            <label>Rating <input type="number" min="0" max="10" step=".5" value={editingEntry.rating??""}
              onChange={e=>setEditingEntry(v=>({...v,rating:e.target.value===""?null:Number(e.target.value)}))}/></label>
          </div>
          <label>Notes <textarea rows={2} maxLength={500} value={editingEntry.notes}
            onChange={e=>setEditingEntry(v=>({...v,notes:e.target.value}))}/></label>
          <label>Tags (comma-separated) <input value={editTags}
            onChange={e=>setEditTags(e.target.value)}/></label>
        </div>
        <div className="memory-actions">
          <button disabled={working} onClick={()=>void run(async()=>{await onEdit(item.id,{...editingEntry,tags:parseTags(editTags)});setEditing(null);})}><Check size={13}/> Save</button>
          <button onClick={()=>setEditing(null)}><X size={13}/> Cancel</button>
        </div>
      </> : <>
        <div className="character-item-header"><strong>{item.name}</strong>
          <span>{nameOf(item.kind)} · {nameOf(item.status)}{item.rating!==null?` · ${item.rating}/10`:""}</span></div>
        {item.notes && <p>{item.notes}</p>}
        {!!item.tags.length && <div className="memory-labels">{item.tags.map(tag=><span key={tag}>#{tag}</span>)}</div>}
        <div className="memory-actions">
          <button type="button" disabled={working} onClick={()=>{setEditing(item.id);setEditingEntry(entryOf(item));setEditTags(item.tags.join(", "));}}>Edit</button>
          {confirmDelete===item.id ? <>
            <button type="button" className="memory-danger" disabled={working}
              onClick={()=>void run(async()=>{await onDelete(item.id);setConfirmDelete(null);})}>Confirm delete</button>
            <button type="button" onClick={()=>setConfirmDelete(null)}>Cancel</button>
          </> : <button type="button" disabled={working} onClick={()=>setConfirmDelete(item.id)}><Trash2 size={13}/> Delete</button>}
        </div>
      </>}
    </article>)}
    {filtered.length>100 && <p className="memory-explainer">Showing 100 matches. Search or filter to find more.</p>}
  </>;
}
