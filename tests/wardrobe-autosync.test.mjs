import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stagedIkiPaths } from "../scripts/wardrobe-precommit.mjs";
import { syncWardrobe, checkWardrobe } from "../scripts/wardrobe-manifest.mjs";

test("pre-commit scans only STAGED .iki files and registers them without manual sync", t => {
  const root = mkdtempSync(join(tmpdir(), "mikan-commit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = join(root, "assets", "iki", "mikan-v02", "outfits");
  mkdirSync(join(folder, "default"), { recursive: true });
  mkdirSync(join(folder, "new-shirt"), { recursive: true });
  mkdirSync(join(folder, "unfinished"), { recursive: true });
  writeFileSync(join(folder, "default", "mikan.iki"), "{}");
  writeFileSync(join(folder, "new-shirt", "shirt.iki"), "{}");
  writeFileSync(join(folder, "unfinished", "wip.iki"), "{}");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "assets/iki/mikan-v02/outfits/default/mikan.iki",
    "assets/iki/mikan-v02/outfits/new-shirt/shirt.iki"], { cwd: root });
  const staged = stagedIkiPaths(root);
  assert.deepEqual(staged.sort(), ["default/mikan.iki", "new-shirt/shirt.iki"]);
  const existing = { version: 1, outfits: [{
    id: "bundled", name: "Original", file: "default/mikan.iki",
    default: true, season: "all", holiday: "none", favorite: false
  }] };
  const result = syncWardrobe(existing, staged);
  assert.equal(result.additions.length, 1);
  assert.equal(result.additions[0].file, "new-shirt/shirt.iki");
  assert.deepEqual(checkWardrobe(result.manifest, staged), []);
  assert.equal(result.manifest.outfits[0].name, "Original");
});
