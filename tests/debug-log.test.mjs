import test from "node:test";
import assert from "node:assert/strict";
import { formatDebugLog } from "../src/debug-log.ts";

test("copies all message text, source details and response timings", () => {
  const result = formatDebugLog([
    { id: "user-1", role: "user", createdAt: Date.UTC(2026, 10, 6, 21, 31), content: "What happened with Artemis?" },
    {
      id: "assistant-1", role: "assistant", createdAt: Date.UTC(2026, 10, 6, 21, 31, 5),
      content: "Artemis III is targeted for 2027 [1].",
      searchQuery: "Artemis III 2027 NASA",
      sources: [{
        title: "NASA Mission Update", url: "https://www.nasa.gov/missions/artemis",
        content: "The mission is planned for 2027.\nCrew details follow.",
        engine: "test-engine", publishedDate: "2026-10-31"
      }],
      diagnostics: {
        elapsedMs: 5000, firstTokenMs: 1200, model: "qwen3.5:9b",
        research: {status: "used", accepted: 3, rejected: 2, elapsedMs: 2100,
          note: "Quoted text matched sources; candidate claims still require semantic judgment."},
        stats: {
          outputTokens: 100, promptTokens: 2500, totalDurationNs: 4_000_000_000,
          loadDurationNs: 20_000_000, promptEvalDurationNs: 500_000_000,
          evalDurationNs: 2_000_000_000
        }
      }
    },
    {
      id: "assistant-2", role: "assistant", createdAt: Date.UTC(2026, 10, 6, 21, 31, 15),
      content: "My guess is 2027 [1].", sourcesCarriedOver: true,
      sources: [{title: "NASA Mission Update", url: "https://www.nasa.gov/missions/artemis", content: "2027",
        engine: "test-engine"}]
    }
  ], {
    conversationId: "conversation-1", model: "qwen3.5:9b", contextWindow: 16384,
    exportedAt: new Date("2026-11-06T21:40:00Z")
  });

  assert.match(result, /MIKAN DEBUG LOG/);
  assert.match(result, /Conversation ID: conversation-1/);
  assert.match(result, /Context window: 16384 tokens/);
  assert.match(result, /What happened with Artemis\?/);
  assert.match(result, /Artemis III is targeted for 2027 \[1\]/);
  assert.match(result, /SearXNG query: Artemis III 2027 NASA/);
  assert.match(result, /\[1\] NASA Mission Update/);
  assert.match(result, /URL: https:\/\/www\.nasa\.gov\/missions\/artemis/);
  assert.match(result, /Published: 2026-10-31/);
  assert.match(result, /Crew details follow/);
  assert.match(result, /Sources carried from earlier research \(not refreshed\)/);
  assert.match(result, /Wall time: 5\.00 s/);
  assert.match(result, /First token: 1\.20 s/);
  assert.match(result, /Speed: 50\.0 tok\/s/);
  assert.match(result, /Prompt: 2500 tokens/);
  assert.match(result, /Model: qwen3\.5:9b/);
  assert.match(result, /Research evidence: used/);
  assert.match(result, /Accepted source-anchored facts: 3/);
  assert.match(result, /Rejected candidates: 2/);
  assert.match(result, /Extraction time: 2\.10 s/);
  assert.equal((result.match(/=== MIKAN/g) ?? []).length, 2);
});

test("handles empty logs and missing metrics without inventing data", () => {
  const empty = formatDebugLog([], {
    conversationId: null, model: "qwen3.5:9b", contextWindow: null,
    exportedAt: new Date("2026-11-06T21:40:00Z")
  });
  assert.match(empty, /Message count: 0/);
  assert.match(empty, /Context window: Ollama default/);
  assert.doesNotMatch(empty, /Performance:/);

  const pending = formatDebugLog([{
    id: "partial", role: "assistant", content: "", createdAt: 0
  }], {
    conversationId: null, model: "qwen3.5:9b", contextWindow: 16384,
    exportedAt: new Date("2026-11-06T21:40:00Z")
  });
  assert.match(pending, /\(Empty \/ still generating\)/);
});

