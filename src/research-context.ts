import type { WebResult } from "./web-search";
import { isResearchFollowup } from "./research-routing";

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
  // Evidence belongs to the immediately preceding sourced answer only.
  // This avoids dragging old research through unrelated casual replies.
  if (!isResearchFollowup(question, messages)) return [];
  const recent = messages[messages.length - 1];
  if (recent?.failed) return [];
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
