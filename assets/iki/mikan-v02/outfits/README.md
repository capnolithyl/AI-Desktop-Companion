# Mikan outfit library

This folder is the canonical home for **finished** `.iki` costume files. Each
completed costume can live in its own subfolder, alongside its art, extraction
scripts, previews, and README. The checked-in `wardrobe.json` lists the
`.iki` files recursively (with paths relative to this folder).

## Default outfit

- `default/mikan-auto-rig-v3.iki` is the **shipped Mikan v3** selected in
  Appearance as "Original · Mikan v3 (bundled)".
- `../iki-ready/mikan-auto-rig-v3.iki` is still kept as the **historical rig
  source** for existing outfit preparation, rebuild scripts, and comparisons.
  It is not a second selectable outfit. Both files share the same Git blob.
- Do not edit the shipped copy independently of the accepted source rig.

## Adding a finished outfit

1. Put the final `.iki` under `outfits/<costume-folder>/`. Source PNGs
   and other non-`.iki` files do not count as finished outfits.
2. Stage and commit as usual (`git add -A` then `git commit`, or your Git
   GUI). The tracked `.githooks/pre-commit` hook scans the **staged** .iki
   files, adds missing entries to `wardrobe.json` and stages that manifest
   **in the same commit**, preserving names, tags, favorites and existing IDs.
3. The manifest is the source of truth for shipped costumes. The desktop
   automatically lists all registered outfits and only loads a rig when used.
   Imported, local-only custom outfits are still cached in IndexedDB.
4. Installer CI runs `wardrobe:check` during the build, independently
   ensuring each checked-in .iki has a manifest entry and every entry names an
   existing file. `npm run test:wardrobe` tests the validator and staged
   auto-sync behavior.

**One-time hook installation:** Git doesn't activate tracked hooks on clone
for security reasons. `npm install` activates this repository's pre-commit
hook via the dependency-free `prepare` step, as does `npm run dev`.
Afterward ordinary commits sync automatically, without a separate command.
If you already have a custom `core.hooksPath`, installation prints a warning
instead of overwriting it. GitHub web edits and commits made without hooks
are not auto-fixed locally; their CI validation fails until synchronized.

You can still explicitly run `npm run wardrobe:sync` to update your *working
tree* without committing, or `npm run wardrobe:check` for an immediate audit.

The validator fails if a new .iki file is missing from `wardrobe.json`, if a
manifest entry points to a nonexistent file, or if IDs/paths are duplicated,
invalid, or escape this folder. `wardrobe:sync` **never silently removes**
missing entries. Restore the missing file or deliberately edit the manifest.
Keep draft/intermediate `.iki` files outside this finished-outfits tree,
otherwise they are correctly flagged as unregistered.

## What the desktop app does

The app uses the repository `wardrobe.json` and lazy asset URLs as the
catalogue of **shipped** costumes. Original Mikan is the default; every other
manifest entry appears automatically in the wardrobe selector and right-click
menu without a manual import. The rig JSON is fetched only upon selection,
not copied into IndexedDB. It works offline once installed.

Separately, the app preserves imported personal costumes in IndexedDB so
uploaded outfits survive if their source path moves or a drive disconnects.
Local imports appear alongside the shipped catalogue and can be removed without
deleting source files. Included outfits cannot be removed via the local-library
remove action. Previous imported copies are preserved for safety, even if a
similarly named outfit is now bundled.

The manifest validates real project files, **not** copies already imported in
IndexedDB. Seasonal/holiday/favorite defaults come from the manifest; the user
can override those metadata values locally without rewriting the Git file.
All five current finished outfits are now present and registered in GitHub.

No background file indexing, cloud sync, or automatic filesystem writes are
needed for the shipped avatar. All tools stay free and local.
