/** Pure memory ordering shared by desktop and Pocket callers.
 * Semantic ranking supplements, rather than replaces, user-curated SQLite.
 */
export type RankableMemory = { id: number; fact: string; updatedAt: number };
const generic = new Set([
  "what","when","where","which","that","this","have","with","about",
  "remember","could","would","please","some","there","need","want",
  "help","hey","can","you","me","my","the","for","and","how"
]);
export function rankMemories<T extends RankableMemory>(
  facts: T[], query: string, semanticIds: number[] = []
): T[] {
  const terms = (query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter(word => !generic.has(word));
  const positions = new Map(semanticIds.slice(0, 12).map((id,i) => [id,i]));
  return facts.slice().sort((a,b) => {
    const score = (f: T) => {
      const text = f.fact.toLowerCase();
      const lexical = terms.reduce((sum, word) => sum + (text.includes(word) ? 2 : 0), 0);
      const position = positions.get(f.id);
      // A semantic match is more informative than an unrelated newest fact.
      // SQLite fact text remains the only value shown in the prompt.
      return lexical + (position === undefined ? 0 : 30 - position);
    };
    return score(b) - score(a) || b.updatedAt - a.updatedAt;
  });
}
