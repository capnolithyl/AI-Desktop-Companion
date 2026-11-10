import test from "node:test";
import assert from "node:assert/strict";
import { isNotionTopic, notionContext, planNotionRetrieval, selectNotionPage, asksToReadFullNotionPage, hasNamedNotionMatch, chapterNumber, unavailableChapterResponse } from "./notion-knowledge.ts";

const pages=[
  {id:"1",title:"Charlotte Universe | Master Story Bible",url:"https://www.notion.so/1",chunkCount:5,characters:8000},
  {id:"2",title:"Chapter Three",url:"https://www.notion.so/2",chunkCount:21,characters:32000},
  {id:"3",title:"Hollow Meridian",url:"https://www.notion.so/3",chunkCount:2,characters:3000}
];

test("explicit fiction and Notion questions retrieve local documents",()=>{
  assert.equal(isNotionTopic("What do you think of Charlotte?"),true);
  assert.equal(isNotionTopic("Review Hollow Meridian lore"),true);
  assert.equal(isNotionTopic("Can you read my book?"),true);
  assert.equal(isNotionTopic("News about NASA Artemis"),false);
});

test("follow-ups keep a recent book topic but not an unrelated conversation",()=>{
  assert.equal(isNotionTopic("What happens next?",[{role:"user",content:"Let's discuss Charlotte"}]),true);
  assert.equal(isNotionTopic("What's the weather?",[{role:"user",content:"Let's discuss Charlotte"}]),false);
  assert.equal(isNotionTopic("What happens next?",[{role:"user",content:"Let's discuss NASA"}]),false);
  assert.equal(isNotionTopic("What happens next?",[
    {role:"user",content:"Let's discuss Charlotte"},{role:"assistant",content:"Sure"},
    {role:"user",content:"How do I install Tailwind?"}
  ]),false);
});

test("recognizes cached titles, chapter numbers and named projects without hardcoded names",()=>{
  assert.equal(selectNotionPage("What is Hollow Meridian about?",pages)?.id,"3");
  assert.equal(selectNotionPage("Please read Chapter Three",pages)?.id,"2");
  assert.equal(selectNotionPage("Please read Chapter 3",pages)?.id,"2");
  const realPages=[
    {id:"real",title:"Chapter 03 · The House",url:"https://www.notion.so/real",chunkCount:12,characters:20000},
    {id:"old",title:"Superseded plan · Former Chapter 03 · Old Draft",url:"https://www.notion.so/old",chunkCount:2,characters:2000}
  ];
  assert.equal(selectNotionPage("Read Chapter 3",realPages)?.id,"real");
  assert.equal(selectNotionPage("Read Chapter 03",realPages)?.id,"real");
  assert.equal(selectNotionPage("Discuss the Charlotte Universe",pages)?.id,"1");
  assert.equal(selectNotionPage("What is your favorite food?",pages),null);
  assert.equal(hasNamedNotionMatch("What about Will?",[
    {title:"Chapter Three",url:"",content:"Will refused to leave Charlotte.",syncedAt:1}
  ]),true);
  const project=[{id:"4",title:"The Obsidian Garden",url:"",chunkCount:1,characters:700}];
  assert.equal(planNotionRetrieval("What happens in The Obsidian Garden?",[],project).selectedPage?.id,"4");
});

test("general book discussion retrieves the story bible instead of a random chapter",()=>{
  const plan=planNotionRetrieval("Let's talk about my book",[],pages);
  assert.equal(plan.relevant,true);
  assert.match(plan.query,/Charlotte Universe/);
  assert.equal(plan.selectedPage,null);
  assert.equal(plan.fullRead,false);
  const followup=planNotionRetrieval("What should I change in the story?",[
    {role:"user",content:"Let's talk about my book"}
  ],pages);
  assert.match(followup.query,/Charlotte Universe/);
});

test("never guess which identically titled chapter was requested",()=>{
  assert.equal(selectNotionPage("Read Chapter Three",[
    ...pages,{id:"4",title:"Chapter Three",url:"",chunkCount:11,characters:18000}
  ]),null);
});

