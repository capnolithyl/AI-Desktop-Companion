import {cpSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {buildInfo} from "./build-info.mjs";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("..",import.meta.url)), target=join(root,".nas-deploy");
rmSync(target,{recursive:true,force:true});
mkdirSync(join(target,"nas"),{recursive:true});
mkdirSync(join(target,"src"),{recursive:true});
mkdirSync(join(target,"assets/iki"),{recursive:true});
for(const name of ["Dockerfile","build-info.mjs","compose.yaml","compose.registry.yaml","update-beholder.sh","update-control-host.sh","update-control.mjs",".env.example","server.mjs","storage.mjs","memory-library.mjs","learning.mjs","providers.mjs","provider-settings.mjs","research.mjs","native-research.mjs","turn.mjs","brain-lab.mjs","knowledge.mjs","knowledge-plan.mjs","searxng","public","web-dist","README.md"])
  cpSync(join(root,"nas",name),join(target,"nas",name),{recursive:true});
for(const name of ["model-switcher.ts","brain-eval-fixtures.ts","brain-eval-cloud.ts","notion-reading.ts","notion-knowledge.ts","assistant-instructions.ts","personal-grounding.ts","runtime-context.ts","conversation-engine.ts","narration-filter.ts","evidence-verification.ts", "assistant-voice.ts","personality.ts","communication-preferences.ts","companion-profile.ts","avatar-background.ts","avatar-viewport.ts","memory-import.ts","interest-import.ts","memory-ranking.ts","identity-memory.ts","character-canon-routing.ts","interest-context.ts","archive-memory.ts","memory-budget.ts","memory-retrieval.ts","session-memory.ts","unified-planner.ts"])
  cpSync(join(root,"src",name),join(target,"src",name));
mkdirSync(join(target,"nas/research-native/src"),{recursive:true});
mkdirSync(join(target,"src-tauri/src"),{recursive:true});
for(const name of ["Cargo.toml","src/main.rs"])cpSync(join(root,"nas/research-native",name),join(target,"nas/research-native",name));
for(const name of ["source_record.rs","quantities.rs","attribution.rs","recommendation_gate.rs","cloud_evidence.rs"])cpSync(join(root,"src-tauri/src",name),join(target,"src-tauri/src",name));
cpSync(join(root,"assets/iki/mikan-chat-avatar.webp"),join(target,"assets/iki/mikan-chat-avatar.webp"));
cpSync(join(root,".dockerignore"),join(target,".dockerignore"));
writeFileSync(join(target,"nas","build-info.json"),JSON.stringify(buildInfo(),null,2));
console.log("NAS deployment ready: .nas-deploy (no database, .env or provider keys)");
