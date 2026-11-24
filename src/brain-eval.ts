/**
 * Isolated P0 evaluation fixtures and scoring. Nothing here writes to SQLite,
 * Qdrant or the remote relay. Live-mode public web may use real SearXNG. Synthetic facts deliberately
 * use invented names so the model cannot pass by guessing its training data.
 */
import { decideDesktopTurn } from "./desktop-turn-routing.ts";
import { planDesktopWebExecution, resolvePublicWebExecution } from "./turn-execution-policy.ts";
import { priorResearchSources } from "./research-context.ts";
import { selectDeterministicMemoryIds } from "./memory-retrieval.ts";
import { rankMemories, type RankableMemory } from "./memory-ranking.ts";
import { isPersonalMemoryQuestion } from "./personal-memory.ts";
import type { ResearchTurn } from "./research-routing.ts";
import type { WebResult } from "./web-search.ts";
import type { ResearchAudit, ToolPlanningAudit } from "./debug-log.ts";
import { publicDocumentUrls, type PublicResearchContext, type ResearchTask } from "./unified-planner.ts";
import { modelLedWebToolsAllowed } from "./model-led-routing.ts";
import { modelLedBrainExecution } from "./brain-eval-model-led.ts";
import { contextualMemoryQuery } from "./brain-eval-memory-context.ts";

export type EvalRoute = "chat" | "research" | "factual" | "non-research" | "any";
export type MemoryCaptureExpectation = {
  /** Minimum structurally supported, durable user facts proposed for saving. */
  minUserFacts: number;
  /** Semantic accuracy and overgeneralization require human review. */
  reviewGoals: string[];
};
export type MemoryCapturePreview = {
  userFacts: {fact:string;evidence:string}[];
  interestItems: {kind:string;name:string;status:string;evidence:string}[];
  writesToRealMemories: false;
};
export type EvalExpectation = {
  route?: EvalRoute;
  memoryCapture?: MemoryCaptureExpectation;
  web?: boolean;
  document?: "current" | "previous";
  memory?: number[];
  excludeMemory?: number[];
  answerIncludes?: string[];
  answerAny?: string[];
  answerExcludes?: string[];
  /** Structural planner check, not a brittle response-phrase assertion. */
  taskExclude?: string[];
  publicQueryIncludes?: string[];
  /** Human-readable conversational expectation; evaluated by a reviewer, never faked by a phrase match. */
  conversationGoal?: string;
  /** A mock reply for predictable context in planning-only runs. */
  stubReply?: string;
};
export type EvalStep = { user: string; expect: EvalExpectation; explanation?: string; mockEvidence?: string };
export type EvalScenario = { id: string; label: string; group: string; steps: EvalStep[]; note?: string };
export type EvalTurn = ResearchTurn & { role:"user"|"assistant"; content:string; sources?:WebResult[] };
export type EvalMode = "routing" | "live";
function safeDocumentHref(url:string, targets:string[]):boolean {
  try {return targets.includes(new URL(url).href)} catch {return false}
}

export function requiresSearchPreflight(scenarios:ReadonlyArray<EvalScenario>):boolean {
  return scenarios.some(s=>s.steps.some(step=>!step.expect.document &&
    (step.expect.web===true || step.expect.route==="research")));
}

/** Strict model selection prevents the browser relay from injecting arbitrary IDs.
 * Fast routing contains no model inference, so sweeping it is misleading. */
export function brainEvalModels(
  requested:ReadonlyArray<string>|undefined,current:string,
  installed:ReadonlyArray<string>,mode:EvalMode
):string[]{
  if(requested===undefined)return [current];
  if(mode!=="live")throw new Error("Model comparison requires Live mode");
  if(!Array.isArray(requested)||!requested.length||requested.length>10 ||
    requested.some(model=>typeof model!=="string"||!installed.includes(model)) ||
    new Set(requested).size!==requested.length)
    throw new Error("Choose 1–10 unique approved local or cloud models");
  return [...requested];
}

type EvalWebPlan = {search:boolean;query?:string;reason:string;method?:string;intent?:string;task?:ResearchTask;
  replyEffort?:"quick"|"deliberate";sourceRequirement?:"required"|"optional"};
