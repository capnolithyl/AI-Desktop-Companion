import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
// Hash the actual running service files, not only the build's claimed revision.
const files=["build-info.mjs","server.mjs","storage.mjs","memory-library.mjs","semantic-recall.mjs","embed-memory.py","local-retrieval.py","install-local-hindsight.sh","learning.mjs","hindsight.mjs","providers.mjs","provider-settings.mjs","research.mjs","agent-research.mjs","companion-agent.mjs","native-research.mjs","turn.mjs","brain-lab.mjs","knowledge.mjs","knowledge-plan.mjs","update-control.mjs","../src/notion-reading.ts","../src/notion-knowledge.ts","../src/assistant-instructions.ts","../src/personal-grounding.ts","../src/runtime-context.ts","../src/conversation-engine.ts","../src/narration-filter.ts","../src/evidence-verification.ts","../src/memory-retrieval.ts","../src/session-memory.ts","../src/unified-planner.ts"];
export function backendHash(){
  const hash=createHash("sha256");
  for(const name of files){hash.update(name+"\0");hash.update(readFileSync(new URL(name,import.meta.url)));}
  return hash.digest("hex").slice(0,16);
}
export function buildInfo(){
  let commit="unknown";
  try{commit=execFileSync("git",["rev-parse","HEAD"],{cwd:new URL("..",import.meta.url),encoding:"utf8"}).trim();}catch{/* Source archive build. */}
  const version=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8")).version+"-nas";
  return {version,commit,backendHash:backendHash()};
}
export function runningBuildInfo(){
  let manifest={version:"unpackaged",commit:"unknown",backendHash:null};
  try{manifest=JSON.parse(readFileSync(new URL("build-info.json",import.meta.url),"utf8"));}catch{/* An old or development deployment. */}
  return {...manifest,actualBackendHash:backendHash()};
}
