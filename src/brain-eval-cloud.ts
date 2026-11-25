/**
 * Brain Lab cloud selection and conservative pacing. This module never reads
 * cloud credentials: native Tauri providers keep keys in Credential Manager.
 *
 * A single Brain Lab turn may use several HTTP calls for tool rounds, even
 * though its progress bar counts one turn. Budget their worst-case request
 * cost instead of treating one turn as one API request.
 */
import { NVIDIA_MODELS } from "./model-switcher.ts";

export type CloudEvalProvider = "nvidia"|"openrouter"|"gemini";
export type BrainEvalProvider = "local"|CloudEvalProvider;
export type BrainModelSettings = {
  model:string;nvidiaModel:string;geminiModel:string;openrouterModel:string
};
export type BrainEvalModelChoice = {
  id:string;provider:BrainEvalProvider;model:string;label:string
};
export type CloudBudget = {
  provider:CloudEvalProvider;maxTurns:number;minimumIntervalMs:number;
  estimatedCallsPerTurn:number;description:string
};

/**
 * Conservative per-START pacing, applied to sequential runs. Real provider
 * limits vary by account and model. 429s terminate the batch (no retry storm).
 * OpenRouter: at most 8 turns * 3 API calls, leaving room under the default
 * 50 requests/day quota for unrelated Mikan usage.
 * NVIDIA: up to four completion tool rounds and two evidence calls per turn.
 * Gemini: up to four generations plus a possible transient 503 retry.
 */
export const CLOUD_EVAL_BUDGETS: Record<CloudEvalProvider,CloudBudget> = {
  nvidia:{provider:"nvidia",maxTurns:24,minimumIntervalMs:15_000,
    estimatedCallsPerTurn:6,description:"Conservative ≤24 estimated requests/min (up to 6 calls/turn; published developer access often allows 40 RPM)."},
  openrouter:{provider:"openrouter",maxTurns:8,minimumIntervalMs:20_000,
    estimatedCallsPerTurn:3,description:"Conservative ≤9 estimated requests/min and ≤24 reserved free requests in this batch; default free quota is 20 RPM / 50 daily."},
  gemini:{provider:"gemini",maxTurns:8,minimumIntervalMs:60_000,
    estimatedCallsPerTurn:5,description:"Conservative 1 turn/minute; Gemini RPM, TPM and daily free limits depend on your model/project."}
};

// NAS-only additions; desktop provider types and native commands stay unchanged.
export const NAS_CLOUD_EVAL_BUDGETS:Record<CloudEvalProvider|"groq"|"cerebras",CloudBudget|{provider:"groq"|"cerebras";maxTurns:number;minimumIntervalMs:number;estimatedCallsPerTurn:number;description:string}>={...CLOUD_EVAL_BUDGETS,groq:{provider:"groq",maxTurns:12,minimumIntervalMs:60000,estimatedCallsPerTurn:6,description:"Free tier: start at most one benchmark turn per minute. Multiple calls and large contexts can still exhaust Groq token limits."},cerebras:{provider:"cerebras",maxTurns:12,minimumIntervalMs:60000,estimatedCallsPerTurn:5,description:"Trial-safe pacing: at most one benchmark turn per minute. Cerebras GPT-OSS trial permits 5 calls/min; paid accounts have higher limits. Tool-heavy turns may still hit limits."}};

export function brainCloudChoices(settings:BrainModelSettings):BrainEvalModelChoice[]{
  const choices:BrainEvalModelChoice[]=NVIDIA_MODELS.map(model=>({
    id:"nvidia:"+model,provider:"nvidia" as const,model,
    label:"NVIDIA · "+model
  }));
  const openrouter=settings.openrouterModel.trim();
  // Only free API routes are selectable; the server independently enforces
  // the same invariant. Never allow paid/unknown free-form routes here.
  if(openrouter==="openrouter/free" || /^[a-zA-Z0-9_./-]+:free$/.test(openrouter)){
    choices.push({id:"openrouter:"+openrouter,provider:"openrouter",
      model:openrouter,label:"OpenRouter · "+openrouter});
  }
  if(/^gemini-[a-zA-Z0-9.-]{1,90}$/.test(settings.geminiModel)){
    choices.push({id:"gemini:"+settings.geminiModel,provider:"gemini",
      model:settings.geminiModel,label:"Gemini · "+settings.geminiModel});
  }
  return choices;
}

export function brainModelSelection(
  requested:string,settings:BrainModelSettings,installedLocal:ReadonlyArray<string>
):BrainEvalModelChoice{
  const cloud=brainCloudChoices(settings).find(choice=>choice.id===requested);
  if(cloud)return cloud;
  if(installedLocal.includes(requested)&&!requested.includes(":nvidia/"))
    return {id:requested,provider:"local",model:requested,label:"Local · "+requested};
  throw new Error("Brain Lab model isn't installed or isn't an approved free cloud selection: "+requested);
}

/** Smallest quota cap for the currently selected cloud providers.
 * Local-only runs are deliberately uncapped. */
