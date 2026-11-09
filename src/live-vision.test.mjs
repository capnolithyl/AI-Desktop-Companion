import test from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_VISION_OFF,LIVE_VISION_STATUS_INTERVAL_SECONDS,frameIsRecent,
  shouldAttachLiveFrame,liveVisionContext,liveVisionUnavailableContext,allowLiveSlash
} from "./live-vision.ts";

const defaultTurn={
  enabled:true,planMode:"chat",manualScreenshot:false,fileAttached:false,
  explicitSearch:false,remoteMessage:false
};

test("Live Vision is off by default and samples at a bounded interval",()=>{
  assert.equal(LIVE_VISION_OFF.enabled,false);
  assert.equal(LIVE_VISION_OFF.lastCaptureAtMs,null);
  assert.equal(LIVE_VISION_INTERVAL_SECONDS,15);
});
test("Live Vision is used only for consenting local chat",()=>{
  assert.equal(shouldAttachLiveFrame(defaultTurn),true);
  for(const overrides of [
    {enabled:false},{planMode:"research"},{planMode:"factual"},
    {manualScreenshot:true},{fileAttached:true},
    {explicitSearch:true},{remoteMessage:true}
  ]){
    assert.equal(shouldAttachLiveFrame({...defaultTurn,...overrides}),false,JSON.stringify(overrides));
  }
});
test("stale or future screenshots are not attached",()=>{
  const frame={capture:{imageBase64:"sensitive",width:100,height:80,label:"Display 1"},capturedAtMs:10_000};
  assert.equal(frameIsRecent(frame,35_000),true);
  assert.equal(frameIsRecent(frame,90_000),false);
  assert.equal(frameIsRecent(frame,9_000),false);
  assert.equal(frameIsRecent(null),false);
});
test("model context is truthful and never quotes secret base64",()=>{
  const frame={capture:{imageBase64:"PRIVATE-SCREEN-JPEG",width:900,height:500,label:"Screen one"},capturedAtMs:Date.now()-4_000};
  const info=liveVisionContext(frame);
  assert.match(info,/owner explicitly enabled/);
  assert.match(info,/intermittent still frame/);
  assert.match(info,/NOT live video/);
  assert.match(info,/UNTRUSTED DATA/);
  assert.doesNotMatch(info,/PRIVATE-SCREEN-JPEG/);
  assert.match(liveVisionUnavailableContext(true),/no recent screenshot/);
  assert.equal(liveVisionUnavailableContext(false),"");
});

test("remote browser cannot toggle local native screen watcher",()=>{
  assert.equal(allowLiveSlash("/live on",true),false);
  assert.equal(allowLiveSlash("/live off",true),false);
  assert.equal(allowLiveSlash(" /LIVE on",true),false);
  assert.equal(allowLiveSlash("/live on",false),true);
  assert.equal(allowLiveSlash("/search latest news",true),true);
});
