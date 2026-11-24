import test from "node:test";
import assert from "node:assert/strict";
import { readCompanionUiMode, companionWindowSize } from "./companion-layout.ts";

test("existing settings migrate to Minimal, opting into Default explicitly",()=>{
  assert.equal(readCompanionUiMode(undefined),"minimal");
  assert.equal(readCompanionUiMode("weird"),"minimal");
  assert.equal(readCompanionUiMode("default"),"default");
  assert.equal(readCompanionUiMode("minimal"),"minimal");
});
test("Minimal restores the previous overlay size and always-on-top, Default is bounded",()=>{
  assert.deepEqual(companionWindowSize("minimal"),{width:520,height:740,alwaysOnTop:true});
  assert.deepEqual(companionWindowSize("default"),{width:1460,height:870,alwaysOnTop:false});
  assert.deepEqual(companionWindowSize("default",1200,800),{width:1112,height:712,alwaysOnTop:false});
});
