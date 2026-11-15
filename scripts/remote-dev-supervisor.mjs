/**
 * Mikan's opt-in LOCAL development supervisor.
 *
 * Remote browser -> authenticated relay (3847) -> private token -> localhost
 * supervisor (3849). Never expose port 3849 or pass arbitrary commands/paths.
 *
 * The supervisor manages its own relay child and, ONLY with --desktop, its
 * own Tauri dev child. It never kills a separately installed Mikan instance.
 */
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const UPDATE_PORT=3849;
export const UPDATE_BRANCH="feature/p0-brain-evaluation-harness";
export const UPDATE_REPO="capnolithyl/AI-Desktop-Companion";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const exec=promisify(execFile);
const allowedPhases=new Set(["idle","checking","ready","up-to-date","updating","restarting","updated","error"]);
const terminalPhases=new Set(["ready","up-to-date","updated","error"]);
/** Probe the relay on loopback without recording a fake desktop heartbeat. */
export async function loopbackDesktopReady(after=0){
  try{
    const response=await fetch("http://127.0.0.1:3848/agent/health",{
      headers:{"X-Mikan-Agent":"desktop"},signal:AbortSignal.timeout(1200),
      cache:"no-store"
    });
    if(!response.ok)return false;
    const health=await response.json();
    return health.connected===true && Number(health.lastSeen)>after;
  }catch{return false}
}
function diagnosticTail(value){
  return String(value||"").replace(/\u001b\[[0-9;]*[A-Za-z]/g,"")
    .replace(/(Bearer\s+)[^\s]+/gi,"$1[redacted]")
    .replace(/(\b(?:password|secret|token|api[_-]?key)\s*[=:]\s*)[^\s]+/gi,"$1[redacted]")
    .slice(-1200);
}
/** Extract the actual failing TAP test from npm's captured stdout.
 * execFile's error.message only says "Command failed: node ... npm-cli.js",
 * which concealed the useful failure from remote phone users. */
export function formatSupervisorError(error){
  const stdout=String(error?.stdout||"");
  const stderr=String(error?.stderr||"");
  const combined=(stdout+"\n"+stderr).trim();
  const failures=[...combined.matchAll(/(?:^|\n)not ok\s+\d+[^\n]*/g)];
  if(failures.length){
    const at=failures[0].index??0;
    return combined.slice(at,at+1600).trim();
  }
  const excerpt=combined.trim();
  if(excerpt)return excerpt.slice(-1400);
  return String(error?.message||error).trim().slice(-1400);
}
const formatError=formatSupervisorError;
function sleep(ms){return new Promise(ok=>setTimeout(ok,ms))}
async function command(exe,args,{cwd=ROOT,timeout=120000}={}){
  try{
    const {stdout}=await exec(exe,args,{cwd,timeout,windowsHide:true,maxBuffer:2_000_000});
    return String(stdout).trim();
  }catch(error){throw new Error(formatError(error))}
}
/** npm ci is necessary for dependency-graph changes, not package version bumps.
 * Compare the full lock graph, ignoring only the root package's own version,
 * and the dependency-relevant manifest fields. Conservative on malformed data. */
export function needsDependencyInstall(oldManifest,newManifest,oldLock,newLock){
  try{
    const previous=JSON.parse(oldManifest);
    const next=JSON.parse(newManifest);
    const pick=p=>({
      dependencies:p.dependencies??{},
      devDependencies:p.devDependencies??{},
      optionalDependencies:p.optionalDependencies??{},
      peerDependencies:p.peerDependencies??{},
      peerDependenciesMeta:p.peerDependenciesMeta??{},
      bundleDependencies:p.bundleDependencies??p.bundledDependencies??[],
      overrides:p.overrides??{},
      workspaces:p.workspaces??null,
      engines:p.engines??{},
      os:p.os??null,cpu:p.cpu??null,libc:p.libc??null,
      packageManager:p.packageManager??null,
      installScripts:Object.fromEntries(
        ["preinstall","install","postinstall","prepare"].filter(k=>p.scripts?.[k])
          .map(k=>[k,p.scripts[k]])
      )
    });
    if(JSON.stringify(pick(previous))!==JSON.stringify(pick(next)))return true;
    const a=JSON.parse(oldLock),b=JSON.parse(newLock);
    delete a.version;delete b.version;
    if(a.packages?.[""])delete a.packages[""].version;
    if(b.packages?.[""])delete b.packages[""].version;
    return JSON.stringify(a)!==JSON.stringify(b);
  }catch{
    // Never silently skip installation when dependency metadata can't be read.
    return true;
  }
}
export function isExpectedOrigin(remote){
  return /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)capnolithyl\/AI-Desktop-Companion(?:\.git)?\/?$/i.test(remote.trim());
}
export function safeSupervisorState(state){
  return {
    available:true,
    phase:allowedPhases.has(state.phase)?state.phase:"error",
    branch:UPDATE_BRANCH,
    mode:state.mode==="desktop-and-relay"?"desktop-and-relay":"relay-only",
    current:state.current||null,
    remote:state.remote||null,
    commits:state.commits??null,
    checkedAt:state.checkedAt||null,
    step:state.step||"",
    error:state.error||null,
    desktopState:state.desktopState||"not-managed",
    desktopConnected:state.desktopConnected===true,
    managedDesktopRunning:state.managedDesktopRunning===true,
    desktopExit:state.desktopExit||null,
    desktopLog:state.desktopConnected?null:diagnosticTail(state.desktopLog),
    desktopNote:state.mode==="desktop-and-relay"
      ?"The supervisor manages npm run desktop and the relay."
      :"Only the browser relay is managed. An installed desktop .exe is not updated."
  };
}

