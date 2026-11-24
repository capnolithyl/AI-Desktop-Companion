import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initialSettingsTab, initialMemoryTab, isStandaloneSettingsWindow,
  validSettingsTab, validMemoryTab
} from "./settings-window.ts";

test("standalone settings route is opt-in and does not affect the compact chat window", () => {
  assert.equal(isStandaloneSettingsWindow(""), false);
  assert.equal(isStandaloneSettingsWindow("?settings=1&tab=brain"), true);
  assert.equal(isStandaloneSettingsWindow("?settings=0"), false);
});
test("deep-link and reopen targets are validated", () => {
  assert.equal(initialSettingsTab("?settings=1&tab=brain"), "brain");
  assert.equal(initialSettingsTab("?tab=garbage"), "appearance");
  assert.equal(initialMemoryTab("?memoryTab=chats"), "chats");
  assert.equal(validSettingsTab("memory"), "memory");
  assert.equal(validSettingsTab(""), "appearance");
  assert.equal(validMemoryTab("../../foo"), "facts");
});

// Tauri/WebView2 can deadlock on Windows if native windows are created by a synchronous command.
test("native Settings creation runs from an async Tauri command", () => {
  const nativeSource = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(nativeSource, /#\[tauri::command\]\s+async fn open_settings_window\(/);
});

test("the Settings startup loader is inline, route-scoped and dismissed after React mounts", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const native = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(html, /new URLSearchParams\(window\.location\.search\)\.get\("settings"\) === "1"/);
  assert.match(html, /id="settings-startup"/);
  assert.ok(html.indexOf('id="settings-startup"') < html.indexOf('type="module" src="/src/main.tsx"'));
  assert.match(html, /prefers-reduced-motion/);
  assert.match(app, /if \(!standaloneSettings\) return;[\s\S]*?classList\.add\("mikan-settings-ready"\)/);
  assert.match(app, /document\.getElementById\("settings-startup"\)\?\.remove\(\)/);
  assert.match(native, /\.background_color\(tauri::window::Color\(/);
});
