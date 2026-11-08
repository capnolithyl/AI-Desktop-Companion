import test from "node:test";
import assert from "node:assert/strict";
import {decideDesktopTurn} from "./desktop-turn-routing.ts";

test("screen vision capability query stays private local chat, never generic web search",()=>{
  const result=decideDesktopTurn("can you see my screen?",[],{automaticWebEnabled:true});
  assert.equal(result.plan.mode,"chat");
  assert.equal(result.capabilityQuestion,true);
  assert.equal(result.allowAutomaticWeb,false);
  assert.equal(result.verifyWebEvidence,false);
});

test("ordinary conversations, personal memories and roleplay are not source-checked",()=>{
  const previous=[{role:"user",content:"What's the latest Artemis news?"}];
  for(const question of [
    "How are you?", "What do you think of metal?", "Can you remember my WordPress skills?",
    "Let's roleplay a fantasy story", "Hey Mikan", "Can you read a PDF file?",
    "Can you speak?", "What features do you have?", "I love this song!",
    "Can you help me build a website?", "Why did you say that?",
    "Can you search the web?", "Are you able to see screenshots?"
  ]){
    const result=decideDesktopTurn(question,previous,{automaticWebEnabled:true});
    assert.equal(result.plan.mode,"chat",question);
    assert.equal(result.allowAutomaticWeb,false,question);
    assert.equal(result.verifyWebEvidence,false,question);
  }
});

test("real research still searches and verifies",()=>{
  for(const question of [
    "What's the latest NASA Artemis news?",
    "What is the current price of gold?",
    "Search the web for the latest NASA launch.",
    "Can you search the web for new Qwen models?",
    "Can you search for the latest news about NASA?",
    "Can you browse for information about Tauri 2 plugins?",
    "What is the capital of Germany?"
  ]){
    const result=decideDesktopTurn(question,[],{automaticWebEnabled:true});
    assert.notEqual(result.plan.mode,"chat",question);
    assert.equal(result.allowAutomaticWeb,true,question);
    assert.equal(result.verifyWebEvidence,true,question);
  }
});

test("auto search off and attachment turns stay local",()=>{
  const noWeb=decideDesktopTurn("What's the latest NASA news?",[],{automaticWebEnabled:false});
  assert.equal(noWeb.allowAutomaticWeb,false);
  assert.equal(noWeb.verifyWebEvidence,false);
  const attached=decideDesktopTurn("What's the latest news?",[],{attachment:true,automaticWebEnabled:true});
  assert.equal(attached.plan.mode,"chat");
  assert.equal(attached.allowAutomaticWeb,false);
  assert.equal(attached.verifyWebEvidence,false);
  const explicit=decideDesktopTurn("tell me about this result",[],{explicitSearch:true,automaticWebEnabled:true});
  assert.equal(explicit.allowAutomaticWeb,false);
  assert.equal(explicit.verifyWebEvidence,true);
});

test("sourced follow-ups search only when the current user intent warrants it",()=>{
  const previous=[
    {role:"user",content:"What's the latest news about Artemis?"},
    {role:"assistant",content:"Recent mission briefing [1].",sources:[{url:"https://nasa.gov",title:"NASA",content:"Artemis"}]}
  ];
  const fact=decideDesktopTurn("And when is the next launch?",previous,{automaticWebEnabled:true});
  assert.equal(fact.allowAutomaticWeb,true);
  const smallTalk=decideDesktopTurn("Can you see my screen?",previous,{automaticWebEnabled:true});
  assert.equal(smallTalk.allowAutomaticWeb,false);
});
