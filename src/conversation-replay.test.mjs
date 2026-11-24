import test from "node:test";
import assert from "node:assert/strict";
import {snapshotForReplay} from "./conversation-replay.ts";

test("replay stops before selected answer and never includes future messages",()=>{
  const messages=[
    {id:"a",role:"user",content:"Just Another Body closes Terrasite."},
    {id:"b",role:"assistant",content:"Thanks for the correction!"},
    {id:"c",role:"user",content:"Kingdom is awesome too."},
    {id:"d",role:"assistant",content:"Invented chorus and exact lyric."},
    {id:"e",role:"user",content:"That lyric wasn't in Kingdom."},
    {id:"f",role:"assistant",content:"Oops."}
  ];
  const snap=snapshotForReplay(messages,"d");
  assert.equal(snap.question,"Kingdom is awesome too.");
  assert.equal(snap.original,"Invented chorus and exact lyric.");
  assert.deepEqual(snap.prefix.map(item=>item.content),messages.slice(0,3).map(m=>m.content));
  assert.equal(snap.history.at(-1).content,"Thanks for the correction!");
  assert.ok(!JSON.stringify(snap.prefix).includes("Invented chorus"));
  assert.ok(!JSON.stringify(snap.prefix).includes("That lyric"));
});
test("non-assistant, orphan replies and nonexistent targets cannot be replayed",()=>{
  assert.equal(snapshotForReplay([{id:"b",role:"assistant",content:"Hi"}],"b"),null);
  assert.equal(snapshotForReplay([{id:"a",role:"user",content:"Hi"}],"a"),null);
  assert.equal(snapshotForReplay([{id:"a",role:"user",content:"Hi"}],"z"),null);
});
