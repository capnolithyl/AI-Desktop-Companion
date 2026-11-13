/**
 * Automatically register exactly the .iki files staged for this commit.
 * Untracked WIP rigs must not sneak into wardrobe.json. The installer
 * validates the final checked-in manifest independently.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncWardrobe, checkWardrobe, readWardrobeFile, MANIFEST_PATH } from "./wardrobe-manifest.mjs";

const base = "assets/iki/mikan-v02/outfits/";

export function stagedIkiPaths(cwd = process.cwd()) {
  const paths = execFileSync("git", ["ls-files", "--cached", "-z", "--", base], { cwd, encoding: "utf8" });
  return paths.split("\0").filter(path => path.startsWith(base) && /\.iki$/i.test(path))
    .map(path => path.slice(base.length));
}

function run() {
  try {
    const files = stagedIkiPaths();
    const current = readWardrobeFile();
    const { manifest, additions } = syncWardrobe(current, files);
    const errors = checkWardrobe(manifest, files);
    if (errors.length) throw new Error(errors.join("\n"));
    if (additions.length) {
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
      console.log("Wardrobe: automatically registered " + additions.length + " staged .iki outfit(s).");
    }
    // Include any edited metadata in the same commit as the newly added rigs.
    execFileSync("git", ["add", "--", MANIFEST_PATH], { stdio: "inherit" });
    console.log("Wardrobe: " + files.length + " staged outfit(s), manifest validated.");
  } catch (error) {
    console.error("Wardrobe pre-commit check failed: " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
