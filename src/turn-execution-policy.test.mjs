import test from "node:test";
import assert from "node:assert/strict";
import { planDesktopWebExecution, resolvePublicWebExecution } from "./turn-execution-policy.ts";
import { planPublicWebTools } from "./unified-planner.ts";
import { DEFAULT_SOURCE_PREFERENCES } from "./preferred-sources.ts";

const defaults = {
  question:"What's new with NASA Artemis?",autoSearch:true,provider:"local",
  planMode:"chat",notion:false,personalTurn:false,capabilityQuestion:false,
  existingSearch:false,attachment:false,screenshot:false,liveFrame:false,roleplay:false
};

test("policy only decides permissions and tool routing, not language intent",()=>{
  const local=planDesktopWebExecution(defaults);
  assert.equal(local.canPlanPublicWeb,true);
  assert.equal(local.cloudMaySearch,false);
  const explicit=planDesktopWebExecution({...defaults,planMode:"research"});
  assert.equal(explicit.canPlanPublicWeb,true);
  const cloudChat=planDesktopWebExecution({...defaults,provider:"openrouter"});
  assert.equal(cloudChat.cloudMaySearch,false,
    "A cloud model must not receive arbitrary chat web tools before local public planning");
  assert.equal(cloudChat.canPlanPublicWeb,true);
  const cloudResearch=planDesktopWebExecution({...defaults,provider:"openrouter",planMode:"research"});
  assert.equal(cloudResearch.cloudMaySearch,true);
});

test("privacy and user-configured capability restrictions remain deterministic",()=>{
  for(const option of ["notion","personalTurn","capabilityQuestion","existingSearch",
                       "attachment","screenshot","liveFrame","roleplay"]){
    const policy=planDesktopWebExecution({...defaults,[option]:true});
    assert.equal(policy.canPlanPublicWeb,false,option);
    assert.equal(policy.cloudMaySearch,false,option);
    assert.ok(policy.blockedReason,option);
  }
  const off=planDesktopWebExecution({...defaults,autoSearch:false});
  assert.equal(off.canPlanPublicWeb,false);
  assert.equal(off.cloudMaySearch,false);
});

test("conversation semantics are never classified by a regex permission gate",()=>{
  const examples=[
    "Hello Mikan",
    "I think Terrasite is even better than Death Atlas.",
    "I'm running out of short horror anime to watch.",
    "Ideally under six episodes.",
    "Not another giant open world, please.",
    "Just venting, no recommendations.",
    "I don't want suggestions, but search for current tour dates instead.",
    "I love Immortal's sound so much.",
    "No thanks, I only wanted to chat.",
    "That's a bad joke lol"
  ];
  for(const question of examples){
    const policy=planDesktopWebExecution({...defaults,question});
    assert.equal(policy.canPlanPublicWeb,true,question);
    assert.equal(policy.blockedReason,null,question);
  }
  // A current explicit opt-out still requires the model to decline research;
  // permitting private planning never authorizes public search by itself.
});

test("an opt-out and unrelated personal opinion stay local when semantic planner declines",async()=>{
  const history=[{role:"user",content:"I wish there were more bands like Immortal."}];
  for(const question of [
    "Not asking for recommendations, by the way. Just venting.",
    "I don't want suggestions.",
    "No thanks, I only wanted to chat.",
    "My favorite band is Immortal."
  ]){
    const policy=planDesktopWebExecution({...defaults,question,previous:history});
    assert.equal(policy.canPlanPublicWeb,true);
    let invoked=0;
    const choice=await planPublicWebTools(question,[],async prompt=>{
      invoked++;
      assert.ok(prompt.includes(question));
      return JSON.stringify({ids:[],web:{search:false,reason:"The user is chatting or opted out"}});
    },{automaticWebEnabled:policy.canPlanPublicWeb,
      sourcePreferences:DEFAULT_SOURCE_PREFERENCES,history});
    assert.equal(choice.search,false,question);
    assert.equal(invoked,1,question);
  }
});

test("model may plan a refinement across domains after policy permits it",async()=>{
  const cases=[
    ["Man, I wish there were more bands like Immortal.","Especially the cold guitars.","bands similar to Immortal"],
    ["I'm craving another tactical RPG like Fire Emblem.","Not another giant open world.","tactical games without open worlds"],
    ["I'm running out of short horror anime.","Under six episodes.","horror anime OVAs under six episodes"]
  ];
  for(const [prior,current,query] of cases){
    const history=[{role:"user",content:prior},{role:"assistant",content:"Some possibilities."}];
    const policy=planDesktopWebExecution({...defaults,question:current,previous:history});
    assert.equal(policy.canPlanPublicWeb,true);
    const selected=await planPublicWebTools(current,[],async prompt=>{
      assert.ok(prompt.includes(prior));
      return JSON.stringify({ids:[],web:{search:true,query,reason:"Continues earlier public discovery"}});
    },{automaticWebEnabled:policy.canPlanPublicWeb,
      sourcePreferences:DEFAULT_SOURCE_PREFERENCES,history});
    assert.equal(selected.search,true,current);
  }
});

test("only optional general lookup tasks can fall back to unsourced conceptual explanation",()=>{
  const policy=planDesktopWebExecution({...defaults,planMode:"research"});
  const task={kind:"lookup",requirements:[],roles:[],exclude:[]};
  const decision={search:true,query:"SQLite FTS5 vector embeddings design",method:"ai-planned",
    sourceRequirement:"optional",task};
  const run=(selected,plan={mode:"research",recent:false})=>
    resolvePublicWebExecution(policy,plan,selected);
  assert.equal(run(decision).researchGeneralFallback,true);
  assert.equal(run({...decision,sourceRequirement:"required"}).researchGeneralFallback,false);
  assert.equal(run({...decision,task:{...task,kind:"verify"}}).researchGeneralFallback,false);
  assert.equal(run({...decision,task:{...task,kind:"discover"}}).researchGeneralFallback,false);
  assert.equal(run({...decision,task:{...task,sourceUrl:"https://example.org/docs"}}).researchGeneralFallback,false);
  assert.equal(run({...decision,task:{...task,requirements:[{quote:"under 6",relation:"lt",limit:6,unit:"episodes"}]}}).researchGeneralFallback,false);
  assert.equal(run(decision,{mode:"research",recent:true}).researchGeneralFallback,false);
  assert.equal(run({...decision,task:undefined}).researchGeneralFallback,false);
  assert.equal(run({...decision,search:false}).researchGeneralFallback,false);
});
