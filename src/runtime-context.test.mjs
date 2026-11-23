import test from "node:test";
import assert from "node:assert/strict";
import { runtimeContext, chatRuntimeContext, localWeekendWindow, deviceLocalCalendarDate, pocketRuntimeContext, deviceClockAnswer } from "./runtime-context.ts";

const utcNextDay = new Date("2026-11-08T00:15:00.000Z");

test("phone local date does not flip to tomorrow when UTC crosses midnight", () => {
  assert.equal(deviceLocalCalendarDate(utcNextDay, "America/Detroit"), "2026-11-07");
  assert.equal(deviceLocalCalendarDate(utcNextDay, "UTC"), "2026-11-08");
  const prompt = pocketRuntimeContext(utcNextDay, "America/Detroit");
  assert.match(prompt, /Saturday, November 7, 2026/);
  assert.match(prompt, /2026-11-07/);
  assert.match(prompt, /America\/Detroit/);
  assert.match(prompt, /UTC timestamp: 2026-11-08T00:15:00.000Z/);
  assert.match(runtimeContext(utcNextDay), /2026-11-07/);
});

test("personal chat has the live date but not the giant web verification rubric", () => {
  const prompt=chatRuntimeContext(utcNextDay);
  assert.match(prompt,/November 7, 2026/);
  assert.match(prompt,/America\/Detroit/);
  assert.match(prompt,/established personality/);
  assert.doesNotMatch(prompt,/source|search_web|webpage|research checkpoint/i);
  assert.ok(prompt.length<600);
});

test("the device answers simple clock questions locally without a search or citations", () => {
  assert.equal(deviceClockAnswer("What date is it?", utcNextDay, "America/Detroit"),
    "It's Saturday, November 7, 2026.");
  assert.equal(deviceClockAnswer("What's today's date?", utcNextDay, "America/Detroit"),
    "It's Saturday, November 7, 2026.");
  assert.match(deviceClockAnswer("What time is it now?", utcNextDay, "America/Detroit") ?? "", /7:15 PM EST/);
  for (const question of [
    "When is the new album coming out?",
    "What date is the album scheduled for?",
    "What is its release date?",
    "What time is the NASA launch?",
    "What's the date of that concert?"
  ]) {
    assert.equal(deviceClockAnswer(question, utcNextDay, "America/Detroit"), null, question);
  }
});

test("DST is determined dynamically instead of hardcoded to EST", () => {
  const summer = new Date("2026-07-01T23:15:00.000Z");
  assert.match(pocketRuntimeContext(summer, "America/Detroit"), /EDT/);
  assert.match(deviceClockAnswer("What time is it?", summer, "America/Detroit") ?? "", /7:15 PM EDT/);
});


test("this weekend uses the user's local calendar and includes Friday through Sunday",()=>{
  const monday=new Date("2026-11-23T19:00:00.000Z");
  assert.deepEqual(localWeekendWindow(monday),
    {friday:"2026-11-27",sunday:"2026-11-29"});
  assert.match(runtimeContext(monday),/2026-11-27 to 2026-11-29/);
  assert.match(chatRuntimeContext(monday),/2026-11-27 to 2026-11-29/);
  const saturday=new Date("2026-11-28T19:00:00.000Z");
  assert.deepEqual(localWeekendWindow(saturday),
    {friday:"2026-11-27",sunday:"2026-11-29"});
  const sunday=new Date("2026-11-29T19:00:00.000Z");
  assert.deepEqual(localWeekendWindow(sunday),
    {friday:"2026-11-27",sunday:"2026-11-29"});
  const afterLocalMidnight=new Date("2026-11-30T05:15:00.000Z");
  assert.deepEqual(localWeekendWindow(afterLocalMidnight),
    {friday:"2026-12-04",sunday:"2026-12-06"});
});
