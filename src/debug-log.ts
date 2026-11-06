import type { WebResult } from "./web-search";

export type OllamaStats = {
  outputTokens: number | null;
  promptTokens: number | null;
  totalDurationNs: number | null;
  loadDurationNs: number | null;
  promptEvalDurationNs: number | null;
  evalDurationNs: number | null;
};

export type Diagnostics = {
  elapsedMs: number;
  firstTokenMs: number | null;
  model: string;
  stats: OllamaStats | null;
};

export type DebugLogMessage = {
  id: string;
  role: "user" | "assistant";
  createdAt: number;
  content: string;
  failed?: boolean;
  searchQuery?: string;
  sourcesCarriedOver?: boolean;
  sources?: WebResult[];
  diagnostics?: Diagnostics;
};

export type DebugLogOptions = {
  conversationId: string | null;
  model: string;
  contextWindow: number | null;
  exportedAt?: Date;
};

function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "n/a";
  return ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : Math.round(ms) + " ms";
}

function fromNanoseconds(ns: number | null | undefined): string {
  return ns == null ? "n/a" : duration(ns / 1_000_000);
}

function timestamp(time: number): string {
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return date.toLocaleString() + " (" + date.toISOString() + ")";
}

function performanceLines(diagnostics: Diagnostics): string[] {
  const s = diagnostics.stats;
  const speed = s?.outputTokens != null && s.evalDurationNs != null && s.evalDurationNs > 0
    ? (s.outputTokens / (s.evalDurationNs / 1e9)).toFixed(1) + " tok/s" : "n/a";
  return [
    "Performance:",
    "  Wall time: " + duration(diagnostics.elapsedMs),
    "  First token: " + duration(diagnostics.firstTokenMs),
    "  Output: " + (s?.outputTokens == null ? "n/a" : s.outputTokens + " tokens"),
    "  Speed: " + speed,
    "  Prompt: " + (s?.promptTokens == null ? "n/a" : s.promptTokens + " tokens"),
    "  Model time: " + fromNanoseconds(s?.totalDurationNs),
    "  Load time: " + fromNanoseconds(s?.loadDurationNs),
    "  Prompt eval: " + fromNanoseconds(s?.promptEvalDurationNs),
    "  Model: " + diagnostics.model
  ];
}

/**
 * Copy exactly the current conversation and its attached debugging evidence.
 * This is an explicit, user-initiated export. It never reads unrelated chats,
 * system prompts, credentials, or local memory records.
 */
export function formatDebugLog(messages: readonly DebugLogMessage[], options: DebugLogOptions): string {
  const lines = [
    "MIKAN DEBUG LOG",
    "Exported: " + (options.exportedAt ?? new Date()).toISOString(),
    "Conversation ID: " + (options.conversationId ?? "none"),
    "Current selected model: " + options.model,
    "Context window: " + (options.contextWindow == null ? "Ollama default" : options.contextWindow + " tokens"),
    "Message count: " + messages.length,
    "Note: Contains conversation text and source excerpts. Review before sharing.",
    ""
  ];

  for (const message of messages) {
    lines.push("=== " + (message.role === "user" ? "YOU" : "MIKAN") + " | " + timestamp(message.createdAt) + " ===");
    lines.push("Message ID: " + message.id);
    lines.push(message.content || "(Empty / still generating)");
    if (message.failed) lines.push("Status: failed or interrupted");

    if (message.searchQuery) lines.push("SearXNG query: " + message.searchQuery);
    if (message.sources?.length) {
      lines.push(message.sourcesCarriedOver
        ? "Sources carried from earlier research (not refreshed):"
        : "Retrieved sources (not independently verified):");
      message.sources.forEach((source, index) => {
        lines.push("[" + (index + 1) + "] " + source.title);
        lines.push("  URL: " + source.url);
        lines.push("  Published: " + (source.publishedDate ?? "not supplied"));
        lines.push("  Engine: " + source.engine);
        lines.push("  Excerpt: " + (source.content || "(none)").replace(/\n/g, "\n  "));
      });
    }

    if (message.diagnostics) lines.push(...performanceLines(message.diagnostics));
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
