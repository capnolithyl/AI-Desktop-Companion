import test from "node:test";
import assert from "node:assert/strict";
import { remoteDiagnosticMessages, remoteAvatarDiagnostics } from "./remote-report.ts";

test("remote diagnostic snapshot retains counts, routing and failures without memory text or private queries", () => {
  const log = remoteDiagnosticMessages([
    {id:"user",role:"user"},
    {id:"assistant",role:"assistant",failed:true,diagnostics:{
      elapsedMs:2000, firstTokenMs:450, firstAudioMs:950,
      model:"qwen3.5:9b",provider:"local",fallbackReason:"PRIVATE fallback URL",
      stats:{promptTokens:450,outputTokens:90,totalDurationNs:0,loadDurationNs:1000000,
        promptEvalDurationNs:0,evalDurationNs:10000000},
      memory:{storedFacts:500,semanticService:"ready",semanticReason:"PRIVATE SERVICE ERROR",
        semanticCandidates:8,strongSemanticMatches:3,maxFacts:10,
        facts:[{id:1,fact:"PRIVATE MEMORY FACT",category:"family",tags:[],pinned:true,semantic:true}],
        interests:{returned:[{id:1,name:"PRIVATE FAVORITE",kind:"band",status:"liked"}],
          included:[{id:1,promptLine:"PRIVATE INTEREST"}],suppressedForCharacter:false}
      },
      toolPlan:{method:"web-search",reason:"PRIVATE TOOL CONTEXT",query:"PRIVATE SEARCH QUERY",
        topic:"PRIVATE TOPIC",publicWebAllowed:true,freshSources:2,searchOutcome:"completed"},
      research:{status:"used",accepted:3,rejected:1,elapsedMs:22,note:"PRIVATE WEB EXCERPT"},
      notion:{selectedPage:"PRIVATE CHAPTER NAME",cachedPages:3,excerptCount:8,
        fullReadAttempted:true,readSucceeded:false,linkedScenesRead:1,
        readFailure:"PRIVATE NOTION ERROR"},
      parallelTasks:[{name:"Web search",elapsedMs:200,status:"complete"}]
    }}
  ]);
  assert.equal(log.length,2);
  assert.equal(log[1].failed,true);
  assert.equal(log[1].diagnostics.firstTokenMs,450);
  assert.equal(log[1].diagnostics.memory.strongSemanticMatches,3);
  assert.equal(log[1].diagnostics.memory.interestsIncluded,1);
  assert.equal(log[1].diagnostics.toolPlan.freshSources,2);
  assert.equal(log[1].diagnostics.notion.readSucceeded,false);
  assert.equal(log[1].diagnostics.privateDetails.notionReadFailure,"PRIVATE NOTION ERROR");
  const serialized=JSON.stringify(log);
  for (const text of ["PRIVATE MEMORY FACT","PRIVATE INTEREST","PRIVATE SEARCH QUERY",
    "PRIVATE TOPIC","PRIVATE CHAPTER NAME"]) {
    assert.equal(serialized.includes(text),false);
  }
});

test("avatar diagnostics include renderer errors for private reports",()=>{
  assert.equal(remoteAvatarDiagnostics(null),null);
  const data=remoteAvatarDiagnostics({
    status:"error",rig:"custom",fps:0,
    expressions:[],motions:[],lastReaction:null,
    activeExpression:null,activeMotion:null,speaking:false,
    mouthOpen:0,breath:null,eyeL:null,eyeR:null,
    error:"Texture decode failed"
  });
  assert.equal(data.status,"error");
  assert.equal(data.error,"Texture decode failed");
});
