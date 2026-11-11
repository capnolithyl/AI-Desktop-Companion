import test from "node:test";
import assert from "node:assert/strict";
import {parseMemoryImport,memoryKey,parseTags} from "./memory-import.ts";

test("JSON supports tagged facts and simple strings",()=>{
  const data=parseMemoryImport(JSON.stringify({memories:[
    {fact:"Marcus is a WordPress developer",category:"work",tags:["wordpress","programming"],pinned:true},
    "Marcus likes black metal"
  ]}),"json");
  assert.equal(data.length,2);
  assert.deepEqual(data[0],{fact:"Marcus is a WordPress developer",category:"work",tags:["wordpress","programming"],pinned:true});
  assert.equal(data[1].category,"preferences");
});
test("CSV handles commas, escaped quotes, semicolon tags and multiline fields",()=>{
  const data=parseMemoryImport('fact,category,tags,pinned\r\n"Enjoys guitar, singing",interests,"music;guitar",yes\r\n"Says ""hello"" often",other,,false\r\n',"csv");
  assert.equal(data[0].fact,"Enjoys guitar, singing");
  assert.deepEqual(data[0].tags,["music","guitar"]);
  assert.equal(data[0].pinned,true);
  assert.equal(data[1].fact,'Says "hello" often');
});
test("Markdown strips bullets, tracks category sections and suggests tags",()=>{
  const rows=parseMemoryImport("# Work\n- Builds websites\n# Interests & hobbies\n1. Listens to black metal\n\n- Plays guitar","text");
  assert.deepEqual(rows.map(x=>x.category),["work","interests","interests"]);
  assert.equal(rows[1].fact,"Listens to black metal");
  assert.ok(rows[1].tags.includes("music"));
});
test("Bad imports fail rather than silently dropping entries",()=>{
  assert.throws(()=>parseMemoryImport('{"memories":[{"wrong":"value"}]}',"json"));
  assert.throws(()=>parseMemoryImport('[{"fact":"x","category":"admin"}]',"json"));
  assert.throws(()=>parseMemoryImport('fact,tags\nHello,"not closed',"csv"));
  assert.throws(()=>parseMemoryImport("","text"));
  assert.throws(()=>parseMemoryImport("a".repeat(501),"text"));
  assert.throws(()=>parseTags(Array.from({length:9},(_,i)=>"tag"+i)));
  assert.equal(memoryKey(" A   Memory "),memoryKey("a memory"));
});

test("common exported category names map to supported categories",()=>{
  const entries=parseMemoryImport(JSON.stringify({memories:[
    {fact:"Grew up in Germany",category:"personal"},
    {fact:"Takes an interest in anime",category:"hobbies"},
    {fact:"Speaks to relatives regularly",category:"relationships"}
  ]}),"json");
  assert.deepEqual(entries.map(x=>x.category),["profile","interests","family"]);
});

test("JSON export can be re-imported after consolidation without losing categories and pins",()=>{
  const backup=JSON.stringify({schema:"mikan-user-memories",version:1,memories:[
    {id:5,fact:"Marcus loves Fear Factory",category:"interests",tags:["music","metal"],pinned:true,
      createdAt:100,updatedAt:200,referenceCount:18,importance:95}
  ]});
  const imported=parseMemoryImport(backup,"json");
  assert.equal(imported.length,1);
  assert.deepEqual(imported[0],{fact:"Marcus loves Fear Factory",
    category:"interests",tags:["music","metal"],pinned:true});
});
test("replace-scale import supports up to the SQLite 2000-memory limit",()=>{
  const sample=Array.from({length:2000},(_,i)=>({fact:"Unique fact "+i,category:"other",pinned:false,tags:[]}));
  assert.equal(parseMemoryImport(JSON.stringify({memories:sample}),"json").length,2000);
  assert.throws(()=>parseMemoryImport(JSON.stringify({memories:[...sample,{fact:"Too many"}]}),"json"));
});
