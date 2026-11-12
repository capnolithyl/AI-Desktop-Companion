import test from "node:test";
import assert from "node:assert/strict";
import { reactionFromReply } from "../src/avatar-reactions.ts";

test("recognizes a few natural opening reactions", () => {
  assert.equal(reactionFromReply("Haha, you got me!"), "laugh");
  assert.equal(reactionFromReply("Wow, that actually works!"), "surprised");
  assert.equal(reactionFromReply("I'm sorry, that sounds painful."), "sad");
  assert.equal(reactionFromReply("That's unacceptable."), "angry");
  assert.equal(reactionFromReply("Yes, exactly!"), "nod");
  assert.equal(reactionFromReply("Nope, that won't work."), "shake");
  assert.equal(reactionFromReply("You caught me! I'm moving now!"), "smile");
  assert.equal(reactionFromReply("**Awesome!** It works."), "smile");
});

test("stays neutral for matter-of-fact explanations and errors", () => {
  assert.equal(reactionFromReply("The database contains 91 facts."), null);
  assert.equal(reactionFromReply("Run the build command to check the package."), null);
  assert.equal(reactionFromReply("Error: Model unavailable"), null);
  assert.equal(reactionFromReply("[Interrupted: Request timeout]"), null);
  assert.equal(reactionFromReply(""), null);
});
