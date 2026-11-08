import test from "node:test";
import assert from "node:assert/strict";
import { sessionSummaryPrompt, mergeSessionSummary } from "./session-memory.ts";
const candidate={
 conversationId:"11111111-1111-4111-8111-111111111111",
 previousSummary:"",
 lastMessageRowid:40,
 expectedPreviousRowid:0,
 userMessages:[
  "I built a WordPress plugin for our church sites last month",
  "I'm working on Mikan's memory system and want it to understand my coding experience",
  "Any updates about that Japanese band?"
 ]
};
test("locally generated session note requires an exact user-authored quote",()=>{
 const result=mergeSessionSummary(candidate,JSON.stringify({notes:[
  {note:"User built a WordPress plugin",evidence:"I built a WordPress plugin"},
  {note:"User is learning Rust",evidence:"I work as a professional Rust engineer"}
 ]}));
 assert.match(result,/WordPress plugin/);
 assert.doesNotMatch(result,/Rust/);
 assert.match(sessionSummaryPrompt(candidate),/ONLY JSON/);
 assert.match(sessionSummaryPrompt(candidate),/USER MESSAGES/);
});
test("no assistant claims or invented memories survive bad JSON",()=>{
 assert.equal(mergeSessionSummary(candidate,"The user is a singer"),"");
 assert.equal(mergeSessionSummary(candidate,'{"notes":[{"note":"User loves sushi","evidence":"I love sushi very much"}]}'),"");
});
test("carry grounded prior session notes forward but avoid duplicates or credentials",()=>{
 const c={...candidate,previousSummary:'- User built a WordPress plugin [user said: "I built a WordPress plugin"]'};
 const result=mergeSessionSummary(c,JSON.stringify({notes:[
  {note:"User built a WordPress plugin",evidence:"I built a WordPress plugin"},
  {note:"User shared their password",evidence:"password: abcdef123456"}
 ]}));
 assert.equal(result.split("\n").length,1);
 assert.doesNotMatch(result,/password/i);
});
test("summaries are capped to protect context size",()=>{
 const old={...candidate,previousSummary:Array.from({length:40},(_,i)=>'- Topic '+i+' '.repeat(5)).join("\n")};
 const result=mergeSessionSummary(old,'{"notes":[]}');
 assert.ok(result.length<1800);
 assert.ok(result.split("\n").length<=10);
});
