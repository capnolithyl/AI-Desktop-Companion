/**
 * User-opted-in, conversation-grounded learning. An answer like "Vanilla for
 * sure" gets its meaning from Mikan's immediately preceding question.
 * Works without asking Nano to manufacture evidence or classify intentions.
 * Never sends the exchange to a web search provider.
 */
export type LearningTurn = { role: "user" | "assistant"; content: string };
export type LearningMemory = { fact: string; question: string; answer: string };

const startLearning = /^(?:(?:please\s+)?ask me (?:anything|questions?|some questions?)(?:\s+about me)?\s+and\s+(?:remember|save|store|keep|learn)(?:\s+(?:my|the|each|every|those))?\s+(?:answers?|responses?|things I tell you)|(?:i(?:'d| would)?\s+(?:like|want)\s+(?:you|mikan)\s+to\s+learn\s+(?:some\s+)?things?\s+about me)|(?:get to know me\s+and\s+(?:remember|save)\s+(?:what|my answers)))(?:[.!?]|\s+.*)?$/i;
const stopLearning = /^(?:stop\s+(?:asking\s+me\s+questions?|learning\s+about\s+me)|stop\s+(?:asking(?:\s+me)?\s+questions?\s+and\s+)?(?:remembering|saving|learning)(?:\s+(?:my|the|those)\s+answers?)?|(?:stop|end|quit|pause)\s+(?:the\s+)?(?:learning|memory|question)\s+(?:mode|session)|(?:don't|do not)\s+(?:remember|save)\s+(?:my|the)\s+answers?\s+anymore)(?:[.!?\s]*)$/i;

/** Starting is an explicit opt-in. A normal casual question is never opt-in. */
export function learningCommand(message: string): "start" | "stop" | null {
  const text = message.trim();
  if (stopLearning.test(text)) return "stop";
  if (startLearning.test(text)) return "start";
  return null;
}

/** Chat messages live in SQLite, so learning mode survives restart per thread. */
export function learningSessionActive(turns: LearningTurn[]): boolean {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role !== "user") continue;
    const command = learningCommand(turns[i].content);
    if (command) return command === "start";
  }
  return false;
}

const sensitive = /\b(?:password|passcode|secret|api key|access token|social security|ssn|credit card|bank account|routing number|account number|pin code|street address|medical|diagnos\w*|therapy|therapist|medication|depress\w*|suicid\w*|pregnan\w*|religio\w*|christian|muslim|jewish|political|vot(?:e|ed|ing)|sexual|salary|income|mortgage|debt|insurance policy)\b/i;
const emptyOrUncertain = /^(?:i (?:don'?t|do not) know|no idea|not sure|i'?m not sure|not really sure|can'?t say|pass|skip|prefer not to say|rather not say|maybe|it depends|depends|dunno|idk|nothing|none)\b/i;
const otherQuestion = /^(?:what|when|where|who|why|how|which|can|could|would|will|do|did|does|is|are|have|has)\b.+\?$/i;

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/[\s.?!]+$/g, "").trim();
}

function lastAskedQuestion(reply: string): string | null {
  const text = reply.replace(/\r?\n/g, " ");
  const matches = [...text.matchAll(/(?:^|[.!?]\s+)([^?!]{7,220}\?)/g)];
  const item = matches.at(-1)?.[1]?.trim().replace(/^(?:and|so|now|okay|alright|hmm|then)[,:\s]+/i, "");
  if (!item || !/\b(?:what|where|when|who|why|how|which|do|did|would|could|are|is|have|has|tell me)\b/i.test(item)) return null;
  return clean(item) + "?";
}

function answerValue(userMessage: string): string | null {
  // Check interrogative punctuation BEFORE cleanup removes it. Otherwise
  // "What about you?" becomes an invented user preference.
  if (userMessage.trim().endsWith("?") || otherQuestion.test(userMessage.trim())) return null;
  const source = clean(userMessage);
  if (source.length < 1 || source.length > 400 || /^(?:\/|remember\b)/i.test(source) ||
    otherQuestion.test(source) || emptyOrUncertain.test(source) || sensitive.test(source)) return null;
  // One self-contained response is enough evidence; irrelevant banter after it
  // should not become part of a permanent user preference.
  let candidate = source.split(/(?<=[.!])\s+/, 1)[0].replace(/[.!?]+$/, "").trim()
    .replace(/^(?:(?:oh|well|okay|ok|hmm|uh|um|i'?d say|i think)\b[,:\s]*){0,3}/i, "")
    .replace(/\s+(?:for sure|definitely|hands down|of course)$/i, "");
  candidate = clean(candidate).replace(/^[,;:\s]+/, "");
  if (!candidate || candidate.length > 220 || emptyOrUncertain.test(candidate) || sensitive.test(candidate)) return null;
  return candidate;
}

const genericYes = /^(?:yes|yeah|yep|absolutely|definitely|sure|of course)$/i;
const genericNo = /^(?:no|nope|nah|not really)$/i;

/** Only accept an answer if the most recent saved assistant turn asked a question. */
export function questionAnswerMemory(
  message: string, previous: LearningTurn[]
): LearningMemory | null {
  const last = previous.at(-1);
  if (!last || last.role !== "assistant") return null;
  const question = lastAskedQuestion(last.content);
  const answer = answerValue(message);
  if (!question || !answer || sensitive.test(question)) return null;

  const normalizedQuestion = question.replace(/’/g, "'");
  const lower = normalizedQuestion.toLowerCase();
  const favorite =
    /\bwhat(?:'s| is| would be)\s+your\s+favou?rite\s+([^?]+)/i.exec(normalizedQuestion) ?? 
    /\bwhich\s+([^?]+?)\s+is\s+your\s+favou?rite\b/i.exec(normalizedQuestion);
  const interest =
    /\b(?:what|which)\s+(?:kind|type|sort)\s+of\s+([^?]+?)\s+do you (?:like|love|enjoy|prefer)\b/i.exec(question);
  const yesNoSubject = /\b(?:do|did|would)\s+you\s+(?:like|love|enjoy|prefer)\s+([^?]+)/i.exec(lower);
  let fact: string;
  if (favorite) {
    const topic = clean(favorite[1]).replace(/\b(?:for you|these days|right now)$/i, "").trim();
    fact = "The user's favorite " + topic + " is " + answer;
  } else if (interest) {
    fact = "The user likes " + answer + " (" + clean(interest[1]) + ")";
  } else if (/\bwhere\s+did\s+you\s+grow\s+up\b/i.test(lower)) {
    fact = "The user grew up " + (/^(?:near|around|outside|in)\b/i.test(answer) ? answer : "in " + answer);
  } else if (/\bwhere\s+(?:do|are)\s+you\s+(?:live|from)\b/i.test(lower)) {
    fact = /\bfrom\b/.test(lower) ? "The user is from " + answer : "The user lives " + (/^(?:in|near|around)\b/i.test(answer) ? answer : "in " + answer);
  } else if (/\bwhat\s+(?:do you do for (?:work|a living)|is your (?:job|occupation|profession))\b/i.test(lower)) {
    fact = "The user " + (/\b(?:development|design|programming|marketing|engineering|technology)\b/i.test(answer) ? "works in " : "works as ") + answer;
  } else if (/\bwhat\s+(?:do you (?:like|love|enjoy) doing|are your hobbies)\b/i.test(lower)) {
    fact = "The user enjoys " + answer;
  } else if (yesNoSubject && (genericYes.test(answer) || genericNo.test(answer))) {
    const subject = clean(yesNoSubject[1]);
    fact = "The user " + (genericYes.test(answer) ? "likes " : "does not like ") + subject;
  } else {
    // A general, lossless QA memory remains useful even for topics that have
    // no known slot template. The answer is never inferred from model banter.
    fact = 'When asked "' + question.slice(0, 180) + '", the user answered "' +
      answer.slice(0, 200) + '"';
  }
  fact = clean(fact);
  if (fact.length > 500 || sensitive.test(fact)) return null;
  return { fact, question, answer };
}

/** Opt-in guard belongs to the session layer, not the grounded QA parser. */
export function contextualLearningFact(
  message: string, previous: LearningTurn[]
): LearningMemory | null {
  return learningSessionActive(previous) ? questionAnswerMemory(message, previous) : null;
}
