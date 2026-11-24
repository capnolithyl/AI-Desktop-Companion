import {readFileSync,writeFileSync,renameSync,unlinkSync,existsSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
const actions=new Set(["check","install"]);
const phases=new Set(["checking","current","available","installing","deferred","updated","failed","rolled-back"]);
const revision=v=>typeof v==="string"&&/^[a-f0-9]{40}$/.test(v)?v:null;
export function updateControl(dir="/data"){
  const request=join(dir,".mikan-update-request"),claimed=request+".claimed",status=join(dir,".mikan-update-status.json");
  function read(){
    try{return JSON.parse(readFileSync(status,"utf8"));}catch{return null;}
  }
  function readAction(file){
    try{const value=readFileSync(file,"utf8");return actions.has(value)?value:null;}catch{return null;}
  }
  function pending(){return readAction(claimed)??readAction(request);}
  function get(){return {host:read(),pending:pending()};}
  function queue(action){
    if(!actions.has(action))throw Object.assign(new Error("Invalid update action"),{status:400});
    if(pending())throw Object.assign(new Error("An update request is already queued"),{status:409});
    if(!read())throw Object.assign(new Error("Host update controls are not connected"),{status:503});
    try{writeFileSync(request,action,{flag:"wx",mode:0o600});}
    catch(e){if(e.code==="EEXIST")throw Object.assign(new Error("An update request is already queued"),{status:409});throw e;}
    return {queued:action};
  }
  function take(){
    // Claim atomically so a request arriving during an empty poll cannot be lost.
    if(!existsSync(claimed)){
      try{renameSync(request,claimed);}catch(e){if(e.code==="ENOENT")return null;throw e;}
    }
    const value=readAction(claimed);
    unlinkSync(claimed);
    return value;
  }
  function publish(phase,installed,available){
    if(!phases.has(phase))throw Error("Invalid phase");
    const previous=read(),now=Date.now(),entry={phase,installed:revision(installed),available:revision(available),at:now};
    const history=Array.isArray(previous?.history)?previous.history.slice(0,19):[];
    if(["updated","failed","rolled-back"].includes(phase))history.unshift(entry);
    const next={...entry,checkedAt:["checking","installing"].includes(phase)?previous?.checkedAt??null:now,lastBackup:phase==="updated"||phase==="rolled-back"?now:previous?.lastBackup??null,history};
    const temporary=status+".tmp";
    writeFileSync(temporary,JSON.stringify(next),{mode:0o600});
    renameSync(temporary,status);
    return next;
  }
  return {get,queue,take,publish};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const control=updateControl();
  const [action,...args]=process.argv.slice(2);
  if(action==="take")process.stdout.write(control.take()??"");
  else if(action==="publish")control.publish(...args);
  else process.exitCode=2;
}
