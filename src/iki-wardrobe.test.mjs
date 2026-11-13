import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WARDROBE_CONFIG, easterSunday, outfitDefaults, currentSeason,
  localWardrobeDay, pickDailyOutfit, wardrobeHoliday, wardrobeKey
} from "./iki-wardrobe.ts";

const choices = [
  { id: null, name: "Mikan v3 (bundled)" },
  { id: "black", name: "Black shirt" },
  { id: "christmas", name: "Christmas sweater" },
  { id: "witch", name: "Halloween witch costume" }
];

test("calendar calculations use the local date and include moving Easter", () => {
  assert.equal(localWardrobeDay(new Date(2026, 9, 31)), "2026-10-31");
  assert.deepEqual(easterSunday(2026), { month: 4, day: 5 });
  assert.equal(wardrobeHoliday(new Date(2026, 3, 5)), "easter");
  assert.equal(wardrobeHoliday(new Date(2026, 9, 31)), "halloween");
  assert.equal(wardrobeHoliday(new Date(2026, 11, 24)), "christmas");
  assert.equal(currentSeason(new Date(2026, 0, 1)), "winter");
});

test("imported outfits get reasonable default tags, without overriding metadata", () => {
  assert.equal(outfitDefaults("mikan-christmas-v1.iki").holiday, "christmas");
  assert.equal(outfitDefaults("mikan-gothic-blouse-v1.iki").season, "autumn");
  assert.equal(outfitDefaults("Månegarm shirt").season, "all");
  assert.equal(wardrobeKey(null), "bundled");
});

test("holiday wardrobe takes precedence when a matching costume is saved", () => {
  const config = { ...DEFAULT_WARDROBE_CONFIG };
  assert.equal(pickDailyOutfit(choices, config, new Date(2026, 9, 31), () => 0)?.id, "witch");
  assert.equal(pickDailyOutfit(choices, config, new Date(2026, 11, 25), () => 0)?.id, "christmas");
});

test("ordinary days exclude holiday-only costumes and avoid yesterday's pick", () => {
  const config = { ...DEFAULT_WARDROBE_CONFIG, lastId: "black" };
  const pick = pickDailyOutfit(choices, config, new Date(2026, 6, 14), () => 0.99);
  assert.equal(pick?.id, null);
});

test("holiday automation can be switched off and user favorites affect the lottery", () => {
  const config = { ...DEFAULT_WARDROBE_CONFIG, holidays: false,
    outfits: { black: { season: "all", holiday: "none", favorite: true } } };
  assert.equal(pickDailyOutfit(choices, config, new Date(2026, 11, 25), () => 0.99)?.id, "black");
  assert.equal(pickDailyOutfit([], config, new Date(2026, 11, 25)), null);
});
