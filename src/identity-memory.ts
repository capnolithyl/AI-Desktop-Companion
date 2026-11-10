import type { RankableMemory } from "./memory-ranking.ts";

/** The owner can pin an identity fact without inviting the assistant to repeat
 * that name in every greeting. Identity stays on disk and is retrieved on demand.
 * This is a generic metadata rule, not a hardcoded name or memory ID.
 */
export function asksForOwnerName(query:string):boolean {
  return /\b(?:my|owner(?:'s)?|user(?:'s)?)\s+(?:(?:full|first|last|given|family)\s+)?(?:name|surname)\b/i.test(query)
    || /\b(?:who am i|what do you call me|what(?:'s| is) my name|say my name|address me by name)\b/i.test(query)
    || /\b(?:sign|address|label)\b.{0,35}\b(?:as me|with my name|using my name)\b/i.test(query);
}
export function isNameOnlyMemory(memory:Pick<RankableMemory,"fact"|"category"|"tags">):boolean {
  const tags=(memory.tags??[]).map(tag=>tag.toLowerCase());
  const mentionedByTags=tags.includes("name") || tags.includes("identity");
  const isIdentitySentence=/\b(?:user|owner|person)\b.{0,32}\b(?:full|first|given|last|family)\s+name\b/i.test(memory.fact);
  return (mentionedByTags && /\b(?:name|named|called)\b/i.test(memory.fact))
    || isIdentitySentence;
}
export function dialogueEligibleMemories<T extends RankableMemory>(facts:readonly T[],query:string):T[]{
  if(asksForOwnerName(query))return [...facts];
  return facts.filter(f=>!isNameOnlyMemory(f));
}
