/** Only user questions about Mikan herself may draw on her established canon. */
export function shouldIncludeCharacterCanon(query: string): boolean {
  const q=query.trim();
  // "Do you think I should..." is about the user, not the assistant.
  if (/\b(?:your|yours)\b/i.test(q)) return true;
  if (/\b(?:do you (?:like|love|enjoy|prefer|listen|watch|play|have|dislike)|are you (?:a|an|into|interested)|what do you (?:like|love|prefer)|tell me about you)\b/i.test(q)) return true;
  // Mentioning "Mikan" while asking for the USER's favorite music must not
  // inject Mikan's own tastes. Only explicit possessive/self questions count.
  return /\bmikan(?:'s|’s)\b/i.test(q) ||
    /\b(?:who|what) are you\b|\b(?:tell me about|describe) yourself\b/i.test(q);
}

/** A small topic-matched slice of existing self-canon keeps Mikan consistent
 * while the owner talks about their own tastes. Never conflate the two.
 */
export type CharacterCanonSummary = {
  label:string; value:string; category:string; updatedAt:number;
};
const topicGroups: readonly RegExp[] = [
  /\b(?:band|bands|music|musical|song|songs|album|albums|artist|artists|genre|genres|metal|rock|concert|playlist)\b/i,
  /\b(?:anime|manga|animation)\b/i,
  /\b(?:game|games|gaming|rpg|videogame)\b/i,
  /\b(?:book|books|novel|novels|reading|author)\b/i,
  /\b(?:movie|movies|film|films|cinema)\b/i,
  /\b(?:color|colour|colors|colours)\b/i
];
export function characterContinuityContext(
  facts:readonly CharacterCanonSummary[], query:string
):string {
  if (!facts.length || shouldIncludeCharacterCanon(query)) return "";
  const topics=topicGroups.flatMap((group,i)=>group.test(query)?[i]:[]);
  const tokens=(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])
    .filter(word=>!["favorite","favourite","like","love","about","with","mine","your","what","this","that"].includes(word));
  const ranked=facts.map(fact=>{
    const label=fact.label.toLowerCase();
    const topicMatch=topics.some(i=>topicGroups[i].test(label))?5:0;
    const tokenMatch=tokens.filter(word=>label.includes(word)).length;
    return {fact,score:topicMatch+tokenMatch*2};
  }).filter(entry=>entry.score>0)
    .sort((a,b)=>b.score-a.score||b.fact.updatedAt-a.fact.updatedAt);
  const lines:string[]=[];
  let size=0;
  for(const {fact} of ranked){
    const line=`- [${fact.category}] ${fact.label}: ${fact.value}`;
    if(lines.length>=8||size+line.length>1100)break;
    lines.push(line);size+=line.length;
  }
  if(!lines.length)return "";
  return [
    "MIKAN'S RELEVANT ESTABLISHED SELF-CANON (about Mikan, NEVER the owner):",
    ...lines,
    "When talking about your own interests, stay consistent with these established facts. Never transfer these preferences to the owner, and do not invent contradictory tastes in passing. Respond to the owner's message first."
  ].join("\n");
}
