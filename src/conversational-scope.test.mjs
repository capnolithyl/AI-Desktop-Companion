import test from "node:test";
import assert from "node:assert/strict";
import {isCasualObservation,CASUAL_OBSERVATION_REPLY_CONTRACT} from "./conversational-scope.ts";

const plain={researchActive:false,roleplay:false,publicWebRequested:false};
test("recognizes broad, topic-agnostic social reactions without inventing content",()=>{
  for(const text of [
    "Absolutely. Kingdom of Tyrants is fucking awesome too.",
    "It's insane to see their evolution from that old record.",
    "Fire Emblem has such a good cast of characters.",
    "My dog is such a goofball.",
    "That UI looks much better already!"
  ])assert.equal(isCasualObservation(text,plain),true,text);
});
test("never narrows questions, tasks, web research or potentially consequential requests",()=>{
  for(const text of [
    "What's actually in chapter six?",
    "Who wrote this song",
    "Tell me how that works.",
    "Please fix that CSS.",
    "I want you to make the button smaller.",
    "We should merge those PRs.",
    "Let's try another approach.",
    "Can you help me with my dog?",
    "Give me feeding advice",
    "/help"
  ])assert.equal(isCasualObservation(text,plain),false,text);
  assert.equal(isCasualObservation("That song is great",{...plain,researchActive:true}),false);
  assert.equal(isCasualObservation("That song is great",{...plain,roleplay:true}),false);
  assert.equal(isCasualObservation("That song is great",{...plain,publicWebRequested:true}),false);
});
test("non-refusal contract asks for conversational warmth with grounded specificity",()=>{
  assert.match(CASUAL_OBSERVATION_REPLY_CONTRACT,/MATCH EVIDENCE GRANULARITY/);
  assert.match(CASUAL_OBSERVATION_REPLY_CONTRACT,/NO EMPTY DISCLAIMER/);
  assert.match(CASUAL_OBSERVATION_REPLY_CONTRACT,/serious safety risk/);
  assert.doesNotMatch(CASUAL_OBSERVATION_REPLY_CONTRACT,/Kingdom|Fire Emblem|Cattle Decapitation|dog food/i);
});
