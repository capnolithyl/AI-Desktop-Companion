import test from "node:test";
import assert from "node:assert/strict";
import {extendPlanningPrompt,parseWebToolDecision,planMemoriesAndTools} from "./unified-planner.ts";
import {DEFAULT_SOURCE_PREFERENCES} from "./preferred-sources.ts";

const facts=[
  {id:41,importance:95,fact:"The user's full name is Alex Example.",category:"profile",updatedAt:1,tags:["name"]},
  {id:25,fact:"The user is a professional WordPress developer.",category:"work",updatedAt:2,tags:["wordpress"]},
  {id:34,fact:"The user likes black metal music.",category:"preferences",updatedAt:3,tags:["metal","music"]}
];
const prefs=DEFAULT_SOURCE_PREFERENCES;
test("one local planner prompt requests memory IDs and a public web decision",()=>{
  const prompt=extendPlanningPrompt('Select facts.\nJSON:',prefs);
  assert.match(prompt,/LIVE PUBLIC WEB SEARCH/);
  assert.match(prompt,/Source priority topic/);
  assert.match(prompt,/music, coding, gaming/);
});
test("model can select developer background and independently plan music search",async()=>{
  let calls=0;
  const result=await planMemoriesAndTools(facts,"Recommend me something to listen to",[],10,
    async prompt=>{
      calls++;
      assert.match(prompt,/SAVED USER FACTS/);
      return JSON.stringify({ids:[34],web:{search:true,query:"2026 black metal album recommendations",
        topic:"music",reason:"Check actual music releases"}});
    },{automaticWebEnabled:true,sourcePreferences:prefs});
  assert.equal(calls,1);
  assert.deepEqual(result.memory.ids,[34]);
  assert.equal(result.web.search,true);
  assert.equal(result.web.topic,"music");
  assert.equal(result.web.method,"ai-planned");
});
test("no personal data, arbitrary URLs or unrecognized search topics leave local process",()=>{
 const cases=["my favorite bands","Alex Example music","Brielle birthday","me best game",
  "https://private.local/foo","my.name@example.com search","\nhello music"];
 for(const query of cases){
   const choice=parseWebToolDecision(JSON.stringify({web:{search:true,query,topic:"music"}}),true,prefs,facts);
   assert.equal(choice.search,false,query);
 }
 const unknown=parseWebToolDecision(JSON.stringify({web:{search:true,
   query:"new tactical rpg releases",topic:"unlisted"}}),true,prefs,facts);
 assert.equal(unknown.search,true);
 assert.equal(unknown.topic,undefined);
});
test("a forced-off toggle prevents external research even when model requests it",()=>{
 const choice=parseWebToolDecision(JSON.stringify({web:{search:true,
   query:"recent metal albums",topic:"music"}}),false,prefs,facts);
 assert.equal(choice.search,false);
 assert.equal(choice.method,"disabled");
});
test("no stored memories still lets planner decide whether public verification helps",async()=>{
 let calls=0;
 const result=await planMemoriesAndTools([],"Recommend a new strategy game",[],10,
   async()=>{calls++;return JSON.stringify({ids:[],
     web:{search:true,query:"2026 tactical rpg release reviews",topic:"gaming"}})},
   {automaticWebEnabled:true,sourcePreferences:prefs});
 assert.equal(calls,1);
 assert.equal(result.memory.mode,"empty");
 assert.equal(result.web.search,true);
});
test("greetings skip expensive planning, corrupted replies use private fallback",async()=>{
 const hi=await planMemoriesAndTools(facts,"Hello!",[],10,
   async()=>{throw Error("never needed")},{automaticWebEnabled:true,sourcePreferences:prefs});
 assert.equal(hi.web.search,false);
 assert.equal(hi.memory.mode,"small-talk");
 const bad=await planMemoriesAndTools(facts,"Any project ideas?",[],10,
   async()=>"{broken",{automaticWebEnabled:true,sourcePreferences:prefs});
 assert.equal(bad.memory.mode,"fallback");
 assert.equal(bad.web.search,false);
});


test("a recommendation can discard generic recipient pronouns without leaking personal facts",()=>{
 const result=parseWebToolDecision(JSON.stringify({web:{search:true,query:"recommend me 2026 new metal albums for me",topic:"music"}}),true,prefs,facts);
 assert.equal(result.search,true);
 assert.equal(result.query,"recommend 2026 new metal albums");
 assert.equal(parseWebToolDecision(JSON.stringify({web:{search:true,query:"new albums for my son",topic:"music"}}),true,prefs,facts).search,false);
});
test("an unsafe planner query gets exactly one locally validated retry",async()=>{
 let calls=0;
 const result=await planMemoriesAndTools(facts,"Recommend me three metal albums I might enjoy.",[],10,
   async prompt=>{
      calls++;
      if(calls===1)return JSON.stringify({ids:[34],web:{
        search:true,query:"2026 metal albums for my personal taste",topic:"music"
      }});
      assert.match(prompt,/safe, general PUBLIC WEB SEARCH query/);
      assert.doesNotMatch(prompt,/Alex Example/);
      return JSON.stringify({web:{
        search:true,query:"2026 metal album reviews",topic:"music",reason:"verify real releases"
      }});
   },{automaticWebEnabled:true,sourcePreferences:prefs});
 assert.equal(calls,2);
 assert.deepEqual(result.memory.ids,[34]);
 assert.equal(result.web.search,true);
 assert.equal(result.web.query,"2026 metal album reviews");
 assert.match(result.web.reason,/rewritten locally/);
});
