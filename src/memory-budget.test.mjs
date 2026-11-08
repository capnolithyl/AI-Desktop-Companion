import test from "node:test";
import assert from "node:assert/strict";
import { memoryBudget, sessionMemoryContext } from "./memory-budget.ts";

test("Utsuwa-style budgets scale working memory and fact counts with the configured window",()=>{
 assert.deepEqual(memoryBudget(4096),{recentTurns:6,maxFacts:3,factChars:820,sessionChars:380});
 assert.equal(memoryBudget(8192).maxFacts,5);
 assert.equal(memoryBudget(16384).recentTurns,20);
 assert.equal(memoryBudget(32768).maxFacts,10);
 assert.equal(memoryBudget(null).maxFacts,5);
});
const recent=[
 {conversationId:"old",summary:'- User discussed building a WordPress plugin [user said: "I built a WordPress plugin"]',
  lastMessageRowid:5,updatedAt:100},
 {conversationId:"empty",summary:"- No durable session notes",lastMessageRowid:7,updatedAt:200}
];
test("summaries are continuity context not verified facts",()=>{
 const v=sessionMemoryContext("Can we continue from last time?",null,recent,memoryBudget(8192),300);
 assert.match(v,/WordPress plugin/);
 assert.match(v,/NOT VERIFIED PERSONAL FACTS/);
 assert.doesNotMatch(v,/No durable/);
});
test("current long-session context survives truncation and avoids irrelevant fresh summaries",()=>{
 const own={conversationId:"current",summary:'- User is planning an app [user said: "I am planning an app"]',lastMessageRowid:50,updatedAt:290};
 const v=sessionMemoryContext("What now?",own,recent,memoryBudget(4096),300);
 assert.match(v,/THIS CONVERSATION/);
 assert.doesNotMatch(v,/EARLIER SESSION/);
});
test("session notes have bounded length and empty checkpoints are hidden",()=>{
 const empty={conversationId:"current",summary:"- No durable session notes",updatedAt:50,lastMessageRowid:2};
 const v=sessionMemoryContext("Hello",empty,[],memoryBudget(4096),100);
 assert.equal(v,"");
 const large={...empty,summary:"- "+"a".repeat(3000)};
 const v2=sessionMemoryContext("Continue",large,[],memoryBudget(4096),100);
 assert.ok(v2.length<650);
});
