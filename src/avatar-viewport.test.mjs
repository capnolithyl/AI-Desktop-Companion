import test from "node:test";
import assert from "node:assert/strict";
import {
  avatarViewport, readAvatarVerticalOffset,
  DEFAULT_AVATAR_VERTICAL_OFFSET, MIN_AVATAR_VERTICAL_OFFSET, MAX_AVATAR_VERTICAL_OFFSET
} from "./avatar-viewport.ts";

test("original view remains unchanged for old installs and at reset", () => {
  assert.equal(readAvatarVerticalOffset(undefined), DEFAULT_AVATAR_VERTICAL_OFFSET);
  assert.deepEqual(avatarViewport(0), { x: 0, y: 110, width: 1150, height: 1050 });
});

test("positive offset raises Mikan and negative offset lowers her", () => {
  assert.equal(avatarViewport(100).y, 10);
  assert.equal(avatarViewport(-100).y, 210);
});

test("invalid settings are ignored and valid positions are clamped", () => {
  assert.equal(readAvatarVerticalOffset(999), MAX_AVATAR_VERTICAL_OFFSET);
  assert.equal(readAvatarVerticalOffset(-999), MIN_AVATAR_VERTICAL_OFFSET);
  assert.equal(readAvatarVerticalOffset(Infinity), 0);
  assert.equal(readAvatarVerticalOffset(NaN), 0);
  assert.equal(readAvatarVerticalOffset("100"), 0);
  assert.equal(readAvatarVerticalOffset(12.6), 13);
  assert.equal(avatarViewport(-999).y, 410);
});