export function cloudTurnLimit(choices:ReadonlyArray<BrainEvalModelChoice>):number|null{
  const limits=choices.flatMap(choice=>choice.provider==="local"
    ? []:[CLOUD_EVAL_BUDGETS[choice.provider].maxTurns]);
  return limits.length?Math.min(...limits):null;
}

/** Pick whole scenarios in displayed order; do not silently truncate a run.
 * This is only called from the explicit "Fit selection" UI action. */
export function fitCloudScenarios<T extends {id:string;steps:ReadonlyArray<unknown>}>(
  selected:ReadonlyArray<T>,maxTurns:number,repetitions:number
):string[]{
  let remaining=Math.floor(maxTurns/repetitions);
  const kept:string[]=[];
  for(const scenario of selected){
    if(scenario.steps.length<=remaining){
      kept.push(scenario.id);
      remaining-=scenario.steps.length;
    }
  }
  return kept;
}

export function validateCloudTurnBudget(
  choices:ReadonlyArray<BrainEvalModelChoice>,turnsPerModel:number
):void{
  for(const choice of choices){
    if(choice.provider==="local")continue;
    const budget=CLOUD_EVAL_BUDGETS[choice.provider];
    if(turnsPerModel>budget.maxTurns)throw new Error(
      choice.provider+" Brain Lab runs are limited to "+budget.maxTurns+
      " turns per model to conserve free API requests. Choose fewer scenarios/repetitions."
    );
  }
}

const nextProviderTurn=new Map<CloudEvalProvider|"groq"|"cerebras",number>();
/** All Brain Lab runs share this in-process gate. No timer runs in the background. */
export async function paceCloudBrainTurn(
  provider:CloudEvalProvider|"groq"|"cerebras",signal:AbortSignal,
  onWait:(milliseconds:number)=>void=()=>{},
  now:()=>number=Date.now,
  sleep:(ms:number,signal:AbortSignal)=>Promise<void>=abortableCloudSleep
):Promise<void>{
  if(signal.aborted)throw new Error("Brain Lab cloud request stopped");
  const earliest=nextProviderTurn.get(provider)??0;
  const delay=Math.max(0,earliest-now());
  if(delay>0){onWait(delay);await sleep(delay,signal);}
  if(signal.aborted)throw new Error("Brain Lab cloud request stopped");
  nextProviderTurn.set(provider,now()+NAS_CLOUD_EVAL_BUDGETS[provider].minimumIntervalMs);
}
export function abortableCloudSleep(ms:number,signal:AbortSignal):Promise<void>{
  if(signal.aborted)return Promise.reject(new Error("Brain Lab stopped during cloud pacing"));
  return new Promise((resolve,reject)=>{
    let finished=false;
    const cleanup=()=>{signal.removeEventListener("abort",stop);};
    const stop=()=>{
      if(finished)return;
      finished=true;clearTimeout(timer);cleanup();
      reject(new Error("Brain Lab stopped during cloud pacing"));
    };
    const timer=setTimeout(()=>{
      if(finished)return;
      finished=true;cleanup();resolve();
    },ms);
    signal.addEventListener("abort",stop,{once:true});
  });
}
export function cloudRateLimitFailure(error:unknown):boolean{
  const message=String(error).toLowerCase();
  return /(?:http\s*429|rate[\s-]*limit|quota|too many requests|resource_exhausted)/i.test(message);
}
export function cloudKeyStatusCommand(provider:CloudEvalProvider):string{
  return provider+"_key_status";
}

const OPENROUTER_DAY_KEY="mikan/brain-cloud-openrouter-free-budget/v1";
const OPENROUTER_DAILY_RESERVED_LIMIT=30;
/** Reserve a worst-case 3 API calls per tested turn, across Brain Lab sessions.
 * Ordinary desktop chat may also consume free quota, so a provider 429 still
 * stops testing and never attempts automatic retry.
 */
export function reserveOpenRouterFreeTurn(
  storage:Pick<Storage,"getItem"|"setItem">,day=new Date().toISOString().slice(0,10)
):number{
  let used=0;
  try{
    const saved=JSON.parse(storage.getItem(OPENROUTER_DAY_KEY)??"null");
    if(saved?.day===day && Number.isSafeInteger(saved.calls) && saved.calls>=0){
      used=saved.calls;
    }
  }catch{/* malformed record is reset to fail-safe budget */}
  const next=used+CLOUD_EVAL_BUDGETS.openrouter.estimatedCallsPerTurn;
  if(next>OPENROUTER_DAILY_RESERVED_LIMIT)throw new Error(
    "Brain Lab has reserved its conservative OpenRouter free daily allowance "+
    "("+OPENROUTER_DAILY_RESERVED_LIMIT+" of the default 50 requests). Try another provider or the next UTC day."
  );
  storage.setItem(OPENROUTER_DAY_KEY,JSON.stringify({day,calls:next}));
  return OPENROUTER_DAILY_RESERVED_LIMIT-next;
}
