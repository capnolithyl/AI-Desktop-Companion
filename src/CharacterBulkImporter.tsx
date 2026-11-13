import { useMemo, useState, type ChangeEvent } from "react";
import { Check, FileUp, Plus } from "lucide-react";
import type { CharacterFact } from "./memory-client";
import { CANON_CATEGORIES, canonKey, parseCanon, type ImportFormat, type IncomingCanon } from "./interest-import";

type Props = {
  facts:CharacterFact[];
  onImport:(rows:IncomingCanon[])=>Promise<{inserted:number;duplicates:number}>;
};
export function CharacterBulkImporter({facts,onImport}:Props){
  const [content,setContent]=useState("");
  const [format,setFormat]=useState<ImportFormat>("text");
  const [rows,setRows]=useState<IncomingCanon[]>([]);
  const [category,setCategory]=useState<IncomingCanon["category"]>("other");
  const [excluded,setExcluded]=useState<Set<number>>(()=>new Set());
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<string|null>(null);
  const existing=useMemo(()=>new Set(facts.map(canonKey)),[facts]);
  const duplicates=useMemo(()=>{
    const seen=new Set(existing),found=new Set<number>();
    rows.forEach((row,i)=>{const k=canonKey(row);if(seen.has(k))found.add(i);else seen.add(k);});
    return found;
  },[rows,existing]);
  const selected=rows.filter((_,i)=>!duplicates.has(i)&&!excluded.has(i));
  function preview(raw=content,mode=format){
    try{
      const parsed=parseCanon(raw,mode).map(row=>row.category==="other"?{...row,category}:row);
      setRows(parsed);setExcluded(new Set());setError(null);setResult(null);
    }catch(e){setRows([]);setError(String(e instanceof Error?e.message:e));}
  }
  async function loadFile(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];e.target.value="";
    if(!file)return;
    const ext=file.name.toLowerCase().split(".").pop();
    if(!["json","csv","txt","md"].includes(ext??"")){setError("Choose JSON, CSV, TXT or Markdown");return;}
    if(file.size>3_000_000){setError("File exceeds 3 MB");return;}
    const mode:ImportFormat=ext==="json"?"json":ext==="csv"?"csv":"text";
    try{const raw=await file.text();setContent(raw);setFormat(mode);preview(raw,mode);}
    catch(err){setError(String(err));}
  }
  async function commit(){
    if(busy || !selected.length)return;
    setBusy(true);setError(null);setResult(null);
    try{
      const r=await onImport(selected);
      setResult(`Imported ${r.inserted} Mikan details; ${duplicates.size+r.duplicates} duplicates skipped.`);
      setRows([]);setContent("");
    }catch(e){setError(String(e instanceof Error?e.message:e));}
    finally{setBusy(false);}
  }
  return <details className="memory-import" aria-label="Bulk import Mikan's character canon">
    <summary><FileUp size={16}/> Bulk import Mikan's personality & favorites</summary>
    <p>Import without replacing Mikan's existing identity. JSON arrays of
      {" {category, label, value} "}, CSV columns <code>category,label,value</code>,
      or plain text lines <code>Favorite music: Synthwave</code>. Repeated labels are skipped.</p>
    <div className="memory-import-controls">
      <label>Default category for unlabeled entries
        <select value={category} onChange={e=>{setCategory(e.target.value as IncomingCanon["category"]);setRows([]);}}>
          {CANON_CATEGORIES.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      <label>File <input type="file" accept=".json,.csv,.txt,.md" disabled={busy} onChange={e=>void loadFile(e)}/></label>
      <label>Format <select value={format} onChange={e=>{setFormat(e.target.value as ImportFormat);setRows([]);}}>
        <option value="text">Label: value (one per line)</option><option value="json">JSON array</option><option value="csv">CSV headings</option>
      </select></label>
      <textarea rows={4} aria-label="Mikan canon import" value={content} disabled={busy}
        placeholder={"Favorite music: Symphonic metal\nFavorite color: Orange"}
        onChange={e=>{setContent(e.target.value);setRows([]);}}/>
      <button type="button" className="secondary-action" disabled={busy||!content.trim()} onClick={()=>preview()}>
        <Plus size={14}/> Preview Mikan's details
      </button>
    </div>
    {error && <p className="memory-error" role="alert">{error}</p>}
    {result && <p className="memory-import-success" role="status"><Check size={14}/>{result}</p>}
    {!!rows.length && <>
      <div className="memory-import-summary"><strong>{selected.length} new details ready</strong>
        <span>{duplicates.size} duplicate labels skipped · {rows.length} imported rows</span></div>
      <p className="memory-explainer">Review the preview. The first 60 entries are shown; all selected entries are imported.</p>
      <div className="memory-import-preview">
        {rows.slice(0,60).map((row,i)=><div className="memory-import-row" key={i}>
          <label className="memory-import-fact">
            <input type="checkbox" disabled={busy||duplicates.has(i)}
              checked={!duplicates.has(i)&&!excluded.has(i)}
              onChange={e=>setExcluded(old=>{const next=new Set(old);
                if(e.target.checked)next.delete(i);else next.add(i);return next;
              })}/>
            <span><strong>{row.label}:</strong> {row.value}</span>
          </label>
          <div className="memory-import-row-controls">
            <label>Category <select value={row.category} disabled={busy||duplicates.has(i)}
              onChange={e=>setRows(previous=>previous.map((v,j)=>i===j?{...v,category:e.target.value as IncomingCanon["category"]}:v))}>
              {CANON_CATEGORIES.map(v=><option key={v} value={v}>{v}</option>)}
            </select></label>
            {duplicates.has(i)&&<small>Existing entry or repeated in file</small>}
          </div>
        </div>)}
      </div>
      <button className="save-button memory-import-confirm" type="button"
        disabled={busy||!selected.length} onClick={()=>void commit()}>
        <Check size={14}/> Import {selected.length} Mikan details
      </button>
    </>}
  </details>;
}
