import {readFileSync,writeFileSync,renameSync,unlinkSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {NVIDIA_MODELS} from "../src/model-switcher.ts";
export const PROVIDERS=["nvidia","openrouter","gemini","groq","cerebras"];
export const DEFAULT_MODELS={nvidia:NVIDIA_MODELS[0],openrouter:"openrouter/free",gemini:"gemini-2.5-flash",groq:"openai/gpt-oss-120b",cerebras:"gpt-oss-120b"};
const KEY_NAMES={nvidia:"NVIDIA_API_KEY",openrouter:"OPENROUTER_API_KEY",gemini:"GEMINI_API_KEY",groq:"GROQ_API_KEY",cerebras:"CEREBRAS_API_KEY"};
const invalid=(message,status=400)=>Object.assign(new Error(message),{status});
const GROQ_MODELS=["openai/gpt-oss-120b","openai/gpt-oss-20b"];
const modelValid=(provider,model)=>typeof model==="string"&&model.length<=120&&/^[\w./:-]{2,120}$/.test(model)&&
  (provider!=="openrouter"||model==="openrouter/free"||model.endsWith(":free"))&&
  (provider!=="gemini"||model.startsWith("gemini-"))&&(provider!=="groq"||GROQ_MODELS.includes(model))&&(provider!=="cerebras"||model==="gpt-oss-120b");
const effortOptions=(provider,model)=>["groq","cerebras"].includes(provider)?["low","medium","high"]:provider==="nvidia"&&model==="nvidia/nemotron-3-ultra-550b-a55b"?["auto","none","medium","high"]:[];
const keyValid=key=>typeof key==="string"&&key.length>=12&&key.length<=512&&!/\s/.test(key);
export function providerSettings({initial,env={},file="",db,now=Date.now}){
  const initialProvider=initial?.provider??env.MIKAN_PROVIDER??"nvidia";
  if(!PROVIDERS.includes(initialProvider))throw Error("Unsupported MIKAN_PROVIDER");
  const defaults={...DEFAULT_MODELS,[initialProvider]:initial?.model??env.MIKAN_MODEL??DEFAULT_MODELS[initialProvider]};
  const inherited=Object.fromEntries(PROVIDERS.map(p=>[p,initial?.provider===p?initial.key:env[KEY_NAMES[p]]||""]));
  let saved={provider:initialProvider,models:defaults,keys:{},efforts:{groq:"medium",cerebras:"medium",nvidia:"auto"},cerebrasTier:"trial",historyChars:32000};
  if(file){
    try{
      const disk=JSON.parse(readFileSync(file,"utf8"));
      if(!PROVIDERS.includes(disk.provider))throw Error("Invalid saved provider");
      for(const p of PROVIDERS){
        if(modelValid(p,disk.models?.[p]))saved.models[p]=disk.models[p];
        if(keyValid(disk.keys?.[p]))saved.keys[p]=disk.keys[p];
        if(effortOptions(p,DEFAULT_MODELS[p]).includes(disk.efforts?.[p]))saved.efforts[p]=disk.efforts[p];
      }
      saved.provider=disk.provider;
      if(["trial","paid"].includes(disk.cerebrasTier))saved.cerebrasTier=disk.cerebrasTier;
      if([16000,32000,64000].includes(disk.historyChars))saved.historyChars=disk.historyChars;
    }catch(e){if(e.code!=="ENOENT")throw Error("Could not read NAS provider settings");}
  }
  const credential=(p,s=saved)=>s.keys[p]||inherited[p]||"";
  const configured=(p,s=saved)=>keyValid(credential(p,s));
  const models=p=>p==="nvidia"?[...new Set([...NVIDIA_MODELS,defaults.nvidia,saved.models.nvidia])]:p==="groq"?GROQ_MODELS:p==="cerebras"?["gpt-oss-120b"]:[saved.models[p]];
  function view(){
    return {provider:saved.provider,model:saved.models[saved.provider],historyChars:saved.historyChars,cerebrasTier:saved.cerebrasTier,reasoningEffort:effortOptions(saved.provider,saved.models[saved.provider]).includes(saved.efforts[saved.provider])?saved.efforts[saved.provider]:null,reasoningOptions:effortOptions(saved.provider,saved.models[saved.provider]),
      providers:PROVIDERS.map(provider=>({provider,model:saved.models[provider],models:models(provider),configured:configured(provider),credentialSource:saved.keys[provider]?"nas":configured(provider)?"environment":"missing",imageInput:"unsupported",nativeTools:"unverified"}))};
  }
  function active(){return configFor(saved.provider,saved.models[saved.provider]);}
  function configFor(p,model){
    if(!PROVIDERS.includes(p)||!models(p).includes(model))throw invalid("Select an approved configured model");
    if(!configured(p))throw invalid("Configure the selected provider API key in Models & providers.",503);
    if(!modelValid(p,model))throw invalid("Select an approved cloud model.",400);
    return {provider:p,model,key:credential(p),historyChars:saved.historyChars,...(effortOptions(p,model).includes(saved.efforts[p])?{reasoningEffort:saved.efforts[p]}:{})};
  }
  function save(patch){
    const p=patch?.provider;
    if(!PROVIDERS.includes(p))throw invalid("Unknown cloud provider");
    const next={...saved,models:{...saved.models},keys:{...saved.keys},efforts:{...saved.efforts}};
    if(patch.model!==undefined){
      if(!modelValid(p,patch.model))throw invalid("Invalid model; OpenRouter must use a free route");
      next.models[p]=patch.model;
    }
    if(patch.reasoningEffort!==undefined){
      if(!effortOptions(p,next.models[p]).includes(patch.reasoningEffort))throw invalid("Unsupported reasoning effort for this model");
      next.efforts[p]=patch.reasoningEffort;
    }
    if(patch.cerebrasTier!==undefined){
      if(p!=="cerebras"||!["trial","paid"].includes(patch.cerebrasTier))throw invalid("Invalid Cerebras quota tier");
      next.cerebrasTier=patch.cerebrasTier;
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
  // Separate metering from request admission. Record only numeric metadata, never
  // prompts, credentials or generated text. Missing provider usage stays unknown.
  db.exec("CREATE TABLE IF NOT EXISTS nas_token_usage(id INTEGER PRIMARY KEY,provider TEXT NOT NULL,model TEXT NOT NULL,source TEXT NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER NOT NULL,input_tokens INTEGER,output_tokens INTEGER,reasoning_tokens INTEGER,failed INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS nas_token_usage_time ON nas_token_usage(provider,model,started_at); CREATE TABLE IF NOT EXISTS nas_token_tracking(id INTEGER PRIMARY KEY CHECK(id=1),since_ms INTEGER NOT NULL)");
  db.prepare("INSERT OR IGNORE INTO nas_token_tracking VALUES(1,?)").run(now());
  const validTokens=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000?n:null;
  function recordUsage({provider,model,source,startedAt,usage,failed}){
    if(!PROVIDERS.includes(provider)||typeof model!=="string"||!["chat","brain-lab","memory"].includes(source))return;
    const t=now();
    db.prepare("INSERT INTO nas_token_usage(provider,model,source,started_at,finished_at,input_tokens,output_tokens,reasoning_tokens,failed) VALUES(?,?,?,?,?,?,?,?,?)").run(provider,model,source,startedAt,t,validTokens(usage?.inputTokens),validTokens(usage?.outputTokens),validTokens(usage?.reasoningTokens),failed?1:0);
    // Thirty days of numeric request metadata is plenty for rolling windows.
    db.prepare("DELETE FROM nas_token_usage WHERE started_at<?").run(t-30*86400000);
  }
  function tokenUsage(){
    const t=now(),since=db.prepare("SELECT since_ms AS since FROM nas_token_tracking WHERE id=1").get().since;
    const windows=[["minute",t-60000],["hour",t-3600000],["day",t-86400000],["utcToday",Math.floor(t/86400000)*86400000]];
    const sum=(provider,model,from,source=null)=>db.prepare("SELECT count(*) AS calls,coalesce(sum(input_tokens),0) AS input,coalesce(sum(output_tokens),0) AS output,coalesce(sum(reasoning_tokens),0) AS reasoning,coalesce(sum(failed),0) AS failed,coalesce(sum(input_tokens IS NULL),0) AS missingInput,coalesce(sum(output_tokens IS NULL),0) AS missingOutput FROM nas_token_usage WHERE provider=? AND (? IS NULL OR model=?) AND started_at>? AND (? IS NULL OR source=?)").get(provider,model,model,from,source,source);
    const groups=Object.fromEntries(PROVIDERS.map(provider=>{
      const names=[...new Set([saved.models[provider],...db.prepare("SELECT DISTINCT model FROM nas_token_usage WHERE provider=? AND started_at>?").all(provider,t-86400000).map(r=>r.model)])];
      const aggregate=model=>Object.fromEntries(windows.map(([name,from])=>[name,sum(provider,model,from)]));
      return [provider,{total:aggregate(null),models:Object.fromEntries(names.map(model=>[model,aggregate(model)])),sources:Object.fromEntries(["chat","brain-lab","memory"].map(source=>[source,sum(provider,saved.models[provider],t-86400000,source)])),quota:quota(provider)}];
    }));
    return {observedAt:t,since,groups};
  }
  const limits={nvidia:30,openrouter:15,gemini:5,groq:30};
  const lastResponse=new Map(),lastRejection=new Map();
  function quota(p,slots=1){
    const t=now(),minuteLimit=p==="cerebras"?(saved.cerebrasTier==="paid"?1000:5):limits[p],dayLimit=p==="openrouter"?40:p==="groq"?1000:null;
    const cooldownUntil=db.prepare("SELECT until_ms FROM nas_provider_cooldown WHERE provider=?").get(p)?.until_ms??0;
    const {n:requestsLastMinute,oldest}=db.prepare("SELECT count(*) AS n,min(started_at) AS oldest FROM nas_provider_requests WHERE provider=? AND started_at>?").get(p,t-60000);
    const requestsToday=dayLimit===null?null:db.prepare("SELECT count(*) AS n FROM nas_provider_requests WHERE provider=? AND started_at>=?").get(p,Math.floor(t/86400000)*86400000).n;
    const remainingMinute=Math.max(0,minuteLimit-requestsLastMinute),remainingDay=dayLimit===null?null:Math.max(0,dayLimit-requestsToday);
    const reason=cooldownUntil>t?"cooldown":remainingDay!==null&&remainingDay<slots?"local-daily":remainingMinute<slots?"local-minute":null;
    return {provider:p,observedAt:t,requestsLastMinute,minuteLimit,remainingMinute,requestsToday,dayLimit,remainingDay,cooldownUntil:cooldownUntil>t?cooldownUntil:null,waitMs:reason==="cooldown"?cooldownUntil-t:reason==="local-minute"?Math.max(1,(oldest??t)+60000-t):reason==="local-daily"?Math.floor(t/86400000+1)*86400000-t:0,reason,lastResponse:lastResponse.get(p)??null,lastRejection:lastRejection.get(p)??null};
  }
  function available(p,slots=1){return quota(p,slots).reason===null;}
  function observe(p,response){
    const record={...response,at:now()};
    lastResponse.set(p,record);
    if(record.status===429)lastRejection.set(p,record);
  }
  function quotaError(p){
    const snapshot=quota(p);
    return Object.assign(invalid("NAS cloud request budget reached: "+(snapshot.reason??"unknown")+". Try again later or select another provider.",429),{code:snapshot.reason??"local-quota",quota:snapshot});
  }
  function reserve(p){
    if(!available(p))throw quotaError(p);
    const t=now();
    db.prepare("DELETE FROM nas_provider_requests WHERE started_at<?").run(t-2*86400000);
    db.prepare("INSERT INTO nas_provider_requests(provider,started_at) VALUES(?,?)").run(p,t);
  }
  function cooldown(p){db.prepare("INSERT INTO nas_provider_cooldown(provider,until_ms) VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET until_ms=excluded.until_ms").run(p,now()+300000);}
  return {view,active,configFor,save,available,reserve,cooldown,quota,quotaError,observe,recordUsage,tokenUsage,diagnostics:()=>PROVIDERS.map(p=>quota(p))};
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
