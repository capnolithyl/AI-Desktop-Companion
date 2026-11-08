import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Pocket header derives its version from Android Gradle, never a second constant", () => {
  const gradle = readFileSync(new URL("../../android/app/build.gradle.kts", import.meta.url), "utf8");
  const vite = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("./MobileApp.tsx", import.meta.url), "utf8");
  const version = gradle.match(/versionName\s*=\s*"([^"]+)"/)?.[1];
  assert.match(version ?? "", /^\d+\.\d+\.\d+$/);
  assert.match(vite, /pocketVersion = androidGradle\.match/);
  assert.match(vite, /__POCKET_VERSION__: JSON\.stringify\(pocketVersion\)/);
  assert.match(app, /POCKET COMPANION · LOCAL · v\{__POCKET_VERSION__\}/);
  assert.doesNotMatch(app, /POCKET COMPANION · LOCAL · v\d/);
});
