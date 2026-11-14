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
    // Even casual chat reaches the *local* model, which can return search:false.
    // This avoids keyword gates mistakenly treating follow-up constraints as
    // isolated preferences (or personal opinions as search requests).
    canPlanPublicWeb: eligible && input.planMode === "chat",
    // Cloud tools must not receive free-form chat before a validated local
    // public-search decision. Explicitly routed research already has a public
    // task and still goes through backend URL/query permission checks.
    cloudMaySearch: eligible && input.provider !== "local" && input.planMode !== "chat",
    blockedReason: reason
  };
}
