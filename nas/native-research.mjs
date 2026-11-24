import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {reviewResearchCompletion,verifyResearchAnswer} from "../src/evidence-verification.ts";
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
  return {type:"function",function:{name:"submit_source_evidence",description:"Select only literal evidence from numbered excerpts. Include all requested quantitative and attribution constraints. Return empty arrays if evidence is insufficient.",parameters:record({passages:array(passage,5),suggestions:array(suggestion,6),answer:{type:"string",maxLength:1800}},["passages","suggestions","answer"])}};
}
const invalid=code=>Object.assign(Error(code),{code});
export function structuredResearchPrompt(task){
  return "\nSTRICT SOURCE EXTRACTION: Return only JSON {passages:[{source,quote,subject,when,where_at,detail}],suggestions:[{source,name,creator,identity_quote,fit_quote,measurements:[{source,value,unit,quote}],relations:[{source,role,name,quote}]}]}. The answer field is a concise natural answer to the latest question, grounded ONLY in the proposed literal passages, with numbered citations on every factual sentence. State exactly what remains unconfirmed. Compare event dates to the live date; do not mistake planned events for actual events. For discovery, submit named candidates even when you can establish identity but still need a targeted lookup for a missing measurement; use an empty fit_quote when missing, never invent a quote. Every quote and span must be literal and contiguous in the actual numbered source excerpts. Up to five passages or six candidate suggestions. No invented evidence, no prose outside JSON. For discovery or constrained verification supply suggestions satisfying ALL explicit constraints, otherwise passages. Do not put an unrelated result into the shortlist. The application independently validates the evidence. Task: "+JSON.stringify(task??{kind:"lookup"});
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
    const clean=s=>String(s).replace(/[\r\n\t*<>\x60\[\]]/g," ").trim();
    const lines=result.approved.map(item=>{
      const measurements=item.measurements.map(m=>clean(m.unit)==="release year"?m.value+" ["+m.source+"]":m.value+" "+clean(m.unit)+" ["+m.source+"]");
      const credits=item.relations.map(m=>clean(m.role)+": "+clean(m.name)+" ["+m.source+"]");
      return "- **"+clean(item.title)+"** ["+item.source+"]"+(measurements.length||credits.length?" · "+[...measurements,...credits].join(" · "):"")+(item.missingDetails?.length?" (Still unconfirmed: "+item.missingDetails.map(clean).join(", ")+")":"")+"\n  "+(item.fitQuote?"Source: “"+clean(item.fitQuote)+"”":"");
    });
    const incomplete=result.ignoredRequirements.length>0||result.approved.some(x=>x.missingDetails?.length);
    const text=lines.length?(incomplete?"These are source-backed leads, but not every condition is verified:":"Here are the options I could verify:")+"\n\n"+lines.join("\n"):review?.text??"I couldn't verify a suitable recommendation from the retrieved sources.";
    return {text,accepted:result.approved.length,rejected:result.rejected,kind:result.kind,followupQuery:result.followupQuery,rejectedDetails:result.rejectedDetails,approved:result.approved};
  }
  // Check the optional draft against native-approved excerpts only.
  // Conservative lexical checking is NOT semantic entailment.
  const approved=sources.map((s,i)=>({...s,title:"",content:result.passages.filter(p=>p.source===i+1).map(p=>p.quote).join("\n")}));
  const draft=typeof parsed.answer==="string"?parsed.answer.trim():"";
  const lines=draft.split(/\n+/).filter(l=>l.trim());
  const numbers=s=>[...s.replace(/\[\d+\]/g,"").matchAll(/\b\d+(?:\.\d+)?\b/g)].map(m=>m[0]);
  const allCited=lines.length>0&&lines.every(line=>{
    const ids=[...line.matchAll(/\[(\d+)\]/g)].map(m=>Number(m[1]));
    const evidence=ids.map(id=>approved[id-1]?.content??"").join("\n");
    return ids.length>0&&ids.every(id=>approved[id-1]?.content)&&numbers(line).every(v=>numbers(evidence).includes(v));
  });
  const review=allCited?verifyResearchAnswer(draft,approved):null;
  const natural=review?.usable&&review.rejected===0;
  return {text:natural?review.text:result.accepted?result.text:"I searched, but the retrieved sources didn't establish the requested details. I can share the sources, but I don't want to guess.",accepted:result.accepted,rejected:result.rejected,kind:result.kind,presentation:natural?"checked synthesis":"verified excerpts"};
}
