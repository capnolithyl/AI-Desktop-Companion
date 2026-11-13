import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

/** A single transparent window: normal chat keeps its original 520px footprint. */
export const CHAT_WIDTH = 520;
export const SETTINGS_WIDTH = 1080;
export const DESKTOP_HEIGHT = 740;
type Origin = { originalX: number; originalY: number; expandedX: number; expandedY: number; };
let origin: Origin | null = null;
let queue: Promise<void> = Promise.resolve();

export function fitSettingsX(x: number, left: number, monitorWidth: number, settingsWidth: number): number {
  return Math.round(Math.max(left, Math.min(x, left + Math.max(0, monitorWidth - settingsWidth))));
}

/**
 * Current monitor sizes/positions are physical pixels; requested window sizes
 * are logical pixels. We reposition only as needed to keep the right-side
 * settings pane visible, then restore Mikan's original position on close.
 */
async function applyWindowMode(expanded: boolean): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  const current = getCurrentWindow();
  if (expanded) {
    if (origin) return;
    const [pos, monitor] = await Promise.all([current.outerPosition(), currentMonitor()]);
    const scale = monitor?.scaleFactor ?? 1;
    const screenWidth = monitor?.size.width ?? Math.round(SETTINGS_WIDTH * scale);
    const width = Math.max(CHAT_WIDTH, Math.min(SETTINGS_WIDTH, Math.floor(screenWidth / scale) - 24));
    const left = monitor?.position.x ?? pos.x;
    const targetX = fitSettingsX(pos.x, left, screenWidth, Math.round(width * scale));
    // Saving coordinates before resize lets us undo automatic monitor-edge shifts.
    origin = { originalX: pos.x, originalY: pos.y, expandedX: targetX, expandedY: pos.y };
    try {
      if (targetX !== pos.x) await current.setPosition(new PhysicalPosition(targetX, pos.y));
      await current.setSize(new LogicalSize(width, DESKTOP_HEIGHT));
    } catch (error) {
      origin = null;
      throw error;
    }
    return;
  }
  if (!origin) return;
  const saved = origin;
  origin = null;
  const position = await current.outerPosition();
  await current.setSize(new LogicalSize(CHAT_WIDTH, DESKTOP_HEIGHT));
  // Preserve intentional dragging while the settings pane was open.
  const restoreX = saved.originalX + position.x - saved.expandedX;
  const restoreY = saved.originalY + position.y - saved.expandedY;
  await current.setPosition(new PhysicalPosition(restoreX, restoreY));
}

/** Serialize mode changes to avoid a late expansion after the user closes Settings. */
export function setSettingsWindowMode(expanded: boolean): Promise<void> {
  queue = queue.catch(() => {}).then(() => applyWindowMode(expanded));
  return queue;
}
