import test from "node:test";
import assert from "node:assert/strict";
import {isModelLedConversation,modelLedWebToolsAllowed,preserveModelLedChatAnswer} from "./model-led-routing.ts";

test("only opt-in NVIDIA uses model-led orchestration",()=>{
  assert.equal(isModelLedConversation({provider:"nvidia",modelLed:true}),true);
  assert.equal(isModelLedConversation({provider:"nvidia",modelLed:false}),false);
  for(const provider of ["local","auto","openrouter","gemini"])
    assert.equal(isModelLedConversation({provider,modelLed:true}),false);
});
test("tool permissions still enforce private-content and owner web opt-ins",()=>{
  assert.equal(modelLedWebToolsAllowed(true,{canPlanPublicWeb:true,blockedReason:null}),true);
  assert.equal(modelLedWebToolsAllowed(true,{canPlanPublicWeb:false,blockedReason:"Automatic web tools disabled"}),false);
  assert.equal(modelLedWebToolsAllowed(true,{canPlanPublicWeb:false,blockedReason:"Attached private material"}),false);
  assert.equal(modelLedWebToolsAllowed(false,{canPlanPublicWeb:true,blockedReason:null}),false);
});
test("casual reply with optional browsing is not overwritten by headline fallback",()=>{
  assert.equal(preserveModelLedChatAnswer(true,"chat",false),true);
  assert.equal(preserveModelLedChatAnswer(true,"research",false),false);
  assert.equal(preserveModelLedChatAnswer(true,"factual",false),false);
  assert.equal(preserveModelLedChatAnswer(true,"chat",true),false);
  assert.equal(preserveModelLedChatAnswer(false,"chat",false),false);
});
