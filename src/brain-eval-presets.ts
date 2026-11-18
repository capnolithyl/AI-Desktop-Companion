/**
 * Personal Brain Lab run selections, not test results or private memories.
 * Device-local persistence intentionally has no cloud/API dependency.
 */
import type { EvalMode } from "./brain-eval.ts";

export const BRAIN_EVAL_PRESET_KEY="mikan/brain-eval-presets/v1";
const MAX_PRESETS=25;
const MAX_NAME_LENGTH=60;
const MAX_TESTS=300;

export type BrainEvalPresetConfig={
  mode:EvalMode;
  researchMode?:"simple"|"strict";
  repetitions:1|2|3|5;
  scenarioIds:string[];
  models:string[];
  category:string;
  statusFilter:"all"|"passed"|"failed"|"review"|"stale"|"untested"|"incomplete";
  search:string;
};
export type BrainEvalPreset={name:string;config:BrainEvalPresetConfig};

const statuses=new Set(["all","passed","failed","review","stale","untested","incomplete"]);
const repeats=new Set([1,2,3,5]);
const stringList=(items:unknown,max:number):string[]|null=>{
  if(!Array.isArray(items)||items.length>max)return null;
  if(items.some(item=>typeof item!=="string"||!item.trim()||item.length>160))return null;
  return [...new Set(items)];
};
function validConfig(input:unknown):BrainEvalPresetConfig|null{
  if(!input||typeof input!=="object"||Array.isArray(input))return null;
  const c=input as Record<string,unknown>;
  const scenarioIds=stringList(c.scenarioIds,MAX_TESTS);
  const models=stringList(c.models,10);
  if(!scenarioIds||!models||!["routing","live"].includes(String(c.mode))||
      (typeof c.repetitions!=="number"||!repeats.has(c.repetitions))||
      !statuses.has(String(c.statusFilter))||
      typeof c.category!=="string"||c.category.length>100||
      typeof c.search!=="string"||c.search.length>180)return null;
  return {
    mode:c.mode as EvalMode,
    ...(c.researchMode==="simple"||c.researchMode==="strict" ? {researchMode:c.researchMode} : {}),
    repetitions:c.repetitions as BrainEvalPresetConfig["repetitions"],
    scenarioIds,models,category:c.category,
    statusFilter:c.statusFilter as BrainEvalPresetConfig["statusFilter"],search:c.search
  };
}
export function parseBrainEvalPresets(raw:unknown):BrainEvalPreset[]{
  if(!Array.isArray(raw))return [];
  const seen=new Set<string>();
  const result:BrainEvalPreset[]=[];
  for(const item of raw.slice(0,MAX_PRESETS)){
    if(!item||typeof item!=="object"||Array.isArray(item))continue;
    const record=item as Record<string,unknown>;
    if(typeof record.name!=="string")continue;
    const name=record.name.trim();
    const config=validConfig(record.config);
    const key=name.toLocaleLowerCase();
    if(!name||name.length>MAX_NAME_LENGTH||!config||seen.has(key))continue;
    seen.add(key);
    result.push({name,config});
  }
  return result;
}
export function upsertBrainEvalPreset(
  existing:readonly BrainEvalPreset[],nameInput:string,config:BrainEvalPresetConfig
):BrainEvalPreset[]{
  const name=nameInput.trim();
  if(!name||name.length>MAX_NAME_LENGTH)
    throw new Error("Enter a preset name between 1 and 60 characters");
  const checked=validConfig(config);
  if(!checked)throw new Error("Invalid Brain Lab preset configuration");
  const index=existing.findIndex(entry=>entry.name.toLocaleLowerCase()===name.toLocaleLowerCase());
  if(index<0&&existing.length>=MAX_PRESETS)throw new Error("Maximum of 25 presets reached");
  const next=[...existing];
  if(index>=0)next[index]={name,config:checked};
  else next.push({name,config:checked});
  return next;
}
export function removeBrainEvalPreset(existing:readonly BrainEvalPreset[],name:string):BrainEvalPreset[]{
  return existing.filter(item=>item.name!==name);
}
export function readBrainEvalPresets():BrainEvalPreset[]{
  try{return parseBrainEvalPresets(JSON.parse(localStorage.getItem(BRAIN_EVAL_PRESET_KEY)??"[]"))}
  catch{return []}
}
export function persistBrainEvalPresets(presets:readonly BrainEvalPreset[]):void{
  localStorage.setItem(BRAIN_EVAL_PRESET_KEY,JSON.stringify(presets));
}
