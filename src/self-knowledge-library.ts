import { isSelfKnowledgeQuestion, relevantCapabilities } from "./self-knowledge";

/**
 * Read-only build snapshot. Vite embeds allowlisted documentation/source in
 * lazy chunks, so the installed Windows app works completely offline. It never
 * walks arbitrary disk paths, reads .env or keys, or modifies its own files.
 * Add new directories deliberately when the architecture grows.
 */
const included = import.meta.glob([
  "../README.md", "../SETUP.md", "../MEMORY.md", "../RESEARCH-EVAL.md",
  "../self_knowledge/README.md", "../screen_vision/README.md", "../attachments/README.md",
  "../advanced_memory/README.md", "../tools/searxng/README.md",
  "../tools/tts/README.md", "../android/README.md",
  "../src-tauri/src/*.rs", "./*.ts", "./*.tsx",
  "../src/mobile/*.ts", "../src/mobile/*.tsx",
  "../advanced_memory/server.py", "../tools/tts/server.py",
  "../scripts/check-self-knowledge.mjs"
], { query:"?raw", import:"default" }) as Record<string,()=>Promise<string>>;

export function bundledSourceAvailable(path:string):boolean {
  const importPath=path.startsWith("src/") ? "./"+path.slice(4) : "../"+path;
  return typeof included[importPath]==="function";
}

const common=new Set(["what","this","with","about","your","mikan","where","which","does","can","have","the","for","and","into","that","from","will","how","does","you","source","code","documentation"]);
function scoreText(query:string, value:string):number {
  const terms=[...new Set((query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[]).filter(w=>!common.has(w)))].slice(0,12);
  const v=value.toLowerCase();
  return terms.reduce((score,t)=>score+(v.includes(t)?1:0),0);
}
function getSnippet(path:string, source:string, query:string, maxChars:number):string {
  const lines=source.split(/\r?\n/);
  // Rank local paragraphs / implementation code blocks, never dump entire files.
  let index=0,best=0;
  for(let i=0;i<lines.length;i++){
    const candidate=lines.slice(Math.max(0,i-2),Math.min(lines.length,i+5)).join(" ");
    const rank=scoreText(query,candidate);
    if(rank>best){best=rank;index=i;}
  }
  if(!best)return "";
  const from=Math.max(0,index-3);
  const excerpt=lines.slice(from,Math.min(lines.length,index+9)).join("\n").slice(0,maxChars);
  return "READ-ONLY BUNDLED "+(path.endsWith(".md")?"DOCUMENTATION":"SOURCE CODE")+" "+path+
    " (lines "+(from+1)+" onward, may be incomplete):\n"+excerpt;
}
export async function loadSelfReferencePassages(query:string):Promise<string[]> {
  if(!isSelfKnowledgeQuestion(query))return [];
  if(!/\b(?:code|source|implementation|how|debug|documentation|docs|built|work|architecture|file|function|feature)\b/i.test(query))
    return [];
  const relevant=relevantCapabilities(query,4);
  const wantSource=/\b(?:code|source|implementation|debug|function|built|architecture|how)\b/i.test(query);
  const docs=[...new Set(relevant.flatMap(c=>c.docs))].slice(0,4);
  const sources=wantSource?[...new Set(relevant.flatMap(c=>c.sources))].slice(0,4):[];
  // Documentation comes first, code only when user asks how it works.
  const paths=[...docs,...sources].filter(path=>bundledSourceAvailable(path));
  const loaded=await Promise.all(paths.map(async path=>{
    const key=path.startsWith("src/")?"./"+path.slice(4):"../"+path;
    try {const source=await included[key]();return {path,excerpt:getSnippet(path,source,query,700)};}
    catch{return {path,excerpt:""};}
  }));
  return loaded.filter(x=>x.excerpt).sort((a,b)=>scoreText(query,b.excerpt)-scoreText(query,a.excerpt))
    .slice(0,2).map(x=>x.excerpt);
}
