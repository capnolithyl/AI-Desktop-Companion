export type SlashHelpItem = { usage: string; description: string; insert: string };
export const SLASH_HELP: readonly SlashHelpItem[] = [
  { usage: "/help", description: "Show all available commands", insert: "/help" },
  { usage: "/capabilities", description: "Browse Mikan's own features and live status", insert: "/capabilities" },
  { usage: "/personality", description: "Open quick personality controls", insert: "/personality" },
  { usage: "/preset <name>", description: "Switch to classic, cozy, flirty, focused, or chaos", insert: "/preset " },
  { usage: "/randomize", description: "Roll new personality settings", insert: "/randomize" },
  { usage: "/playfulness 80", description: "Set playfulness from 0 to 100", insert: "/playfulness " },
  { usage: "/flirtiness 80", description: "Set flirtiness from 0 to 100", insert: "/flirtiness " },
  { usage: "/affection 80", description: "Set affection from 0 to 100", insert: "/affection " },
  { usage: "/sass 80", description: "Set sass from 0 to 100", insert: "/sass " },
  { usage: "/energy 80", description: "Set energy from 0 to 100", insert: "/energy " },
  { usage: "/search-start", description: "Start the installed SearXNG container", insert: "/search-start" },
  { usage: "/search-stop", description: "Stop SearXNG to save resources", insert: "/search-stop" },
  { usage: "/search-status", description: "Check the SearXNG service", insert: "/search-status" },
  { usage: "/read <url>", description: "Read and cache a public webpage", insert: "/read " },
  { usage: "/search <query>", description: "Search with local SearXNG", insert: "/search " },
  { usage: "/model <name>", description: "Switch to an installed Ollama model", insert: "/model " },
  { usage: "/models", description: "Open model selection", insert: "/models" },
  { usage: "/accent #ffad7e", description: "Change Mikan's accent color", insert: "/accent " },
  { usage: "/panel #211b25", description: "Change panel background color", insert: "/panel " },
  { usage: "/opacity 95", description: "Set panel opacity (65–100%)", insert: "/opacity " },
  { usage: "/font Arial", description: "Change the UI font", insert: "/font " },
  { usage: "/fontsize 14", description: "Change message size (11–20px)", insert: "/fontsize " },
  { usage: "/ollama <url>", description: "Update the local Ollama endpoint", insert: "/ollama " },
  { usage: "/searxng <url>", description: "Update the local web search endpoint", insert: "/searxng " },
  { usage: "/internet", description: "Open SearXNG and cache settings", insert: "/internet" },
  { usage: "/settings", description: "Open settings", insert: "/settings" },
  { usage: "/appearance", description: "Open visual settings", insert: "/appearance" },
  { usage: "/prompt", description: "Edit the system prompt in settings", insert: "/prompt" },
  { usage: "/portrait", description: "Choose Mikan's image in settings", insert: "/portrait" },
  { usage: "/memories", description: "View and edit saved user facts", insert: "/memories" },
  { usage: "/remember <fact>", description: "Save a fact about you locally", insert: "/remember " },
  { usage: "/canon", description: "Open Mikan's own character memories", insert: "/canon" },
  { usage: "/canon-set <detail>: <value>", description: "Save a fact about Mikan, e.g. favorite color: orange", insert: "/canon-set " },
  { usage: "/canon-forget <id>", description: "Delete one of Mikan's saved details", insert: "/canon-forget " },
  { usage: "/forget <id>", description: "Delete a saved fact using its ID", insert: "/forget " },
  { usage: "/chats", description: "Browse saved conversations", insert: "/chats" },
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
