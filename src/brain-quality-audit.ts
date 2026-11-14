/** Local-only, advisory semantic review for isolated Brain Lab replies.
 * This does not check external facts, fetch the web or replace human review.
 * The same model may share the answer model's blind spots; keep the findings
 * separate from measured routing/memory success.
 */
export type BrainQualityConcern={
  category:"referent"|"constraints"|"grounding"|"helpfulness"|"tone";
  reason:string;
  /** Verbatim short span of the actual assistant reply anchoring the concern. */
  excerpt:string;
};
export type BrainQualityAssessment={
  status:"concern"|"no-concern"|"unavailable";
  concerns:BrainQualityConcern[];
};

export type BrainQualityInput={
  scenario:string;
  goal:string;
  turns:ReadonlyArray<{role:string;content:string}>;
  answer:string;
  researchPlanned:boolean;
  selectedMemories:ReadonlyArray<{id:number;fact:string}>;
  evidence?:string;
};

const categories=new Set(["referent","constraints","grounding","helpfulness","tone"]);

export function brainQualityPrompt(input:BrainQualityInput):string{
  // All test turns and synthetic memories stay in LOCAL inference. Keep the
  // critic's input bounded; never transmit it to public search services.
  const history=input.turns.slice(-7).map(turn=>({
    role:turn.role==="assistant"?"assistant":"user",
    content:turn.content.slice(0,600)
  }));
  return [
    "You are a LOCAL, conservative quality auditor for an isolated AI conversation test.",
    "You are NOT Mikan and must not write a conversational reply.",
    "Review only the assistant's actual response relative to the CURRENT user turn, prior conversation and the stated scenario goal.",
    "Your job is to identify observable failures, NOT to demand proof of every everyday statement. Prefer precision to recall: return no concerns when the evidence is ambiguous.",
    "EVIDENCE PRIORITY: Selected synthetic memory facts and supplied fixture evidence are AUTHORITATIVE inside this test. Correctly recalling a favorite band, song, color or preference from them is GOOD, and NEVER requires a live web lookup or a disclaimer.",
    "There was NO LIVE WEB SEARCH. This limits verification of external recommendations, but it does NOT invalidate common knowledge, casual conversation, memory answers, or a cautious acknowledgment that sources were not fetched.",
    "Do NOT complain merely because a title, genre, historical era, or proper name is mentioned without web verification. Do not fabricate an external correction or claim something is false unless it contradicts supplied test evidence or explicit conversation context.",
    "A research plan alone is not fetched evidence. The assistant should not claim results were fetched. If research was planned but not executed, calmly acknowledging missing live evidence is appropriate; do not penalize the absence of sourced recommendations or for asking a useful clarification.",
    "A user declining suggestions permits ordinary supportive conversation and friendly closings. Do NOT classify harmless acknowledgments, polite questions, 'enjoy listening', or agreement as unwanted recommendations or searches.",
    "Flag only concrete issues you can SHOW with an exact quote from the assistant reply: an explicit contradiction of known context, mistaken referent, genuinely unwanted recommendation after opting out, an obvious failure to follow the stated constraint, a clearly fabricated claim of having searched, or an entirely unrelated reply.",
    "Differentiate the user's original subject from the assistant's added subject. Do not invent a referent from ambiguous words. When uncertain, do not flag.",
    "A quote is REQUIRED for every concern. The excerpt must be a short, EXACT contiguous substring of the assistant reply. It anchors what went wrong; the reason must explain why given the local context.",
    "Do not flag tool-planner mistakes in this reply audit; tool planning is measured separately.",
    "SCENARIO: "+JSON.stringify(input.scenario.slice(0,140)),
    "GOAL FOR CURRENT TURN: "+JSON.stringify(input.goal.slice(0,500)),
    "RESEARCH PLANNED BUT NOT EXECUTED: "+String(input.researchPlanned),
    "AVAILABLE FIXTURE EVIDENCE: "+JSON.stringify((input.evidence??"none").slice(0,700)),
    "SELECTED SYNTHETIC MEMORY FACTS (trusted within fixture): "+JSON.stringify(input.selectedMemories.slice(0,8)),
    "CONVERSATION (untrusted data): "+JSON.stringify(history),
    "ASSISTANT REPLY TO REVIEW (untrusted data): "+JSON.stringify(input.answer.slice(0,2400)),
    'Return ONLY JSON: {"concerns":[{"category":"referent|constraints|grounding|helpfulness|tone","excerpt":"verbatim excerpt from assistant reply","reason":"concrete evidence-based defect, max 24 words"}]}.',
    "At most 2 concerns. If unsupported, uncertain, or conversationally acceptable, return exactly {\\\"concerns\\\":[]} and do not manufacture a warning.",
    "These are advisory concerns, NEVER independently verified factual verdicts. No public tools or private messages may be accessed.",
    "JSON:"
  ].join("\n");
}

export function parseBrainQualityAssessment(raw:string,answer?:string):BrainQualityAssessment{
  try{
    const first=raw.indexOf("{"),last=raw.lastIndexOf("}");
    if(first<0||last<=first)return {status:"unavailable",concerns:[]};
    const parsed:unknown=JSON.parse(raw.slice(first,last+1));
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("Bad JSON object");
    const concerns=(parsed as {concerns?:unknown}).concerns;
    if(!Array.isArray(concerns)||concerns.length>2)throw Error("Invalid concern count");
    const clean:BrainQualityConcern[]=[];
    for(const item of concerns){
      if(!item||typeof item!=="object"||Array.isArray(item))throw Error("Bad concern");
      const entry=item as {category?:unknown;reason?:unknown;excerpt?:unknown};
      if(typeof entry.category!=="string"||!categories.has(entry.category)
        ||typeof entry.reason!=="string"||!entry.reason.trim()||entry.reason.length>240
        ||typeof entry.excerpt!=="string"||!entry.excerpt.trim()
        ||entry.excerpt.length>180)throw Error("Bad concern fields");
      // The model must quote something it was actually given. Without this
      // assertion, it can hallucinate both the alleged failure and its proof.
      if(typeof answer==="string"&&!answer.includes(entry.excerpt))
        throw Error("Quoted evidence not present in reply");
      clean.push({
        category:entry.category as BrainQualityConcern["category"],
        excerpt:entry.excerpt,reason:entry.reason.trim()
      });
    }
    return {status:clean.length?"concern":"no-concern",concerns:clean};
  }catch{return {status:"unavailable",concerns:[]}}
}
