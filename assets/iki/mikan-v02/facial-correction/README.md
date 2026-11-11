# Non-generative facial correction experiment

All source PNGs, references and layers-refined remain untouched; source-hashes.json records the verification inputs. Reproduce with ../compare-facial-corrections.ps1. These previews do not replace the approved baseline.

## Comparisons
- previews/01-baseline.png: exact existing refined up-30 baseline.
- previews/02-eyes-only.png: matched geometric masks, uniform scaling, 50 px maximum-dimension irises.
- previews/03-eyes-lower-face.png: same eyes plus 14 px smooth chin lift.
- previews/04-eyes-face-mouth-tint.png: same plus subtle warm pink tint.
- previews/comparison.png: labeled close-ups.
- previews/iris-sizes.png: 46, 50, 54 px maximum-dimension tests. Original iris aspect ratios retained, so width and height are not forced equal.

## Eye method
The right source eye contains an exterior pale translucent halo. The experiment instead uses the cleaner left-eye source mirrored for the opposite eye. Original right-eye artwork is preserved. A hand-traced Bezier opening is rasterized with antialiasing, mirrored exactly and used as an alpha mask; no brightness-based iris opacity. Iris art retains original proportions. Eyelid/lash art is overlaid above both irises. Both source irises are used, so their intentional texture/catchlight differences remain. Hair occlusion remains asymmetric because hair is unchanged. These are neutral-preview masks, not blink-ready rig geometry.

## Lower-face method
Smooth vertical warp begins below Y=550, lifts the chin endpoint from about 630 to 616, and leaves nose/eye positions fixed. A maximum 1.8% lateral cheek expansion is limited to Y=500..630. Premultiplied-alpha bilinear sampling avoids dark fringes. Mouth layer stays at its existing placement. This exposes 14 px more neck but no visible gap. Upper face keeps baseline geometry; globally restoring its source aspect ratio would undermine the approved layout.

## Review
Recommend 03 as the useful geometry comparison, with 04 an optional subtle color variant. 50 px is a compromise between the more exposed whites at 46 and fuller iris coverage at 54. Visible iris bounds now measure 48x35 and 49x35 instead of 58x37 and 58x58. The shorter lower face modestly improves proportions; it does not recreate the portrait's cheek/jaw anatomy. Lip tint is barely perceptible at normal scale. No obvious new face/neck gap or large shading discontinuity seen in the neutral preview.

The portrait still has different lid contours, facial spacing, jaw design, and asymmetric expression. More faithful contours would require targeted drawing or careful manual repainting, not simply more scaling. No new generation is needed to assess these comparisons.

## Geometry validation
Iki measure_layers executed on 02 and 04; neither is a full pass. No empty layers. Warnings remain for preserved natural eye aspect ratio (~0.47 versus heuristic minimum 0.5), intentionally smaller iris width (~40% of lash-inclusive eye bounds versus heuristic minimum 45%), iris center offset relative to whole-eye mass (~4 px horizontally and 3 px vertically), and missing separate nose (baked into face). We do not enlarge/stretch the artwork solely to silence these warnings. Review before any rigging.
