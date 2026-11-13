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

1. Put its final `.iki` into `outfits/<costume-folder>/`. Source PNGs and
   other non-`.iki` files do not count as finished outfits.
2. Run `npm run wardrobe:sync` from the repository root. It adds each missing
   `.iki` file to `wardrobe.json`, guesses season/holiday tags from the
   filename, and **preserves** existing names, tags, favorites, and IDs.
3. Review/edit the metadata in `wardrobe.json`, then run
   `npm run wardrobe:check` and `npm run test:wardrobe`.
4. Commit both the `.iki` file and its manifest entry together. CI checks
   wardrobe consistency during `npm run build` and `npm run build:mobile`.

The validator fails if a new .iki file is missing from `wardrobe.json`, if a
manifest entry points to a nonexistent file, or if IDs/paths are duplicated,
invalid, or escape this folder. `wardrobe:sync` **never silently removes**
missing entries. Restore the missing file or deliberately edit the manifest.
Keep draft/intermediate `.iki` files outside this finished-outfits tree,
otherwise they are correctly flagged as unregistered.

## What the desktop app does

The app already maintains an **independent IndexedDB cache** of outfits that
you explicitly import from disk via Appearance. It still supports importing
costumes that have not been checked into GitHub. That cache intentionally keeps
working if you move or disconnect the original file, so it cannot truthfully
be validated against a disk path afterward.

The repository `wardrobe.json` therefore validates **real on-disk project
assets**, not the app's local IndexedDB copies. Its entries provide initial
season, holiday, and favorite metadata for costumes compiled into the app;
per-user changes in Appearance stay local and do not rewrite Git-managed
metadata. Costume files currently present only on your PC (e.g. black shirt,
gothic blouse, Månegarm) are not automatically on GitHub: run
`npm run wardrobe:sync` in the local checkout after you finish each costume,
then commit its final `.iki` with the manifest if you want CI coverage.

No background file indexing, cloud sync, or automatic filesystem writes are
needed for the shipped avatar. All tools stay free and local.
