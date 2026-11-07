/** Deterministic, privacy-conscious research routing for Pocket Mikan. */
export type ResearchTurn = {
  role: "user" | "assistant";
  content: string;
  sources?: unknown[];
};
export type ResearchRequest = { query: string; recent: boolean };
/** One routing decision, shared by the SearXNG desktop host and Tavily pocket host.
 * Desktop retains its mature Rust query builder; this policy decides whether
 * to force that search, delegate a timeless fact, or stay in ordinary chat.
 */
export type ResearchPlan = {
  mode: "chat" | "research" | "factual";
  query?: string;
  recent: boolean;
};

// "now" on its own is conversational ("Yay, it works now"), not a reason
// to send a private chat message to an external search provider.
const timeSensitive = /\b(latest|recent|recently|updates?|new (?:album|single|record|release|song|tour)|today|tonight|yesterday|this week|this month|right now|currently|current|upcoming|next (?:album|mission|launch|event|tour|release|major milestone|milestone)|news|202[5-9]|announc\w*|release date|schedule|weather|price|stock|election|president|ceo|updated|new version|newest)\b/i;
// Requests to find public information for the user are research, not self-disclosure.
const explicitResearch = /^(?:(?:please\s+)?(?:search(?:\s+(?:for|the web))?|look up|lookup|google|find(?:\s+me)?|research|verify|fact.check|check online|browse)\b|(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:search|look up|find(?:\s+me)?|research|verify|check online|browse)\b)/i;
const factSeeking = /^(?:what(?:'s| is| are| was| were| happened| caused)|when (?:is|was|did|will)|where (?:is|are|was|did)|who (?:is|are|was|were)|how (?:many|much|long|old)|tell me (?:about|more about)|what do you know about|what can you tell me about)\b/i;
const informationQuestion = /^(?:what(?:'s|\s)|when\b|where\b|who\b|why\b|how\b|which\b|is\b|are\b|was\b|were\b|does\b|did\b|do\b|can\b|could\b|will\b|would\b|has\b|have\b|any (?:news|updates|info|details|word)\b|tell me\b|give me\b)/i;
const followUpQuestion = /^(?:(?:and|also|but|so)\s+)?(?:what(?:'s|\s)|when\b|where\b|why\b|how\b|who\b|which\b|is\b|are\b|does\b|did\b|do\b|can\b|could\b|will\b|would\b|any updates\b|tell me more\b)/i;
// "me" is the recipient in "find me" and "tell me", not private context.
const privateContext = /\b(?:my|mine|our|ours)\b|\b(?:about|with|to)\s+me\b/i;

export function researchRequest(question: string, previous: ResearchTurn[] = []): ResearchRequest | null {
  const text = question.trim();
  if (text.length < 4 || text.length > 1500) return null;
  if (/^(?:\/|remember\b|forget\b)/i.test(text)) return null;
  if (/^(?:what(?:'s| is) my\b|who am i\b|do you (?:remember|think|like|love)\b|what do you (?:think|feel|remember)\b|how are you\b|tell me about (?:me|you|your\s+\w+|yourself)\b)/i.test(text)) return null;
  // Self-disclosures, Mikan/persona questions and private context stay local.
  if (/^(?:i(?:['’]m| am| was| have| work| live| like| love| feel| think)\b|my\s+\w+\s+(?:is|was|are)\b|we(?:['’]re| are| have| were)\b|what(?:['’]s| is| are) your\b|who are you\b|what did we\b|what did you and i\b)/i.test(text)) return null;

  const direct = explicitResearch.test(text);
  // Do not silently send private facts to Tavily, even after "find me".
  const publicWebPermission = /\b(?:on the web|on the internet|search the web|search online|look online|check online|google)\b/i.test(text);
  if ((/^(?:i\b|i['’]m\b|my\b|we\b|our\b)/i.test(text) || privateContext.test(text)) &&
      !publicWebPermission) return null;

  // Freshness words only cause automatic search in actual information-seeking
  // questions. Statements and acknowledgments must never trigger Tavily.
  const current = timeSensitive.test(text) && informationQuestion.test(text);
  const factual = factSeeking.test(text) && (!privateContext.test(text) || publicWebPermission);
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
 * Port of the desktop Rust subject/query builder. Keep its regression
 * expectations as the source of truth; this now benefits Tavily too.
 * Search engines, retries, and result validation remain platform-specific.
 */
function researchSubject(text: string): string | null {
  const lower = text.toLowerCase();
  const typePrefixes = [
    "the death metal band ", "the metal band ", "death metal band ",
    "the band ", "the group ", "the musician ", "the music artist ",
    "the artist ", "the singer ", "band ", "artist "
  ];
  for (const prefix of [" about ", " on ", " for ", " regarding ", " from ", " of "]) {
    // The last clause may say "their upcoming album" after naming a band.
    // Keep walking backward until we find a specific subject.
    let end = lower.length;
    while (end > 0) {
      const at = lower.lastIndexOf(prefix, end - 1);
      if (at < 0) break;
      end = at;
      let candidate = text.slice(at + prefix.length).split(/[?!\n]/, 1)[0].trim()
        .replace(/[.,;:]+$/, "").trim();
      const descriptor = typePrefixes.find(value => candidate.toLowerCase().startsWith(value));
      if (descriptor) candidate = candidate.slice(descriptor.length).trim();
      candidate = candidate.split(/\s+/).map(word => {
        const match = /^([A-Z]{2,})['’]s$/.exec(word);
        return match ? match[1] : word;
      }).join(" ");
      if (specificTopic(candidate)) return candidate;
    }
  }
  return null;
}

const ambiguousTopics = new Set([
  "them", "it", "him", "her", "that", "this", "the band", "the group",
  "the artist", "those guys", "a new album", "a new release",
  "the new album", "an album", "their new album", "their next album",
  "their upcoming album", "an upcoming album", "the upcoming album", "the latest album",
  "an update", "updates", "them please", "that band", "a next album"
]);
function specificTopic(subject: string | null | undefined): subject is string {
  return !!subject && subject.length >= 3 && subject.length < 120 &&
    !ambiguousTopics.has(subject.trim().toLowerCase()) &&
    // "A potential release date" is a detail, not a named search subject.
    !/^(?:(?:a|an|the|their|its|any|some)\s+)?(?:(?:new|next|latest|upcoming|potential|possible|confirmed)\s+)*(?:album|record|release(?:\s+date|\s+window)?|title|singles?|songs?|track(?:\s*list)?|date|timeline|schedule|news|info|details)\b/i.test(subject.trim());
}
function quoteTopic(subject: string): string {
  const words = subject.split(/\s+/);
  const descriptiveEnds = new Set([
    "mission", "missions", "program", "programme", "project", "projects",
    "launch", "launches", "spacecraft", "news", "development", "developments"
  ]);
  return words.length >= 2 && words.length <= 4 && subject.length <= 72 &&
    !descriptiveEnds.has(words[words.length - 1].toLowerCase())
    ? '"' + subject + '"' : subject;
}

/** Mirrors the desktop's mature entity extraction without making assumptions
 * based on an assistant's possibly hallucinated previous answer.
 */
export function buildResearchQuery(question: string, previous: ResearchTurn[] = []): string {
  const users = previous.filter(turn => turn.role === "user").map(turn => turn.content);
  const text = question.trim();
  const lower = text.toLowerCase();
  const previousTopic = users.slice(-8).reverse().map(researchSubject).find(specificTopic);
  const albumRequest = ["new album", "next album", "upcoming album", "another album",
    "new record", "next record", "upcoming record"].some(signal => lower.includes(signal));
  const asksAlbumDetail = /\b(?:release date|release window|album title|working title|title|singles?|track\s*list|songs?)\b/i.test(text);
  const albumContext = [...users.slice(-4), text].some(turn =>
    /\b(?:album|record|studio recording)\b/i.test(turn));
  // Build a new search about the last *user-named* artist, not the
  // generic nouns in "Any release date, title, or singles?"
  const detailsOfPriorAlbum = asksAlbumDetail && albumContext && specificTopic(previousTopic) &&
    !specificTopic(researchSubject(text));
  let topic = researchSubject(text);
  if (!specificTopic(topic)) topic = previousTopic ?? topic;
  const musicContext = [...users, text].slice(-7).some(turn =>
    /\b(?:the band|metal|music|album|musician|artist)\b/i.test(turn));
  let query = specificTopic(topic) ? quoteTopic(topic) : text;
  if (detailsOfPriorAlbum) {
    const requested = [
      /\b(?:release date|release window)\b/i.test(text) ? "release date" : "",
      /\b(?:title|named|name)\b/i.test(text) ? "title" : "",
      /\b(?:singles?|tracks?|songs?)\b/i.test(text) ? "singles" : ""
    ].filter(Boolean).join(" ");
    query += " next album " + (requested || "details") + " announcement";
  } else if (albumRequest) {
    query += " next album recording studio announcement";
  } else {
    if (musicContext && !query.toLowerCase().includes(" band")) query += " band";
    const year = text.match(/(?<!\d)(?:19\d{2}|20\d{2}|2100)(?!\d)/)?.[0];
    if (year && !query.includes(year)) query += " " + year;
    if (/\b(?:latest|recent|news|developments)\b/i.test(text)) query += " latest news";
    if (/\b(?:milestone|scheduled)\b/i.test(text)) query += " next mission schedule";
  }
  return query.slice(0, 250);
}

/**
 * Desktop-specific refinement keeps its successful deterministic queries:
 * a genuine research request goes to the Rust search builder; timeless facts
 * can still use Ollama's existing optional tool planner.
 */
export function planResearch(question: string, previous: ResearchTurn[] = []): ResearchPlan {
  const detailFollowup = isResearchFollowup(question, previous) &&
    /\b(?:release date|release window|title|singles?|track\s*list|announcement|confirmed date|launch date|tour dates)\b/i.test(question);
  const request = researchRequest(question, previous);
  if (!request && !detailFollowup) return { mode: "chat", recent: false };
  // New specifics need fresh evidence, not a model's recollection of an
  // earlier snippet that may not have mentioned a date or title.
  if (detailFollowup) {
    return { mode: "research", query: buildResearchQuery(question, previous), recent: true };
  }
  if (!request) return { mode: "chat", recent: false };
  const text = question.trim();
  const desktopFactResearch = /^(?:tell me (?:more )?about|what (?:can you tell me|do you know) about|what is new with|any (?:info|news) (?:on|about)|information (?:on|about))\b/i.test(text);
  if (explicitResearch.test(text) || request.recent || desktopFactResearch) {
    return { mode: "research", query: buildResearchQuery(question, previous), recent: request.recent };
  }
  return { mode: "factual", query: request.query, recent: request.recent };
}

/**
 * Only a genuinely informational follow-up to the immediately preceding
 * sourced reply may reuse cached evidence. A casual "it works!" is not one.
 * Keep this stricter than the desktop's general-purpose context selector.
 */
export function isResearchFollowup(question: string, previous: ResearchTurn[]): boolean {
  const text = question.trim();
  const last = previous[previous.length - 1];
  if (text.length < 4 || text.length > 280 || last?.role !== "assistant" ||
      !last.sources?.length) return false;
  // Elliptical detail questions count as sourced-topic follow-ups even when
  // the user doesn't say "it" or "their". A newly named entity does not.
  const detailFollowup = /^(?:any (?:info|details|news|updates|word|confirmation)\b|what(?:'s| is| about)\b|when(?:'s| is| about)\b|(?:how|where) (?:about|is|are)\b|(?:has|have|did|do|is|are|was|were|will)\b)/i.test(text) &&
    /\b(?:release date|release window|title|singles?|track\s*list|songs?|timeline|schedule|launch date|tour dates)\b/i.test(text) &&
    !specificTopic(researchSubject(text));
  // Predictions about an immediately researched topic should still cite
  // the evidence instead of trusting an old generated answer.
  const prediction = /^(?:do you think (?:they|it|he|she|this|that|we|the)\b|how likely\b|what are the odds\b|what do you expect\b|would you expect\b|your (?:prediction|take)\b)/i.test(text);
  if (!prediction && /^(?:what do you (?:think|feel)|how do you feel|do you (?:think|like|remember)|what(?:'s| is) my\b)/i.test(text)) return false;
  if (!detailFollowup && !prediction && !followUpQuestion.test(text) && !/^(?:tell me more|elaborate|explain that|any updates)\b/i.test(text)) return false;
  // Independent new subjects need fresh evidence, not old citation numbers.
  if (!detailFollowup && /^(?:what (?:is|are|was|were) (?!it\b|that\b|they\b|those\b)|who (?:is|was) (?!he\b|she\b|that\b)|where (?:is|are) (?!it\b|that\b))/i.test(text)) return false;
  if (/\b(?:about|regarding)\s+(?!that\b|it\b|them\b|those\b|this\b|their\b)\w+/i.test(text)) return false;
  return detailFollowup || prediction || /\b(?:it|its|that|those|this|these|they|them|their|there|he|she|his|her|earlier|previous|same)\b/i.test(text) ||
    /^(?:tell me more|elaborate|any updates|and (?:when|where|how|why|what|who)|what about the (?:timeline|schedule|date|plan|mission|release|source|announcement))\b/i.test(text);
}

/** Nano can emit source markers even when no search occurred. Do not display fake citations. */
export function stripUnsupportedCitations(answer: string): string {
  return answer.replace(/[ \t]*\[\d{1,2}\](?=\s|[.,!?;:]|$)/g, "").replace(/[ \t]{2,}/g, " ");
}

/** Compatibility alias for Android builds predating shared routing. */
export const isPocketResearchFollowup = isResearchFollowup;
