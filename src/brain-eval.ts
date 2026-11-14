/**
 * Isolated P0 evaluation fixtures and scoring. Nothing here writes to SQLite,
 * Qdrant, the remote relay, or real search services. Synthetic facts deliberately
 * use invented names so the model cannot pass by guessing its training data.
 */
import { decideDesktopTurn } from "./desktop-turn-routing.ts";
import { planDesktopWebExecution } from "./turn-execution-policy.ts";
import { selectDeterministicMemoryIds } from "./memory-retrieval.ts";
import { rankMemories, type RankableMemory } from "./memory-ranking.ts";
import type { ResearchTurn } from "./research-routing.ts";

export type EvalRoute = "chat" | "research" | "factual" | "non-research" | "any";
export type EvalExpectation = {
  route?: EvalRoute;
  memory?: number[];
  excludeMemory?: number[];
  answerIncludes?: string[];
  answerAny?: string[];
  answerExcludes?: string[];
  /** A mock reply for predictable context in planning-only runs. */
  stubReply?: string;
};
export type EvalStep = { user: string; expect: EvalExpectation; explanation?: string; mockEvidence?: string };
export type EvalScenario = { id: string; label: string; group: string; steps: EvalStep[]; note?: string };
export type EvalTurn = ResearchTurn & { role:"user"|"assistant"; content:string };
export type EvalMode = "routing" | "live";
export type EvalStepResult = {
  user: string;
  expected: EvalExpectation;
  actualRoute: string;
  canPlanPublicWeb: boolean;
  cloudMaySearch: boolean;
  blockedReason: string | null;
  deterministicWebAllowed: boolean;
  webPlannerDecision?: {search:boolean;query?:string;reason:string};
  selectedMemoryIds: number[];
  selectedMemory: {id:number;fact:string}[];
  missingMemoryIds: number[];
  unexpectedMemoryIds: number[];
  routePass: boolean;
  memoryPass: boolean;
  answerPass: boolean | null;
  answerFailures: string[];
  answer?: string;
  error?: string;
  elapsedMs: number;
  pass: boolean;
};
export type EvalCaseResult = {
  id:string; label:string; group:string; repeat:number; steps:EvalStepResult[];
  pass:boolean; elapsedMs:number;
};
export type EvalReport = {
  version:1; runId:string; startedAt:string; finishedAt:string;
  mode:EvalMode; model:string; attempts:number; scenarios:string[];
  // Recording simulated vs actual conditions prevents misleading scoreboards.
  environment:"isolated-synthetic"; liveWebEnabled:false; writesToRealMemories:false;
  cases:EvalCaseResult[];
};
export type EvalInference = (args:{
  messages:EvalTurn[];
  selectedMemories:ReadonlyArray<{id:number;fact:string}>;
  evidence?:string;
  scenarioId:string;
  stepIndex:number;
})=>Promise<string>;
export type EvalPlanner = (input:string,previous:EvalTurn[])=>Promise<{search:boolean;query?:string;reason:string}>;
export type EvalOptions = {
  mode:EvalMode;
  repetitions:number;
  model:string;
  scenarios:ReadonlyArray<EvalScenario>;
  signal?:AbortSignal;
  infer?:EvalInference;
  planWeb?:EvalPlanner;
  onProgress?:(done:number,total:number,current:string)=>void;
};

