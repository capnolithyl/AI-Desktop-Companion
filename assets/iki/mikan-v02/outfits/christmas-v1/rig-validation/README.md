# Christmas rig animation review

The standalone candidate is `../mikan-christmas-v1.iki`. No original rig, application code, versions, default avatar or settings were changed. Approval is still required before live app testing.

## Change and validation

Created by `../build_rig.py` from the accepted v3. Only JSON paths `/name` and `/textures/1/source` differ. Texture 1 is the 899 x 864 crop of the approved full-canvas body at (164,416)-(1063,1280). All meshes, indices, UVs, part transforms/order, deformers, parameters, expressions, motion definitions, springs and other embedded textures are identical. All six PNG textures remain embedded; all 16 parts remain present. Source hash and exact differences are in structural-validation.json.

Iki's model parser accepted the variant. Actual Iki WebGL engine renders loaded without failed textures. Both versions passed the same 642-pose fold audit, with only intentional eye closures excluded; all four spring checks are healthy. Twenty-one matched poses per version cover neutral/closed mouth, blink, half/full mouth, smile, surprise, turns, tilts, combined/opposing tilts, all-angle stress, full breath and tail endpoints. Render alpha and the upper 560 rows of the 1280px frames are pixel-identical across versions in every tested pose. This confirms no new transparent gaps and no facial regression in these samples; it does not mean the baseline has no gaps.

The 12-second physics sequence has 144 captured frames per version at 12 fps, with actual IkiMotion springs stepped at 60 Hz. First six seconds: deterministic breath/ambient idle inputs. Next six: combined head/body tilt sweep plus ambient motion. All recorded parameter traces are identical between versions. No manual tail animation was substituted. Captures use the installed engine bundle whose path is recorded in motion-validation.json.

## Visual findings

**Acceptable:** The neckline stays registered to the original skin/lace. The torso motifs, sleeves, cuffs and hem follow the existing deformation without a new separation or geometry collapse. Facial tests and tail attachment match v3. Mild fabric stretching is difficult to notice at normal desktop size.

**Needs improvement (artwork polish):** The inner garment edges beside both underarm openings remain jagged, with stretched/repeated cream/green pattern fragments. Approximate neutral canvas areas: viewer-left x450-515/y860-1050; viewer-right x785-850/y860-1050. Enlarged underarm comparisons show this clearly. These are localized texture reconstruction defects, not newly broken meshes. Cuff/hem edge extensions also retain minor smearing at enlargement. No speculative texture or rig repairs were made in this phase.

**Pre-existing:** Hair/background shows through the narrow underarm openings, more visibly when hair moves away in combined/opposing poses. Their shape/alpha is unchanged. Extreme-angle hair stretching and the partially transparent half-open mouth crossfade are also present in v3. Smile/surprise static tests use the model's declared expression parameter values, without separately testing expression fade timing.

**Blocking:** None observed in the tested engine poses or sampled motion frames.

Desktop assessment uses the actual application view (x0,y110,width1150,height1050) at its default 514 x 472 CSS-pixel portrait viewport, derived from the default 520 x 740 window and CSS insets. Underarm artifacts are subtle near the lower portion of that viewport; cuffs and hem are mostly below it. See desktop-size-comparison.png at 100% zoom. The user's current window size/DPI was not read or changed, and live app behavior remains untested.

## Review files

- neutral-comparison.png: original / Christmas actual engine neutral renders.
- pose-comparison.png: matched full-character turns, tilts and stress poses.
- underarm-closeups.png: enlarged matched left/right openings, including exposed hair/background.
- cuff-hem-closeups.png: original / Christmas lower garment and shorts overlaps.
- mouth-expression-tests.png: matched facial progression and expressions.
- desktop-size-comparison.png: actual engine desktop-framed neutral and combined tilts.
- physics-preview.webp: 144-frame Christmas engine animation.
- physics-comparison.png: nine sampled timestamps, original / Christmas.
- original/, christmas/: 560px static engine PNGs.
- detail-original/, detail-christmas/: 1280px engine PNGs.
- desktop-original/, desktop-christmas/: 514 x 472 engine PNGs.
- motion-voriginal/, motion-vchristmas/: all 144 timed engine PNGs each.
- validation.json: combined structural/render/visual findings; render-original.json and render-christmas.json retain full fold/physics results.
- structural-validation.json, detail-validation.json, motion-validation.json: supporting checks and raw parameter traces.
- poses.json, render_motion.mjs, render_detail.mjs, make_review.py: reproducible requests/capture/sheet tools. The final visual assessment in validation.json is appended after running make_review.py.

## Execution notes and next step

Initial sandbox browser evaluations timed out. Successful captures ran outside the sandbox. Motion capture saved every frame and the report, then encountered an EBUSY error removing its temporary Chrome profile; this was a cleanup-only failure, and the frames/WebP/report were independently checked. The detailed capture completed normally.

Visually inspected pose sheets, underarm/face details, desktop renders and sampled motion frames. This is an engine validation candidate, not a claim of flawless costume artwork or live desktop acceptance. Review the animation and local edge defects, then approve or request localized artwork cleanup before uploading through the existing custom .iki setting.
