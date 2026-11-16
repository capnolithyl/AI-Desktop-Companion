/**
 * Deterministic, shared post-generation evidence guard.
 *
 * The model may compose an expressive answer, but a source citation is not
 * evidence by itself. This filter errs on the side of saying "not verified"
 * when the retrieved snippet cannot support a concrete claim. It is not a
 * full semantic entailment model and cannot guarantee that a source is true.
 */
import type { ResearchAudit } from "./debug-log.ts";

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
    if (!factualClaim(part) && !refs.length) {
      // Conversational language is not itself a researched claim.
      accepted.push(part);
      continue;
    }
    // A cited definition is also a claim. The previous keyword-only test
    // silently dropped ordinary explanations ("X is an AI assistant") even
    // when a valid numbered source was present.
    checked++;
    const valid = refs.filter(n => n >= 1 && n <= results.length)
      .map(n => results[n-1]).filter(Boolean);
    if (!valid.length || !claimSupported(part, valid)) { rejected++; continue; }
    accepted.push(part);
  }
  // A sourced general definition is verified too, even when it does not
  // contain one of the historical release-date/album keywords.
  const usable = checked > rejected && accepted.some(part=>factualClaim(part) || citations(part).length>0);
  if (!usable) return {text:fallback,rejected,checked,usable:false};
  let text = accepted.join("\n\n");
  // Removing unsafe claims is enough: avoid appending a robotic disclaimer
  // that derails an otherwise warm, accurate companion response.
  return {text,rejected,checked,usable:true};
}

/**
 * A generated recommendation cannot enlarge the approved Rust shortlist.
 * Quotes retain their source attribution: a reviewer's first-person story
 * must never be presented as a memory about the owner.
 * Passing this gate proves excerpt provenance, not full semantic entailment.
 */
