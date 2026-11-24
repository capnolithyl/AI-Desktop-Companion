/** Build a bounded, local-only retrieval query for referential follow-ups.
 * A memory lookup needs the user's named referents, but should never send
 * their previous messages to a public search engine.
 */
export function refersToPreviousMessage(message:string):boolean {
  const text=message.trim();
  if(text.length>190)return false;
  return /\b(?:the other one|which one|that one|those|them|their|they(?:'ve|'re)?|its|it|this|that|he|him|his|she|her|hers)\b/i.test(text);
}
export function contextualMemoryQuery(
  message:string,history:readonly {role:string;content:string}[]
):string {
  const text=message.trim();
  if(!refersToPreviousMessage(text))return text;
  const users=history.filter(turn=>turn.role==="user")
    .slice(-2).map(turn=>turn.content.trim().slice(0,180))
    .filter(Boolean);
  return users.length?[...users,text].join(" ").slice(0,550):text;
}
