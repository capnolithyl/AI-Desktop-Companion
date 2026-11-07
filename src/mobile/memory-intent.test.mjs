import test from "node:test";
import assert from "node:assert/strict";
import { resolveExplicitMemoryIntent } from "./memory-intent.ts";

test("nudging Mikan after sharing a name saves the earlier user fact", () => {
  const history = [
    { role: "user", content: "My name is Marcus" },
    { role: "assistant", content: "Nice to meet you, Marcus!" }
  ];
  assert.deepEqual(resolveExplicitMemoryIntent("You wanna remember that?", history), {
    kind: "user",
    fact: "The user's name is Marcus",
    description: "your name is Marcus",
    sourceText: "My name is Marcus"
  });
});

test("direct remember requests require no model generation", () => {
  const intent = resolveExplicitMemoryIntent("Remember that I love metal.", []);
  assert.equal(intent?.kind, "user");
  assert.equal(intent?.fact, "The user loves metal");
  assert.equal(resolveExplicitMemoryIntent("Could you remember my favorite color is orange?", [])?.kind, "user");
});

test("recollection questions cannot secretly write a memory", () => {
  assert.equal(resolveExplicitMemoryIntent("Do you remember that?", [
    { role: "user", content: "My name is Marcus" }
  ]), null);
  assert.equal(resolveExplicitMemoryIntent("What's my name?", []), null);
});

test("follow-up never turns Mikan's greeting into a user fact", () => {
  const intent = resolveExplicitMemoryIntent("You wanna remember that?", [
    { role: "user", content: "Hello!" },
    { role: "assistant", content: "I'm a fluffy orange space dragon." }
  ]);
  assert.equal(intent?.kind, "clarify");
});

test("explicit Mikan canon is separate from user identity", () => {
  const intent = resolveExplicitMemoryIntent("Remember that your favorite color is orange.", []);
  assert.deepEqual(intent, {
    kind: "character",
    category: "favorites",
    label: "Favorite color",
    value: "orange",
    description: "Mikan's favorite color is orange",
    sourceText: "your favorite color is orange."
  });
});

test("Mikan's preference may be referenced only after a direct question", () => {
  const intent = resolveExplicitMemoryIntent("Can you remember that?", [
    { role: "user", content: "What's your favorite color?" },
    { role: "assistant", content: "My favorite color is amber!" }
  ]);
  assert.equal(intent?.kind, "character");
  assert.equal(intent?.value, "amber");
});

test("ambiguous requests ask for a detail instead of inventing it", () => {
  assert.equal(resolveExplicitMemoryIntent("Remember that?", [])?.kind, "clarify");
  assert.equal(resolveExplicitMemoryIntent("Remember this?", [])?.kind, "clarify");
});
