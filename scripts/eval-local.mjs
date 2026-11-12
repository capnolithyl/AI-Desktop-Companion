#!/usr/bin/env node
// Optional real-Ollama smoke suite. No external calls and no private memories.
import {writeFile} from "node:fs/promises";

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:fallback};
const endpoint=arg("--endpoint","http://127.0.0.1:11434").replace(/\/+$/,"");
const model=arg("--model","qwen3.5:9b");
const out=arg("--out","");
if(!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(endpoint)){
  console.error("For privacy this harness only connects to localhost Ollama.");
  process.exit(2);
}
const cases=[
  {id:"current-news",message:"Search the web for the latest NASA Artemis II news.",tool:true},
  {id:"local-time",message:"Look up the current time in Berlin on the web.",tool:true},
  {id:"greeting",message:"Hello Mikan! How are you?",tool:false}
];
const reasoning=[
  {id:"arithmetic",message:"A library has 17 books, receives 8 and lends 6. How many remain? Answer with a number.",expected:19},
  {id:"multi-step",message:"There are three crates with 12 bottles each. Seven bottles are given away. How many remain? Answer with a number.",expected:29}
];
const tools=[{type:"function",function:{
  name:"search_web",description:"Search live public information when the user asks for a web lookup.",
  parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}
}}];
const results=[];
async function call(item,think,toolsEnabled){
  const body={model,stream:false,think,
    options:{temperature:0,num_ctx:16384,num_predict:600},
    messages:[{role:"system",content:"You are a concise assistant. Use tools only when a live lookup is needed."},
      {role:"user",content:item.message}]};
  if(toolsEnabled)body.tools=tools;
  const started=performance.now();
  const response=await fetch(endpoint+"/api/chat",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),
    signal:AbortSignal.timeout(180000)
  });
  const payload=await response.json();
  if(!response.ok)throw Error("Ollama HTTP "+response.status+": "+JSON.stringify(payload).slice(0,300));
  return {payload,latencyMs:Math.round(performance.now()-started)};
}
for(const item of cases){
  try{
    const {payload,latencyMs}=await call(item,false,true);
    const names=(payload.message?.tool_calls??[]).map(x=>x.function?.name);
    const passed=item.tool?names.includes("search_web"):names.length===0;
    results.push({id:item.id,type:"tool",passed,latencyMs,toolCalls:names,
      promptTokens:payload.prompt_eval_count??null,outputTokens:payload.eval_count??null});
  }catch(err){results.push({id:item.id,type:"tool",passed:false,error:String(err)});}
}
for(const item of reasoning)for(const think of [false,true]){
  try{
    const {payload,latencyMs}=await call(item,think,false);
    const content=payload.message?.content??"";
    const matched=content.match(/-?\d+(?:\.\d+)?/g)??[];
    const passed=matched.length>0&&Number(matched.at(-1))===item.expected;
    results.push({id:item.id,type:"reasoning",think,passed,latencyMs,
      promptTokens:payload.prompt_eval_count??null,outputTokens:payload.eval_count??null,
      answer:content.slice(0,350)});
  }catch(err){results.push({id:item.id,type:"reasoning",think,passed:false,error:String(err)});}
}
const report={model,endpoint,generatedAt:new Date().toISOString(),results};
console.log(JSON.stringify(report,null,2));
if(out)await writeFile(out,JSON.stringify(report,null,2)+"\n","utf8");
if(results.some(x=>!x.passed))process.exitCode=1;
