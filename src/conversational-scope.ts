/**
 * Only ordinary conversational observations receive the low-detail banter
 * contract. Never use it as a generic truth filter: direct questions, tasks,
 * research, roleplay and owner-directed actions still require full answers.
 *
 * This deliberately classifies speech acts, NOT topics. It is conservative:
 * an ambiguous sentence stays in normal chat rather than losing detail.
 */
export function isCasualObservation(
  message:string,options:{researchActive:boolean;roleplay:boolean;publicWebRequested:boolean}
):boolean {
  const text=message.trim();
  if(options.researchActive||options.roleplay||options.publicWebRequested||
      !text||text.length>1200||text.includes("?")||text.startsWith("/"))return false;
  // Explicit requests and instructions can be phrased without a question mark.
  if(/^(?:please|let['’]?s|can\b|could\b|would\b|will\b|should\b|what\b|who\b|where\b|when\b|why\b|how\b|which\b|is\b|are\b|does\b|did\b|do\b|tell\b|explain\b|show\b|find\b|search\b|look\b|check\b|read\b|write\b|create\b|add\b|fix\b|update\b|merge\b|compare\b|summarize\b|remind\b|recommend\b|help\b|give\b|design\b|build\b|generate\b|implement\b|run\b|test\b|try\b)/i.test(text))return false;
  if(/\b(?:please|(?:can|could|would|will|should) you|you (?:should|need to|have to)|we (?:should|need to|have to)|i (?:want|need|would like) (?:you|us) to|i (?:want|need|would like) to (?:know|learn|find|see|understand|ask)|i wonder (?:if|whether|how|what|when)|i(?:'m| am) (?:wondering|trying|looking for)|(?:what|how) about|go ahead and|take a look|make me|do it)\b/i.test(text))return false;
  return true;
}

export const CASUAL_OBSERVATION_REPLY_CONTRACT = [
  "CASUAL RESPONSE, NOT A FACT QUIZ: The owner is sharing an observation, opinion or experience. Respond to that point naturally, in the configured character's voice. A couple of lively sentences are better than a fabricated mini-review.",
  "MATCH EVIDENCE GRANULARITY: Discuss only the details the owner established or that are genuinely available from reliable provided context. Don't introduce unrequested precise measurements, events, credits, quotes, technical analysis or supposed firsthand experiences to make the reply sound knowledgeable. This rule applies to any subject, not just music.",
  "NO EMPTY DISCLAIMER: Do not replace an ordinary social response with 'I can't verify', 'I cannot confirm', a tool-access announcement, or a request for proof. Simply omit uncertain embellishments and keep chatting. If the conversation reveals a serious safety risk, prioritize established safety guidance instead of casual banter."
].join("\n");
