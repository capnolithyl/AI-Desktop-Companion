import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assistantVoiceGuidance } from "../src/assistant-voice.ts";
import { DEFAULT_COMMUNICATION } from "../src/communication-preferences.ts";
import { DEFAULT_PERSONALITY } from "../src/personality.ts";
import { communicationGuidance } from "../src/communication-preferences.ts";
import { personalityGuidance } from "../src/personality.ts";

test("same user-customized prompts, communication and traits are passed through verbatim",()=>{
  const settings={
    systemPrompt:"You are Clockwork, a precise librarian who NEVER uses pet names.",
    communication:{...DEFAULT_COMMUNICATION,addressMode:"neutral",
      customGuidance:"Keep everything brisk and academic."},
    personality:{...DEFAULT_PERSONALITY,playfulness:0,flirtiness:0}};
  const voice=assistantVoiceGuidance(settings);
  assert.ok(voice.includes("Clockwork"));
  assert.ok(voice.includes("Keep everything brisk and academic."));
  assert.ok(voice.includes(communicationGuidance(settings.communication)));
  assert.ok(voice.includes(personalityGuidance(settings.personality)));
  assert.ok(voice.includes("No narrated actions"));
  assert.equal(assistantVoiceGuidance(settings,true).includes("REPLY FORMAT:"),false);
});

test("desktop chat, Brain Lab and style pass all use the same voice builder",()=>{
  const desktop=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  const lab=readFileSync(new URL("../src/brain-eval-manager.ts",import.meta.url),"utf8");
  assert.match(desktop,/assistantVoiceGuidance\(settings,allowRoleplay\)/);
  assert.match(desktop,/persona:assistantVoiceGuidance\(settings,allowRoleplay\)/);
  assert.match(lab,/assistantVoiceGuidance\(settings,roleplayAllowed\)/);
  assert.match(lab,/persona:assistantVoiceGuidance\(settings,roleplayAllowed\)/);
});

test("personality guidance adds natural character voice to technical answers without forcing catchphrases",()=>{
  const settings={
    systemPrompt:"You are Clockwork, a cheerful, sharp-witted librarian.",
    communication:{...DEFAULT_COMMUNICATION,followUps:"natural"},
    personality:{...DEFAULT_PERSONALITY}
  };
  const voice=assistantVoiceGuidance(settings);
  assert.match(voice,/Clockwork, a cheerful/);
  assert.match(voice,/technical work/);
  assert.match(voice,/casual chat/);
  assert.match(voice,/never trade factual accuracy/i);
  assert.doesNotMatch(voice,/You are Mikan/);
});
