import test from "node:test";
import assert from "node:assert/strict";
import {characterContinuityContext} from "./character-canon-routing.ts";
const facts=[
  {label:"Favorite music",value:"synthwave and atmospheric black metal",category:"favorites",updatedAt:20},
  {label:"Favorite color",value:"orange",category:"favorites",updatedAt:40},
  {label:"Favorite game",value:"Fire Emblem",category:"favorites",updatedAt:10}
];
test("Mikan's stored music taste is available when the owner discusses a band",()=>{
  const note=characterContinuityContext(facts,"my favorite band is shadows fall");
  assert.match(note,/Favorite music: synthwave and atmospheric black metal/);
  assert.doesNotMatch(note,/Favorite color/);
  assert.doesNotMatch(note,/Favorite game/);
  assert.match(note,/NEVER the owner/);
});
test("character canon does not pollute unrelated owner prompts or duplicate direct questions",()=>{
  assert.equal(characterContinuityContext(facts,"Where did I leave my keys?"),"");
  assert.equal(characterContinuityContext(facts,"What music do you like?"),"");
});
test("even massive character collections remain bounded",()=>{
  const entries=Array.from({length:100},(_,i)=>({
    label:"Favorite album "+i,value:"album "+i,category:"favorites",updatedAt:i
  }));
  const text=characterContinuityContext(entries,"Let's talk about albums");
  assert.ok(text.length<1500);
  assert.ok((text.match(/- \[favorites\]/g)||[]).length<=8);
});
