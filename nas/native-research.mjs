import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {reviewResearchCompletion} from "../src/evidence-verification.ts";
const binary=process.env.MIKAN_NATIVE_RESEARCH_BIN||fileURLToPath(new URL("./mikan-research-native",import.meta.url));
export const nativeResearchAvailable=()=>existsSync(binary);
export function nativeResearch(input){
  if(!nativeResearchAvailable())throw Error("Native research validator unavailable");
  const result=spawnSync(binary,[],{input:JSON.stringify(input),encoding:"utf8",timeout:5000,maxBuffer:512000,stdio:["pipe","pipe","pipe"]});
  if(result.status!==0||result.error)throw Error("Native research validation failed");
  return JSON.parse(result.stdout);
}
export function structuredResearchPrompt(task){
  return "\nSTRICT SOURCE EXTRACTION: Return only JSON {passages:[{source,quote,subject,when,where_at,detail}],suggestions:[{source,name,creator,identity_quote,fit_quote,measurements:[{source,value,unit,quote}],relations:[{source,role,name,quote}]}]}. Every quote and span must be literal and contiguous in the actual numbered source excerpts. Up to five passages or twelve candidate suggestions. No invented evidence, no prose outside JSON. For discovery or constrained verification supply suggestions satisfying ALL explicit constraints, otherwise passages. Do not put an unrelated result into the shortlist. The application independently validates the evidence. Task: "+JSON.stringify(task??{kind:"lookup"});
}
export function reviewNativeResearch(raw,question,task,sources){
  const start=raw.indexOf("{"),end=raw.lastIndexOf("}");
  if(start<0||end<start)throw Error("Invalid structured evidence");
  const parsed=JSON.parse(raw.slice(start,end+1));
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("Invalid structured evidence");
  const result=nativeResearch({question,task:task??null,sources:sources.map(s=>({title:s.title,url:s.url,content:s.content,engine:s.kind==="page"?"webpage":"preview",publishedDate:s.publishedDate??null})),
    passages:Array.isArray(parsed.passages)?parsed.passages.slice(0,5):[],suggestions:Array.isArray(parsed.suggestions)?parsed.suggestions.slice(0,12):[]});
  if(result.kind==="recommendation"){
    const audit={status:"used",recommendationTask:true,recommendationDetails:result.approved,ignoredRequirements:result.ignoredRequirements,unresolvedDetails:[]};
    const review=reviewResearchCompletion("",sources,audit);
    return {text:review?.text??"I couldn't verify a suitable recommendation from the retrieved sources.",accepted:result.approved.length,rejected:result.rejected,kind:result.kind};
  }
  return {text:result.text,accepted:result.accepted,rejected:result.rejected,kind:result.kind};
}
