import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PERSONAL_DETAIL_GROUNDING_GUIDANCE} from "./personal-grounding.ts";
test("personal grounding protects preferences and possessions without banning playfulness",()=>{
  assert.match(PERSONAL_DETAIL_GROUNDING_GUIDANCE,/owns, wears/);
  assert.match(PERSONAL_DETAIL_GROUNDING_GUIDANCE,/merch or clothing/);
  assert.match(PERSONAL_DETAIL_GROUNDING_GUIDANCE,/I like/);
  assert.match(PERSONAL_DETAIL_GROUNDING_GUIDANCE,/playful possibility/);
});
test("all desktop model providers receive the same owner detail rule",()=>{
  const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
  const instructions=readFileSync(new URL("./assistant-instructions.ts",import.meta.url),"utf8");
  const voice=readFileSync(new URL("./assistant-voice.ts",import.meta.url),"utf8");
  assert.match(app,/assistantTurnInstructionParts\(/);
  assert.match(instructions,/PERSONAL_DETAIL_GROUNDING_GUIDANCE/);
  assert.match(instructions,/assistantVoiceGuidance\(settings,allowRoleplay\)/);
  assert.match(voice,/communicationGuidance\(settings\.communication\)/);
});
