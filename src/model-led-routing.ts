import type { DesktopWebPolicy } from "./turn-execution-policy.ts";
import type { Settings } from "./storage.ts";
import type { ResearchPlan } from "./research-routing.ts";

/** Experimental orchestration is opt-in and must not change local Qwen, Gemini
 * or OpenRouter behavior. It skips local semantic web-intent planning only. */
export function isModelLedConversation(settings:Pick<Settings,"provider"|"modelLed">):boolean {
  return settings.provider==="nvidia" && settings.modelLed;
}

/** Public tool declarations still require the owner's automatic-web opt-in and
 * the existing private Notion/memory/attachment/roleplay permission gates. */
export function modelLedWebToolsAllowed(enabled:boolean,policy:Pick<DesktopWebPolicy,"canPlanPublicWeb"|"blockedReason">):boolean {
  return enabled && policy.canPlanPublicWeb && policy.blockedReason===null;
}

/** Browsing during casual conversation must not turn its answer into an
 * unsolicited research headline. Explicit research keeps normal verification. */
export function preserveModelLedChatAnswer(enabled:boolean,
  planMode:ResearchPlan["mode"],explicitSearch:boolean):boolean {
  return enabled && planMode==="chat" && !explicitSearch;
}
