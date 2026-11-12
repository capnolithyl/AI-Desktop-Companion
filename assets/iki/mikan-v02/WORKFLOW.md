# Mikan 2D art → Iki v3: reproducible workflow

**Purpose:** preserve the successful November 2026 path from a single front-view Mikan illustration to the animated 2D Iki v3 rig. This is the reference for rebuilding the character or making future outfits. The repository files and their READMEs are authoritative for exact script behavior and validation results.

**Accepted baseline:** `iki-ready/mikan-auto-rig-v3.iki`, not the older experiments or v1/v2. V3 is an editable, reusable reference, and the desktop app uses this rig by default.

## 0. Choose and protect the reference

- Main full-body/front-view reference: `reference/ref-03-frontview.png` (1280×1280). Also retain `ref-01-portrait.png` and `ref-02-tpose.png` as style/proportion references. Keep the orange wavy hair, striped ears and tail, amber eyes, X hairpins, paw choker and cream sweater consistent.
- Preserve the original PNG and keep intermediate files. Mikan's recognizability matters more than simply generating perfectly separable, but different-looking, features.
- We tried separate part-generation approaches for eyes, hair and face (Plans A/B/C/D); these drifted from the intended face. **The successful route was decomposition of the already-approved complete illustration**, followed by limited manual repairs.

## 1. Decompose the approved illustration into a layered PSD

1. On Windows 11, set up **Ubuntu through WSL2** and run the open-source **See-through** image decomposition model on the PC's AMD Radeon RX 9070 (ROCm path). This was a compute-heavy pass: approximately **67 minutes**, producing about **51 initial layers** from the front-view reference. Actual environment/setup commands from the original See-through run are *not* recorded here; do not fabricate a one-line installer command. Verify the project's current upstream and ROCm requirements before repeating.
2. Open the resulting layered PSD in **Krita**. Inspect the composite *and individual layers* against the original front-view; model output can have cutouts, missing artwork, transparent holes and erroneous garment fragments.
3. Repair the **cat ears** and as much of the **tail** as possible from the original reference. Remove the spurious `handwear` layer that created grey patches, while retaining useful original garment/headwear layers. Avoid damaging face/eyes/hair.
4. Save the cleaned, visually approved source PSD as **`mikan-v02/mikan-cleaned.psd`** (the immutable input for our role extraction). Keep the original decomposed PSD/backup where available.

The result was *not* a perfectly animation-ready PSD. In particular, the tail was incomplete behind the hair and the drawing supplied only a closed mouth. We fixed those later **in the rig**, rather than rerunning all decomposition.

## 2. Map the cleaned PSD into Iki roles

Folder: `iki-ready/`. See `iki-ready/README.md`, `prepare.py`, `inspect_psd.py`, `manifest.json`.

- Export original PSD layers separately (`source-layers/`). Use the `psd-tools`/Pillow/Numpy helpers under `assets/iki/.tools/psd-export` with `prepare.py` (run from an environment that has those dependencies).
- Consolidate source artwork into 14 **transparent, full-canvas 1280×1280** RGBA role PNGs in `iki-ready/layers/`, preserving **unmirrored** original pixels:
  - `cat_ears.png` + `back hair Merged` → `hair_back`
  - `bottomwear Merged` + `topwear Merged` + `neckwear Merged` + original tail → `body`
  - `face Merged` → `face`; `nose Merged` → `nose`; `mouth Merged` → `mouth`
  - `eyebrow Merged` → `brow_R`, `brow_L`
  - `eyewhite Merged` → `eye_R`, `eye_L`
  - `eyelash Merged` → `lash_R`, `lash_L`
  - `irides Merged` → `iris_R`, `iris_L`
  - `front hair Merged` + `headwear Merged` → `hair_front`
- Split each left/right source only through a **fully transparent gap around x=660**. `_R` is the character's right / viewer-left; `_L` is viewer-right. Do **not mirror**.
- Preserve the independent original tail as `iki-ready/preserved/tail.png`, but do **not render it twice**: the v1 role mapping includes it in `body`.
- Generate `comparison.png`, `face-comparison.png`, `difference-x16.png`, `recomposed-preview.png` and the `manifest.json` with source hash, role stack, bounds and pixel-diff statistics. Critically, compare on dark and light backgrounds, and visually inspect the face. The original PSD's embedded composite was **not exactly pixel-identical** to recomposed source layers, likely from prior composition/ICC behavior; do not claim otherwise.
- Treat ears as part of back hair and accessories as grouped with their adjacent body/hair layers. They're not independent animated ear/accessory meshes yet.

