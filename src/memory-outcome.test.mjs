import test from "node:test";
import assert from "node:assert/strict";
import {automaticMemoryNotice} from "./memory-outcome.ts";

test("identifies the exact status change reported by SQLite",()=>{
  const text=automaticMemoryNotice({userSaved:0,characterSaved:0,interestsSaved:1,
    interestChanges:[{name:"Shadows Fall",previousStatus:"like",status:"favorite"}],
    reviewQueued:0});
  assert.equal(text,"Updated Shadows Fall: like → favorite");
});
test("correctly distinguishes new records, changes and memory reviews",()=>{
  const text=automaticMemoryNotice({userSaved:1,characterSaved:1,interestsSaved:2,
    interestChanges:[{name:"Band X",previousStatus:"interested",status:"favorite"}],
    reviewQueued:1});
  assert.match(text,/Updated Band X: interested → favorite/);
  assert.match(text,/Remembered 1 fact about you · 1 detail about Mikan · 1 new interest/);
  assert.match(text,/1 suggested memory correction ready for review/);
});
test("a no-op extraction never announces a memory",()=>{
  assert.equal(automaticMemoryNotice({userSaved:0,characterSaved:0,
    interestsSaved:0,interestChanges:[],reviewQueued:0}),null);
});
