import type { SavedIkiOutfit } from "./iki-avatar-storage";

/** Keep the preview and the worn outfit on the same rig-loading path. */
export function resolveDisplayedIkiRig(
  active: SavedIkiOutfit | null,
  preview: SavedIkiOutfit | null,
  previewVisible: boolean,
  defaultName: string
) {
  const outfit = previewVisible ? preview : active;
  return {
    customRig: outfit?.file ?? null,
    rigUrl: outfit?.bundledUrl ?? null,
    rigLabel: outfit?.name ?? defaultName
  };
}
