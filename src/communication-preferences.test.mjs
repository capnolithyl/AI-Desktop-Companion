import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_COMMUNICATION,readCommunicationPreferences,communicationGuidance} from "./communication-preferences.ts";
test("defaults use endearments without requiring one in each reply",()=>{
  const rule=communicationGuidance(DEFAULT_COMMUNICATION);
  assert.match(rule,/Do not address the user by their first name/);
  assert.match(rule,/Do not force a pet name into every reply/);
});
test("communication settings validate stored values and support alternate modes",()=>{
  const value=readCommunicationPreferences({addressMode:"neutral",replyLength:"concise",
    followUps:"natural",endearments:"",customGuidance:"Avoid excessive emojis"});
  const text=communicationGuidance(value);
  assert.match(text,/Avoid addressing the user by their first name/);
  assert.match(text,/Prefer short, direct replies/);
  assert.match(text,/Avoid excessive emojis/);
  assert.equal(readCommunicationPreferences({addressMode:"invalid"}).addressMode,"endearments");
  assert.match(communicationGuidance(readCommunicationPreferences({addressMode:"first-name"})),/may address the user by their first name/);
});
// Guard against a follow-up integration accidentally keeping the module
// while dropping the actual user controls and system-prompt injection.
test("communication preferences are wired into the desktop UI and chat", async()=>{
  const {readFileSync} = await import("node:fs");
  const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
  assert.match(app,/communicationGuidance\(settings\.communication\)/);
  assert.match(app,/Communication preferences/);
  assert.match(app,/draft\.communication\.addressMode/);
  assert.match(app,/draft\.communication\.customGuidance/);
});
test("reviewed corrections can replace earlier interest records",async()=>{
  const {readFileSync} = await import("node:fs");
  const client=readFileSync(new URL("./memory-client.ts",import.meta.url),"utf8");
  const panel=readFileSync(new URL("./MemoryReviews.tsx",import.meta.url),"utf8");
  assert.match(client,/existingInterestId:\s*number\s*\|\s*null/);
  assert.match(panel,/review\.existingInterestId\s*!=\s*null/);
});

test("standalone first-name salutation is removed in no-name modes, not genuine content",async()=>{
  const {respectAddressPreference}=await import("./communication-preferences.ts");
  assert.equal(respectAddressPreference("Oh, Marcus!\n\nThe Art of Balance is great.","endearments"),
    "The Art of Balance is great.");
  assert.equal(respectAddressPreference("Oh, Marcus!\n\nHi there.","first-name"),
    "Oh, Marcus!\n\nHi there.");
  assert.equal(respectAddressPreference("Oh, The War Within is good.","endearments"),
    "Oh, The War Within is good.");
});
