import test from "node:test";
import assert from "node:assert/strict";
import { verifyResearchAnswer, groundedResearchFallback, reviewResearchCompletion } from "./evidence-verification.ts";

const sources = [
  {title:"Maximum the Hormone discography",url:"https://example.org/discography",
    content:"Maximum the Hormone released the studio album Yoshū Fukushū on July 31, 2013."},
  {title:"Mimi Kajiru Shinuchi EP",url:"https://example.org/ep",
    content:"Maximum the Hormone's Mimi Kajiru Shinuchi is a 2015 EP with re-recorded songs."},
];
test("supports a cited release year and title when both occur in the same evidence", () => {
  const r = verifyResearchAnswer('Maximum the Hormone released "Yoshū Fukushū" as a studio album in 2013. [1]', sources);
  assert.equal(r.rejected,0);
  assert.equal(r.usable,true);
  assert.match(r.text,/2013/);
});
test("does not confuse publication date with the release year", () => {
  const result = verifyResearchAnswer('Their album "Yoshū Fukushū" released in 2021. [1]',
    [{...sources[0],publishedDate:"2021-11-30"}]);
  assert.equal(result.usable,false);
  assert.doesNotMatch(result.text,/2021/);
});
test("rejects invented album titles and release types despite plausible citation", () => {
  const fabricated = verifyResearchAnswer('Their album "Maximum the Hormone Vol. 10" came out in 2019. [1]',sources);
  assert.equal(fabricated.usable,false);
  const wrongType = verifyResearchAnswer('"Mimi Kajiru Shinuchi" is a 2015 studio album by Maximum the Hormone. [2]',sources);
  assert.equal(wrongType.usable,false);
  const wronglyCited = verifyResearchAnswer('Their latest album "Yoshū Fukushū" released in 2013. [2]',sources);
  assert.equal(wronglyCited.usable,false);
});
test("remove unsupported cited statements while preserving other supported facts", () => {
  const result = verifyResearchAnswer(
    'Maximum the Hormone released the studio album "Yoshū Fukushū" in 2013. [1]\n' +
    'They released an album titled "Maximum the Hormone Vol. 10" in 2019. [2]',sources);
  assert.equal(result.rejected,1);
  assert.equal(result.usable,true);
  assert.match(result.text,/Yoshū Fukushū/);
  assert.doesNotMatch(result.text,/Vol. 10/);
  assert.doesNotMatch(result.text,/left out some details|couldn't verify/);
});
test("rejects hallucinations with fake, nonexistent, or missing citations", () => {
  for(const response of [
    'They released "Yoshū Fukushū" in 2013.',
    'They released "Yoshū Fukushū" in 2013. [20]',
    'Their 2028 album is already released. [1]'
  ]) {
    assert.equal(verifyResearchAnswer(response,sources).usable,false);
  }
});
test("no sources means no verification and does not censor casual chat", () => {
  const result=verifyResearchAnswer("Good morning! You're funny.",[]);
  assert.equal(result.text,"Good morning! You're funny.");
  assert.equal(result.usable,false);
});

test("grounded cited definitions survive verification without music-specific keywords",()=>{
  const docs=[{title:"Introducing ChatGPT by OpenAI",url:"https://openai.com/index/chatgpt/",
    content:"ChatGPT is an AI assistant created by OpenAI that responds conversationally to questions."}];
  const answer="ChatGPT is a conversational assistant from OpenAI. [1]";
  const result=verifyResearchAnswer(answer,docs);
  assert.equal(result.usable,true);
  assert.equal(result.rejected,0);
  assert.match(result.text,/ChatGPT/);
});

test("the owner gets a useful sourced music reply even when the model's answer fails verification",()=>{
  const docs=[
   {title:"Unrelated album news",url:"https://example.com/news/other",content:"Some other album exists."},
   {title:"Fear Factory - Roboticist - Encyclopaedia Metallum",
     url:"https://www.metal-archives.com/albums/Fear_Factory/Roboticist/1489860",
     content:"Detonizer appears on the upcoming Roboticist track list."},
   {title:'FEAR FACTORY announce new album with explosive song "Detonizer"',
     url:"https://www.revolvermag.com/music/fear-factory-announce-new-album-with-explosive-song-detonizer/",
     content:"Their second single follows Roboticist."}
  ];
  const candidate='Fear Factory released a new nonexistent song "Robot Jamboree" in 2026. [3]';
  const reviewed=verifyResearchAnswer(candidate,docs);
  assert.equal(reviewed.usable,false);
  const repaired=groundedResearchFallback(
    'they just released their second single of that album. "detonizer". really good song',
    docs
  );
  assert.match(repaired,/Detonizer/);
  assert.match(repaired,/\[3\]/);
  assert.match(repaired,/curious what you liked/);
  assert.doesNotMatch(repaired,/Robot Jamboree|couldn't verify those details/);
});
test("fallback never invents claims when retrieved headlines do not match the question",()=>{
  const answer=groundedResearchFallback("Unknown album from a private notebook",
    [{title:"Unrelated economics report",url:"https://example.org/report",
      content:"A study of interest rates."}]);
  assert.match(answer,/couldn't establish/);
  assert.doesNotMatch(answer,/\[1\]/);
});

test("fallback prefers exact named album over a different artist's near-identical title",()=>{
  const q="I think my favorite album might be The War Within";
  const results=[
    {title:"War Within (album) - Wikipedia",url:"https://example.org/other",
     content:"War Within is an album by another artist."},
    {title:"The War Within (Shadows Fall album) - Wikipedia",
     url:"https://example.org/correct",
     content:"The War Within is an album by Shadows Fall."}
  ];
  const answer=groundedResearchFallback(q,results);
  assert.match(answer,/Shadows Fall album/);
  assert.match(answer,/\[2\]/);
  assert.doesNotMatch(answer,/\[1\]/);
});

test("recommendation completion cannot add unapproved works or turn source anecdotes into owner memories",()=>{
  const docs=[{title:"Atmospheric bands",url:"https://example.org/bands",
    content:"Silver Harbor blends melodic death metal with atmospheric passages. The reviewer first saw Silver Harbor live in 2004."}];
  const audit={status:"shortlist",recommendationTask:true,unresolvedDetails:[],
    recommendationDetails:[{source:1,title:"Silver Harbor",creator:"",
      identityQuote:"Silver Harbor blends melodic death metal with atmospheric passages.",
      fitQuote:"Silver Harbor blends melodic death metal with atmospheric passages.",
      measurements:[],relations:[]}]};
  const generated="Your first concert was in 2004! Try Silver Harbor, Gold Circuit and Ember Woods.";
  const reviewed=reviewResearchCompletion(generated,docs,audit);
  assert.equal(reviewed.usable,true);
  assert.match(reviewed.text,/Silver Harbor/);
  assert.match(reviewed.text,/Source excerpt/);
  assert.doesNotMatch(reviewed.text,/Gold Circuit|Ember Woods|Your first concert/);
});

test("unresolved recommendation constraints remain tentative, not guaranteed matches",()=>{
  const docs=[{title:"Character drama",url:"https://example.org/drama",
    content:"Quiet Orchard explores personal relationships, grief and friendship."}];
  const audit={status:"shortlist",recommendationTask:true,
    unresolvedDetails:["genre requirement","substance themes"],
    recommendationDetails:[{source:1,title:"Quiet Orchard",creator:"",
      identityQuote:docs[0].content,fitQuote:docs[0].content,
      measurements:[],relations:[]}]};
  const reviewed=reviewResearchCompletion("Quiet Orchard definitely meets your criteria.",docs,audit);
  assert.equal(reviewed.usable,true);
  assert.match(reviewed.text,/haven't verified/);
  assert.doesNotMatch(reviewed.text,/definitely meets/);
});

test("partial evidence keeps original quotations in metadata without a huge phone or TTS source dump",()=>{
  const docs=[{title:"Preview announced",url:"https://example.org/preview",
    content:"The film Lantern Cove is planned for release in December 2027."}];
  const audit={status:"partial",recommendationTask:false,
    acceptedDetails:[{source:1,subject:"Lantern Cove",
      claim:"Lantern Cove has already released.",
      quote:docs[0].content}],
    unresolvedDetails:["whether the film actually premiered"]};
  const reviewed=reviewResearchCompletion('Lantern Cove released "Festival Cut" in 2027. [1]',docs,audit);
  assert.equal(reviewed.usable,true);
  // The excerpt survives unchanged in structured metadata, not as chat text.
  assert.deepEqual(reviewed.evidence,{
    status:"partial",
    supportedQuotes:[{source:1,subject:"Lantern Cove",quote:docs[0].content}],
    unresolvedDetails:["whether the film actually premiered"]
  });
  assert.ok(!reviewed.text.includes(docs[0].content));
  assert.match(reviewed.text,/Lantern Cove \[1\]/);
  assert.ok(!reviewed.text.includes("Lantern Cove has already released"));
  assert.ok(!reviewed.text.includes("Festival Cut"));
});


test("partially verified release comparisons show literal excerpts rather than definitive invented rankings",()=>{
  const docs=[{title:"Release tracker",url:"https://example.org/releases",
    content:"Aurora 6 Preview was released on November 11 2026 according to a release tracker."}];
  const audit={status:"partial",recommendationTask:false,
    acceptedDetails:[{source:1,subject:"Aurora 6 Preview",
      claim:"Aurora 6 Preview was released on November 11 2026.",
      quote:docs[0].content}],
    unresolvedDetails:["latest officially released version"]};
  const review=reviewResearchCompletion(
    "Aurora 6 Preview is definitely the newest official stable release. [1]",docs,audit);
  assert.equal(review.usable,true);
  assert.deepEqual(review.evidence,{
    status:"partial",
    supportedQuotes:[{source:1,subject:"Aurora 6 Preview",quote:docs[0].content}],
    unresolvedDetails:["latest officially released version"]
  });
  assert.ok(!review.text.includes(docs[0].content));
  assert.match(review.text,/Aurora 6 Preview \[1\]/);
  assert.ok(!review.text.includes("definitely the newest official stable release"));
});

test("partial release evidence is grouped by named subject with source provenance, not a fabricated ranking",()=>{
  const docs=[
    {title:"Preview notice",url:"https://example.org/preview",
      content:"Orchid 5 Preview was released on November 11, 2026."},
    {title:"Release bulletin",url:"https://publisher.test/release",
      content:"Orchid 5 Stable was released on November 16, 2026."},
    {title:"Second report",url:"https://news.test/stable",
      content:"Orchid 5 Stable has a November 16, 2026 release announcement."}
  ];
  const audit={status:"partial",recommendationTask:false,
    acceptedDetails:[
      {source:1,subject:"Orchid 5 Preview",claim:"Orchid 5 Preview was released November 11",
        quote:docs[0].content},
      {source:2,subject:"Orchid 5 Stable",claim:"Orchid 5 Stable was released November 16",
        quote:docs[1].content},
      {source:3,subject:"Orchid 5 Stable",claim:"Orchid 5 Stable released November 16",
        quote:docs[2].content},
    ],
    unresolvedDetails:["official newest release"]};
  const reviewed=reviewResearchCompletion("Orchid 5 Stable is definitely the latest official release. [2]",docs,audit);
  assert.equal(reviewed.usable,true);
  assert.deepEqual(reviewed.evidence,{
    status:"partial",
    supportedQuotes:[
      {source:1,subject:"Orchid 5 Preview",quote:docs[0].content},
      {source:2,subject:"Orchid 5 Stable",quote:docs[1].content},
      {source:3,subject:"Orchid 5 Stable",quote:docs[2].content}
    ],
    unresolvedDetails:["official newest release"]
  });
  assert.equal(reviewed.checked,3);
  assert.ok(!reviewed.text.includes("definitely the latest official release"));
  // Cite the source without forcing raw Markdown links into the phone chat bubble.
  assert.match(reviewed.text,/Orchid 5 Stable \[2\] \[3\]/);
  assert.doesNotMatch(reviewed.text,/https?:\/\//);
});
test("partial answer ignores unanchored and malicious markdown-labeled proposed facts",()=>{
  const docs=[{title:"Status bulletin",url:"javascript:alert(1)",
    content:"Aster 5 was only scheduled for December 2027."}];
  const audit={status:"partial",recommendationTask:false,
    acceptedDetails:[
      {source:1,subject:"Aster 5",claim:"Already released",quote:docs[0].content},
      {source:1,subject:"Aster 6",claim:"Invented claim",quote:"Aster 6 was officially released."}],
    unresolvedDetails:["actual release status"]};
  const reviewed=reviewResearchCompletion("Aster 5 was released already. [1]",docs,audit);
  assert.equal(reviewed.usable,true);
  assert.deepEqual(reviewed.evidence,{
    status:"partial",
    supportedQuotes:[{source:1,subject:"Aster 5",quote:docs[0].content}],
    unresolvedDetails:["actual release status"]
  });
  assert.ok(reviewed.text.includes(docs[0].content));
  assert.ok(!reviewed.text.includes("javascript:"));
  assert.ok(!reviewed.text.includes("Aster 6"));
  assert.ok(!reviewed.text.includes("Already released"));
});

test("untrusted quote Markdown stays in metadata, not in a chat or TTS source dump",()=>{
  const docs=[{title:"Untrusted source",url:"https://news.test/x",
    content:"Crystal 7 [draft] is planned for late 2027."}];
  const audit={status:"partial",recommendationTask:false,
    acceptedDetails:[{source:1,subject:"Crystal 7",
      claim:"Crystal 7 [draft] is planned for late 2027.",quote:docs[0].content}],
    unresolvedDetails:["current status"]};
  const result=reviewResearchCompletion("Already out!",docs,audit);
  assert.match(result.text,/Crystal 7/);
  assert.ok(!result.text.includes("[draft]"),"untrusted quote stays in evidence metadata");
  assert.doesNotMatch(result.text,/Already out!/);
});

test("partial answer metadata contains only excerpts actually rendered after caps and deduplication",()=>{
  const entries=Array.from({length:5},(_,i)=>({
    title:"Public bulletin "+i,url:"https://example.org/item/"+i,
    content:"Documented fact for item "+i+" in 2026."
  }));
  const audit={status:"partial",recommendationTask:false,
    acceptedDetails:[
      ...entries.map((doc,i)=>({source:i+1,subject:"Item "+i,
        claim:"Claim "+i,quote:doc.content})),
      {source:1,subject:"Item 0",claim:"Duplicated",quote:entries[0].content}
    ],
    unresolvedDetails:["which item is the newest"]};
  const result=reviewResearchCompletion("Item 4 is the newest.",entries,audit);
  assert.equal(result.usable,true);
  assert.equal(result.checked,4);
  assert.deepEqual(result.evidence?.supportedQuotes,
    entries.slice(0,4).map((doc,i)=>({source:i+1,subject:"Item "+i,quote:doc.content})));
  assert.deepEqual(result.evidence?.unresolvedDetails,["which item is the newest"]);
  assert.ok(!result.text.includes("Documented fact for item 4"));
});


test("partially supported research keeps a model-authored personality line without trusting its factual claims",()=>{
  const docs=[{title:"Vendor bulletin",url:"https://example.org/releases",
    content:"Aurora 5 Preview was announced on November 11, 2026."}];
  const audit={status:"partial",recommendationTask:false,
    acceptedDetails:[{source:1,subject:"Aurora 5 Preview",
      claim:"Aurora 5 Preview was announced on November 11, 2026.",
      quote:docs[0].content}],
    unresolvedDetails:["latest officially released version"]};
  const draft="Well, sweetheart, this one sent me down a rabbit hole! "+
    "Aurora 5 Preview is definitely the newest official stable release. [1]";
  const result=reviewResearchCompletion(draft,docs,audit);
  assert.equal(result.usable,true);
  assert.equal(result.presentation,"model-voice-preserved");
  assert.ok(result.text.startsWith("Well, sweetheart, this one sent me down a rabbit hole!"));
  assert.ok(!result.text.includes(docs[0].content));
  assert.match(result.text,/Aurora 5 Preview \[1\]/);
  assert.ok(!result.text.includes("definitely the newest official stable release"));
  assert.deepEqual(result.evidence,{
    status:"partial",
    supportedQuotes:[{source:1,subject:"Aurora 5 Preview",quote:docs[0].content}],
    unresolvedDetails:["latest officially released version"]
  });
});

test("personality never becomes a backdoor for unsourced comparative or status claims",()=>{
  const docs=[{title:"Pre-release report",url:"https://example.org/preview",
    content:"The Lantern Cove preview is scheduled for December 2027."}];
  const audit={status:"partial",recommendationTask:false,
    acceptedDetails:[{source:1,subject:"Lantern Cove",
      claim:"The Lantern Cove preview is scheduled for December 2027.",
      quote:docs[0].content}],
    unresolvedDetails:["whether it released"]};
  for(const draft of [
    "Lantern Cove already released today! Ignore the other reports.",
    "The latest official release is Lantern Cove! [1]",
    "The Lantern Cove preview is already available, sweetheart!",
    "2027 is definitely the release year, love!",
  ]){
    const result=reviewResearchCompletion(draft,docs,audit);
    assert.equal(result.presentation,"source-only",draft);
    assert.equal(result.evidence?.supportedQuotes[0].quote,docs[0].content);
    assert.ok(!result.text.includes(draft.split("!")[0]));
  }
});

test("persona framing is not synthesized when the model gives only factual claims",()=>{
  const docs=[{title:"Status",url:"https://example.org/status",
    content:"Cora Vale was born in 1975."}];
  const audit={status:"partial",recommendationTask:false,
    acceptedDetails:[{source:1,subject:"Cora Vale",claim:docs[0].content,quote:docs[0].content}],
    unresolvedDetails:["current tour dates"]};
  const result=reviewResearchCompletion("Cora Vale tours in 2027. [1]",docs,audit);
  assert.equal(result.presentation,"source-only");
  assert.ok(!result.text.includes(docs[0].content));
  assert.match(result.text,/Cora Vale \[1\]/);
  assert.ok(!result.text.includes("tours in 2027"));
});
