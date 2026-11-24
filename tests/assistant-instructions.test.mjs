import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assistantTurnInstructionParts,joinAssistantInstructionParts } from "../src/assistant-instructions.ts";
import { DEFAULT_COMMUNICATION } from "../src/communication-preferences.ts";
import { DEFAULT_PERSONALITY } from "../src/personality.ts";

const settings={
  systemPrompt:"You are a precise archival assistant, named Archivist.",
  communication:{...DEFAULT_COMMUNICATION,addressMode:"neutral",replyLength:"detailed",
    followUps:"natural",customGuidance:"No cat jokes or terms of endearment."},
  personality:{...DEFAULT_PERSONALITY,playfulness:0,flirtiness:0,affection:0,sass:0,energy:0},
  researchMode:"simple"
};
const now=new Date("2026-11-17T21:00:00.000Z");
const history=[{role:"user",content:"Which version shipped?"}];

test("production and Brain Lab build exactly the same operational and voice instruction sections",()=>{
  const input={settings,question:"Did that version change AMD support?",history,
    allowRoleplay:false,researchActive:true,publicWebRequested:true,
    plannedPublicSearch:true,now};
  const desktop=assistantTurnInstructionParts(input);
  const lab=assistantTurnInstructionParts({...input});
  assert.deepEqual(lab,desktop);
  assert.match(joinAssistantInstructionParts(desktop),/archival assistant/);
  assert.match(joinAssistantInstructionParts(desktop),/No cat jokes/);
  assert.match(joinAssistantInstructionParts(desktop),/CONVERSATION STATE/);
  assert.match(joinAssistantInstructionParts(desktop),/HONEST UNCERTAINTY/);
  assert.doesNotMatch(joinAssistantInstructionParts(desktop),/You are Mikan/);
  assert.doesNotMatch(joinAssistantInstructionParts(desktop),/Stay expressive, witty, playful and affectionate/);
});

test("only environment data differs between production and isolated test, not shared rules",()=>{
  const core=assistantTurnInstructionParts({settings,question:"Hello",history,
    allowRoleplay:false,researchActive:false,publicWebRequested:false,
    plannedPublicSearch:false,now});
  const production=joinAssistantInstructionParts(core,["REAL MEMORY: fact shared by owner."]);
  const lab=joinAssistantInstructionParts(core,["ISOLATED BRAIN LAB: synthetic fact only."]);
  assert.ok(production.includes(core.beforeContext[0])&&lab.includes(core.beforeContext[0]));
  assert.ok(production.includes(core.afterContext.at(-1))&&lab.includes(core.afterContext.at(-1)));
  assert.match(lab,/ISOLATED BRAIN LAB/);
  assert.doesNotMatch(production,/ISOLATED BRAIN LAB/);
});

test("planning but not executing a web search carries the SAME caution into either mode",()=>{
  const input={settings,question:"Latest official release?",history,allowRoleplay:false,
    researchActive:true,publicWebRequested:false,plannedPublicSearch:false,
    plannedButNotExecuted:true,now};
  const note=joinAssistantInstructionParts(assistantTurnInstructionParts(input));
  assert.match(note,/public search was planned but NOT executed/);
  assert.match(note,/Do not present unverified titles/);
});

test("both runtime entry points call the common builder and native source-reading engine",()=>{
  const desktop=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  const lab=readFileSync(new URL("../src/brain-eval-manager.ts",import.meta.url),"utf8");
  const rust=readFileSync(new URL("../src-tauri/src/lib.rs",import.meta.url),"utf8");
  for(const code of [desktop,lab]){
    assert.match(code,/assistantTurnInstructionParts\(/);
    assert.match(code,/joinAssistantInstructionParts\(/);
    assert.match(code,/"chat_stream"/);
  }
  assert.match(rust,/simple_research::evidence_instruction\(\)/);
  assert.match(rust,/simple_research::evidence_data\(/);
  assert.doesNotMatch(lab,/Use the conversation context consistently; do not invent unknown facts/);
});

test("a single primary model receives a character reminder after context",()=>{
  const parts=assistantTurnInstructionParts({
    settings,question:"I'm comparing cloud LLMs.",history:[],
    allowRoleplay:false,researchActive:false,publicWebRequested:false,
    plannedPublicSearch:false,now
  });
  const joined=joinAssistantInstructionParts(parts,["IMPORTED CONTEXT: unrelated data"]);
  assert.match(parts.afterContext.at(-1),/VOICE CONTINUITY:/);
  assert.match(joined,/not an anonymous technical consultant/);
  assert.ok(joined.indexOf("IMPORTED CONTEXT:")<joined.lastIndexOf("VOICE CONTINUITY:"));
  assert.doesNotMatch(joined,/You are Mikan/);
});

test("casual observations receive non-refusal scope; real questions and tasks do not",()=>{
  const base={settings,history:[{role:"user",content:"I like this game."}],
    allowRoleplay:false,researchActive:false,publicWebRequested:false,
    plannedPublicSearch:false,now};
  const smallTalk=joinAssistantInstructionParts(
    assistantTurnInstructionParts({...base,question:"That song has some killer riffs."}));
  assert.match(smallTalk,/CASUAL RESPONSE, NOT A FACT QUIZ/);
  assert.match(smallTalk,/NO EMPTY DISCLAIMER/);
  assert.match(smallTalk,/VOICE CONTINUITY/);
  for(const question of [
    "What actually happens in chapter six?",
    "Tell me which medications are safe.",
    "Can you fix this code?",
    "We should merge that PR."
  ]){
    const detailed=joinAssistantInstructionParts(
      assistantTurnInstructionParts({...base,question}));
    assert.doesNotMatch(detailed,/CASUAL RESPONSE, NOT A FACT QUIZ/,question);
    assert.match(detailed,/HONEST UNCERTAINTY/,question);
  }
});
