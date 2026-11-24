import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workspaceActivity, resolveWorkspaceWidths, resizeWorkspacePanel } from "./workspace-activity.ts";
const shell=readFileSync(new URL("./DefaultCompanionShell.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("./default-companion.css",import.meta.url),"utf8");
const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");

test("Default panels have persistent toggles and accessible drag handles",()=>{
  assert.match(shell,/aria-label=\{showChats\?"Hide chat history panel"/);
  assert.match(shell,/aria-label=\{showAvatar\?"Hide Mikan avatar panel"/);
  assert.match(shell,/showChats&&<aside className="workspace-sidebar"/);
  assert.match(shell,/showAvatar&&<aside className="workspace-avatar-pane"/);
  assert.match(shell,/mikan\.workspace\.panel\./);
  assert.match(shell,/mikan\.workspace\.widths/);
  assert.match(shell,/setPointerCapture/);
  assert.match(shell,/role="separator"/);
  assert.match(css,/var\(--workspace-left\)/);
  assert.match(css,/var\(--workspace-right\)/);
});
test("sidebar widths keep 340px of chat when possible and clamp on drag",()=>{
  assert.deepEqual(resolveWorkspaceWidths(1440,{chats:225,avatar:305},true,true),{chats:225,avatar:305});
  const narrow=resolveWorkspaceWidths(850,{chats:440,avatar:540},true,true);
  assert.ok(narrow.chats+narrow.avatar+16+340<=850);
  assert.equal(resizeWorkspacePanel("avatar",500,1000,225,true),419);
  assert.equal(resizeWorkspacePanel("chats",30,1440,305,true),160);
});
test("Default uses one model selector, one memory action, one vision toggle and one voice toggle",()=>{
  assert.equal((shell.match(/\{modelPicker\}/g)||[]).length,1);
  assert.equal((shell.match(/onClick=\{onOpenMemory\}/g)||[]).length,1);
  assert.equal((shell.match(/onClick=\{onToggleVision\}/g)||[]).length,1);
  assert.equal((shell.match(/onClick=\{onMute\}/g)||[]).length,1);
  assert.doesNotMatch(shell,/workspace-vision-on|onClick=\{onAttach\}/);
  assert.match(app,/onToggleVision=\{\(\)=>\{void setLiveVisionEnabled\(!liveVision.enabled\);\}\}/);
  assert.match(css,/\.companion\.default-layout-active \.workspace-model \.chat-memory-status/);
});
test("compact portrait retains the fade and leaves room for readable activity",()=>{
  assert.match(css,/height:clamp\(160px,26vh,245px\)/);
  assert.match(css,/\.workspace-iki-stage::after/);
  assert.match(css,/\.workspace-activity-feed/);
});
test("activity uses real recalled facts, on-demand snapshots and executed queries, not plans",()=>{
  const base={id:"a",role:"assistant",createdAt:123};
  const memory={facts:[{id:1,fact:"Likes metal"}],onDemand:[{query:"music",ids:[2],facts:[{id:2,fact:"Likes Shadows Fall"}]}]};
  const planned={...base,diagnostics:{toolPlan:{query:"not executed"}}};
  assert.deepEqual(workspaceActivity([planned]),[]);
  const live=workspaceActivity([{...base,workspaceMemory:memory}]);
  assert.deepEqual(live.map(e=>e.lines),[["Likes Shadows Fall"],["Likes metal"]]);
  const complete=workspaceActivity([{...base,diagnostics:{memory,toolPlan:{searchTrace:{attemptedQueries:["actual query","actual query"],returnedResults:4}}}}]);
  assert.equal(complete[0].detail,"4 results");
  assert.deepEqual(complete[0].lines,["actual query"]);
  assert.equal(workspaceActivity([{...base,sourcesCarriedOver:true}])[0].title,"Earlier web evidence reused");
});

test("recent chats copy their own debug log without switching the active conversation",()=>{
  assert.match(shell,/onClick=\{\(\)=>void copyChat\(chat.id\)\}/);
  assert.match(shell,/await onCopyChatDebug\(id\)/);
  assert.match(css,/\.workspace-chat-row:hover \.workspace-chat-copy/);
  assert.match(css,/\.workspace-chat-row:focus-within \.workspace-chat-copy/);
  assert.match(app,/onCopyChatDebug=\{copyConversationDebugLog\}/);
  const exportStart=app.indexOf("const copyConversationDebugLog = async");
  const exportEnd=app.indexOf("const copyFullDebugLog = async",exportStart);
  const exporter=app.slice(exportStart,exportEnd);
  assert.ok(exportStart>=0&&exportEnd>exportStart);
  assert.match(exporter,/isCurrent\?messages:/);
  assert.match(exporter,/memoryApi\.listMessages\(id\)\)\.map\(restoreMessage\)/);
  assert.match(exporter,/conversationId:id/);
  assert.doesNotMatch(exporter,/openConversation\(|setActiveConversationId\(|setMessages\(/);
  assert.match(shell,/onClick=\{onOpenCurrentLog\}/);
  assert.match(app,/onOpenCurrentLog=\{\(\)=>setScreen\("log"\)\}/);
});

test("Default Iki portrait supports local selectable scenery without changing the rig",()=>{
  assert.match(shell,/mikan\.workspace\.avatarBackground/);
  assert.match(shell,/id:"reading-nook"/);
  assert.match(shell,/id:"study-nook"/);
  assert.match(shell,/id:"plain"/);
  assert.match(shell,/mikan-backgrounds\/\$\{avatarBackground\}\.webp/);
  assert.match(shell,/aria-label="Mikan portrait background"/);
  assert.match(css,/var\(--workspace-avatar-background\)/);
  assert.match(css,/mask-image:linear-gradient/);
});

test("Default chat uses seamless mirrored SVG tails and bubble-local timestamps",()=>{
  assert.match(app,/function WorkspaceBubbleTail\(\)/);
  assert.match(app,/d="M17 3 H2 Q1 3 2 4 Q10 10 17 18"/);
  assert.match(app,/fill="var\(--bubble-tail\)" stroke="var\(--bubble-edge\)"/);
  assert.equal((app.match(/<WorkspaceBubbleTail\/>/g)||[]).length,2);
  assert.match(css,/\.workspace-message\.user \.workspace-bubble-tail \{left:auto;right:-15px;transform:scaleX\(-1\)/);
  assert.doesNotMatch(css,/\.workspace-message-bubble::before/);
  assert.match(css,/\.workspace-message\.failed \.workspace-message-bubble \{--bubble-edge:#f09090/);
  assert.match(app,/<div className="workspace-bubble-footer">\s*<time/);
  assert.match(app,/<WorkspaceBubbleTail\/>\s*<MarkdownText/);
});

test("Default chat uses the bundled cropped Mikan portrait, including while thinking",()=>{
  assert.match(app,/new URL\("\.\.\/assets\/iki\/mikan-chat-avatar\.webp", import\.meta\.url\)/);
  assert.equal((app.match(/src=\{WORKSPACE_CHAT_PORTRAIT\}/g)||[]).length,2);
  assert.match(css,/\.workspace-chat-portrait \{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%;\}/);
  const portrait=readFileSync(new URL("../assets/iki/mikan-chat-avatar.webp",import.meta.url));
  assert.equal(portrait.toString("ascii",0,4),"RIFF");
  assert.equal(portrait.toString("ascii",8,12),"WEBP");
});
