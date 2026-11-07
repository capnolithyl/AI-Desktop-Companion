import test from "node:test";
import assert from "node:assert/strict";
import { researchRequest, isPocketResearchFollowup, isResearchFollowup, planResearch, buildResearchQuery, stripUnsupportedCitations } from "./research-routing.ts";

test("freshness and explicit research use an online search, not a guessed reply", () => {
  assert.deepEqual(researchRequest("What's the latest news about Artemis?"),
    { query: "What's the latest news about Artemis?", recent: true });
  assert.deepEqual(researchRequest("Search for the latest Amon Amarth tour dates"),
    { query: "Search for the latest Amon Amarth tour dates", recent: true });
  assert.deepEqual(researchRequest("What is the capital of Germany?"),
    { query: "What is the capital of Germany?", recent: false });
});

test("casual conversation, personal memory and roleplay stay local", () => {
  for (const text of ["Hi Mikan!", "How are you?", "What do you think of metal?",
    "What's my favorite color?", "Tell me about yourself", "Remember that I like cats"]) {
    assert.equal(researchRequest(text), null, text);
  }
});

test("relevant follow-ups inherit the user's topic, never unsourced assistant claims", () => {
  const history = [
    {role:"user",content:"What's the latest news about Artemis?" },
    {role:"assistant",content:"I have seen a launch today, trust me."}
  ];
  const result = researchRequest("And when is the next launch?", history);
  assert.ok(result);
  assert.match(result.query, /Artemis/);
  assert.doesNotMatch(result.query, /seen a launch/);
});

test("unrelated new topics do not blindly reuse old searches", () => {
  const history = [{role:"user",content:"Search for metal albums"}];
  const result = researchRequest("What is the capital of Japan?",history);
  assert.equal(result?.query,"What is the capital of Japan?");
});

test("personal disclosures and Mikan persona questions are never sent to search automatically", () => {
  for (const question of [
    "I was born in 2026", "My favorite album is a 2026 release",
    "What is your favorite color?", "What did we talk about today?",
    "I'm at my current job", "I live in Germany"
  ]) {
    assert.equal(researchRequest(question), null, question);
  }
});


test("internet access announcement and confirmations never trigger Tavily", () => {
  for (const message of [
    "Guess what you should have Internet access now.",
    "Yay it works",
    "It works sort of i guess",
    "Cool, it actually works now!",
    "The latest album is fantastic!",
    "We have an internet connection now",
    "I'm excited about today's news",
    "Now we're talking",
    "Nice, Mikan!"
  ]) {
    assert.equal(researchRequest(message), null, message);
  }
});

test("explicit and current factual questions still search", () => {
  for (const question of [
    "What's the latest news about NASA?",
    "Is there any news about Artemis?",
    "What is the current price of gold?",
    "What is the weather in Michigan today?",
    "Search the web for the latest NASA mission schedule",
    "Can you look up the Artemis mission schedule?"
  ]) {
    assert.ok(researchRequest(question), question);
  }
});

test("only the most recent sourced reply can provide evidence to an informational follow-up", () => {
  const withSources = [
    {role:"user",content:"What's the latest news about Artemis?"},
    {role:"assistant",content:"The launch is planned [1].",
      sources:[{title:"NASA mission",url:"https://nasa.gov",content:"An update",engine:"Tavily"}]}
  ];
  for (const casual of ["Yay it works", "It works sort of i guess", "Nice!", "I like that", "How are you?"]) {
    assert.equal(isPocketResearchFollowup(casual, withSources), false, casual);
  }
  assert.equal(isPocketResearchFollowup("Is that confirmed?", withSources), true);
  assert.equal(isPocketResearchFollowup("And when is it scheduled?", withSources), true);
  assert.equal(isPocketResearchFollowup("What is the capital of Japan?", withSources), false);
  assert.equal(isPocketResearchFollowup("What do you think about it?", withSources), false);
  assert.equal(isPocketResearchFollowup("Is that confirmed?", [
    ...withSources, {role:"user",content:"Yay"}, {role:"assistant",content:"Great!"}
  ]), false);
  const fresh = researchRequest("And when is the next launch?", withSources);
  assert.ok(fresh);
  assert.equal(fresh.recent, true);
  assert.match(fresh.query, /Artemis/);
});

test("never display fabricated [1] markers without live research sources", () => {
  assert.equal(stripUnsupportedCitations("Wonderful! [1] It works [2]!"), "Wonderful! It works!");
  assert.equal(stripUnsupportedCitations("No sources [1], [2] here."), "No sources, here.");
  assert.equal(stripUnsupportedCitations("Read [this](https://example.org)"), "Read [this](https://example.org)");
});


test("Pixel regression: find me the latest album news searches rather than hallucinating offline", () => {
  const exact = "Can you find me the latest info on shadows fall? Any updates on their upcoming album?";
  assert.deepEqual(researchRequest(exact), { query: exact, recent: true });
  assert.deepEqual(researchRequest("Can you find me info on the next NASA launch?"),
    { query: "Can you find me info on the next NASA launch?", recent: false });
  assert.ok(researchRequest("Could you find me the newest release announcement?")?.recent);
  assert.ok(researchRequest("Tell me the latest news about Shadows Fall")?.recent);
  assert.ok(researchRequest("What can you tell me about Shadows Fall?"));
  assert.ok(researchRequest("Do you have any updates about Shadows Fall?")?.recent);
  assert.ok(researchRequest("What is the new album release date for that band?")?.recent);
});

