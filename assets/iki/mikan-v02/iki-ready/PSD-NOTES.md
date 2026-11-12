# Layered PSD validation

`mikan-iki-ready.psd` was created directly from the 14 prepared PNGs. No ORA conversion is necessary.

- 1280 x 1280, 8-bit RGB with transparency.
- Exactly 14 visible, normal-blend layers at full opacity, named exactly after the Iki roles with no filename extension.
- No layer masks. Each layer retains its full 1280 x 1280 canvas at offset (0, 0).
- Bottom-to-top order exactly matches `manifest.json`.
- Reopened PSD layer RGBA arrays match every input PNG exactly, including transparent pixels.
- Recomposition of reopened layers matches the prepared PNG composition exactly: zero changed pixels.
- The embedded merged PSD preview preserves transparency; its displayed colors differ by at most 2/255 levels from the prepared PNG composition due to compositing/preview quantization. This does not change the stored layer pixels.
- SHA-256 checks confirm all 14 input PNGs, the manifest and original cleaned PSD were unchanged.
- The comparison image was visually inspected. See `psd-comparison.png` and the machine-readable `psd-validation.json`.

Remaining limitations: validation used a PSD reader and pixel comparisons, not a Krita/Photoshop GUI or Iki import. Existing artwork limitations persist: tail is included in body (independent PNG remains preserved), ears are grouped with back hair, no open-mouth set or separate arms are supplied. Existing differences from the original cleaned PSD's embedded composite are documented in README.md; this packaging adds no changes to the prepared layer pixels.

No auto-rigging was performed.
