import test from "node:test";
import assert from "node:assert/strict";
import { retryTarget } from "./retry-response.ts";

const messages = [
 {id:"u1",role:"user",content:"Tell me about Maximum the Hormone",createdAt:1},
 {id:"a1",role:"assistant",content:"They're a Japanese band.",createdAt:2},
 {id:"u2",role:"user",content:"What's their latest release?",createdAt:3},
 {id:"a2",role:"assistant",content:"Half an ans",failed:true,createdAt:4,
   sources:[{title:"Discography",url:"https://example.org/discography",content:"source text",engine:"Tavily"}]}
];
test("retry reuses exactly one user and the existing failed assistant id",()=>{
 const target=retryTarget("thread",messages,"a2");
 assert.equal(target?.threadId,"thread");
 assert.equal(target?.user.id,"u2");
 assert.equal(target?.assistant.id,"a2");
 assert.equal(target?.history.length,2);
 assert.equal(target?.assistant.sources?.length,1);
});
test("never regenerate a successful answer, a previous turn, or a user turn",()=>{
 assert.equal(retryTarget("thread",messages,"a1"),null);
 assert.equal(retryTarget("thread",messages,"u2"),null);
 assert.equal(retryTarget("thread",messages.map(m=>m.id==="a2"?{...m,failed:false,content:"Done"}:m),"a2"),null);
});
test("a persisted empty assistant placeholder can be retried after process death",()=>{
 const rows=[{id:"u1",role:"user",content:"Question",createdAt:1},
   {id:"a1",role:"assistant",content:"",createdAt:2}];
 assert.equal(retryTarget("thread",rows,"a1")?.user.content,"Question");
});
