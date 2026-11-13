import test from "node:test";
import assert from "node:assert/strict";
import {buildInterestContext} from "./interest-context.ts";
function item(id,name,kind="band",status="favorite",notes="",tags=[]) {
  return {id,name,kind,status,rating:null,notes,tags};
}
test("the interest audit reflects exact lines included in the prompt",()=>{
  const candidates=[item(17,"Shadows Fall","band","favorite","Metalcore",["metal"]),item(18,"Another band")];
  const result=buildInterestContext(candidates);
  assert.equal(result.included.length,2);
  assert.deepEqual(result.included.map(i=>i.id),[17,18]);
  assert.equal(result.included[0].promptLine,
    "- [band, favorite] Shadows Fall: Metalcore (#metal)");
  for(const line of result.included) assert.ok(result.text.includes(line.promptLine));
  assert.equal(result.suppressedForCharacter,false);
});
test("omitted records are never falsely reported as injected",()=>{
  const candidates=Array.from({length:22},(_,i)=>item(i+1,"Band "+i));
  const result=buildInterestContext(candidates);
  assert.equal(result.included.length,18);
  assert.equal(result.included.at(-1).id,18);
  assert.equal(result.text.includes("Band 21"),false);
});
test("owner interests are suppressed during Mikan character-canon turns",()=>{
  const result=buildInterestContext([item(17,"Shadows Fall")],true);
  assert.equal(result.text,"");
  assert.deepEqual(result.included,[]);
  assert.equal(result.suppressedForCharacter,true);
});
test("an oversized entry does not appear as a prompt match",()=>{
  const result=buildInterestContext([item(17,"Z".repeat(2305))]);
  assert.equal(result.text,"");
  assert.deepEqual(result.included,[]);
});

test("duplicate backend records produce one context line and one audit entry",()=>{
  const saved=item(23,"Shadows Fall");
  const result=buildInterestContext([saved,saved,item(50,"Thoughts Without Words","song")]);
  assert.deepEqual(result.included.map(i=>i.id),[23,50]);
  assert.match(result.text,/\[song, favorite\] Thoughts Without Words/);
});
