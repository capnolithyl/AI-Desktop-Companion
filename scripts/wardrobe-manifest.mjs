/**
 * Mikan's checked-in wardrobe manifest.
 *
 * npm run wardrobe:check  -> fail for missing files OR unregistered .iki files
 * npm run wardrobe:sync   -> add new .iki files, preserving existing metadata
 *
 * The runtime's IndexedDB outfit cache is separate: only real .iki files under
 * assets/iki/mikan-v02/outfits/ are catalogued here. No invented files.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OUTFITS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/iki/mikan-v02/outfits");
export const MANIFEST_PATH = join(OUTFITS_DIR, "wardrobe.json");

function normalizeFile(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/")) return null;
  const parts = value.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) return null;
  if (!/\.iki$/i.test(value)) return null;
  return value;
}

/** File paths are relative to outfits/, with forward slashes on every platform. */
export function findIkiFiles(folder = OUTFITS_DIR) {
  const found = [];
  function visit(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        visit(join(dir, entry.name), prefix ? prefix + "/" + entry.name : entry.name);
      } else if (entry.isFile() && /\.iki$/i.test(entry.name)) {
        found.push(prefix ? prefix + "/" + entry.name : entry.name);
      }
    }
  }
  visit(folder, "");
  return found.sort((a, b) => a.localeCompare(b, "en-US"));
}

export function checkWardrobe(manifest, files) {
  const errors = [];
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.outfits)) {
    return ["wardrobe.json must contain { version: 1, outfits: [...] }."];
  }
  const ids = new Set(), registeredFiles = new Set(), declaredCase = new Map();
  let defaultCount = 0;
  for (const [index, outfit] of manifest.outfits.entries()) {
    const label = "outfits[" + index + "]";
    if (!outfit || typeof outfit !== "object" || Array.isArray(outfit)) {
      errors.push(label + " is not an object.");
      continue;
    }
    if (typeof outfit.id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(outfit.id)) {
      errors.push(label + " has an invalid id.");
    } else if (ids.has(outfit.id)) {
      errors.push("Duplicate outfit id: " + outfit.id);
    } else ids.add(outfit.id);
    if (typeof outfit.name !== "string" || !outfit.name.trim()) {
      errors.push(label + " needs a name.");
    }
    const filename = normalizeFile(outfit.file);
    if (!filename) {
      errors.push(label + " has an invalid .iki file path (must stay inside outfits/).");
    } else if (registeredFiles.has(filename.toLocaleLowerCase("en-US"))) {
      errors.push("Duplicate file reference: " + filename);
    } else {
      registeredFiles.add(filename.toLocaleLowerCase("en-US"));
      declaredCase.set(filename.toLocaleLowerCase("en-US"), filename);
    }
    if (outfit.default === true) {
      defaultCount++;
      if (outfit.id !== "bundled") errors.push("The default outfit must have id 'bundled'.");
    }
    if (!["all", "spring", "summer", "autumn", "winter"].includes(outfit.season)) {
      errors.push(label + " has an invalid season.");
    }
    if (!["none", "halloween", "christmas", "easter"].includes(outfit.holiday)) {
      errors.push(label + " has an invalid holiday.");
    }
    if (outfit.favorite !== undefined && typeof outfit.favorite !== "boolean") {
      errors.push(label + " has an invalid favorite flag.");
    }
  }
  if (defaultCount !== 1) errors.push("Exactly one outfit must have default: true.");

  const actual = new Set(files.map(file => file.toLocaleLowerCase("en-US")));
  const actualCase = new Map(files.map(file => [file.toLocaleLowerCase("en-US"), file]));
  if (actual.size !== files.length) errors.push("Case-insensitive duplicate .iki filenames exist on disk.");
  for (const file of registeredFiles) {
    if (!actual.has(file)) errors.push("Missing .iki file referenced by wardrobe.json: " + file);
    else if (actualCase.get(file) !== declaredCase.get(file)) {
      errors.push("Filename casing differs from disk: " + declaredCase.get(file)
        + " (actual: " + actualCase.get(file) + ")");
    }
  }
  for (const file of files) {
    if (!registeredFiles.has(file.toLocaleLowerCase("en-US"))) {
      errors.push("Unregistered .iki file: " + file + " (run npm run wardrobe:sync)");
    }
  }
  return errors;
}

