import test from "node:test";
import assert from "node:assert/strict";
import {shouldMikanifyAnswer} from "../src/mikanify.ts";

const base={enabled:true,researchMode:"simple",searchQuery:"latest release",
  sourceCount:4,sourcesCarriedOver:false,hasResearchAudit:false,
  modelUsed:"qwen3.5:9b",localModel:"qwen3.5:9b"};

test("only freshly researched local Simple answers receive the optional style pass",()=>{
  assert.equal(shouldMikanifyAnswer(base),true);
  for(const change of [
    {enabled:false},{researchMode:"strict"},{searchQuery:null},
    {sourceCount:0},{sourcesCarriedOver:true},{hasResearchAudit:true},
    {modelUsed:"OpenRouter free/model"}
  ])assert.equal(shouldMikanifyAnswer({...base,...change}),false,
    "must not rewrite for "+JSON.stringify(change));
});

test("the rewrite is independent of prompt wording, topic and factual content",()=>{
  assert.equal(shouldMikanifyAnswer({...base,searchQuery:"astronomy history"}),true);
  assert.equal(shouldMikanifyAnswer({...base,searchQuery:"music release"}),true);
});
