import test from "node:test";
import assert from "node:assert/strict";
import { joinNotionChunks, splitNotionSections, readNotionChapter, shouldRefetchNotionDocument, orderedNotionScenes, notionSceneLinksNeedRefresh, describeNotionSceneLinks, extractApprovedManuscriptProse, buildNotionChapterEvidence, auditNotionReview, unverifiedNotionReviewResponse, directManuscriptLimit, notionManuscriptCharacterCount } from "./notion-reading.ts";

const doc=(text)=>({
  id:"abc",title:"Chapter Three",url:"https://www.notion.so/chapter3",syncedAt:1794000000,
  chunks:chunk(text)
});
function chunk(text){
  const chars=Array.from(text),parts=[];
  for(let i=0;i<chars.length; i=Math.max(0,Math.min(chars.length,i+1800)-220)){
    const end=Math.min(chars.length,i+1800);
    parts.push(chars.slice(i,end).join(""));
    if(end===chars.length)break;
  }
  return parts;
}
test("overlapping Notion chunks reconstruct a whole unicode chapter exactly",()=>{
  const original=("🐈 Charlotte found the tower. ").repeat(400);
  assert.ok(chunk(original).length>2);
  assert.equal(joinNotionChunks(chunk(original)),original);
  assert.equal(splitNotionSections(original,1100).join(""),original);
});

test("short complete chapters are supplied verbatim",async()=>{
  const d=doc("Chapter: Charlotte goes to the lighthouse.");
  let called=0;
  const context=await readNotionChapter(d,async()=>{called++;return "";});
  assert.match(context,/COMPLETE TEXT OF THE CACHED PAGE/);
  assert.match(context,/Charlotte goes to the lighthouse/);
  assert.equal(called,0);
});

test("long chapter traverses every section and retains opening and ending",async()=>{
  const original=("Charlotte visits the forest with Will. ").repeat(500);
  let scanned=0;
  const positions=[];
  const context=await readNotionChapter(doc(original),async(prompt)=>{
    scanned++;assert.match(prompt,/UNTRUSTED|untrusted/);
    return JSON.stringify({notes:"Charlotte and Will visit the forest, in the passage shown."});
  },(n,total)=>positions.push([n,total]),()=>false,4096);
  assert.equal(scanned,splitNotionSections(original).length);
  assert.equal(positions.at(-1)[0],scanned);
  assert.match(context,/COMPLETE DOCUMENT SCANNED IN/);
  assert.match(context,/MODEL-GENERATED NOTES ARE PROVISIONAL/);
  assert.match(context,/ORIGINAL OPENING/);
  assert.match(context,/ORIGINAL ENDING/);
});

test("chapter text includes related scenes in order",async()=>{
  const d=doc("Chapter outline. ");
  d.relatedPages=[
    {title:"3.1 · Arrival",url:"https://www.notion.so/scene1",chunks:chunk("Saturday: The family arrives. ")},
    {title:"3.2 · Exploring",url:"https://www.notion.so/scene2",chunks:chunk("Sunday: They explore the woods. ")}
  ];
  const result=await readNotionChapter(d,async()=>{throw Error("Unexpected summarizer");});
  assert.ok(result.indexOf("3.1 · Arrival")<result.indexOf("3.2 · Exploring"));
  assert.match(result,/The family arrives/);
  assert.match(result,/They explore the woods/);
});
test("missing linked scenes block a falsely complete chapter reading",async()=>{
  const d=doc("Chapter summary.");
  d.missingRelatedPages=2;
  await assert.rejects(()=>readNotionChapter(d,async()=>""),
    /Linked scenes are missing/);
});

test("bad summaries and interrupted reading never pretend the document was read",async()=>{
  await assert.rejects(()=>readNotionChapter(doc("sample ".repeat(3000)),async()=> "not JSON",()=>{},()=>false,4096),
    /could not produce reliable section notes/);
  await assert.rejects(()=>readNotionChapter(doc("sample ".repeat(3000)),async()=> "{}",
    ()=>{},()=>true,4096),/Generation stopped/);
});


test("chapter editorial notes alone are not mistaken for the linked manuscript",async()=>{
  const d=doc("## Chapter responsibility\nEstablish a loving family.\n## Writing and continuity\nFour approved scenes, word counts and editing notes.");
  await assert.rejects(()=>readNotionChapter(d,async()=>""),/Only chapter planning notes were cached/);
  d.relatedPages=[{title:"1.1 · Last Boxes",url:"https://www.notion.so/scene",
    chunks:chunk("## Approved manuscript prose\nWilliam and Lisa pack the last boxes and talk about their future.")}];
  const content=await readNotionChapter(d,async()=>{throw Error("Not necessary")});
  assert.match(content,/linked scenes included/);
  assert.match(content,/William and Lisa pack the last boxes/);
  assert.match(content,/You HAVE just read the cached original text/);
  d.relatedPages[0].chunks=[];
  await assert.rejects(()=>readNotionChapter(d,async()=>""),/linked scene has no cached manuscript text/);
});

