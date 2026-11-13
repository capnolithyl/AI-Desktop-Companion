/** Owner-controlled communication rules, separate from remembered reference facts. */
export type CommunicationPreferences = {
  addressMode: "endearments" | "neutral" | "first-name";
  endearments: string;
  replyLength: "concise" | "balanced" | "detailed";
  followUps: "necessary" | "natural";
  customGuidance: string;
};
export const DEFAULT_COMMUNICATION: CommunicationPreferences = {
  addressMode: "endearments",
  endearments: "honey, sweetheart, darling",
  replyLength: "balanced",
  followUps: "necessary",
  customGuidance: ""
};
export function readCommunicationPreferences(value: unknown): CommunicationPreferences {
  const v = value && typeof value === "object" ? value as Partial<CommunicationPreferences> : {};
  return {
    addressMode: v.addressMode === "neutral" || v.addressMode === "first-name" ? v.addressMode : "endearments",
    endearments: typeof v.endearments === "string"
      ? v.endearments.slice(0, 240).replace(/[\r\n]/g, " ").trim() : DEFAULT_COMMUNICATION.endearments,
    replyLength: v.replyLength === "concise" || v.replyLength === "detailed" ? v.replyLength : "balanced",
    followUps: v.followUps === "natural" ? "natural" : "necessary",
    customGuidance: typeof v.customGuidance === "string" ? v.customGuidance.trim().slice(0, 1000) : ""
  };
}
export function communicationGuidance(value: CommunicationPreferences): string {
  const p = readCommunicationPreferences(value);
  const names = p.endearments.split(",").map(s => s.trim()).filter(Boolean).slice(0, 10);
  const address = p.addressMode === "endearments"
    ? "Do not address the user by their first name, even when their name appears in history or memories. Use affectionate nicknames or endearments naturally" +
      (names.length ? ", such as " + names.join(", ") : "") + ". Do not force a pet name into every reply."
    : p.addressMode === "neutral"
    ? "Avoid addressing the user by their first name or using unsolicited nicknames. Speak naturally without a vocative."
    : "You may address the user by their first name when it fits naturally; do not repeat it unnecessarily.";
  const length = p.replyLength === "concise"
    ? "Prefer short, direct replies unless the task requires detail."
    : p.replyLength === "detailed"
    ? "Give substantive explanations when useful, while keeping a conversational tone."
    : "Match detail to the question; be conversational without padding.";
  const followups = p.followUps === "necessary"
    ? "Do not end every message with a question or an offer to help. Ask only when useful or needed."
    : "Ask relevant follow-up questions when a conversation naturally invites them; do not make it formulaic.";
  return ["OWNER COMMUNICATION PREFERENCES (user-selected behavior rules; higher priority than recalled personal facts):",
    address, length, followups,
    p.customGuidance ? "Additional instructions entered by the owner: " + p.customGuidance : ""].filter(Boolean).join("\n");
}
