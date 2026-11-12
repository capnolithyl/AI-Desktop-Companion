/**
 * Runtime facts belong to the host app, not to an LLM's guess or a web search.
 * Only intercept direct requests for the currently configured inference engine.
 */
export function isModelStatusQuestion(question: string): boolean {
  const text = question.trim()
    .replace(/^(?:hey|hi|hello)[,!. ]+(?:mikan[,!. ]+)?/i,"")
    .replace(/^mikan[,!. ]+/i,"")
    .replace(/^(?:can|could)\s+you\s+(?:please\s+)?(?:tell\s+me|say)\s+/i,"")
    .trim();
  return /^(?:what|which)\s+(?:llm|(?:ai\s+|language\s+|inference\s+)?model)\s+(?:are\s+you|is\s+mikan)\s+(?:(?:currently|right\s+now)\s+)?(?:using|running)(?:\s+(?:right\s+now|currently|now|at\s+the\s+moment))?\s*[?.!]*$/i.test(text)
    || /^(?:what|which)\s+(?:llm|(?:ai\s+|language\s+|inference\s+)?model)\s+(?:you['’]re|you\s+are|mikan\s+is)\s+(?:(?:currently|right\s+now)\s+)?(?:using|running)(?:\s+(?:right\s+now|currently|now))?\s*[?.!]*$/i.test(text)
    || /^what\s+(?:llm|(?:ai\s+|language\s+)?model)\s+(?:powers|runs)\s+(?:you|mikan)\s*[?.!]*$/i.test(text);
}

type ModelStatusSettings = {
  provider: "local" | "auto" | "gemini" | "openrouter";
  model: string;
  geminiModel: string;
  openrouterModel: string;
};
type PriorMessage = {
  role: "user" | "assistant";
  diagnostics?: { model: string; fallbackReason?: string | null };
};

/** Explicitly distinguish configured providers from the model that answered. */
export function modelStatusAnswer(
  settings: ModelStatusSettings, messages: readonly PriorMessage[]
): string {
  const local = "Ollama `" + settings.model + "`";
  const cloud = "Gemini `" + settings.geminiModel + "`";
  const free = "OpenRouter `" + settings.openrouterModel + "` (free only)";
  const configured = settings.provider === "auto"
    ? "I'm configured for **Auto**: try **" + free + "** first, then fall back to **" + local + "** if it isn't available."
    : settings.provider === "openrouter"
      ? "I'm configured for **" + free + "** (no automatic local fallback)."
    : settings.provider === "gemini"
      ? "I'm configured for **" + cloud + "** (cloud only, no automatic local fallback)."
      : "I'm configured to use **" + local + "** locally.";
  const last = [...messages].reverse().find(message =>
    message.role === "assistant" && !!message.diagnostics?.model
  );
  if (!last?.diagnostics) {
    return configured + " No model-generated reply has been recorded in this conversation yet.";
  }
  const reason = last.diagnostics.fallbackReason;
  return configured + " **My last model-generated reply used `" +
    last.diagnostics.model + "`.**" +
    (reason ? " Cloud fallback reason: " + reason + "." : "");
}
