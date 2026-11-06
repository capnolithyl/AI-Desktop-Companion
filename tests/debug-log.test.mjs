import test from "node:test";
import assert from "node:assert/strict";
import { formatDebugLog } from "../src/debug-log.ts";

test("copies all message text, source details and response timings", () => {
  const result = formatDebugLog([
    { id: "user-1", role: "user", createdAt: Date.UTC(2026, 10, 6, 21, 31), content: "What happened with Artemis?" },
    {
      id: "assistant-1", role: "assistant", createdAt: Date.UTC(2026, 10, 6, 21, 31, 5),
      content: "Artemis III is targeted for 2027 [1].",
      searchQuery: "Artemis III 2027 NASA",
      sources: [{
        title: "NASA Mission Update", url: "https://www.nasa.gov/missions/artemis",
        content: "The mission is planned for 2027.\nCrew details follow.",
        engine: "test-engine", publishedDate: "2026-10-31"
      }],
      diagnostics: {
        elapsedMs: 5000, firstTokenMs: 1200, model: "qwen3.5:9b",
        stats: {
          outputTokens: 100, promptTokens: 2500, totalDurationNs: 4_000_000_000,
          loadDurationNs: 20_000_000, promptEvalDurationNs: 500_000_000,
          evalDurationNs: 2_000_000_000
        }
      }
    },
    {
      id: "assistant-2", role: "assistant", createdAt: Date.UTC(2026, 10, 6, 21, 31, 15),
      content: "My guess is 2027 [1].", sourcesCarriedOver: true,
      sources: [{title: "NASA Mission Update", url: "https://www.nasa.gov/missions/artemis", content: "2027",
        engine: "test-engine"}]
    }
  ], {
    conversationId: "conversation-1", model: "qwen3.5:9b", contextWindow: 16384,
    exportedAt: new Date("2026-11-06T21:40:00Z")
  });

  assert.match(result, /MIKAN DEBUG LOG/);
  assert.match(result, /Conversation ID: conversation-1/);
  assert.match(result, /Context window: 16384 tokens/);
  assert.match(result, /What happened with Artemis\?/);
  assert.match(result, /Artemis III is targeted for 2027 \[1\]/);
  assert.match(result, /SearXNG query: Artemis III 2027 NASA/);
  assert.match(result, /\[1\] NASA Mission Update/);
  assert.match(result, /URL: https:\/\/www\.nasa\.gov\/missions\/artemis/);
  assert.match(result, /Published: 2026-10-31/);
  assert.match(result, /Crew details follow/);
  assert.match(result, /Sources carried from earlier research \(not refreshed\)/);
  assert.match(result, /Wall time: 5\.00 s/);
  assert.match(result, /First token: 1\.20 s/);
  assert.match(result, /Speed: 50\.0 tok\/s/);
  assert.match(result, /Prompt: 2500 tokens/);
  assert.match(result, /Model: qwen3\.5:9b/);
  assert.equal((result.match(/=== MIKAN/g) ?? []).length, 2);
});

test("handles empty logs and missing metrics without inventing data", () => {
  const empty = formatDebugLog([], {
    conversationId: null, model: "qwen3.5:9b", contextWindow: null,
    exportedAt: new Date("2026-11-06T21:40:00Z")
  });
  assert.match(empty, /Message count: 0/);
  assert.match(empty, /Context window: Ollama default/);
  assert.doesNotMatch(empty, /Performance:/);

  const pending = formatDebugLog([{
    id: "partial", role: "assistant", content: "", createdAt: 0
  }], {
    conversationId: null, model: "qwen3.5:9b", contextWindow: 16384,
    exportedAt: new Date("2026-11-06T21:40:00Z")
  });
  assert.match(pending, /\(Empty \/ still generating\)/);
});
