/**
 * Tiny, deterministic avatar cues from Mikan's own opening words.
 * No extra AI request, no sentiment analysis of private user messages.
 * Ambiguous or matter-of-fact replies stay neutral.
 */
export type AvatarReactionKind =
  | "smile" | "laugh" | "surprised" | "sad" | "angry" | "nod" | "shake";

export type AvatarReaction = {
  serial: number;
  kind: AvatarReactionKind;
  source?: "reply" | "test";
};

export function reactionFromReply(reply: string): AvatarReactionKind | null {
  const lead = reply.replace(/^[\s*_>"'`#]+/, "").trim().slice(0, 180);
  if (!lead || /^(?:Error:|\[Interrupted:|\[Stopped\])/i.test(lead)) return null;

  if (/^(?:ha(?:ha)+|he(?:he)+|lol\b|lmao\b|rofl\b|pfft\b)/i.test(lead)
    || /[😂🤣]{2,}/u.test(lead)) return "laugh";
  if (/^(?:wow\b|no way\b|wait[,!]?\s+what\b|what(?:\?|!| the\b)|oh my\b|holy\b|seriously[?!])/i.test(lead)) return "surprised";
  if (/^(?:i(?:'m| am) sorry\b|that(?:'s| is) (?:rough|awful|heartbreaking|sad)\b|that sounds (?:hard|painful|rough)\b)/i.test(lead)) return "sad";
  if (/^(?:that's (?:unacceptable|infuriating)\b|this is ridiculous\b|ugh\b)/i.test(lead)) return "angry";
  if (/^(?:no(?:pe)?[\s,!.]|not quite\b|unfortunately\b|actually[,]? no\b)/i.test(lead)) return "shake";
  if (/^(?:yes[\s,!\.]|yep\b|absolutely\b|exactly\b|you got it\b|of course\b|correct\b)/i.test(lead)) return "nod";
  if (/^(?:yay\b|nice\b|great\b|awesome\b|wonderful\b|glad\b|good news\b|congratulations\b|hey\b|hi\b|hello\b|you caught me\b|that's (?:fantastic|great|amazing)\b)/i.test(lead)) return "smile";
  return null;
}
