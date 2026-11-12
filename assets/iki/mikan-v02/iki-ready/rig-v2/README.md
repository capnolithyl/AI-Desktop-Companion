# Mikan auto-rig v2: targeted tail and mouth repair

Load `../mikan-auto-rig-v2.iki`. Textures are embedded; no external PNG paths are needed at runtime. The committed `../mikan-auto-rig-v1.iki` remains unchanged. This is a direct patch of that rig, not a fresh auto-rig.

## What was wrong

- V1 had 14 parts. Tail artwork was packed into `body`, with no independent mesh, parameter or physics. Its visible root ended outside the sweater and relied on moving hair to cover the end.
- `ParamMouthOpenY` only scaled and translated a closed-mouth texture. No cavity, teeth, tongue or open-mouth alternative was in v1, so moving the control stretched a closed smile.

## Changes

- Split the existing body's atlas pixels using the preserved tail alpha as a guide. Created `body-clean.png` and `tail-separated.png`. The preserved clothing layers confirm zero overlap between the isolated tail and garment pixels: no garment inpainting was needed. Recombining the two texture crops gives the exact original body atlas pixels.
- Added independent `tail` mesh using the original body mesh and `bodyWarp` parent, preserving the neutral position and body follow. `ParamTailSway` ranges from -1 to 1. Vertex displacement tapers smoothly to zero below canvas y=835; maximum local sway is 28 px sideways and 5 px vertically at the free tip.
- Added a damped `tailSway` spring driven by body turn/tilt, head turn and ambient sway. Original hair physics is untouched.
- Added `tail_root_underlap` behind hair and body. Its texture is a rotated, tapered copy of existing lower-tail pixels, bridging the exposed root toward the garment. It rides the body without independent sway. This adds a small amount of visible fur where hair previously revealed empty space; it is not newly generated artwork.
- Kept the original closed mouth at `Mouth Open=0`. Added `mouth_open`, deriving an alternative from the original mouth patch and existing v01 `mouth_inner`, `mouth_teeth` and `mouth_tongue` artwork. The control crossfades the two drawings and adjusts the open drawing's height. Both retain the existing mouth/head tracking and `Mouth Form` warp.
- V2 has 17 parts, 5 embedded textures, 22 parameters and 4 physics springs. All 8 original deformers, 12 unrelated parts, original parameters, original hair physics, expressions, motions and original atlas are unchanged as JSON data. Only body texture/UV references and mouth-open bindings were changed on existing parts.

## Verification

- Source SHA-256 checks passed for v1 and all used PNGs. No source assets were modified.
- Iki's real-engine `render_poses` successfully loaded the final rig with zero failed textures.
- No unintended folds across 634 checked poses. Intentional eyelid closures are reported separately as expected.
- Physics reports all four springs `ok`. Tail step response moves 18.1 model px and settles; idle movement is 13.5 model px. Existing hair physics measurements are unchanged.
- Visually inspected neutral, both turns, tail extremes, combined head/body extremes, blink, and five mouth-open levels. Mouth Form smile/frown is visibly effective.
- Neutral v1/v2 rendering differs at 2,239 of 313,600 pixels (0.714%), confined to the lower tail/body area, including texture-sampling differences. The head/face is unchanged at rest. This is close visual preservation, not a claim of full-frame pixel identity.
- `before-after.png` shows neutral and the extreme left combination. The extreme baseline and v2 both request mouth opening; only v2 visibly opens. V2 also requests tail sway.
- `mouth-progression.png` shows open values 0, .25, .5, .75 and 1. `review-sheet.jpg` covers the broader poses.
- Detailed evidence: `build-validation.json`, `render-validation.json`, `render-comparison.json`, and the `baseline/` and `previews/` images.

## Remaining limitations

- The mouth is a closed/open texture crossfade, not articulated lips or visemes. Intermediate values can look softer. The reused v01 cavity is a stylistic approximation, and its low source resolution remains visible when enlarged.
- Tail-root coverage is a practical overlapping-fur patch, not newly painted hidden anatomy. It substantially improves the tested extreme connection, but arbitrary stronger poses or third-party rig edits could still expose overlap seams. Original loose edge pixels and hair cutouts were not broadly retouched.
- Tail physics requires the host to advance the Iki physics loop. Continuous idle sway also needs `ParamAmbientSway` to be driven; body/head changes still excite the spring without it. No desktop application code or selected default avatar was changed.
- Validation used the installed Iki engine through its renderer; the user's live desktop app has not been exercised with this file.

## Files added

- `../mikan-auto-rig-v2.iki`: self-contained improved rig.
- `assets/body-clean.png`: full-canvas body without the animated tail region.
- `assets/tail-separated.png`: full-canvas tail split from the committed atlas.
- `assets/tail-root-underlap.png`: full-canvas root overlap derived from existing fur.
- `assets/mouth-open-derived.png`: full-canvas open-mouth drawing using existing artwork.
- `build_v2.py`: reproducible targeted patch and source/regression checks. Run from the assets/iki workspace with `python mikan-v02/iki-ready/rig-v2/build_v2.py`; it overwrites only the derived v2 output and its supporting assets/evidence.
- `build-validation.json`, `render-validation.json`, `render-comparison.json`: verification records.
- `before-after.png`, `mouth-progression.png`, `review-sheet.jpg`: review summaries.
- `baseline/*.png`, `previews/*.png`: original/final engine renders.
- `asset-review.png`, `body-atlas-inspect.png`, `mouth_inner-inspect.png`, `mouth_teeth-inspect.png`, `mouth_tongue-inspect.png`: inspection images.
- `README.md` and `file-inventory.json`: this report and the exhaustive file list with hashes.

No existing tracked files were modified. No commit was created.
