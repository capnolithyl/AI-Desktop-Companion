import test from "node:test";
import assert from "node:assert/strict";
import { researchRequest } from "./research-routing.ts";

test("freshness and explicit research use an online search, not a guessed reply", () => {
  assert.deepEqual(researchRequest("What's the latest news about Artemis?"),
    { query: "What's the latest news about Artemis?", recent: true });
  assert.deepEqual(researchRequest("Search for the latest Amon Amarth tour dates"),
    { query: "Search for the latest Amon Amarth tour dates", recent: true });
  assert.deepEqual(researchRequest("What is the capital of Germany?"),
    { query: "What is the capital of Germany?", recent: false });
});

test("casual conversation, personal memory and roleplay stay local", () => {
  for (const text of ["Hi Mikan!", "How are you?", "What do you think of metal?",
    "What's my favorite color?", "Tell me about yourself", "Remember that I like cats"]) {
    assert.equal(researchRequest(text), null, text);
  }
});

test("relevant follow-ups inherit the user's topic, never unsourced assistant claims", () => {
  const history = [
    {role:"user",content:"What's the latest news about Artemis?" },
    {role:"assistant",content:"I have seen a launch today, trust me."}
  ];
  const result = researchRequest("And when is the next launch?", history);
  assert.ok(result);
  assert.match(result.query, /Artemis/);
  assert.doesNotMatch(result.query, /seen a launch/);
});

test("unrelated new topics do not blindly reuse old searches", () => {
  const history = [{role:"user",content:"Search for metal albums"}];
  const result = researchRequest("What is the capital of Japan?",history);
  assert.equal(result?.query,"What is the capital of Japan?");
});

test("personal disclosures and Mikan persona questions are never sent to search automatically", () => {
  for (const question of [
    "I was born in 2026", "My favorite album is a 2026 release",
    "What is your favorite color?", "What did we talk about today?",
    "I'm at my current job", "I live in Germany"
  ]) {
    assert.equal(researchRequest(question), null, question);
  }
});
