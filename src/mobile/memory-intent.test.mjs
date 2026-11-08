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
    fact: "The user is named Marcus",
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

test("natural greeting plus a follow-up saves the preceding name, not Mikan's greeting", () => {
  const preceding = [
    { role: "user", content: "Hi I'm Marcus" },
    { role: "assistant", content: "Marcus, hello! Fancy meeting you here." }
  ];
  assert.deepEqual(resolveExplicitMemoryIntent("Can you remember that?", preceding), {
    kind: "user",
    fact: "The user is named Marcus",
    description: "your name is Marcus",
    sourceText: "Hi I'm Marcus"
  });
});

test("names can be introduced with different common greetings and apostrophes", () => {
  for (const text of ["Hey, I'm Alex", "Hello! My name is Alex", "I’m Alex",
    "Hi, you can call me Alex", "Hi! I go by Alex"]) {
    const result = resolveExplicitMemoryIntent("Remember that?", [
      { role: "user", content: text },
      { role: "assistant", content: "Nice to meet you." }
    ]);
    assert.equal(result?.kind, "user", text);
    assert.equal(result?.fact, "The user is named Alex", text);
  }
});

test("a passing mood or vague greeting cannot be misread as a saved name", () => {
  for (const text of ["Hi, I'm tired", "Hi, I'm a developer", "I'm looking around", "Hello!"]) {
    const result = resolveExplicitMemoryIntent("Remember that?", [
      { role: "user", content: text },
      { role: "assistant", content: "Hey!" }
    ]);
    assert.equal(result?.kind, "clarify", text);
  }
});


test("remember that resolves context after a short answer to a prior question", () => {
  const history = [
    { role:"user", content:"Ask me some questions!" },
    { role:"assistant", content:"What's your favorite flavor of ice cream?" },
    { role:"user", content:"Vanilla for sure. I'm classy like that" },
    { role:"assistant", content:"Sounds tasty!" }
  ];
  assert.deepEqual(resolveExplicitMemoryIntent("Remember that?", history), {
    kind:"user",
    fact:"The user's favorite flavor of ice cream is Vanilla",
    description:"your answer about What's your favorite flavor of ice cream",
    sourceText:"Vanilla for sure. I'm classy like that"
  });
});

test("remember that will not invent a fact from an unrelated assistant statement", () => {
  const history = [
    { role:"user", content:"Sure" },
    { role:"assistant", content:"Great! I am a catgirl." }
  ];
  assert.equal(resolveExplicitMemoryIntent("Remember that?", history)?.kind, "clarify");
});
