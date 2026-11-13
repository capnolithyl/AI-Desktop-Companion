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