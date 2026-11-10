import test from "node:test";
import assert from "node:assert/strict";
import { joinNotionChunks, splitNotionSections, readNotionChapter } from "./notion-reading.ts";

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
  },(n,total)=>positions.push([n,total]));
  assert.equal(scanned,splitNotionSections(original).length);
  assert.equal(positions.at(-1)[0],scanned);
  assert.match(context,/COMPLETE DOCUMENT SCANNED IN/);
  assert.match(context,/MODEL-GENERATED READING NOTES/);
  assert.match(context,/ORIGINAL OPENING/);
  assert.match(context,/ORIGINAL ENDING/);
});

test("bad summaries and interrupted reading never pretend the document was read",async()=>{
  await assert.rejects(()=>readNotionChapter(doc("sample ".repeat(3000)),async()=> "not JSON"),
    /could not produce reliable section notes/);
  await assert.rejects(()=>readNotionChapter(doc("sample ".repeat(3000)),async()=> "{}",
    ()=>{},()=>true),/Generation stopped/);
});
