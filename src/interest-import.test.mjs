import test from "node:test";
import assert from "node:assert/strict";
import { parseInterests, parseCanon, interestKey, canonKey } from "./interest-import.ts";

test("plain title lists do not invent ratings, experiences or opinions", () => {
  const rows=parseInterests("Higurashi\nErgo Proxy\n", "text", {kind:"anime",status:"unknown"});
  assert.equal(rows.length,2);
  assert.deepEqual(rows[0],{name:"Higurashi",kind:"anime",status:"unknown",
    rating:null,notes:"",tags:[]});
});

test("CSV handles quoted commas and ratings without changing explicit relationships",()=>{
  const rows=parseInterests('title,kind,status,rating,notes,tags\n"Sonata Arctica, Live",band,like,8,"old, but good","metal; live"\n', "csv");
  assert.deepEqual(rows,[{name:"Sonata Arctica, Live",kind:"band",status:"like",
    rating:8,notes:"old, but good",tags:["metal","live"]}]);
});

test("JSON exports can carry collections in a named property",()=>{
  const rows=parseInterests(JSON.stringify({interests:[
    {name:"Bathory",kind:"band",status:"dislike",rating:4},
    {name:"Fear Factory",kind:"band",status:"experienced"}
  ]}),"json");
  assert.equal(rows[0].status,"dislike");
  assert.equal(rows[1].rating,null);
});

test("watched and played imports mean experienced, never liked",()=>{
  const rows=parseInterests("name,kind,status\nHigurashi,anime,watched\nSolasta,game,played","csv");
  assert.deepEqual(rows.map(r=>r.status),["experienced","experienced"]);
});

test("kind and case identify duplicates, not name alone",()=>{
  assert.equal(interestKey({name:" HIGURASHI ",kind:"anime"}),interestKey({name:"higurashi",kind:"anime"}));
  assert.notEqual(interestKey({name:"Higurashi",kind:"show"}),interestKey({name:"Higurashi",kind:"anime"}));
});

test("malformed relationship and too-large ratings are rejected",()=>{
  assert.throws(()=>parseInterests("name,status\nSomething,conflicted","csv"),/invalid relationship/);
  assert.throws(()=>parseInterests('[{"name":"X","rating":11}]',"json"),/rating/);

});

test("Mikan can bulk import JSON, CSV, or label-value text",()=>{
  const rows=parseCanon("Favorite color: Orange\nFavorite music: Synthwave","text");
  assert.deepEqual(rows,[{category:"other",label:"Favorite color",value:"Orange"},
    {category:"other",label:"Favorite music",value:"Synthwave"}]);
  assert.equal(parseCanon("category,label,value\nfavorites,Favorite color,Orange","csv")[0].category,"favorites");
  assert.equal(parseCanon('[{"category":"traits","label":"Humor","value":"Playful"}]',"json")[0].value,"Playful");
  assert.equal(canonKey({label:" Favorite color "}),canonKey({label:"favorite COLOR"}));
});

test("Mikan canon import rejects missing values or unknown categories",()=>{
  assert.throws(()=>parseCanon("Favorite color: ","text"),/value/);
  assert.throws(()=>parseCanon("category,label,value\nmagic,Color,Orange","csv"),/unknown/);
});

test("song and track imports retain their media type instead of becoming albums",()=>{
  const rows=parseInterests(["name,kind,status","Thoughts Without Words,song,favorite","Another Tune,track,like"].join("\n"),"csv");
  assert.deepEqual(rows.map(r=>r.kind),["song","song"]);
  assert.equal(rows[0].status,"favorite");
  assert.notEqual(interestKey(rows[0]),interestKey({...rows[0],kind:"album"}));
});