type EvalWebExecution = {
  query:string|null;
  results:WebResult[];
  sourcesCarriedOver:boolean;
  researchAudit?:ResearchAudit|null;
  searchTrace?:ToolPlanningAudit["searchTrace"];
};
export type EvalStepResult = {
  user: string;
  expected: EvalExpectation;
  actualRoute: string;
  canPlanPublicWeb: boolean;
  cloudMaySearch: boolean;
  blockedReason: string | null;
  deterministicWebAllowed: boolean;
  plannedWeb: boolean | null;
  webPass: boolean | null;
  /** Did an actually executed public search yield structurally validated evidence? */
  evidencePass?: boolean | null;
  webPlannerDecision?: EvalWebPlan;
  /** Measured local planner cost, not Rust search/extraction or answer latency. */
  plannerElapsedMs?: number;
  /** Observed Rust/SearXNG execution, distinct from an AI decision to search. */
  webExecution?: EvalWebExecution;
  /** Previous validated public query available to this turn's planner. */
  activePublicQuery?: string;
  /** A live, read-only Ollama extraction using the production prompt/validators. */
  memoryCapturePreview?: MemoryCapturePreview;
  /** Structural minimum only; reviewer judges the meaning of each saved fact. */
  memoryCapturePass?: boolean|null;
  selectedMemoryIds: number[];
  selectedMemory: {id:number;fact:string}[];
  /** Facts not established by any retrieved synthetic evidence. */
  missingMemoryIds: number[];
  /** Expected exact row IDs absent, even if equivalent evidence was retrieved. */
  missingMemoryRecordIds: number[];
  memoryEvidence: {expectedId:number;supportingIds:number[]}[];
  /** Irrelevant or redundant retrieved records; diagnostic, not an automatic failure. */
  distractorMemoryIds: number[];
  unexpectedMemoryIds: number[];
  routeLabelMatch: boolean; // Diagnostic only; not a behavioral failure.
  routePass: boolean; // Observed search decision was not contrary to intent.
  memoryPass: boolean;
  answerPass: boolean | null;
  /** True when automated assertions cannot establish conversational quality. */
  reviewRequired: boolean;
  answerFailures: string[];
  /** Transparent review-only heuristics, not an automatic semantic judgment. */
  qualityFlags: string[];
  answer?: string;
  /** Exact first-pass answer before optional persona restyling (same sources). */
  originalAnswer?:string;
  mikanifyApplied?:boolean;
  mikanifyElapsedMs?:number;
  mikanifyError?:string;
  inferenceStats?: {promptTokens?:number|null;outputTokens?:number|null;evalDurationNs?:number|null;loadDurationNs?:number|null};
  modelUsed?:string;
  error?: string;
  elapsedMs: number;
  pass: boolean;
};
export type EvalCaseResult = {
  id:string; number?:number; label:string; group:string; repeat:number; steps:EvalStepResult[];
  pass:boolean; elapsedMs:number;
};
import type { BuildInfo } from "./build-info";
export type EvalReport = {
  version:1; runId:string; startedAt:string; finishedAt:string;
  researchMode?:"simple"|"strict";
  /** Explicit orchestration mode to prevent mixing hybrid and native benchmarks. */
  webPlanningMode?:"native-model-led"|"local-auxiliary";
  /** Presentation-only second local pass; false/omitted for older reports. */
  mikanifyAnswer?:boolean;
  mode:EvalMode; model:string; attempts:number; scenarios:string[];
  // Recording simulated vs actual conditions prevents misleading scoreboards.
  environment:"isolated-synthetic"|"isolated-synthetic+live-public-web";
  liveWebEnabled:boolean; writesToRealMemories:false;
  build?:string;
  buildInfo?:BuildInfo;
  cases:EvalCaseResult[];
};
export type EvalInferenceResult = string | {
  text:string;
  originalAnswer?:string;
  mikanifyApplied?:boolean;
  mikanifyElapsedMs?:number;
  mikanifyError?:string;
  stats?: {promptTokens?:number|null;outputTokens?:number|null;evalDurationNs?:number|null;loadDurationNs?:number|null};
  modelUsed?:string;
  webExecution?:EvalWebExecution;
};
export type EvalInference = (args:{
  messages:EvalTurn[];
  selectedMemories:ReadonlyArray<{id:number;fact:string}>;
  evidence?:string;
  researchPlanned?:boolean;
  researchQuery?:string;
  researchTask?:ResearchTask;
  replyEffort?:"quick"|"deliberate";
  webRequest?:ReturnType<typeof resolvePublicWebExecution> & {priorSources:WebResult[]};
  scenarioId:string;
  stepIndex:number;
  /** Native provider tool permission, independently gated from preplanned search. */
  nativeWebAllowed?:boolean;
})=>Promise<EvalInferenceResult>;
export type EvalMemoryCapture = (input:{
  user:string;assistant:string;priorAssistant:string;priorUser:string;
})=>Promise<MemoryCapturePreview>;
export type EvalPlanner = (input:string,previous:EvalTurn[],
  context?:PublicResearchContext,selectedFacts?:ReadonlyArray<EvalMemoryFact>)=>Promise<EvalWebPlan>;
export type EvalOptions = {
  mode:EvalMode;
  /** The reply provider. Auxiliary planning and memory previews remain local. */
  provider?:"local"|"openrouter"|"gemini"|"nvidia";
  repetitions:number;
  model:string;
  researchMode?:"simple"|"strict";
  mikanifyAnswer?:boolean;
  build?:string;
  buildInfo?:BuildInfo;
  scenarios:ReadonlyArray<EvalScenario>;
  signal?:AbortSignal;
  infer?:EvalInference;
  planWeb?:EvalPlanner;
  /** NVIDIA provider owns read-only web planning; no local Ollama planner. */
  modelLedWeb?:boolean;
  previewMemory?:EvalMemoryCapture;
  /** Live mode only: use actual public SearXNG via production Rust chat_stream. */
  liveWeb?:boolean;
  onProgress?:(done:number,total:number,current:string)=>void;
};

