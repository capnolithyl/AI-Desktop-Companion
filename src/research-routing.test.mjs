import test from "node:test";
import assert from "node:assert/strict";
import { researchRequest, isPocketResearchFollowup, stripUnsupportedCitations } from "./research-routing.ts";

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


test("internet access announcement and confirmations never trigger Tavily", () => {
  for (const message of [
    "Guess what you should have Internet access now.",
    "Yay it works",
    "It works sort of i guess",
    "Cool, it actually works now!",
    "The latest album is fantastic!",
    "We have an internet connection now",
    "I'm excited about today's news",
    "Now we're talking",
    "Nice, Mikan!"
  ]) {
    assert.equal(researchRequest(message), null, message);
  }
});

test("explicit and current factual questions still search", () => {
  for (const question of [
    "What's the latest news about NASA?",
    "Is there any news about Artemis?",
    "What is the current price of gold?",
    "What is the weather in Michigan today?",
    "Search the web for the latest NASA mission schedule",
    "Can you look up the Artemis mission schedule?"
  ]) {
    assert.ok(researchRequest(question), question);
  }
});

test("only the most recent sourced reply can provide evidence to an informational follow-up", () => {
  const withSources = [
    {role:"user",content:"What's the latest news about Artemis?"},
    {role:"assistant",content:"The launch is planned [1].",
      sources:[{title:"NASA mission",url:"https://nasa.gov",content:"An update",engine:"Tavily"}]}
  ];
  for (const casual of ["Yay it works", "It works sort of i guess", "Nice!", "I like that", "How are you?"]) {
    assert.equal(isPocketResearchFollowup(casual, withSources), false, casual);
  }
  assert.equal(isPocketResearchFollowup("Is that confirmed?", withSources), true);
  assert.equal(isPocketResearchFollowup("And when is it scheduled?", withSources), true);
  assert.equal(isPocketResearchFollowup("What is the capital of Japan?", withSources), false);
  assert.equal(isPocketResearchFollowup("What do you think about it?", withSources), false);
  assert.equal(isPocketResearchFollowup("Is that confirmed?", [
    ...withSources, {role:"user",content:"Yay"}, {role:"assistant",content:"Great!"}
  ]), false);
  const fresh = researchRequest("And when is the next launch?", withSources);
  assert.ok(fresh);
  assert.equal(fresh.recent, true);
  assert.match(fresh.query, /Artemis/);
});

test("never display fabricated [1] markers without live research sources", () => {
  assert.equal(stripUnsupportedCitations("Wonderful! [1] It works [2]!"), "Wonderful! It works!");
  assert.equal(stripUnsupportedCitations("No sources [1], [2] here."), "No sources, here.");
  assert.equal(stripUnsupportedCitations("Read [this](https://example.org)"), "Read [this](https://example.org)");
});


test("Pixel regression: find me the latest album news searches rather than hallucinating offline", () => {
  const exact = "Can you find me the latest info on shadows fall? Any updates on their upcoming album?";
  assert.deepEqual(researchRequest(exact), { query: exact, recent: true });
  assert.deepEqual(researchRequest("Can you find me info on the next NASA launch?"),
    { query: "Can you find me info on the next NASA launch?", recent: false });
  assert.ok(researchRequest("Could you find me the newest release announcement?")?.recent);
  assert.ok(researchRequest("Tell me the latest news about Shadows Fall")?.recent);
  assert.ok(researchRequest("What can you tell me about Shadows Fall?"));
  assert.ok(researchRequest("Do you have any updates about Shadows Fall?")?.recent);
  assert.ok(researchRequest("What is the new album release date for that band?")?.recent);
});

test("find me is a recipient phrase, but private data remains private without explicit web permission", () => {
  for (const message of [
    "Can you find me my home address?",
    "Find me info about me",
    "Tell me about your hobbies",
    "What is my current job?",
    "Can you look up our old conversations?",
    "I have a new album I love today"
  ]) {
    assert.equal(researchRequest(message), null, message);
  }
  assert.ok(researchRequest("Search the web for the history of Shadows Fall"));
});
