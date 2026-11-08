import { isSelfKnowledgeQuestion } from "./self-knowledge.ts";
import { planResearch, type ResearchPlan, type ResearchTurn } from "./research-routing.ts";

/**
 * A single routing decision for desktop chat. The selected Ollama model is
 * allowed to be conversational, while genuinely public research still gets
 * SearXNG and evidence checks. In particular, a missing research query MUST
 * NOT mean "let the legacy Rust planner search the web anyway".
 */
export type DesktopTurnDecision = {
  plan: ResearchPlan;
  capabilityQuestion: boolean;
  allowAutomaticWeb: boolean;
  verifyWebEvidence: boolean;
};

const chat: ResearchPlan = { mode: "chat", recent: false };

/** "Can you search the web?" asks about a feature; "Can you search the
 * web for Artemis news?" is an actual request to perform research. */
function explicitPublicResearchTask(text: string): boolean {
  const phrase = text.trim().toLowerCase().replace(/\s+/g," ");
  return /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:search(?:\s+(?:the\s+)?(?:web|internet|online))?|browse|look\s+up|research)\b.{0,40}\b(?:for|about|on)\s+\S+/i.test(phrase)
    || /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:search|research|look\s+up)\s+(?!(?:the\s+)?(?:web|internet|online)\s*[?.!]*$)\S.{8,}/i.test(phrase);
}

export function decideDesktopTurn(
  question: string,
  previous: ResearchTurn[] = [],
  options: {attachment?: boolean; explicitSearch?: boolean; automaticWebEnabled?: boolean} = {}
): DesktopTurnDecision {
  const autoEnabled = options.automaticWebEnabled ?? true;
  if(options.attachment) return {
    plan:chat,capabilityQuestion:false,allowAutomaticWeb:false,verifyWebEvidence:false
  };
  // Explicit research from the search panel has already retrieved its sources.
  // It should still use the research answer/post-processing path.
  if(options.explicitSearch) return {
    plan:{mode:"research",recent:false},capabilityQuestion:false,
    allowAutomaticWeb:false,verifyWebEvidence:true
  };
  const isCapability = isSelfKnowledgeQuestion(question) && !explicitPublicResearchTask(question);
  // Questions about Mikan's own previous words are a conversational follow-up,
  // even when the prior topic happened to be a recent public news event.
  const isConversationMeta = /^(?:why did you say|what did you mean|why would you say|why are you saying|can you explain what you meant)\b/i.test(question.trim());
  const plan = isCapability || isConversationMeta ? chat : planResearch(question,previous);
  const useWeb=autoEnabled && plan.mode!=="chat";
  return {
    plan,capabilityQuestion:isCapability,
    allowAutomaticWeb:useWeb,
    verifyWebEvidence:useWeb
  };
}