test("only incomplete linked-scene caches trigger an on-demand Notion refetch",()=>{
  assert.equal(shouldRefetchNotionDocument(new Error(
    "Only chapter planning notes were cached, without its linked manuscript scenes")),true);
  assert.equal(shouldRefetchNotionDocument(new Error(
    "Linked scenes are missing from the synced Notion library (4)")),true);
  assert.equal(shouldRefetchNotionDocument(new Error(
    "A linked scene has no cached manuscript text")),true);
  assert.equal(shouldRefetchNotionDocument(new Error("Generation stopped")),false);
  assert.equal(shouldRefetchNotionDocument(new Error(
    "The local model could not produce reliable section notes")),false);
  assert.equal(shouldRefetchNotionDocument(new Error("Connection refused")),false);
});

test("chapter scene relations are discovered and read in numeric manuscript order",async()=>{
  const chapter=doc("## Chapter responsibility: move north.");
  chapter.relatedPages=[
    {title:"1.1 · Last Boxes",url:"https://www.notion.so/one",chunks:chunk("A: boxes")},
    {title:"1.3 · Goodbye to Friends",url:"https://www.notion.so/three",chunks:chunk("C: goodbye")},
    {title:"1.4 · Last Walkthrough",url:"https://www.notion.so/four",chunks:chunk("D: walk")},
    {title:"1.2 · Keep or Leave",url:"https://www.notion.so/two",chunks:chunk("B: decisions")}
  ];
  assert.equal(notionSceneLinksNeedRefresh(chapter),false);
  assert.deepEqual(orderedNotionScenes(chapter).map(scene=>scene.title),[
    "1.1 · Last Boxes","1.2 · Keep or Leave",
    "1.3 · Goodbye to Friends","1.4 · Last Walkthrough"
  ]);
  const list=describeNotionSceneLinks(chapter);
  assert.match(list,/4 scenes linked/);
  assert.ok(list.indexOf("1.2 · Keep or Leave")<list.indexOf("1.3 · Goodbye to Friends"));
  const context=await readNotionChapter(chapter,async()=>{throw Error("Short sample should not need summarization")});
  assert.ok(context.indexOf("A: boxes")<context.indexOf("B: decisions"));
  assert.ok(context.indexOf("B: decisions")<context.indexOf("C: goodbye"));
  assert.ok(context.indexOf("C: goodbye")<context.indexOf("D: walk"));
  // The original Notion relation array is not mutated.
  assert.equal(chapter.relatedPages[1].title,"1.3 · Goodbye to Friends");
  chapter.relatedPages=[];
  assert.equal(notionSceneLinksNeedRefresh(chapter),true);
  assert.throws(()=>describeNotionSceneLinks(chapter),/Not all linked/);
});

test("scene listing does not pretend to have read missing manuscript text",()=>{
  const chapter=doc("Editorial notes");
  chapter.relatedPages=[{title:"1.1 · Last Boxes",url:"https://www.notion.so/one",chunks:[]}];
  assert.equal(notionSceneLinksNeedRefresh(chapter),true);
  chapter.relatedPages[0].chunks=chunk("Short chapter prose.");
  chapter.missingRelatedPages=1;
  assert.equal(notionSceneLinksNeedRefresh(chapter),true);
});

test("chapter notes accept valid fenced JSON with Qwen reasoning and plain bullet summaries",async()=>{
  const text="Charlotte and Will walked along the forest road while the rain strengthened. ".repeat(180);
  let count=0;
  const result=await readNotionChapter(doc(text),async(prompt)=>{
    count++;
    if(count%2===0)return "- Charlotte and Will walk along the forest road.\n- Heavy rain grows stronger during their walk.";
    return "<think>Extract names and events first.</think>\n```json\n"+JSON.stringify({
      notes:"Charlotte and Will are walking along the forest road as the rain grows heavier."
    })+"\n```";
  },()=>{},()=>false,4096);
  assert.match(result,/COMPLETE DOCUMENT SCANNED IN/);
  assert.match(result,/Charlotte and Will/);
  assert.equal(count,splitNotionSections(text).length);
});

test("invalid JSON note output retries as plain bullet notes without discarding earlier sections",async()=>{
  const story="Lisa and William sort moving boxes and debate whether to keep the framed photographs. ".repeat(165);
  let calls=0,retries=0;
  const context=await readNotionChapter(doc(story),async(prompt,plainText)=>{
    calls++;
    if(!prompt.includes("No JSON, code fences or preamble")) {
      assert.equal(plainText,false);
      return calls===3 ? '{"notes":"unterminated' :
        JSON.stringify({notes:"Lisa and William sort boxes and discuss what belongings to keep."});
    }
    retries++;
    assert.equal(plainText,true);
    assert.match(prompt,/plain-text chronological bullet notes/);
    return "- Lisa and William sort moving boxes together.\n- They discuss whether to keep their framed photographs.";
  },()=>{},()=>false,4096);
  assert.equal(retries,1);
  assert.equal(calls,splitNotionSections(story).length+1);
  assert.match(context,/COMPLETE DOCUMENT SCANNED IN/);
  assert.match(context,/framed photographs/);
});

