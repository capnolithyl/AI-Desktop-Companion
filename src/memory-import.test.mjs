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