// Do not put real names, personal facts, URLs, or credentials into test fixtures.
export type EvalMemoryFact=RankableMemory & {
  /** Other expected fact IDs proven by this synthetic record. Fixture metadata, not routing logic. */
  alsoSupports?:readonly number[];
};
import {EVAL_FACTS,EVAL_SCENARIOS,brainScenarioNumber,brainScenarioLabel,brainMemoryEvidence,sameMeaning,brainReplyQualityFlags,scoreAnswer} from "./brain-eval-fixtures.ts";
export {EVAL_FACTS,EVAL_SCENARIOS,brainScenarioNumber,brainScenarioLabel,brainMemoryEvidence,sameMeaning,brainReplyQualityFlags,scoreAnswer} from "./brain-eval-fixtures.ts";
function routeMatches(actual:string,expected:EvalRoute="any"):boolean {
  return expected==="any" || (expected==="non-research" ? actual!=="research":actual===expected);
}
/** Models may vary wording; assertions inspect concepts and tool policy, not complete text. */
export async function runBrainEvaluation(options:EvalOptions):Promise<EvalReport> {
  if(options.mode==="live" && !options.infer)throw new Error("Live mode needs an inference adapter");
  const report:EvalReport={
    version:1,runId:"eval-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
    startedAt:new Date().toISOString(),finishedAt:"",mode:options.mode,model:options.model,
    ...(options.researchMode?{researchMode:options.researchMode}:{}),
    ...(options.mode==="live"?{webPlanningMode:options.modelLedWeb?"native-model-led":"local-auxiliary"}:{}),
    ...(options.mode==="live"&&options.researchMode==="simple"
      ?{mikanifyAnswer:options.mikanifyAnswer===true}:{}),
    attempts:Math.max(1,Math.min(5,Math.trunc(options.repetitions))),
    scenarios:options.scenarios.map(s=>s.id),
    environment:options.mode==="live"&&options.liveWeb
      ?"isolated-synthetic+live-public-web":"isolated-synthetic",
    liveWebEnabled:options.mode==="live"&&options.liveWeb===true,
    writesToRealMemories:false,build:options.build,buildInfo:options.buildInfo,cases:[]
  };
  const total=report.attempts*options.scenarios.reduce((n,s)=>n+s.steps.length,0);
  let done=0;
  for(const scenario of options.scenarios)for(let repeat=1;repeat<=report.attempts;repeat++){
    if(options.signal?.aborted)break;
    const started=Date.now();
    const previous:EvalTurn[]=[];
    // A public discovery task is explicit structured state, not guessed from a
    // user phrase. Reset on each scenario and after any no-search decision.
    let publicContext:PublicResearchContext={};
    const steps:EvalStepResult[]=[];
    for(let stepIndex=0;stepIndex<scenario.steps.length;stepIndex++){
      if(options.signal?.aborted)break;
      const step=scenario.steps[stepIndex];
      const began=Date.now();
      const decision=decideDesktopTurn(step.user,previous,{automaticWebEnabled:true});
      const webPolicy=planDesktopWebExecution({
        question:step.user,previous,autoSearch:true,provider:options.provider??"local",planMode:decision.plan.mode,
        notion:scenario.id==="notion-without-web",
        personalTurn:isPersonalMemoryQuestion(step.user),capabilityQuestion:decision.capabilityQuestion,
        existingSearch:false,attachment:false,screenshot:false,liveFrame:false,roleplay:scenario.id==="search-in-roleplay"
      });
      // Short pronoun follow-ups need earlier USER-named referents to retrieve
      // a relevant fixture. This is local memory recall, never a web query.
      const memoryQuery=contextualMemoryQuery(step.user,previous);
      const lexicalIds=rankMemories([...EVAL_FACTS],memoryQuery).slice(0,30).map(f=>f.id);
      // No fabricated vector scores. The fixture tests the actual lexical/fusion fallback
      // without Qdrant, then reports when semantic retrieval would have been necessary.
      const memory=selectDeterministicMemoryIds([...EVAL_FACTS],memoryQuery,[],lexicalIds,8);
      const selectedFacts=memory.ids.map(id=>EVAL_FACTS.find(f=>f.id===id))
        .filter((fact):fact is EvalMemoryFact=>!!fact);
      const selected=selectedFacts.map(f=>({id:f.id,fact:f.fact}));
      // The target is a fact, not an arbitrary saved row. Richer synthetic
      // memories can explicitly support the same claim as a simpler record.
      const memoryEvidence=brainMemoryEvidence(step.expect.memory??[],memory.ids);
      const missing=memoryEvidence.filter(e=>!e.supportingIds.length).map(e=>e.expectedId);
      const missingRecordIds=(step.expect.memory??[]).filter(id=>!memory.ids.includes(id));
      const supportingIds=new Set(memoryEvidence.flatMap(e=>e.supportingIds));
      const distractors=(step.expect.memory?.length??0)>0
        ? memory.ids.filter(id=>!supportingIds.has(id)):[];
      const unexpected=(step.expect.excludeMemory??[]).filter(id=>memory.ids.includes(id));
      let planned:EvalWebPlan|undefined;
      let executedTask:ResearchTask|undefined;
      let plannerElapsedMs:number|undefined;
      const priorPublicQuery=publicContext.activePublicQuery;
      let answer:string|undefined;
      let originalAnswer:string|undefined;
      let mikanifyApplied:boolean|undefined;
      let mikanifyElapsedMs:number|undefined;
      let mikanifyError:string|undefined;
      let webExecution:EvalStepResult["webExecution"]|undefined;
      let inferenceStats:EvalStepResult["inferenceStats"]|undefined;
      let modelUsed:string|undefined;
      let error:string|undefined;
      let memoryCapturePreview:MemoryCapturePreview|undefined;
      const messages:EvalTurn[]=[...previous,{role:"user",content:step.user}];
      try {
        if(options.mode==="live" && !options.modelLedWeb && webPolicy.canPlanPublicWeb && options.planWeb) {
          const plannerStarted=Date.now();
          try {
            // Give the planner a stable snapshot. Brain Lab appends the current
            // exchange to previous after this callback, but observers and
            // async adapters must not see the history mutate retroactively.
            planned=await options.planWeb(step.user,previous.map(turn=>({...turn})),
              {...publicContext},selectedFacts);
          } finally {
            plannerElapsedMs=Date.now()-plannerStarted;
          }
        }
        if(options.mode==="live" && options.infer){
          // Never search when the private permission boundary blocks web.
          // The local planner has already validated its proposed public query.
          const execution=options.modelLedWeb
            ? modelLedBrainExecution(webPolicy,decision.plan,step.user,previous,publicContext)
            : resolvePublicWebExecution(webPolicy,decision.plan,planned,selectedFacts,plannerElapsedMs);
          executedTask=execution.researchTask;
          const publicQuery=execution.researchQuery;
          const response=await options.infer({
            messages,selectedMemories:selected,evidence:step.mockEvidence,
            researchPlanned:planned?.search===true || decision.plan.mode==="research",
            researchQuery:options.liveWeb?publicQuery:undefined,
            researchTask:options.liveWeb && publicQuery ? execution.researchTask : undefined,
            replyEffort:planned?.replyEffort,
            webRequest:options.liveWeb ? {...execution,priorSources:priorResearchSources(previous,step.user)} : undefined,
            scenarioId:scenario.id,stepIndex,
            nativeWebAllowed:options.modelLedWeb &&
              modelLedWebToolsAllowed(true,webPolicy)
          });
          if(typeof response==="string")answer=response;
          else {answer=response.text;inferenceStats=response.stats;modelUsed=response.modelUsed;
            webExecution=response.webExecution;
            originalAnswer=response.originalAnswer;
            mikanifyApplied=response.mikanifyApplied;
            mikanifyElapsedMs=response.mikanifyElapsedMs;
            mikanifyError=response.mikanifyError;}
        }
        if(options.mode==="live" && answer!==undefined &&
          step.expect.memoryCapture && options.previewMemory){
          const priorAssistant=previous.slice().reverse().find(turn=>turn.role==="assistant")?.content??"";
          const priorUser=previous.slice().reverse().find(turn=>turn.role==="user")?.content??"";
          memoryCapturePreview=await options.previewMemory({
            user:step.user,assistant:answer,priorAssistant,priorUser
          });
          if(memoryCapturePreview.writesToRealMemories!==false)
            throw new Error("Brain Lab memory preview attempted persistent writes");
        }
      }catch(err){error=err instanceof Error?err.message:String(err)}
      const answerFailures=answer===undefined
        ? []:scoreAnswer(answer,step.expect);
      const plannerFailures:string[]=[];
      if(options.mode==="live"){
        for(const excluded of step.expect.taskExclude??[]){
          if(!planned?.task?.exclude.some(name=>name.toLowerCase()===excluded.toLowerCase()))
            plannerFailures.push("Planner failed to exclude corrected candidate: "+excluded);
        }
        for(const term of step.expect.publicQueryIncludes??[]){
          if(!planned?.query?.toLowerCase().includes(term.toLowerCase()))
            plannerFailures.push("Corrected public query missing key subject: "+term);
        }
      }
      answerFailures.push(...plannerFailures);
      const qualityFlags=brainReplyQualityFlags(answer,step.expect,inferenceStats?.outputTokens);
      const hasFactualAnswerCheck=!!(
        step.expect.answerIncludes?.length ||
        step.expect.answerAny?.length ||
        step.expect.answerExcludes?.length
      );
      const routeLabelMatch=routeMatches(decision.plan.mode,step.expect.route);
      // A model decision takes precedence over legacy route labels. Fast mode
      // cannot observe optional semantic planning or native tool execution.
      const plannedWeb:boolean|null=options.modelLedWeb ? null : planned
        ? planned.method==="fallback" ? null : planned.search
        : decision.plan.mode==="research" ? true
        : decision.plan.mode==="factual" ? null
        : webPolicy.canPlanPublicWeb ? null : false;
      const expectedWeb=step.expect.web??(
        step.expect.route==="research" ? true :
        step.expect.route==="chat" ? false : null
      );
      // In Live web mode only native execution proves that a public search
      // happened; neither a route label nor a fallback planner can do so.
      const observedQuery=!!webExecution?.query;
      const documentTurn=step.expect.document==="previous"
        ? previous.filter(t=>t.role==="user").at(-1)?.content : step.user;
      const targetUrls=publicDocumentUrls([documentTurn??""]).map(url=>new URL(url).href);
      const correctDocument=webExecution?.results.some(source=>source.engine==="direct webpage" &&
        safeDocumentHref(source.url, targetUrls)) && !webExecution.sourcesCarriedOver;
      const webPass=options.mode==="live" && options.liveWeb && expectedWeb!==null
        ? expectedWeb===observedQuery && (!step.expect.document || !!correctDocument)
        : expectedWeb===null||plannedWeb===null?null:plannedWeb===expectedWeb;
      // Grade executed web behavior, not a preferred chat/research route.
      const routePass=webPass!==false;
      // A planned search is not a successfully answered search. This check uses
      // only the observed Rust source/evidence trace, NEVER Qwen grading itself.
      const audit=webExecution?.researchAudit;
      const missingRequiredWeb=options.mode==="live" && options.liveWeb &&
        expectedWeb===true && (!observedQuery || !!step.expect.document && !correctDocument);
      const evidencePass=missingRequiredWeb ? false : options.liveWeb && observedQuery
        ? webExecution!.results.length===0 ? false
          : audit?.status==="attributed" ? null
          : audit ? audit.status==="partial"
              ? audit.unresolvedDetails?.length ? false : null
              : (audit.status==="used" || audit.status==="shortlist") : null
        : null;
      if(missingRequiredWeb)answerFailures.push(
        step.expect.document && observedQuery ? "The requested document was not read on this turn." :
        "Required public research was not executed; the user's research goal was not fulfilled."
      );
      else if(evidencePass===false)answerFailures.push(
        audit?.status==="partial" && audit.unresolvedDetails?.length
          ? "Public search returned only partial context; requested details remain unresolved."
          : "Public search executed but produced no validated evidence; the user's research goal was not fulfilled."
      );
      // Never present an unobserved search decision as passing a behavioral test.
      // Fast mode deliberately cannot run the optional model planner.
      const reviewRequired=(options.mode==="live" &&
        (!!step.expect.conversationGoal || !hasFactualAnswerCheck || qualityFlags.length>0 ||
          (options.researchMode==="simple" && observedQuery))) ||
        (expectedWeb!==null && webPass===null) || audit?.status==="partial" || audit?.status==="attributed";
      const memoryPass=missing.length===0 && unexpected.length===0;
      // This checks only how many structurally supported new facts the REAL
      // local extractor proposed. Human review must judge their semantics.
      const memoryCapturePass=step.expect.memoryCapture
        ? memoryCapturePreview
          ? memoryCapturePreview.userFacts.length>=step.expect.memoryCapture.minUserFacts
          : null
        : undefined;
      if(memoryCapturePass===false)
        answerFailures.push("Read-only memory preview produced fewer durable facts than expected");
      // Human review should not hide a factual assertion failure.
      const answerPass=options.mode==="live" && hasFactualAnswerCheck
        ? !!answer&&!error&&answerFailures.length===0 : null;
      const result:EvalStepResult={
        user:step.user,expected:step.expect,actualRoute:decision.plan.mode,
        canPlanPublicWeb:webPolicy.canPlanPublicWeb,cloudMaySearch:webPolicy.cloudMaySearch,
        blockedReason:webPolicy.blockedReason,deterministicWebAllowed:decision.allowAutomaticWeb,
        plannedWeb,webPass,evidencePass,webPlannerDecision:planned,
        ...(plannerElapsedMs!==undefined?{plannerElapsedMs}:{}),
        ...(webExecution?{webExecution}:{}),
        ...(priorPublicQuery?{activePublicQuery:priorPublicQuery}:{}),
        ...(memoryCapturePreview?{memoryCapturePreview}:{}),
        ...(step.expect.memoryCapture?{memoryCapturePass}:{}),
        selectedMemoryIds:memory.ids,selectedMemory:selected,
        missingMemoryIds:missing,missingMemoryRecordIds:missingRecordIds,
        memoryEvidence,distractorMemoryIds:distractors,unexpectedMemoryIds:unexpected,
        routeLabelMatch,routePass,memoryPass,answerPass,reviewRequired,
        answerFailures,qualityFlags,answer,
        ...(originalAnswer!==undefined?{originalAnswer}:{}),
        ...(mikanifyApplied!==undefined?{mikanifyApplied}:{}),
        ...(mikanifyElapsedMs!==undefined?{mikanifyElapsedMs}:{}),
        ...(mikanifyError?{mikanifyError}:{}),
        inferenceStats,modelUsed,error,
        elapsedMs:Date.now()-began,
        pass:routePass&&memoryPass&&memoryCapturePass!==false&&plannerFailures.length===0&&answerPass!==false&&evidencePass!==false&&
          (options.mode!=="live" || !!answer)&&!error
      };
      steps.push(result);
      const activePublicQuery=planned?.search===true ? planned.query
        : webExecution?.query?.split(" → ")[0];
      publicContext=activePublicQuery ? {
        activePublicQuery,
        publicSubjects:webExecution?.researchAudit?.recommendationApproved,
        activeTask:executedTask ?? planned?.task,
        publicAnswer:webExecution?.results.length ? answer : undefined
      } : {};
      previous.push({role:"user",content:step.user});
      // Planning mode uses fixed mock replies, preserving follow-up semantics.
      // Live mode uses the actual previous answer (including errors) as context.
      previous.push({role:"assistant",content:answer??step.expect.stubReply??"(No answer supplied)",
        ...(webExecution?.results.length ? {sources:webExecution.results} : {})});
      done++;
      options.onProgress?.(done,total,brainScenarioLabel(scenario.id,scenario.label)+" • turn "+(stepIndex+1));
    }
    if(steps.length)report.cases.push({
      id:scenario.id,number:brainScenarioNumber(scenario.id)??undefined,
      label:scenario.label,group:scenario.group,repeat,steps,
      elapsedMs:Date.now()-started,pass:steps.length===scenario.steps.length&&steps.every(s=>s.pass)
    });
  }
  report.finishedAt=new Date().toISOString();
  return report;
}
export function brainEvalMetrics(report:EvalReport){
  const steps=report.cases.flatMap(c=>c.steps);
  const ratio=(passed:number,total:number)=>total?Math.round(passed/total*1000)/10:0;
  return {
    cases:report.cases.length,turns:steps.length,
    passed:steps.filter(s=>s.pass).length,passRate:ratio(steps.filter(s=>s.pass).length,steps.length),
    // A turn with no detected failure can still have unverified behavior.
    verifiedPassed:steps.filter(s=>s.pass&&!s.reviewRequired).length,
    verifiedPassRate:ratio(steps.filter(s=>s.pass&&!s.reviewRequired).length,steps.length),
    unverifiedTurns:steps.filter(s=>s.reviewRequired).length,
    routes:ratio(steps.filter(s=>s.routeLabelMatch).length,steps.length),
    routeLabelsMismatched:steps.filter(s=>!s.routeLabelMatch).length,
    behavioralRouting:ratio(steps.filter(s=>s.routePass).length,steps.length),
    recall:ratio(steps.filter(s=>s.memoryPass).length,steps.length),
    memoryRecordMisses:steps.reduce((n,s)=>n+(s.missingMemoryRecordIds?.length??0),0),
    memoryDistractors:steps.reduce((n,s)=>n+(s.distractorMemoryIds?.length??0),0),
    memoryPreviews:steps.filter(s=>!!s.memoryCapturePreview).length,
    memoryPreviewMisses:steps.filter(s=>s.memoryCapturePass===false).length,
    webChecks:steps.filter(s=>s.webPass!==null).length,
    webUnobserved:steps.filter(s=>s.webPass===null && s.expected.web!==undefined).length,
    webAgreement:ratio(steps.filter(s=>s.webPass===true).length,steps.filter(s=>s.webPass!==null).length),
    liveSearches:steps.filter(s=>!!s.webExecution?.query && !s.webExecution.results.some(r=>r.engine==="direct webpage")).length,
    documentReads:steps.filter(s=>s.webExecution?.results.some(r=>r.engine==="direct webpage")).length,
    focusedFollowups:steps.reduce((n,s)=>n+(s.webExecution?.researchAudit?.candidateQueries?.length??0)+
      (s.webExecution?.researchAudit?.followupQuery?1:0),0),
    liveSearchesWithSources:steps.filter(s=>s.webExecution?.query && s.webExecution.results.length &&
      !s.webExecution.results.some(r=>r.engine==="direct webpage")).length,
    liveSources:steps.reduce((n,s)=>n+(s.webExecution?.results.length??0),0),
    evidencePasses:steps.filter(s=>["used","shortlist"].includes(
      s.webExecution?.researchAudit?.status??"")).length,
    shortlistTurns:steps.filter(s=>s.webExecution?.researchAudit?.recommendationTask).length,
    shortlistedItems:steps.reduce((n,s)=>
      n+(s.webExecution?.researchAudit?.recommendationApproved?.length??0),0),
    rejectedItems:steps.reduce((n,s)=>
      n+(s.webExecution?.researchAudit?.recommendationRejected??0),0),
    noSupportedMatches:steps.filter(s=>
      s.webExecution?.researchAudit?.status==="no_supported_matches").length,
    attributedRoles:steps.reduce((n,s)=>n+
      (s.webExecution?.researchAudit?.relationsChecked??0),0),
    excludedReferences:steps.reduce((n,s)=>n+
      (s.webExecution?.researchAudit?.exclusionsChecked??0),0),
    evidenceFacts:steps.reduce((n,s)=>n+(s.webExecution?.researchAudit?.status==="attributed" ? 0 : s.webExecution?.researchAudit?.accepted??0),0),
    evidenceUnavailable:steps.filter(s=>s.webExecution?.query &&
      !["used","shortlist","attributed"].includes(s.webExecution?.researchAudit?.status??"")).length,
    evidenceFailures:steps.filter(s=>s.evidencePass===false).length,
    unnecessaryWeb:steps.filter(s=>s.webPass===false &&
      (s.expected.web===false || s.expected.web===undefined && s.expected.route==="chat")).length,
    missedWeb:steps.filter(s=>s.webPass===false &&
      (s.expected.web===true || s.expected.web===undefined && s.expected.route==="research")).length,
    tokensPerSecond:(()=>{
      const samples=steps.map(s=>s.inferenceStats)
        .filter(s=>s && typeof s.outputTokens==="number" &&
          typeof s.evalDurationNs==="number" && s.evalDurationNs>0);
      const tokens=samples.reduce((total,s)=>total+(s?.outputTokens??0),0);
      const ns=samples.reduce((total,s)=>total+(s?.evalDurationNs??0),0);
      return ns>0?Math.round(tokens*1e10/ns)/10:null;
    })(),
    answers:report.mode==="live"
      ? ratio(steps.filter(s=>s.answerPass===true).length,steps.filter(s=>s.answerPass!==null).length):null,
    answerChecks:steps.filter(s=>s.answerPass!==null).length,
    reviewTurns:steps.filter(s=>s.reviewRequired).length,
    qualityFlagTurns:steps.filter(s=>s.qualityFlags?.length).length,
    elapsedMs:report.cases.reduce((n,c)=>n+c.elapsedMs,0)
  };
}
export function brainEvalMarkdown(report:EvalReport):string {
  const m=brainEvalMetrics(report);
  const lines=[
    "# Mikan brain evaluation",
    "",
    "Run: "+report.runId+" • "+report.finishedAt,
    "Mode: "+report.mode+" • Model: "+report.model+" • Attempts: "+report.attempts,
    ...(report.researchMode?["Web interpretation: "+report.researchMode+" (requires human review)"]:[]),
    ...(report.researchMode==="simple"?
      ["Mikanify answer (second local rewrite): "+(report.mikanifyAnswer?"ON":"OFF")+
      " (compare both drafts for factual drift)"]:[]),
    ...(report.build ? ["App build: "+report.build] : []),
    ...(report.buildInfo ? [
      "Desktop version: "+report.buildInfo.version,
      "Desktop commit (compiled): "+report.buildInfo.commit,
      "Desktop build timestamp: "+report.buildInfo.builtAt,
      "Desktop build type: "+report.buildInfo.kind
    ] : []),
    "Synthetic/isolated private facts; no production memory writes. "+
      (report.liveWebEnabled?"PUBLIC WEB ENABLED: live local SearXNG searches.":"No live external searches."),
    "",
    "## Dashboard",
    "",
    "| Metric | Value |","|---|---:|",
    "| Automated checks without detected failure (may be unverified) | "+m.passed+"/"+m.turns+" ("+m.passRate+"%) |",
    "| Verified within selected test mode | "+m.verifiedPassed+"/"+m.turns+" ("+m.verifiedPassRate+"%) |",
    "| Turns awaiting verification/review | "+m.unverifiedTurns+" |",
    "| Exact route-label agreement (diagnostic) | "+m.routes+"% |",
    "| Functional routing checks | "+m.behavioralRouting+"% |",
    "| Memory fact coverage | "+m.recall+"% |",
    "| Raw expected memory-row misses (diagnostic) | "+m.memoryRecordMisses+" |",
    "| Distractor memory records (diagnostic) | "+m.memoryDistractors+" |",
    "| Isolated memory capture previews / minimum misses | "+m.memoryPreviews+" / "+m.memoryPreviewMisses+" |",
    "| Web decisions measured | "+m.webChecks+" |",
    "| Unobserved explicit web expectations | "+m.webUnobserved+" |",
    "| Model tokens per second | "+(m.tokensPerSecond??"n/a")+" |",
    "| Web planning agreement | "+m.webAgreement+"% |",
    "| Public research | "+m.liveSearches+
      " searched turns; "+m.liveSearchesWithSources+" with results; "+
      m.focusedFollowups+" focused follow-ups; "+m.liveSources+" source previews |",
    "| Structured evidence (not verified factual correctness) | "+m.evidencePasses+
      " turns with matched quotes; "+m.evidenceFacts+" extracts; "+m.evidenceUnavailable+
      " searched turns without accepted extracts |",
    "| Screened recommendation shortlists | "+m.shortlistedItems+" admitted; "+
      m.rejectedItems+" rejected; "+m.noSupportedMatches+
      " turns with no supported candidates |",
    "| Explicit evidence relationships | "+m.attributedRoles+
      " verified source predicates; "+m.excludedReferences+" prior references excluded |",
    "| Unnecessary / missed planned searches | "+m.unnecessaryWeb+" / "+m.missedWeb+" |",
    "| Factual answer checks | "+(m.answers===null?"Not run":m.answers+"% ("+m.answerChecks+" scored)")+" |",
    "| Conversational turns needing review | "+m.reviewTurns+" |",
    "| Replies with quality warnings | "+m.qualityFlagTurns+" |",
    "| Total elapsed | "+Math.round(m.elapsedMs/1000)+"s |",""
  ];
  for(const c of report.cases){
    lines.push("## "+(!c.pass?"FAIL":c.steps.some(s=>s.reviewRequired)?"REVIEW":"PASS")+
      " · "+brainScenarioLabel(c.id,c.label)+" (repeat "+c.repeat+")","");
    for(const [i,s] of c.steps.entries()){
      lines.push("### "+(i+1)+". "+s.user,"",
        "- "+(!s.pass?"FAIL":s.reviewRequired?"REVIEW (automatic checks passed)":"PASS")+
          "; route "+s.actualRoute+" (label expected "+(s.expected.route??"any")+
          "; exact match "+(s.routeLabelMatch?"yes":"no, diagnostic only")+
          "; functional behavior "+(s.routePass?"OK":"FAIL")+")",
        ...(s.expected.conversationGoal?["- **Conversation review goal:** "+s.expected.conversationGoal]:[]),
        ...(s.expected.memoryCapture?[
          "- **Read-only memory review expectations:** "+s.expected.memoryCapture.reviewGoals.join(" | "),
          "- Minimum structurally accepted durable user facts: "+s.expected.memoryCapture.minUserFacts+
            "; preview count check: "+(s.memoryCapturePass===null?"unobserved":s.memoryCapturePass?"met":"FAILED"),
          ...(s.memoryCapturePreview?.userFacts.map(f=>"- Proposed user fact (not saved): "+f.fact+" | owner quote: "+f.evidence)??[]),
          ...(s.memoryCapturePreview?.interestItems.map(f=>"- Proposed interest (not saved): "+f.kind+" | "+f.name+
            " | "+f.status+" | owner quote: "+f.evidence)??[])
        ]:[]),
        "- Public web planned: "+(s.plannedWeb===null?"unobserved":s.plannedWeb)+
          "; web check: "+(s.webPass===null?"unobserved":s.webPass?"pass":"FAIL")+
          "; deterministic web allowed: "+s.deterministicWebAllowed+"; planner eligible: "+s.canPlanPublicWeb+
          (s.webPlannerDecision?" ("+(s.webPlannerDecision.search?"requested":"skipped")+")":""),
        "- Memory evidence: "+JSON.stringify(s.memoryEvidence??[]),
        "- Selected memories: "+(s.selectedMemoryIds.join(", ")||"none")+
          "; uncovered facts "+(s.missingMemoryIds.join(", ")||"none")+
          "; raw missing row IDs "+(s.missingMemoryRecordIds?.join(", ")||"none")+
          "; distractors "+(s.distractorMemoryIds?.join(", ")||"none")+
          "; excluded "+(s.unexpectedMemoryIds.join(", ")||"none"),
        "- Time: "+s.elapsedMs+" ms"+
          (s.plannerElapsedMs!==undefined?" (local planner "+s.plannerElapsedMs+" ms)":""));
      if(s.originalAnswer!==undefined) {
        lines.push("- Mikanify applied: "+(s.mikanifyApplied?"yes":"no; original retained")+
          (s.mikanifyElapsedMs!==undefined?" ("+Math.round(s.mikanifyElapsedMs)+" ms)":""));
        if(s.mikanifyError)lines.push("- Mikanify error: "+s.mikanifyError);
        lines.push("","**Research draft before Mikanify:**","",
          "> "+s.originalAnswer.replace(/\r?\n/g,"\n> "),"");
      }
      if(s.answer!==undefined) {
        if(s.originalAnswer!==undefined)
          lines.push("**Final answer after Mikanify:**","",
            "> "+s.answer.replace(/\r?\n/g,"\n> "),"");
        else lines.push("- Response: "+s.answer.replace(/\s+/g," ").slice(0,800));
      }
      if(s.inferenceStats)lines.push("- Inference: "+JSON.stringify({model:s.modelUsed,stats:s.inferenceStats}));
      if(s.error)lines.push("- Error: "+s.error);
      if(s.answerFailures.length)lines.push("- Checks: "+s.answerFailures.join("; "));
      if(s.webExecution){
        if(s.evidencePass!==null && s.evidencePass!==undefined)
          lines.push("- Real source-evidence outcome: "+(s.evidencePass?"validated":"NO VERIFIED ANSWER"));
        const direct=s.webExecution.results.find(source=>source.engine==="direct webpage");
        lines.push(direct ? "- Read public document: "+direct.url : "- Executed SearXNG query: "+(s.webExecution.query??"not executed"),
          "- Actual source previews: "+s.webExecution.results.length);
        if(s.webExecution.searchTrace){
          const trace=s.webExecution.searchTrace;
          lines.push("- Retrieval: "+trace.rawResults+" raw results, "+trace.returnedResults+" retained, "+
            (trace.provisionalResults??0)+" provisional candidates.");
        }
        if(s.webExecution.researchAudit){
          const audit=s.webExecution.researchAudit;
          lines.push("- Structured evidence extraction: "+audit.status+
            "; accepted "+audit.accepted+"; rejected "+audit.rejected+
            "; "+audit.elapsedMs+" ms; "+audit.note);
          if(audit.retrievalMs!==undefined && audit.extractionMs!==undefined)
            lines.push("- Initial retrieval "+audit.retrievalMs+" ms; extraction calls "+audit.extractionMs+
              " ms; evidence stage including recovery "+audit.elapsedMs+" ms.");
          if(audit.taskKind)
            lines.push("- Research task: "+audit.taskKind+(audit.taskSubject ? " | "+audit.taskSubject : ""));
          if(audit.candidateDiscovery)lines.push("- Candidate extraction outcome: "+audit.candidateDiscovery);
          if(audit.unresolvedDetails?.length)lines.push("- Unresolved requested details: "+audit.unresolvedDetails.join("; "));
          if(audit.followupQuery)
            lines.push("- Focused follow-up search: "+audit.followupQuery);
          if(audit.extractionAttempts && audit.extractionAttempts>1)
            lines.push("- Local evidence extraction attempts: "+audit.extractionAttempts);
          if(audit.candidateLeads?.length)
            lines.push("- Source-identified candidates: "+audit.candidateLeads.join(", "));
          for(const query of audit.candidateQueries??[])
            lines.push("- Attempted candidate-specific public lookup: "+query);
          for(const fact of audit.acceptedDetails??[])
            lines.push("- Accepted source fact ["+fact.source+"] "+fact.subject+" | "+
              fact.claim+" | exact quote: "+fact.quote);
          for(const explanation of audit.rejectedDetails??[])
            lines.push("- Rejected evidence lead: "+explanation);
          for(const limit of audit.ignoredRequirements??[])
            lines.push("- Unvalidated limit: "+JSON.stringify(limit));
          if(audit.recommendationTask){
            lines.push("- Candidate evidence: "+(audit.recommendationApproved??[]).length+
              " admitted; "+(audit.recommendationRejected??0)+" rejected; "+
              (audit.constraintsChecked??0)+" hard limits; "+
              (audit.exclusionsChecked??0)+" existing references excluded; "+
              (audit.relationsChecked??0)+" typed creator relations; candidates: "+
              (audit.recommendationApproved??[]).join(", "));
            for(const candidate of audit.recommendationDetails??[]){
              lines.push("  - "+candidate.title+" [source "+candidate.source+"] "+
                candidate.creator,
                "    Identity quote: "+candidate.identityQuote,
                "    Relevance quote: "+candidate.fitQuote);
              for(const measure of candidate.measurements)
                lines.push("    Quantity ["+measure.source+"]: "+measure.value+" "+
                  measure.unit+" | "+measure.quote);
              for(const relation of candidate.relations)
                lines.push("    Attribution ["+relation.source+"]: "+relation.role+
                  " = "+relation.name+" | "+relation.quote);
              if(candidate.missingDetails?.length)
                lines.push("    Still unconfirmed: "+candidate.missingDetails.join(", "));
            }
          }
        }
        for(const [n,src] of s.webExecution.results.entries())
          lines.push("  - ["+(n+1)+"] "+src.title+" | "+src.url+
            " | "+src.content.slice(0,400).replace(/\s+/g," "));
      }
      if(s.activePublicQuery)lines.push("- Prior active public task: "+s.activePublicQuery);
      if(s.webPlannerDecision?.intent)
        lines.push("- Local task classification: "+s.webPlannerDecision.intent);
      if(s.qualityFlags?.length)lines.push("- Human review warnings: "+s.qualityFlags.join("; "));
      lines.push("");
    }
  }
  return lines.join("\n");
}
