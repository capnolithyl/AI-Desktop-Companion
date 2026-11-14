import test from "node:test";
import assert from "node:assert/strict";
import { planDesktopWebExecution, recentDiscoveryRefinement } from "./turn-execution-policy.ts";

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

test("implicit discovery needs reach the model planner across domains, not automatic web",()=>{
  for(const question of [
    "I wish there were more bands like Immortal.",
    "I really want more books like The Hollow Places.",
    "I'm running out of short horror anime to watch.",
    "I'm craving another tactical RPG like Fire Emblem.",
    "I need more software alternatives for offline folder comparison.",
    "I'd love to find a lesser-known artist with that style."
  ]){
    const verdict=planDesktopWebExecution({...defaults,question,provider:"local"});
    assert.equal(verdict.canPlanPublicWeb,true,question);
    assert.equal(verdict.blockedReason,null,question);
  }
  // Eligibility is not authorization to search: the planner may still decline.
  for(const question of [
    "I really love Immortal's guitar sound.",
    "I think The Hollow Places was a great read.",
    "My favorite album is The Art of Balance.",
    "I have a craving for chicken soup."
  ]){
    const verdict=planDesktopWebExecution({...defaults,question,provider:"local"});
    assert.equal(verdict.canPlanPublicWeb,false,question);
  }
});

test("follow-up taste refinements may reach the local planner only while public discovery is active",()=>{
  const earlier=[{role:"user",content:"I wish there were more short horror series to watch."},
    {role:"assistant",content:"I could find some."}];
  const continued=planDesktopWebExecution({...defaults,provider:"local",
    question:"I prefer something under six episodes.",previous:earlier});
  assert.equal(recentDiscoveryRefinement("I prefer something under six episodes.",earlier),true);
  assert.equal(continued.canPlanPublicWeb,true);
  assert.equal(continued.blockedReason,null);
  const alone=planDesktopWebExecution({...defaults,provider:"local",
    question:"I prefer something under six episodes."});
  assert.equal(alone.canPlanPublicWeb,false);
  const noNeed=planDesktopWebExecution({...defaults,provider:"local",
    question:"I prefer something under six episodes.",
    previous:[{role:"user",content:"I like horror anime."}]});
  assert.equal(noNeed.canPlanPublicWeb,false);
});
test("user opt-outs, sensitive history, and higher-priority privacy permissions remain effective",()=>{
  const discovery=[{role:"user",content:"I need more games with interesting tactics."}];
  assert.equal(recentDiscoveryRefinement("Not asking for recommendations. Just venting.",discovery),false);
  assert.equal(recentDiscoveryRefinement("I like raw tactical encounters.",[
    {role:"user",content:"My son's address is 123 Example Street."}]),false);
  for(const option of ["notion","personalTurn","capabilityQuestion","attachment","screenshot","roleplay"]){
    const policy=planDesktopWebExecution({...defaults,[option]:true,
      previous:discovery,question:"I prefer something short."});
    assert.equal(policy.canPlanPublicWeb,false,option);
    assert.ok(policy.blockedReason,option);
  }
});

test("explicit opt-out prevents both local and cloud web planning despite prior discovery",()=>{
  const previous=[{role:"user",content:"I wish there were more bands like Immortal."}];
  for(const question of ["Not asking for recommendations, by the way. Just venting.",
    "I don't want suggestions.", "No research please. Just sharing.",
    "I'm just venting about the music scene."]){
    const decision=planDesktopWebExecution({...defaults,question,previous});
    assert.equal(decision.canPlanPublicWeb,false,question);
    assert.equal(decision.cloudMaySearch,false,question);
    assert.match(decision.blockedReason,/declined public/);
  }
  const different=planDesktopWebExecution({...defaults,previous,
    question:"No recommendations, but search for the current Immortal tour dates instead."});
  assert.equal(different.canPlanPublicWeb,true);
});
