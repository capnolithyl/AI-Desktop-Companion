import test from "node:test";
import assert from "node:assert/strict";
import { priorResearchSources } from "./research-context.ts";

const source = { title: "NASA update", url: "https://www.nasa.gov/mission", content: "Dated mission facts", engine: "Tavily" };
const history = [
  { role: "user", content: "What's the latest news about Artemis?" },
  { role: "assistant", content: "Mission update [1]", sources: [source] }
];

test("source carry-over only for immediately relevant follow-ups", () => {
  assert.deepEqual(priorResearchSources(history, "Is that confirmed?"), [source]);
  assert.deepEqual(priorResearchSources(history, "Do you think they'll make the deadline?"), [source]);
  assert.deepEqual(priorResearchSources(history, "What do you think about it?"), []);
  assert.deepEqual(priorResearchSources(history, "Yay it works"), []);
  assert.deepEqual(priorResearchSources(history, "What is the capital of Japan?"), []);
  assert.deepEqual(priorResearchSources(history, "Tell me about your hobbies"), []);
  assert.deepEqual(priorResearchSources([
    ...history, { role: "user", content: "Nice" }, { role: "assistant", content: "Great!" }
  ], "Is that confirmed?"), []);
});

test("source filtering validates links and removes duplicate evidence", () => {
  const messages = [
    { role: "user", content: "Find the current schedule" },
    { role: "assistant", content: "Here are sources", sources: [
      source, source,
      { title: "Unsafe", url: "javascript:alert(1)", content: "bad", engine: "bad" },
      { title: "Another", url: "https://www.nasa.gov/other", content: "other", engine: "Tavily" }
    ] }
  ];
  assert.equal(priorResearchSources(messages, "And when is it scheduled?").length, 2);
});
