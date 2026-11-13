/**
 * Shipped outfit catalogue. Vite emits each .iki as a file URL, not an eager
 * JS import, so the big texture-embedded rigs are fetched only when selected.
 */
import manifest from "../assets/iki/mikan-v02/outfits/wardrobe.json" with { type: "json" };

export const BUNDLED_PREFIX = "bundled:";
const prefix = "../assets/iki/mikan-v02/outfits/";
const assets = import.meta.glob("../assets/iki/mikan-v02/outfits/**/*.iki", {
  eager: true, query: "?url", import: "default"
}) as Record<string, string>;

export type ShippedIkiOutfit = {
  id: string;
  name: string;
  bundledUrl: string;
};

/** The default rig continues to use its established null selection. */
export const shippedOutfits: ShippedIkiOutfit[] = manifest.outfits
  .filter(entry => !("default" in entry && entry.default === true))
  .map(entry => {
    const bundledUrl = assets[prefix + entry.file];
    if (!bundledUrl) {
      throw new Error("Bundled outfit asset is missing: " + entry.file);
    }
    return { id: BUNDLED_PREFIX + entry.id, name: entry.name, bundledUrl };
  });

export function shippedOutfitById(id: string | null): ShippedIkiOutfit | undefined {
  return shippedOutfits.find(outfit => outfit.id === id);
}
