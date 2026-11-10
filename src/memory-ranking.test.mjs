import test from "node:test";
import assert from "node:assert/strict";
import { rankMemories, prioritizeCoreMemories, filterStaleActivities, strongSemanticIds } from "./memory-ranking.ts";

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

test("one pinned fact is always reserved at 4k, two at larger contexts",()=>{
 const stored=[
  {id:1,fact:"User is an experienced WordPress developer",updatedAt:1,importance:95},
  {id:2,fact:"User frequently writes metal music",updatedAt:2,importance:95},
  {id:3,fact:"User likes the latest album",updatedAt:3,importance:50},
  {id:4,fact:"User likes recent recordings",updatedAt:4,importance:50},
  {id:5,fact:"User likes another record",updatedAt:5,importance:50}
 ];
 const small=prioritizeCoreMemories(stored,"any recent albums?",[3,4,5],3).slice(0,3);
 assert.equal([1,2].filter(id=>small.some(x=>x.id===id)).length,1);
 const large=prioritizeCoreMemories(stored,"any recent albums?",[3,4,5],5).slice(0,5);
 assert.ok(large.some(x=>x.id===1));
 assert.ok(large.some(x=>x.id===2));
});

test("irrelevant personal memories no longer flood generic chat prompts",()=>{
  const stored=[
    {id:1,fact:"The user loves black metal",updatedAt:20,importance:50},
    {id:2,fact:"The user is a developer",updatedAt:21,importance:50},
    {id:3,fact:"The user is writing a book",updatedAt:22,importance:50}
  ];
  assert.deepEqual(prioritizeCoreMemories(stored,"Good morning!",[],5),[]);
  assert.deepEqual(prioritizeCoreMemories(stored,"What is a good black metal band?",[],5).map(x=>x.id),[1]);
  assert.deepEqual(prioritizeCoreMemories(stored,"Can you help me with a website?",[2],5).map(x=>x.id),[2]);
  assert.deepEqual(prioritizeCoreMemories(stored,"How are you?",[3],5).map(x=>x.id),[3]);
});

test("old testing snapshots are retained but not treated as current facts",()=>{
  const now=2_000_000_000;
  const facts=[
    {id:1,fact:"The user is testing a new feature",updatedAt:now-30*86400,importance:50},
    {id:2,fact:"The user is working on fixing a bug",updatedAt:now-30*86400,importance:50},
    {id:3,fact:"The user is writing a book",updatedAt:now-90*86400,importance:50},
    {id:4,fact:"The user has enabled live vision",updatedAt:now-1*86400,importance:50}
  ];
  assert.deepEqual(filterStaleActivities(facts,"What's happening?",now).map(x=>x.id),[3,4]);
  assert.deepEqual(filterStaleActivities(facts,"What was I testing last month?",now).map(x=>x.id),[1,2,3,4]);
  assert.equal(facts.length,4,"never delete facts from the owner's archive");
});

test("weak nearest-neighbor matches never become assumed personal context",()=>{
  const hits=[{id:1,score:0.38},{id:2,score:0.45},{id:3,score:null}];
  assert.deepEqual(strongSemanticIds(hits,"Can we talk about something else?"),[]);
  assert.deepEqual(strongSemanticIds([{id:8,score:0.8}],"Good morning!"),[]);
  assert.deepEqual(strongSemanticIds([{id:7,score:0.81},{id:8,score:0.63},{id:9,score:0.14}],"Can you help build a website?"),[7]);
  assert.deepEqual(strongSemanticIds([{id:7,score:0.73}],"What do you remember about my work?"),[7]);
});


test("owner categories and tags make otherwise vague facts relevant without Mem0",()=>{
  const sample=[
    {id:1,fact:"The user keeps a regular practice schedule",updatedAt:10,category:"interests",tags:["guitar","music"]},
    {id:2,fact:"The user has a hobby",updatedAt:30,category:"other",tags:[]}
  ];
  assert.deepEqual(prioritizeCoreMemories(sample,"Can we discuss guitar?",[],5).map(x=>x.id),[1]);
  assert.deepEqual(prioritizeCoreMemories(sample,"What about my interests?",[],5).map(x=>x.id),[1]);
  assert.deepEqual(prioritizeCoreMemories(sample,"Good morning!",[],5),[]);
});
