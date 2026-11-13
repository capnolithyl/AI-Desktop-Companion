import test from "node:test";
import assert from "node:assert/strict";
import { fitSettingsX, CHAT_WIDTH, SETTINGS_WIDTH } from "./settings-window.ts";
test("preserves Mikan's left-edge position if the expanded panel fits", () => {
  assert.equal(fitSettingsX(300, 0, 1920, SETTINGS_WIDTH), 300);
});
test("moves the expanded window left when the panel would clip offscreen", () => {
  assert.equal(fitSettingsX(1500, 0, 1920, SETTINGS_WIDTH), 840);
  assert.equal(fitSettingsX(-700, -1280, 1280, SETTINGS_WIDTH), -1080);
});
test("does not change the compact width", () => {
  assert.equal(CHAT_WIDTH, 520);
  assert.ok(SETTINGS_WIDTH > CHAT_WIDTH);
});