function inferredMetadata(file) {
  const lower = file.toLocaleLowerCase("en-US");
  if (/christmas|xmas|santa|yule/.test(lower)) return { season: "winter", holiday: "christmas" };
  if (/halloween|witch|vampire|zombie/.test(lower)) return { season: "autumn", holiday: "halloween" };
  if (/easter|bunny/.test(lower)) return { season: "spring", holiday: "easter" };
  if (/summer|swim|beach/.test(lower)) return { season: "summer", holiday: "none" };
  if (/gothic|goth/.test(lower)) return { season: "autumn", holiday: "none" };
  if (/sweater|coat|hoodie/.test(lower)) return { season: "winter", holiday: "none" };
  return { season: "all", holiday: "none" };
}

function displayName(file) {
  const name = file.split("/").at(-1).replace(/\.iki$/i, "")
    .replace(/^mikan[-_]/i, "").replace(/[-_]v\d+$/i, "")
    .replace(/[-_]+/g, " ");
  return name.replace(/\b\w/g, char => char.toLocaleUpperCase("en-US"));
}

function stableId(file, usedIds) {
  const slug = file.replace(/\.iki$/i, "").replace(/[^a-z0-9]+/gi, "-")
    .toLocaleLowerCase("en-US").replace(/^-|-$/g, "");
  let id = slug, suffix = 2;
  while (usedIds.has(id)) id = slug + "-" + suffix++;
  return id;
}

/** Only ADD discoveries. A stale manifest entry is an error, not something to erase silently. */
export function syncWardrobe(manifest, files) {
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.outfits)) {
    throw new Error("Fix wardrobe.json schema before syncing.");
  }
  const existingFiles = new Set(manifest.outfits.map(o => typeof o.file === "string" ? o.file.toLocaleLowerCase("en-US") : ""));
  const actual = new Set(files.map(file => file.toLocaleLowerCase("en-US")));
  for (const existing of existingFiles) {
    if (!actual.has(existing)) throw new Error("Missing registered outfit: " + existing + ". Restore the file or edit wardrobe.json explicitly.");
  }
  const usedIds = new Set(manifest.outfits.map(o => o.id));
  const additions = [];
  for (const file of files) {
    if (existingFiles.has(file.toLocaleLowerCase("en-US"))) continue;
    const id = stableId(file, usedIds);
    usedIds.add(id);
    additions.push({ id, name: displayName(file), file, ...inferredMetadata(file), favorite: false });
  }
  return { manifest: { ...manifest, outfits: [...manifest.outfits, ...additions] }, additions };
}

export function readWardrobeFile(path = MANIFEST_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run() {
  const mode = process.argv[2] ?? "check";
  if (mode !== "check" && mode !== "sync") {
    console.error("Usage: node scripts/wardrobe-manifest.mjs check|sync");
    process.exitCode = 2;
    return;
  }
  let manifest = readWardrobeFile(), files = findIkiFiles();
  if (mode === "sync") {
    try {
      const result = syncWardrobe(manifest, files);
      manifest = result.manifest;
      const preliminary = checkWardrobe(manifest, files);
      if (preliminary.length) throw new Error(preliminary.join("\n"));
      if (result.additions.length) {
        writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
        console.log("Registered " + result.additions.length + " new outfit(s): " + result.additions.map(x => x.file).join(", "));
      } else console.log("Wardrobe already synced; no changes.");
    } catch (error) {
      console.error("Wardrobe sync failed: " + error.message);
      process.exitCode = 1;
      return;
    }
  }
  const errors = checkWardrobe(manifest, files);
  if (errors.length) {
    console.error("Wardrobe consistency FAILED:\n  - " + errors.join("\n  - "));
    process.exitCode = 1;
  } else console.log("Wardrobe consistent: " + files.length + " .iki file(s), " + manifest.outfits.length + " manifest entry/entries.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
