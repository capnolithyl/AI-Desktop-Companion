/**
 * Git does not enable tracked hooks on clone. npm install (prepare) registers
 * our dependency-free hook on the owner's local checkout once.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
if (!process.env.CI) {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (realpathSync(root) === realpathSync(resolve("."))) {
      const existing = execFileSync("git", ["config", "--local", "--get", "core.hooksPath"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (existing && existing !== ".githooks") {
        console.warn("Wardrobe hook not installed: existing core.hooksPath is " + existing);
      } else {
        execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"]);
        console.log("Mikan: automatic wardrobe pre-commit sync enabled.");
      }
    }
  } catch {
    // No Git checkout or no core.hooksPath yet: try once more without the --get.
    try {
      const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (realpathSync(root) === realpathSync(resolve("."))) {
        execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"]);
        console.log("Mikan: automatic wardrobe pre-commit sync enabled.");
      }
    } catch { /* npm packaging / a checkout without git should still work */ }
  }
}
