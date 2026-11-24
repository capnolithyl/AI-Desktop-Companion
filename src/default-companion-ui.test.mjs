import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell=readFileSync(new URL("./DefaultCompanionShell.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("./default-companion.css",import.meta.url),"utf8");

test("Default workspace has independent persistent history and Iki panel toggles",()=>{
  assert.match(shell,/aria-label=\{showChats\?"Hide chat history panel"/);
  assert.match(shell,/aria-label=\{showAvatar\?"Hide Mikan avatar panel"/);
  assert.match(shell,/showChats&&<aside className="workspace-sidebar"/);
  assert.match(shell,/showAvatar&&<aside className="workspace-avatar-pane"/);
  assert.match(shell,/mikan\.workspace\.panel\./);
});
test("Default status is labeled and does not duplicate the model and memory green dots",()=>{
  assert.match(shell,/Memory issue.*Memory ready.*Memory loading/);
  assert.match(css,/\.companion\.default-layout-active \.workspace-model \.chat-memory-status/);
  assert.match(css,/\.companion\.default-layout-active \.workspace-model \.model-switcher > \.status-dot \{display:none;\}/);
});
test("Default Iki portrait has a compact, softly framed stage",()=>{
  assert.match(css,/height:clamp\(190px,34vh,310px\)/);
  assert.match(css,/\.workspace-iki-stage::after/);
});