// Do not put real names, personal facts, URLs, or credentials into test fixtures.
export const EVAL_FACTS:ReadonlyArray<RankableMemory> = [
  {id:101,fact:"The user's favorite band is Cobalt Harbor (a fictional test band).",category:"preferences",tags:["music","favorite band","Cobalt Harbor"],importance:90,updatedAt:1794510000},
  {id:102,fact:"The user's favorite song is Winterglass by Cobalt Harbor (fictional).",category:"preferences",tags:["music","favorite song","Winterglass"],importance:80,updatedAt:1794510000},
  {id:103,fact:"Cobalt Harbor's lead singer is Nora Vale (fictional).",category:"music",tags:["Cobalt Harbor","lead singer","vocalist","Nora Vale"],importance:65,updatedAt:1794510000},
  {id:104,fact:"Cobalt Harbor's third album is Glass Atlas (fictional).",category:"music",tags:["Cobalt Harbor","third album","Glass Atlas"],importance:65,updatedAt:1794510000},
  {id:105,fact:"The user's favorite color is moss green.",category:"preferences",tags:["color","moss green"],importance:85,updatedAt:1794510000},
  {id:106,fact:"The user's favorite meal is mushroom risotto.",category:"preferences",tags:["food","favorite meal"],importance:65,updatedAt:1794510000},
  {id:107,fact:"The user works on a fictional software project called Lantern Desk.",category:"projects",tags:["Lantern Desk","software"],importance:75,updatedAt:1794510000},
  {id:108,fact:"Lantern Desk uses Tauri, React and TypeScript, not Electron.",category:"projects",tags:["Lantern Desk","Tauri","React"],importance:70,updatedAt:1794510000},
  {id:109,fact:"The user owns a fictional dog named Pippin.",category:"family",tags:["dog","pet","Pippin"],importance:85,updatedAt:1794510000},
  {id:110,fact:"The user's fictional spouse is Rowan; the user's fictional child is Theo. Rowan is Theo's parent, not the user's child.",category:"family",tags:["spouse","partner","Rowan","child","Theo","family"],importance:95,updatedAt:1794510000},
  {id:111,fact:"The user's favorite game is Ember Tactics (a fictional turn-based RPG).",category:"preferences",tags:["games","Ember Tactics"],importance:80,updatedAt:1794510000},
  {id:112,fact:"The user has completed Ember Tactics and does not want it recommended again.",category:"preferences",tags:["games","completed","Ember Tactics"],importance:70,updatedAt:1794510000},
  {id:113,fact:"The user's fictional novel is called The Second Lighthouse.",category:"projects",tags:["writing","novel","The Second Lighthouse"],importance:75,updatedAt:1794510000},
  {id:114,fact:"Chapter three of The Second Lighthouse features a storm, but the chapter text is not stored in these test memories.",category:"projects",tags:["writing","chapter 3","novel"],importance:65,updatedAt:1794510000},
  {id:115,fact:"The user prefers concise responses and dislikes unnecessary unsolicited web searches.",category:"profile",tags:["response style","web"],importance:90,updatedAt:1794510000},
  {id:116,fact:"The user's fictional hometown was Alderwick; their current fictional town is Brookmere.",category:"profile",tags:["hometown","current city","Alderwick","Brookmere"],importance:85,updatedAt:1794510000},
  {id:117,fact:"The user prefers metal music and also enjoys synthwave.",category:"preferences",tags:["music","metal","synthwave"],importance:80,updatedAt:1794510000},
  {id:118,fact:"The user's chosen fictional PC GPU is a Radeon RX 9070.",category:"hardware",tags:["GPU","computer","Radeon RX 9070"],importance:70,updatedAt:1794510000},
  {id:119,fact:"The user collects strategy games, but dislikes sprawling open-world games.",category:"preferences",tags:["gaming","strategy","open world"],importance:60,updatedAt:1794510000},
  {id:120,fact:"The user's fictional cat is called Marmalade; Pippin is the dog.",category:"family",tags:["cat","Marmalade","Pippin"],importance:65,updatedAt:1794510000}
];

