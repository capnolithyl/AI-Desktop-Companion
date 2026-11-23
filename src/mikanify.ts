/**
 * Presentation-only A/B experiment. Keep this decision independent from
 * parsing of the user's message and from the truth of any factual statement.
 * The first-pass researched answer remains available for human comparison.
 */
export type MikanifyEligibility={
  enabled:boolean;
  researchMode:"simple"|"strict";
  searchQuery?:string|null;
  sourceCount?:number;
  sourcesCarriedOver?:boolean;
  hasResearchAudit?:boolean;
  modelUsed?:string;
  localModel:string;
};
export function shouldMikanifyAnswer(input:MikanifyEligibility):boolean{
  return input.enabled && input.researchMode==="simple" &&
    !!input.searchQuery && (input.sourceCount??0)>0 &&
    !input.sourcesCarriedOver && !input.hasResearchAudit &&
    input.modelUsed===input.localModel;
}
export type MikanifyResult={content:string;elapsedMs:number};
export type MikanifyReview={
  originalAnswer:string;
  mikanifyApplied:boolean;
  mikanifyElapsedMs?:number;
  mikanifyError?:string;
};
