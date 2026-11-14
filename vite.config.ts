import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// The Android manifest version is authoritative. No independently maintained
// React header version, so upgrading the APK cannot leave a stale UI label.
const androidGradle = readFileSync(new URL("./android/app/build.gradle.kts", import.meta.url), "utf8");
const pocketVersion = androidGradle.match(/versionName\s*=\s*"([^"]+)"/)?.[1];
if (!pocketVersion) throw new Error("Android versionName not found in app/build.gradle.kts");

const appVersion = JSON.parse(readFileSync(new URL("./package.json",import.meta.url),"utf8")).version;
let buildCommit = "nogit";
try {
  buildCommit=execFileSync("git",["rev-parse","--short=12","HEAD"],{
    cwd:new URL(".",import.meta.url),encoding:"utf8",timeout:2000,stdio:["ignore","pipe","ignore"]
  }).trim();
} catch { /* Version fallback still invalidates previous release results. */ }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1"
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  define: {
    __POCKET_VERSION__: JSON.stringify(pocketVersion),
    __MIKAN_EVAL_BUILD__: JSON.stringify(appVersion+"+"+buildCommit)
  }
});
