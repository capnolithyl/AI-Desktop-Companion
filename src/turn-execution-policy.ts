import { clearlySocialChat } from "./desktop-turn-routing.ts";
import type { ResearchPlan } from "./research-routing.ts";

/** The desktop's single explicit outbound-web policy. Retrieval chooses the
 * context; this policy chooses whether that turn may invoke public web tools.
 * Native Rust and server-side URL validation remain defense in depth.
 */
export type DesktopWebInput = {
  question: string;
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
    // Deterministic research already has a route. Skip the auxiliary
    // local model call entirely for greetings and other obvious small talk.
    canPlanPublicWeb: eligible && input.planMode === "chat"
      && !clearlySocialChat(input.question),
    // Cloud providers may use read-only tools for ambiguous/public factual
    // turns even when local deterministic research isn't selected.
    cloudMaySearch: eligible && input.provider !== "local"
      && !clearlySocialChat(input.question),
    blockedReason: reason
  };
}
