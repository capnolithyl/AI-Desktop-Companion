import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {reviewResearchCompletion} from "../src/evidence-verification.ts";
const binary=process.env.MIKAN_NATIVE_RESEARCH_BIN||fileURLToPath(new URL("./mikan-research-native",import.meta.url));
export const nativeResearchAvailable=()=>existsSync(binary);
export function nativeResearch(input){
  if(!nativeResearchAvailable())throw Error("Native research validator unavailable");
  const result=spawnSync(binary,[],{input:JSON.stringify(input),encoding:"utf8",timeout:5000,maxBuffer:512000,stdio:["pipe","pipe","pipe"]});
  if(result.error)throw Object.assign(Error("Native research executable failed"),{code:"native-execution-failed"});
  if(result.status!==0)throw Object.assign(Error("Native input schema rejected"),{code:"native-schema-rejected"});
  return JSON.parse(result.stdout);
}
const str={type:"string"},num={type:"number"},idx={type:"integer",minimum:1,maximum:8};
const record=(properties,required)=>({type:"object",properties,required,additionalProperties:false});
const array=(items,maxItems)=>({type:"array",items,maxItems});
export function structuredResearchTool(){
  const measurement=record({source:idx,value:num,unit:str,quote:str},["source","value","unit","quote"]);
  const relation=record({source:idx,role:str,name:str,quote:str},["source","role","name","quote"]);
  const suggestion=record({source:idx,name:str,creator:str,identity_quote:str,fit_quote:str,measurements:array(measurement,4),relations:array(relation,6)},["source","name","identity_quote","fit_quote"]);
  const passage=record({source:idx,quote:str,subject:str,when:str,where_at:str,detail:str},["source","quote"]);
  return {type:"function",function:{name:"submit_source_evidence",description:"Select only literal evidence from numbered excerpts. Include all requested quantitative and attribution constraints. Return empty arrays if evidence is insufficient.",parameters:record({passages:array(passage,5),suggestions:array(suggestion,6)},["passages","suggestions"])}};
}
const invalid=code=>Object.assign(Error(code),{code});
export function structuredResearchPrompt(task){
  return "\nSTRICT SOURCE EXTRACTION: Return only JSON {passages:[{source,quote,subject,when,where_at,detail}],suggestions:[{source,name,creator,identity_quote,fit_quote,measurements:[{source,value,unit,quote}],relations:[{source,role,name,quote}]}]}. Every quote and span must be literal and contiguous in the actual numbered source excerpts. Up to five passages or twelve candidate suggestions. No invented evidence, no prose outside JSON. For discovery or constrained verification supply suggestions satisfying ALL explicit constraints, otherwise passages. Do not put an unrelated result into the shortlist. The application independently validates the evidence. Task: "+JSON.stringify(task??{kind:"lookup"});
}
export function reviewNativeResearch(raw,question,task,sources){
  const start=raw.indexOf("{"),end=raw.lastIndexOf("}");
  if(start<0||end<start)throw invalid("missing-evidence-json");
  let parsed;
  try{parsed=JSON.parse(raw.slice(start,end+1));}catch{throw invalid("malformed-evidence-json");}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||(!Array.isArray(parsed.passages)&&!Array.isArray(parsed.suggestions)))throw invalid("invalid-evidence-schema");
  const result=nativeResearch({question,task:task??null,sources:sources.map(s=>({title:s.title,url:s.url,content:s.content,engine:s.kind==="page"?"webpage":"preview",publishedDate:s.publishedDate??null})),
    passages:Array.isArray(parsed.passages)?parsed.passages.slice(0,5):[],suggestions:Array.isArray(parsed.suggestions)?parsed.suggestions.slice(0,12):[]});
  if(result.kind==="recommendation"){
    const audit={status:"used",recommendationTask:true,recommendationDetails:result.approved,ignoredRequirements:result.ignoredRequirements,unresolvedDetails:[]};
    const review=reviewResearchCompletion("",sources,audit);
    return {text:review?.text??"I couldn't verify a suitable recommendation from the retrieved sources.",accepted:result.approved.length,rejected:result.rejected,kind:result.kind};
  }
  return {text:result.text,accepted:result.accepted,rejected:result.rejected,kind:result.kind};
}
