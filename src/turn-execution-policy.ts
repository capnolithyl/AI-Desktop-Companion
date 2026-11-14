import { clearlySocialChat } from "./desktop-turn-routing.ts";
import { publicPlanningHistory, type WebPlanningTurn } from "./unified-planner.ts";
import type { ResearchPlan } from "./research-routing.ts";

/** The desktop's single explicit outbound-web policy. Retrieval chooses the
 * context; this policy chooses whether that turn may invoke public web tools.
 * Native Rust and server-side URL validation remain defense in depth.
 */
export type DesktopWebInput = {
  question: string;
  /** Previous turns from this same conversation; only short safe user turns are considered. */
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

/** An owner sharing a taste or personal update is conversation, not an
 * invitation to research public facts or reveal preferences to web search.
 * Explicit web requests and genuine questions still follow normal routing.
 */
/** Only the *intent* to discover public options matters here; topics and
 * brands are deliberately absent. A local model still makes the web choice.
 */
export function expressesDiscoveryNeed(text:string):boolean{
  return /\b(?:running out of|craving another|looking for|trying to find|hoping to find)\b/i.test(text)
    || (/\b(?:want|need|wish|would love|could use|hoping for|craving)\b/i.test(text)
      && /\b(?:more|another|alternatives?|options?|suggestions?|something|anything|find|discover)\b/i.test(text));
}

export function recentDiscoveryRefinement(question:string,previous:readonly WebPlanningTurn[]=[]):boolean{
  const turns=publicPlanningHistory(previous);
  const current=publicPlanningHistory([{role:"user",content:question}]);
  if(!turns.length || !current.length || question.length>260)return false;
  const optOut=/\b(?:not asking for|no recommendations|don't (?:search|recommend)|do not (?:search|recommend)|just venting|just sharing|forget (?:the search|recommendations))\b/i;
  if(optOut.test(question)||optOut.test(turns.at(-1)!))return false;
  // Permission to ask the local planner is carried by an earlier expressed
  // public discovery need. No search is executed until the current-turn model
  // confirms a relevant continuation and produces a privacy-checked query.
  return turns.some(expressesDiscoveryNeed);
}

export function ownerDisclosure(question:string):boolean{
  const text=question.trim();
  const firstPerson=/^(?:(?:so\s+)?(?:have i told you|did i tell you|did i mention)\b|one of my\b|my\b|i(?:['’]m| am|['’]ve| have| just| really| think| feel| believe| love| like| enjoy| prefer| hate| dislike| consider| got| recently)\b|we(?:['’]re| are| have)\b|our\b)/i;
  const explicitResearch=/\b(?:search(?: the web)?|browse|google|look up|research|verify|fact.check|check online)\b/i;
  const publicQuestion=/\b(?:what|when|where|who|why|which|how)\b[^?!]{0,120}\?/i.test(text);
  // An expressed unmet need is not merely a taste disclosure. Let the local
  // AI planner decide whether public discovery would be useful, regardless
  // of the subject (music/books/games/software/etc). This only *permits*
  // planning; it never automatically searches or exports private context.
  return firstPerson.test(text) && !explicitResearch.test(text) && !publicQuestion && !expressesDiscoveryNeed(text);
}

export function planDesktopWebExecution(input: DesktopWebInput): DesktopWebPolicy {
  const reason =
    !input.autoSearch ? "Automatic web tools disabled in Settings" :
    input.notion ? "Owner-shared Notion document routing; public web blocked" :
    input.personalTurn ? "Personal memory question; public web blocked" :
    input.capabilityQuestion ? "Mikan capability question; public web blocked" :
    input.roleplay ? "Roleplay conversation; public web blocked" :
    input.attachment || input.screenshot || input.liveFrame
      ? "Attached private material; public web blocked" :
    input.existingSearch ? "Search panel supplied results already" :
    input.planMode === "chat" && ownerDisclosure(input.question)
      && !recentDiscoveryRefinement(input.question,input.previous)
      ? "Owner is sharing a personal preference; no public lookup needed" : null;
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
