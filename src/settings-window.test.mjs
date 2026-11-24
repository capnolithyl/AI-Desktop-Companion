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

test("desktop has an inline first-paint loading screen, with a reduced-motion fallback", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.ok(html.indexOf('id="mikan-startup"') < html.indexOf('src="/src/main.tsx"'));
  assert.match(html, /classList\.add\("mikan-booting"\)/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(app, /classList\.remove\("mikan-booting"\)/);
  assert.match(app, /document\.getElementById\("mikan-startup"\)\?\.remove\(\)/);
});

test("optional native Python sidecars cannot block Tauri's setup callback", () => {
  const rust = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  const setupStart = rust.indexOf(".setup(|app| {");
  const setupEnd = rust.indexOf(".on_window_event(", setupStart);
  assert.ok(setupStart > 0 && setupEnd > setupStart);
  const setup = rust.slice(setupStart, setupEnd);
  assert.match(setup, /std::thread::Builder::new\(\)/);
  assert.match(setup, /\.spawn\(move \|\| \{[\s\S]*advanced_memory::start_if_installed/);
  assert.match(setup, /\.spawn\(move \|\| \{[\s\S]*voice::start_if_configured/);
});
