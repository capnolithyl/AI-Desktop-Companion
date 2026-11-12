# Mikan v3 — continuous standalone tail

Load **`../mikan-auto-rig-v3.iki`**. Its textures are embedded. V1, v2 and all v2 supporting files remain unchanged; the desktop application's selected avatar was not changed.

## What changed

V2's extracted tail contained hair-shaped cutouts and an incomplete root, supplemented by a separate fur patch. V3 removes both of those active parts and replaces them with one continuous, independent `tail` mesh, drawn behind hair and body. The existing cleaned body is retained unchanged.

The new tail was generated with the built-in image-generation tool, using Mikan's assembled artwork and old tail as style references. It has orange/cream bands, a rounded fluffy tip and a long unbroken lower-right root. Detached generation specks were removed, then the sprite was placed on a transparent **1280 × 1280** canvas. The main sprite occupies `(160,450)` through `(540,1035)`. The original generated PNG and exact prompt are retained.

The root attaches at canvas `(490,990)`, inside the lower torso. A new `tailRoot` matrix deformer follows the existing body warp locally, avoiding the stretching that came from deforming the entire tail across the body's grid. The lower tail is pinned below y=900; movement increases smoothly toward the tip. Long hidden overlap supplies coverage without v2's extra root patch.

The replacement spring is restrained and more damped. Its physics check measures **5.7 px idle displacement**, compared with **13.5 px in v2**, and **8.7 px step response**, compared with **18.1 px in v2**. The tail is fuller and extends farther down behind the body, so its neutral silhouette intentionally differs slightly.

All 15 non-tail parts—including the closed/open mouth pair—are unchanged as JSON objects. Existing head/eye/brow/hair deformers, controls, expressions, motions, body texture and non-tail physics remain unchanged. V3 has 16 active parts and one additional root deformer. Unused v2 textures remain embedded to preserve existing texture indices.

## Validation

- Iki renderer: 15 requested static poses, including rest, head tilts ±30°, body tilts ±10°, combined/opposed tilts, all-angle stress poses, blink, mouth open and tail extremes.
- **No unintended folds across 636 checked poses; no failed textures.** Deliberate eyelid closures are reported separately.
- All four physics springs report `ok`.
- Live engine capture: **144 frames per version**, 12 seconds at 12 fps, with physics stepped at 60 Hz. First six seconds are ambient idle; the remaining six sweep combined head/body tilt. This is actual engine physics, not a manually animated tail slider.
- Visually inspected static pose sheets and sampled live frames. The tail remains connected, the root stays concealed by the torso/hair, and no disconnected root, cutout holes or hard root-patch edge was observed in these samples. Hair naturally occludes more of the tail on rightward tilts.
- Neutral/blink/mouth-open face crops are pixel-identical to v2. Source hashes confirm v1/v2 and all v2 supporting files were preserved.

## Review files

- `before-after.jpg`: v2/v3 neutral and left-tilt examples.
- `head-body-tilts.jpg`, `combined-tilts.jpg`, `stress-tilts.jpg`: both directions and opposing/extreme combinations.
- `neutral-blink-mouth.jpg`, `v3-pose-sheet.jpg`: general appearance and facial regression checks.
- **`motion-comparison.webp`**: animated v2/v3 idle and tilt comparison.
- `motion-comparison-sheet.jpg`, `motion-v2-sheet.png`, `motion-v3-sheet.png`: sampled physics frames.
- `renders-v2/`, `renders-v3/`: individual static renders; `motion-v2/`, `motion-v3/`: selected live frames.

## Assets and reproduction

- `assets/tail-generated.png`: untouched image-generator output.
- `assets/tail-clean-source.png`: isolated sprite with detached specks removed.
- `assets/tail.png`: final transparent 1280 × 1280 layer.
- `generation-prompt.txt`: exact built-in generation prompt; no CLI/API fallback was used.
- `build_v3.py`: derives the final sprite and patches a copy of v2, with source and non-tail regression assertions.
- `poses.json`: static render requests.
- `render_motion.mjs`: captures live physics using the installed Iki renderer and headless Chrome. `IKI_RENDER_BUNDLE` and `CHROME_PATH` can override this machine's defaults.
- `make_review.py`: produces comparison sheets/animation and keeps selected live frames. Run after `render_motion.mjs` when rebuilding the motion evidence.
- `build-validation.json`, `render-validation-v2.json`, `render-validation-v3.json`, `motion-validation.json`, `comparison-validation.json`: hashes, pose checks and measured physics evidence.
- `file-inventory.json`: exhaustive added-file list with hashes.

## Limitations

This remains a 2D sprite rig, without collision simulation or true depth. Generated fur and the fuller silhouette are a close style match rather than identical original art. The tested range is the model's existing parameter limits; arbitrary stronger custom poses are not covered. Idle sway requires the host to advance physics and drive `ParamAmbientSway`. V2's two-image mouth crossfade is retained with its existing limitations. Validation used Iki's real engine, not the live desktop companion application.
