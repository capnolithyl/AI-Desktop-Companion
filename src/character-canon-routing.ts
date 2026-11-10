/** Only user questions about Mikan herself may draw on her established canon. */
export function shouldIncludeCharacterCanon(query: string): boolean {
  const q=query.trim();
  // "Do you think I should..." is about the user, not the assistant.
  if (/\b(?:your|yours)\b/i.test(q)) return true;
  if (/\b(?:do you (?:like|love|enjoy|prefer|listen|watch|play|have|dislike)|are you (?:a|an|into|interested)|what do you (?:like|love|prefer)|tell me about you)\b/i.test(q)) return true;
  return /\bmikan\b/i.test(q) &&
    /\b(?:favorite|favourite|hobb(?:y|ies)|interests?|appearance|looks?|outfit|personality|character|music|genre|color|colour|identity)\b/i.test(q);
}
