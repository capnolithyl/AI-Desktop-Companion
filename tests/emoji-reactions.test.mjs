import test from "node:test";
import assert from "node:assert/strict";
import { extractReplyEmojis, stripEmojis } from "../src/emoji-reactions.ts";

test("extracts emoji into at most three distinct thought bubbles without rewriting stored messages", () => {
  const original = "That's adorable 😸😸! Let's read 📚 and celebrate ✨❤️.";
  assert.deepEqual(extractReplyEmojis(original), {
    visibleText: "That's adorable! Let's read and celebrate.",
    emojis: ["😸", "📚", "✨"]
  });
  assert.ok(original.includes("😸"));
});

test("keeps joined emoji, modifiers, flags and keycaps intact as single bubbles", () => {
  const result = extractReplyEmojis("Great 👩🏽‍💻! 🇺🇸 or 1️⃣? 🏳️‍🌈");
  assert.deepEqual(result.emojis, ["👩🏽‍💻", "🇺🇸", "1️⃣"]);
  assert.equal(result.visibleText, "Great! or?");
  assert.equal(stripEmojis("Hi ❤️👨‍👩‍👧👩🏽‍💻🇺🇸1️⃣!").replace(/\s+([!?])/g, "$1").trim(), "Hi!");
});

test("does not strip emoji from generated Markdown code examples", () => {
  const original = "Nice 😻!\n\n\x60const emoji = '😸';\x60\n\n\x60\x60\x60ts\nconst flag = '🇺🇸';\n\x60\x60\x60";
  const result = extractReplyEmojis(original);
  assert.deepEqual(result.emojis, ["😻"]);
  assert.equal(result.visibleText, "Nice!\n\n\x60const emoji = '😸';\x60\n\n\x60\x60\x60ts\nconst flag = '🇺🇸';\n\x60\x60\x60");
});

test("ordinary typography and replies without emoji stay intact", () => {
  const input = "Qwen3.5:9b says 2 + 2 = 4. Read *this*.";
  assert.deepEqual(extractReplyEmojis(input), { visibleText: input, emojis: [] });
});
