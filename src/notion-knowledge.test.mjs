import test from "node:test";
import assert from "node:assert/strict";
import { isNotionTopic, notionContext, planNotionRetrieval, selectNotionPage, asksToReadFullNotionPage, hasNamedNotionMatch } from "./notion-knowledge.ts";

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
  assert.equal(selectNotionPage("Discuss the Charlotte Universe",pages)?.id,"1");
  assert.equal(selectNotionPage("What is your favorite food?",pages),null);
  assert.equal(hasNamedNotionMatch("What about Will?",[
    {title:"Chapter Three",url:"",content:"Will refused to leave Charlotte.",syncedAt:1}
  ]),true);
  const project=[{id:"4",title:"The Obsidian Garden",url:"",chunkCount:1,characters:700}];
  assert.equal(planNotionRetrieval("What happens in The Obsidian Garden?",[],project).selectedPage?.id,"4");
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
