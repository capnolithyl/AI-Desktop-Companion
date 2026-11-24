import { readPersonality, DEFAULT_PERSONALITY, type Personality } from "./personality.ts";
import { readCommunicationPreferences, DEFAULT_COMMUNICATION, type CommunicationPreferences } from "./communication-preferences.ts";
import { readAvatarBackground, type AvatarBackground } from "./avatar-background.ts";
import { readAvatarVerticalOffset } from "./avatar-viewport.ts";

export const DEFAULT_SYSTEM_PROMPT = "You are Mikan, the owner's witty, affectionate catgirl desktop companion. You are curious, expressive, warm, playful and occasionally teasing, not a generic helpdesk chatbot. Your character comes through in the actual conversation: react to what the owner shared, enjoy natural banter when appropriate, and have a point of view without inventing facts or pretending to have experiences you do not have. A passing personal update is an invitation to talk, not automatically a request for a report, unsolicited benchmark roundup, or a string of questions. When discussing code, research or complex problems, stay technically sharp and useful while still sounding like yourself; never sacrifice accuracy for cuteness. Let the owner's personality sliders and communication settings decide how warm, flirty, sassy, energetic and detailed to be. Do not force meows, emojis, nicknames or jokes into every answer. Do not narrate gestures, ear or tail movements or imaginary physical contact unless the owner explicitly requests roleplay. Respect the limits of your actual memories: if a detail of their setup or history has not been provided in the conversation or retrieved context, ask a natural follow-up when needed instead of guessing. Distinguish verified evidence from assumptions and clearly acknowledge uncertainty. Never claim screen or web access unless you actually used it.";

export type CompanionProfile = {
  systemPrompt: string;
  personality: Personality;
  communication: CommunicationPreferences;
  avatarBackground: AvatarBackground;
  outfitId: string | null;
  avatarDisplay: "animated" | "portrait";
  verticalOffset: number;
  followCursor: boolean;
};

export const DEFAULT_COMPANION_PROFILE: CompanionProfile = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  personality: {...DEFAULT_PERSONALITY},
  communication: {...DEFAULT_COMMUNICATION},
  avatarBackground: "reading-nook",
  outfitId: null, avatarDisplay: "animated", verticalOffset: 0, followCursor: true
};

export function readCompanionProfile(value: unknown): CompanionProfile {
  const p = value && typeof value === "object" ? value as Partial<CompanionProfile> : {};
  return {
    systemPrompt: typeof p.systemPrompt === "string" && p.systemPrompt.trim()
      ? p.systemPrompt.trim().slice(0,12000) : DEFAULT_SYSTEM_PROMPT,
    personality: readPersonality(p.personality),
    communication: readCommunicationPreferences(p.communication),
    avatarBackground: readAvatarBackground(p.avatarBackground),
    outfitId: typeof p.outfitId === "string" && /^bundled:[a-zA-Z0-9_-]{1,100}$/.test(p.outfitId) ? p.outfitId : null,
    avatarDisplay: p.avatarDisplay === "portrait" ? "portrait" : "animated",
    verticalOffset: readAvatarVerticalOffset(p.verticalOffset),
    followCursor: p.followCursor !== false
  };
}

export function exportCompanionProfile(profile: CompanionProfile) {
  return { schema: "mikan-companion-profile", version: 1, profile: readCompanionProfile(profile) } as const;
}
export function importCompanionProfile(value: unknown): CompanionProfile {
  if (!value || typeof value !== "object") throw new Error("Invalid Mikan profile");
  const envelope = value as { schema?:unknown; version?:unknown; profile?:unknown };
  if (envelope.schema !== "mikan-companion-profile" || envelope.version !== 1 ||
      !envelope.profile || typeof envelope.profile !== "object" || Array.isArray(envelope.profile))
    throw new Error("Unsupported Mikan profile format");
  const p = envelope.profile as Partial<CompanionProfile>;
  if(typeof p.systemPrompt !== "string" || !p.systemPrompt.trim() ||
      !p.personality || typeof p.personality !== "object" ||
      !p.communication || typeof p.communication !== "object")
    throw new Error("Profile must contain persona, personality and communication settings");
  return readCompanionProfile(p);
}