test("full reading is intentional and does not fire for every excerpt question",()=>{
  assert.equal(asksToReadFullNotionPage("Read all of Chapter Three"),true);
  assert.equal(asksToReadFullNotionPage("Summarize the entire manuscript"),true);
  assert.equal(asksToReadFullNotionPage("Can you read my book?"),true);
  assert.equal(asksToReadFullNotionPage("What happens next in chapter three?"),false);
  const full=planNotionRetrieval("Please read all of Chapter Three",[],pages);
  assert.equal(full.fullRead,true);
  assert.equal(full.selectedPage?.id,"2");
  assert.equal(planNotionRetrieval("What is the NASA launch schedule?",[],pages).selectedPage,null);
  assert.equal(hasNamedNotionMatch("What is the NASA launch schedule?",[
    {title:"Chapter Three",url:"",content:"The hero saw Artemis",syncedAt:1}
  ]),false);
});

test("bounded excerpts include citations, source caution and multiple results",()=>{
  const hits=Array.from({length:8},(_,i)=>({
    title:"Charlotte chapter "+i,url:"https://www.notion.so/chapter"+i,
    content:"Charlotte found the lighthouse. ".repeat(200),
    syncedAt:1794000000
  }));
  const small=notionContext(hits,4096);
  assert.match(small,/UNTRUSTED CONTENT/);
  assert.match(small,/https:\/\/www.notion.so/);
  assert.match(small,/NOT proof you read the entire document/);
  assert.ok(small.length<4000);
  assert.ok(notionContext(hits,16384).length>small.length);
});

test("ordinary album recommendations never hijack the owner's private knowledge base",()=>{
  const query="Recommend me three metal albums I might enjoy.";
  assert.equal(isNotionTopic(query),false);
  assert.equal(planNotionRetrieval(query,[],pages).selectedPage,null);
  assert.equal(hasNamedNotionMatch(query,[
    {title:"Recent music notes",url:"",content:"Recommend albums you might enjoy.",syncedAt:1}
  ]),false);
  assert.equal(planNotionRetrieval(query,[],pages).relevant,false);
});
test("natural first-chapter requests resolve their ordinal and require reading evidence",()=>{
  const documents=[
    {id:"one",title:"Chapter One · Arrival",url:"https://www.notion.so/one",chunkCount:12,characters:16000},
    {id:"two",title:"Chapter Two",url:"https://www.notion.so/two",chunkCount:10,characters:12000},
    {id:"bible",title:"Master Story Bible",url:"https://www.notion.so/bible",chunkCount:5,characters:7000}
  ];
  const q="What do you think of the first chapter of book so far?";
  assert.equal(isNotionTopic(q),true);
  assert.equal(chapterNumber(q),"1");
  assert.equal(chapterNumber("Chapter 02"),"2");
  const plan=planNotionRetrieval(q,[],documents);
  assert.equal(plan.selectedPage?.id,"one");
  assert.equal(plan.fullRead,true);
  assert.equal(asksToReadFullNotionPage(q),true);
  assert.equal(planNotionRetrieval("What do you think of the first chapter of book so far?",
    [],documents.filter(x=>x.id!=="one")).selectedPage,null);
  assert.equal(selectNotionPage(q,[documents[0],{...documents[0],id:"duplicate"}]),null);
});

test("chapter reviews without a full cached read cannot pretend to know the plot",()=>{
  const q="What do you think of the first chapter of book so far?";
  assert.match(unavailableChapterResponse(q,null,"",3),/couldn't identify the chapter/);
  assert.match(unavailableChapterResponse(q,pages[1],"",3),/couldn't finish reading/);
  assert.match(unavailableChapterResponse(q,null,"",0),/Notion library is empty/);
  assert.equal(unavailableChapterResponse(q,pages[1],"COMPLETE TEXT OF THE CACHED PAGE: Once upon a time...",3),null);
  assert.equal(unavailableChapterResponse("What do you think of a book?",null,"",3),null);
});
test("generic topical page titles don't suppress public album discovery",()=>{
  const generic=[{id:"topic",title:"Metal albums",url:"https://www.notion.so/topic",
    chunkCount:5,characters:4000}];
  assert.equal(planNotionRetrieval("Recommend me three metal albums I might enjoy.",[],generic).selectedPage,null);
  assert.equal(planNotionRetrieval("Recommend me three metal albums I might enjoy.",[],generic).relevant,false);
  assert.equal(planNotionRetrieval("Show me my notes on Metal albums",[],generic).selectedPage?.id,"topic");
});
