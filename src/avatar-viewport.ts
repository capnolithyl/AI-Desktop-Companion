/** Non-destructive framing of Mikan's existing Iki rig (model units). */
export const DEFAULT_AVATAR_VERTICAL_OFFSET = 0;
export const MIN_AVATAR_VERTICAL_OFFSET = -300;
export const MAX_AVATAR_VERTICAL_OFFSET = 300;

/** The original v3 portrait framing shared by all registered Iki outfits. */
const BASE_AVATAR_VIEW = { x: 0, y: 110, width: 1150, height: 1050 } as const;

/** Clamp and sanitize both stored values and live slider input. */
export function readAvatarVerticalOffset(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(MIN_AVATAR_VERTICAL_OFFSET, Math.min(MAX_AVATAR_VERTICAL_OFFSET, Math.round(value)))
    : DEFAULT_AVATAR_VERTICAL_OFFSET;
}

/** Positive offset moves Mikan higher on-screen (model-space Y increases upward). */
export function avatarViewport(offset: number) {
  return {
    ...BASE_AVATAR_VIEW,
    y: BASE_AVATAR_VIEW.y - readAvatarVerticalOffset(offset)
  };
}
