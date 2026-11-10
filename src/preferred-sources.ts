/** Owner-editable search priorities: boosts, never a website allowlist. */
export type SourcePreference = {
  topic: string;
  cues: string[];
  domains: string[];
};

export const DEFAULT_SOURCE_PREFERENCES: SourcePreference[] = [
  {topic:"music",cues:["music","metal","band","album","song","artist","track","record","concert","guitar"],
    domains:["metal-archives.com","bandcamp.com","loudwire.com","metalstorm.net"]},
  {topic:"coding",cues:["code","programming","developer","react","wordpress","tailwind","javascript","typescript","css","php","tauri","browser"],
    domains:["developer.mozilla.org","react.dev","tailwindcss.com","developer.wordpress.org","w3.org","v2.tauri.app"]},
  {topic:"gaming",cues:["game","gaming","rpg","nintendo","switch","steam","xbox","playstation"],
    domains:["nintendo.com","store.steampowered.com","pcgamingwiki.com","rpgsite.net"]},
  {topic:"science",cues:["science","space","astronomy","nasa","research","biology","study"],
    domains:["nasa.gov","science.nasa.gov","nih.gov","nature.com"]},
  {topic:"history",cues:["history","historical","viking","medieval","archaeology","museum"],
    domains:["britannica.com","si.edu","metmuseum.org"]},
];

function domain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d=value.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"");
  if (d.length > 100 || d.includes("/") || d.includes(":") || d.includes("@") ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) return null;
  return d.replace(/^www\./,"");
}
function tokens(value:unknown):string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v):v is string=>typeof v==="string")
    .map(v=>v.trim().toLowerCase()).filter(v=>v.length>=2&&v.length<=32&&/^[a-z0-9 -]+$/.test(v)))].slice(0,16);
}
export function readSourcePreferences(value: unknown): SourcePreference[] {
  if (!Array.isArray(value)) return DEFAULT_SOURCE_PREFERENCES.map(p=>({...p,cues:[...p.cues],domains:[...p.domains]}));
  return value.slice(0,20).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const v=raw as Partial<SourcePreference>;
    const topic=typeof v.topic==="string" ? v.topic.trim().toLowerCase() : "";
    if (!/^[a-z][a-z0-9 -]{1,35}$/.test(topic)) return [];
    return [{topic,cues:tokens(v.cues),domains:[...new Set((Array.isArray(v.domains)?v.domains:[]).map(domain).filter((x):x is string=>!!x))].slice(0,12)}];
  }).filter(entry=>entry.domains.length>0);
}

/** Source topics are hints only; an unmatched topic must not restrict search. */
export function matchingSourceTopic(query:string, entries:readonly SourcePreference[]):string|undefined {
  const words=new Set((query.toLowerCase().match(/[a-z0-9]+/g)??[]));
  let best:{topic:string;hits:number}|null=null;
  for (const entry of entries) {
    const hits=entry.cues.reduce((n,cue)=>n+(cue.includes(" ")
      ? Number(query.toLowerCase().includes(cue)) : Number(words.has(cue))),0);
    if (hits>(best?.hits??0))best={topic:entry.topic,hits};
  }
  return best?.topic;
}