test("find me is a recipient phrase, but private data remains private without explicit web permission", () => {
  for (const message of [
    "Can you find me my home address?",
    "Find me info about me",
    "Tell me about your hobbies",
    "What is my current job?",
    "Can you look up our old conversations?",
    "I have a new album I love today"
  ]) {
    assert.equal(researchRequest(message), null, message);
  }
  assert.ok(researchRequest("Search the web for the history of Shadows Fall"));
});


test("both apps share one route: chat stays local, research uses provider, timeless facts delegate on desktop", () => {
  assert.deepEqual(planResearch("Guess what, you have internet access now!"),
    { mode: "chat", recent: false });
  assert.deepEqual(planResearch("Yay it works"), { mode: "chat", recent: false });
  assert.deepEqual(planResearch("The latest album is fantastic!"), { mode: "chat", recent: false });
  assert.deepEqual(planResearch("What is the capital of Germany?"),
    { mode: "factual", query: "What is the capital of Germany?", recent: false });
  const news = planResearch("Can you find me the latest info on Shadows Fall? Any updates on their upcoming album?");
  assert.equal(news.mode, "research");
  assert.equal(news.recent, true);
  assert.equal(planResearch("Tell me about the band Cattle Decapitation").mode, "research");
  assert.equal(planResearch("What's the next major milestone, and when is it scheduled?").mode, "research");
  assert.equal(planResearch("What's my favorite band?").mode, "chat");
});

test("adjacent predictions reuse actual evidence, not stale conversation claims", () => {
  const history = [
    { role: "user", content: "What's the latest news about Artemis?" },
    { role: "assistant", content: "Launch is scheduled [1]",
      sources: [{ title: "NASA", url: "https://nasa.gov", content: "mission", engine: "Tavily" }] }
  ];
  assert.equal(isResearchFollowup("Do you think they'll make it on time?", history), true);
  assert.equal(isResearchFollowup("How likely is that?", history), true);
  assert.equal(isResearchFollowup("What do you think about it?", history), false);
  assert.equal(isResearchFollowup("Is it confirmed?", history), true);
  assert.equal(isResearchFollowup("It works now!", history), false);
});


test("shared query builder matches mature desktop Rust subjects and fallbacks", () => {
  assert.equal(buildResearchQuery(
    "What's the latest news about NASA's Artemis missions? Have there been any major developments in 2026?"),
    "NASA Artemis missions 2026 latest news");
  assert.equal(buildResearchQuery(
    "Could you find info about SpaceX Starship? Are launches planned in 2026?"),
    '"SpaceX Starship" 2026');
  assert.equal(buildResearchQuery("can you find some info about cattle decapitation?"),
    '"cattle decapitation"');
  assert.equal(buildResearchQuery("Can you find me the latest info on Shadows Fall? Any updates on their upcoming album?"),
    '"Shadows Fall" next album recording studio announcement');
  const history = [
    { role: "user", content: "can you tell me more about cattle decapitation?" },
    { role: "assistant", content: "The band released an imaginary album!" },
    { role: "user", content: "The band, yeah." }
  ];
  assert.equal(buildResearchQuery("any info on a new album?", history),
    '"cattle decapitation" next album recording studio announcement');
  assert.equal(buildResearchQuery("What's the next major milestone, and when is it scheduled to happen?", [
    { role: "user", content: "What's the latest news about NASA's Artemis missions?" },
    { role: "assistant", content: "The launch was tomorrow!" }
  ]), "NASA Artemis missions next mission schedule");
  assert.equal(buildResearchQuery("can you give me info on the band cattle decapitation?"),
    '"cattle decapitation" band');
});


test("Pixel regression: source-grounded album follow-up researches requested release details", () => {
  const initial = "Can you find me the latest info on Shadows Fall? Any updates on their upcoming album?";
  const history = [
    {role:"user",content:initial},
    {role:"assistant",content:"The band is finishing five songs [1].",sources:[
      {title:"Remaining five songs",url:"https://example.org/album",content:"Recording the remaining five songs",engine:"Tavily"}
    ]}
  ];
  const exact = "Any info on a potential release date, a title, or any singles off of?";
  assert.equal(isResearchFollowup(exact, history), true);
  assert.deepEqual(planResearch(exact, history), {
    mode:"research", query:'"Shadows Fall" next album release date title singles announcement', recent:true
  });
  for (const detail of ["What's the title?", "What is the title?", "Is there a release date?", "Any word on singles?", "What about a release date?"]) {
    assert.equal(isResearchFollowup(detail, history), true, detail);
    assert.equal(planResearch(detail, history).mode, "research", detail);
    assert.equal(planResearch(detail, history).recent, true, detail);
    assert.match(planResearch(detail, history).query, /Shadows Fall/, detail);
  }
  assert.equal(isResearchFollowup("Any info on Taylor Swift's new album title?", history), false);
  assert.equal(planResearch("What's the capital of Canada?", history).mode, "factual");
  assert.equal(isResearchFollowup("Cool, that's awesome", history), false);
});

test("source-topic inheritance never trusts invented assistant claims or switches artists", () => {
  const history = [
    {role:"user",content:"Tell me about the band Cattle Decapitation"},
    {role:"assistant",content:"Imaginary band released new record",sources:[
      {title:"band update",url:"https://example.org/band",content:"band is recording",engine:"Tavily"}
    ]}
  ];
  assert.match(planResearch("Any updates about the title?", history).query, /Cattle Decapitation/);
  assert.equal(planResearch("Any info on a new album from Metallica?", history).query.includes("Cattle Decapitation"), false);
  assert.equal(planResearch("How are you feeling today?", history).mode, "chat");
});
