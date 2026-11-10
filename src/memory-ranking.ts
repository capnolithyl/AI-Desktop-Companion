/** Blend real Mem0 semantic relevance with owner-curated SQLite salience.
 * Inspired by Utsuwa's similarity+importance weighting; never manufacture facts.
 */
export type RankableMemory = {
  id: number;
  fact: string;
  category?: string;
  tags?: string[];
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
    const topic = terms.reduce((sum, word) => sum +
      ((f.tags ?? []).some(tag=>tag.toLowerCase().includes(word)) ? 1 : 0), 0);
    const category = terms.some(word=>f.category?.toLowerCase()===word) ? 1 : 0;
    const topical = Math.min(0.23,topic*0.115+category*0.075);
    const matched = positions.get(f.id);
    // Strong semantic match outranks incidental keyword overlap. When Mem0
    // isn't available, lexical relevance remains stronger than raw importance.
    const relevance = matched === undefined ? Math.min(1, lexical / 3) :
      Math.max(0.45, 1 - matched / 12);
    const salience = Math.max(0, Math.min(1, (f.importance ?? 50) / 100));
    const recurring = Math.min(0.08, Math.log1p(Math.max(0, f.referenceCount ?? 0)) * 0.018);
    const semantic = matched !== undefined ? 0.7 * relevance :
      lexical > 0 ? 0.5 * relevance : 0;
    return semantic + topical + 0.25 * salience + recurring + (lexical ? Math.min(lexical * 0.055, 0.15) : 0);
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


export type SemanticRecallMatch = {id:number;score:number|null};

/** Mem0's top K are nearest neighbors, not necessarily good neighbors.
 * Require a meaningful cosine similarity, and avoid forcing unrelated owner
 * facts into greetings. Unknown/unscored matches fall back to lexical recall.
 * The threshold is intentionally conservative until live embedding benchmarks.
 */
export function strongSemanticIds(matches: SemanticRecallMatch[], query: string): number[] {
  const clean=query.trim().toLowerCase().replace(/[!?.]+$/,"").trim();
  if (/^(?:hi|hello|hey|hey there|good morning|good afternoon|good evening|good night|thanks|thank you|cool|nice|okay|ok|lol|how are you|how's it going)$/.test(clean)) return [];
  const scored=matches.filter(m=>Number.isSafeInteger(m.id) && m.id>0 &&
    typeof m.score==="number" && Number.isFinite(m.score) && m.score>=0 && m.score<=1);
  if (!scored.length) return [];
  const best=Math.max(...scored.map(m=>m.score as number));
  const threshold=Math.max(0.62,best-0.12);
  return [...new Set(scored.filter(m=>(m.score as number)>=threshold)
    .sort((a,b)=>(b.score as number)-(a.score as number)).slice(0,6).map(m=>m.id))];
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
    return [...significant].some(word=>stored.includes(word) ||
      f.category?.toLowerCase()===word || (f.tags??[]).some(tag=>tag.toLowerCase().includes(word)));
  });
  return [...pinned,...relevant];
}
