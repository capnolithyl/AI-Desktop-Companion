import test from "node:test";
import assert from "node:assert/strict";
import { splitSpeechText, toSpeechText, ProgressiveSpeechFeed, FIRST_SPEECH_CHARS } from "../src/speech.ts";

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
  const cleaned = toSpeechText("Hello **friend**. [1] Here is [a useful link today](https://example.com)!");
  assert.deepEqual(splitSpeechText(cleaned, 35), ["Hello friend.", "Here is a useful link today!"]);
});


test("short first spoken phrase allows earlier playback and preserves all text", () => {
  const text = "Hey there! I'm Mikan. I finally have a voice. " +
    "Let's see if I can sound cute without becoming a squeaky toy.";
  const pieces = splitSpeechText(text, 160, FIRST_SPEECH_CHARS);
  assert.ok(pieces.length >= 2);
  assert.ok(pieces[0].length <= FIRST_SPEECH_CHARS);
  assert.equal(pieces.join(" "), text);
});

test("live speech feed emits stable clauses before completion and finishes without repetition", async () => {
  const feed = new ProgressiveSpeechFeed();
  const iterator = feed[Symbol.asyncIterator]();
  feed.append("Hey there! I'm Mikan. I finally ");
  const first = await iterator.next();
  assert.equal(first.done, false);
  assert.equal(first.value, "Hey there! I'm Mikan.");
  feed.append("have a voice. I can talk with you now, and this is great.");
  assert.equal(feed.finish("Hey there! I'm Mikan. I finally have a voice. I can talk with you now, and this is great."), true);
  const rest = [];
  while (true) {
    const next = await iterator.next();
    if (next.done) break;
    rest.push(next.value);
  }
  assert.equal([first.value, ...rest].join(" "), "Hey there! I'm Mikan. I finally have a voice. I can talk with you now, and this is great.");
});

test("progressive speech never reads partial tokens or replays stopped material", async () => {
  const feed = new ProgressiveSpeechFeed();
  const iterator = feed[Symbol.asyncIterator]();
  feed.append("A partial");
  const waiting = iterator.next();
  feed.abort();
  assert.equal((await waiting).done, true);
  assert.equal(feed.finish("A partial sentence."), false);
});

test("progressive speech rejects incompatible final verification edits", async () => {
  const feed = new ProgressiveSpeechFeed();
  feed.append("Mikan says something important. The model continues typing ");
  const first = await feed[Symbol.asyncIterator]().next();
  assert.equal(first.done, false);
  assert.equal(feed.finish("The revised answer says something different."), false);
  assert.equal((await feed[Symbol.asyncIterator]().next()).done, true);
});

test("live feed flushes a short final reply even without a streaming clause", async () => {
  const feed = new ProgressiveSpeechFeed();
  feed.append("Hi!");
  assert.equal(feed.finish("Hi!"), true);
  const iterator = feed[Symbol.asyncIterator]();
  assert.deepEqual(await iterator.next(), { done: false, value: "Hi!" });
  assert.equal((await iterator.next()).done, true);
});