/**
 * Dependency-injected command runner and managed services keep tests isolated
 * from a real git checkout and the Windows processes.
 */
export function createDevSupervisor({
  cwd=ROOT,token=randomBytes(32).toString("hex"),
  manageDesktop=false,port=UPDATE_PORT,
  git=(...args)=>command("git",args,{cwd}),
  npm=(...args)=>{
    if(!process.env.npm_execpath)throw new Error("Start through npm run remote:dev");
    return command(process.execPath,[process.env.npm_execpath,...args],{cwd,timeout:210000});
  },
  startChild=null,stopChild=null,
  /** Injected for tests; only fixed Cargo check args are executed. */
  cargoCheck=()=>command("cargo",["check","--locked","--manifest-path","src-tauri/Cargo.toml"],
    {cwd,timeout:420000}),
  relayReady=null,
  desktopReady=loopbackDesktopReady,
  desktopReadyAttempts=180,desktopRetryMs=1000
}={}){
  if(token.length<32)throw new Error("A private supervisor token is required");
  const mode=manageDesktop?"desktop-and-relay":"relay-only";
  let state={phase:"idle",mode,current:null,remote:null,commits:null,
    checkedAt:null,step:"No check performed yet",error:null,
    desktopState:manageDesktop?"not-started":"not-managed",desktopConnected:false,
    managedDesktopRunning:false,desktopExit:null,desktopLog:null};
  let running=false;
  let relay=null,desktop=null;
  let desktopLaunchedAt=0;
  let expectedHead=null,expectedRemote=null;
  let stopping=false;
  const publish=changes=>{state={...state,...changes};};
  const repoGit=(...args)=>git(...args);
  const npmRun=script=>npm("run",script);

  async function dependencyChangesBetween(before,after){
    const changed=(await repoGit("diff","--name-only",before,after,
      "--","package.json","package-lock.json")).trim();
    if(!changed)return false;
    const [oldManifest,newManifest,oldLock,newLock]=await Promise.all([
      repoGit("show",before+":package.json"),
      repoGit("show",after+":package.json"),
      repoGit("show",before+":package-lock.json"),
      repoGit("show",after+":package-lock.json")
    ]);
    return needsDependencyInstall(oldManifest,newManifest,oldLock,newLock);
  }

  async function assertCheckout(){
    const [branch,origin,root,changes]=await Promise.all([
      repoGit("branch","--show-current"),
      repoGit("remote","get-url","origin"),
      repoGit("rev-parse","--show-toplevel"),
      repoGit("status","--porcelain","--untracked-files=no")
    ]);
    if(branch!==UPDATE_BRANCH)throw new Error("Switch to "+UPDATE_BRANCH+" on Windows first");
    if(!isExpectedOrigin(origin))throw new Error("Origin must be the approved AI-Desktop-Companion GitHub repository");
    if(resolve(root).toLowerCase()!==resolve(cwd).toLowerCase())
      throw new Error("The supervisor must run in the repository root");
    if(changes.trim())throw new Error("Uncommitted tracked changes found. Commit or stash them on Windows before updating.");
  }

  function launch(name){
    if(name==="desktop"){
      desktopLaunchedAt=Date.now();
      publish({desktopState:"starting",desktopConnected:false,
        managedDesktopRunning:true,desktopExit:null,desktopLog:null});
    }
    if(startChild)return startChild(name);
    if(!process.env.npm_execpath)throw new Error("Start through npm run remote:dev");
    const child=spawn(process.execPath,[process.env.npm_execpath,"run",name],{
      cwd,env:{...process.env,MIKAN_DEV_SUPERVISOR_TOKEN:token},
      windowsHide:true,stdio:name==="desktop"?["ignore","pipe","pipe"]:"inherit"
    });
    if(name==="desktop"){
      // Retain only a short, scrubbed diagnostic tail. Do not expose terminal
      // history, arbitrary commands or complete process logs to the phone.
      const collect=(chunk,output)=>{
        output.write(chunk);
        publish({desktopLog:diagnosticTail((state.desktopLog||"")+chunk.toString("utf8"))});
      };
      child.stdout?.on("data",chunk=>collect(chunk,process.stdout));
      child.stderr?.on("data",chunk=>collect(chunk,process.stderr));
    }
    child.on("error",error=>{
      const message="Managed "+name+" could not start: "+formatError(error);
      if(name==="desktop")publish({desktopState:"exited",desktopConnected:false,
        desktopExit:"spawn error",desktopLog:diagnosticTail(message)});
      publish({step:message});
    });
    child.on("exit",(code,signal)=>{
      if(!stopping){
        const exit=String(signal??code??"unknown");
        if(name==="desktop")publish({desktopState:"exited",desktopConnected:false,
          managedDesktopRunning:false,desktopExit:exit});
        publish({step:"Managed "+name+" stopped ("+exit+"). Use Restart desktop from your phone if needed."});
      }
    });
    return child;
  }
  async function terminate(child){
    if(!child)return;
    if(stopChild)return stopChild(child);
    if(!child.pid||child.exitCode!==null)return;
    if(process.platform==="win32"){
      try{await command("taskkill",["/PID",String(child.pid),"/T","/F"],{cwd,timeout:10000})}
      catch{try{child.kill()}catch{}}
    }else{
      try{child.kill("SIGTERM")}catch{}
    }
    await Promise.race([new Promise(done=>child.once("exit",done)),sleep(3500)]);
  }
  async function waitRelay(){
    if(relayReady)return relayReady();
    for(let i=0;i<50;i++){
      if(relay?.exitCode!==null)throw new Error("Browser relay exited unexpectedly");
      try{
        const resp=await fetch("http://127.0.0.1:3847/",{
          signal:AbortSignal.timeout(1200),headers:{"Host":"127.0.0.1:3847"}
        });
        if(resp.ok)return;
      }catch{/* Still building the avatar bundle */}
      await sleep(550);
    }
    throw new Error("Browser relay never became healthy on 127.0.0.1:3847");
  }
  async function refreshDesktopHealth(){
    if(!manageDesktop)return;
    const managedRunning=!!desktop && desktop.exitCode===null;
    // Mirror the browser relay's real heartbeat for its connection badge.
    // The stricter launch-time gate is ONLY for waitForDesktop(), where it
    // proves that a restarted managed process came online.
    const connected=await desktopReady(0);
    publish({
      desktopConnected:connected,managedDesktopRunning:managedRunning,
      desktopState:connected?"online"
        :managedRunning?(state.desktopState==="offline"?"offline":"starting"):"exited",
      ...(!managedRunning&&desktop?.exitCode!=null?{
        desktopExit:String(desktop.exitCode)
      }:{})
    });
  }
  async function waitForDesktop(){
    if(!manageDesktop)return;
    for(let attempt=0;attempt<desktopReadyAttempts;attempt++){
      if(!desktop || desktop.exitCode!==null)
        throw new Error("Managed Tauri desktop process exited "+
          (state.desktopExit??desktop?.exitCode??"unexpectedly")+
          ". Recent startup output: "+(state.desktopLog??"(none)"));
      if(await desktopReady(desktopLaunchedAt)){
        publish({desktopState:"online",desktopConnected:true,desktopExit:null});
        return;
      }
      if(attempt%10===0)publish({desktopState:"starting",desktopConnected:false,
        step:"Waiting for the managed desktop to reconnect to the browser relay"});
      await sleep(desktopRetryMs);
    }
    throw new Error("Managed Tauri desktop did not reconnect to the relay. "+
      "Recent startup output: "+(state.desktopLog??"(none)"));
  }
  async function restartDesktop(){
    if(!manageDesktop)throw new Error("This supervisor only manages the browser relay");
    if(running)throw new Error("An update or restart is already running");
    running=true;
    publish({phase:"restarting",step:"Restarting ONLY the supervisor-managed desktop",
      error:null,desktopConnected:false});
    try{
      stopping=true;
      await terminate(desktop);
      desktop=null;
      stopping=false;
      desktop=launch("desktop");
      await waitForDesktop();
      publish({phase:"updated",step:"Managed desktop reconnected. Browser relay stayed online.",
        error:null,desktopConnected:true});
    }catch(error){
      publish({phase:"error",desktopState:"offline",desktopConnected:false,
        step:"Desktop restart failed. The browser relay remains online.",
        error:formatError(error)});
    }finally{stopping=false;running=false}
  }

  async function stopManagedChildren(){
    stopping=true;
    try{
      if(manageDesktop){await terminate(desktop);desktop=null}
      await terminate(relay);relay=null;
    }finally{stopping=false}
  }
  async function restartChildren(){
    publish({phase:"restarting",step:"Restarting managed browser relay"});
    await stopManagedChildren();
    relay=launch("server");
    await waitRelay();
    if(manageDesktop){
      publish({step:"Starting managed Tauri desktop (requires MSVC Build Tools)"});
      desktop=launch("desktop");
    }
  }

  async function inspect(){
    if(running)throw new Error("An update/check is already running");
    running=true;expectedHead=null;expectedRemote=null;
    publish({phase:"checking",step:"Checking approved Git branch",error:null});
    try{
      await assertCheckout();
      const head=await repoGit("rev-parse","HEAD");
      publish({step:"Fetching the pinned GitHub feature branch"});
      await repoGit("fetch","--quiet","origin",
        "refs/heads/"+UPDATE_BRANCH+":refs/remotes/origin/"+UPDATE_BRANCH);
      const remote=await repoGit("rev-parse","refs/remotes/origin/"+UPDATE_BRANCH);
      const previous=(await repoGit("rev-list","--count",head+".."+remote)).trim();
      // Rev-list alone is insufficient: reject diverged or rewound branches.
      await repoGit("merge-base","--is-ancestor",head,remote);
      const commits=Number(previous);
      expectedHead=head;expectedRemote=remote;
      publish({
        current:head.slice(0,12),remote:remote.slice(0,12),
        commits,checkedAt:new Date().toISOString(),
        phase:commits?"ready":"up-to-date",
        step:commits?commits+" new commit(s) available. Ready for confirmation."
          :"Already up to date. Nothing will be restarted."
      });
    }catch(error){publish({phase:"error",error:formatError(error),step:"Update check failed"})}
    finally{running=false}
  }

  async function apply(){
    if(running)throw new Error("An update/check is already running");
    if(state.phase!=="ready"||!expectedHead||!expectedRemote)
      throw new Error("Check for updates first; there is no confirmed fast-forward update");
    if(Date.now()-Date.parse(state.checkedAt)>600000)
      throw new Error("Update check expired. Check again before applying.");
    running=true;
    const before=expectedHead,after=expectedRemote;
    publish({phase:"updating",error:null,step:"Rechecking repository state"});
    let merged=false,restartAttempted=false;
    let dependenciesChanged=false,dependenciesInstallAttempted=false;
    let childrenStoppedForInstall=false;
    try{
      await assertCheckout();
      const actual=await repoGit("rev-parse","HEAD");
      if(actual!==before)throw new Error("Local HEAD changed since approval. Check updates again.");
      const fetched=await repoGit("rev-parse","refs/remotes/origin/"+UPDATE_BRANCH);
      if(fetched!==after)throw new Error("Remote branch moved. Check updates again.");
      dependenciesChanged=await dependencyChangesBetween(before,after);
      const nativePaths=(await repoGit(
        "diff","--name-only",before,after,"--","src-tauri"
      )).split("\n").filter(Boolean);
      // Each patch-version bump also edits Cargo metadata and Tauri's
      // version-only config. Avoid recompiling Rust for those changes.
      // Actual native source or build-script changes do require a check.
      const rustChanged=manageDesktop && nativePaths.some(path=>
        path.startsWith("src-tauri/src/") || path==="src-tauri/build.rs"
      );
      publish({step:"Fast-forwarding approved branch"});
      await repoGit("merge","--ff-only",after);
      merged=true;
      if(dependenciesChanged){
        publish({step:"Stopping managed desktop and browser relay before npm dependency installation"});
        await stopManagedChildren();
        childrenStoppedForInstall=true;
        publish({step:"Installing changed JavaScript dependencies"});
        dependenciesInstallAttempted=true;
        await npm("ci","--ignore-scripts","--no-audit","--no-fund");
      }
      publish({step:"Building and checking desktop frontend (no Rust compile)"});
      await npmRun("build");
      publish({step:"Running isolated Brain Lab regression tests"});
      await npmRun("test:brain");
      publish({step:"Building and testing authenticated browser relay"});
      await npmRun("test:server");
      if(rustChanged){
        publish({step:"Checking changed native Tauri/Rust source before restarting desktop"});
        await cargoCheck();
      }
      restartAttempted=true;
      await restartChildren();
      if(manageDesktop){
        try{await waitForDesktop()}catch(startupError){
          // Builds/tests and the new relay are healthy. Keep this verified
          // checkout so the owner can retry the desktop from their phone,
          // rather than rolling back the only recovery controls.
          expectedHead=null;expectedRemote=null;
          publish({phase:"error",current:after.slice(0,12),
            commits:0,checkedAt:new Date().toISOString(),
            desktopState:"offline",desktopConnected:false,
            step:"Source updated and tested, but the desktop failed to connect. "+
              "Use Restart desktop on your phone. No rollback of the verified source.",
            error:formatError(startupError)});
          return;
        }
      }
      expectedHead=null;expectedRemote=null;
      publish({phase:"updated",current:after.slice(0,12),
        commits:0,checkedAt:new Date().toISOString(),error:null,
        step:manageDesktop
          ?"Updated source, tests passed and the managed desktop reconnected."
          :"Source and browser relay updated and verified. Installed Mikan desktop is unchanged."});
    }catch(error){
      const failure=formatError(error);
      publish({step:"Update failed; restoring the previous checked-out commit",error:failure});
      if(merged){
        try{
          // --keep refuses to discard tracked edits made after the clean preflight.
          await repoGit("reset","--keep",before);
          let restoredDependencies=true;
          if(dependenciesInstallAttempted){
            try{
              publish({step:"Restoring previous dependency set after failed update"});
              await npm("ci","--ignore-scripts","--no-audit","--no-fund");
            }catch(dependencyError){
              restoredDependencies=false;
              publish({error:failure+"; rollback dependency install failed: "+
                formatError(dependencyError)});
            }
          }
          if(restoredDependencies){
            try{await npmRun("build:remote")}catch{}
            // Prior managed processes are still active unless we stopped them
            // for a genuine dependency update or entered the restart phase.
            if(childrenStoppedForInstall || restartAttempted || !relay || relay.exitCode!==null){
              try{await restartChildren()}catch(restartError){
                publish({step:"Old source restored but relay restart failed: "+formatError(restartError)});
              }
            }
          }
          publish({phase:"error",current:before.slice(0,12),
            step:restoredDependencies
              ?"Update failed and Git checkout was rolled back; managed services recovered where possible."
              :"Git checkout rolled back, but node_modules requires repair on Windows."});
        }catch(rollbackError){
          publish({phase:"error",step:"Rollback requires attention on the PC: "+
            formatError(rollbackError)});
        }
      }else publish({phase:"error",step:"Update did not change the local branch."});
      expectedHead=null;expectedRemote=null;
    }finally{running=false}
  }

  const authorized=request=>{
    const supplied=request.headers["x-mikan-supervisor"];
    if(typeof supplied!=="string")return false;
    const a=Buffer.from(supplied),b=Buffer.from(token);
    return a.length===b.length&&timingSafeEqual(a,b);
  };
  const server=createServer((request,response)=>{
    const send=(code,body)=>{
      response.writeHead(code,{"Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
      response.end(JSON.stringify(body));
    };
    if(request.socket.remoteAddress!=="127.0.0.1" || request.headers.origin)
      return send(403,{error:"Local relay only"});
    if(!authorized(request))return send(403,{error:"Private supervisor authentication required"});
    const path=new URL(request.url||"/","http://127.0.0.1").pathname;
    if(request.method==="GET"&&path==="/status"){
      // Fresh health sample, not an invented desktop heartbeat.
      void refreshDesktopHealth().catch(()=>{}).then(()=>send(200,safeSupervisorState(state)));
      return;
    }
    if(request.method==="POST"&&path==="/check"){
      if(running)return send(409,{error:"Updater already working"});
      void inspect();
      return send(202,{accepted:true});
    }
    if(request.method==="POST"&&path==="/apply"){
      if(running)return send(409,{error:"Updater already working"});
      if(state.phase!=="ready")return send(409,{error:"Check for updates first"});
      void apply();
      return send(202,{accepted:true});
    }
    if(request.method==="POST"&&path==="/restart-desktop"){
      if(!manageDesktop)return send(409,{error:"The desktop is not supervisor-managed"});
      if(running)return send(409,{error:"Updater already working"});
      void restartDesktop();
      return send(202,{accepted:true});
    }
    send(404,{error:"Not found"});
  });

  async function start(){
    await new Promise((yes,no)=>{
      server.once("error",no);
      server.listen(port,"127.0.0.1",()=>{
        server.removeListener("error",no);yes();
      });
    });
    try{
      if(!startChild){
        // A previously launched standalone npm run server owns these ports.
        // Never kill unmanaged processes just to take control.
        try{
          const resp=await fetch("http://127.0.0.1:3847/",{
            signal:AbortSignal.timeout(600)});
          if(resp.status)throw new Error(
            "Port 3847 is in use. Stop the old npm run server before starting remote:dev.");
        }catch(error){
          if(String(error.message||error).includes("Port 3847"))throw error;
        }
      }
      relay=launch("server");
      await waitRelay();
      if(manageDesktop){
        desktop=launch("desktop");
        // The relay and supervisor are usable during a cold Tauri build.
        // Report a failed initial start instead of leaving "starting" forever.
        if(!startChild)void waitForDesktop().catch(error=>publish({desktopState:"offline",
          desktopConnected:false,step:"Desktop did not connect after launch.",
          error:formatError(error)}));
      }
      publish({step:"Supervisor online. Check GitHub updates from your phone."});
    }catch(error){await close();throw error}
  }
  async function close(){
    stopping=true;
    await terminate(desktop);desktop=null;
    await terminate(relay);relay=null;
    await new Promise(done=>server.close(()=>done()));
  }
  return {
    server,start,close,getState:()=>safeSupervisorState(state),inspect,apply,restartDesktop
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const desktop=process.argv.includes("--desktop");
  const supervisor=createDevSupervisor({manageDesktop:desktop});
  process.on("SIGINT",()=>{void supervisor.close().finally(()=>process.exit(0))});
  process.on("SIGTERM",()=>{void supervisor.close().finally(()=>process.exit(0))});
  try{
    await supervisor.start();
    console.log("Mikan development supervisor active on localhost port "+UPDATE_PORT+
      " (NEVER expose this port).");
    console.log("Browser relay: http://127.0.0.1:3847");
    console.log(desktop?"Managing relay + Tauri development desktop.":
      "Managing relay only. Installed Mikan .exe is not changed by Git updates.");
  }catch(error){
    console.error("Development supervisor could not start: "+formatError(error));
    process.exitCode=1;
  }
}
