import test from "node:test";
import assert from "node:assert/strict";
import { splitSpeechText, toSpeechText, ProgressiveSpeechFeed, FIRST_SPEECH_CHARS, voiceEndpoint, canSaveVoiceReference } from "../src/speech.ts";
import { NarrationFilter, stripNarratedActions, isNarratedAction, roleplayActive } from "../src/narration-filter.ts";

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

test("Pocket TTS uses a fixed local port and preserves Qwen's custom endpoint", () => {
  assert.equal(voiceEndpoint({engine:"pocket",endpoint:"http://127.0.0.1:8765"}), "http://127.0.0.1:8766");
  assert.equal(voiceEndpoint({engine:"qwen",endpoint:"http://localhost:8877"}), "http://localhost:8877");
});

test("Pocket reference swaps accept audio without Qwen or transcript; Qwen still requires both", () => {
  assert.equal(canSaveVoiceReference("pocket", true, false, false, ""), true);
  assert.equal(canSaveVoiceReference("pocket", false, true, true, "words"), false);
  assert.equal(canSaveVoiceReference("qwen", true, false, true, "words"), false);
  assert.equal(canSaveVoiceReference("qwen", true, true, false, "words"), false);
  assert.equal(canSaveVoiceReference("qwen", true, true, true, ""), false);
  assert.equal(canSaveVoiceReference("qwen", true, true, true, "matching words"), true);
});

test("Pocket preserves the entire spoken text beyond the old 800-character cutoff", () => {
  const longReply = ("This is a thoughtful reply with lots of information. ").repeat(34).trim();
  const spoken = toSpeechText(longReply);
  assert.equal(spoken, longReply);
  assert.ok(spoken.length > 900);
  const pieces = splitSpeechText(spoken, 650);
  assert.ok(pieces.length > 1);
  assert.ok(pieces.every(part => part.length > 0 && part.length <= 650));
  assert.equal(pieces.join(" "), longReply);
});

test("Pocket starts speaking as the first complete sentence streams in", async () => {
  const feed = new ProgressiveSpeechFeed("pocket");
  const iterator = feed[Symbol.asyncIterator]();
  const first = "I love how this sounds, and I want to talk to you. ";
  feed.append(first + "The second sentence is only partially");
  assert.deepEqual(await iterator.next(), {done:false, value:first.trim()});
  const full = first + "The second sentence is only partially finished, but now it ends.";
  feed.append(" finished, but now it ends.");
  assert.equal(feed.finish(full), true);
  const rest = [];
  for await (const part of { [Symbol.asyncIterator]: () => iterator }) rest.push(part);
  assert.equal([first.trim(), ...rest].join(" "), full.trim());
});

test("Pocket progressive voice sends all text beyond 800 characters when finalized", async () => {
  const long = ("Mikan can talk while her next sentence is still being written. ").repeat(42).trim();
  const feed = new ProgressiveSpeechFeed("pocket");
  feed.append(long.slice(0, 1200));
  assert.equal(feed.finish(long), true);
  const chunks = [];
  for await (const chunk of feed) chunks.push(chunk);
  assert.ok(chunks.length >= 4);
  assert.ok(chunks.every(s => s.length <= 420));
  assert.equal(chunks.join(" "), long);
});


test("asterisk emphasis survives streamed markers without dropped words", async () => {
  const feed = new ProgressiveSpeechFeed("pocket");
  const iterator = feed[Symbol.asyncIterator]();
  const opening = "*My ears twitch happily. I lean closer";
  feed.append(opening);
  feed.append(" and smile.* Hey! How was your morning? I'm glad you're here. ");
  assert.equal(feed.finish(opening + " and smile.* Hey! How was your morning? I'm glad you're here. "), true);
  const actual = [];
  for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) actual.push(chunk);
  assert.equal(actual.join(" "), "My ears twitch happily. I lean closer and smile. Hey! How was your morning? I'm glad you're here.");
});

