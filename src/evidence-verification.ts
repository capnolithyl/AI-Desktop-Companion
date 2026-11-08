/**
 * Deterministic, shared post-generation evidence guard.
 *
 * The model may compose an expressive answer, but a source citation is not
 * evidence by itself. This filter errs on the side of saying "not verified"
 * when the retrieved snippet cannot support a concrete claim. It is not a
 * full semantic entailment model and cannot guarantee that a source is true.
 */
export type EvidenceSource = {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
};
export type EvidenceReview = {
  text: string;
  rejected: number;
  checked: number;
  usable: boolean;
};
const stop = new Set(("the a an and or but if to in on at from for into of their its it they them that this " +
  "is are was were have has had been be did do does will would can could with about who what when " +
  "there here more your my you our some any much very quite really seems looks out now after before " +
  "new recent latest since today yesterday tomorrow also just yet probably according news report says").split(/\s+/));
const normalize = (text: string) => text.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’‘]/g, "'")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const significant = (text: string): string[] =>
  [...new Set(normalize(text.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "")).split(" ")
    .filter(t => t.length > 3 && !stop.has(t) && !/^\d{1,2}$/.test(t)))];
const citations = (part: string): number[] =>
  [...part.matchAll(/\[([\d,\s]+)\]/g)].flatMap(m => m[1].split(",")
    .map(v => Number(v.trim())).filter(Number.isInteger));
const facts = /\b(?:album|ep|single|track|record|release(?:d)?|debut(?:ed)?|tour(?:ed)?|formed|lineup|member|vocalist|guitarist|bassist|drummer|announced|recorded|scheduled|founded|died|born|wrote|published|confirmed|reached|signed|produced|first|last|most recent|latest)\b/i;
const years = (text: string): string[] => [...new Set(text.match(/\b(?:18|19|20)\d{2}\b/g) ?? [])];
const quotedTitles = (text: string) => [...text.matchAll(/["“]([^"”]{4,85})["”]/g)]
  .map(x => normalize(x[1])).filter(x=>x.split(" ").length <= 12 && x.length > 3);
function contradictoryReleaseType(statement: string, evidence: string): boolean {
  // Reject a model calling an EP an album when its source identifies it
  // exclusively as an EP. Likewise, an EP claim needs EP evidence.
  const sourceEP = /\b(?:e\.?p\.?|extended play)\b/i.test(evidence);
  const sourceAlbum = /\b(?:studio album|full.length album|album)\b/i.test(evidence);
  if (/\b(?:studio|full.length)\s+album\b/i.test(statement) && sourceEP &&
      !/\b(?:studio|full.length)\s+album\b/i.test(evidence)) return true;
  if (/\balbum\b/i.test(statement) && sourceEP && !sourceAlbum) return true;
  if (/\b(?:an?\s+)?ep\b/i.test(statement) && sourceAlbum && !sourceEP) return true;
  return false;
}
function claimSupported(claim: string, sources: EvidenceSource[]): boolean {
  if (!sources.length) return false;
  const titleAnchors = quotedTitles(claim);
  const yearAnchors = years(claim);
  const tokens = significant(claim);
  return sources.some(source => {
    const evidence = normalize(source.title + "\n" + source.content);
    if (!evidence || contradictoryReleaseType(claim, source.title + "\n" + source.content)) return false;
    // The source's publication date is NOT evidence of an event's date.
    if (yearAnchors.some(year => !evidence.includes(year))) return false;
    if (titleAnchors.some(title => !evidence.includes(title))) return false;
    // Simple topical overlap is a conservative guard, not semantic proof.
    // Never let a claim pass on a date or citation number alone.
    const shared = tokens.filter(t => evidence.split(" ").includes(t));
    if (titleAnchors.length || yearAnchors.length) return shared.length >= 2;
    return shared.length >= 3;
  });
}
function segments(answer: string): string[] {
  // Attach a following citation to its sentence before evaluating it.
  return answer.replace(/\r\n/g, "\n").split(/\n+/)
    .flatMap(line => line.split(/(?<=[.!?])\s+(?=(?:[A-Z“"‘(]))/g))
    .map(s => s.trim()).filter(Boolean);
}
function factualClaim(part: string): boolean {
  return facts.test(part) || years(part).length > 0 ||
    quotedTitles(part).length > 0 || /\b(?:19|20)\d{2}\b/.test(part);
}

export function verifyResearchAnswer(
  answer: string, results: EvidenceSource[],
  fallback = "I couldn't verify those details from the retrieved sources, so I'd rather not guess. You can check the source links below."
): EvidenceReview {
  if (!results.length) return {text:answer,rejected:0,checked:0,usable:false};
  const accepted: string[] = [];
  let rejected = 0, checked = 0;
  for (const part of segments(answer)) {
    const refs = citations(part);
    if (!factualClaim(part)) {
      // Model apologies or conversational flourishes are harmless, but they
      // shouldn't become the only "verified" output.
      if (!refs.length) accepted.push(part);
      continue;
    }
    checked++;
    const valid = refs.filter(n => n >= 1 && n <= results.length)
      .map(n => results[n-1]).filter(Boolean);
    if (!valid.length || !claimSupported(part, valid)) { rejected++; continue; }
    accepted.push(part);
  }
  const usable = checked > rejected && accepted.some(factualClaim);
  if (!usable) return {text:fallback,rejected,checked,usable:false};
  let text = accepted.join("\n\n");
  if (rejected) text += "\n\nI left out some details because I couldn't verify them from the available sources.";
  return {text,rejected,checked,usable:true};
}
