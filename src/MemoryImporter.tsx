import {useMemo,useState,type ChangeEvent} from "react";
import {FileUp,Plus,Check,Download,AlertTriangle} from "lucide-react";
import {MEMORY_CATEGORIES,memoryKey,parseMemoryImport,parseTags,
  type ImportMemory,type MemoryCategory} from "./memory-import";
import type {UserFact} from "./memory-client";

type Draft = ImportMemory & {tagsInput:string;included:boolean};
type Props = {
  facts:UserFact[];
  onImport:(items:ImportMemory[])=>Promise<{inserted:number;duplicates:number}>;
  onExport:()=>Promise<{path:string;count:number}>;
  onReplace:(items:ImportMemory[],expectedCount:number)=>
    Promise<{inserted:number;oldCount:number;backupPath:string}>;
};

export function MemoryImporter({facts,onImport,onExport,onReplace}:Props){
  const [content,setContent]=useState("");
  const [format,setFormat]=useState<"text"|"json"|"csv">("text");
  const [filename,setFilename]=useState("");
  const [draft,setDraft]=useState<Draft[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<string|null>(null);
  const [working,setWorking]=useState(false);
  const [allCategory,setAllCategory]=useState("");
  const [mode,setMode]=useState<"append"|"replace">("append");
  const [confirmation,setConfirmation]=useState("");
  const existing=useMemo(()=>new Set(facts.map(f=>memoryKey(f.fact))),[facts]);
  const duplicates=useMemo(()=>{
    const seen=mode==="append"?new Set(existing):new Set<string>(),bad=new Set<number>();
    draft.forEach((row,i)=>{
      const key=memoryKey(row.fact);
      if(seen.has(key))bad.add(i);
      else seen.add(key);
    });
    return bad;
  },[draft,existing,mode]);
  const chosen=draft.filter((row,i)=>row.included && !duplicates.has(i)).length;
  function preview(value=content,kind=format){
    try{
      const parsed=parseMemoryImport(value,kind);
      setDraft(parsed.map(item=>({...item,tagsInput:item.tags.join(", "),included:true})));
      setResult(null);setError(null);
    }catch(e){setDraft([]);setError(e instanceof Error?e.message:String(e));}
  }
  async function fileChanged(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];e.target.value="";
    if(!file)return;
    if(file.size>3_000_000){setError("File exceeds 3 MB");return;}
    const ext=file.name.toLowerCase().split(".").pop();
    if(!["json","csv","txt","md","markdown"].includes(ext??"")){
      setError("Choose a .json, .csv, .txt or .md file");return;
    }
    setWorking(true);
    try{
      const data=await file.text();
      const kind=ext==="json"?"json":ext==="csv"?"csv":"text";
      setContent(data);setFormat(kind);setFilename(file.name);
      preview(data,kind);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  }
  function update(index:number,change:Partial<Draft>){
    setDraft(current=>current.map((row,i)=>i===index?{...row,...change}:row));
  }
  async function exportNow(){
    if(working)return;
    setWorking(true);setError(null);setResult(null);
    try{
      const exported=await onExport();
      setResult("Exported "+exported.count+" personal memories to "+exported.path);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  }
  async function commit(){
    if(working||!chosen||(mode==="replace"&&confirmation!=="REPLACE"))return;
    setWorking(true);setError(null);setResult(null);
    try{
      const items=draft.flatMap((row,i)=>row.included&&!duplicates.has(i) ?
        [{fact:row.fact,category:row.category,tags:parseTags(row.tagsInput),pinned:row.pinned}] : []);
      if(!items.length)throw Error("All imported facts are duplicates or excluded");
      if(mode==="replace"){
        const saved=await onReplace(items,facts.length);
        setResult("Replaced "+saved.oldCount+" personal memories with "+saved.inserted+
          " reviewed memories. Automatic backup: "+saved.backupPath);
        setConfirmation("");
      }else{
        const saved=await onImport(items);
        setResult("Imported "+saved.inserted+" new facts. "+(duplicates.size+saved.duplicates)+" duplicates skipped.");
      }
      setDraft([]);setContent("");setFilename("");
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  }
  return <details className="memory-import" aria-label="Bulk memory import">
    <summary><FileUp size={16}/> Bulk import memories</summary>
    <p>Export an editable JSON backup, then import a cleaned list. This only affects memories about you, not chats, Mikan's character canon, or Notion.</p>
    <button type="button" className="secondary-action" onClick={()=>void exportNow()} disabled={working}>
      <Download size={14}/> Export all {facts.length} personal memories (JSON)
    </button>
    <label className="memory-import-bulk">Import action
      <select value={mode} disabled={working} onChange={e=>{
        setMode(e.target.value as typeof mode);setConfirmation("");setResult(null);
      }}>
        <option value="append">Add new memories (skip existing matches)</option>
        <option value="replace">Replace all personal memories with this file</option>
      </select>
    </label>
    {mode==="replace" && <p className="memory-explainer">
      <AlertTriangle size={14}/> Replacement checks duplicates within the new file, not against old memories.
      Download/export a copy first and review the preview. An additional automatic JSON backup
      is saved locally before the SQLite transaction. This does not automatically merge differently worded facts.
    </p>}
    <div className="memory-import-controls">
      <label>File <input type="file" accept=".json,.csv,.txt,.md,.markdown,text/plain,application/json,text/csv"
        disabled={working} onChange={e=>void fileChanged(e)}/></label>
      {filename && <small>Loaded {filename}</small>}
      <label>Paste format
        <select value={format} onChange={e=>setFormat(e.target.value as typeof format)} disabled={working}>
          <option value="text">One fact per line / Markdown</option>
          <option value="json">JSON array</option><option value="csv">CSV with headings</option>
        </select>
      </label>
      <textarea aria-label="Memories to import" value={content} rows={4} disabled={working}
        placeholder={"- I work as a web developer.\n- I enjoy writing music."}
        onChange={e=>{setContent(e.target.value);setDraft([]);setFilename("");}}/>
      <button type="button" className="secondary-action" onClick={()=>preview()} disabled={working||!content.trim()}>
        <Plus size={14}/> Preview memories
      </button>
    </div>
    {error && <p role="alert" className="memory-error">{error}</p>}
    {result && <p role="status" className="memory-import-success"><Check size={14}/>{result}</p>}
    {!!draft.length && <>
      <div className="memory-import-summary">
        <strong>{chosen} ready to import</strong>
        <span>{duplicates.size} repeated or matched entries skipped · {draft.length} reviewed rows</span>
      </div>
      <label className="memory-import-bulk">Set category for all rows
        <select value={allCategory} onChange={e=>{
          const category=e.target.value as MemoryCategory|"";
          setAllCategory(category);
          if(category)setDraft(prev=>prev.map(row=>({...row,category})));
        }}>
          <option value="">Keep suggested/imported categories</option>
          {MEMORY_CATEGORIES.map(cat=><option key={cat.id} value={cat.id}>{cat.label}</option>)}
        </select>
      </label>
      <div className="memory-import-preview" aria-label="Review imported memories">
        {draft.map((row,i)=><div className={"memory-import-row"+(duplicates.has(i)?" duplicate":"")} key={i}>
          <label className="memory-import-fact">
            <input type="checkbox" disabled={working||duplicates.has(i)} checked={row.included&&!duplicates.has(i)}
              onChange={e=>update(i,{included:e.target.checked})}/>
            <span>{row.fact}</span>
          </label>
          {duplicates.has(i) ? <small>Already saved or repeated in file</small> : <div className="memory-import-row-controls">
            <label>Category
              <select value={row.category} disabled={working} onChange={e=>update(i,{category:e.target.value as MemoryCategory})}>
                {MEMORY_CATEGORIES.map(cat=><option value={cat.id} key={cat.id}>{cat.label}</option>)}
              </select>
            </label>
            <label>Tags (comma-separated)
              <input type="text" value={row.tagsInput} disabled={working} aria-label={"Tags for row "+(i+1)}
                onChange={e=>update(i,{tagsInput:e.target.value})}/>
            </label>
            <label className="memory-import-pin"><input type="checkbox" disabled={working}
              checked={row.pinned} onChange={e=>update(i,{pinned:e.target.checked})}/> Pin</label>
          </div>}
        </div>)}
      </div>
      {mode==="replace" && <label className="memory-import-bulk">
        <strong>Replace {facts.length} saved personal memories with {chosen} reviewed memories</strong>
        <span>This resets fact IDs, recall counts and original timestamps. Your old records are saved in the backup.</span>
        Type REPLACE to confirm
        <input type="text" autoComplete="off" spellCheck={false} value={confirmation}
          onChange={e=>setConfirmation(e.target.value)} disabled={working} aria-label="Type REPLACE to confirm"/>
      </label>}
      <button type="button" className={mode==="replace"?"memory-danger memory-import-confirm":"save-button memory-import-confirm"}
        disabled={working||!chosen||(mode==="replace"&&confirmation!=="REPLACE")}
        onClick={()=>void commit()}>{working?"Working…":mode==="replace"?
          "Replace "+facts.length+" memories with "+chosen:"Import "+chosen+" memories"}</button>
    </>}
  </details>;
}