test("streamed Markdown emphasis retains all speech without a replay", async () => {
  const feed = new ProgressiveSpeechFeed("qwen");
  const first = "Hello there! It's good to see you. ";
  feed.append(first + "*My tail swishes. I");
  const iterator = feed[Symbol.asyncIterator]();
  assert.deepEqual(await iterator.next(), {done:false,value:"Hello there! It's good to see you."});
  const full = first + "*My tail swishes. I wave.* How is your morning going?";
  feed.append(" wave.* How is your morning going?");
  assert.equal(feed.finish(full), true);
  const rest=[];
  for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) rest.push(chunk);
  assert.equal(["Hello there! It's good to see you.",...rest].join(" "), "Hello there! It's good to see you. My tail swishes. I wave. How is your morning going?");
});

test("unfinished Markdown emphasis keeps the spoken words", () => {
  assert.equal(toSpeechText("Hi! *My ears flick and my tail swishes"), "Hi! My ears flick and my tail swishes");
  assert.equal(toSpeechText("*I tilt my head and smile.* Morning!"), "I tilt my head and smile. Morning!");
});


test("Markdown bullet items remain audible when action filters are enabled", () => {
  assert.equal(toSpeechText("* First item\n* Second item"), "First item Second item");
});


test("voice speaks italic emphasis and meow rather than deleting those words", () => {
  assert.equal(toSpeechText("It *really* works! *meow*"), "It really works! meow");
  assert.equal(toSpeechText("I _absolutely_ love it."), "I absolutely love it.");
});

test("progressive voice preserves emphasized words across several partial deltas", async () => {
  const feed = new ProgressiveSpeechFeed("pocket");
  const text = "It is *really* working! *meow* I am so happy to hear your voice now.";
  for (const part of ["It is *rea", "lly* working! *me", "ow* I am so happy to hear your voice now."]) feed.append(part);
  assert.equal(feed.finish(text), true);
  const chunks=[];
  for await (const chunk of feed) chunks.push(chunk);
  assert.equal(chunks.join(" "), "It is really working! meow I am so happy to hear your voice now.");
});


test("narrated actions are omitted from normal replies without flattening dialogue", () => {
  for (const input of [
    "*My orange ears perk up immediately, and my tail gives a happy little wag against your desk as I stretch.* Good morning!",
    "*My ears twitch as I listen, tail curling around your wrist in a supportive loop.* Good morning!",
    "*nuzzles cheek affectionately against your arm* Good morning!",
    "*giggles, eyes sparkling with amusement* Good morning!",
    "*I lean forward slightly, resting my chin on my hand, eyes focused on you.* Good morning!",
    "*My amber eyes light up with curiosity.* Good morning!",
    "*I scratch my ear and tilt my head.* Good morning!",
  ]) assert.equal(stripNarratedActions(input), "Good morning!", input);
});

test("vocalizations and literal asterisk emphasis survive", () => {
  const value="I *really* love that! *meow* That's **very** sweet. _Absolutely_.";
  assert.equal(stripNarratedActions(value),value);
  assert.equal(toSpeechText(stripNarratedActions(value)),"I really love that! meow That's very sweet. Absolutely.");
  assert.equal(stripNarratedActions("*I absolutely love that!*"), "*I absolutely love that!*");
  assert.equal(stripNarratedActions("*purr*"), "*purr*");
  assert.equal(stripNarratedActions("**My tail swishes**"), "**My tail swishes**");
});

test("roleplay is explicitly enabled, not inferred from italic emphasis", () => {
  assert.equal(roleplayActive("Good morning!"),false);
  assert.equal(roleplayActive("*meow*"),false);
  assert.equal(roleplayActive("*really* fantastic"),false);
  assert.equal(roleplayActive("Let's roleplay a fantasy scene"),true);
  assert.equal(roleplayActive("*I lean closer and smile.*"),true);
  assert.equal(roleplayActive("Hello",[{role:"user",content:"Let's roleplay a fantasy scene"}]),true);
  assert.equal(roleplayActive("Stop roleplay",[{role:"user",content:"Let's roleplay a fantasy scene"}]),false);
  const filter=new NarrationFilter(false);
  assert.equal(filter.append("*I lean closer.* Hi!"),"*I lean closer.* Hi!");
  assert.equal(filter.finish(),"*I lean closer.* Hi!");
});

