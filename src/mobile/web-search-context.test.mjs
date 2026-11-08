import test from "node:test";
import assert from "node:assert/strict";
import { compactWebContext } from "../web-search.ts";

test("Tavily evidence uses the phone's local date, not the next UTC day", () => {
  const now = new Date("2026-11-08T00:15:00.000Z");
  const prompt = compactWebContext("Any info on the new album?", [{
    title: "Band news",
    url: "https://example.org/news",
    content: "The group had a tour scheduled for June 2026.",
    engine: "Tavily",
    publishedDate: "2026-05-03"
  }], now, "America/Detroit");
  assert.match(prompt, /Current LOCAL date from this Android device: 2026-11-07 \(America\/Detroit\)/);
  assert.match(prompt, /A tour scheduled for a month already passed is not upcoming/);
  assert.match(prompt, /If answering a follow-up, skip introductions/);
  assert.doesNotMatch(prompt, /Current LOCAL date from this Android device: 2026-11-08/);
});

test("a future-dated search result is not automatically an accomplished event", () => {
  const prompt = compactWebContext("When is the release?", [{
    title: "Alleged December 24, 2026 album review",
    url: "https://example.org/review",
    content: "An unverified listing says the album will release December 24, 2026.",
    engine: "Tavily",
    publishedDate: "2026-12-24"
  }], new Date("2026-11-08T00:15:00.000Z"), "America/Detroit");
  assert.match(prompt, /future-dated search snippets or alleged reviews/);
  assert.match(prompt, /2026-11-07/);
  assert.match(prompt, /2026-12-24/);
});
