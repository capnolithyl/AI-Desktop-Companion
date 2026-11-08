import test from "node:test";
import assert from "node:assert/strict";
import { splitSpeechText, toSpeechText } from "../src/speech.ts";

test("short utterances and blank text", () => {
  assert.deepEqual(splitSpeechText("Hi, Mikan!"), ["Hi, Mikan!"]);
  assert.deepEqual(splitSpeechText("  "), []);
});

test("sentence chunks preserve full text and stay under the limit", () => {
  const input = "The first sentence is clear. ".repeat(13).trim();
  const chunks = splitSpeechText(input, 100);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every(chunk => chunk.length <= 100));
  assert.equal(chunks.join(" "), input);
});

test("long unbroken words still respect the maximum", () => {
  const chunks = splitSpeechText("x".repeat(365), 80);
  assert.ok(chunks.every(chunk => chunk.length <= 80));
  assert.equal(chunks.join(""), "x".repeat(365));
});

test("clean markdown before splitting", () => {
  const cleaned = toSpeechText("Hello **friend**. [1] Here is [a link](https://example.com)!");
  assert.deepEqual(splitSpeechText(cleaned, 35), ["Hello friend.", "Here is a link!"]);
});
