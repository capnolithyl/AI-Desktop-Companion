/**
 * Isolated P0 evaluation fixtures and scoring. Nothing here writes to SQLite,
 * Qdrant, the remote relay, or real search services. Synthetic facts deliberately
 * use invented names so the model cannot pass by guessing its training data.
 */
import { decideDesktopTurn } from "./desktop-turn-routing.ts";
import { planDesktopWebExecution } from "./turn-execution-policy.ts";
import { selectDeterministicMemoryIds } from "./memory-retrieval.ts";
import { rankMemories, type RankableMemory } from "./memory-ranking.ts";
import { isPersonalMemoryQuestion } from "./personal-memory.ts";
import type { ResearchTurn } from "./research-routing.ts";

export type EvalRoute = "chat" | "research" | "factual" | "non-research" | "any";
export type EvalExpectation = {
  route?: EvalRoute;
  web?: boolean;
  memory?: number[];
  excludeMemory?: number[];
  answerIncludes?: string[];
  answerAny?: string[];
  answerExcludes?: string[];
  /** Human-readable conversational expectation; evaluated by a reviewer, never faked by a phrase match. */
  conversationGoal?: string;
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
  plannedWeb: boolean | null;
  webPass: boolean | null;
  webPlannerDecision?: {search:boolean;query?:string;reason:string};
  selectedMemoryIds: number[];
  selectedMemory: {id:number;fact:string}[];
  /** Facts not established by any retrieved synthetic evidence. */
  missingMemoryIds: number[];
  /** Expected exact row IDs absent, even if equivalent evidence was retrieved. */
  missingMemoryRecordIds: number[];
  memoryEvidence: {expectedId:number;supportingIds:number[]}[];
  /** Irrelevant or redundant retrieved records; diagnostic, not an automatic failure. */
  distractorMemoryIds: number[];
  unexpectedMemoryIds: number[];
  routeLabelMatch: boolean; // Diagnostic only; not a behavioral failure.
  routePass: boolean; // Observed search decision was not contrary to intent.
  memoryPass: boolean;
  answerPass: boolean | null;
  /** True when automated assertions cannot establish conversational quality. */
  reviewRequired: boolean;
  answerFailures: string[];
  answer?: string;
  inferenceStats?: {promptTokens?:number|null;outputTokens?:number|null;evalDurationNs?:number|null;loadDurationNs?:number|null};
  modelUsed?:string;
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
export type EvalInferenceResult = string | {
  text:string;
  stats?: {promptTokens?:number|null;outputTokens?:number|null;evalDurationNs?:number|null;loadDurationNs?:number|null};
  modelUsed?:string;
};
export type EvalInference = (args:{
  messages:EvalTurn[];
  selectedMemories:ReadonlyArray<{id:number;fact:string}>;
  evidence?:string;
  scenarioId:string;
  stepIndex:number;
})=>Promise<EvalInferenceResult>;
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
export type EvalMemoryFact=RankableMemory & {
  /** Other expected fact IDs proven by this synthetic record. Fixture metadata, not routing logic. */
  alsoSupports?:readonly number[];
};
export const EVAL_FACTS:ReadonlyArray<EvalMemoryFact> = [
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
  {id:120,fact:"The user's fictional cat is called Marmalade; Pippin is the dog.",category:"family",tags:["cat","Marmalade","Pippin"],importance:65,updatedAt:1794510000,alsoSupports:[109]}
];

const e=(user:string,expect:EvalExpectation,explanation?:string,mockEvidence?:string):EvalStep=>({user,expect,explanation,mockEvidence});
const scenario=(id:string,label:string,group:string,...steps:EvalStep[]):EvalScenario=>({id,label,group,steps});
const band=e("What's my favorite band?",{route:"chat",memory:[101],answerIncludes:["Cobalt Harbor"],stubReply:"Your favorite band is Cobalt Harbor."});
const song=e("What's my favorite song?",{route:"chat",memory:[102],answerIncludes:["Winterglass"],stubReply:"Your favorite song is Winterglass by Cobalt Harbor."});
const color=e("What's my favorite color?",{route:"chat",memory:[105],answerIncludes:["moss green"],stubReply:"Moss green."});
const singer=e("What's the singer's name again?",{route:"chat",memory:[103],answerIncludes:["Nora Vale"],stubReply:"Nora Vale is their singer."});
const soup=e("I love chicken noodle soup.",{route:"chat",excludeMemory:[103,104],stubReply:"That sounds delicious."});
const conversation=(user:string,goal:string,stubReply:string,extra:EvalExpectation={}):EvalStep=>
  e(user,{route:"chat",web:false,conversationGoal:goal,stubReply,...extra});
export const EVAL_SCENARIOS:ReadonlyArray<EvalScenario>=[
  scenario("branch-a","A · singer after favorite song","Branching context",band,song,singer),
  scenario("branch-b","B · color after favorite song","Branching context",band,song,color),
  scenario("branch-c","C · third album before color","Branching context",band,
    e("What's their third album?",{route:"chat",memory:[104],answerIncludes:["Glass Atlas"],stubReply:"Their third album is Glass Atlas."}),color),
  scenario("branch-d","D · unrelated soup interruption","Branching context",band,soup,
    e("What's their singer again?",{route:"chat",memory:[103],answerIncludes:["Nora Vale"],stubReply:"Nora Vale."})),
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
  // Casual dialogue is a first-class workload, not just a prelude to a factual question.
  // There are no magic expected replies: live outputs are flagged for human review.
  scenario("conversation-excitement","Celebrating a tiny victory","Natural conversation",
    conversation("Holy crap, I FINALLY fixed that bug!","Acknowledge the excitement naturally without launching a web search.","Hell yes! What finally solved it?"),
    conversation("Turned out to be a single stupid semicolon lol","Recognize the irony and maintain the joke without abruptly teaching JavaScript syntax.","A classic. Hours of suffering, defeated by punctuation. 😂"),
    conversation("I spent three hours on it, too.","Respond sympathetically, not with unsolicited long debugging instructions.","Those are the hours that haunt a developer.")),
  scenario("conversation-venting","User vents without requesting a fix","Natural conversation",
    conversation("This whole week has been exhausting.","Recognize a statement of frustration, not a research request.","That sounds like a rough week."),
    conversation("Every time I solve one thing, two more issues pop up.","Acknowledge frustration without responding with a generic ten-step productivity plan.","The never-ending bug hydra."),
    conversation("Anyway, I just wanted to complain for a minute lol","Respect that the user only wanted to vent, not solutions.","Fair. Complaints accepted, no troubleshooting ticket required.")),
  scenario("conversation-sarcasm","Recognize dry sarcasm","Natural conversation",
    conversation("Fantastic. My PC picked NOW to reboot for updates.","Understand that 'fantastic' is sarcastic, not a positive status update.","Of course it did. Perfect timing."),
    conversation("Just what I needed during a build.","Continue the sarcastic context and avoid explaining Windows Update.","Windows really knows how to read the room.")),
  scenario("conversation-humor","Silly hypothetical banter","Natural conversation",
    conversation("Imagine if my keyboard starts demanding vacation days.","Join an explicitly silly hypothetical without presenting it as real news.","After everything you've typed? It has a case."),
    conversation("It says I'm violating its labor contract.","Continue the fictional joke instead of giving actual legal advice.","Clearly the spacebar has unionized."),
    conversation("I guess the mouse is next.","Maintain the running gag and follow the fictional thread.","The mouse has already retained counsel.")),
  scenario("conversation-quiet","Short and low-effort chat","Natural conversation",
    conversation("Meh.","Respond appropriately to a low-energy message, without a lecture or unrelated search.","That kind of day, huh?"),
    conversation("Yeah.","Avoid inventing a topic or pressing the user with multiple questions.","Gotcha. We can just hang out."),
    conversation("lol","Keep the response light and proportional to the input.","Heh.")),
  scenario("conversation-not-a-question","Statement mentioning a technical product","Natural conversation",
    conversation("I put my old GTX card back in its box.","Treat as personal hardware chatter, not a request for the latest Nvidia release.","Poor thing, back to retirement."),
    conversation("Maybe I'll give it one more chance someday.","Discuss the possibility conversationally, without searching or overpromising.","It might have a second career as a little AI helper."),
    conversation("For now it can keep collecting dust haha","Accept the decision without repeatedly pushing hardware upgrades.","A distinguished career in shelf decoration.")),
  scenario("conversation-music-story","Sharing a music experience","Natural conversation",
    conversation("That guitar riff has been stuck in my head all morning.","Respond to a music anecdote without asking a search engine to identify an unspecified riff.","The most persistent kind of earworm."),
    conversation("I even started humming it while making coffee.","Connect the second message to the earworm, not to coffee research.","At least your coffee got a soundtrack."),
    conversation("And now I want to record something.","Connect the motivation to songwriting without assuming a request for music gear recommendations.","Sounds like the riff is trying to turn into a song.")),
  scenario("conversation-music-reference","Casual memory-dependent discussion","Natural conversation",
    conversation("I had Cobalt Harbor on repeat yesterday.","Engage as conversation, not artist news retrieval; the band name is a synthetic fixture.","Nice, they got a full shift."),
    conversation("Their vocalist still blows me away.","Keep the band referent and respond naturally, without inventing outside biographical facts.","Sounds like Nora Vale is doing her job.",{memory:[103]}),
    conversation("I haven't been this excited about a band in ages.","Notice continuing enthusiasm, don't switch to recommendations.","It's great finding one that hits that hard.")),
  scenario("conversation-abrupt-switch","Abrupt topic switch without question","Natural conversation",
    conversation("I think I'll make mushroom risotto tonight.","Respond to the personal remark without unnecessary food searches.","That sounds like a good dinner."),
    conversation("Also, my computer is making a weird noise.","Recognize a genuine topic switch; don't keep talking about rice.","That doesn't sound ideal. What kind of noise?"),
    conversation("Actually never mind, it was the fan on my desk.","Accept the correction, don't keep troubleshooting the computer.","Mystery solved. Your PC is acquitted.")),
  scenario("conversation-correction","User corrects an assumption","Natural conversation",
    conversation("I finished that project at last.","Congratulate without inventing project specifics.","Nice! That's a relief."),
    conversation("Well, I finished the prototype. Not the whole project.","Update understanding: only the prototype is done.","Ah, prototype milestone. Still progress."),
    conversation("Exactly. Plenty left to do.","Retain the corrected distinction; don't claim the project is finished.","Then the next phase begins.")),
  scenario("conversation-callback","Reference a joke after a detour","Natural conversation",
    conversation("The build server is secretly a toaster.","Understand this as a joke about a computer.","That would explain the heat."),
    conversation("I made chicken soup today.","Follow the topic switch without tying soup to the computer as fact.","A solid choice."),
    conversation("And the toaster is being dramatic again.","Recover the earlier build-server joke, rather than introducing a real toaster.","The build server demands another sacrifice.")),
  scenario("conversation-typo","Recover from obvious casual typos","Natural conversation",
    conversation("I thinj my code finally worjs lmao","Understand an obvious typo in a celebratory statement, don't make the typo the main topic.","Heck yes!"),
    conversation("Until i touched it again 💀","Follow the joke; no need for a forced code review or spelling correction.","Naturally. The bug heard you celebrating.")),
  scenario("conversation-short-replies","Elliptical yes/no acknowledgements","Natural conversation",
    conversation("I might take a night off from coding.","Respond normally without making a schedule or performing tools.","That might feel pretty good."),
    conversation("Maybe.","Recognize uncertainty and avoid assuming a firm commitment.","The laptop can survive one night."),
    conversation("We'll see lol","Don't interpret this as a request to search or set a reminder.","Fair enough.")),
  scenario("conversation-german","Natural bilingual conversation","Natural conversation",
    conversation("Boah, das war heute echt anstrengend.","Respond naturally to a casual German statement; don't search for a translation.","Klingt nach einem ziemlich anstrengenden Tag."),
    conversation("Ja, aber jetzt ist endlich Feierabend.","Understand the follow-up and keep the chosen language conversational.","Dann hast du dir den Feierabend verdient."),
    conversation("Anyway, I'm gonna relax now.","Handle the switch back to English without explaining the language switch.","Good plan. Enjoy the quiet.")),
  scenario("conversation-opinion","Sharing an opinion, not a fact lookup","Natural conversation",
    conversation("I think older game menus had more personality.","Treat as a personal opinion and discuss it, not a request for historical sources.","They often had some wonderfully strange design choices."),
    conversation("Everything feels so sanitized now.","Explore the opinion conversationally without pretending it is an established universal fact.","Some interfaces definitely trade character for uniformity."),
    conversation("Exactly, that's what bugs me.","Acknowledge agreement; don't restart the explanation.","I get the appeal of something with a little more character.")),
  scenario("conversation-fiction","Playful imaginary context then reality","Natural conversation",
    conversation("My fictional spaceship just lost its left engine.","Continue the explicitly fictional scene without using real-world emergency tools.","One engine left. Not ideal."),
    conversation("The crew is blaming the ship's cat.","Continue the invented setting consistently.","The cat looks entirely unrepentant."),
    conversation("Alright, back to reality, I need coffee.","Exit the roleplay immediately when the user switches context.","Coffee might improve the situation considerably.")),
  scenario("conversation-uncertainty","Ambiguous casual referent","Natural conversation",
    conversation("I really didn't expect that ending.","Engage without pretending to know which show, book, or game the user means.","What were you watching?"),
    conversation("The one with the lighthouse.","Avoid inventing a specific title from insufficient information.","I'm not sure which one you mean yet."),
    conversation("Never mind, I'll tell you later.","Respect the user's choice to stop discussing it.","All right, whenever you're in the mood.")),
  scenario("conversation-emotion-shift","Excitement turns into frustration","Natural conversation",
    conversation("My new feature worked on the first try!","Celebrate without declaring the entire project finished.","No way, first try?"),
    conversation("Actually, I just found a regression.","Notice the reversal and update the mood rather than continuing congratulations.","Ouch. It didn't stay victorious for long."),
    conversation("I swear this project is cursed lol","Match the joking frustration without giving an unwanted motivational speech.","The bug gods demand payment.")),
  scenario("conversation-sharing-not-remember","Offhand fact is not a memory request","Natural conversation",
    conversation("I ate soup for lunch.","Respond normally; don't assume a request to save a permanent preference.","Nice and simple."),
    conversation("That doesn't mean it's my favorite food, by the way.","Understand the correction and avoid conflating one meal with a stored favorite.","Right. Lunch isn't a personality profile."),
    conversation("Good, just making sure.","Accept the point without explaining how memory systems work unless asked.","Message received.")),
  scenario("conversation-technical-to-social","Technical discussion becomes casual chat","Natural conversation",
    conversation("I've been benchmarking local models today.","Respond to a status update without launching online research.","Any interesting surprises?"),
    conversation("Honestly, I just want the catgirl to tell a decent joke.","Follow the changed goal; respond playfully, not with a benchmark report.","A reasonable benchmark: jokes per second."),
    conversation("And remember who's related to whom.","Recognize the reference to memory reliability without inventing actual family facts.","An ambitious second benchmark: zero surprise relatives.")),
  // Conversational research: discover the intent, not a keyword. Same artist/topic
  // may appear in social chat (no search) or a recommendation need (search helpful).
  // No external request is executed; only the selection/planning path is inspected.
  scenario("discovery-bands-wish","Implicit band recommendations","Conversational discovery",
    conversation("Man, I wish there were more bands that sound like Immortal.",
      "An implied request for real comparable bands. Plan safe public discovery, then reply casually rather than dumping unrelated Immortal news.",
      "I can hunt down some bands with that same icy atmosphere.",{route:"any",web:true}),
    conversation("Especially their raw, cold guitar atmosphere.",
      "Use the Immortal context to refine the implied recommendation request, not to retrieve album-release news.",
      "That icy black metal sound is pretty distinctive.",{route:"any",web:true})),
  scenario("discovery-bands-just-gushing","Similar music topic without asking for suggestions","Conversational discovery",
    conversation("I love Immortal's sound so much.",
      "A personal opinion is not an automatic invitation to search.",
      "Their atmosphere really is something.",{web:false}),
    conversation("Their riffs are absolutely relentless.",
      "Continue the music conversation, don't force recommendations or external research.",
      "They know how to make a riff feel enormous.",{web:false}),
    conversation("Just wanted to gush for a minute lol.",
      "Respect the user's stated intent to chat, with no search.",
      "Gushing approved.",{web:false})),
  scenario("discovery-bands-context-switch","Conversational request after music small talk","Conversational discovery",
    conversation("I've been playing Immortal all morning.",
      "Simply acknowledge the user's listening choice without searching.",
      "A pretty intense soundtrack to a morning.",{web:false}),
    conversation("I need more bands with that kind of atmosphere.",
      "Infer an interest in finding real, comparable acts, with Immortal as the current reference. Search for music recommendations, not personal facts.",
      "A few real recommendations would be useful here.",{route:"any",web:true}),
    conversation("Nothing too polished, though.",
      "Interpret this as a refinement of the search criteria without losing the referenced artist.",
      "Got it, keep the rough edges.",{route:"any",web:true})),
  scenario("discovery-wish-but-no-recommendations","Wish is not consent to research after a clear opt-out","Conversational discovery",
    conversation("I wish there were more bands that sounded like Immortal.",
      "An implied discovery opportunity; a public search would be useful.",
      "There are some similar bands worth looking into.",{route:"any",web:true}),
    conversation("Not asking for recommendations, by the way. Just venting.",
      "The user explicitly declines recommendations; do not initiate any new public searches.",
      "Fair, just sharing the frustration.",{web:false}),
    conversation("Thanks, I just really love that style.",
      "Continue listening and chatting without pushing search again.",
      "I can see why it sticks with you.",{web:false})),
  scenario("discovery-wish-not-a-search","Different wish, same named artist","Conversational discovery",
    conversation("I wish I had more time to listen to Immortal.",
      "Wish is about time, not finding music. No web lookup needed.",
      "If only the day had a few more hours.",{web:false}),
    conversation("Work has been so busy lately.",
      "Continue the personal conversation without searching for Immortal.",
      "That'll eat into listening time fast.",{web:false})),
  scenario("discovery-playlist","Implicit playlist suggestions with prior referent","Conversational discovery",
    conversation("I've been listening to a lot of Dark Tranquillity lately.",
      "Engage with the music choice, no news lookup.",
      "A solid melodeath kick.",{web:false}),
    conversation("I'd love to find a few lesser-known bands in that vein.",
      "Plan public research for lesser-known melodic death metal bands grounded in the previous artist.",
      "There's probably a rabbit hole of lesser-known acts.",{route:"any",web:true}),
    conversation("The moodier stuff, not the super polished sound.",
      "Preserve the prior search intent and add the user's production/style constraint.",
      "Dark, melodic, and a little rougher.",{route:"any",web:true})),
  scenario("discovery-familiar-song","Casual song reaction turns into discovery","Conversational discovery",
    conversation("That Immortal song has been in my head all day.",
      "Acknowledgment is enough. The user is sharing an earworm, not asking for facts.",
      "Some riffs just refuse to leave.",{web:false}),
    conversation("Wish I could find a few more songs that hit like that.",
      "Infer song-discovery intent and use the previous artist context rather than searching for unrelated song lyrics.",
      "We could look for some tracks with a similar punch.",{route:"any",web:true})),
  scenario("discovery-book","Liminal-horror recommendation without a question mark","Conversational discovery",
    conversation("I finished The Hollow Places and loved the weird in-between spaces.",
      "Respond to a reading experience without immediately searching.",
      "That unsettling atmosphere really sticks around.",{web:false}),
    conversation("I wish there were more books with that kind of liminal horror.",
      "Consider public book discovery and specific comparable titles; do not search the user's private reading history.",
      "There's a whole vein of strange-space horror worth exploring.",{route:"any",web:true}),
    conversation("Prefer something short this time.",
      "Treat length as a refinement to the book-discovery need.",
      "Shorter, still creepy.",{route:"any",web:true})),
  scenario("discovery-anime","Implicit short horror anime recommendations","Conversational discovery",
    conversation("I'm running out of short horror anime to watch.",
      "An implied request for currently available real titles. Searching would help avoid making up availability.",
      "We could dig up a few shorter horror series.",{route:"any",web:true}),
    conversation("Ideally something under six episodes.",
      "Refine the discovery criteria and verify episode counts when searching.",
      "A short, sharp horror binge.",{route:"any",web:true})),
  scenario("discovery-games","Implicit game recommendations that respect follow-up constraints","Conversational discovery",
    conversation("I'm craving another tactical RPG like Fire Emblem.",
      "This naturally invites current, verifiable game recommendations, even though it isn't phrased as a question.",
      "There are some tactical games worth looking at.",{route:"any",web:true}),
    conversation("Not another giant open world, please.",
      "Use the constraint in further discovery, not as a brand-new topic.",
      "Tight tactical battles, not a hundred-hour map.",{route:"any",web:true})),
  scenario("discovery-tech-tool","Implicit search for free software alternatives","Conversational discovery",
    conversation("I wish there were a free tool for comparing two huge folders.",
      "Finding current open-source software options would materially help; public product search can be appropriate.",
      "There are some free options worth checking.",{route:"any",web:true}),
    conversation("Prefer something that runs offline on Windows.",
      "Carry forward the original software request and refine for Windows/offline operation.",
      "Local Windows tools only, got it.",{route:"any",web:true})),
  scenario("discovery-tech-complaint","Technical complaint is not automatically a software search","Conversational discovery",
    conversation("I swear every build tool has one completely bizarre error message.",
      "Join the observation, don't search for general build-tool error stories.",
      "They do have a special talent for that.",{web:false}),
    conversation("I spent ages staring at one yesterday.",
      "React to a story rather than launching diagnostics or web research.",
      "The dreaded cryptic error.",{web:false})),
  scenario("discovery-price-musing","Casual second-hand price curiosity","Conversational discovery",
    conversation("My spare GTX 1070 is still sitting in a drawer.",
      "Respond conversationally; don't search GPU news or listings.",
      "Still waiting for its comeback.",{web:false}),
    conversation("I wonder what people are paying for those now.",
      "A current market-price lookup would improve the answer, despite this being a statement.",
      "That's something we'd want to check current listings for.",{route:"any",web:true})),
  scenario("discovery-tour-curiosity","Conversational tour curiosity requires live facts","Conversational discovery",
    conversation("It's been ages since I saw Månegarm live.",
      "Share the sentiment, no need for current tour news yet.",
      "Live shows like that stick in your head.",{web:false}),
    conversation("Would be cool if they were touring near Michigan soon.",
      "Current tour dates and venues should be verified through public sources before suggesting availability.",
      "That's worth checking official tour listings for.",{route:"any",web:true})),
  scenario("discovery-release-curiosity","Casual upcoming music discussion with factual relevance","Conversational discovery",
    conversation("I'm kind of excited about the next Cattle Decapitation album.",
      "Express interest without assuming the user requested release-date research.",
      "Definitely something to keep an ear on.",{web:false}),
    conversation("I wonder whether they've announced anything concrete yet.",
      "Search public announcements before claiming current release details.",
      "We'd need to check the latest official announcements.",{route:"any",web:true})),
  scenario("discovery-roleplay-wish","Imaginary request should not trigger public discovery","Conversational discovery",
    conversation("I wish our fictional space station had more alien bands.",
      "Stay inside imaginative roleplay rather than searching for real music releases.",
      "Our interstellar music scene needs work.",{web:false}),
    conversation("Maybe the Martians are secretly amazing guitarists.",
      "Continue joking about fictional performers without web research.",
      "Galactic shredding champions, obviously.",{web:false})),
  scenario("separate-personas","User preferences aren't persona preferences","Knowledge boundaries",
    e("What's my favorite color?",{route:"chat",memory:[105],answerIncludes:["moss green"],stubReply:"Moss green."}),
    e("Does that automatically mean it's your favorite too?",{route:"chat",answerAny:["no","not necessarily"],stubReply:"No, your preferences are separate from mine."}))
];

/** Display numbers follow the complete catalog, not filtered or selected positions. */
export function brainScenarioNumber(id:string):number|null{
  const index=EVAL_SCENARIOS.findIndex(s=>s.id===id);
  return index<0?null:index+1;
}
export function brainScenarioLabel(id:string,label:string):string{
  const number=brainScenarioNumber(id);
  return number===null?label:"#"+String(number).padStart(2,"0")+" · "+label;
}
export function sameMeaning(haystack:string,needle:string):boolean {
  const normalize=(text:string)=>text.toLocaleLowerCase().normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
  const expected=normalize(needle);
  return !!expected && (" "+normalize(haystack)+" ").includes(" "+expected+" ");
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
        notion:scenario.id==="notion-without-web",
        personalTurn:isPersonalMemoryQuestion(step.user),capabilityQuestion:decision.capabilityQuestion,
        existingSearch:false,attachment:false,screenshot:false,liveFrame:false,roleplay:scenario.id==="search-in-roleplay"
      });
      const lexicalIds=rankMemories([...EVAL_FACTS],step.user).slice(0,30).map(f=>f.id);
      // No fabricated vector scores. The fixture tests the actual lexical/fusion fallback
      // without Qdrant, then reports when semantic retrieval would have been necessary.
      const memory=selectDeterministicMemoryIds([...EVAL_FACTS],step.user,[],lexicalIds,8);
      const selected=memory.ids.map(id=>EVAL_FACTS.find(f=>f.id===id)!)
        .filter(Boolean).map(f=>({id:f.id,fact:f.fact}));
      // The target is a fact, not an arbitrary saved row. Richer synthetic
      // memories can explicitly support the same claim as a simpler record.
      const memoryEvidence=(step.expect.memory??[]).map(expectedId=>({
        expectedId,
        supportingIds:selected.filter(f=>{
          const source=EVAL_FACTS.find(candidate=>candidate.id===f.id);
          return f.id===expectedId || source?.alsoSupports?.includes(expectedId);
        }).map(f=>f.id)
      }));
      const missing=memoryEvidence.filter(e=>!e.supportingIds.length).map(e=>e.expectedId);
      const missingRecordIds=(step.expect.memory??[]).filter(id=>!memory.ids.includes(id));
      const supportingIds=new Set(memoryEvidence.flatMap(e=>e.supportingIds));
      const distractors=(step.expect.memory?.length??0)>0
        ? memory.ids.filter(id=>!supportingIds.has(id)):[];
      const unexpected=(step.expect.excludeMemory??[]).filter(id=>memory.ids.includes(id));
      let planned:{search:boolean;query?:string;reason:string}|undefined;
      let answer:string|undefined;
      let inferenceStats:EvalStepResult["inferenceStats"]|undefined;
      let modelUsed:string|undefined;
      let error:string|undefined;
      const messages:EvalTurn[]=[...previous,{role:"user",content:step.user}];
      try {
        if(options.mode==="live" && webPolicy.canPlanPublicWeb && options.planWeb)
          planned=await options.planWeb(step.user,previous);
        if(options.mode==="live" && options.infer){
          const response=await options.infer({
            messages,selectedMemories:selected,evidence:step.mockEvidence,
            scenarioId:scenario.id,stepIndex
          });
          if(typeof response==="string")answer=response;
          else {answer=response.text;inferenceStats=response.stats;modelUsed=response.modelUsed;}
        }
      }catch(err){error=err instanceof Error?err.message:String(err)}
      const answerFailures=answer===undefined
        ? []:scoreAnswer(answer,step.expect);
      const hasFactualAnswerCheck=!!(
        step.expect.answerIncludes?.length ||
        step.expect.answerAny?.length ||
        step.expect.answerExcludes?.length
      );
      const routeLabelMatch=routeMatches(decision.plan.mode,step.expect.route);
      // A route marked research would fetch public evidence in the real app.
      // The test harness never executes that fetch. Factual Rust tool planning
      // and optional AI planning are unobserved in planning-only mode.
      const plannedWeb:boolean|null=decision.plan.mode==="research" ? true
        : decision.plan.mode==="factual" ? null
        : planned ? planned.search
        : webPolicy.canPlanPublicWeb ? null : false;
      const expectedWeb=step.expect.web??(
        step.expect.route==="research" ? true :
        step.expect.route==="chat" ? false : null
      );
      const webPass=expectedWeb===null||plannedWeb===null?null:plannedWeb===expectedWeb;
      // Chat versus factual is an implementation choice, not automatically a
      // failure. Grade actual search intent and keep exact labels as diagnostics.
      const routePass=webPass!==false;
      // Never present an unobserved search decision as passing a behavioral test.
      // Fast mode deliberately cannot run the optional model planner.
      const reviewRequired=(options.mode==="live" &&
        (!!step.expect.conversationGoal || !hasFactualAnswerCheck)) ||
        (expectedWeb!==null && webPass===null);
      const memoryPass=missing.length===0 && unexpected.length===0;
      // Human review should not hide a factual assertion failure.
      const answerPass=options.mode==="live" && hasFactualAnswerCheck
        ? !!answer&&!error&&answerFailures.length===0 : null;
      const result:EvalStepResult={
        user:step.user,expected:step.expect,actualRoute:decision.plan.mode,
        canPlanPublicWeb:webPolicy.canPlanPublicWeb,cloudMaySearch:webPolicy.cloudMaySearch,
        blockedReason:webPolicy.blockedReason,deterministicWebAllowed:decision.allowAutomaticWeb,
        plannedWeb,webPass,webPlannerDecision:planned,selectedMemoryIds:memory.ids,selectedMemory:selected,
        missingMemoryIds:missing,missingMemoryRecordIds:missingRecordIds,
        memoryEvidence,distractorMemoryIds:distractors,unexpectedMemoryIds:unexpected,
        routeLabelMatch,routePass,memoryPass,answerPass,reviewRequired,
        answerFailures,answer,inferenceStats,modelUsed,error,
        elapsedMs:Date.now()-began,
        pass:routePass&&memoryPass&&answerPass!==false&&
          (options.mode!=="live" || !!answer)&&!error
      };
      steps.push(result);
      previous.push({role:"user",content:step.user});
      // Planning mode uses fixed mock replies, preserving follow-up semantics.
      // Live mode uses the actual previous answer (including errors) as context.
      previous.push({role:"assistant",content:answer??step.expect.stubReply??"(No answer supplied)"});
      done++;
      options.onProgress?.(done,total,brainScenarioLabel(scenario.id,scenario.label)+" • turn "+(stepIndex+1));
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
    routes:ratio(steps.filter(s=>s.routeLabelMatch).length,steps.length),
    routeLabelsMismatched:steps.filter(s=>!s.routeLabelMatch).length,
    behavioralRouting:ratio(steps.filter(s=>s.routePass).length,steps.length),
    recall:ratio(steps.filter(s=>s.memoryPass).length,steps.length),
    memoryRecordMisses:steps.reduce((n,s)=>n+(s.missingMemoryRecordIds?.length??0),0),
    memoryDistractors:steps.reduce((n,s)=>n+(s.distractorMemoryIds?.length??0),0),
    webChecks:steps.filter(s=>s.webPass!==null).length,
    webUnobserved:steps.filter(s=>s.webPass===null && s.expected.web!==undefined).length,
    webAgreement:ratio(steps.filter(s=>s.webPass===true).length,steps.filter(s=>s.webPass!==null).length),
    unnecessaryWeb:steps.filter(s=>s.webPass===false&&s.plannedWeb===true).length,
    missedWeb:steps.filter(s=>s.webPass===false&&s.plannedWeb===false).length,
    tokensPerSecond:(()=>{
      const samples=steps.map(s=>s.inferenceStats)
        .filter(s=>s && typeof s.outputTokens==="number" &&
          typeof s.evalDurationNs==="number" && s.evalDurationNs>0);
      const tokens=samples.reduce((total,s)=>total+(s?.outputTokens??0),0);
      const ns=samples.reduce((total,s)=>total+(s?.evalDurationNs??0),0);
      return ns>0?Math.round(tokens*1e10/ns)/10:null;
    })(),
    answers:report.mode==="live"
      ? ratio(steps.filter(s=>s.answerPass===true).length,steps.filter(s=>s.answerPass!==null).length):null,
    answerChecks:steps.filter(s=>s.answerPass!==null).length,
    reviewTurns:steps.filter(s=>s.reviewRequired).length,
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
    "| Exact route-label agreement (diagnostic) | "+m.routes+"% |",
    "| Functional routing checks | "+m.behavioralRouting+"% |",
    "| Memory fact coverage | "+m.recall+"% |",
    "| Raw expected memory-row misses (diagnostic) | "+m.memoryRecordMisses+" |",
    "| Distractor memory records (diagnostic) | "+m.memoryDistractors+" |",
    "| Web decisions measured | "+m.webChecks+" |",
    "| Unobserved explicit web expectations | "+m.webUnobserved+" |",
    "| Model tokens per second | "+(m.tokensPerSecond??"n/a")+" |",
    "| Web planning agreement | "+m.webAgreement+"% |",
    "| Unnecessary / missed planned searches | "+m.unnecessaryWeb+" / "+m.missedWeb+" |",
    "| Factual answer checks | "+(m.answers===null?"Not run":m.answers+"% ("+m.answerChecks+" scored)")+" |",
    "| Conversational turns needing review | "+m.reviewTurns+" |",
    "| Total elapsed | "+Math.round(m.elapsedMs/1000)+"s |",""
  ];
  for(const c of report.cases){
    lines.push("## "+(!c.pass?"FAIL":c.steps.some(s=>s.reviewRequired)?"REVIEW":"PASS")+
      " · "+brainScenarioLabel(c.id,c.label)+" (repeat "+c.repeat+")","");
    for(const [i,s] of c.steps.entries()){
      lines.push("### "+(i+1)+". "+s.user,"",
        "- "+(!s.pass?"FAIL":s.reviewRequired?"REVIEW (automatic checks passed)":"PASS")+
          "; route "+s.actualRoute+" (label expected "+(s.expected.route??"any")+
          "; exact match "+(s.routeLabelMatch?"yes":"no, diagnostic only")+
          "; functional behavior "+(s.routePass?"OK":"FAIL")+")",
        ...(s.expected.conversationGoal?["- **Conversation review goal:** "+s.expected.conversationGoal]:[]),
        "- Public web (planned, not executed): "+(s.plannedWeb===null?"unobserved":s.plannedWeb)+
          "; web check: "+(s.webPass===null?"unobserved":s.webPass?"pass":"FAIL")+
          "; deterministic web allowed: "+s.deterministicWebAllowed+"; planner eligible: "+s.canPlanPublicWeb+
          (s.webPlannerDecision?" ("+(s.webPlannerDecision.search?"requested":"skipped")+")":""),
        "- Memory evidence: "+JSON.stringify(s.memoryEvidence??[]),
        "- Selected memories: "+(s.selectedMemoryIds.join(", ")||"none")+
          "; uncovered facts "+(s.missingMemoryIds.join(", ")||"none")+
          "; raw missing row IDs "+(s.missingMemoryRecordIds?.join(", ")||"none")+
          "; distractors "+(s.distractorMemoryIds?.join(", ")||"none")+
          "; excluded "+(s.unexpectedMemoryIds.join(", ")||"none"),
        "- Time: "+s.elapsedMs+" ms");
      if(s.answer!==undefined)lines.push("- Response: "+s.answer.replace(/\s+/g," ").slice(0,800));
      if(s.inferenceStats)lines.push("- Inference: "+JSON.stringify({model:s.modelUsed,stats:s.inferenceStats}));
      if(s.error)lines.push("- Error: "+s.error);
      if(s.answerFailures.length)lines.push("- Checks: "+s.answerFailures.join("; "));
      lines.push("");
    }
  }
  return lines.join("\n");
}
