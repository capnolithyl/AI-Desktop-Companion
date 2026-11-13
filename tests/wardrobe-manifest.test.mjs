import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  findIkiFiles, checkWardrobe, syncWardrobe, readWardrobeFile, OUTFITS_DIR
} from "../scripts/wardrobe-manifest.mjs";

const defaultEntry = {
  id: "bundled", name: "Original · Mikan v3", file: "default/mikan-auto-rig-v3.iki",
  default: true, season: "all", holiday: "none", favorite: false
};
const manifest = (...extra) => ({ version: 1, outfits: [defaultEntry, ...extra] });

test("real wardrobe.json and all checked-in .iki outfits stay in sync both directions", () => {
  const actual = findIkiFiles(OUTFITS_DIR);
  assert.ok(actual.length > 0, "No .iki files found in the outfits directory.");
  assert.deepEqual(checkWardrobe(readWardrobeFile(), actual), []);
});

test("bundled renderer derives the default URL from wardrobe.json, not a hardcoded filename", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const player = readFileSync(join(root, "src/IkiAvatar.tsx"), "utf8");
  const catalog = readFileSync(join(root, "src/bundled-iki-outfits.ts"), "utf8");
  const declared = readWardrobeFile().outfits.find(outfit => outfit.default)?.file;
  assert.ok(declared);
  assert.match(player, /import \{ defaultRigUrl as bundledRigUrl \} from "\.\/bundled-iki-outfits"/);
  assert.match(catalog, /defaultRigUrl = assets\[prefix \+ defaultEntry\.file\]/);
  assert.match(catalog, /import\.meta\.glob/);
});

test("missing manifest entries are detected, including files in nested folders", () => {
  assert.match(checkWardrobe(manifest(), [
    defaultEntry.file, "gothic-blouse-v1/mikan-gothic-blouse-v1.iki"
  ]).join(" "), /Unregistered.*gothic-blouse/i);
});

test("stale manifest entries are detected when an outfit file is missing", () => {
  assert.match(checkWardrobe(manifest(), []).join(" "), /Missing.*default/i);
  assert.match(checkWardrobe(manifest({
    id: "missing", name: "Ghost", file: "missing/ghost.iki",
    season: "all", holiday: "none"
  }), [defaultEntry.file]).join(" "), /Missing.*missing\/ghost.iki/i);
});

test("duplicate ids, paths, and paths outside outfits are rejected", () => {
  const duplicate = {
    id: "bundled", name: "Duplicate", file: defaultEntry.file,
    season: "all", holiday: "none"
  };
  const errors = checkWardrobe(manifest(duplicate), [defaultEntry.file]).join(" ");
  assert.match(errors, /Duplicate outfit id/);
  assert.match(errors, /Duplicate file reference/);
  const traversal = checkWardrobe(manifest({
    id: "escape", name: "Escape", file: "../outside.iki", season: "all", holiday: "none"
  }), [defaultEntry.file]).join(" ");
  assert.match(traversal, /invalid \.iki file path/i);
});

test("sync registers newly discovered .iki files but never discards metadata", () => {
  const current = manifest({
    id: "metal", name: "Månegarm Shirt", file: "manegarm/mikan-manegarm.iki",
    season: "all", holiday: "none", favorite: true
  });
  const files = [defaultEntry.file, "manegarm/mikan-manegarm.iki", "christmas-v1/mikan-christmas-v1.iki"];
  const result = syncWardrobe(current, files);
  assert.equal(result.additions.length, 1);
  assert.equal(result.additions[0].holiday, "christmas");
  assert.equal(result.manifest.outfits[1].favorite, true);
  assert.deepEqual(checkWardrobe(result.manifest, files), []);
  assert.throws(() => syncWardrobe(current, [defaultEntry.file]), /Missing registered outfit/i);
});

test("directory scan finds real .iki files while ignoring source art and folders", t => {
  const root = mkdtempSync(join(tmpdir(), "mikan-wardrobe-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "a"), { recursive: true });
  mkdirSync(join(root, "b", "nested"), { recursive: true });
  writeFileSync(join(root, "a", "look.iki"), "{}");
  writeFileSync(join(root, "a", "source.png"), "");
  writeFileSync(join(root, "b", "nested", "festival.iki"), "{}");
  assert.deepEqual(findIkiFiles(root), ["a/look.iki", "b/nested/festival.iki"]);
});