test("exports exact selected user facts, category, tags, pins and semantic availability", () => {
  const result = formatDebugLog([{
    id:"answer",role:"assistant",createdAt:Date.UTC(2026,10,10),content:"Freelance WordPress work.",
    diagnostics:{elapsedMs:900,firstTokenMs:200,model:"qwen3.5:9b",stats:null,
      memory:{storedFacts:27,semanticService:"offline",semanticReason:"Not installed",
        semanticCandidates:0,strongSemanticMatches:0,maxFacts:10,facts:[
          {id:42,fact:"The user is a professional WordPress developer.",category:"work",
            tags:["wordpress","career"],pinned:false,semantic:false},
          {id:43,fact:"The user's name is Marcus.",category:"profile",
            tags:["name"],pinned:true,semantic:false}
        ]}}
  }],{conversationId:"memory-debug",model:"qwen3.5:9b",contextWindow:16384});
  assert.ok(result.includes("SQLite facts available: 27"));
  assert.ok(result.includes("Semantic service: offline (Not installed)"));
  assert.ok(result.includes("Semantic candidates returned: 0"));
  assert.ok(result.includes("Selected facts: 2 / 10 maximum"));
  assert.ok(result.includes("ID 42 | work | not pinned | keyword/category/tag match | tags: wordpress, career"));
  assert.ok(result.includes("The user is a professional WordPress developer."));
  assert.ok(result.includes("ID 43 | profile | pinned | pinned core"));
  assert.ok(result.includes("selected personal-memory facts"));
});
test("distinguishes empty recall from successful recall", () => {
  const result=formatDebugLog([{
    id:"answer",role:"assistant",createdAt:0,content:"A comet contains ice.",
    diagnostics:{elapsedMs:100,firstTokenMs:25,model:"qwen3.5:9b",stats:null,
      memory:{storedFacts:35,semanticService:"ready",semanticCandidates:4,
        strongSemanticMatches:0,maxFacts:10,facts:[]}}
  }],{conversationId:null,model:"qwen3.5:9b",contextWindow:16384});
  assert.ok(result.includes("Selected facts: 0 / 10 maximum"));
  assert.ok(result.includes("No user facts were included in this model prompt."));
});


test("exports Gemini HTTP failure and actual fallback model without leaking key", () => {
  const result=formatDebugLog([{
    id:"fallback",role:"assistant",createdAt:Date.UTC(2026,10,11),content:"Using Qwen.",
    diagnostics:{
      elapsedMs:8700,firstTokenMs:6500,model:"qwen3.5:9b",
      fallbackReason:"Gemini HTTP 503 (Google service error or timeout): temporarily overloaded",
      stats:null
    }
  }],{conversationId:"gemini-test",model:"qwen3.5:9b",contextWindow:16384});
  assert.match(result,/Model: qwen3\.5:9b/);
  assert.match(result,/Cloud fallback: Gemini HTTP 503/);
  assert.doesNotMatch(result,/API key:/);
});


test("reports latency until first audible speech without exposing model reasoning",()=>{
  const result=formatDebugLog([{
    id:"s",role:"assistant",createdAt:Date.UTC(2026,10,12),content:"Good morning.",
    diagnostics:{elapsedMs:3800,firstTokenMs:450,firstAudioMs:1200,model:"OpenRouter free/model:free",stats:null}
  }],{conversationId:"speech-latency",model:"qwen3.5:9b",provider:"auto",contextWindow:16384});
  assert.match(result,/First token: 450 ms/);
  assert.match(result,/First spoken audio: 1\.20 s/);
});

test("lists structured interest search hits separately from prompt-injected lines",()=>{
  const result=formatDebugLog([{
    id:"answer",role:"assistant",createdAt:0,content:"Noted.",
    diagnostics:{elapsedMs:200,firstTokenMs:50,model:"qwen3.5:9b",stats:null,
      memory:{storedFacts:93,semanticService:"ready",semanticCandidates:0,
        strongSemanticMatches:0,maxFacts:10,facts:[],
        interests:{
          returned:[{id:12,name:"Shadows Fall",kind:"band",status:"favorite"},
                    {id:13,name:"Other artist",kind:"band",status:"like"}],
          included:[{id:12,promptLine:"- [band, favorite] Shadows Fall"}],
          suppressedForCharacter:false
        }
      }
    }
  }],{conversationId:"interest-trace",model:"qwen3.5:9b",contextWindow:16384});
  assert.match(result,/Collection candidates returned: 2/);
  assert.match(result,/Interest items included in prompt: 1/);
  assert.match(result,/ID 12 \| band \| favorite \| in prompt \| Shadows Fall/);
  assert.match(result,/ID 13 \| band \| like \| not in prompt \| Other artist/);
  assert.match(result,/Exact interest lines actually supplied to the model:/);
  assert.match(result,/#12 - \[band, favorite\] Shadows Fall/);
  assert.doesNotMatch(result,/#13 - \[band/);
});
test("interest lookup failures and character suppression are visible",()=>{
  const result=formatDebugLog([{
    id:"answer",role:"assistant",createdAt:0,content:"About my favorites.",
    diagnostics:{elapsedMs:200,firstTokenMs:50,model:"qwen3.5:9b",stats:null,
      memory:{storedFacts:1,semanticService:"ready",semanticCandidates:0,
        strongSemanticMatches:0,maxFacts:5,facts:[],
        interests:{returned:[],included:[],suppressedForCharacter:true,
          searchError:"SQLite unavailable"}}
    }
  }],{conversationId:null,model:"qwen3.5:9b",contextWindow:16384});
  assert.match(result,/Lookup: failed \(SQLite unavailable\)/);
  assert.match(result,/Owner interests suppressed/);
  assert.match(result,/No structured interest lines were supplied/);
});
