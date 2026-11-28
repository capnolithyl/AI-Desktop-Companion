const DAY=86400000;
const validMs=n=>Number.isFinite(n)&&n>=0;
const cleanLabel=(s,fallback)=>typeof s==="string"&&/^[\w./:-]{1,160}$/.test(s)?s:fallback;
export function timingDistribution(values){
 const sorted=values.filter(validMs).sort((a,b)=>a-b),n=sorted.length;
 if(!n)return {count:0,mean:null,p50:null,p95:null,min:null,max:null};
 const percentile=p=>sorted[Math.max(0,Math.ceil(n*p)-1)];
 return {count:n,mean:Math.round(sorted.reduce((a,b)=>a+b,0)/n),p50:percentile(.5),p95:percentile(.95),min:sorted[0],max:sorted[n-1]};
}
export function performanceReport(db,{days=7,now=Date.now()}={}){
 if(![1,7,30].includes(days))throw Object.assign(Error("Choose 1, 7 or 30 days"),{status:400});
 const since=now-days*DAY,groups=new Map(),MAX=20000;
 const table=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 const group=(provider,model)=>{
  const key=JSON.stringify([provider,model]);
  if(!groups.has(key))groups.set(key,{provider,model,metrics:new Map(),daily:new Map(),calls:0,failedCalls:0,turns:0,failedTurns:0,actualModels:new Set()});
  return groups.get(key);
 };
 const add=(g,kind,ms,at,failed=false)=>{
  if(!validMs(ms))return;
  const metricKey=kind+(failed?" (failed)":"");
  if(!g.metrics.has(metricKey))g.metrics.set(metricKey,[]);
  g.metrics.get(metricKey).push(ms);
  const day=new Date(at).toISOString().slice(0,10);
  if(!g.daily.has(day))g.daily.set(day,new Map());
  const daily=g.daily.get(day);if(!daily.has(metricKey))daily.set(metricKey,[]);daily.get(metricKey).push(ms);
 };
 const calls=table("nas_token_usage")?db.prepare("SELECT provider,model,source,started_at,finished_at,failed,headers_ms,first_output_ms,actual_model,kind,streamed FROM nas_token_usage WHERE started_at>=? AND started_at<=? ORDER BY started_at DESC LIMIT ?").all(since,now,MAX+1):[];
 for(const r of calls.slice(0,MAX)){
  const g=group(r.provider,r.model),failed=!!r.failed,source=cleanLabel(r.source,"unknown"),kind=cleanLabel(r.kind,"legacy");
  g.calls++;if(failed)g.failedCalls++;if(r.actual_model)g.actualModels.add(cleanLabel(r.actual_model,"unknown"));
  const elapsed=r.finished_at-r.started_at;
  add(g,"Call / "+source,elapsed,r.started_at,failed);
  add(g,"Call / "+source+" / "+kind,elapsed,r.started_at,failed);
  if(r.streamed!==null)add(g,"Call / "+source+" / "+(r.streamed?"streamed":"buffered"),elapsed,r.started_at,failed);
  add(g,"Headers / "+source,r.headers_ms,r.started_at,failed);
  add(g,"First provider output / "+source,r.first_output_ms,r.started_at,failed);
 }
 const addTurn=(provider,model,actual,trace,at,source,failed)=>{
  if(!trace||!validMs(trace.totalMs)||!Number.isFinite(at)||at<since||at>now)return;
  const g=group(provider,model);g.turns++;if(failed)g.failedTurns++;if(actual)g.actualModels.add(cleanLabel(actual,"unknown"));
  add(g,"Turn / "+source,trace.totalMs,at,failed);
  add(g,"First visible text / "+source,trace.firstTextMs,at,failed);
  // Sum repeated stage times within each turn, but keep parent and child
  // stages independent (they overlap and must not be added to a total).
  const stages=new Map();
  for(const stage of Array.isArray(trace.stages)?trace.stages:[]){if(!validMs(stage.elapsedMs))continue;const key=cleanLabel(stage.stage,"other")+(stage.success===false?" (stage failed)":"");stages.set(key,(stages.get(key)??0)+stage.elapsedMs);}
  for(const [name,ms] of stages)add(g,"Stage / "+source+" / "+name,ms,at,failed);
 };
 const messages=table("messages")?db.prepare("SELECT created_at, json_extract(metadata_json,'$.nasInference.provider') AS provider,json_extract(metadata_json,'$.nasInference.requestedModel') AS model,json_extract(metadata_json,'$.nasInference.actualModel') AS actual,json_extract(metadata_json,'$.nasInference.outcome') AS outcome,json_extract(metadata_json,'$.nasInference.timing') AS timing FROM messages WHERE created_at>=? AND created_at<=? AND json_valid(metadata_json) AND json_extract(metadata_json,'$.nasInference.timing') IS NOT NULL ORDER BY created_at DESC LIMIT ?").all(since,now,MAX+1):[];
 for(const r of messages.slice(0,MAX))if(r.provider&&r.model){try{addTurn(r.provider,r.model,r.actual,JSON.parse(r.timing),r.created_at,"chat",r.outcome==="failed");}catch{/* old malformed trace */}}
 let labSteps=0,labTruncated=false;
 if(table("nas_brain_reports")){
  // Project only numeric trace metadata and model identifiers from retained reports.
  const rows=db.prepare("SELECT json_extract(report_json,'$.provider') AS provider,json_extract(report_json,'$.model') AS model,json_extract(step.value,'$.actualModel') AS actual,json_extract(step.value,'$.timing') AS timing,coalesce(json_extract(step.value,'$.at'),json_extract(report_json,'$.startedAt')) AS at,json_type(step.value,'$.error') IS NOT NULL AS failed FROM nas_brain_reports, json_each(report_json,'$.cases') AS c, json_each(c.value,'$.steps') AS step WHERE coalesce(json_extract(step.value,'$.at'),json_extract(report_json,'$.startedAt'))>=? AND coalesce(json_extract(step.value,'$.at'),json_extract(report_json,'$.startedAt'))<=? ORDER BY at DESC LIMIT ?").all(since,now,MAX+1);
  labTruncated=rows.length>MAX;labSteps=Math.min(MAX,rows.length);
  for(const r of rows.slice(0,MAX))if(r.provider&&r.model&&r.timing){try{addTurn(r.provider,r.model,r.actual,JSON.parse(r.timing),r.at,"brain-lab",!!r.failed);}catch{}}
 }
 const summarize=metrics=>Object.fromEntries([...metrics].sort(([a],[b])=>a.localeCompare(b)).map(([key,values])=>[key,timingDistribution(values)]));
 return {schema:"mikan-performance",version:1,observedAt:now,since,days,unit:"ms",truncated:calls.length>MAX||messages.length>MAX||labTruncated,coverage:{calls:Math.min(MAX,calls.length),chatTraces:Math.min(MAX,messages.length),brainLabTraces:labSteps},groups:[...groups.values()].sort((a,b)=>b.calls+b.turns-a.calls-a.turns).map(g=>({provider:g.provider,model:g.model,actualModels:[...g.actualModels],calls:g.calls,failedCalls:g.failedCalls,turns:g.turns,failedTurns:g.failedTurns,metrics:summarize(g.metrics),daily:[...g.daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,metrics])=>({date,metrics:summarize(metrics)}))})),notes:["Requested model grouping; actual model identifiers shown when reported. Calls and turns are different populations.","Successful and failed samples are separate. P50/P95 use nearest rank. Missing timings remain missing, not zero.","Call ledger is retained for 30 days. Chat and Brain Lab turn traces reflect retained conversations/reports; older Brain Lab steps use report start date. Historical call header/first-output timings were not collected.","First provider output is first observed content or tool fragment (buffered requests report only on completion). First visible text is server-side, not browser rendering time. Stage timings may overlap; repeated stage durations are summed within each turn.","External Hindsight inference is not in the Mikan call ledger; recall stages are included in turn traces. No chat text, prompts, tool arguments or keys are included."]};
}
