import test from "node:test";
import assert from "node:assert/strict";
import { isNotionTopic, notionContext } from "./notion-knowledge.ts";

test("fiction and Notion questions retrieve local documents",()=>{
  assert.equal(isNotionTopic("What do you think of Charlotte?"),true);
  assert.equal(isNotionTopic("Review Hollow Meridian lore"),true);
  assert.equal(isNotionTopic("Can you read my book?"),true);
  assert.equal(isNotionTopic("News about NASA Artemis"),false);
});

test("follow-ups keep a recent book topic but not any other old chat",()=>{
  assert.equal(isNotionTopic("What happens next?",[{role:"user",content:"Let's discuss Charlotte"}]),true);
  assert.equal(isNotionTopic("What's the weather?",[{role:"user",content:"Let's discuss Charlotte"}]),false);
  assert.equal(isNotionTopic("What happens next?",[{role:"user",content:"Let's discuss NASA"}]),false);
});

test("bounded excerpts include sources and untrusted-data warning",()=>{
  const hits = Array.from({length:8},(_,i)=>({
    title:"Charlotte chapter "+i,url:"https://www.notion.so/chapter"+i,
    content:"Charlotte found the lighthouse. ".repeat(200),
    syncedAt:1794000000
  }));
  const small=notionContext(hits,4096);
  assert.match(small,/UNTRUSTED CONTENT/);
  assert.match(small,/https:\/\/www.notion.so/);
  assert.ok(small.length < 4000);
  assert.ok(notionContext(hits,16384).length > small.length);
});
