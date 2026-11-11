# Mikan v02 neutral review

Generated exactly once: face_base, ear_left, ear_right, hair_back, hair_front, body_upper, eye_left_open, eye_right_open, iris_left, iris_right, mouth_neutral. No regenerated parts. Built-in image_gen only.

Preview: previews/neutral-assembled.png. Reproducible placement and layer order: compose-neutral.ps1. Source parts preserved in parts; aligned 1100x1500 layers in layers. Source filenames use viewer left/right; Iki eye and iris role suffixes use character left/right.

Visual review: exactly two separate ears; no ears embedded in face or hair. No obvious gaps at ear roots or neck in neutral. Orange waves, hairpins, freckles, choker/paw charm, cream cable knit and lace are recognizable. Face is longer and eyes rounder/more staring than portrait. Irises reach the lower eye edge; this assembly does not implement runtime iris clipping. Hair silhouette is approximate and front hair ahoge is larger than requested. Tail omitted from the explicit eleven-part neutral core. Nose and brows are baked into face for this pass; not independent animation layers. Eye lashes remain baked into open-eye parts. No rig or animation created. Neutral only; motion seams untested.

Iki measure_layers completed with warnings (not a clean pass):

# layers  (H:\_FunProjects\AI-Desktop-Companion\assets\iki\mikan-v02\layers)

role          size        bbox-centre    mass-centre   margins t/b/l/r
body          820x820     550,1000       549,1061      590/90/140/140
ear_left      190x240     735,210        745,217       90/1170/640/270
ear_right     190x240     365,210        360,220       90/1170/270/640
eye_L         115x58      637,454        633,457       425/1017/580/405
eye_R         115x57      462,454        470,456       426/1017/405/580
face          400x480     550,420        550,406       180/840/350/350
hair_back     740x1120    550,710        546,748       150/230/180/180
hair_front    660x700     550,400        542,376       50/750/220/220
iris_L        46x46       630,460        630,460       437/1017/607/447
iris_R        46x46       471,460        471,460       437/1017/448/606
mouth         76x16       550,573        549,574       565/919/512/512

# checks

- iris_L: width is 40% of the sclera (target 0.45-0.72) — retune layout.iris_L.w (keep it a fraction of the eye width), no regeneration needed.
- iris_L: sits (-3.7, 2.7) px from the white's centre of mass — retune layout.iris_L.cx/cy. The sclera's bbox centre is NOT its visual centre when the lash flick stretches the box.
- eye_R: sclera aspect h/w=0.50 is flatter than 0.5 — a round iris cannot sit inside it. Free fix first: set layout.eye_R.h and layout.lash_R.h to 58 (both, or the fold tears) — stretching a flat white lens is invisible. Regenerate the eyewhite taller only if that distorts the lash.
- iris_R: width is 40% of the sclera (target 0.45-0.72) — retune layout.iris_R.w (keep it a fraction of the eye width), no regeneration needed.
- nose: missing — without it the head still turns on the default profile, but there is no nose to lead it, and no turn fit to the art (`turnTargets` is inert, no `turn` report).
