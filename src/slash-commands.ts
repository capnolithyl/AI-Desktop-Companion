export type SlashHelpItem = { usage: string; description: string; insert: string };
export const SLASH_HELP: readonly SlashHelpItem[] = [
  { usage: "/help", description: "Show all available commands", insert: "/help" },
  { usage: "/personality", description: "Open quick personality controls", insert: "/personality" },
  { usage: "/preset <name>", description: "Switch to classic, cozy, flirty, focused, or chaos", insert: "/preset " },
  { usage: "/randomize", description: "Roll new personality settings", insert: "/randomize" },
  { usage: "/playfulness 80", description: "Set playfulness from 0 to 100", insert: "/playfulness " },
  { usage: "/flirtiness 80", description: "Set flirtiness from 0 to 100", insert: "/flirtiness " },
  { usage: "/affection 80", description: "Set affection from 0 to 100", insert: "/affection " },
  { usage: "/sass 80", description: "Set sass from 0 to 100", insert: "/sass " },
  { usage: "/energy 80", description: "Set energy from 0 to 100", insert: "/energy " },
  { usage: "/search <query>", description: "Search with local SearXNG", insert: "/search " },
  { usage: "/model <name>", description: "Switch to an installed Ollama model", insert: "/model " },
  { usage: "/models", description: "Open model selection", insert: "/models" },
  { usage: "/settings", description: "Open settings", insert: "/settings" },
  { usage: "/appearance", description: "Open visual settings", insert: "/appearance" },
  { usage: "/prompt", description: "Edit the system prompt in settings", insert: "/prompt" },
  { usage: "/portrait", description: "Choose Mikan's image in settings", insert: "/portrait" },
  { usage: "/log", description: "Open conversation history", insert: "/log" },
  { usage: "/chat", description: "Return to chat", insert: "/chat" },
  { usage: "/new", description: "Start a new conversation", insert: "/new" },
  { usage: "/hide", description: "Hide the companion window", insert: "/hide" }
];

/** Only the first slash-prefixed token is a command; arguments retain their case. */
export function parseSlashCommand(text: string): { name: string; argument: string } | null {
  const match = /^\/([a-z][a-z-]*)(?:\s+(.*))?$/is.exec(text.trim());
  return match ? { name: match[1].toLowerCase(), argument: (match[2] ?? "").trim() } : null;
}
