# Mikan Månegarm band shirt v1

`mikan-band-shirt-manegarm-v1.iki` is the completed self-contained costume. It reuses the existing black-shirt model and changes only its model name and embedded body texture. No garment decomposition, character regeneration or auto-rigging was performed.

## Artwork method

The folder contained only `source.png`, with no independent original band-logo reference. `build_outfit.py` extracts the distressed silver-white print from source rectangle `(360,850,750,1080)`. A luminance coverage mask excludes the dark source fabric while preserving ink edges and distressed holes. It does not transfer the source character or garment.

The print is uniformly scaled to 86%, placed at canvas `(485,812)`, centered on the existing torso below the folded neckline, and given a gentle curvature of up to three pixels over its width. Original letter proportions and orientation are retained. Modest brightness modulation follows the existing black fabric shading. This reproduces the logo as depicted in the supplied generated illustration; without an independent original logo, fidelity to an official master cannot be established.

The authoritative body is decoded directly from `black-shirt-v1/mikan-black-shirt-v1.iki`, texture index 1, and verified against its prepared body PNG. The 899 x 864 embedded texture occupies canvas rectangle `(164,416,1063,1280)`. Only 11,697 body pixels change. All pixels outside the print and the entire original alpha silhouette remain identical. Neckline, sleeves, waist, fabric, skin, choker, lace and shorts are unchanged.

All other embedded textures, parts, vertices, triangles, UVs, transforms, draw order, deformers, parameters, expressions, motions and physics are identical to the black-shirt baseline. Cursor/drag behavior remains host-controlled and receives the same rig parameters as before.

## Validation and review

- Actual installed Iki WebGL engine: 25 poses per version at full resolution and desktop framing, covering neutral, head/body turns and tilts, combined/opposed poses, blink, eye tracking, mouth half/full, smile/surprise, breath and tail extremes.
- No failed textures; no unintended folds across 624 engine audit poses; all four hair/tail springs report healthy.
- 12 seconds of actual motion/physics at 60 Hz, captured as 144 frames per version. Parameter traces match the black shirt exactly. The preview is engine output, not manually animated artwork.
- All 25 render silhouettes and checked upper-face regions are pixel-identical. Source, v3 and all captured previous-outfit files (1,389 files total) remain hash-identical.
- Visually inspected neutral, enlarged logo under tilts, and sampled physics comparisons. The print remains attached and coherent, with no rectangular source-fabric patch or new gap observed. Fine distressed marks become less distinct at small desktop size; ordinary perspective deformation is inherited from the body mesh. Existing black-shirt underarm hair/cutout artifacts remain unchanged.

### Application import limitation

The file passes engine parsing/loading and the inspected selector's extension/size requirements. **Live wardrobe import is not confirmed.** This checkout lacks installed app dependencies and a built app, so isolated browser testing could not start. The running installed app (v0.8.42) exposes a newer wardrobe with Add outfit, preview and Cancel preview. Its current Gothic blouse selection was observed. Computer-use access was denied before the new file could be imported, so no outfit, favorites, default, or settings were changed. The settings panel may remain open.

Remaining manual check: use **Settings > Character > Add outfit (.iki)**, choose this file, and inspect the preview. Use Cancel preview to keep the current costume; choose Wear only when desired. No code or configuration change is required. Live speech, cursor and drag reactions were not separately exercised in the application; their rig data is preserved and the underlying facial/head/body/physics behaviors were engine-tested.

## File index

- `source.png`: untouched supplied illustration.
- `logo-extracted.png`: isolated source print, transparent background.
- `logo-aligned.png`, `print-mask.png`: full-canvas print and coverage.
- `body-manegarm.png`: final 1280 x 1280 RGBA body.
- `body-original-black-shirt.png`: baseline decoded body.
- `mikan-band-shirt-manegarm-v1.iki`: final embedded-texture model.
- `logo-comparison.png`: enlarged body-only before/after.
- `build_outfit.py`: reproducible preparation and packaging.
- `validation.json`, `protected-input-hashes.json`: build evidence and protected source hashes.
- `rig-validation/neutral-comparison.png`, `pose-comparison.png`, `logo-motion-closeups.png`, `facial-tests.png`, `desktop-size-comparison.png`: actual engine comparison sheets.
- `rig-validation/physics-preview.webp`, `physics-comparison.png`: animated preview and sampled before/after frames.
- `rig-validation/validation.json`, `engine-audit.json`, `detail-validation.json`, `motion-validation.json`: detailed test evidence.
- `rig-validation/render_detail.mjs`, `render_motion.mjs`, `make_review.py`, `poses.json`: repeatable engine capture/review workflow. Individual rendered frames are retained in adjacent directories.

## Reproduction

From `assets/iki`, with Python/Pillow/NumPy/SciPy (local `.tools/psd-export` supported), Node, Chrome and the installed Iki MCP render bundle:

```powershell
python mikan-v02/outfits/band-shirt-manegarm-v1/build_outfit.py
node mikan-v02/outfits/band-shirt-manegarm-v1/rig-validation/render_detail.mjs
node mikan-v02/outfits/band-shirt-manegarm-v1/rig-validation/render_motion.mjs
python mikan-v02/outfits/band-shirt-manegarm-v1/rig-validation/make_review.py
```

Set `CHROME_PATH` and `IKI_RENDER_BUNDLE` if the installed paths differ. The saved `engine-audit.json` was produced separately by Iki MCP `render_poses` on the final file with rest and combined Z tilts (+/-30 head, +/-10 body). To refresh it, run that tool into the existing `rig-validation/audit/` folder and save its structured result. Capture runs completed despite Windows temporary-profile cleanup warnings (`EBUSY`); the rendered data and reports were written successfully.

All outputs are confined to this outfit directory. Existing outfits and source files were not edited; no application code changes, branches, commits, pull requests or pushes were made.
