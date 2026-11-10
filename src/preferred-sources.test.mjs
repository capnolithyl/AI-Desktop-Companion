import test from "node:test";
import assert from "node:assert/strict";
import {readSourcePreferences,matchingSourceTopic} from "./preferred-sources.ts";

test("source priorities default to independent topic hints, not a whitelist",()=>{
 const defaults=readSourcePreferences(undefined);
 assert.ok(defaults.some(p=>p.topic==="music"));
 assert.ok(defaults.some(p=>p.topic==="coding"));
 assert.ok(defaults.find(p=>p.topic==="music").domains.includes("metal-archives.com"));
});
test("sanitize owner-edited domains, including URLs, IPv4, duplicates, path-based and spoofed values",()=>{
 const parsed=readSourcePreferences([{topic:"music",cues:["album","album","metal"],
   domains:["https://www.metal-archives.com/","metal-archives.com","evil.com/redirect","127.0.0.1",
     "music.example.org","evil.com:8080"]}]);
 assert.deepEqual(parsed[0].domains,["metal-archives.com","music.example.org"]);
 assert.deepEqual(parsed[0].cues,["album","metal"]);
});
test("topic selection uses cues but never blocks unrelated search",()=>{
 const list=readSourcePreferences(undefined);
 assert.equal(matchingSourceTopic("Recommend an album from a metal band",list),"music");
 assert.equal(matchingSourceTopic("What is the React API?",list),"coding");
 assert.equal(matchingSourceTopic("What kind of gloves work for gardening?",list),undefined);
});
