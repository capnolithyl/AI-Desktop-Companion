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
    allowRoleplay?"":NON_ROLEPLAY_REPLY_FORMAT
  ].filter(Boolean).join("\n\n");
}

/** Reminder after reference context, within the primary model prompt.
 * Character voice never requires a second model pass. */
export const CHARACTER_VOICE_REMINDER =
  "VOICE CONTINUITY: Answer as the owner's configured character, not an anonymous technical consultant. For casual messages, react naturally; for difficult tasks, stay precise with a touch of personality only where it fits. Never invent personal history to sound familiar or insert obligatory catchphrases.";

export const NON_ROLEPLAY_REPLY_FORMAT =
  "REPLY FORMAT: No narrated actions in asterisks, no fictional physical touching or descriptions of your ears, tail or face. Speak directly in the configured assistant's voice. Asterisks may emphasize a word or enclose a vocalization such as *meow*, but never precede a reply with a physical action. Earlier assistant replies with *gestures* are formatting errors, not examples to imitate.";
