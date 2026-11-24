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
  assert.match(styles,/@media\(min-width:1360px\)/);
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

test("floating chat uses an accessible paw send action without losing Enter / Escape shortcuts", () => {
  const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
  const styles=readFileSync(new URL("./styles.css",import.meta.url),"utf8");
  assert.match(app,/className="send-button chat-paw-send" aria-label="Send message"/);
  assert.match(app,/\<PawPrint size=\{23\} fill="currentColor"/);
  assert.match(app,/event\.key === "Enter" && !event\.shiftKey/);
  assert.match(app,/event\.key === "Escape" && busy/);
  assert.match(app,/stopGeneration\(\)/);
  assert.match(styles,/\.companion:not\(\.settings-standalone\) > \.dock/);
  assert.match(styles,/\.chat-paw-send/);
  assert.match(styles,/prefers-reduced-motion/);
});

test("chat overflow preserves search, voice, privacy, settings and hide controls", () => {
  const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
  const menuStart=app.indexOf('className="chat-quick-menu"');
  const menuEnd=app.indexOf('className="latest-reply"',menuStart);
  assert.ok(menuStart>0&&menuEnd>menuStart);
  const menu=app.slice(menuStart,menuEnd);
  assert.match(menu,/setScreen\("search"\)/);
  assert.match(menu,/setLiveVisionEnabled\(!liveVision\.enabled\)/);
  assert.match(menu,/toggleVoiceMute\(\)/);
  assert.match(menu,/openSettings\(\)/);
  assert.match(menu,/invoke\("hide_companion"\)/);
  assert.match(menu,/clearChat\(\)/);
  assert.match(app,/chat-vision-active/);
  assert.match(app,/title=\{\`Live Vision captures every/);
  assert.doesNotMatch(app,/className="live-vision-strip"/);
});

test("chat file/screen actions stay accessible behind one contextual plus", () => {
  const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
  const styles=readFileSync(new URL("./styles.css",import.meta.url),"utf8");
  assert.match(app,/chatToolsOpen && <div className="chat-tool-tray"/);
  assert.match(app,/uploadRef\.current\?\.click\(\)/);
  assert.match(app,/openCapturePicker\(\)/);
  assert.match(app,/aria-label="Add an attachment or share screen"/);
  assert.match(app,/aria-expanded=\{chatToolsOpen\}/);
  assert.match(app,/chatMenuRef\.current\?\.contains\(target\)/);
  assert.match(styles,/\.chat-quick-menu/);
  assert.match(styles,/\.chat-tool-tray/);
  assert.match(styles,/--panel-rgb/);
});

test("floating chat glow fades within the transparent native window and the model arrow has inset clearance", () => {
  const css = readFileSync(new URL("./styles.css",import.meta.url),"utf8");
  const dockStart = css.indexOf(".companion:not(.settings-standalone) > .dock {");
  const dockEnd = css.indexOf("\n}",dockStart);
  assert.ok(dockStart>0 && dockEnd>dockStart);
  const dock = css.slice(dockStart,dockEnd);
  assert.match(dock,/left:16px;right:16px;bottom:16px/);
  assert.match(dock,/inset 0 0 22px/);
  assert.doesNotMatch(dock,/0 0 39px|0 12px 38px/);
  const switcher = css.slice(css.indexOf(".companion:not(.settings-standalone) .model-switcher {"));
  assert.match(switcher,/appearance:none/);
  assert.match(switcher,/padding:7px 34px 7px 10px/);
  assert.match(switcher,/\.model-switcher::after \{/);
  assert.match(switcher,/right:19px/);
  assert.match(switcher,/pointer-events:none/);
});

test("Look & feel offers persisted Minimal and Default desktop shells",()=>{
  const storage=readFileSync(new URL("./storage.ts",import.meta.url),"utf8");
  const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
  const shell=readFileSync(new URL("./DefaultCompanionShell.tsx",import.meta.url),"utf8");
  assert.match(storage,/uiMode: "minimal"/);
  assert.match(storage,/uiMode: readCompanionUiMode\(v\.uiMode\)/);
  assert.match(app,/settingsTab === "interface"/);
  assert.match(app,/control-layout-choices/);
  assert.match(app,/draft\.appearance\.uiMode===value/);
  assert.match(app,/settings\.appearance\.uiMode === "default"/);
  assert.match(app,/const avatarContents =/);
  assert.match(app,/const composerControls =/);
  assert.match(app,/DefaultCompanionShell/);
  assert.match(shell,/className="workspace-iki-stage"/);
  assert.match(shell,/\{avatar\}/);
  assert.match(shell,/className="workspace-transcript"/);
  assert.match(shell,/className="workspace-action-chips"/);
});

test("native resizing is restricted to main companion and honors overlay mode",()=>{
  const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
  const perms=readFileSync(new URL("../src-tauri/capabilities/default.json",import.meta.url),"utf8");
  assert.match(app,/if\(standaloneSettings\|\|typeof window/);
  assert.match(app,/await native\.setSize\(new LogicalSize\(target\.width,target\.height\)\)/);
  assert.match(app,/await native\.setAlwaysOnTop\(target\.alwaysOnTop\)/);
  assert.match(app,/await native\.setMinSize/);
  assert.match(perms,/core:window:allow-set-min-size/);
  assert.match(perms,/core:window:allow-set-always-on-top/);
  assert.match(perms,/core:window:allow-center/);
});

test("Default reuses native Iki and composer without duplicating memory state",()=>{
  const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
  const avatar=readFileSync(new URL("./IkiAvatar.tsx",import.meta.url),"utf8");
  assert.match(app,/avatar=\{<div className="workspace-avatar-rig"/);
  assert.match(app,/\{avatarContents\}/);
  assert.match(app,/composer=\{composerControls\}/);
  assert.match(app,/modelPicker=\{modelFooter\}/);
  assert.match(avatar,/new IkiPlayer\(canvas\)/);
  assert.match(app,/onOpenChat=\{id=>\{void openConversation\(id\);\}\}/);
  assert.match(app,/onExpression=\{\(\)=>/);
});
