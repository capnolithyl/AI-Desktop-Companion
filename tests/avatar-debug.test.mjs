import test from "node:test";
import assert from "node:assert/strict";
import { avatarDebugText } from "../src/avatar-debug.ts";

test("shows why an avatar cue did or did not animate", () => {
  const report = avatarDebugText({
    status: "ready", rig: "Mikan v3 (bundled)", fps: 60,
    expressions: ["smile", "laugh"], motions: ["Nod"],
    lastReaction: { serial: 3, kind: "laugh", source: "reply", result: "expression laugh" },
    activeExpression: "laugh", activeMotion: null, speaking: true,
    mouthOpen: 0.34, breath: 0.12, eyeL: 1, eyeR: 1
  }, "animated", "laugh");
  assert.match(report, /Last reply cue: laugh/);
  assert.match(report, /#3 laugh \(reply\) - expression laugh/);
  assert.match(report, /Active expression: laugh/);
  assert.match(report, /Breath: 0.12/);
  assert.match(report, /Mouth open: 0.34/);
});

test("shows when a portrait or uninitialized rig cannot react", () => {
  assert.match(avatarDebugText(null, "portrait", "none"), /renderer inactive/);
  assert.match(avatarDebugText(null, "animated", "none"), /not initialized/);
});
