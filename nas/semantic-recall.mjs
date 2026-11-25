import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {spawn} from "node:child_process";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

// Model revision, tokenizer and pooling are part of the cache identity.
export const EMBEDDING_REVISION="bge-small-en-v1.5:c5ac6c397e27c80e0229ec647987f2e553fc0ba9:int8:cls:query-prefix:192";
const root=()=>process.env.MIKAN_EMBEDDINGS_DIR||"/opt/mikan-embeddings";
const interpreter=()=>join(root(),"venv/bin/python");
export const embeddingsAvailable=()=>process.env.MIKAN_EMBEDDINGS_DISABLED!=="1"&&existsSync(interpreter())&&existsSync(join(root(),"model.onnx"))&&existsSync(join(root(),"tokenizer.json"));
const valid=v=>Array.isArray(v)&&v.length===384&&v.every(n=>typeof n==="number"&&Number.isFinite(n))&&v.some(n=>n!==0);
const factText=f=>[f.fact,f.category,...(f.tags??[])].join(" ").slice(0,2000);
const hash=text=>createHash("sha256").update(EMBEDDING_REVISION+"\0"+text).digest("hex");
const cosine=(a,b)=>{let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return dot/Math.sqrt(aa*bb);};
export function rankSemantic(query,rows){
  if(!valid(query))return [];
  const scored=rows.filter(r=>valid(r.vector)).map(r=>({id:r.id,score:cosine(query,r.vector)})).filter(r=>Number.isFinite(r.score)).sort((a,b)=>b.score-a.score||a.id-b.id);
  // Nearest does not mean relevant. Conservative, tunable similarity floor.
  const floor=Math.max(0.45,(scored[0]?.score??0)-0.14);
  return scored.filter(r=>r.score>=floor).slice(0,6).map(r=>r.id);
}

export function embedLocal(texts,{signal,timeoutMs=25000}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(signal.reason??Error("Aborted"));
    const child=spawn(interpreter(),[fileURLToPath(new URL("./embed-memory.py",import.meta.url))],{stdio:["pipe","pipe","ignore"],env:{...process.env,MIKAN_EMBEDDINGS_DIR:root(),OMP_NUM_THREADS:"2",OPENBLAS_NUM_THREADS:"1",MKL_NUM_THREADS:"1",PYTHONDONTWRITEBYTECODE:"1"}});
    const chunks=[];let bytes=0,settled=false;
    const done=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener("abort",abort);if(err){child.kill("SIGKILL");reject(err);}else resolve(value);};
    const abort=()=>done(signal.reason??Error("Aborted"));
    const timer=setTimeout(()=>done(Error("Embedding timeout")),timeoutMs);
    signal?.addEventListener("abort",abort,{once:true});
    child.on("error",()=>done(Error("Embedding process unavailable")));
    child.stdin.on("error",()=>done(Error("Embedding input unavailable")));
    child.stdout.on("data",chunk=>{bytes+=chunk.length;if(bytes>2000000)done(Error("Embedding response too large"));else chunks.push(chunk);});
    child.on("close",code=>{
      if(code!==0)return done(Error("Embedding process failed"));
      try{const result=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!Array.isArray(result)||result.length!==texts.length||!result.every(valid))throw Error();done(null,result);}
      catch{done(Error("Invalid embedding response"));}
    });
    child.stdin.end(JSON.stringify(texts));
  });
}

// SQLite stores only derived local vectors, never a second authoritative fact.
export function createSemanticRecall(db,{embed=embedLocal,available=embeddingsAvailable}={}){
  db.exec("CREATE TABLE IF NOT EXISTS nas_memory_vectors(memory_id INTEGER PRIMARY KEY REFERENCES user_memories(id) ON DELETE CASCADE, fingerprint TEXT NOT NULL, vector_json TEXT NOT NULL)");
  let retryAfter=0;
  return async function lookup(query,facts,{signal}={}){
    const fallback=(status,indexed=0)=>({ids:[],status,indexed,total:facts.length});
    if(!available())return fallback("unavailable");
    if(!query.trim()||!facts.length)return fallback("empty");
    if(Date.now()<retryAfter)return fallback("cooldown");
    const rows=db.prepare("SELECT memory_id AS id,fingerprint,vector_json FROM nas_memory_vectors").all();
    const cached=new Map(rows.map(r=>[r.id,r]));
    const indexed=[],missing=[];
    for(const fact of facts){
      const text=factText(fact),fingerprint=hash(text),row=cached.get(fact.id);
      let vector=null;
      if(row?.fingerprint===fingerprint){try{vector=JSON.parse(row.vector_json);}catch{}}
      if(valid(vector))indexed.push({id:fact.id,vector});else missing.push({id:fact.id,text,fingerprint});
    }
    // Bound cold-start work. Larger collections fill incrementally; never
    // claim complete semantic coverage until every current fact is indexed.
    const batch=missing.slice(0,128);
    try{
      const result=await embed([query.slice(0,2000),...batch.map(x=>x.text)],{signal,timeoutMs:batch.length?30000:8000});
      signal?.throwIfAborted();
      if(!Array.isArray(result)||result.length!==batch.length+1||!result.every(valid))throw Error("Invalid vectors");
      const write=db.prepare("INSERT INTO nas_memory_vectors(memory_id,fingerprint,vector_json) SELECT id,?,? FROM user_memories WHERE id=? ON CONFLICT(memory_id) DO UPDATE SET fingerprint=excluded.fingerprint,vector_json=excluded.vector_json");
      for(let i=0;i<batch.length;i++){const row=batch[i],vector=result[i+1];write.run(row.fingerprint,JSON.stringify(vector),row.id);indexed.push({id:row.id,vector});}
      return {ids:rankSemantic(result[0],indexed),status:indexed.length===facts.length?"ready":"partial",indexed:indexed.length,total:facts.length};
    }catch{
      signal?.throwIfAborted();retryAfter=Date.now()+60000;return fallback("failed",indexed.length);
    }
  };
}
