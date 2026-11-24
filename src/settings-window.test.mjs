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
  assert.equal(initialSettingsTab("?tab=garbage"), "home");
  assert.equal(initialMemoryTab("?memoryTab=chats"), "chats");
  assert.equal(validSettingsTab("memory"), "memory");
  assert.equal(validSettingsTab(""), "home");
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

test("settings window creation stays async on Windows WebView2", () => {
  const rust = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(rust, /#\[tauri::command\]\s+async fn open_settings_window\(/);
});

test("failed desktop bundle loading reports an error instead of a perpetual spinner", () => {
  const entry = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
  assert.match(entry, /\.catch\(error => \{/);
  assert.match(entry, /Could not start Mikan/);
});

test("modern settings has a home and a dedicated vision section", () => {
  assert.equal(validSettingsTab("home"), "home");
  assert.equal(validSettingsTab("vision"), "vision");
  assert.equal(initialSettingsTab("?settings=1"), "home");
});

test("Control Center separates provider config, research style and memory diagnostics", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(app, /control-provider-choices/);
  assert.match(app, /draft\.provider === "nvidia" &&/);
  assert.match(app, /draft\.provider === "gemini" &&/);
  assert.match(app, /control-research-primary/);
  assert.match(app, /id="web-mikanify"/);
  assert.match(app, /settingsTab === "vision"/);
  assert.match(app, /settingsTab === "memory" && <div className="control-memory-addon">/);
  assert.match(styles, /\.settings-standalone \.control-home-grid/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("Brain Lab separates run, scenario browsing and results without changing the execution engine", () => {
  const panel = readFileSync(new URL("./BrainEvalPanel.tsx", import.meta.url), "utf8");
  for (const section of ['workspaceTab==="run"','workspaceTab==="scenarios"','workspaceTab==="results"']) {
    assert.ok(panel.includes(section), "Missing Brain Lab workspace: "+section);
  }
  assert.match(panel, /const pageSize=20/);
  assert.match(panel, /pageScenarios\.map/);
  assert.match(panel, /startBrainEvaluation\(settings/);
  assert.match(panel, /stopBrainEvaluation/);
  assert.match(panel, /metricRows\.slice\(0,6\)/);
  assert.match(panel, /metricRows\.slice\(6\)/);
});

test("saving from standalone settings keeps the Control Center visible", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.match(app, /if \(standaloneSettings\) setSettingsSaved\(true\);\s+else goCompact\(\);/);
});

test("warm Control Center decor uses bundled Mikan artwork only where wide layouts allow it", () => {
  const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
  const styles=readFileSync(new URL("./styles.css",import.meta.url),"utf8");
  assert.match(app,/CONTROL_CENTER_PORTRAIT = new URL\("\.\.\/assets\/iki\/mikan-reference\.png"/);
  assert.match(app,/className="control-portrait-aside"/);
  assert.match(app,/className="control-header-paws"/);
  assert.match(styles,/@media\(min-width:1550px\)/);
  assert.match(styles,/\.control-portrait-aside/);
  assert.match(styles,/\.control-sidebar-decoration/);
  assert.match(app,/control-inline-reset/);
  assert.match(app,/control-outfit-remove/);
});

test("Memory starts with manageable browsing and preserves hidden maintenance operations", () => {
  const memory=readFileSync(new URL("./MemoryPanel.tsx",import.meta.url),"utf8");
  const styles=readFileSync(new URL("./styles.css",import.meta.url),"utf8");
  assert.match(memory,/setVisibleLimit\]=useState\(12\)/);
  assert.match(memory,/className="memory-facts-overview"/);
  assert.match(memory,/className="memory-disclosure"/);
  assert.match(memory,/className="memory-record-options"/);
  assert.match(memory,/MemoryReviews onChanged=\{onRefresh\}/);
  assert.match(memory,/MemoryImporter facts=\{facts\}/);
  assert.match(memory,/Show 12 more/);
  assert.match(styles,/\.memory-record-options/);
});

test("Brain Lab Mikanify controls cannot stretch past their settings grid", () => {
  const brain=readFileSync(new URL("./BrainEvalPanel.tsx",import.meta.url),"utf8");
  const css=readFileSync(new URL("./brain-eval.css",import.meta.url),"utf8");
  assert.match(brain,/className="brain-mikanify-copy"/);
  assert.match(brain,/aria-label="Mikanify answer \(experimental second local pass\)"/);
  assert.match(css,/label\.brain-eval-mikanify/);
  assert.match(css,/flex-direction:row/);
  assert.match(css,/overflow-wrap:anywhere/);
});
