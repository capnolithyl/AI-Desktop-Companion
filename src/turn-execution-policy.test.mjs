import test from "node:test";
import assert from "node:assert/strict";
import { planDesktopWebExecution } from "./turn-execution-policy.ts";

const defaults = {
  question:"What's new with NASA Artemis?", autoSearch:true, provider:"auto",
  planMode:"chat", notion:false,personalTurn:false,capabilityQuestion:false,
  existingSearch:false,attachment:false,screenshot:false,liveFrame:false,roleplay:false
};
test("local model planner only runs for eligible ordinary chats",()=>{
  const local = planDesktopWebExecution({...defaults,provider:"local"});
  assert.equal(local.canPlanPublicWeb,true);
  assert.equal(local.cloudMaySearch,false);
  const explicit=planDesktopWebExecution({...defaults,planMode:"research"});
  assert.equal(explicit.canPlanPublicWeb,false);
  assert.equal(explicit.cloudMaySearch,true);
});
test("sensitive data and personal questions never activate automatic public tools",()=>{
  for(const option of ["notion","personalTurn","capabilityQuestion","existingSearch",
                      "attachment","screenshot","liveFrame","roleplay"]){
    const policy=planDesktopWebExecution({...defaults,[option]:true});
    assert.equal(policy.canPlanPublicWeb,false,option);
    assert.equal(policy.cloudMaySearch,false,option);
    assert.ok(policy.blockedReason,option);
  }
  assert.equal(planDesktopWebExecution({...defaults,autoSearch:false}).cloudMaySearch,false);
});
test("cloud small talk stays tool-free and real public questions still can search",()=>{
  const hi=planDesktopWebExecution({...defaults,question:"Hello Mikan"});
  assert.equal(hi.cloudMaySearch,false);
  assert.equal(hi.canPlanPublicWeb,false); // no extra local planning call for greetings
  const news=planDesktopWebExecution({...defaults,question:"Search the web for NASA news"});
  assert.equal(news.cloudMaySearch,true);
  assert.equal(news.canPlanPublicWeb,true);
});

test("new personal preferences remain local chat rather than automatic research",()=>{
  for(const question of [
    "One of my favorite Cattle Decapitation songs is Gristle Licker",
    "I think Terrasite is even better than Death Atlas",
    "My favorite album is The Art of Balance",
    "so have i told you about my latest obsession? Cattle Decapitation. the band"
  ]){
    const policy=planDesktopWebExecution({...defaults,question});
    assert.equal(policy.canPlanPublicWeb,false,question);
    assert.equal(policy.cloudMaySearch,false,question);
  }
  const lookup=planDesktopWebExecution({...defaults,question:"Search the web for Cattle Decapitation reviews"});
  assert.equal(lookup.canPlanPublicWeb,true);
});
