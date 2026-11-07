import type { CharacterCategory } from "../memory-client";

/** Explicit conversational memory saves must bypass the LLM's verbal promises. */
type PreviousTurn = { role: "user" | "assistant"; content: string };
type UserMemory = {
  kind: "user";
  fact: string;
  description: string;
  sourceText: string;
};
type CharacterMemory = {
  kind: "character";
  category: CharacterCategory;
  label: string;
  value: string;
  description: string;
  sourceText: string;
};
type NeedsDetail = { kind: "clarify"; description: string };
export type ExplicitMemoryIntent = UserMemory | CharacterMemory | NeedsDetail;

const clean = (text: string) =>
  text.trim().replace(/[\s.!?]+$/u, "").trim().replace(/\s+/gu, " ");
const truncate = (text: string) => text.slice(0, 470);

/** Recognize introductions in conversational language, not just "My name is…".
 * An "I'm ..." statement is only a name when it resembles a name, never a
 * temporary state ("I'm tired") or a job ("I'm a developer").
 */
function introducedName(raw: string): string | null {
  const text = clean(raw);
  const greeting = /^(?:hi|hey|hello|hiya|good (?:morning|afternoon|evening))\b[!,.:\s]*/iu;
  const hasGreeting = greeting.test(text);
  const statement = text.replace(greeting, "").trim();
  const match = /^(my name is|(?:you can |please )?call me|i go by|i['’]m|i am)\s+(.+)$/iu.exec(statement);
  if (!match) return null;

  const name = clean(match[2]);
  if (!/^\p{L}[\p{L}\p{M}'’-]*(?:[ -]\p{L}[\p{L}\p{M}'’-]*){0,3}$/u.test(name) || name.length > 80) return null;
  const informal = /^(?:i['’]m|i am)$/iu.test(match[1]);
  const first = name.split(/[\s-]/u)[0];
  const lowerFirst = first.toLowerCase();
  const nonNames = new Set(["a", "an", "the", "so", "very", "really", "just", "not",
    "too", "here", "there", "fine", "good", "great", "okay", "ok",
    "tired", "happy", "sad", "hungry", "bored", "busy", "testing",
    "working", "trying", "looking", "feeling", "going", "doing",
    "new", "ready", "sorry", "sure", "wondering"]);
  if (informal && (nonNames.has(lowerFirst) || (!hasGreeting && !/^\p{Lu}/u.test(name)))) return null;
  return name;
}


function fromCharacterStatement(text: string): CharacterMemory | null {
  const statement = clean(text).replace(/^mikan[,:\s]+/i, "");
  const favorite = /^(?:your|mikan'?s)\s+favou?rite\s+([a-z][a-z ]{1,48})\s+is\s+(.+)$/i.exec(statement);
  if (favorite) {
    const subject = clean(favorite[1]).toLowerCase();
    const value = clean(favorite[2]);
    if (value.length > 0 && value.length <= 500) return {
      kind: "character", category: "favorites",
      label: "Favorite " + subject, value,
      description: "Mikan's favorite " + subject + " is " + value,
      sourceText: text
    };
  }
  const preference = /^(?:you|mikan)\s+(like|love|dislike|hate)\s+(.+)$/i.exec(statement);
  if (preference) {
    const verb = preference[1].toLowerCase();
    const value = clean(preference[2]);
    if (!value || value.length > 500) return null;
    const negative = verb === "dislike" || verb === "hate";
    return {
      kind: "character",
      category: negative ? "dislikes" : "likes",
      label: negative ? "Dislikes" : "Likes",
      value, description: "Mikan " + verb + "s " + value, sourceText: text
    };
  }
  return null;
}

function fromUserStatement(source: string, explicit: boolean): UserMemory | null {
  const text = clean(source);
  if (!text || text.length > 490 || /^(?:what|why|when|where|how|who|can|could|will|do|did)\b/i.test(text)) return null;
  let fact = "";
  let description = "";
  const name = introducedName(text);
  const favorite = /^my favou?rite\s+([a-z][a-z ]{1,48})\s+is\s+(.+)$/i.exec(text);
  const verbs = /^i\s+(love|like|enjoy|prefer|hate|dislike|live in|work as|work at|play|have)\s+(.+)$/i.exec(text);
  const im = /^(?:i am|i'm)\s+(.+)$/i.exec(text);
  if (name) {
    fact = "The user is named " + name;
    description = "your name is " + name;
  } else if (favorite) {
    const topic = clean(favorite[1]).toLowerCase();
    const value = clean(favorite[2]);
    fact = "The user says their favorite " + topic + " is " + value;
    description = "your favorite " + topic + " is " + value;
  } else if (verbs) {
    const action = verbs[1].toLowerCase();
    const value = clean(verbs[2]);
    const actionMap: Record<string, string> = {
      love: "loves", like: "likes", enjoy: "enjoys", prefer: "prefers",
      hate: "hates", dislike: "dislikes", "live in": "lives in",
      "work as": "works as", "work at": "works at", play: "plays", have: "has"
    };
    fact = "The user " + actionMap[action] + " " + value;
    description = "you " + action + " " + value;
  } else if (im) {
    const value = clean(im[1]);
    if (!explicit && /^(?:thinking|wondering|trying|feeling|looking|going)\b/i.test(value)) return null;
    fact = "The user is " + value;
    description = "you're " + value;
  } else {
    if (!explicit || !/^(?:i\b|my\b|we\b|our\b)/i.test(text)) return null;
    // Don't manufacture a third-person assertion from ambiguous source text.
    fact = 'The user said: "' + truncate(text) + '"';
    description = "what you told me";
  }
  if (!fact || fact.length > 500) return null;
  return { kind: "user", fact, description, sourceText: source };
}

function fromStatement(text: string, explicit: boolean): UserMemory | CharacterMemory | null {
  return fromCharacterStatement(text) ?? fromUserStatement(text, explicit);
}

function fromRecentContext(turns: PreviousTurn[]): UserMemory | CharacterMemory | null {
  // "Remember that" may refer to a previous USER statement, never generic
  // assistant banter. An assistant preference is eligible only when the user
  // explicitly asked for it and then separately requests saving it.
  for (let i = turns.length - 1; i >= Math.max(0, turns.length - 10); i--) {
    const turn = turns[i];
    if (turn.role !== "user") continue;
    const userFact = fromUserStatement(turn.content, false);
    if (userFact) return userFact;
    if (/\b(your|you|mikan)\b/i.test(turn.content) &&
        /favou?rite|you\s+(?:like|love|dislike|hate)/i.test(turn.content)) {
      const answer = turns[i + 1];
      if (answer?.role === "assistant") {
        const match = /\bmy\s+favou?rite\s+([a-z][a-z ]{1,48})\s+is\s+([^.!?\n]+)/i.exec(answer.content);
        if (match) {
          const characterFact = fromCharacterStatement("Your favorite " + match[1] + " is " + match[2]);
          if (characterFact) return characterFact;
        }
      }
    }
  }
  return null;
}

export function resolveExplicitMemoryIntent(
  message: string, preceding: PreviousTurn[]
): ExplicitMemoryIntent | null {
  const input = message.trim();
  if (!input) return null;
  // Questions about existing retention should not modify memory.
  if (/^(?:do|did)\s+you\s+remember\b/i.test(input)) return null;

  let body: string | null = null;
  const forms = [
    /^(?:please\s+)?(?:remember|save|store|note|note down|keep in mind|don't forget)\s*(.*)$/i,
    /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:remember|save|store|note)\s*(.*)$/i,
    /^(?:you\s+)?(?:wanna|want to)\s+remember\s*(.*)$/i,
    /^i\s+want\s+you\s+to\s+remember\s*(.*)$/i
  ];
  for (const pattern of forms) {
    const match = pattern.exec(input);
    if (match) { body = match[1].trim(); break; }
  }
  if (body === null) return null;
  // "Remember that my name is..." vs "Remember that?"
  body = body.replace(/^(?:that|this|the fact that)\s+/i, "").trim();
  if (!body || /^(?:that|this|it|what i (?:just )?said)[.?!]*$/i.test(body)) {
    return fromRecentContext(preceding) ?? {
      kind: "clarify",
      description: "What should I remember? You can tell me directly or use /remember."
    };
  }

  return fromStatement(body, true) ?? {
    kind: "clarify",
    description: "What fact should I save? For example, 'Remember that I like metal.'"
  };
}
