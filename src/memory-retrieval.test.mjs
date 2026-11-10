import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMemoryRerankPrompt, parseMemoryRerankIds, selectHybridMemoryIds
} from "./memory-retrieval.ts";
import { prioritizeCoreMemories } from "./memory-ranking.ts";
import { shouldIncludeCharacterCanon } from "./character-canon-routing.ts";

const facts=[
  {id:41,fact:"The user's full name is Marcus Borger.",updatedAt:1,importance:95,category:"profile",tags:["name"]},
  {id:12,fact:"The user is an experienced WordPress developer.",updatedAt:2,category:"work",tags:["wordpress","career"]},
  {id:13,fact:"The user develops custom themes using React and PHP for clients.",updatedAt:3,category:"work",tags:["development","client work"]},
  {id:14,fact:"The user already operates a metal music review website called Runagaldr.",updatedAt:4,category:"projects",tags:["metal","reviews"]},
  {id:15,fact:"The user enjoys black metal.",updatedAt:5,category:"preferences",tags:["music","metal"]},
  {id:16,fact:"The user was born in Germany.",updatedAt:6,category:"profile",tags:["germany"]},
];
test("whole word fallback does not interpret any as Germany or was as birthplace",()=>{
  const anyIdeas=prioritizeCoreMemories(facts,"Any ideas?",[],10).map(f=>f.id);
  assert.deepEqual(anyIdeas,[41]);
  const itCalled=prioritizeCoreMemories(facts,"What was it called?",[],10).map(f=>f.id);
  assert.deepEqual(itCalled,[41]);
});
test("local AI reranker connects freelancing with WordPress skills absent keyword overlap",async()=>{
  let prompt="";
  const result=await selectHybridMemoryIds(
    facts,"I'm thinking about starting a freelance business. What services should I offer?",
    [{id:16,score:0.41},{id:14,score:0.39}],10,
    async input => {prompt=input;return JSON.stringify({ids:[12,13]})}
  );
  assert.equal(result.mode,"ai-reranked");
  assert.deepEqual(result.ids,[41,12,13]);
  assert.ok(prompt.includes("experienced WordPress developer"));
  assert.ok(prompt.includes("freelance business"));
  assert.equal(result.candidateCount,facts.length);
});
test("music recommendations retrieve user music preferences rather than unrelated Mikan tastes",async()=>{
  const picked=await selectHybridMemoryIds(facts,"Recommend me something to listen to.",[],10,
    async()=>'{ "ids": [15] }');
  assert.deepEqual(picked.ids,[41,15]);
});
test("untrusted AI result cannot inject unknown IDs or duplicate records",()=>{
  const allowed=new Set([12,13]);
  assert.deepEqual(parseMemoryRerankIds('{"ids":[12,9999,12,13]}',allowed,10),[12,13]);
  assert.equal(parseMemoryRerankIds('{"ids":["12"]}',allowed,10),null);
  assert.equal(parseMemoryRerankIds('no json',allowed,10),null);
  assert.deepEqual(parseMemoryRerankIds('{"ids":[]}',allowed,10),[]);
});
test("invalid AI JSON falls back to safe exact matching, and small-talk skips rerank",async()=>{
  const failing=await selectHybridMemoryIds(facts,"Any ideas?",[],10,async()=>'{broken');
  assert.equal(failing.mode,"fallback");
  assert.deepEqual(failing.ids,[41]);
  const greeting=await selectHybridMemoryIds(facts,"Good morning!",[],10,
    async()=>{throw Error("Must not rerank greetings")});
  assert.equal(greeting.mode,"small-talk");
  assert.deepEqual(greeting.ids,[41]);
});
test("large collections shortlist candidates, do not send thousands of facts to the model",()=>{
  const many=Array.from({length:2000},(_,i)=>({
    id:i+100,fact:"The user has a distinct persistent activity number "+i,
    updatedAt:i,category:"other",tags:[]
  }));
  const prompt=buildMemoryRerankPrompt("Tell me about my activities",many.slice(0,60),10);
  assert.ok(prompt.length<14500);
});

test("Mikan's tastes are available for questions about her but not generic user recommendations",()=>{
  assert.equal(shouldIncludeCharacterCanon("Recommend me something to listen to"),false);
  assert.equal(shouldIncludeCharacterCanon("Do you think I should try a new hobby?"),false);
  assert.equal(shouldIncludeCharacterCanon("Mikan, what should I listen to?"),false);
  assert.equal(shouldIncludeCharacterCanon("What's your favorite music genre?"),true);
  assert.equal(shouldIncludeCharacterCanon("Do you like synthwave?"),true);
  assert.equal(shouldIncludeCharacterCanon("Mikan, what is your personality like?"),true);
});
