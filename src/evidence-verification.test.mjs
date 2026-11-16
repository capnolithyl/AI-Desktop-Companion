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

test("fallback quotes the source instead of presenting an unproved interpretation",()=>{
  const docs=[{title:"Preview announced",url:"https://example.org/preview",
    content:"The film Lantern Cove is planned for release in December 2027."}];
  const audit={status:"partial",recommendationTask:false,
    acceptedDetails:[{source:1,subject:"Lantern Cove",
      claim:"Lantern Cove has already released.",
      quote:docs[0].content}],
    unresolvedDetails:["whether the film actually premiered"]};
  const reviewed=reviewResearchCompletion('Lantern Cove released "Festival Cut" in 2027. [1]',docs,audit);
  assert.equal(reviewed.usable,true);
  assert.match(reviewed.text,/Source \[1\] states/);
  assert.doesNotMatch(reviewed.text,/has already released|Festival Cut/);
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
  assert.match(review.text,/Aurora 6 Preview/);
  assert.match(review.text,/retrieved sources actually say/);
  assert.match(review.text,/Still unconfirmed: latest officially released version/);
  assert.doesNotMatch(review.text,/definitely the newest|official stable release/);
});
