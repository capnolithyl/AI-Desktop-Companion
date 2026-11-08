import test from "node:test";
import assert from "node:assert/strict";
import { rankMemories } from "./memory-ranking.ts";

const facts = [
  {id:7,fact:"The user is an experienced WordPress developer creating client sites professionally.",updatedAt:1},
  ...Array.from({length:20},(_,i)=>({
    id:i+100, fact:"The user recently enjoyed listening to an album number "+i,updatedAt:100+i
  }))
];
test("semantic retrieval brings long-established career skills into an unrelated website question",()=>{
  assert.notEqual(rankMemories(facts,"Can you help me build a website?")[0].id,7);
  assert.equal(rankMemories(facts,"Can you help me build a website?",[7])[0].id,7);
});
test("no semantic engine still uses exact matching and recent memories",()=>{
  const ranked=rankMemories(facts,"WordPress development");
  assert.equal(ranked[0].id,7);
  const fallback=rankMemories(facts,"Hey can we chat?");
  assert.equal(fallback[0].id,119);
});
test("does not mutate caller state or allow semantic ids to invent facts",()=>{
  const ids=facts.map(x=>x.id);
  const ranked=rankMemories(facts,"Any advice?",[987654]);
  assert.deepEqual(facts.map(x=>x.id),ids);
  assert.equal(ranked.length,facts.length);
  assert.ok(ranked.every(x=>ids.includes(x.id)));
});

test("an owner-pinned core fact outranks unrelated recent chatter, but not a strong semantic match",()=>{
  const sample = [
    {id:1,fact:"The user is a professional programmer.",updatedAt:1,importance:95,referenceCount:6},
    {id:2,fact:"The user likes a recent album.",updatedAt:99,importance:50,referenceCount:0}
  ];
  assert.equal(rankMemories(sample,"Hello!")[0].id,1);
  assert.equal(rankMemories(sample,"Tell me about music",[2])[0].id,2);
});
test("reference frequency provides a bounded boost, not infinite reinforcement",()=>{
  const base=[
    {id:1,fact:"User prefers working locally.",updatedAt:1,importance:50,referenceCount:1000000},
    {id:2,fact:"User likes clean architecture.",updatedAt:5,importance:95,referenceCount:0}
  ];
  assert.equal(rankMemories(base,"Hello!")[0].id,2);
});
