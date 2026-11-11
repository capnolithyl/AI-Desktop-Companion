# Neutral refinement review

Generated once each and replaced in parts/: face_base.png, hair_front.png, eye_left_open.png, eye_right_open.png, iris_left.png, iris_right.png, mouth_neutral.png.
Originals preserved in backups/before-neutral-refinement/parts/.
Unchanged source hashes verified: ear_left.png, ear_right.png, body_upper.png, hair_back.png.

Preview: previews/neutral-refined-up-30.png
Aligned transparent layers: layers-refined/
Reproduction: compose-refined-neutral.ps1
Placement record: notes/refined-layout.json (source name, role, x, y, width, height).
The earlier layers/ and previews remain preserved. Use layers-refined for this version.
The body stays at its existing placement. Ears, back hair and front hair keep the up-30 positions. The shorter face retains the same chin endpoint; internal features were fitted to the refined face. Irises are clipped to eye-white coverage in derived layers, preserving the generated source discs.

Visual review: exactly two separate cat ears, no embedded ears in face/hair, fuller front framing, crossed pins and curled ahoge retained, same outfit/choker/charm. No obvious neck gap or major assembly seam at neutral. Smile is softer. Eyes are more relaxed, but slightly sleepy and asymmetric beneath the bangs compared with the portrait; likeness is improved incrementally rather than exact.

Iki measure_layers ran on layers-refined. Eye sizing and iris-placement warnings were resolved. One warning remains: no separate nose layer (nose is baked into face by the current neutral-only design). Overall passed=false because of this warning; do not describe this as a clean full rig-readiness pass. No empty layers reported. No rigging or animation performed.

