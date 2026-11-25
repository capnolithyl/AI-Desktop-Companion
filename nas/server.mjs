import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname, resolve, extname, sep } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { runningBuildInfo } from "./build-info.mjs";
import { updateControl } from "./update-control.mjs";
import { openStore } from "./storage.mjs";
import { exportCompanionProfile, importCompanionProfile } from "../src/companion-profile.ts";
import { generateReply } from "./providers.mjs";
import {providerSettings} from "./provider-settings.mjs";
import {executeNasTurn,turnTrace,currentProfile} from "./turn.mjs";
import {createBrainLab} from "./brain-lab.mjs";
import {researchSettings,searchWeb,readWeb} from "./research.mjs";
import {createKnowledge} from "./knowledge.mjs";

const ROOT=dirname(fileURLToPath(import.meta.url));
const BUILD=runningBuildInfo();

function safeEqual(a,b) {
  if (typeof a!=="string" || typeof b!=="string") return false;
  const aa=Buffer.from(a), bb=Buffer.from(b);
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}
function json(res,status,value) {
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  res.end(JSON.stringify(value));
}
async function readJson(req,max=8192) {
  let size=0, chunks=[];
  for await (const part of req) {
    size+=part.length;
    if (size>max) {const error=new Error("Request body too large");error.status=413;throw error;}
    chunks.push(part);
  }
  try {return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");}
  catch {const error=new Error("Invalid JSON request");error.status=400;throw error;}
}
// Iki fetches embedded PNG data URLs during texture decoding. Keep external network origins blocked.
function serveFile(res,filename,type) {
  const headers={"Content-Type":type,"X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer","Cache-Control":"no-store",
    "Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
  res.writeHead(200,headers);
  res.end(readFileSync(filename));
}
const WEB_ROOT=join(ROOT,"web-dist");
const TYPES={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".png":"image/png",".webp":"image/webp",".jpg":"image/jpeg",".svg":"image/svg+xml",".iki":"application/json",".json":"application/json",".woff2":"font/woff2",".ico":"image/x-icon"};
function workspaceFile(path) {
  let relative;
  try {relative=decodeURIComponent(path.slice("/workspace/".length));} catch {return null;}
  const filename=resolve(WEB_ROOT,relative||"index.html");
  if(!filename.startsWith(WEB_ROOT+sep) || !TYPES[extname(filename)] || !existsSync(filename))return null;
  return {filename,type:TYPES[extname(filename)]};
}
function sse(res,kind,value) {
  if (!res.destroyed) res.write("event: "+kind+"\ndata: "+JSON.stringify(value)+"\n\n");
}
export function makeServer({store,config,key,promptFile="",maintenanceFile="/data/.mikan-update-maintenance",updates=updateControl(),models=providerSettings({initial:config,db:store.db}),generate=generateReply,research=researchSettings(store.db,{defaultEngine:"legacy"}),search=searchWeb,read=readWeb,knowledge=createKnowledge({db:store.db,read})}) {
  if (typeof key!=="string" || key.length<32) throw new Error("MIKAN_REMOTE_KEY must be at least 32 characters");
  let busy=false,lastReplyAt=0,activeWrites=0;
  const maintenance=()=>existsSync(maintenanceFile);
  const unavailable=()=>busy||store.learning.isRunning()||brain.isRunning()||knowledge.isRunning();
  const requestModel=async(args,source="chat")=>{
    const startedAt=Date.now();let usage=null,failed=true;
    try{
      const result=await generate({...args,onUsage:value=>{usage=value;args.onUsage?.(value);},onResponse:response=>models.observe(args.config.provider,response)});
      failed=false;return result;
    }catch(error){if(error?.upstreamStatus===429){models.cooldown(args.config.provider);error.quota=models.quota(args.config.provider);}throw error;}
    finally{
      try{models.recordUsage({provider:args.config.provider,model:args.config.model,source,startedAt,usage,failed});}
      catch{console.error("Could not record provider token usage");}
    }
  };
  const brain=createBrainLab({db:store.db,models,requestModel:args=>requestModel(args,"brain-lab"),search,read,build:BUILD});
  const server=createServer(async(req,res)=>{
    let writing=false;
    try {
      const path=new URL(req.url||"/","http://localhost").pathname;
      if (req.method==="GET" && (path==="/"||path==="/workspace") && existsSync(join(WEB_ROOT,"index.html"))) {
        res.writeHead(302,{Location:"/workspace/","Cache-Control":"no-store"});return res.end();
      }
      if(req.method==="GET" && path.startsWith("/workspace/")) {
        const asset=workspaceFile(path);
        return asset?serveFile(res,asset.filename,asset.type):json(res,404,{error:"Workspace asset not found"});
      }
      if (req.method==="GET" && (path==="/"||path==="/legacy")) return serveFile(res,join(ROOT,"public/index.html"),"text/html; charset=utf-8");
      if (req.method==="GET" && path==="/app.js") return serveFile(res,join(ROOT,"public/app.js"),"text/javascript; charset=utf-8");
      if (req.method==="GET" && path==="/style.css") return serveFile(res,join(ROOT,"public/style.css"),"text/css; charset=utf-8");
      if (req.method==="GET" && path==="/avatar.webp") return serveFile(res,join(ROOT,"assets/mikan-chat-avatar.webp"),"image/webp");
      if (req.method==="GET" && path==="/api/health") return json(res,200,{ok:true,service:"mikan-nas",maintenance:maintenance(),idle:!unavailable()&&activeWrites===0});
      if (!safeEqual(req.headers.authorization?.replace(/^Bearer /i,""),key))
        return json(res,401,{error:"Enter your Mikan NAS access key"});
      if(req.method!=="GET"&&req.method!=="HEAD"){
        if(maintenance())return json(res,503,{error:"Mikan is installing an update. Please retry shortly."});
        writing=true;activeWrites++;
      }
      if(req.method==="GET"&&path==="/api/updates")return json(res,200,{build:BUILD,...updates.get()});
      if(req.method==="POST"&&path==="/api/updates"){
        const body=await readJson(req,1024);
        return json(res,202,updates.queue(body?.action));
      }
      if (req.method==="GET" && path==="/api/status")
        return json(res,200,{...models.view(),busy:unavailable(),build:BUILD});
      if(req.method==="GET"&&path==="/api/knowledge")return json(res,200,knowledge.status());
      if(req.method==="GET"&&path==="/api/knowledge/document"){
        const q=new URL(req.url,"http://localhost").searchParams;return json(res,200,knowledge.inspect(q.get("kind"),q.get("id")));
      }
      if(req.method==="POST"&&path==="/api/knowledge"){
        const body=await readJson(req,100000);if(unavailable()||maintenance())return json(res,409,{error:"Wait for Mikan to become idle"});
        const actions={connect:()=>knowledge.connect(body.secret),refresh:()=>knowledge.refresh(),settings:()=>knowledge.settings(body.patch),sync:()=>knowledge.sync(),disconnect:()=>knowledge.disconnect(),remove:()=>knowledge.remove(body.kind,body.id),refreshWeb:async()=>{busy=true;try{await knowledge.cachedRead(body.id,{fresh:true});return knowledge.status();}finally{busy=false;}}};
        if(!Object.hasOwn(actions,body.action))return json(res,400,{error:"Unknown knowledge action"});
        return json(res,200,await actions[body.action]());
      }
      if(req.method==="GET"&&path==="/api/brain-lab")return json(res,200,brain.status());
      if(req.method==="GET"&&path.startsWith("/api/brain-lab/report/"))return json(res,200,brain.get(path.slice("/api/brain-lab/report/".length)));
      if(req.method==="GET"&&path==="/api/brain-lab/catalog")return json(res,200,brain.catalog());
      if(req.method==="POST"&&path==="/api/brain-lab/start"){
        const body=await readJson(req,16000);if(unavailable()||maintenance())return json(res,409,{error:"Wait for Mikan to become idle"});
        return json(res,202,brain.start(body));
      }
      if(req.method==="POST"&&path==="/api/brain-lab/stop")return json(res,200,brain.stop());
      if(req.method==="GET"&&path==="/api/research")return json(res,200,{mode:research.get(),engine:research.engine()});
      if(req.method==="PUT"&&path==="/api/research"){
        const body=await readJson(req,1024);if(unavailable())return json(res,409,{error:"Wait for current reply"});
        if(body?.engine!==undefined&&!["legacy","native"].includes(body.engine))return json(res,400,{error:"Invalid research engine"});
        if(body?.mode!==undefined)research.save(body.mode);
        if(body?.engine!==undefined)research.saveEngine(body.engine);
        return json(res,200,{mode:research.get(),engine:research.engine()});
      }
      if(req.method==="POST"&&path==="/api/research/test"){
        if(unavailable())return json(res,409,{error:"Wait for current reply"});
        try{const results=await search("SearXNG search engine",false);return json(res,200,{ok:true,count:results.length});}catch{return json(res,503,{error:"Cannot reach SearXNG or its upstream engines"});}
      }
      if(req.method==="GET"&&path==="/api/token-usage")return json(res,200,models.tokenUsage());
      if(req.method==="GET"&&path==="/api/models")return json(res,200,models.view());
      if(req.method==="PUT"&&path==="/api/models"){
        const patch=await readJson(req,4096);
        if(unavailable())return json(res,409,{error:"Wait for the current reply or memory extraction before switching models."});
        return json(res,200,models.save(patch));
      }
      if (req.method==="GET" && path==="/api/profile")
        return json(res,200,exportCompanionProfile(currentProfile(promptFile,store)));
      if (req.method==="PUT" && path==="/api/profile") {
        const body=await readJson(req,64000);
        let profile;
        try {profile=importCompanionProfile(body);} catch(error) {return json(res,400,{error:error.message});}
        return json(res,200,exportCompanionProfile(store.saveProfile(profile)));
      }
      if (req.method==="GET" && path==="/api/conversations")
        return json(res,200,{conversations:store.conversations()});
      if (req.method==="POST" && path==="/api/conversations") {
        if (unavailable()) return json(res,409,{error:"Mikan is responding"});
        return json(res,201,store.newConversation());
      }
      const match=path.match(/^\/api\/conversations\/([\w-]+)\/messages$/);
      if (req.method==="GET" && match) {
        const items=store.messages(match[1]);
        return items?json(res,200,{messages:items}):json(res,404,{error:"Conversation not found"});
      }
      if(req.method==="GET"&&path==="/api/learning/events"){
        const value=new URL(req.url||"/","http://localhost").searchParams.get("after");
        const after=value===null?null:Number(value);
        if(after!==null&&(!Number.isSafeInteger(after)||after<0))return json(res,400,{error:"Invalid event cursor"});
        return json(res,200,store.learning.events(after));
      }
      const diagnostics=path.match(/^\/api\/learning\/diagnostics\/([\w-]+)$/);
      if(req.method==="GET"&&diagnostics)return json(res,200,{events:store.learning.diagnostics(diagnostics[1])});
      if(req.method==="GET"&&path==="/api/learning")return json(res,200,store.learning.getStatus());
      if(req.method==="PUT"&&path==="/api/learning"){
        const value=await readJson(req,2048);
        return json(res,200,store.learning.setSettings(value));
      }
      if(req.method==="POST"&&path==="/api/learning/retry")return json(res,200,store.learning.retry());
      if(req.method==="POST"&&path==="/api/learning/review"){
        const body=await readJson(req,2048);
        if(unavailable())return json(res,409,{error:"Wait for the current model request"});
        return json(res,200,store.learning.resolve(body.id,body.action));
      }
      if (req.method==="GET" && path==="/api/library")
        return json(res,200,store.library.execute("snapshot",{}));
      if (req.method==="POST" && path==="/api/library") {
        const body=await readJson(req,3500000);
        if(unavailable()) return json(res,409,{error:"Wait for the current model request before changing memories"});
        if(!body||typeof body.action!=="string")return json(res,400,{error:"Invalid memory request"});
        return json(res,200,store.library.execute(body.action,body.args??{}));
      }
      if (req.method==="GET" && path==="/api/memories")
        return json(res,200,{memories:store.listMemories()});
      if (req.method==="POST" && path==="/api/memories") {
        const body=await readJson(req,2048);
        if (typeof body.fact!=="string" || !body.fact.trim() || body.fact.length>800)
          return json(res,400,{error:"Memory must be 1-800 characters"});
        store.addMemory(body.fact);
        return json(res,201,{ok:true});
      }
      const del=path.match(/^\/api\/memories\/(\d+)$/);
      if (req.method==="DELETE" && del) return json(res,200,{removed:store.removeMemory(Number(del[1]))});
      if (req.method==="POST" && path==="/api/chat") {
        if (unavailable()) return json(res,409,{error:store.learning.isRunning()?"Mikan is processing memories. Retry in a moment.":"Mikan is already responding"});
        const body=await readJson(req);
        const question=typeof body.text==="string"?body.text.trim():"";
        const conversationId=body.conversationId;
        if (!question || question.length>4000 || !/^[\w-]{1,100}$/.test(conversationId||""))
          return json(res,400,{error:"Invalid conversation or message (limit: 4000 characters)"});
        if (!store.exists(conversationId)) return json(res,404,{error:"Conversation not found"});
        if (unavailable()) return json(res,409,{error:"Mikan is already responding"});
        const selected=models.active();
        if(!models.available(selected.provider))return json(res,429,{error:"NAS cloud request budget reached. Try again later or select another provider."});
        busy=true;
        let user;const mode=research.get(),trace=turnTrace(mode);
        try {
        const prior=store.messages(conversationId,1)?.at(-1);
        user=store.append(conversationId,"user",question);
        res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8",
          "Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no",
          "X-Content-Type-Options":"nosniff"});
          const {answer,memory,researched}=await executeNasTurn({store,conversationId,question,selected,mode,promptFile,requestModel,trace,publicAgent:research.engine()==="native",search,read:(url,opts)=>knowledge.cachedRead(url,opts),knowledge,
            canRequest:(slots=1)=>models.available(selected.provider,slots),reserve:()=>models.reserve(selected.provider),
            onDelta:part=>sse(res,"delta",{text:part}),activity:event=>{try{store.learning.recordSearch(conversationId,user.id,event);}catch{console.error("Could not record NAS research activity");}}});
          const saved=store.append(conversationId,"assistant",answer,{provider:selected.provider,requestedModel:selected.model,actualModel:trace.actualModel(),outcome:"completed",timing:trace.snapshot(),...(researched.task?{researchTask:researched.task}:{}),...(researched.agentEvidence?.length?{agentEvidence:researched.agentEvidence}:{}),...(researched.sources.length?{sources:researched.sources.map(({content,...source})=>source)}:{})});
          store.library.markRecalled(memory.ids);
          try{store.learning.recordRecall(conversationId,saved.id,memory.auditLines);}catch{console.error('Could not record NAS memory recall activity');}
          try{if(researched.local||store.messages(conversationId,80).some(m=>m.inference?.sources?.some(s=>s.kind==="notion"||s.kind==="cached-web")))store.learning.recordKnowledgeSkip(conversationId,saved.id);else store.learning.enqueue(user,saved,conversationId,prior?.role==="assistant"?prior.content:"");}catch{console.error("Could not queue NAS memory extraction");}
          lastReplyAt=Date.now();
          sse(res,"done",{message:saved});
        } catch(error) {
          // Do not leak upstream response bodies or credentials to the browser.
          const upstreamStatus=Number.isInteger(error?.upstreamStatus)?error.upstreamStatus:null;
          if(user)store.recordInference(user.id,{provider:selected.provider,requestedModel:selected.model,actualModel:trace.actualModel(),outcome:"failed",upstreamStatus,...(typeof error?.code==="string"&&/^[a-zA-Z0-9_-]{1,64}$/.test(error.code)?{errorCode:error.code}:{}),timing:trace.snapshot()});
          console.error("NAS cloud chat failed:",selected.provider,selected.model,upstreamStatus??(typeof error?.code==="string"&&/^[a-zA-Z0-9_-]{1,64}$/.test(error.code)?error.code:"request/stream error"));
          if (!res.headersSent) json(res,500,{error:"Could not prepare the conversation"});
          else sse(res,"error",{error:(upstreamStatus===429||error?.status===429)?"Provider quota reached (HTTP 429). No automatic retry.":"Cloud reply failed ("+selected.provider+(upstreamStatus?" HTTP "+upstreamStatus:"")+"). Check the selected model and provider quota."});
        } finally {
          busy=false;
          res.end();
        }
        return;
      }
      json(res,404,{error:"Not found"});
    } catch(error) {
      console.error("NAS request error:",String(error?.message||error).slice(0,180));
      if (!res.headersSent) json(res,error.status||500,{error:error.status?error.message:"Request failed"});
      else res.end();
    }finally{if(writing)activeWrites--;}
  });
  server.requestTimeout=30000;
  const timer=setInterval(()=>{
    if(maintenance()||unavailable()||Date.now()-lastReplyAt<15000)return;
    let selected;try{selected=models.active();}catch{return;}
    if(!models.available(selected.provider))return;
    void store.learning.processNext(args=>{models.reserve(selected.provider);return requestModel(args,"memory");},selected).catch(()=>console.error("NAS memory worker failed"));
  },15000);
  timer.unref();server.once("close",()=>clearInterval(timer));
  return server;
}

export function startServer(env=process.env) {
  const store=openStore(env.MIKAN_DB_PATH||"/data/mikan-memory.sqlite3");
  const models=providerSettings({env,db:store.db,file:join(dirname(env.MIKAN_DB_PATH||"/data/mikan-memory.sqlite3"),".mikan-provider-settings.json")});
  const knowledge=createKnowledge({db:store.db,read:readWeb,file:join(dirname(env.MIKAN_DB_PATH||"/data/mikan-memory.sqlite3"),".mikan-notion-secret")});
  const server=makeServer({store,models,knowledge,research:researchSettings(store.db),key:env.MIKAN_REMOTE_KEY,
    promptFile:env.MIKAN_SYSTEM_PROMPT_FILE||"/data/persona.txt"});
  const port=Number(env.PORT||3847);
  server.listen(port,"0.0.0.0",()=>console.log("Mikan NAS ready on port "+port+" ("+models.view().provider+")"));
  const shutdown=()=>server.close(()=>{store.db.close();process.exit(0);});
  process.once("SIGTERM",shutdown);
  process.once("SIGINT",shutdown);
  return server;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) startServer();
