/** Blend real Mem0 semantic relevance with owner-curated SQLite salience.
 * Inspired by Utsuwa's similarity+importance weighting; never manufacture facts.
 */
export type RankableMemory = {
  id: number;
  fact: string;
  updatedAt: number;
  importance?: number; // 0..100, owner-local metadata
  referenceCount?: number; // persisted, capped to prevent runaway feedback loops
};
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
  const score = (f: T): number => {
    const text = f.fact.toLowerCase();
    const lexical = terms.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
    const matched = positions.get(f.id);
    // Strong semantic match outranks incidental keyword overlap. When Mem0
    // isn't available, lexical relevance remains stronger than raw importance.
    const relevance = matched === undefined ? Math.min(1, lexical / 3) :
      Math.max(0.45, 1 - matched / 12);
    const salience = Math.max(0, Math.min(1, (f.importance ?? 50) / 100));
    const recurring = Math.min(0.08, Math.log1p(Math.max(0, f.referenceCount ?? 0)) * 0.018);
    const semantic = matched !== undefined ? 0.7 * relevance :
      lexical > 0 ? 0.5 * relevance : 0;
    return semantic + 0.25 * salience + recurring + (lexical ? Math.min(lexical * 0.055, 0.15) : 0);
  };
  return facts.slice().sort((a,b) =>
    score(b) - score(a) || b.updatedAt - a.updatedAt || b.id-a.id);
}



/**
 * Legacy auto-extracted snapshots can still exist in the user's SQLite facts.
 * Retain them on disk for historical recall, but do not present a weeks-old
 * test/bug/session toggle as the owner's CURRENT activity. Nothing is deleted.
 */
export function filterStaleActivities<T extends RankableMemory>(
  facts: T[], query: string, nowSeconds = Date.now()/1000
): T[] {
  const historical = /\b(?:last (?:week|month|year)|previously|back then|what was i|what did i|in (?:20\d\d)|remember when|used to|old (?:tasks|projects))\b/i.test(query);
  if (historical) return facts.slice();
  return facts.filter(f=>{
    if ((f.importance ?? 50)>=90) return true; // The owner chose to pin it.
    const age = nowSeconds-f.updatedAt;
    if (!Number.isFinite(age) || age<=7*24*60*60) return true;
    return !/\b(?:is|was|has|had|wants to|plans to)\s+(?:(?:currently|now|recently)\s+)?(?:test|testing|debugging|troubleshooting|checking|fixing|experimenting|trying|working on fixing|enabled|disabled|updated)\b/i.test(f.fact);
  });
}

/** Owner-pinned facts are deliberately always-on core context, not merely
 * another similarity hint. Reserve one or two slots; leave the rest for
 * relevant semantic/lexical memories.
 */
export function prioritizeCoreMemories<T extends RankableMemory>(
  facts: T[], query: string, semanticIds: number[], maxFacts: number
): T[] {
  const ranked=rankMemories(facts,query,semanticIds);
  const pinned=ranked.filter(f=>(f.importance ?? 50)>=90)
    .slice(0, maxFacts <= 3 ? 1 : 2);
  const coreIds=new Set(pinned.map(f=>f.id));
  // No similarity and no topical overlap means no personal-memory injection.
  // Unrelated stored facts were previously included just to fill the context
  // budget; their presence made Mikan assume every conversation was about the
  // owner's strongest interests. Pinned facts remain owner-controlled core.
  const significant = new Set((query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter(word=>!generic.has(word)));
  const semantic = new Set(semanticIds.slice(0,12));
  const relevant = ranked.filter(f=>{
    if(coreIds.has(f.id))return false;
    if(semantic.has(f.id))return true;
    const stored=f.fact.toLowerCase();
    return [...significant].some(word=>stored.includes(word));
  });
  return [...pinned,...relevant];
}
