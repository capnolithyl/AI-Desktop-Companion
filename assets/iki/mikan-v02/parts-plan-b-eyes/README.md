# Mikan / Iki eye-layer extraction (experimental)

Six transparent PNGs, 1100×1500, aligned on a shared canvas. They are extracted/constructed from the supplied **front-facing Mikan portrait** using pixel masks, not newly redrawn character features.

- `eye_L.png`, `eye_R.png`: separate reconstructed sclera/eye-white layers
- `iris_L.png`, `iris_R.png`: amber iris details sampled from the reference wherever visible
- `lash_L.png`, `lash_R.png`: dark upper/lower lash artwork selected from the reference

L/R are **character anatomical** left/right (L is on the viewer's right), matching the uploaded Iki examples. Files are approximately positioned for the supplied 1100×1500 layout; an Iki compositor might still apply additional scaling/positioning. Please inspect the `comparison.png` and `contact-sheet.png` before replacing existing assets.

**Limitations:** this is a *test extraction*, not production-ready rig artwork. The eye-white fill is reconstructed where covered by the iris, and hidden iris geometry behind the eyelid is not fully restored. Small edge artifacts and stray hair pixels can remain. Expect further cleanup for moving irises, blinking, and polished animations. For fidelity, preserve aspect ratio and use clean geometric clipping in the compositor rather than the old brightness-based masking.

No changes were made to your local Mikan repo or existing v02 artwork.
