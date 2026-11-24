import {randomUUID} from "node:crypto";
import {EVAL_FACTS,EVAL_SCENARIOS,brainMemoryEvidence,scoreAnswer,brainReplyQualityFlags,sameMeaning} from "../src/brain-eval-fixtures.ts";
import {CLOUD_EVAL_BUDGETS,paceCloudBrainTurn} from "../src/brain-eval-cloud.ts";
import {openStore} from "./storage.mjs";
import {executeNasTurn,turnTrace} from "./turn.mjs";
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
export function gradeNasStep(step,result,events){
  const expected=step.expect,failures=scoreAnswer(result.answer,expected);
  const webEvents=events.filter(e=>e.title==="Web search"||e.title==="Webpage read"||e.title==="Web search failed"||e.title==="Webpage read failed");
  const attempted=webEvents.length>0,hasEvidence=result.researched.sources.length>0;
  const webExpected=expected.web??(expected.route==="research"?true:["chat","non-research"].includes(expected.route)?false:undefined);
  if(webExpected===false&&attempted)failures.push("Unexpected public web activity");
  if(webExpected===true&&!hasEvidence)failures.push("No retrieved public evidence");
  if(expected.document==="current"&&!result.researched.sources.some(s=>s.kind==="page"))failures.push("No webpage read");
  for(const row of brainMemoryEvidence(expected.memory??[],result.memory.ids))if(!row.supportingIds.length)failures.push("Missing synthetic memory #"+row.expectedId);
  for(const id of expected.excludeMemory??[])if(result.memory.ids.includes(id))failures.push("Unexpected synthetic memory #"+id);
  for(const phrase of expected.publicQueryIncludes??[])if(!webEvents.some(e=>e.title==="Web search"&&e.lines.some(q=>sameMeaning(q,phrase))))failures.push("Missing public query term: "+phrase);
  // Current facts, evidence entailment and conversational intent need human review.
  const review=!!(expected.conversationGoal||webExpected===true||expected.route==="factual"||!(expected.answerIncludes?.length||expected.answerAny?.length||expected.answerExcludes?.length));
  return {grade:failures.length?"failed":review?"review":"passed",failures,qualityFlags:brainReplyQualityFlags(result.answer,expected),reviewGoal:expected.conversationGoal??null};
}
export function createBrainLab({db,models,requestModel,search,read,build,pace=paceCloudBrainTurn}){
  db.exec("CREATE TABLE IF NOT EXISTS nas_brain_reports(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,report_json TEXT NOT NULL)");
  const save=report=>{db.prepare("INSERT INTO nas_brain_reports VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET report_json=excluded.report_json").run(report.id,report.startedAt,JSON.stringify(report));};
  const recent=()=>db.prepare("SELECT report_json FROM nas_brain_reports ORDER BY created_at DESC LIMIT 20").all().map(r=>JSON.parse(r.report_json));
  // A restart interrupts an in-flight run; never silently resume paid/free calls.
  for(const r of recent())if(r.state==="running"||r.state==="stopping"){r.state="interrupted";r.finishedAt=Date.now();save(r);}
  let current=null,controller=null;
  const catalog=()=>scenarioInfo;
  const status=()=>({running:!!controller,current,history:db.prepare("SELECT json_remove(report_json,'$.cases') AS report_json FROM nas_brain_reports ORDER BY created_at DESC LIMIT 20").all().map(r=>JSON.parse(r.report_json)).filter(r=>r.id!==current?.id)});
  function start(body){
    if(controller)throw invalid("Brain Lab is already running",409);
    const {provider,model,scenarioIds,mode,repetitions}=body??{};
    if(!["simple","strict","off"].includes(mode)||![1,2,3,5].includes(repetitions)||!Array.isArray(scenarioIds)||!scenarioIds.length||new Set(scenarioIds).size!==scenarioIds.length)throw invalid("Select scenarios, mode and repetitions");
    const selected=models.configFor(provider,model);
    const scenarios=scenarioIds.map(id=>EVAL_SCENARIOS.find(s=>s.id===id));
    if(scenarios.some(s=>!s||unsupported(s)))throw invalid("Select supported NAS scenarios only");
    const total=scenarios.reduce((n,s)=>n+s.steps.length,0)*repetitions;
    const budget=CLOUD_EVAL_BUDGETS[provider];
    if(total>budget.maxTurns)throw invalid("Choose at most "+budget.maxTurns+" turns for "+provider);
    if(mode==="off"&&scenarios.some(s=>s.steps.some(t=>t.expect.web===true||t.expect.route==="research")))throw invalid("Enable Simple or Strict for web scenarios");
    if(!models.available(provider))throw invalid("Provider request budget exhausted",429);
    controller=new AbortController();const signal=controller.signal;
    const report={id:randomUUID(),state:"running",startedAt:Date.now(),finishedAt:null,build,provider,model,mode,repetitions,scenarioIds,total,done:0,currentLabel:"Starting",cases:[],environment:mode==="off"?"isolated-synthetic":"isolated-synthetic+live-public-web",writesToRealMemories:false};
    current=report;
    try{save(report);}catch(e){controller=null;current=null;throw e;}
    void run(report,scenarios,selected,signal).catch(()=>{console.error("Could not persist NAS Brain Lab report");});
    return {id:report.id};
  }
  async function run(report,scenarios,selected,signal){
    try{
      for(const scenario of scenarios)for(let repeat=1;repeat<=report.repetitions;repeat++){
        signal.throwIfAborted();
        const sandbox=seedEvalStore(),row={id:scenario.id,label:scenario.label,number:scenarioInfo.find(s=>s.id===scenario.id).number,repeat,steps:[]};
        report.cases.push(row);
        try{
          const chat=sandbox.newConversation();
          for(const step of scenario.steps){
            signal.throwIfAborted();report.currentLabel=row.number+" · "+scenario.label;save(report);
            await pace(selected.provider,signal);signal.throwIfAborted();
            if(!models.available(selected.provider))throw invalid("Provider request budget exhausted",429);
            const events=[],trace=turnTrace(report.mode);
            sandbox.append(chat.id,"user",step.user);
            // Each real request is counted by the production quota ledger.
            models.reserve(selected.provider);
            let result;
            try{result=await executeNasTurn({store:sandbox,conversationId:chat.id,question:step.user,selected,mode:report.mode,requestModel,search,read,signal,trace,
              reserve:()=>models.reserve(selected.provider),canRequest:()=>models.available(selected.provider),activity:e=>events.push(e)});
            }catch(e){row.steps.push({user:step.user,grade:"failed",failures:[signal.aborted?"Stopped":"Provider or turn failed"],timing:trace.snapshot(),events,actualModel:trace.actualModel()});save(report);throw e;}
            signal.throwIfAborted();
            sandbox.append(chat.id,"assistant",result.answer);
            sandbox.library.markRecalled(result.memory.ids);
            row.steps.push({user:step.user,answer:result.answer,...gradeNasStep(step,result,events),timing:trace.snapshot(),actualModel:trace.actualModel(),selectedMemoryIds:result.memory.ids,
              sources:result.researched.sources.map(s=>({...s,content:s.content.slice(0,3500)})),events});
            report.done++;save(report);
          }
        }finally{sandbox.db.close();}
      }
      report.state="finished";
    }catch(e){report.state=signal.aborted?"stopped":e?.status===429||e?.upstreamStatus===429?"quota":"failed";report.error=report.state==="quota"?"Provider quota reached; no retries":report.state==="failed"?"Turn or fixture execution failed":null;}
    finally{report.finishedAt=Date.now();report.currentLabel="";controller=null;save(report);db.prepare("DELETE FROM nas_brain_reports WHERE id NOT IN (SELECT id FROM nas_brain_reports ORDER BY created_at DESC LIMIT 50)").run();}
  }
  function stop(){if(controller){current.state="stopping";controller.abort();save(current);}return {running:!!controller};}
  function get(id){const row=db.prepare("SELECT report_json FROM nas_brain_reports WHERE id=?").get(id);if(!row)throw invalid("Report not found",404);return JSON.parse(row.report_json);}
  return {start,stop,status,catalog,get,isRunning:()=>!!controller};
}