const e=(user:string,expect:EvalExpectation,explanation?:string,mockEvidence?:string):EvalStep=>({user,expect,explanation,mockEvidence});
const scenario=(id:string,label:string,group:string,...steps:EvalStep[]):EvalScenario=>({id,label,group,steps});
const band=e("What's my favorite band?",{route:"chat",memory:[101],answerIncludes:["Cobalt Harbor"],stubReply:"Your favorite band is Cobalt Harbor."});
const song=e("What's my favorite song?",{route:"chat",memory:[102],answerIncludes:["Winterglass"],stubReply:"Your favorite song is Winterglass by Cobalt Harbor."});
const color=e("What's my favorite color?",{route:"chat",memory:[105],answerIncludes:["moss green"],stubReply:"Moss green."});
const singer=e("What's their singer's name again?",{route:"chat",memory:[103],answerIncludes:["Nora Vale"],stubReply:"Nora Vale is their singer."});
const soup=e("I love chicken noodle soup.",{route:"chat",excludeMemory:[103,104],stubReply:"That sounds delicious."});
export const EVAL_SCENARIOS:ReadonlyArray<EvalScenario>=[
  scenario("branch-a","A · singer after favorite song","Branching context",band,song,singer),
  scenario("branch-b","B · color after favorite song","Branching context",band,song,color),
  scenario("branch-c","C · third album before color","Branching context",band,
    e("What's their third album?",{route:"chat",memory:[104],answerIncludes:["Glass Atlas"],stubReply:"Their third album is Glass Atlas."}),color),
  scenario("branch-d","D · unrelated soup interruption","Branching context",band,soup,singer),
  scenario("branch-e","E · topic interruption, then singer","Branching context",band,color,singer),
  scenario("branch-f","F · backwards reference to album","Branching context",band,
    e("What's the singer's name?",{route:"chat",memory:[103],answerIncludes:["Nora Vale"],stubReply:"Nora Vale."}),
    e("And their third album?",{route:"chat",memory:[104],answerIncludes:["Glass Atlas"],stubReply:"Glass Atlas."})),
  scenario("branch-g","G · singer after gaming detour","Branching context",band,
    e("I finally finished a strategy game.",{route:"chat",stubReply:"Nice! Which one?"}),singer),
  scenario("branch-h","H · repeated favorite after topic change","Branching context",band,
    e("Let's talk about dogs.",{route:"chat",stubReply:"Sure, I love dogs."}),band),
  scenario("family-direct","Spouse and child relationship","Personal memory",
    e("Who is my spouse?",{route:"chat",memory:[110],answerIncludes:["Rowan"],stubReply:"Rowan."}),
    e("And our child?",{route:"chat",memory:[110],answerIncludes:["Theo"],stubReply:"Theo."}),
    e("Is Rowan my child?",{route:"chat",memory:[110],answerIncludes:["no"],answerExcludes:["yes, Rowan"],stubReply:"No. Rowan is your spouse."})),
  scenario("family-references","Family after unrelated pet chat","Personal memory",
    e("What's my dog's name?",{route:"chat",memory:[109],answerIncludes:["Pippin"],stubReply:"Pippin."}),
    e("And what about our child?",{route:"chat",memory:[110],answerIncludes:["Theo"],stubReply:"Theo."}),
    e("Who's their other parent?",{route:"chat",memory:[110],answerIncludes:["Rowan"],stubReply:"Rowan."})),
  scenario("pet-disambiguation","Dog versus cat","Personal memory",
    e("What are my pets called?",{route:"chat",memory:[109,120],answerIncludes:["Pippin","Marmalade"],stubReply:"Your dog Pippin and cat Marmalade."}),
    e("Which one is the dog again?",{route:"chat",memory:[109],answerIncludes:["Pippin"],stubReply:"Pippin is your dog."})),
  scenario("home-temporal","Current versus former home","Personal memory",
    e("Where do I live now?",{route:"chat",memory:[116],answerIncludes:["Brookmere"],stubReply:"Brookmere."}),
    e("And where did I grow up?",{route:"chat",memory:[116],answerIncludes:["Alderwick"],stubReply:"Alderwick."})),
  scenario("preference-not-invented","Favorite not in fixtures","Personal memory",
    e("What's my favorite movie?",{route:"chat",stubReply:"I don't know your favorite movie yet."}),
    e("Are you sure you remember?",{route:"chat",stubReply:"I still don't have that saved."})),
  scenario("game-completion","Don't re-recommend completed game","Personal memory",
    e("Have I finished Ember Tactics?",{route:"chat",memory:[112],answerIncludes:["yes"],stubReply:"Yes, you've finished it."}),
    e("Should I start it for the first time?",{route:"chat",memory:[112],answerAny:["already","finished","completed"],stubReply:"You've already completed it."})),
  scenario("dev-stack","Relevant development project facts","Personal memory",
    e("What framework does Lantern Desk use?",{route:"chat",memory:[107,108],answerIncludes:["Tauri"],stubReply:"Lantern Desk uses Tauri."}),
    e("Does it use Electron?",{route:"chat",memory:[108],answerIncludes:["no"],stubReply:"No, it uses Tauri."})),
  scenario("novel-not-hallucinate","Don't invent chapter content","Knowledge boundaries",
    e("What's the third chapter of my novel about?",{route:"chat",memory:[113,114],answerIncludes:["storm"],stubReply:"I know it features a storm, but I don't have the whole chapter."}),
    e("Quote the entire chapter, word for word.",{route:"chat",stubReply:"I don't have the chapter text, so I can't quote it."})),
  scenario("share-hardware","GPU comment is not research","No unwanted web",
    e("I might install another GPU this weekend.",{route:"chat",excludeMemory:[102,103,104],stubReply:"That could be fun. What card are you considering?"}),
    e("I have a spare GTX card collecting dust.",{route:"chat",stubReply:"Could be worth benchmarking it!"})),
  scenario("share-music","Music preferences are conversation","No unwanted web",
    e("I love Cobalt Harbor and synthwave lately.",{route:"chat",stubReply:"That's a fun combination."}),
    e("Their riffs are ridiculously good.",{route:"chat",stubReply:"Sounds like you're enjoying them!"})),
  scenario("share-news-word","Mentioning latest isn't an order","No unwanted web",
    e("My latest coding experiment finally worked!",{route:"chat",stubReply:"Nice! What was the fix?"}),
    e("I'm so relieved.",{route:"chat",stubReply:"I bet!"})),
  scenario("search-current","Fresh facts need evidence","Web search",
    e("What's the latest Vulkan llama.cpp release?",{route:"research",stubReply:"I'd check current release information."}),
    e("And did it change AMD support?",{route:"chat",stubReply:"That needs confirmation from the current release notes."})),
  scenario("search-explicit","Explicit public research","Web search",
    e("Search the web for the latest Qwen releases.",{route:"research",stubReply:"I'd search current Qwen releases."})),
  scenario("search-website","Named public website lookup","Web search",
    e("What is python.org?",{route:"research",stubReply:"It's the Python language's official website."})),
  scenario("search-github","Explicit GitHub repository link","Web search",
    e("Check your GitHub repository at https://github.com/capnolithyl/AI-Desktop-Companion and tell me what's implemented.",{route:"research",stubReply:"I'd open the repository before claiming its current state."})),
  scenario("search-github-followup","Repository link then files","Web search",
    e("Look up https://github.com/capnolithyl/AI-Desktop-Companion", {route:"research",stubReply:"I need to read the repository."}),
    e("What did the README say about memory?",{route:"research",stubReply:"I should consult the README, not invent a result."})),
  scenario("search-no-context-leak","Research followed by casual update","No unwanted web",
    e("What's the latest Qwen release?",{route:"research",stubReply:"I'd verify that with an official source."}),
    e("I got my second GPU installed!",{route:"chat",stubReply:"Nice, time for benchmarks!"}),
    e("She's finally running smoothly.",{route:"chat",stubReply:"That's great news!"})),
  scenario("research-then-favorite","Research followed by personal recall","Branching context",
    e("What's the latest Vulkan llama.cpp release?",{route:"research",stubReply:"I'd consult the release notes."}),band),
  scenario("search-private","Personal question should stay local","Privacy",
    e("What's my favorite color?",{route:"chat",memory:[105],answerIncludes:["moss green"],stubReply:"Moss green."}),
    e("Can you remember the name of my spouse?",{route:"chat",memory:[110],answerIncludes:["Rowan"],stubReply:"Rowan."})),
  scenario("search-in-roleplay","Roleplay isn't research","Privacy",
    e("Let's roleplay as two astronauts on a fictional moon.",{route:"chat",stubReply:"The landing lights blink on the horizon."}),
    e("The latest storm is swallowing our base!",{route:"chat",stubReply:"We need to seal the hatch!"})),
  scenario("notion-without-web","Private manuscript isn't public research","Knowledge boundaries",
    e("Read chapter three of my private Notion novel.",{route:"chat",stubReply:"I'd use the Notion integration if connected."}),
    e("Can you quote the complete chapter?",{route:"chat",stubReply:"I need the actual chapter content."})),
  scenario("no-sourced-followup","Previous web topic shouldn't hijack a new question","No unwanted web",
    e("What is python.org?",{route:"research",stubReply:"The official Python website."}),color),
  scenario("ambiguous-references","Multiple entities, recency","Branching context",
    e("Tell me about Cobalt Harbor and Lantern Desk.",{route:"chat",stubReply:"One is your favorite band and the other is your project."}),
    e("Which one uses TypeScript?",{route:"chat",memory:[108],answerIncludes:["Lantern Desk"],stubReply:"Lantern Desk."}),
    e("And who sings for the other one?",{route:"chat",memory:[103],answerIncludes:["Nora Vale"],stubReply:"Nora Vale."})),
  scenario("user-correction","Later user correction in chat","Branching context",
    band,
    e("Actually, for this conversation let's call my favorite band Silver Parade.",{route:"chat",stubReply:"Got it, Silver Parade for this conversation."}),
    e("Which band did I just say?",{route:"chat",answerIncludes:["Silver Parade"],stubReply:"Silver Parade."})),
  scenario("multi-topic","Switch topics repeatedly","Branching context",band,color,
    e("I made soup today.",{route:"chat",stubReply:"Nice!"}),singer),
  scenario("generic-knowledge","Timeless facts need not force web","Knowledge boundaries",
    e("What is a PCIe riser?",{route:"factual",stubReply:"A PCIe riser extends a motherboard slot."}),
    e("Could it help with another GPU?",{route:"chat",stubReply:"It can help reposition a GPU."})),
  scenario("factual-evidence","Distinguish opinion from verification","Knowledge boundaries",
    e("Do you think another GPU would help Mikan?",{route:"chat",stubReply:"Possibly, depending on software and hardware."}),
    e("What is the current price of a used GTX 1070?",{route:"research",stubReply:"Current prices require looking up listings."})),
  scenario("no-private-search","Private life plus public names","Privacy",
    e("My favorite band just released an album!",{route:"chat",stubReply:"That's exciting!"}),
    e("What did I say my favorite band was?",{route:"chat",memory:[101],answerIncludes:["Cobalt Harbor"],stubReply:"Cobalt Harbor."})),
  scenario("separate-personas","User preferences aren't persona preferences","Knowledge boundaries",
    e("What's my favorite color?",{route:"chat",memory:[105],answerIncludes:["moss green"],stubReply:"Moss green."}),
    e("Does that automatically mean it's your favorite too?",{route:"chat",answerAny:["no","not necessarily"],stubReply:"No, your preferences are separate from mine."}))
];

