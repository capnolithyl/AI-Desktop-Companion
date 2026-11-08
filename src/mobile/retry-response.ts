import type { PocketTurn } from "./mobile-memory.ts";

export type RetryTarget = {
  threadId: string;
  user: PocketTurn;
  assistant: PocketTurn;
  history: PocketTurn[];
};

/**
 * Regenerate only the immediately interrupted assistant turn. Never append a
 * duplicate user message or mistake a prior model answer for the user's text.
 */
export function retryTarget(
  threadId: string, turns: PocketTurn[], assistantId: string
): RetryTarget | null {
  const index = turns.findIndex(t => t.id === assistantId);
  if (index !== turns.length - 1 || index < 1) return null;
  const assistant = turns[index], user = turns[index - 1];
  if (assistant.role !== "assistant" || user.role !== "user") return null;
  if (!assistant.failed && assistant.content.trim()) return null;
  return {threadId, assistant, user, history:turns.slice(0,index-1)};
}
