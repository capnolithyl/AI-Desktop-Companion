# Mikan v02 / Plan D review comparison

Open `comparison-sheet.png` for the original front-view reference and corrected-eye head scales of 90%, 94%, and 100%. Open `eye-comparison.png` for reference / previous Plan D / corrected Plan D close-ups.

All files in this directory are disposable review derivatives. No winner is selected and no rig is created. Remove this directory to discard the experiment. Existing source hashes are recorded and checked in `verification.json`.

## Reproduce

Run `python mikan-v02/plan-d-eyes/comparison/build-comparison.py` from the assets/iki directory. Requires Pillow. Outputs stay in this directory; the script reads existing assets from elsewhere in Mikan v02.

## Geometry and artwork

- Original complete-eye outline and placement retained: 132 px trimmed artwork width at 100% head scale.
- Irises move 12.5 canvas pixels inward on each side, before head scaling.
- Separate existing Plan D iris artwork is narrowed to 80% of the previous iris width, preserving its 514 source-pixel height (approximately 53 canvas pixels). Amber texture and highlights come from the existing iris asset.
- A local mesh narrows and vertically elongates the pupil; a translucent dark brown ring sits inside the iris edge.
- Irises are clipped beneath the existing eyelids. A 32 source-pixel upward offset (3.3 canvas pixels) increases upper-lid coverage. Existing sclera colors fill the exposed former iris footprint; this is a deterministic composite, not generative inpainting.
- The same affine transform applies to back hair, both ears, face (including its painted features), corrected eyes, mouth and front hair. The shared pivot is (550, 620), at the face/neck overlap.
- The body layer is composited at its exact original size and position in every variation. The complete hair layers scale with the head, including their lower lengths. Body coverage therefore changes where scaled hair overlaps it, while the underlying body artwork remains identical.
- The original reference is displayed without content edits. Full character variants have identical display scale; facial crops use a fixed crop and scale across the three variants.

The PNGs are visual review proposals, not production layer replacements. The corrected eye layer is supplied separately for inspection.
