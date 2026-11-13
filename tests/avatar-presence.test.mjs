import test from "node:test";
import assert from "node:assert/strict";
import {
  motionTarget, advancePresence, INITIAL_PRESENCE, DEFAULT_AVATAR_PRESENCE
} from "../src/avatar-presence.ts";

const example = {
  cursorX: 440, cursorY: 160,
  windowX: 100, windowY: 100,
  windowWidth: 520, windowHeight: 740,
  velocityX: 0, velocityY: 0, motionAgeMs: 10000
};

test("cursor tracking follows gently and never exceeds the safe head/gaze range", () => {
  const center = motionTarget(example, DEFAULT_AVATAR_PRESENCE, false);
  assert.ok(center.eyeX > 0 && center.headX > 0 && center.weight > 0);
  assert.ok(Math.abs(center.headX) <= 3.3);
  assert.ok(Math.abs(center.eyeX) <= 0.58);
  const extreme = motionTarget({...example, cursorX: 10000}, DEFAULT_AVATAR_PRESENCE, false);
  assert.equal(extreme.weight, 0, "cursor on another distant monitor returns to idle");
  const disabled = motionTarget(example, {followCursor: false, dragSway: true}, false);
  assert.equal(disabled.weight, 0);
  const dragging = motionTarget(example, DEFAULT_AVATAR_PRESENCE, true);
  assert.equal(dragging.weight, 0, "don't cross-eye her while dragging the avatar");
});

test("window velocity gives the hair a subtle spring kick that settles after release", () => {
  const moving = motionTarget({
    ...example, velocityX: 1100, velocityY: 350, motionAgeMs: 12
  }, DEFAULT_AVATAR_PRESENCE, true);
  assert.ok(moving.dragX < 0, "hair lags behind rightward drag");
  let current = {...INITIAL_PRESENCE};
  for (let i = 0; i < 20; i++) current = advancePresence(current, moving, 16);
  assert.ok(current.dragX < -0.12, "hair movement becomes visible");
  const released = motionTarget({ ...example, motionAgeMs: 10000 }, DEFAULT_AVATAR_PRESENCE, false);
  const atRelease = current.dragX;
  current = advancePresence(current, released, 16);
  assert.ok(Math.abs(current.dragX) > 0.01, "does not snap to rest on mouse release");
  assert.ok(Math.abs(current.dragX) <= 1.15);
  for (let i = 0; i < 220; i++) current = advancePresence(current, released, 16);
  assert.ok(Math.abs(current.dragX) < 0.01, "spring settles to idle");
  assert.ok(Math.abs(atRelease) > 0.1);
});

test("bad samples and time hitches cannot create violent motion", () => {
  const target = motionTarget({
    ...example, velocityX: Number.POSITIVE_INFINITY,
    velocityY: Number.NaN, motionAgeMs: Number.NaN
  }, DEFAULT_AVATAR_PRESENCE, false);
  assert.equal(target.dragX, 0);
  assert.equal(target.dragY, 0);
  const next = advancePresence({...INITIAL_PRESENCE}, {...target, headX: 3.3}, 100000);
  assert.ok(next.headX >= 0 && next.headX <= 3.3);
});
