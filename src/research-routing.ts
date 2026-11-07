/**
 * Shared, deterministic research routing for lightweight models.
 *
 * The desktop already applies these principles in Rust research_intent.rs;
 * this portable adapter gives Pocket Mikan the same explicit-search-first
 * behavior instead of relying on Gemini Nano to invent tool calls.
 *
 * Keep it deliberately conservative around personal chat and opinions.
 */
export type ResearchTurn = { role: "user" | "assistant"; content: string };
export type ResearchRequest = { query: string; recent: boolean };

const timeSensitive = /\b(latest|recent|today|tonight|yesterday|this week|this month|now|right now|currently|current|upcoming|next (?:album|mission|launch|event|tour|release)|news|202[5-9]|announc\w*|release date|schedule|weather|price|stock|election|president|ceo|updated|new version|newest)\b/i;
const explicitResearch = /\b(search|look up|lookup|google|find information|find out|research|verify|fact.check|check online|on the web|browse)\b/i;
const factSeeking = /^(?:what (?:is|are|was|were|happened|caused)|when (?:is|was|did|will)|where (?:is|are|was|did)|who (?:is|are|was|were)|how (?:many|much|long|old)|tell me (?:about|more about)|what do you know about|what can you tell me about)\b/i;
const personal = /\b(my|me|mine|our|ours)\b/i;
const followUp = /^(?:and\b|also\b|but\b|so\b|what about\b|how about\b|when\b|where\b|why\b|what (?:about|happened|if|is|was)\b|is (?:it|that)\b|did (?:they|it)\b|any updates\b|tell me more\b)/i;

export function researchRequest(question: string, previous: ResearchTurn[] = []): ResearchRequest | null {
  const text = question.trim();
  if (text.length < 4 || text.length > 1500) return null;
  if (/^(?:\/|remember\b|forget\b)/i.test(text)) return null;
  // Answer introspection, family history, persona chat and casual opinion from
  // conversation/memory, not a third-party search service.
  if (/^(?:what(?:'s| is) my\b|who am i\b|do you (?:remember|think|like|love)\b|what do you (?:think|feel|remember)\b|how are you\b|tell me about (?:me|yourself)\b)/i.test(text)) return null;

  const current = timeSensitive.test(text);
  const direct = explicitResearch.test(text);
  const factual = factSeeking.test(text) && !personal.test(text);
  const previousResearch = previous.slice(-10).reverse().find(turn =>
    turn.role === "user" && (explicitResearch.test(turn.content) || timeSensitive.test(turn.content))
  );
  // A fresh self-contained factual question is not a follow-up just because
  // it starts with "what is", "where is" or "who is".
  const independentTopic = /^(?:what (?:is|are|was|were) (?!it\b|that\b|they\b|those\b)|who (?:is|was) (?!he\b|she\b|that\b)|where (?:is|are) (?!it\b|that\b))/i.test(text);
  const continuation = followUp.test(text) && !independentTopic && previousResearch !== undefined &&
    !/\b(my|me|mine|your|yours|myself)\b/i.test(text);

  if (!direct && !current && !factual && !continuation) return null;
  const recent = current || /\bupdates?\b/i.test(text);
  // Preserve the conversational topic for short follow-up questions without
  // treating Mikan's previously generated answer as factual evidence.
  const query = continuation && text.length < 120
    ? (previousResearch?.content.slice(0, 175) + " " + text).trim().slice(0, 330)
    : text.slice(0, 330);
  return { query, recent };
}
