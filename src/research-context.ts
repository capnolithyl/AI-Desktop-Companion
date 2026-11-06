import type { WebResult } from "./web-search";

type PriorMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: WebResult[];
  failed?: boolean;
};

/**
 * Source snippets are metadata, not model-generated text. Carry the most recent
 * research evidence into short follow-ups instead of asking the model to trust
 * its previous response. No server fetch happens when these sources are reused.
 */
export function priorResearchSources(messages: PriorMessage[], question: string): WebResult[] {
  const text = question.trim().toLowerCase();
  if (!text || text.length > 280) return [];

  // New independent topics should not inherit a different conversation's sources.
  const resemblesFollowup = /^(and\b|also\b|so\b|but\b|what(?:'s| is| are| about| do| would)?\b|when\b|where\b|why\b|how\b|who\b|which\b|will\b|would\b|could\b|should\b|do you\b|does\b|is there\b|are there\b|can they\b|tell me more\b|your (?:prediction|take)\b)/i.test(text)
    || /\b(that|those|their|they|them|it|its|schedule|milestone|prediction|timeline)\b/.test(text);
  if (!resemblesFollowup) return [];

  // Do not attach old NASA snippets to an explicit new topic or named entity.
  if (/\b(?:about|regarding)\s+\w+/.test(text) && !/\b(?:about|regarding)\s+(?:that|it|them|those|this|their)\b/.test(text)) {
    return [];
  }

  const recent = messages.slice(-8).reverse().find(message =>
    message.role === "assistant" && !message.failed && Array.isArray(message.sources) && message.sources.length > 0
  );
  if (!recent?.sources) return [];

  const urls = new Set<string>();
  return recent.sources
    .filter(source => {
      if (!source || typeof source.url !== "string") return false;
      try {
        const protocol = new URL(source.url).protocol;
        if (protocol !== "https:" && protocol !== "http:") return false;
      } catch { return false; }
      if (urls.has(source.url)) return false;
      urls.add(source.url);
      return true;
    })
    .slice(0, 8).map(source => ({
      title: String(source.title ?? "").slice(0, 180),
      url: source.url.slice(0, 1024),
      content: String(source.content ?? "").slice(0, 420),
      engine: String(source.engine ?? "").slice(0, 60),
      ...(source.publishedDate ? { publishedDate: String(source.publishedDate).slice(0, 80) } : {})
    }));
}
