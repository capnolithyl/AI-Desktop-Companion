import { resolvePublicWebExecution, type DesktopWebPolicy } from "./turn-execution-policy.ts";
import { documentReadDecision, publicDocumentUrls, type PublicResearchContext, type WebPlanningTurn } from "./unified-planner.ts";

/**
 * Mirror production NVIDIA model-led routing: the native provider owns
 * semantic search/read decisions. Never call an auxiliary local LLM.
 * A directed, owner-authorized URL is an execution contract and is read
 * exactly, not translated into an approximate search.
 */
export function modelLedBrainExecution(
  policy:DesktopWebPolicy,
  plan:{mode:string;query?:string;recent?:boolean},
  question:string,
  previous:readonly WebPlanningTurn[],
  context:PublicResearchContext
):ReturnType<typeof resolvePublicWebExecution>{
  const previousDocument=context.activeTask?.kind==="document"
    ? context.activeTask.sourceUrl : undefined;
  const authorizedPrevious=previousDocument && previous.some(turn=>
    turn.role==="user" && publicDocumentUrls([turn.content]).includes(previousDocument));
  const referencesDocument=/\b(?:readme|document|repo(?:sitory)?|webpage|page)\b/i.test(question);
  const followupDocument=policy.canPlanPublicWeb && plan.mode!=="chat" &&
    !policy.publicDocumentUrl && previousDocument && authorizedPrevious && referencesDocument
      ? previousDocument : undefined;
  const document=plan.mode==="research" ? policy.publicDocumentUrl : followupDocument;
  if(document){
    const read=documentReadDecision(document,followupDocument?"refine":"new",undefined,question.slice(0,180));
    return {
      autoSearch:true,researchRoute:"research",researchQuery:read.query,
      researchTask:read.task,researchRecent:!!plan.recent,
      researchCompact:false,researchGeneralFallback:false
    };
  }
  // No synthetic or deterministic search query: NVIDIA invokes search_web or
  // read_webpage itself. Explicit factual/research turns require evidence.
  return {
    autoSearch:false,
    researchRoute:policy.canPlanPublicWeb && plan.mode!=="chat"?"research":"chat",
    researchQuery:undefined,researchTask:undefined,
    researchRecent:!!plan.recent,researchCompact:false,
    researchGeneralFallback:false
  };
}
