# Mikan Gothic Blouse v1

Select `mikan-gothic-blouse-v1.iki` through Mikan's existing custom outfit picker. This is a self-contained costume derived from the working v3 rig. The application default and settings have not been changed. Engine loading and animation were tested; selecting it in the live desktop application remains a user acceptance step.

## Artwork and preservation

`source.png` is the unchanged outfit reference. `prepare_outfit.py` isolates dark garment pixels inside measured boundaries, excludes background, skin and orange hair, and applies a landmark-based piecewise affine warp to the existing body. Missing cloth near seams is extended from nearby garment pixels with localized smoothing. No new character artwork was generated.

The wide neckline, chest lace, center bow, both upper-arm ribbon accents, gathered sleeves and two lower ruffle tiers are retained. The original skin, choker, underlying lace, shorts and all non-clothing body pixels are preserved. The full 1280 x 1280 alpha silhouette is unchanged. Reconstruction covers 13,164 of 342,883 garment pixels (3.84%).

`build_rig.py` crops the body at `(164,416,1063,1280)` and replaces embedded texture 1 (899 x 864). Only the model name and that texture's encoded source differ from v3. All other textures, mesh vertices, triangles, UVs, transforms, drawing order, deformers, expressions, parameters, keyforms, motions and physics remain identical. The rig has 16 parts and six embedded textures. The old prepared body layer is not used as the final texture because it predates tail separation.

## Files

- `mikan-gothic-blouse-v1.iki`: selectable model.
- `source.png`, `blouse-extracted.png`, `blouse-aligned.png`: reference and isolated/aligned garment.
- `body-original-v3.png`, `body-gothic-blouse.png`: authoritative original and replacement full-canvas bodies.
- `source-blouse-mask.png`, `target-blouse-mask.png`, `reconstructed-regions.png`: extraction, replacement and reconstruction masks.
- `comparison.png`, `overlay-comparison.png`, `preview-*.png`: static registration reviews, not animation evidence.
- `prepare_outfit.py`, `build_rig.py`, `finalize_validation.py`: reproducible preparation, packaging and final verification.
- `validation.json`: artwork checks; its `rig_written: false` records the preparation stage only.
- `protected-input-hashes.json`: pre-work hashes for protected source/v3/previous-outfit files.
- `rig-validation/`: actual engine renders, animated preview, capture scripts, detailed reports and review sheets. See its README.

## Results and limitations

Actual Iki WebGL rendering passed 25 matched poses per version, including head/body tilts, opposed tilts, blink, gaze directions, mouth opening, expressions, breath and tail extremes. The fold audit checked 646 poses without reported offenders. A 12-second, 144-frame preview uses the actual Iki motion/physics clock. All matched render silhouettes and checked upper-face regions remain identical; motion parameter traces match v3. No failed textures or blocking defects were observed.

Visual inspection covered neutral, pose, facial, garment and desktop-size sheets plus sampled physics frames. No obvious new cream remnants, white contamination or disconnected seams were seen at the tested desktop size. Underarm cutouts and hair visible through those areas are inherited from v3. Small softened fabric extensions near inner underarms/cuffs are acceptable at desktop scale but visible enlarged.

The fixed silhouette requires compromises: hem ruffles are vertically compressed above the original shorts; cuffs and loose ribbon ends are contained by the original body boundary/canvas. Lace holes are backed with dark cloth in the final texture to preserve alpha, so lace is decorative texture rather than new transparent geometry. Bows and ruffles follow the existing body deformation without independent physics. Fine lace contrast is softer than the source. These are documented garment compromises, not changes to Mikan's proportions. Extreme facial limitations remain those of v3.

## Reproduction

From `assets/iki`, with Python, Pillow, NumPy and SciPy available (scripts also use `.tools/psd-export`):

```powershell
python mikan-v02/outfits/gothic-blouse-v1/prepare_outfit.py
python mikan-v02/outfits/gothic-blouse-v1/build_rig.py
node mikan-v02/outfits/gothic-blouse-v1/rig-validation/render_detail.mjs
node mikan-v02/outfits/gothic-blouse-v1/rig-validation/render_motion.mjs
python mikan-v02/outfits/gothic-blouse-v1/rig-validation/make_review.py
python mikan-v02/outfits/gothic-blouse-v1/finalize_validation.py
```

Capture scripts require installed Chrome and the Iki MCP renderer bundle; override `CHROME_PATH` and `IKI_RENDER_BUNDLE` when necessary. The separate MCP fold audit and standard pose renders are retained as evidence; see the validation README before reproducing that stage. No app code, settings, Git commits, branches or previous outfits are changed by this workflow.
