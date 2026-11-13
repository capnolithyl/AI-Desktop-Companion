import test from "node:test";
import assert from "node:assert/strict";
import { fitPortraitMenuPosition } from "./portrait-context-menu.ts";

test("opens at pointer when menu fits", () => {
  assert.deepEqual(fitPortraitMenuPosition({ x: 120, y: 80 }, { width: 520, height: 740 },
    { width: 246, height: 250 }), { x: 120, y: 80 });
});
test("clamps the menu at right and bottom edges", () => {
  assert.deepEqual(fitPortraitMenuPosition({ x: 515, y: 735 }, { width: 520, height: 740 },
    { width: 246, height: 250 }), { x: 266, y: 482 });
});
test("keeps top-left accessible in smaller windows", () => {
  assert.deepEqual(fitPortraitMenuPosition({ x: -20, y: -40 }, { width: 180, height: 120 },
    { width: 246, height: 250 }), { x: 8, y: 8 });
});
