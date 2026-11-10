import test from "node:test";
import assert from "node:assert/strict";
import {
  boundedConversation, needsContextResolution, condenserPrompt,
  resolveConversationQuestion, contextGuidance, responseFocusGuidance
} from "./conversation-engine.ts";

const history = [
  {role:"user", content:"Can you give me information about Maximum the Hormone, the Japanese band?"},
  {role:"assistant", content:"Maximum the Hormone is a Japanese band. A made-up album title appeared here [1].",
    sources:[{title:"A questionable source"}]},
  {role:"user",content:"Is there any info on a new album?"},
  {role:"assistant",content:"There may be a new album. This needs verification [1].",
    sources:[{title:"News"}]},
  {role:"user",content:"What date is it?"},
  {role:"assistant",content:"It's November 7."},
];
test("source-bearing assistant replies preserve topic context but are marked unverified", () => {
  const text = boundedConversation(history, 2500);
  assert.match(text, /Maximum the Hormone/);
  assert.match(text, /previous researched reply, NOT verified evidence/);
  assert.match(contextGuidance(history, "When did that album come out?"), /CURRENT USER REQUEST: When did that album come out/);
});
test("ambiguity triggers a local condenser only when needed", () => {
  assert.equal(needsContextResolution("When did that album come out?",history),true);
  assert.equal(needsContextResolution("Is there any info on a new album?",history),true);
  assert.equal(needsContextResolution("What's the time?",history),false);
  assert.equal(needsContextResolution("Hello Mikan!",history),false);
  assert.equal(needsContextResolution("What did Maximum the Hormone release in 2026?",history),false);
});
test("local model resolves references, but user turns must ground every named subject", async () => {
  let called = 0;
  const resolver = async (prompt) => {
    called++; assert.match(prompt,/Maximum the Hormone/);
    return JSON.stringify({topic:"Maximum the Hormone",
      standaloneQuestion:"When was Maximum the Hormone's most recently discussed album released?"});
  };
  const result = await resolveConversationQuestion("When did that album come out?",history,resolver);
  assert.equal(result.topic,"Maximum the Hormone");
  assert.match(result.standaloneQuestion,/Maximum the Hormone/);
  assert.equal(called,1);
  const hallucinated = await resolveConversationQuestion("When did that album come out?",history,
    async () => '{"topic":"Journey","standaloneQuestion":"When did Journey Escape release?"}');
  assert.equal(hallucinated.topic,null);
  assert.match(hallucinated.standaloneQuestion,/Maximum the Hormone/);
});
test("safe fallback when Nano produces prose or fails", async () => {
  const a = await resolveConversationQuestion("When did that album come out?",history,async()=> "Hmm. Maybe Journey?");
  const b = await resolveConversationQuestion("When did that album come out?",history,async()=> {throw Error("Model unavailable")});
  assert.equal(a.standaloneQuestion,b.standaloneQuestion);
  assert.match(a.standaloneQuestion,/Maximum the Hormone/);
  assert.match(condenserPrompt("When did that album come out?",history),/ONLY JSON/);
});
test("context budget prefers most recent turns and never invents a summary", () => {
  const many = Array.from({length:50},(_,i)=>({role:i%2?"assistant":"user",content:"Message "+i+" word ".repeat(20)}));
  const bounded = boundedConversation(many,1000,12);
  assert.ok(bounded.length<=1100);
  assert.match(bounded,/Message 49/);
  assert.doesNotMatch(bounded,/Message 1 /);
});

test("style helper notices repeated side topics without suppressing user-chosen ones", () => {
  const turns=[
    {role:"assistant",content:"Your meeting is open and the music sounds good."},
    {role:"assistant",content:"I can see the meeting and the music again."},
    {role:"assistant",content:"The meeting is going well and the music is playing."}
  ];
  const unrelated=responseFocusGuidance(turns,"Thanks, it works!");
  assert.match(unrelated,/meeting/);
  assert.match(unrelated,/do not reintroduce/i);
  const directlyAsked=responseFocusGuidance(turns,"What can you tell me about the meeting?");
  assert.doesNotMatch(directlyAsked,/discussing them: meeting/);
});


test("unfamiliar site guidance discourages inventing a business from its name", () => {
  assert.match(responseFocusGuidance([], "What is DiscoverMass?"), /never infer its purpose from its spelling/i);
});


test("normal conversation instructions discourage stage direction narration without disabling explicit roleplay", () => {
  const guidance = responseFocusGuidance([], "Good morning!");
  assert.match(guidance, /do not narrate physical \*actions\*/i);
  assert.match(guidance, /\*meow\*.*\*really\*/i);
  assert.match(guidance, /unless the owner explicitly requests roleplay/i);
});
