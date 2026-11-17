import test from "node:test";
import assert from "node:assert/strict";
import { remoteDiagnosticMessages, remoteAvatarDiagnostics } from "./remote-report.ts";
import { safeReportDiagnostics } from "../server/reporting.mjs";

test("remote diagnostic snapshot retains counts, routing and failures without memory text or private queries", () => {
  const log = remoteDiagnosticMessages([
    {id:"user",role:"user"},
    {id:"assistant",role:"assistant",failed:true,
      sources:[
        {url:"https://www.alibabacloud.com/press/release?private=PRIVATE_SOURCE_PATH"},
        {url:"http://localhost:8080/PRIVATE_LOCAL_PATH"},
        {url:"https://example.test/private"},
        {url:"https://www.publisher.example/news"}
      ],diagnostics:{
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
        task:{kind:"lookup",details:["PRIVATE DETAIL 1","PRIVATE DETAIL 2"],requirements:[],roles:[],exclude:[]},
        topic:"PRIVATE TOPIC",publicWebAllowed:true,freshSources:2,searchOutcome:"completed"},
      research:{status:"partial",taskKind:"lookup",accepted:3,rejected:1,contextualCount:1,
        acceptedDetails:[{source:1,detail:0,subject:"PRIVATE FACT",claim:"PRIVATE CLAIM",quote:"PRIVATE QUOTE"},
          {source:4,detail:null,subject:"PRIVATE SUBJECT",claim:"PRIVATE CLAIM",quote:"PRIVATE QUOTE"}],
        unresolvedDetails:["PRIVATE DETAIL 2"],
        rejectedDetails:["PRIVATE SUBJECT [source 2]: claim_number_not_tied_to_subject",
          "PRIVATE SUBJECT [source 3]: UNTRUSTED_PRIVATE_REASON"],
        elapsedMs:22,followupQuery:"PRIVATE PRIMARY LOOKUP",primaryRecoveryStatus:"new-sources-unresolved",
        note:"PRIVATE WEB EXCERPT"},
      answerVerification:{checked:2,rejected:0,recoveredHeadline:false,
        presentation:"model-voice-preserved"},
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
  assert.equal(log[1].diagnostics.answerVerification.presentation,"model-voice-preserved");
  const relayed = safeReportDiagnostics({messages:log});
  assert.equal(log[1].diagnostics.research.followupAttempted,true);
  assert.equal(relayed.messages[1].diagnostics.research.followupAttempted,true);
  assert.equal(relayed.messages[1].diagnostics.research.primaryRecoveryStatus,"new-sources-unresolved");
  assert.equal(log[1].diagnostics.research.requestedDetailCount,2);
  assert.equal(log[1].diagnostics.research.unresolvedDetailCount,1);
  assert.equal(relayed.messages[1].diagnostics.research.taskKind,"lookup");
  assert.equal(relayed.messages[1].diagnostics.research.contextOnlyCount,1);
  assert.deepEqual(relayed.messages[1].diagnostics.research.rejectedReasonCodes,
    ["claim_number_not_tied_to_subject"]);
  assert.deepEqual(relayed.messages[1].diagnostics.research.acceptedFactSlots,
    [{source:1,detail:0},{source:4,detail:null}]);
  assert.deepEqual(relayed.messages[1].diagnostics.research.sourceHosts,
    [{source:1,host:"www.alibabacloud.com"},{source:4,host:"www.publisher.example"}]);
  assert.equal(relayed.messages[1].diagnostics.research.status,"partial",
    "a partial research state must survive BOTH desktop and relay sanitizers");
  assert.equal(relayed.messages[1].diagnostics.answerVerification.presentation,"model-voice-preserved");
  const poisoned = safeReportDiagnostics({messages:[{id:"x",role:"assistant",diagnostics:{
    research:{status:"unsafe-injected",primaryRecoveryStatus:"unsafe-injected",
      taskKind:"PRIVATE",rejectedReasonCodes:["UNTRUSTED_PRIVATE_REASON"],
      sourceHosts:[{source:3,host:"evil.local"},{source:4,host:"https://evil.example/?token=PRIVATE"}],
      acceptedFactSlots:[{source:999,detail:-1}],requestedDetailCount:999},
    answerVerification:{presentation:"unsupported-claim"}
  }}]});
  assert.equal(poisoned.messages[0].diagnostics.research.status,null);
  assert.equal(poisoned.messages[0].diagnostics.research.primaryRecoveryStatus,null);
  assert.equal(poisoned.messages[0].diagnostics.research.taskKind,null);
  assert.deepEqual(poisoned.messages[0].diagnostics.research.rejectedReasonCodes,[]);
  assert.deepEqual(poisoned.messages[0].diagnostics.research.sourceHosts,[]);
  assert.deepEqual(poisoned.messages[0].diagnostics.research.acceptedFactSlots,[]);
  assert.equal(poisoned.messages[0].diagnostics.research.requestedDetailCount,null);
  assert.equal(poisoned.messages[0].diagnostics.answerVerification.presentation,null);
  assert.equal(log[1].diagnostics.notion.readSucceeded,false);
  assert.equal(log[1].diagnostics.privateDetails.notionReadFailure,"PRIVATE NOTION ERROR");
  const serialized=JSON.stringify(log);
  for (const text of ["PRIVATE MEMORY FACT","PRIVATE INTEREST","PRIVATE SEARCH QUERY","PRIVATE PRIMARY LOOKUP",
    "PRIVATE TOPIC","PRIVATE CHAPTER NAME","PRIVATE DETAIL 1","PRIVATE DETAIL 2",
    "PRIVATE_FACT","PRIVATE FACT","PRIVATE SOURCE PATH","PRIVATE_SOURCE_PATH",
    "PRIVATE SUBJECT","PRIVATE CLAIM","PRIVATE QUOTE","UNTRUSTED_PRIVATE_REASON"]) {
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
