import { assistantVoiceGuidance, CHARACTER_VOICE_REMINDER } from "./assistant-voice.ts";
import { PERSONAL_DETAIL_GROUNDING_GUIDANCE } from "./personal-grounding.ts";
import { runtimeContext, chatRuntimeContext } from "./runtime-context.ts";
import { contextGuidance, ownerConversationAnchor, responseFocusGuidance } from "./conversation-engine.ts";
import type { ConversationTurn } from "./conversation-engine.ts";
import type { Settings } from "./storage.ts";

/**
 * Common, ordered response instructions for production and isolated Brain Lab.
 * Both caller paths supply their live turn state. System/voice configuration,
 * factual grounding, temporal rules, and conversational continuity are shared.
 *
 * Callers can insert legitimate environment-specific DATA, for instance real
 * or synthetic memories, screenshots or private documents, between the two
 * core sections. Environment restrictions must not introduce a second voice.
 */
export type AssistantTurnInstructionOptions={
  settings:Pick<Settings,"systemPrompt"|"communication"|"personality"|"researchMode">;
  question:string;
  history:readonly ConversationTurn[];
  allowRoleplay:boolean;
  researchActive:boolean;
  publicWebRequested:boolean;
  plannedPublicSearch:boolean;
  /** A proposed query was never actually authorized for web execution. */
  plannedButNotExecuted?:boolean;
  now?:Date;
};
export function assistantTurnInstructionParts(input:AssistantTurnInstructionOptions):{
  beforeContext:string[];
  afterContext:string[];
}{
  const {
    settings, question,history,allowRoleplay,researchActive,
    publicWebRequested,plannedPublicSearch,plannedButNotExecuted,now
  }=input;
  const date=now??new Date();
  const beforeContext=[
    assistantVoiceGuidance(settings,allowRoleplay),
    PERSONAL_DETAIL_GROUNDING_GUIDANCE,
    researchActive?runtimeContext(date):chatRuntimeContext(date)
  ];
  const afterContext=[
    ...(publicWebRequested&&(!plannedPublicSearch||settings.researchMode==="simple")
      ?[contextGuidance([...history],question,1800)]:[]),
    ...(plannedButNotExecuted?[
      "A public search was planned but NOT executed for this turn. No new source results were returned. Do not present unverified titles, credits, dates, counts, releases or named recommendations as confirmed."
    ]:[]),
    responseFocusGuidance([...history],question),
    ownerConversationAnchor(history,question),
    CHARACTER_VOICE_REMINDER
  ];
  return {beforeContext,afterContext};
}

export function joinAssistantInstructionParts(
  parts:ReturnType<typeof assistantTurnInstructionParts>,environmentContext:readonly string[]=[]
):string{
  return [...parts.beforeContext,...environmentContext,...parts.afterContext]
    .filter(Boolean).join("\n\n");
}