function reviewedRecommendation(
  sources:readonly EvidenceSource[], audit:ResearchAudit
):EvidenceReview {
  const same=(s:string)=>s.toLowerCase().replace(/\s+/g," ").trim();
  const clean=(s:string)=>s.replace(/[\r\n\t]+/g," ").replace(/[\\*_`\[\]<>]/g,"").trim();
  const seen=new Set<string>();
  const approved=(audit.recommendationDetails??[]).filter(item=>{
    const source=sources[item.source-1];
    const identity=same(item.title);
    const quote=same(item.fitQuote);
    if(!source || !identity || !quote || seen.has(identity) ||
       !same(source.content).includes(quote) || !quote.includes(identity))return false;
    seen.add(identity);
    return true;
  });
  if(!approved.length)return {
    text:"I searched, but I couldn't verify a recommendation that meets the request. I don't want to invent options.",
    rejected:1,checked:0,usable:false
  };
  const unresolved=approved.some(item=>item.missingDetails?.length) ||
    !!audit.unresolvedDetails?.length || !!audit.ignoredRequirements?.length;
  const lines=approved.map(item=>{
    const excerpt=clean(item.fitQuote).slice(0,250);
    return "- **"+clean(item.title)+"** ["+item.source+"]: Source excerpt: “"+excerpt+
      (clean(item.fitQuote).length>250?"…":"")+"”";
  });
  const intro=unresolved
    ?"I found these source-backed leads, but I haven't verified that they satisfy every requested requirement:"
    :"Here are the recommendations I could support with the retrieved sources:";
  return {text:intro+"\n\n"+lines.join("\n"),
    rejected:0,checked:approved.length,usable:true};
}

/**
 * Render a bounded partial answer from SOURCE QUOTES, not the generator's
 * proposed paraphrases. Source URLs identify provenance, but neither their
 * domains nor matching quotations establish the official/latest answer.
 */
function partialResearchSummary(
  sources:readonly EvidenceSource[],
  audit:ResearchAudit
):EvidenceReview|null {
  const normalized=(s:string)=>s.toLowerCase().replace(/\s+/g," ").trim();
  const escaped=(s:string,max:number)=>[...s.replace(/\s+/g," ").trim()].slice(0,max)
    .join("").replace(/[\\\`*_\[\]<>]/g,"\\$&");
  const groups=new Map<string,{name:string;quotes:{source:number;quote:string}[]}>();
  const seen=new Set<string>();
  let checked=0;
  for(const item of audit.acceptedDetails??[]){
    const source=sources[item.source-1];
    if(!source||!item.quote.trim()||!item.subject.trim())continue;
    if(!normalized(source.content).includes(normalized(item.quote)) &&
        !normalized(source.title).includes(normalized(item.quote)))continue;
    const subject=normalized(item.subject);
    const key=subject+"|"+item.source+"|"+normalized(item.quote);
    if(seen.has(key))continue;
    seen.add(key);
    checked++;
    if(!groups.has(subject) && groups.size>=4)continue;
    if(!groups.has(subject))groups.set(subject,{name:item.subject,quotes:[]});
    const group=groups.get(subject)!;
    if(group.quotes.length<2)group.quotes.push({source:item.source,quote:item.quote});
  }
  if(!groups.size)return null;
  const summaries=[...groups.values()];
  const labels=summaries.map(g=>"**"+escaped(g.name,100)+"**");
  const subjects=labels.length===1?labels[0]:
    labels.slice(0,-1).join(", ")+" and "+labels[labels.length-1];
  const lines=summaries.flatMap(g=>g.quotes.map(({source:index,quote})=>{
    const result=sources[index-1];
    let origin="";
    try{
      const uri=new URL(result.url);
      if(["https:","http:"].includes(uri.protocol) && !uri.username && !uri.password)
        origin=" (["+escaped(uri.hostname,100)+"]("+uri.href+"))";
    }catch{ /* Source URLs are untrusted; omit malformed destinations. */ }
    const excerpt=escaped(quote,330);
    const shortened=[...quote.replace(/\s+/g," ").trim()].length>330?"…":"";
    return "- **"+escaped(g.name,100)+"** ["+index+"]"+origin+": “"+excerpt+shortened+"”";
  }));
  // An extracted date is a reported value, not confirmation of the
  // official release status or an exhaustive "latest" comparison.
  const remaining=(audit.unresolvedDetails??[]).map(s=>escaped(s,140)).filter(Boolean).slice(0,4);
  const caveat=remaining.length
    ?"**Not independently established:** "+remaining.join("; ")+". These excerpts alone do not establish the definitive answer."
    :"**Not independently established:** whether these source reports fully answer the question.";
  return {
    text:"I found source reports mentioning "+subjects+
      ", but I can't confirm a definitive answer from the retrieved excerpts alone.\n\n"+
      lines.join("\n")+"\n\n"+caveat,
    checked,rejected:0,usable:true
  };
}

/** Shared desktop/evaluation postprocessing. A rejected draft must not erase
 * useful facts that the native extraction already anchored to exact sources. */
export function reviewResearchCompletion(answer:string,sources:EvidenceSource[],audit?:ResearchAudit|null):EvidenceReview|null {
  if(!sources.length)return null;
  if(audit?.recommendationTask)return reviewedRecommendation(sources,audit);
  if(audit && !["used","partial"].includes(audit.status))return null;
  const facts=audit?.acceptedDetails??[];
  const grounded=facts.length ? sources.map((source,i)=>({...source,title:"",
    content:facts.filter(f=>f.source===i+1).map(f=>f.quote).join("\n")})) : sources;
  // A partially answered task is not a license to turn one dated source
  // into a definitive "latest", "first", "best" or exact-status conclusion.
  // Use only the original quoted excerpts, not a model-inferred ranking.
  if(audit?.status==="partial" && facts.length){
    const partial=partialResearchSummary(sources,audit);
    if(partial)return partial;
  }
  const review=verifyResearchAnswer(answer,grounded);
  if(review.usable || !facts.length)return review;
  const recover=facts.filter(f=>{
    const source=sources[f.source-1];
    const exact=(s:string)=>s.toLowerCase().replace(/\s+/g," ").trim();
    return source && !!f.quote.trim() &&
      (exact(source.title).includes(exact(f.quote)) || exact(source.content).includes(exact(f.quote)));
  }).map(f=>`Source [${f.source}] states: “${f.quote}”`);
  if(!recover.length)return review;
  return {...review,usable:true,text:[...new Set(recover),
    ...(audit?.unresolvedDetails?.length ? ["Still unconfirmed: "+audit.unresolvedDetails.join("; ")+"."] : [])].join("\n\n")};
}


/** A final-answer citation verifier can be stricter than the source data.
 * When it rejects all generated claims, still give the owner a USEFUL,
 * directly attributed source rather than claiming "nothing was found".
 * This recovers SOURCE HEADLINES ONLY, never unverifiable model prose.
 * It is a fallback, not evidence that the whole article was read.
 */
export function groundedResearchFallback(
  question: string, sources: readonly EvidenceSource[]
): string {
  const requested=significant(question);
  // Contiguous title words distinguish similarly named entities, e.g.
  // "The War Within" from the unrelated "War Within". A shared generic
  // word like "album" alone must never decide the chosen source.
  const questionWords=normalize(question).split(" ").filter(Boolean);
  const phraseMatch=(title:string):number=>{
    const full=" "+normalize(title)+" ";
    let longest=0;
    for(let length=2;length<=5;length++) {
      for(let i=0;i+length<=questionWords.length;i++) {
        const slice=questionWords.slice(i,i+length);
        if(slice.every(word=>stop.has(word)))continue;
        if(full.includes(" "+slice.join(" ")+" "))longest=Math.max(longest,length);
      }
    }
    return longest;
  };
  const headlines=sources.map((source,i)=>{
    const title=source.title.replace(/[\r\n\t*<>\\[\\]`]/g," ").replace(/\s+/g," ").trim().slice(0,165);
    const titleWords=new Set(significant(title));
    const textWords=new Set(significant(source.content.slice(0,650)));
    const titleHits=requested.filter(w=>titleWords.has(w)).length;
    const contentHits=requested.filter(w=>textWords.has(w)).length;
    return {index:i+1,title,score:titleHits*5+Math.min(contentHits,3)+phraseMatch(title)*4,
      titleHits,valid:/^https?:\/\//.test(source.url) && title.length>=10};
  }).filter(item=>item.valid && item.titleHits>0)
    .sort((a,b)=>b.score-a.score||a.index-b.index);
  const best=headlines[0];
  if(!best)return "I searched, but I couldn't establish the specific claim from the retrieved excerpts. I don't want to invent details.";
  const enthusiastic=/\b(?:really good|love|awesome|excited|fantastic|finally|amazing|hyped|stoked|brilliant|so good)\b/i.test(question);
  const intro=enthusiastic?"Nice, you're clearly excited about this!":"I did find reporting about it:";
  const end=enthusiastic
    ?"I haven't heard it myself, but I'm curious what you liked most."
    :"That headline is directly supported by the source; I don't want to guess about details beyond it.";
  return intro+" **"+best.title+"** ["+best.index+"]. "+end;
}