## 3. Package and verify the actual multi-layer PSD

Use `iki-ready/build_layered_psd.py` and `PSD-NOTES.md`.

- Package those 14 named RGBA PNGs into `iki-ready/mikan-iki-ready.psd`, using `psd-tools` `PSDImage` / `PixelLayer` with **one visible normal-blend full-opacity layer per Iki role**, all at offset (0,0), no masks and exactly 1280×1280.
- Preserve the manifest's exact bottom-to-top layer order, including merged-preview transparency.
- Reopen the PSD programmatically; verify every stored pixel layer matches the prepared PNG, hash inputs are unchanged and the recomposed pixels are equal. Review `psd-comparison.png` and `psd-validation.json`.
- **No ORA intermediary is needed**. This programmatically assembled PSD was meant for the Iki editor; a PSD being valid does not itself prove a rig will animate correctly.

## 4. Let Iki create the initial rig, then test it in the right tool

- Open the **Iki editor**: https://zeikar.dev/iki/editor/ and import the prepared layered PSD to auto-rig the character. Save/export `iki-ready/mikan-auto-rig-v1.iki` as a baseline.
- Load the exported **.iki** file in the **Iki playground**: https://zeikar.dev/iki/playground/ . The editor is for input/rig authoring, and the playground is for testing exported `.iki` models; don't try to use the playground's .iki import on the editor.
- Verify neutral render, eyes blinking and gaze tracking, brows, head angles roughly **±30°**, body tilts roughly **±10°**, and ambient hair physics. V1 successfully preserved her face and established the animated baseline.
- Identify failures by isolating expression/parameter tests, not by immediately regenerating all artwork. V1's tail was bound into `body` and its root separated at head tilts. The closed-mouth art only scaled/stretch when `ParamMouthOpenY` was changed, without genuinely opening.

## 5. Patch **v2** selectively (tail + mouth), without rebuilding the face

See `iki-ready/rig-v2/README.md` and `rig-v2/build_v2.py`. Run from the `assets/iki/` workspace:
```sh
python mikan-v02/iki-ready/rig-v2/build_v2.py
```

- Work from **v1 .iki JSON**, preserving every unrelated mesh/parameter/expression/animation and original textures.
- Extract tail pixels out of the atlas/body using `preserved/tail.png` as an alpha guide. Produce `rig-v2/assets/body-clean.png` and `tail-separated.png`, checking that recomposition restores original body pixels.
- Give the tail its own mesh plus `ParamTailSway`, a damped spring and a root-underlap fur patch to conceal a gap behind the torso/hair.
- Keep original closed mouth at zero; derive a **mouth-open image** using existing `mikan-v01` `mouth_inner`, `mouth_teeth`, and `mouth_tongue` parts. Crossfade to it with `Mouth Open` and preserve existing mouth/head tracking and `Mouth Form` controls. This is a **two-image crossfade**, not phoneme-specific visemes.
- Output `mikan-auto-rig-v2.iki`, validate with the real Iki renderer, compare baseline/updated poses, mouth progressions and physics. The v2 README documents **634 checked poses** and its remaining imperfect root coverage.
- Important result: mouth movement was now usable, but the v2 tail **still disconnected at extreme head/body tilts** because its source art had actual cutouts/incomplete hidden root.

## 6. Patch **v3** with one new, continuous tail asset

See `iki-ready/rig-v3/README.md`, `rig-v3/generation-prompt.txt`, `rig-v3/build_v3.py`.

