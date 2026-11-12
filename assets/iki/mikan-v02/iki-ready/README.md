# Mikan: PSD preparation for visual approval

Source: `../mikan-cleaned.psd`, verified at
`H:\_FunProjects\AI-Desktop-Companion\AI-Desktop-Companion\assets\iki\mikan-v02\mikan-cleaned.psd`.
Source modified November 12, 2026, 10:23:52 AM local time; 7,102,161 bytes.
SHA-256 before and after: `56a60b0890081fca30c6c7c71521435cb9222543594836f51b7ca6bff3a2fcab`.

Status: PNG preparation only. No auto-rigging performed. Visual approval is required before rigging.

## Deliverables

- `layers/`: 14 transparent RGBA PNGs, each on the original 1280 x 1280 canvas. No artwork resized, repositioned, mirrored, generated, redrawn, or repaired.
- `preserved/tail.png`: independent full-canvas tail artwork. Tail is also present in `body.png`; do not composite this copy a second time.
- `source-layers/`: all 15 PSD layers exported separately, including original ears and clothing, for future separation work.
- `comparison.png`: original PSD saved composite on the left; recomposed final Iki layers on the right, over a checkerboard.
- `face-comparison.png`: enlarged face comparison.
- `recomposed-preview.png`: transparent final composition.
- `source-preview.png`: PSD embedded composite.
- `difference-x16.png`: absolute difference on checkerboard, amplified 16 times.
- `manifest.json`: source hash, exact source/role stacks, split locations, PNG bounds and numerical comparison results.
- `inspect_psd.py` and `prepare.py`: reproducible export scripts using the local `.tools/psd-export` dependencies.

## Mapping

| PSD artwork | Exported role |
| --- | --- |
| cat_ears.png + back hair Merged | hair_back |
| bottomwear Merged + topwear Merged + neckwear Merged + tail.png | body |
| face Merged | face |
| nose Merged | nose |
| mouth Merged | mouth |
| eyebrow Merged | brow_R, brow_L |
| eyewhite Merged | eye_R, eye_L |
| eyelash Merged | lash_R, lash_L |
| irides Merged | iris_R, iris_L |
| front hair Merged + headwear Merged | hair_front |

All four bilateral layers were split through an entirely transparent column at x=660. Character R is viewer left; character L is viewer right. Both source sides are retained independently, not mirrored. Rejoining each split reproduces every original visible RGBA pixel and all alpha values exactly.

The file differs from the supplied layer list: it contains an additional `cat_ears.png`, calls the rear hair `back hair Merged`, and puts `tail.png` at the top of the stack. The actual PSD stack is recorded in the manifest. Contiguous accessories were merged in original order. Moving the tail into the body grouping was compared against the original exported stack: final grouping changes only 878 pixels by at most 2/255 channel levels, with no changes above 2 levels. This is negligible compositing quantization, with no observed stacking change in the neutral preview.

## Inspection findings and limitations

The complete composition and enlarged face were visually inspected. Eyes, brows, mouth, ears, pins, clothing, charm and tail remain present and aligned. No missing visible artwork was observed. The export is NOT pixel-identical to the PSD embedded composite: 437,447 pixels differ at least one channel level, 207,543 differ by more than 2/255; maximum channel difference is 64/255. The average difference over RGBA channels is approximately 0.664/255. Differences already occur when recomposing the ungrouped source exports, rather than being introduced by the role mapping. Subtle tonal/edge differences remain; exact cause is unverified (the PSD contains an embedded ICC profile). The side-by-side comparison is the approval reference, not a claim of exact pixel parity.

- There is no independently mapped tail role in this prepared standard role set. Tail is provisionally attached to `body`; the independent preserved copy enables future custom animation. No tail animation is established.
- Cat ears are included in `hair_back`; hairpins in `hair_front`; necklace/charm in `body`. Independent ear/accessory motions are not established. Original exports remain available.
- Only a closed mouth drawing exists. No open-mouth artwork, cavity, teeth, tongue or separate lip set was supplied or invented. Lip-sync readiness is limited.
- Arms are embedded in topwear; no separate arms, pose forearms, hands, or complete legs/feet are supplied. The source is cropped at the lower canvas edge.
- Rear hair and face layers contain painted hair/shading remnants visible when isolated. They are retained exactly; head turns may expose them. No hidden-art repair was attempted.
- Lashes were separated left/right as supplied, without inventing independent lower lids. Blink behavior, eye clipping, motion seams and the auto-rigger's own draw order remain untested.

Approve the visual composition before any rig creation. This export does not establish animation acceptance.
