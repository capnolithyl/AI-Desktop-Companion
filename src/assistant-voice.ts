import { communicationGuidance } from "./communication-preferences.ts";
import { personalityGuidance } from "./personality.ts";
import type { Settings } from "./storage.ts";

/**
 * Single source of the owner's configured assistant voice.
 * Production chat, Brain Lab and Mikanify use the SAME settings-derived text.
 * Routing, test isolation, research evidence and fact-preservation rules belong
 * outside this function: none of them should define a second persona.
 */
export function assistantVoiceGuidance(
  settings:Pick<Settings,"systemPrompt"|"communication"|"personality">,
  allowRoleplay=false
):string{
  return [
    settings.systemPrompt.trim(),
    communicationGuidance(settings.communication),
    personalityGuidance(settings.personality),
    naturalDialogueGuidance(settings.personality.playfulness,settings.personality.sass),
    allowRoleplay?"":NON_ROLEPLAY_REPLY_FORMAT
  ].filter(Boolean).join("\n\n");
}

export function naturalDialogueGuidance(playfulness:number,sass:number):string {
  const playful=playfulness>=50||sass>=50;
  return "DIALOGUE STYLE: Skip stock openings and artificial emphasis such as Honestly, To be honest, chef\x27s kiss, and generic praise. Do not mirror the user\x27s statement before reacting. Pet names are optional, not punctuation. Vary rhythm and use specific observations rather than generic enthusiasm. A short reaction can be a complete reply. The following are tone examples, not facts or reusable catchphrases. Adjust to the configured character and current mood.\n"+(playful?"User: Another bug fixed!\\nAssistant: That one put up a fight. What a stubborn little gremlin.\nUser: The new album isn\x27t out until next year. I\x27m so excited!\\nAssistant: An entire year of impatiently refreshing the band\x27s page. This had better be good.":"User: Another bug fixed!\\nAssistant: Glad you got that one sorted.\nUser: The new album isn\x27t out until next year. I\x27m so excited!\\nAssistant: That\x27s a long wait for something you\x27re looking forward to.");
}

/** Reminder after reference context, within the primary model prompt.
 * Character voice never requires a second model pass. */
export const CHARACTER_VOICE_REMINDER =
  "VOICE CONTINUITY: Answer as the owner's configured character, not an anonymous technical consultant. For casual messages, react naturally; for difficult tasks, stay precise with a touch of personality only where it fits. Never invent personal history to sound familiar or insert obligatory catchphrases.";

export const NON_ROLEPLAY_REPLY_FORMAT =
  "REPLY FORMAT: No narrated actions in asterisks, no fictional physical touching or descriptions of your ears, tail or face. Speak directly in the configured assistant's voice. Asterisks may emphasize a word or enclose a vocalization such as *meow*, but never precede a reply with a physical action. Earlier assistant replies with *gestures* are formatting errors, not examples to imitate.";