- Generate **only the tail** from Mikan's established full-character and tail reference. Required: cohesive orange/cream tabby stripes, fluffy rounded tip, complete continuous shaft and a **long hidden root**. Select a promising generated tail with sufficient lower-right overlap, even if its isolated silhouette is different from the old incomplete one.
- The **actual generated PNG and exact text prompt** are preserved as `rig-v3/assets/tail-generated.png` and `generation-prompt.txt`. This generation used the built-in image tool, not a CLI fallback.
- `build_v3.py` cleans detached alpha specks using a connected component, resizes the main sprite, and places it on a **1280×1280 transparent canvas**, sprite bounds **(160,450) to (540,1035)**; art root near **(490,990)**, hidden inside the lower torso.
- Replace v2's `tail` and `tail_root_underlap` active meshes with **one separate tail mesh behind the hair and body**, not a second visible root patch.
- Add a local `tailRoot` matrix deformer parented to `bodyWarp`. Pin the lower root below **y=900**, apply a smooth sway gradient toward the tip, and damp the spring. This prevents shearing from stretching the entire tail through the broad body warp.
- Preserve **all 15 non-tail parts** from v2, including the mouth pair, as identical JSON objects; preserve existing expressions, head/eye/brow/hair controls, and other physics. The finished rig has **16 active parts**.
- The `build_v3.py` script outputs **`iki-ready/mikan-auto-rig-v3.iki`** and `rig-v3/build-validation.json`. V1/v2 remain immutable.
- Validate head ±30° and body ±10° combinations, opposing tilts, blink, expression, mouth extremes and tail sway in Iki's renderer/playground. The v3 report records **636 fold-checked poses**, **15 requested renders**, and **144 live frames per version** for actual engine physics. Review `rig-v3/motion-comparison.webp` and pose/contact sheets. V3's improved tail stayed connected over the tested range.

## 7. Integrate v3 into the desktop companion, without destroying the art

- The Windows Tauri/React desktop app now imports the **bundled v3 .iki** through `src/IkiAvatar.tsx` via `@ikijs/engine` and `@ikijs/format`, rendering WebGL2 inside the transparent overlay.
- **Crop the viewer, not the source rig:** keep entire artwork, show the head/ears/tail and sweater to about mid-torso; hiding the lower body in the viewport does not remove the vertices or textures.
- Advance `IkiMotion` each frame (idle, blink, physics). Talk animation follows the app's TTS `playing` signal with a lightweight mouth-open envelope; it is not yet phoneme- or waveform-driven.
- Settings → Appearance supports importing replacement `.iki` files stored on this PC, restoring bundled v3 and falling back to a static portrait.
- Later upgrades added deterministic short reactions and `Animation diagnostics` to inspect actual expression/motion events and breath/mouth/FPS. Mikan 2D v3 is the **accepted stable character**, even though extreme-angle hair can deform slightly and her eyelashes look softer than in the reference.
- Relevant implementation: `src/IkiAvatar.tsx`, `src/avatar-reactions.ts`, `src/avatar-debug.ts`, `src/iki-avatar-storage.ts`. Original integration: GitHub PR #63; reactions #64; diagnostics #65.

## For future costumes: two valid routes

**Localized layer replacements (prefer for ordinary outfit changes):** preserve the existing eyes, face, hair, ears, head mesh and tail, and replace the relevant clothing/body/arms/accessory art while keeping the original registration/canvas, overlap and rig deformation behavior. Validate seams and occlusion under head/body movement; topwear includes arms and most pieces are not independently rigged, so a torso swap is **not guaranteed** to be trivial.

**New full illustration + See-through (prefer for substantially different silhouettes):** regenerate an approved full-body image in the same front-view pose, rerun the See-through → Krita cleanup → role PNGs → layered PSD → Iki editor → playground flow, using v2/v3's mouth/tail fixes only where applicable. Full-image regeneration risks face/personality drift. Never blindly apply v3's tail mesh coordinates to an image whose geometry has shifted.

## Lessons / guardrails

- **Do not skip visual comparison** against the reference. Broken eye/lash separations or over-smoothed face change the character even when the PSD technically imports.
- **Don't assume unseen art exists:** drawing a cropped/occluded tail cannot supply a continuous tail behind moving hair. Inpainting/generation or reconstructing hidden art is necessary when deformation reveals it.
- Preserve source and baseline versions; patch targeted layers/meshes and hash-check unchanged parts. V2/v3 scripts are reproducible *targeted rig modifications*, not complete replacement auto-riggers.
- Treat Iki .iki as a self-contained JSON rig with embedded textures; no network dependency for character textures at runtime.
- For desktop viewport changes, change only view/framing settings; do not crop original layer PNGs or remove lower meshes.
- **See-through environment setup, version/checkout and exact shell commands were not retained** in the repository notes. Recover/verify them when rerunning rather than inventing syntax.
- GitHub is the artifact/source-of-truth archive; Trello tracks implementation decisions. Retain this document and each stage's README as the dependable long-term reference.
