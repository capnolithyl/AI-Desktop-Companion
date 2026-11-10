/** Only user questions about Mikan herself may draw on her established canon. */
export function shouldIncludeCharacterCanon(query: string): boolean {
  const q=query.trim();
  // "Do you think I should..." is about the user, not the assistant.
  if (/\b(?:your|yours)\b/i.test(q)) return true;
  if (/\b(?:do you (?:like|love|enjoy|prefer|listen|watch|play|have|dislike)|are you (?:a|an|into|interested)|what do you (?:like|love|prefer)|tell me about you)\b/i.test(q)) return true;
  // Mentioning "Mikan" while asking for the USER's favorite music must not
  // inject Mikan's own tastes. Only explicit possessive/self questions count.
  return /\bmikan(?:'s|’s)\b/i.test(q) ||
    /\b(?:who|what) are you\b|\b(?:tell me about|describe) yourself\b/i.test(q);
}
