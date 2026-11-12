# Mikan Christmas sweater candidate

Artwork preparation only; pending visual approval. No .iki files or app files were created or modified.

## Actual v3 texture and mesh

The authoritative body is embedded texture index 1 in `../../iki-ready/mikan-auto-rig-v3.iki`, 899 x 864 pixels. It occupies canvas rectangle (164,416)-(1063,1280), with right/bottom exclusive, on the 1280 x 1280 canvas. Its full-canvas decode matches `../../iki-ready/rig-v2/assets/body-clean.png`, not the older `layers/body.png` containing tail artwork.

The body part has 357 mesh vertices, 640 triangles, deformer `bodyWarp`, order 1, and transform (-26.5,-208). Its UV rectangle uses half-pixel inset coordinates: x=0.5/899, y=0.5/864, width=898/899, height=863/864. Thus the proposed full-canvas image can later be cropped to that exact rectangle to replace this one embedded texture, without changing vertices, UVs, deformers, or any other textures. The separate v3 tail remains unchanged.

## Method

Read `../../WORKFLOW.md` and the v2/v3 build scripts first. Decoded the actual rig textures. Extracted the sweater from the supplied 1086 x 1448 illustration using a measured polygon and boundary cleanup; its checkerboard was baked into an opaque PNG. Applied local piecewise-affine warps using measured neckline, sleeve, waist and cuff landmarks, rather than scaling the character. Used the original exported PSD topwear alpha to constrain edits, and detected the original cream neckline transition. Preserved original body alpha exactly and original RGBA outside the sweater edit mask exactly. Skin, shoulders, lace, choker and shorts come from v3, not the Christmas illustration. No image generation was used.

Narrow missing garment regions were extended from the nearest valid warped sweater pixels. `reconstructed-regions.png` makes those areas explicit. The source cuffs were extended from intact green knit above the source hands. See validation.json for exact landmarks, reconstruction counts, and source SHA256 hashes.

## Review files

- `sweater-extracted.png`: transparent source sweater, retained at source resolution.
- `body-christmas.png`: proposed 1280 x 1280 RGBA replacement body.
- `comparison.png`: original and candidate neutral composites side by side.
- `overlay-comparison.png`: 50% blend with edit boundary, neckline and landmarks.
- `preview-original.png`, `preview-christmas.png`: transparent neutral composites using existing embedded head, hair and tail artwork.
- `body-original-v3.png`, `body-embedded-texture.png`: decoded baseline references.
- `sweater-aligned.png`: aligned garment alone; source/target masks and reconstructed-regions.png document edit scope.
- `source-grid.png`, `target-grid.png`: alignment measurement aids.
- `extraction-review.jpg`, `preview-review.jpg`, `seam-review.jpg`: inspection views (seam-review captures the fit before final source-hem cleanup).
- `prepare_outfit.py`: reproducible extraction, registration, compositing and validation script. Run from this workspace with Python; uses `.tools/psd-export` dependencies and the source image at the path recorded in validation.json.
- `validation.json`: numerical results and input hashes.

## Validation and limitations

Visually inspected the full composite, isolated extraction, collar, cuffs, shorts overlap and alignment overlay. The candidate retains the original proportions and transparent silhouette, with no new tail pixels. The main knitted motifs and colors remain recognizable. Local pattern distortion and small edge extensions remain, especially at inner cuffs, underarms and hem; these are a review candidate, not a claim of flawless reconstruction. The extracted source has a hard segmentation edge and may retain small edge-color contamination. It contains only visible sweater coverage, not a reconstructed garment behind the character.

The previews are neutral artwork composites at the rig's texture registration, not animation-engine renders. No motion or deformed seam validation has been performed: that requires the later approved texture swap. Original body alpha (including any baseline cutouts) is deliberately unchanged. The rest of the character uses the existing rig artwork.

## Next step

Review the comparison and close-up edges. Only after approval, make a separate `mikan-christmas-v1.iki`, replace texture index 1 with the registered crop, and validate body/head tilts, mouth, blinks and tail physics in Iki. This step has NOT been performed.
