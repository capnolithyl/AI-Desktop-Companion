/** Deterministic, privacy-conscious research routing for Pocket Mikan. */
export type ResearchTurn = {
  role: "user" | "assistant";
  content: string;
  sources?: unknown[];
};
export type ResearchRequest = { query: string; recent: boolean };

// "now" on its own is conversational ("Yay, it works now"), not a reason
// to send a private chat message to an external search provider.
const timeSensitive = /\b(latest|recent|today|tonight|yesterday|this week|this month|right now|currently|current|upcoming|next (?:album|mission|launch|event|tour|release)|news|202[5-9]|announc\w*|release date|schedule|weather|price|stock|election|president|ceo|updated|new version|newest)\b/i;
const explicitResearch = /^(?:(?:please\s+)?(?:search(?:\s+(?:for|the web))?|look up|lookup|google|find information|find out|research|verify|fact.check|check online|browse)\b|(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:search|look up|find out|research|verify|check online|browse)\b)/i;
const factSeeking = /^(?:what(?:'s| is| are| was| were| happened| caused)|when (?:is|was|did|will)|where (?:is|are|was|did)|who (?:is|are|was|were)|how (?:many|much|long|old)|tell me (?:about|more about)|what do you know about|what can you tell me about)\b/i;
const informationQuestion = /^(?:what(?:'s|\s)|when\b|where\b|who\b|why\b|how\b|which\b|is\b|are\b|was\b|were\b|does\b|did\b|do\b|can\b|could\b|will\b|would\b|has\b|have\b|any (?:news|updates)\b|tell me\b|give me\b)/i;
const followUpQuestion = /^(?:(?:and|also|but|so)\s+)?(?:what(?:'s|\s)|when\b|where\b|why\b|how\b|who\b|which\b|is\b|are\b|does\b|did\b|do\b|can\b|could\b|will\b|would\b|any updates\b|tell me more\b)/i;
const privateContext = /\b(my|me|mine|our|ours)\b/i;

export function researchRequest(question: string, previous: ResearchTurn[] = []): ResearchRequest | null {
  const text = question.trim();
  if (text.length < 4 || text.length > 1500) return null;
  if (/^(?:\/|remember\b|forget\b)/i.test(text)) return null;
  if (/^(?:what(?:'s| is) my\b|who am i\b|do you (?:remember|think|like|love)\b|what do you (?:think|feel|remember)\b|how are you\b|tell me about (?:me|yourself)\b)/i.test(text)) return null;
  // Self-disclosures, Mikan/persona questions and private context stay local.
  if (/^(?:i(?:['’]m| am| was| have| work| live| like| love| feel| think)\b|my\s+\w+\s+(?:is|was|are)\b|we(?:['’]re| are| have| were)\b|what(?:['’]s| is| are) your\b|who are you\b|what did we\b|what did you and i\b)/i.test(text)) return null;

  const direct = explicitResearch.test(text);
  if (!direct && (/^(?:i\b|i['’]m\b|my\b|we\b|our\b)/i.test(text) || privateContext.test(text))) return null;

  // Freshness words only cause automatic search in actual information-seeking
  // questions. Statements and acknowledgments must never trigger Tavily.
  const current = timeSensitive.test(text) && informationQuestion.test(text);
  const factual = factSeeking.test(text) && !privateContext.test(text);
  const lastUser = previous.slice().reverse().find(turn => turn.role === "user");
  const previousResearch = lastUser &&
    (explicitResearch.test(lastUser.content) || timeSensitive.test(lastUser.content)) ? lastUser : undefined;
  const independentTopic = /^(?:what (?:is|are|was|were) (?!it\b|that\b|they\b|those\b)|who (?:is|was) (?!he\b|she\b|that\b)|where (?:is|are) (?!it\b|that\b))/i.test(text);
  const continuation = followUpQuestion.test(text) && !independentTopic && previousResearch !== undefined &&
    !/\b(my|me|mine|your|yours|myself)\b/i.test(text);

  if (!direct && !current && !factual && !continuation) return null;
  const recent = timeSensitive.test(text) && (direct || informationQuestion.test(text) || continuation)
    || /\bupdates?\b/i.test(text) && (direct || informationQuestion.test(text) || continuation);
  const query = continuation && text.length < 120
    ? (previousResearch?.content.slice(0, 175) + " " + text).trim().slice(0, 330)
    : text.slice(0, 330);
  return { query, recent };
}

/**
 * Only a genuinely informational follow-up to the immediately preceding
 * sourced reply may reuse cached evidence. A casual "it works!" is not one.
 * Keep this stricter than the desktop's general-purpose context selector.
 */
export function isPocketResearchFollowup(question: string, previous: ResearchTurn[]): boolean {
  const text = question.trim();
  const last = previous[previous.length - 1];
  if (text.length < 4 || text.length > 280 || last?.role !== "assistant" || !last.sources?.length) return false;
  if (/^(?:what do you (?:think|feel)|how do you feel|do you (?:think|like|remember)|what(?:'s| is) my\b)/i.test(text)) return false;
  if (!followUpQuestion.test(text) && !/^(?:tell me more|elaborate|explain that|any updates)\b/i.test(text)) return false;
  // Independent new subjects need fresh evidence, not old citation numbers.
  if (/^(?:what (?:is|are|was|were) (?!it\b|that\b|they\b|those\b)|who (?:is|was) (?!he\b|she\b|that\b)|where (?:is|are) (?!it\b|that\b))/i.test(text)) return false;
  if (/\b(?:about|regarding)\s+(?!that\b|it\b|them\b|those\b|this\b|their\b)\w+/i.test(text)) return false;
  return /\b(?:it|its|that|those|this|these|they|them|their|there|he|she|his|her|earlier|previous|same)\b/i.test(text) ||
    /^(?:tell me more|elaborate|any updates|and (?:when|where|how|why|what|who)|what about the (?:timeline|schedule|date|plan|mission|release|source|announcement))\b/i.test(text);
}

/** Nano can emit source markers even when no search occurred. Do not display fake citations. */
export function stripUnsupportedCitations(answer: string): string {
  return answer.replace(/[ \t]*\[\d{1,2}\](?=\s|[.,!?;:]|$)/g, "").replace(/[ \t]{2,}/g, " ");
}
