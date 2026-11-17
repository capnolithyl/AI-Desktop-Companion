import type { WebPlanningTurn } from "./unified-planner.ts";
import { parseWebToolDecision, publicDocumentUrls } from "./unified-planner.ts";
import type { RankableMemory } from "./memory-ranking.ts";
import type { ResearchPlan } from "./research-routing.ts";

/**
 * The policy is a permission boundary, not an English-language classifier.
 * The local AI planner decides whether conversational turns need public research.
 * Content-sensitive privacy, URL and query validation still run before any
 * generated query reaches SearXNG. Do not add keyword/phrase routing here.
 */
export type DesktopWebInput = {
  question: string;
  previous?: readonly WebPlanningTurn[];
  autoSearch: boolean;
  provider: "local" | "auto" | "gemini" | "openrouter";
  planMode: ResearchPlan["mode"];
  notion: boolean;
  personalTurn: boolean;
  capabilityQuestion: boolean;
  existingSearch: boolean;
  attachment: boolean;
  screenshot: boolean;
  liveFrame: boolean;
  roleplay: boolean;
};

export type DesktopWebPolicy = {
  canPlanPublicWeb: boolean;
  cloudMaySearch: boolean;
  blockedReason: string | null;
  /** A safe locator explicitly supplied in THIS turn, never inferred from memory. */
  publicDocumentUrl?: string;
};

export function planDesktopWebExecution(input: DesktopWebInput): DesktopWebPolicy {
  // Only explicit app permissions and selected private-tool routes can block
  // planning. "Just venting", "I wish", "I prefer", "no suggestions", greetings,
  // and follow-up constraints are *meaning*, not permission-flag syntax.
  const reason =
    !input.autoSearch ? "Automatic web tools disabled in Settings" :
    input.notion ? "Owner-shared Notion document routing; public web blocked" :
    input.personalTurn ? "Personal memory question; public web blocked" :
    input.capabilityQuestion ? "Mikan capability question; public web blocked" :
    input.roleplay ? "Roleplay conversation; public web blocked" :
    input.attachment || input.screenshot || input.liveFrame
      ? "Attached private material; public web blocked" :
    input.existingSearch ? "Search panel supplied results already" : null;
  const eligible = reason === null;
  return {
    // Both conversation and an explicit search can use the local planner.
    // On an explicit search it can supply the target and verification criteria.
    canPlanPublicWeb: eligible,
    // Cloud tools must not receive free-form chat before a validated local
    // public-search decision. Explicitly routed research already has a public
    // task and still goes through backend URL/query permission checks.
    cloudMaySearch: eligible && input.provider !== "local" && input.planMode !== "chat",
    blockedReason: reason,
    ...(eligible ? {publicDocumentUrl:publicDocumentUrls([input.question])[0]} : {})
  };
}

/** One execution decision for desktop and Brain Lab. A successful semantic
 * no-search decision must not be overridden by a legacy route label. */
export function resolvePublicWebExecution(
  policy: DesktopWebPolicy,
  plan: {mode:string;query?:string;recent?:boolean},
  decision?: {search:boolean;query?:string;method?:string;task?:import("./unified-planner.ts").ResearchTask;sourceRequirement?:"required"|"optional"},
  ownerFacts:readonly RankableMemory[]=[]
) {
  const permitted=policy.blockedReason===null;
  // Local planner transport/JSON failures are not semantic refusals.
  // Reuse only a *freshly validated* query from the independent public-research
  // route. This cannot bypass an explicit "not-needed" decision, invalid
  // query/privacy rejection, or the deterministic tool-permission boundary.
  const plannerError=decision?.method==="planner-error";
  // When the semantic planner times out on an EXPLICIT, user-supplied public
  // document request, the authorized URL itself is sufficient to attempt a
  // direct read. Do not construct a search from private chat text, and never
  // reuse a URL from assistant output or an unrelated earlier message.
  const document=permitted && plannerError && plan.mode==="research"
    ? policy.publicDocumentUrl : undefined;
  const documentParts=document ? new URL(document) : null;
  const documentTopic=documentParts
    ? (documentParts.hostname+" "+documentParts.pathname.replace(/[/_.-]+/g," ")).slice(0,180)
    : undefined;
  const safeRecovery=permitted && plannerError && plan.mode==="research"
    ? parseWebToolDecision(JSON.stringify({web:{
        search:true,
        query:documentTopic || plan.query || "",
        reason:document ? "User-authorized public document read after planner error" :
          "Validated public route after planner error",
        ...(document ? {task:{kind:"lookup",subject:"",
          entityType:"public document",details:["requested document contents"],
          preferences:[],sourceUrl:document,requirements:[],roles:[],exclude:[]}} : {})
      }}),true,[],ownerFacts) : null;
  const recoveredQuery=safeRecovery?.search ? safeRecovery.query : undefined;
  const semantic=decision && decision.method!=="disabled" && !plannerError;
  const query=permitted ? recoveredQuery ?? (semantic ? decision.search ? decision.query : undefined
    : plan.mode==="research" && !plannerError ? plan.query : undefined) : undefined;
  const factualFallback=permitted && !semantic && !plannerError && plan.mode==="factual";
  return {
    autoSearch:!!query || factualFallback,
    researchRoute:query ? "research" : factualFallback ? "factual" : "chat",
    researchQuery:query,
    researchTask:query ? recoveredQuery ? safeRecovery?.task : decision?.search ? decision.task : undefined : undefined,
    researchRecent:!!plan.recent,
    // A failed optional lookup may fall back to general model knowledge.
    // All named verification, hard constraints, discovery, URLs and recent
    // research still require actual sources, never an invented sourced answer.
    researchGeneralFallback:!!query && decision?.search===true &&
      decision.sourceRequirement==="optional" && !plan.recent &&
      decision.task?.kind==="lookup" &&
      !decision.task.sourceUrl &&
      !decision.task.requirements.length && !decision.task.roles.length
  };
}
