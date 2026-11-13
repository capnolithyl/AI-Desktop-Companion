# Engine validation

`validation.json` consolidates structural, rendering, motion and final source-integrity checks. `structural-validation.json` proves that only `/name` and `/textures/1/source` differ from v3. Source and output hashes bind these checks to the delivered files.

## Review images

- `neutral-comparison.png`: original versus Gothic blouse.
- `pose-comparison.png`: matched head/body and stress poses.
- `underarm-closeups.png`, `garment-closeups.png`: enlarged underarms, neckline/lace/bow, ribbons, cuffs, ruffles and shorts overlap.
- `mouth-expression-tests.png`, `eye-tracking-tests.png`: blink, mouth opening, expressions and gaze.
- `desktop-size-comparison.png`: 514 x 472 portrait viewport, derived from default application sizing; actual user DPI/resizing may differ.
- `physics-preview.webp`: 144 actual engine frames over 12 seconds, captured at 12 fps with physics stepping at 60 Hz.
- `physics-comparison.png`: matched v3/Gothic samples over time. The first six seconds use ambient motion/breath; the remaining sequence adds head/body movement.
- `extraction-review.png`: isolated garment on a contrasting backdrop.

`original/` and `gothic-blouse/` contain 560-pixel MCP pose renders. `detail-*` contain 1280-pixel captures and `desktop-*` contain desktop-view captures. `motion-voriginal/` and `motion-vgothic-blouse/` retain the complete frame sequences. These are actual installed Iki WebGL engine outputs, not manually animated composites.

## Findings

25 matched poses loaded without failed textures. The MCP audit reports 646 checked fold poses, no fold offenders and no physics offenders; original and variant reports match. All 25 rendered silhouettes and checked upper-face regions match. Motion traces match across all 144 frames. Visual review found no blocking defect. Mild underarm/cuff reconstruction softness is acceptable at desktop size; enlarged views show the compromise. Existing v3 cutout edges and extreme facial behavior persist. Ruffles are compressed and lace backed to preserve geometry/alpha; neither has independent physics.

The live desktop application's custom selector was not exercised and its settings were not modified. The file uses the same self-contained format and unchanged rig structure as v3; live selection is the remaining acceptance step.

## Reproduction and evidence scope

`poses.json` defines the 25 explicit poses. The Iki MCP `render_poses` tool produced `render-original.json` and `render-gothic-blouse.json`, standard pose frames, fold and physics audits using the two corresponding model files. Audit geometry was unchanged by the final texture cleanup. Final standard frames were rerendered after cleanup.

`render_detail.mjs` loads each model into the installed engine and captures full-resolution and desktop views. `render_motion.mjs` runs its actual motion/physics clock. `make_review.py` assembles comparisons and animation and performs matched-image checks. Run these in the order documented in the parent README, after the MCP stage when rebuilding all evidence from scratch. The scripts use local Chrome and an installed Iki renderer bundle; environment overrides are supported. Temporary Chrome profile cleanup encountered a Windows file-lock warning after successful captures; that warning did not indicate a render failure.

Visual assessment is based on the review sheets and sampled motion frames, not a live desktop playback session. The automated frame/parameter checks cover the entire captured sequence.
