import {readFileSync,writeFileSync,renameSync,unlinkSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {NVIDIA_MODELS} from "../src/model-switcher.ts";
export const PROVIDERS=["nvidia","openrouter","gemini"];
export const DEFAULT_MODELS={nvidia:NVIDIA_MODELS[0],openrouter:"openrouter/free",gemini:"gemini-2.5-flash"};
const KEY_NAMES={nvidia:"NVIDIA_API_KEY",openrouter:"OPENROUTER_API_KEY",gemini:"GEMINI_API_KEY"};
const invalid=(message,status=400)=>Object.assign(new Error(message),{status});
const modelValid=(provider,model)=>typeof model==="string"&&model.length<=120&&/^[\w./:-]{2,120}$/.test(model)&&
  (provider!=="openrouter"||model==="openrouter/free"||model.endsWith(":free"))&&
  (provider!=="gemini"||model.startsWith("gemini-"));
const keyValid=key=>typeof key==="string"&&key.length>=12&&key.length<=512&&!/\s/.test(key);
export function providerSettings({initial,env={},file="",db,now=Date.now}){
  const initialProvider=initial?.provider??env.MIKAN_PROVIDER??"nvidia";
  if(!PROVIDERS.includes(initialProvider))throw Error("Unsupported MIKAN_PROVIDER");
  const defaults={...DEFAULT_MODELS,[initialProvider]:initial?.model??env.MIKAN_MODEL??DEFAULT_MODELS[initialProvider]};
  const inherited=Object.fromEntries(PROVIDERS.map(p=>[p,initial?.provider===p?initial.key:env[KEY_NAMES[p]]||""]));
  let saved={provider:initialProvider,models:defaults,keys:{},historyChars:32000};
  if(file){
    try{
      const disk=JSON.parse(readFileSync(file,"utf8"));
      if(!PROVIDERS.includes(disk.provider))throw Error("Invalid saved provider");
      for(const p of PROVIDERS){
        if(modelValid(p,disk.models?.[p]))saved.models[p]=disk.models[p];
        if(keyValid(disk.keys?.[p]))saved.keys[p]=disk.keys[p];
      }
      saved.provider=disk.provider;
      if([16000,32000,64000].includes(disk.historyChars))saved.historyChars=disk.historyChars;
    }catch(e){if(e.code!=="ENOENT")throw Error("Could not read NAS provider settings");}
  }
  const credential=(p,s=saved)=>s.keys[p]||inherited[p]||"";
  const configured=(p,s=saved)=>keyValid(credential(p,s));
  const models=p=>p==="nvidia"?[...new Set([...NVIDIA_MODELS,defaults.nvidia,saved.models.nvidia])]:[saved.models[p]];
  function view(){
    return {provider:saved.provider,model:saved.models[saved.provider],historyChars:saved.historyChars,
      providers:PROVIDERS.map(provider=>({provider,model:saved.models[provider],models:models(provider),configured:configured(provider),credentialSource:saved.keys[provider]?"nas":configured(provider)?"environment":"missing",imageInput:"unsupported",nativeTools:"unverified"}))};
  }
  function active(){
    const p=saved.provider;
    if(!configured(p))throw invalid("Configure the selected provider API key in Models & providers.",503);
    if(!modelValid(p,saved.models[p]))throw invalid("Select an approved cloud model.",400);
    return {provider:p,model:saved.models[p],key:credential(p),historyChars:saved.historyChars};
  }
  function save(patch){
    const p=patch?.provider;
    if(!PROVIDERS.includes(p))throw invalid("Unknown cloud provider");
    const next={...saved,models:{...saved.models},keys:{...saved.keys}};
    if(patch.model!==undefined){
      if(!modelValid(p,patch.model))throw invalid("Invalid model; OpenRouter must use a free route");
      next.models[p]=patch.model;
    }
    if(patch.apiKey!==undefined){
      if(!keyValid(patch.apiKey))throw invalid("API key must be 12–512 non-whitespace characters");
      next.keys[p]=patch.apiKey;
    }
    if(patch.clearKey===true)delete next.keys[p];
    if(patch.historyChars!==undefined){
      if(![16000,32000,64000].includes(patch.historyChars))throw invalid("Invalid history budget");
      next.historyChars=patch.historyChars;
    }
    if(patch.select===true){
      if(!configured(p,next))throw invalid("Configure a key before selecting this provider");
      if(!modelValid(p,next.models[p]))throw invalid("Select an approved cloud model");
      next.provider=p;
    }
    if(file){
      const tmp=file+"."+randomUUID();
      try{writeFileSync(tmp,JSON.stringify(next),{mode:0o600,flag:"wx"});renameSync(tmp,file);}
      catch{try{unlinkSync(tmp);}catch{}throw invalid("Could not save NAS provider settings",500);}
    }
    saved=next;return view();
  }
  // Count actual outbound attempts (not chat turns); retain counts across restarts.
  db.exec("CREATE TABLE IF NOT EXISTS nas_provider_requests (provider TEXT NOT NULL,started_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS nas_provider_request_time ON nas_provider_requests(provider,started_at); CREATE TABLE IF NOT EXISTS nas_provider_cooldown(provider TEXT PRIMARY KEY,until_ms INTEGER NOT NULL)");
  const limits={nvidia:30,openrouter:15,gemini:5};
  function available(p){
    const t=now();
    const cooldown=db.prepare("SELECT until_ms FROM nas_provider_cooldown WHERE provider=?").get(p)?.until_ms??0;
    if(cooldown>t)return false;
    const recent=db.prepare("SELECT count(*) AS n FROM nas_provider_requests WHERE provider=? AND started_at>?").get(p,t-60000).n;
    const daily=p==="openrouter"?db.prepare("SELECT count(*) AS n FROM nas_provider_requests WHERE provider=? AND started_at>=?").get(p,Math.floor(t/86400000)*86400000).n:0;
    return recent<limits[p]&&daily<40;
  }
  function reserve(p){
    if(!available(p))throw invalid("NAS cloud request budget reached. Try again later or select another provider.",429);
    const t=now();
    db.prepare("DELETE FROM nas_provider_requests WHERE started_at<?").run(t-2*86400000);
    db.prepare("INSERT INTO nas_provider_requests(provider,started_at) VALUES(?,?)").run(p,t);
  }
  function cooldown(p){db.prepare("INSERT INTO nas_provider_cooldown(provider,until_ms) VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET until_ms=excluded.until_ms").run(p,now()+300000);}
  return {view,active,save,available,reserve,cooldown};
}
export function boundedHistory(messages,budget){
  let remaining=budget;
  const result=[];
  for(const m of [...messages].reverse()){
    if(remaining<=0)break;
    const content=m.content.slice(-Math.min(12000,remaining));
    result.unshift({role:m.role,content});remaining-=content.length;
  }
  // Avoid starting a truncated exchange with an orphan assistant message.
  while(result[0]?.role==="assistant")result.shift();
  return result;
}
