import {randomUUID} from "node:crypto";
import {EVAL_FACTS,EVAL_SCENARIOS} from "../src/brain-eval-fixtures.ts";
import {NAS_CLOUD_EVAL_BUDGETS,paceCloudBrainTurn} from "../src/brain-eval-cloud.ts";
import {openStore} from "./storage.mjs";
import {executeNasTurn,turnTrace} from "./turn.mjs";
import {recallContext} from "./hindsight.mjs";
const invalid=(message,status=400)=>Object.assign(Error(message),{status});
const unsupported=s=>s.id==="notion-without-web"||s.steps.some(t=>t.expect.memoryCapture||t.expect.document==="previous"||t.expect.taskExclude?.length||t.mockEvidence!==undefined);
const scenarioInfo=EVAL_SCENARIOS.map((s,i)=>({id:s.id,number:i+1,label:s.label,group:s.group,turns:s.steps.length,supported:!unsupported(s)}));
export function seedEvalStore(){
  const store=openStore(":memory:");
  try{
    const fact=store.db.prepare("INSERT INTO user_memories(id,fact,category,tags_json,created_at,updated_at) VALUES(?,?,?,?,?,?)");
    const usage=store.db.prepare("INSERT INTO user_memory_usage(memory_id,importance) VALUES(?,?)");
    for(const f of EVAL_FACTS){fact.run(f.id,f.fact,f.category,JSON.stringify(f.tags??[]),f.updatedAt,f.updatedAt);usage.run(f.id,f.importance??50);}
    return store;
  }catch(e){store.db.close();throw e;}
}
export function createBrainLab({db,models,requestModel,search,read,build,pace=paceCloudBrainTurn,hindsight,hindsightBackend=()=>"legacy"}){
  db.exec("CREATE TABLE IF NOT EXISTS nas_brain_reports(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,report_json TEXT NOT NULL)");
  const save=report=>{db.prepare("INSERT INTO nas_brain_reports VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET report_json=excluded.report_json").run(report.id,report.startedAt,JSON.stringify(report));};
  const recent=()=>db.prepare("SELECT report_json FROM nas_brain_reports ORDER BY created_at DESC LIMIT 20").all().map(r=>JSON.parse(r.report_json));
  // A restart interrupts an in-flight run; never silently resume paid/free calls.
  for(const r of recent())if(r.state==="running"||r.state==="stopping"){r.state="interrupted";r.finishedAt=Date.now();save(r);}
  let current=null,controller=null;
  const catalog=()=>scenarioInfo;
  const status=()=>({hindsightBackend:hindsightBackend(),running:!!controller,current,providerDiagnostics:models.diagnostics(),history:db.prepare("SELECT json_remove(report_json,'$.cases') AS report_json FROM nas_brain_reports ORDER BY created_at DESC LIMIT 20").all().map(r=>JSON.parse(r.report_json)).filter(r=>r.id!==current?.id)});
  function start(body){
    if(controller)throw invalid("Brain Lab is already running",409);
    const {provider,model,scenarioIds,mode,repetitions,publicAgent=false,memoryEngine="sqlite",retrievalStrategy="automatic"}=body??{};
    if(!["sqlite","hindsight","fixed","none"].includes(memoryEngine)||memoryEngine==="hindsight"&&!hindsight)throw invalid("Memory engine unavailable");
    if(!["automatic","on-demand"].includes(retrievalStrategy)||retrievalStrategy==="on-demand"&&(memoryEngine!=="hindsight"||!publicAgent))throw invalid("On-demand requires Hindsight and the native agent");
    if(typeof publicAgent!=="boolean"||publicAgent&&!["nvidia","groq","cerebras","arli"].includes(provider))throw invalid("Native agent requires NVIDIA, Groq, Cerebras or Arli");
    if(!["simple","strict","off"].includes(mode)||![1,2,3,5].includes(repetitions)||!Array.isArray(scenarioIds)||!scenarioIds.length||new Set(scenarioIds).size!==scenarioIds.length)throw invalid("Select scenarios, mode and repetitions");
    const selected=models.configFor(provider,model);
    const scenarios=scenarioIds.map(id=>EVAL_SCENARIOS.find(s=>s.id===id));
    if(scenarios.some(s=>!s||unsupported(s)))throw invalid("Select supported NAS scenarios only");
    const total=scenarios.reduce((n,s)=>n+s.steps.length,0)*repetitions;
    const budget=NAS_CLOUD_EVAL_BUDGETS[provider];
    if(total>budget.maxTurns)throw invalid("Choose at most "+budget.maxTurns+" turns for "+provider);
    if(mode==="off"&&scenarios.some(s=>s.steps.some(t=>t.expect.web===true||t.expect.route==="research")))throw invalid("Enable Simple or Strict for web scenarios");
    if(!models.available(provider))throw models.quotaError(provider);
    controller=new AbortController();const signal=controller.signal;
    const report={id:randomUUID(),state:"running",startedAt:Date.now(),finishedAt:null,build,provider,model,mode,repetitions,publicAgent,memoryEngine,retrievalStrategy,...(memoryEngine==="hindsight"?{hindsightBackend:hindsightBackend()}:{}),scenarioIds,total,done:0,currentLabel:"Starting",cases:[],environment:mode==="off"?"isolated-synthetic":"isolated-synthetic+live-public-web",writesToRealMemories:false};
    current=report;
    try{save(report);}catch(e){controller=null;current=null;throw e;}
    void run(report,scenarios,selected,signal).catch(()=>{console.error("Could not persist NAS Brain Lab report");});
    return {id:report.id};
  }
  async function run(report,scenarios,selected,signal){
    const bank=report.memoryEngine==="hindsight"?"mikan-brain-"+report.id:null;
    try{
      if(bank){report.currentLabel="Preparing isolated Hindsight fixtures";report.seedStartedAt=Date.now();save(report);const seeded=await hindsight.retain(bank,[{document_id:"synthetic-fixture",content:EVAL_FACTS.map(f=>new Date(f.updatedAt*1000).toISOString().slice(0,10)+": "+f.fact).join("\n")}],signal);if(seeded?.success!==true)throw Error("Hindsight fixture retain failed");report.hindsightSeedUsage=seeded.usage??null;report.seedElapsedMs=Date.now()-report.seedStartedAt;save(report);}
      for(const scenario of scenarios)for(let repeat=1;repeat<=report.repetitions;repeat++){
        signal.throwIfAborted();
        const sandbox=report.memoryEngine==="sqlite"?seedEvalStore():openStore(":memory:"),row={id:scenario.id,label:scenario.label,number:scenarioInfo.find(s=>s.id===scenario.id).number,repeat,steps:[]};
        report.cases.push(row);
        try{
          const chat=sandbox.newConversation();
          for(const step of scenario.steps){
            signal.throwIfAborted();report.currentLabel=row.number+" · "+scenario.label;save(report);
            await pace(selected.provider,signal);signal.throwIfAborted();
            if(!models.available(selected.provider))throw models.quotaError(selected.provider);
            const events=[],trace=turnTrace(report.mode);
            sandbox.append(chat.id,"user",step.user);
            // Each real request is counted by the production quota ledger.
            if(!models.available(selected.provider))throw models.quotaError(selected.provider);
            let result;
            try{result=await executeNasTurn({store:sandbox,conversationId:chat.id,question:step.user,selected,mode:report.mode,publicAgent:report.publicAgent,agentDiagnostics:true,retrievalStrategy:report.retrievalStrategy,streamNative:selected.nativeStreaming!==false,onPreview:()=>{},requestModel,search,read,signal,trace,memoryEngine:bank?({question,history,signal})=>recallContext(hindsight,bank,[...history.slice(0,-1).filter(m=>m.role==="user").slice(-2).map(m=>m.content),question].join("\n"),{text:"",ids:[],auditLines:[]},{signal,strict:true}):report.memoryEngine==="fixed"?()=>({text:"Fixed synthetic reference (same evidence for each model):\n"+EVAL_FACTS.map(f=>f.fact).join("\n"),ids:EVAL_FACTS.map(f=>f.id),auditLines:EVAL_FACTS.map(f=>f.fact),engine:"fixed"}):report.memoryEngine==="none"?()=>({text:"",ids:[],auditLines:[],engine:"none"}):undefined,
              reserve:()=>models.reserve(selected.provider),canRequest:(slots=1)=>models.available(selected.provider,slots),activity:e=>events.push(e)});
            }catch(e){row.steps.push({at:Date.now(),user:step.user,error:signal.aborted?"Stopped":e?.upstreamStatus===429?"Upstream HTTP 429":typeof e?.code==="string"?e.code:"Provider or turn failed",...(e?.upstreamStatus===429?{upstreamStatus:429}:{}),timing:trace.snapshot(),events,actualModel:trace.actualModel()});report.done++;save(report);if(signal.aborted||e?.status===429||e?.upstreamStatus===429)throw e;continue;}
            signal.throwIfAborted();
            sandbox.append(chat.id,"assistant",result.answer,{...(result.researched.task?{researchTask:result.researched.task}:{}),...(result.researched.agentEvidence?.length?{agentEvidence:result.researched.agentEvidence}:{})});
            sandbox.library.markRecalled(result.memory.ids);
            row.steps.push({at:Date.now(),user:step.user,answer:result.answer,timing:trace.snapshot(),actualModel:trace.actualModel(),selectedMemoryIds:result.memory.ids,...(report.memoryEngine!=="sqlite"?{hindsightEvidence:result.memory.auditLines,memoryEngine:result.memory.engine??"excluded"}:{}),...(result.researched.task?{researchTask:result.researched.task}:{}),
              sources:result.researched.sources.map(s=>({...s,content:s.content.slice(0,report.publicAgent?6000:3500)})),events});
            report.done++;save(report);
          }
        }finally{sandbox.db.close();}
      }
      report.state="finished";
    }catch(e){report.state=signal.aborted?"stopped":e?.status===429||e?.upstreamStatus===429?"quota":"failed";if(report.state==="quota"){report.quotaFailure={origin:e?.upstreamStatus===429?"upstream":e?.code??"local-unknown",upstreamStatus:e?.upstreamStatus===429?429:null,snapshot:e?.quota??models.quota(selected.provider)};report.error=report.quotaFailure.origin==="upstream"?"Provider returned HTTP 429; no retries":"NAS quota guard: "+report.quotaFailure.origin+"; no retries";}else report.error=report.state==="failed"?(bank&&report.done===0&&!Object.hasOwn(report,"hindsightSeedUsage")?"Hindsight fixture ingestion failed ("+(e?.name==="TimeoutError"?"timeout":Number.isInteger(e?.status)?"HTTP "+e.status:"unconfirmed or unavailable")+")":"Turn or fixture execution failed"):null;}
    finally{if(bank){try{await hindsight.removeBank(bank);}catch{report.hindsightCleanupFailed=true;}}report.finishedAt=Date.now();report.currentLabel="";controller=null;save(report);db.prepare("DELETE FROM nas_brain_reports WHERE id NOT IN (SELECT id FROM nas_brain_reports ORDER BY created_at DESC LIMIT 50)").run();}
  }
  function stop(){if(controller){current.state="stopping";controller.abort();save(current);}return {running:!!controller};}
  function get(id){const row=db.prepare("SELECT report_json FROM nas_brain_reports WHERE id=?").get(id);if(!row)throw invalid("Report not found",404);return JSON.parse(row.report_json);}
  return {start,stop,status,catalog,get,isRunning:()=>!!controller};
}