test("streamed stage descriptions do not appear in chat or auto speech", async () => {
  const pieces=["*My ears", " twitch and my", " tail swishes.*", " Hey! ", "I *really* am ", "here. *me", "ow*"];
  const unfiltered=pieces.join("");
  const cleaned=stripNarratedActions(unfiltered);
  assert.equal(cleaned,"Hey! I *really* am here. *meow*");
  const filter=new NarrationFilter();
  const spoken=new ProgressiveSpeechFeed("pocket");
  const visible=[];
  for (const part of pieces) {
    const delta=filter.append(part);
    visible.push(delta);
    spoken.append(delta);
  }
  assert.equal(visible.join("").trim(),cleaned);
  assert.equal(filter.finish(),cleaned);
  assert.equal(spoken.finish(cleaned),true);
  const chunks=[];
  for await (const chunk of spoken) chunks.push(chunk);
  assert.equal(chunks.join(" "),"Hey! I really am here. meow");
});

test("stage filter does not break Markdown lists or basic programming text", () => {
  const sample="* First option\n* Second option\n\nUse 2 * 3 or **bold** for emphasis.";
  assert.equal(stripNarratedActions(sample),sample);
  assert.equal(isNarratedAction("meow"),false);
  assert.equal(isNarratedAction("really"),false);
});

test("Mikan's desk-poking stage directions never appear in ordinary chat or Pocket audio",async()=>{
  const input="Well, well! *sits on your desk and pokes your shoulder with a paw* Since you like strategy games, let's talk.";
  const expected="Well, well! Since you like strategy games, let's talk.";
  assert.equal(stripNarratedActions(input), expected);
  assert.equal(isNarratedAction("sits on your desk and pokes your shoulder with a paw"), true);
  const textStream = new NarrationFilter();
  const feed = new ProgressiveSpeechFeed("pocket");
  for(const delta of ["Well, well! *sit","s on your desk and po","kes your shoulder with a paw* Since you like strategy games, let's talk."]){
    feed.append(textStream.append(delta));
  }
  const cleaned=textStream.finish();
  assert.equal(cleaned,expected);
  assert.equal(feed.finish(cleaned),true);
  const spoken=[];
  for await(const chunk of feed)spoken.push(chunk);
  assert.equal(spoken.join(" "),expected);
});
test("stage-direction filtering preserves legitimate emphasis and deliberate roleplay",()=>{
  assert.equal(stripNarratedActions("That's *really* good. *meow*"),"That's *really* good. *meow*");
  assert.equal(stripNarratedActions("*sits beside you* Hello!"),"Hello!");
  assert.equal(roleplayActive("Let's roleplay a cozy catgirl scene"),true);
  const f=new NarrationFilter(false);
  assert.equal(f.append("*sits beside you* Hello!"),"*sits beside you* Hello!");
});

test("old tail-thump and smile stage directions are not read aloud",()=>{
  assert.equal(stripNarratedActions("*my tail gives a happy little thump against your leg* Hey!"),"Hey!");
  assert.equal(stripNarratedActions("*smiles sweetly* How can I help?"),"How can I help?");
  assert.equal(toSpeechText(stripNarratedActions("*winks at you* Hello!")),"Hello!");
  assert.equal(stripNarratedActions("That is *really wonderful*."),"That is *really wonderful*.");
});

test("physical stage descriptions with unfamiliar verbs are removed in streaming and TTS",async()=>{
  const examples=[
    "*My tail wraps gently around your arm*",
    "*Her fluffy ears pirouette into orbit*",
    "*A tiny orange paw transforms into a tap-dancing machine*",
    "*My striped tail invents an entirely new yoga pose*",
    "*She gracefully glides beside you*",
    "*Performing a ridiculous cartwheel around your chair*"
  ];
  for(const action of examples){
    assert.equal(stripNarratedActions("Hello! "+action+" I'm here."),"Hello! I'm here.",action);
    const filter=new NarrationFilter();
    let chunks="";
    for(const token of ["Hello! "+action.slice(0,5),action.slice(5,18),action.slice(18)+" I'm here."])
      chunks+=filter.append(token);
    assert.equal(filter.finish(),"Hello! I'm here.",action);
  }
  assert.equal(stripNarratedActions("I *really* like *black metal*."),"I *really* like *black metal*.");
  assert.equal(stripNarratedActions("The song *My Tail* is funny."),"The song *My Tail* is funny.");
  assert.equal(stripNarratedActions("The *red sky* looked beautiful."),"The *red sky* looked beautiful.");
});