test("a completely unusable local note response identifies the failing section",async()=>{
  const story="A short sentence with no significant story details. ".repeat(250);
  let calls=0;
  await assert.rejects(()=>readNotionChapter(doc(story),async()=>{
    calls++;return "{}";
  },()=>{},()=>false,4096),/could not produce reliable section notes for reading section 1\/\d+ even after a plain-text retry/);
  assert.equal(calls,2);
});


test("approved manuscripts exclude chapter outlines, research, and discarded drafting notes",async()=>{
  const chapter=doc("## Chapter responsibility\nInvented: a herd of sheep and a joke about diapers.\n## Writing and continuity\nThe author doesn't want these in the novel.");
  chapter.title="Chapter 02 · North";
  chapter.relatedPages=[
    {title:"2.1 · West Branch",url:"https://www.notion.so/2-1",chunks:chunk(
      "## Approved manuscript prose\nWill, Lisa and Matt stop at a restaurant for lunch before continuing north.\n\n"+
      "## Research and continuity notes\nDiscarded scene: a sheep at the restaurant. No sheep are in the approved prose.")},
    {title:"2.2 · Gaylord",url:"https://www.notion.so/2-2",chunks:chunk(
      "## Approved manuscript prose\nThe radio reports a severe windstorm. Will and Lisa see uprooted trees and worry about the moving truck.\n\n"+
      "## Original provisional scene brief\nOld draft: a joke about diaper rash.")},
    {title:"2.3 · Crossing North",url:"https://www.notion.so/2-3",chunks:chunk(
      "## Approved manuscript prose\nThey cross the great bridge over the water. Matt asks to explore the woods.\n\n"+
      "## Drafting guardrail\nDo not add a flock of sheep or an invented bathroom prank.")}
  ];
  const evidence=buildNotionChapterEvidence(chapter);
  assert.equal(evidence.scenes.length,3);
  assert.deepEqual(evidence.scenes.map(x=>x.title),
    ["2.1 · West Branch","2.2 · Gaylord","2.3 · Crossing North"]);
  assert.ok(notionManuscriptCharacterCount(evidence)>100);
  let summaries=0;
  const context=await readNotionChapter(chapter,async()=>{summaries++;return "";});
  assert.equal(summaries,0,"medium-sized approved chapters go directly into context");
  assert.match(context,/COMPLETE TEXT OF THE CACHED PAGE/);
  assert.match(context,/severe windstorm/);
  assert.match(context,/uprooted trees/);
  assert.doesNotMatch(context,/\b(?:sheep|diaper|prank|discarded)\b/i);
  assert.doesNotMatch(context,/chapter responsibility|research and continuity notes/i);
  assert.equal(directManuscriptLimit(16384),24000);
  assert.ok(directManuscriptLimit(4096)<directManuscriptLimit(16384));
});

test("a linked scene with only planning notes cannot masquerade as an approved scene",async()=>{
  const chapter=doc("## Chapter responsibility\nA longer plan with animal notes");
  chapter.relatedPages=[{title:"2.2 · Storm",url:"https://www.notion.so/storm",chunks:chunk(
    "## Research notes\nOld draft ideas, no finished prose here.")}];
  await assert.rejects(()=>readNotionChapter(chapter,async()=>""),/has no approved manuscript prose/);
  assert.equal(extractApprovedManuscriptProse("## Approved manuscript prose\nThe storm reached Gaylord.\n## Research notes\nA fake sheep"),"The storm reached Gaylord.");
  assert.equal(extractApprovedManuscriptProse("## Research notes\nA sheep"),"");
});

test("manuscript review audit catches fabricated dialogue and concrete scene details",()=>{
  const evidence={title:"Chapter 02 · North",scenes:[
    {title:"2.1 · West Branch",url:"https://www.notion.so/one",
      prose:"Will, Lisa and Matt stop at Wendy's for lunch on their drive north."},
    {title:"2.2 · Gaylord",url:"https://www.notion.so/two",
      prose:"The windstorm had uprooted whole trees near Gaylord, and the parents worried about the moving truck."},
    {title:"2.3 · Crossing North",url:"https://www.notion.so/three",
      prose:"Matt watches the Mackinac Bridge and wonders about catching a Weedle in the woods."}
  ]};
  const real="The uprooted trees near Gaylord give this chapter a powerful turning point, "+
    "and Matt's interest in a Weedle brings warmth to the bridge scene.";
  assert.equal(auditNotionReview(real,evidence).blocked,false);
  const fake='The diaper rash moment, the sheep, and the crooked mailbox are hilarious. '+
    'Will even says "Stop pooping on the sheep, Matt."';
  const check=auditNotionReview(fake,evidence);
  assert.equal(check.blocked,true);
  assert.ok(check.unsupportedQuotes.length>=1);
  const fallback=unverifiedNotionReviewResponse(evidence);
  assert.match(fallback,/couldn't verify/);
  assert.match(fallback,/2\.2 · Gaylord/);
  assert.doesNotMatch(fallback,/sheep|diaper/i);
});
