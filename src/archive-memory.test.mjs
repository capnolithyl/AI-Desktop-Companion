import test from "node:test";
import assert from "node:assert/strict";
import { shouldSearchArchive, archiveMemoryContext } from "./archive-memory.ts";
import { memoryBudget } from "./memory-budget.ts";

const hits = [
  {conversationId:"site",title:"Website work",content:"I build websites with WordPress and Gutenberg.",
    createdAt:Date.UTC(2026,8,10)},
  {conversationId:"games",title:"Gaming",content:"I dislike Skyrim but enjoy Fire Emblem.",
    createdAt:Date.UTC(2026,7,10)},
  {conversationId:"music",title:"Recording",content:"I record black metal with Cubase.",
    createdAt:Date.UTC(2026,9,10)}
];

test("past conversations are retrieved for implicit help and explicit recall",()=>{
  assert.equal(shouldSearchArchive("Hey, can you help me build a website?"),true);
  assert.equal(shouldSearchArchive("Do you remember what I said about Skyrim?"),true);
  assert.equal(shouldSearchArchive("What is the capital of Iceland?"),false);
  assert.equal(shouldSearchArchive("Hi!"),false);
  const context=archiveMemoryContext("Can you help me build a website?", hits, memoryBudget(8192));
  assert.match(context,/WordPress and Gutenberg/);
  assert.doesNotMatch(context,/Fire Emblem/);
  assert.match(context,/NOT verified current facts/);
});

test("past chats are not surfaced solely by recency or generic questions",()=>{
  assert.equal(archiveMemoryContext("How is the weather?", hits, memoryBudget(8192)),"");
  assert.equal(archiveMemoryContext("Can you help with my taxes?", hits, memoryBudget(8192)),"");
  const recalled=archiveMemoryContext("Remember what I said about Skyrim?",hits,memoryBudget(8192));
  assert.match(recalled,/dislike Skyrim/);
  assert.doesNotMatch(recalled,/WordPress/);
});

test("historical excerpts are bounded, distinct and resist irrelevant filler",()=>{
  const long=Array.from({length:12},(_,i)=>({
    conversationId:"talk"+i,title:"Old discussion",content:"I discussed my WordPress website: "+("x".repeat(2000)),
    createdAt:Date.UTC(2026,1,i+1)
  }));
  const v=archiveMemoryContext("I need help with WordPress website work",long,memoryBudget(4096));
  assert.ok(v.length<700);
  assert.equal((v.match(/User said:/g)??[]).length<=3,true);
  const same=[{...hits[0],content:hits[0].content+" more"},{...hits[0]}];
  assert.equal((archiveMemoryContext("Help build WordPress websites",same,memoryBudget(16384)).match(/User said:/g)??[]).length,1);
});
