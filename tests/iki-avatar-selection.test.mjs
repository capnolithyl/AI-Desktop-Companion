import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveDisplayedIkiRig } from "../src/iki-avatar-selection.ts";

const defaultName = "Original · Mikan v3";
const blackShirt = {
  id: "bundled:black-shirt", name: "Black Shirt", file: null,
  bundledUrl: "/assets/mikan-black-shirt.iki", savedAt: 0
};
const christmas = {
  id: "bundled:christmas", name: "Christmas", file: null,
  bundledUrl: "/assets/mikan-christmas.iki", savedAt: 0
};
const uploadedFile = new Blob(["{}"], { type: "application/json" });
const uploaded = { id: "file:custom", name: "Custom outfit", file: uploadedFile, savedAt: 1 };

test("default outfit uses the bundled fallback when no rig is selected", () => {
  assert.deepEqual(resolveDisplayedIkiRig(null, null, false, defaultName), {
    customRig: null, rigUrl: null, rigLabel: defaultName
  });
});

test("worn bundled outfit uses its own URL instead of the default sweater", () => {
  assert.deepEqual(resolveDisplayedIkiRig(blackShirt, null, false, defaultName), {
    customRig: null, rigUrl: blackShirt.bundledUrl, rigLabel: "Black Shirt"
  });
});

test("wardrobe preview changes the visible rig without replacing the active outfit", () => {
  assert.equal(resolveDisplayedIkiRig(blackShirt, christmas, true, defaultName).rigUrl,
    christmas.bundledUrl);
  assert.equal(resolveDisplayedIkiRig(blackShirt, christmas, false, defaultName).rigUrl,
    blackShirt.bundledUrl);
  assert.equal(resolveDisplayedIkiRig(blackShirt, null, true, defaultName).rigUrl, null);
});

test("imported outfits still load their saved Blob and do not require a URL", () => {
  const result = resolveDisplayedIkiRig(uploaded, blackShirt, false, defaultName);
  assert.equal(result.customRig, uploadedFile);
  assert.equal(result.rigUrl, null);
  assert.equal(result.rigLabel, "Custom outfit");
});

// Guard the App-to-renderer connection too: unit tests alone cannot catch an omitted prop.
test("App actually forwards the resolved outfit URL to IkiAvatar", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /resolveDisplayedIkiRig\(ikiRig, previewRig, wardrobePreviewVisible, defaultOutfitName\)/);
  assert.match(app, /<IkiAvatar customRig=\{displayedIkiRig\.customRig\} rigUrl=\{displayedIkiRig\.rigUrl\}/);
});
