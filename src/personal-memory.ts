import type { UserFact } from "./memory-client.ts";
import { deviceTimeZone } from "./runtime-context.ts";

/**
 * Personal facts must never go to a public search engine by default.
 * This recognizes self-referential questions structurally (not by topic).
 * /search remains an explicit command handled outside this classifier.
 */
export function isPersonalMemoryQuestion(question: string): boolean {
  const text = question.trim().replace(/\s+/g, " ");
  if (!/^(?:what|what's|who|where|when|why|how|which|do|did|does|am|was|were|have|has|is|are|can|could|would|will|should|tell|remind)\b/i.test(text)) return false;
  // "Find me restaurants" refers to the recipient, not the user's memories.
  const selfReference =
    /\b(?:my|mine|myself|our|ours|ourselves)\b/i.test(text) ||
    /\b(?:am|was|were|do|did|have|has|had)\s+i\b/i.test(text) ||
    /\bi\s+(?:am|was|were|have|had|do|did|work|live|like|love|prefer)\b/i.test(text) ||
    /\b(?:about|of)\s+me\b/i.test(text) ||
    /\b(?:who|how)\s+am\s+i\b/i.test(text) ||
    /\b(?:remember|know)\s+(?:me|anything about me)\b/i.test(text);
  if (!selfReference) return false;
  // Don't intercept public-news questions merely because "my favorite" was
  // used to describe the band. They still need a privacy-aware web query.
  if (/\b(?:latest|recent|upcoming|news|release|tour|album|concert|stock|weather|price)\b/i.test(text) &&
      !/\b(?:my|our)\s+(?:latest|recent|upcoming)\s+(?:work|project|job|conversation)\b/i.test(text) &&
      !/^(?:what(?:\'s| is)|which(?: is| are)?)\s+(?:my|our)\s+(?:favorite|preferences?|interests?)\b/i.test(text))
    return false;
  return true;
}

type BirthDate = { year: number; month: number; day: number };
const monthNames = ["january","february","march","april","may","june","july",
  "august","september","october","november","december"];
const birthMarker = /\b(?:birth\s*date|date of birth|birthday|born)\b/i;

function validBirthDate(year: number, month: number, day: number): BirthDate | null {
  if (year < 1850 || year > new Date().getUTCFullYear() || month < 1 || month > 12 ||
    day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) return null;
  return {year,month,day};
}

/** Parse only dates explicitly tied to birth in a stored fact, never dates
 * from a favorite event, graduation, album, or a generated chat reply.
 */
export function birthDateFromFact(fact: string): BirthDate | null {
  if (!birthMarker.test(fact)) return null;
  const iso = /\b(18\d{2}|19\d{2}|20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/.exec(fact);
  if (iso) return validBirthDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const months = monthNames.join("|");
  const nameFirst = new RegExp("\\b(" + months + ")\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s+(18\\d{2}|19\\d{2}|20\\d{2})\\b", "i").exec(fact);
  if (nameFirst) return validBirthDate(Number(nameFirst[3]), monthNames.indexOf(nameFirst[1].toLowerCase()) + 1, Number(nameFirst[2]));
  const dayFirst = new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + months + ")\\s*,?\\s+(18\\d{2}|19\\d{2}|20\\d{2})\\b", "i").exec(fact);
  if (dayFirst) return validBirthDate(Number(dayFirst[3]), monthNames.indexOf(dayFirst[2].toLowerCase()) + 1, Number(dayFirst[1]));
  return null;
}

function currentLocalParts(now: Date, timeZone: string): BirthDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year:"numeric", month:"numeric", day:"numeric"
  }).formatToParts(now);
  const part = (name: string) => Number(parts.find(v=>v.type===name)?.value);
  return {year:part("year"),month:part("month"),day:part("day")};
}
export function ageOnDate(birth: BirthDate, now: Date, timeZone: string): number | null {
  const local = currentLocalParts(now,timeZone);
  const age = local.year - birth.year -
    (local.month < birth.month || (local.month === birth.month && local.day < birth.day) ? 1 : 0);
  return age >= 0 && age <= 125 ? age : null;
}
const ageQuestion = /^(?:(?:so\s+)?how old am i|what(?:'s| is) my age|do you (?:remember|know) how old i am|how many years old am i)[?!.\s]*$/i;

function birthDateFromFacts(facts: UserFact[]): BirthDate | null {
  // Edited/recently confirmed user facts take precedence over older ones.
  for (const fact of [...facts].sort((a,b)=>b.updatedAt-a.updatedAt || b.id-a.id)) {
    const birth = birthDateFromFact(fact.fact);
    if (birth) return birth;
  }
  return null;
}

/** Trusted deterministic answer for arithmetic on a verified local birthday.
 * Never let Nano guess and never send a birth date to Tavily.
 * Other personal questions continue through memory-grounded local Nano.
 */
export function answerFromPersonalMemory(
  question: string, facts: UserFact[], now: Date = new Date(),
  timeZone: string = deviceTimeZone()
): string | null {
  if (!ageQuestion.test(question.trim())) return null;
  const birth = birthDateFromFacts(facts);
  if (!birth) return "I don't have your full date of birth saved yet, so I can't calculate your age reliably.";
  const age = ageOnDate(birth,now,timeZone);
  if (age === null) return "I have a birth date saved, but it doesn't make sense with today's date. Could you check it in Memory?";
  return "You're " + age + " years old.";
}

/** Applied ONLY to self-knowledge questions, not external factual research. */
export function personalMemoryGuidance(question: string): string {
  if (!isPersonalMemoryQuestion(question)) return "";
  return [
    "PERSONAL MEMORY QUESTION: Prefer the USER'S saved SQLite facts supplied above.",
    "Use the local device date for any time-sensitive calculation.",
    "Do not browse or cite public web sources to answer a question about this user's own life.",
    "If the relevant personal detail is missing, explicitly say you do not know it yet.",
    "Never invent a personal fact, confuse Mikan's character canon with user memory, or pretend to remember something that isn't saved.",
    "When a saved fact answers the question, answer directly rather than saying you cannot access memories."
  ].join(" ");
}
