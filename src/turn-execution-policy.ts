import type { WebPlanningTurn } from "./unified-planner.ts";
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
    blockedReason: reason
  };
}

/** One execution decision for desktop and Brain Lab. A successful semantic
 * no-search decision must not be overridden by a legacy route label. */
export function resolvePublicWebExecution(
  policy: DesktopWebPolicy,
  plan: {mode:string;query?:string;recent?:boolean},
  decision?: {search:boolean;query?:string;method?:string;task?:import("./unified-planner.ts").ResearchTask;sourceRequirement?:"required"|"optional"}
) {
  const permitted=policy.blockedReason===null;
  const semantic=decision && decision.method!=="disabled";
  const query=permitted ? semantic ? decision.search ? decision.query : undefined
    : plan.mode==="research" ? plan.query : undefined : undefined;
  const factualFallback=permitted && !semantic && plan.mode==="factual";
  return {
    autoSearch:!!query || factualFallback,
    researchRoute:query ? "research" : factualFallback ? "factual" : "chat",
    researchQuery:query,
    researchTask:query && decision?.search ? decision.task : undefined,
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
