/**
 * CI guard for Mikan's self-knowledge.
 *
 * Every shipped Tauri command has to be represented by an up-to-date feature,
 * and every cited file must still exist. Changing a release version requires
 * updating the capability release stamp. This is deliberately deterministic.
 * Frontend-only features still need an explicit catalog entry in code review.
 */
import { readFileSync, existsSync } from "node:fs";
import { strict as assert } from "node:assert";
import { CAPABILITIES, CAPABILITY_RELEASE } from "../src/self-knowledge.ts";

const read=(path)=>readFileSync(path,"utf8");
const packageVersion=JSON.parse(read("package.json")).version;
const tauriVersion=JSON.parse(read("src-tauri/tauri.conf.json")).version;
const cargoVersion=read("src-tauri/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1];
assert.equal(CAPABILITY_RELEASE,packageVersion,"Bump the capability catalog release with package.json");
assert.equal(CAPABILITY_RELEASE,tauriVersion,"Tauri installer and capability catalog must match");
assert.equal(CAPABILITY_RELEASE,cargoVersion,"Cargo installer and capability catalog must match");

const ids=new Set(), titles=new Set();
const commandOwners=new Map();
for(const feature of CAPABILITIES){
  assert.match(feature.id,/^[a-z][a-z0-9-]+$/);
  assert(!ids.has(feature.id),"Duplicate capability "+feature.id); ids.add(feature.id);
  assert(!titles.has(feature.label),"Duplicate capability label "+feature.label);titles.add(feature.label);
  assert(["implemented","experimental","planned"].includes(feature.stage),"Invalid implementation stage: "+feature.id);
  assert(["none","ollama","search","mem0","voice","pocket"].includes(feature.runtime),"Invalid runtime dependency: "+feature.id);
  assert(feature.description.length>25,"Describe actual limitations of "+feature.id);
  assert(feature.keywords.length>0,"Add recall keywords for "+feature.id);
  if(feature.stage==="planned") assert.equal(feature.commands.length,0,"Planned features cannot expose commands: "+feature.id);
  else assert(feature.sources.length>0,"Shipped capabilities must cite source: "+feature.id);
  for(const path of [...feature.sources,...feature.docs]){
    assert(!path.includes("..")&&!path.startsWith("/")&&!path.includes("\\"),"Unsafe knowledge path "+path);
    assert(existsSync(path),"Stale capability "+feature.id+" refers to missing "+path);
  }
  for(const cmd of feature.commands){
    assert.match(cmd,/^[a-z][a-z0-9_]*$/);
    assert(!commandOwners.has(cmd),"Command "+cmd+" mapped twice: "+feature.id+" and "+commandOwners.get(cmd));
    commandOwners.set(cmd,feature.id);
  }
}
const handler=read("src-tauri/src/lib.rs")
  .match(/\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/);
assert(handler,"Cannot parse Tauri command registry");
const registered=handler[1].split(",").map(s=>s.trim()).filter(Boolean).map(s=>s.split("::").at(-1));
const actual=new Set(registered);
assert.equal(actual.size,registered.length,"Duplicate Tauri registered commands");
const notDocumented=registered.filter(cmd=>!commandOwners.has(cmd));
const notImplemented=[...commandOwners.keys()].filter(cmd=>!actual.has(cmd));
assert.deepEqual(notDocumented,[],"Unregistered features! Map every newly added Tauri command into the capability catalog.");
assert.deepEqual(notImplemented,[],"Capability catalog advertises commands no longer registered");
assert(CAPABILITIES.some(f=>f.id==="self-knowledge"&&f.stage==="implemented"),"Self-knowledge must describe itself");
console.log("Self-knowledge current for v"+CAPABILITY_RELEASE+": "+CAPABILITIES.length+
  " entries, "+registered.length+" Tauri commands mapped, cited files present.");
