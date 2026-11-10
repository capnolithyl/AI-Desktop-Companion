import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPTURE_INTERVAL_MIN,CAPTURE_INTERVAL_MAX,CAPTURE_INTERVAL_DEFAULT,
  ANALYSIS_POLICY,captureInterval,dragToRegion,validScreenRegion,restoreRegion,canStartRegionSelection,finalizeRegionSelection
} from "./capture-region.ts";

test("capture can sample every 1–20 seconds independent of model inference",()=>{
  assert.equal(CAPTURE_INTERVAL_MIN,1);
  assert.equal(CAPTURE_INTERVAL_MAX,20);
  assert.equal(CAPTURE_INTERVAL_DEFAULT,15);
  assert.equal(captureInterval(1),1);
  assert.equal(captureInterval(20),20);
  assert.equal(captureInterval(0),1);
  assert.equal(captureInterval(999),20);
  assert.equal(captureInterval(2.9),3);
  assert.equal(captureInterval("2"),15);
  assert.equal(captureInterval(NaN),15);
  assert.equal(ANALYSIS_POLICY,"on-message");
});

test("ultrawide rectangle maps to full native physical monitor pixels",()=>{
  const region=dragToRegion(
    {x:250,y:50},{x:750,y:300},
    {width:1280,height:360},{width:5120,height:1440}
  );
  assert.deepEqual(region,{x:1000,y:200,width:2000,height:1000});
});

test("dragging backwards on a high-DPI preview works",()=>{
  const region=dragToRegion(
    {x:500,y:300},{x:100,y:100},
    {width:640,height:360},{width:3840,height:2160}
  );
  assert.deepEqual(region,{x:600,y:600,width:2400,height:1200});
});

test("tiny/offscreen/overflow selections cannot reach xcap",()=>{
  assert.equal(dragToRegion({x:1,y:1},{x:3,y:3},{width:800,height:600},{width:1280,height:960}),null);
  assert.equal(dragToRegion({x:1,y:1},{x:50,y:50},{width:0,height:600},{width:1280,height:960}),null);
  assert.equal(validScreenRegion({x:3800,y:0,width:90,height:100},3840,2160),false);
  assert.equal(validScreenRegion({x:0,y:0,width:Infinity,height:100},3840,2160),false);
  assert.equal(validScreenRegion({x:0,y:0,width:48,height:48},3840,2160),true);
  const clipped=dragToRegion(
    {x:-100,y:-100},{x:900,y:700},{width:800,height:600},{width:1920,height:1080}
  );
  assert.deepEqual(clipped,{x:0,y:0,width:1920,height:1080});
});

test("stored monitor/region is validated, never a saved screenshot or capture permission",()=>{
  const choice={monitorIndex:1,region:{x:250,y:200,width:1100,height:750}};
  assert.deepEqual(restoreRegion(choice),choice);
  assert.equal(restoreRegion({monitorIndex:-1,region:choice.region}),null);
  assert.equal(restoreRegion({monitorIndex:1,region:{x:4,y:4,width:10,height:10}}),null);
  assert.equal(restoreRegion({monitorIndex:1,region:{x:10,y:10,width:999999,height:100}}),null);
  assert.equal(restoreRegion({monitorIndex:0,region:{x:0,y:0,width:Infinity,height:Infinity}}),null);
});

test("finished drag locks region until explicit redraw, including high DPI ultrawides",()=>{
  let locked=false;
  assert.equal(canStartRegionSelection(locked),true);
  const result=finalizeRegionSelection(
    {x:450,y:270},{x:50,y:45},
    {width:640,height:360},{width:3840,height:2160}
  );
  assert.deepEqual(result,{locked:true,region:{x:300,y:270,width:2400,height:1350}});
  locked=result.locked;
  // A click elsewhere must not reset a selected region.
  assert.equal(canStartRegionSelection(locked),false);
  const selected=result.region;
  assert.deepEqual(selected,{x:300,y:270,width:2400,height:1350});
  // Only Redraw explicitly unlocks the selection.
  locked=false;
  assert.equal(canStartRegionSelection(locked),true);
});

test("invalid/tiny drag cannot enter review mode or enable confirmation",()=>{
  const selection=finalizeRegionSelection(
    {x:140,y:100},{x:143,y:103},
    {width:800,height:600},{width:1600,height:1200}
  );
  assert.deepEqual(selection,{locked:false,region:null});
  assert.equal(canStartRegionSelection(selection.locked),true);
});

test("a full display drag reaches every physical pixel and is confirmable",()=>{
  const result=finalizeRegionSelection(
    {x:0,y:0},{x:1200,y:338},
    {width:1200,height:338},{width:5120,height:1440}
  );
  assert.deepEqual(result,{locked:true,region:{x:0,y:0,width:5120,height:1440}});
  assert.equal(canStartRegionSelection(result.locked),false);
});
