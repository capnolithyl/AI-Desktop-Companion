/** Position portrait right-click menus inside the visible Tauri window. */
export type MenuPoint = { x: number; y: number };
export function fitPortraitMenuPosition(
  point: MenuPoint, viewport: { width: number; height: number },
  menu: { width: number; height: number }, margin = 8
): MenuPoint {
  return {
    x: Math.min(Math.max(margin, viewport.width - menu.width - margin), Math.max(margin, point.x)),
    y: Math.min(Math.max(margin, viewport.height - menu.height - margin), Math.max(margin, point.y))
  };
}