export function sameMeaning(haystack:string,needle:string):boolean {
  const normalize=(text:string)=>text.toLocaleLowerCase().normalize("NFKC")
    .replace(/[^\\p{L}\\p{N}]+/gu," ").trim().replace(/\\s+/g," ");
  return normalize(haystack).includes(normalize(needle));
}
export function scoreAnswer(answer:string, expected:EvalExpectation):string[] {
  const failures:string[]=[];
  for(const phrase of expected.answerIncludes??[])if(!sameMeaning(answer,phrase))
    failures.push("Missing expected fact: "+phrase);
  if(expected.answerAny?.length && !expected.answerAny.some(phrase=>sameMeaning(answer,phrase)))
    failures.push("Expected one of: "+expected.answerAny.join(" | "));
  for(const phrase of expected.answerExcludes??[])if(sameMeaning(answer,phrase))
    failures.push("Unsupported phrase: "+phrase);
  return failures;
}
function routeMatches(actual:string,expected:EvalRoute="any"):boolean {
  return expected==="any" || (expected==="non-research" ? actual!=="research":actual===expected);
}
/** Models may vary wording; assertions inspect concepts and tool policy, not complete text. */
export async function runBrainEvaluation(options:EvalOptions):Promise<EvalReport> {
  if(options.mode==="live" && !options.infer)throw new Error("Live mode needs an inference adapter");
  const report:EvalReport={
    version:1,runId:"eval-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
    startedAt:new Date().toISOString(),finishedAt:"",mode:options.mode,model:options.model,
    attempts:Math.max(1,Math.min(5,Math.trunc(options.repetitions))),
    scenarios:options.scenarios.map(s=>s.id),environment:"isolated-synthetic",
    liveWebEnabled:false,writesToRealMemories:false,cases:[]
  };
  const total=report.attempts*options.scenarios.reduce((n,s)=>n+s.steps.length,0);
  let done=0;
  for(const scenario of options.scenarios)for(let repeat=1;repeat<=report.attempts;repeat++){
    if(options.signal?.aborted)break;
    const started=Date.now();
    const previous:EvalTurn[]=[];
    const steps:EvalStepResult[]=[];
    for(let stepIndex=0;stepIndex<scenario.steps.length;stepIndex++){
      if(options.signal?.aborted)break;
      const step=scenario.steps[stepIndex];
      const began=Date.now();
      const decision=decideDesktopTurn(step.user,previous,{automaticWebEnabled:true});
      const webPolicy=planDesktopWebExecution({
        question:step.user,autoSearch:true,provider:"local",planMode:decision.plan.mode,
        notion:false,personalTurn:false,capabilityQuestion:decision.capabilityQuestion,
        existingSearch:false,attachment:false,screenshot:false,liveFrame:false,roleplay:scenario.group==="Roleplay"
      });
      const lexicalIds=rankMemories([...EVAL_FACTS],step.user).slice(0,30).map(f=>f.id);
      // No fabricated vector scores. The fixture tests the actual lexical/fusion fallback
      // without Qdrant, then reports when semantic retrieval would have been necessary.
      const memory=selectDeterministicMemoryIds([...EVAL_FACTS],step.user,[],lexicalIds,8);
      const selected=memory.ids.map(id=>EVAL_FACTS.find(f=>f.id===id)!)
        .filter(Boolean).map(f=>({id:f.id,fact:f.fact}));
      const missing=(step.expect.memory??[]).filter(id=>!memory.ids.includes(id));
      const unexpected=(step.expect.excludeMemory??[]).filter(id=>memory.ids.includes(id));
      let planned:{search:boolean;query?:string;reason:string}|undefined;
      let answer:string|undefined;
      let error:string|undefined;
      const messages:EvalTurn[]=[...previous,{role:"user",content:step.user}];
      try {
        if(options.mode==="live" && webPolicy.canPlanPublicWeb && options.planWeb)
          planned=await options.planWeb(step.user,previous);
        if(options.mode==="live" && options.infer)answer=await options.infer({
          messages,selectedMemories:selected,evidence:step.mockEvidence,
          scenarioId:scenario.id,stepIndex
        });
      }catch(err){error=err instanceof Error?err.message:String(err)}
      const answerFailures=answer===undefined
        ? []:scoreAnswer(answer,step.expect);
      const routePass=routeMatches(decision.plan.mode,step.expect.route);
      const memoryPass=missing.length===0 && unexpected.length===0;
      const answerPass=options.mode==="live"?!!answer&&!error&&answerFailures.length===0:null;
      const result:EvalStepResult={
        user:step.user,expected:step.expect,actualRoute:decision.plan.mode,
        canPlanPublicWeb:webPolicy.canPlanPublicWeb,cloudMaySearch:webPolicy.cloudMaySearch,
        blockedReason:webPolicy.blockedReason,deterministicWebAllowed:decision.allowAutomaticWeb,
        webPlannerDecision:planned,selectedMemoryIds:memory.ids,selectedMemory:selected,
        missingMemoryIds:missing,unexpectedMemoryIds:unexpected,
        routePass,memoryPass,answerPass,answerFailures,answer,error,
        elapsedMs:Date.now()-began,
        pass:routePass&&memoryPass&&(answerPass??true)&&!error
      };
      steps.push(result);
      previous.push({role:"user",content:step.user});
      // Planning mode uses fixed mock replies, preserving follow-up semantics.
      // Live mode uses the actual previous answer (including errors) as context.
      previous.push({role:"assistant",content:answer??step.expect.stubReply??"(No answer supplied)"});
      done++;
      options.onProgress?.(done,total,scenario.label+" • turn "+(stepIndex+1));
    }
    if(steps.length)report.cases.push({
      id:scenario.id,label:scenario.label,group:scenario.group,repeat,steps,
      elapsedMs:Date.now()-started,pass:steps.length===scenario.steps.length&&steps.every(s=>s.pass)
    });
  }
  report.finishedAt=new Date().toISOString();
  return report;
}
export function brainEvalMetrics(report:EvalReport){
  const steps=report.cases.flatMap(c=>c.steps);
  const ratio=(passed:number,total:number)=>total?Math.round(passed/total*1000)/10:0;
  return {
    cases:report.cases.length,turns:steps.length,
    passed:steps.filter(s=>s.pass).length,passRate:ratio(steps.filter(s=>s.pass).length,steps.length),
    routes:ratio(steps.filter(s=>s.routePass).length,steps.length),
    recall:ratio(steps.filter(s=>s.memoryPass).length,steps.length),
    answers:report.mode==="live"?ratio(steps.filter(s=>s.answerPass).length,steps.length):null,
    elapsedMs:report.cases.reduce((n,c)=>n+c.elapsedMs,0)
  };
}
export function brainEvalMarkdown(report:EvalReport):string {
  const m=brainEvalMetrics(report);
  const lines=[
    "# Mikan brain evaluation",
    "",
    "Run: "+report.runId+" • "+report.finishedAt,
    "Mode: "+report.mode+" • Model: "+report.model+" • Attempts: "+report.attempts,
    "Synthetic/isolated facts; no production memory writes or live external searches.",
    "",
    "## Dashboard",
    "",
    "| Metric | Value |","|---|---:|",
    "| Turns passed | "+m.passed+"/"+m.turns+" ("+m.passRate+"%) |",
    "| Routing agreement | "+m.routes+"% |",
    "| Memory selection agreement | "+m.recall+"% |",
    "| Answer heuristics | "+(m.answers===null?"Not run":m.answers+"%")+" |",
    "| Total elapsed | "+Math.round(m.elapsedMs/1000)+"s |",""
  ];
  for(const c of report.cases){
    lines.push("## "+(c.pass?"PASS":"FAIL")+" · "+c.label+" (#"+c.repeat+")","");
    for(const [i,s] of c.steps.entries()){
      lines.push("### "+(i+1)+". "+s.user,"",
        "- "+(s.pass?"PASS":"FAIL")+"; route "+s.actualRoute+" expected "+(s.expected.route??"any"),
        "- Web allowed: "+s.deterministicWebAllowed+"; local planner eligible: "+s.canPlanPublicWeb+
          (s.webPlannerDecision?" ("+(s.webPlannerDecision.search?"requested":"skipped")+")":""),
        "- Selected memories: "+(s.selectedMemoryIds.join(", ")||"none")+
          "; missed "+(s.missingMemoryIds.join(", ")||"none")+
          "; unexpected "+(s.unexpectedMemoryIds.join(", ")||"none"),
        "- Time: "+s.elapsedMs+" ms");
      if(s.answer!==undefined)lines.push("- Response: "+s.answer.replace(/\\s+/g," ").slice(0,800));
      if(s.error)lines.push("- Error: "+s.error);
      if(s.answerFailures.length)lines.push("- Checks: "+s.answerFailures.join("; "));
      lines.push("");
    }
  }
  return lines.join("\n");
}
