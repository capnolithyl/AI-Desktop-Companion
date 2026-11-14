import test from "node:test";
import assert from "node:assert/strict";
import { createDevSupervisor, isExpectedOrigin, formatSupervisorError, UPDATE_BRANCH } from "../scripts/remote-dev-supervisor.mjs";
import { createDevSupervisorClient } from "../server/dev-supervisor-client.mjs";

const SHA_A="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const token="local-test-secret-with-more-than-thirty-two-characters";
function fixture({dirty=false,diverged=false,failBuild=false}={}){
  let head=SHA_A,remote=SHA_B;
  const seen=[],started=[];
  const git=async(...args)=>{
    seen.push("git "+args.join(" "));
    const op=args.join(" ");
    if(op==="branch --show-current")return UPDATE_BRANCH;
    if(op==="remote get-url origin")return "https://github.com/capnolithyl/AI-Desktop-Companion.git";
    if(op==="rev-parse --show-toplevel")return "/repo";
    if(op==="status --porcelain --untracked-files=no")return dirty?" M tracked-file.ts":"";
    if(op==="rev-parse HEAD")return head;
    if(op==="rev-parse refs/remotes/origin/"+UPDATE_BRANCH)return remote;
    if(op.startsWith("fetch --quiet origin"))return "";
    if(op.startsWith("rev-list --count "))return head===remote?"0":"1";
    if(op.startsWith("merge-base --is-ancestor ")){
      if(diverged)throw new Error("not a fast-forward");
      return "";
    }
    if(op.startsWith("diff --name-only "))return "";
    if(op==="merge --ff-only "+remote){head=remote;return ""}
    if(op==="reset --keep "+SHA_A){head=SHA_A;return ""}
    throw new Error("Unexpected git command: "+op);
  };
  const npm=async(...args)=>{
    const op=args.join(" ");
    seen.push("npm "+op);
    if(failBuild && op==="run test:brain")throw new Error("synthetic test failed");
  };
  const supervisor=createDevSupervisor({
    cwd:"/repo",token,git,npm,port:0,
    startChild:(name)=>{started.push(name);return {pid:7,exitCode:null}},
    stopChild:async()=>{},
    relayReady:async()=>{}
  });
  return {supervisor,seen,started,getHead:()=>head};
}
test("remote origin is pinned; no arbitrary repository or URL can be passed",()=>{
  assert.equal(isExpectedOrigin("https://github.com/capnolithyl/AI-Desktop-Companion.git"),true);
  assert.equal(isExpectedOrigin("git@github.com:capnolithyl/AI-Desktop-Companion.git"),true);
  assert.equal(isExpectedOrigin("https://evil.example/capnolithyl/AI-Desktop-Companion"),false);
  assert.equal(isExpectedOrigin("https://github.com/attacker/AI-Desktop-Companion.git"),false);
  assert.equal(isExpectedOrigin("file:///tmp/my-repository"),false);
  assert.equal(createDevSupervisorClient({token:"too-short"}),null);
});
test("the approved fast-forward passes checks and restarts only managed relay by default",async()=>{
  const {supervisor,seen,started,getHead}=fixture();
  await supervisor.inspect();
  assert.equal(supervisor.getState().phase,"ready");
  assert.equal(supervisor.getState().commits,1);
  assert.equal(supervisor.getState().mode,"relay-only");
  await supervisor.apply();
  assert.equal(supervisor.getState().phase,"updated");
  assert.equal(supervisor.getState().current,SHA_B.slice(0,12));
  assert.equal(getHead(),SHA_B);
  assert.deepEqual(started,["server"]);
  assert.ok(seen.includes("npm run test:brain"));
  assert.ok(seen.includes("npm run test:server"));
  assert.ok(!seen.some(s=>/npm run desktop/.test(s)));
});
test("failed validation rolls back without restarting the already running relay",async()=>{
  const {supervisor,seen,getHead,started}=fixture({failBuild:true});
  // Real phone-triggered updates always run in a supervisor that has already
  // started its relay. The old fixture never started it, accidentally
  // exercising the legitimate "recover a missing relay" fallback instead.
  await supervisor.start();
  try{
    assert.deepEqual(started,["server"]);
    await supervisor.inspect();
    await supervisor.apply();
    assert.equal(supervisor.getState().phase,"error");
    assert.match(supervisor.getState().error,/synthetic test failed/);
    assert.equal(getHead(),SHA_A);
    assert.ok(seen.some(x=>x.startsWith("git reset --keep "+SHA_A)));
    assert.ok(seen.includes("npm run build:remote"),"rollback restores prior relay build");
    assert.deepEqual(started,["server"],
      "validation failed before restart, so original managed relay stays alive");
  }finally{
    await supervisor.close();
  }
});

test("rollback restores the relay when no managed relay exists",async()=>{
  const {supervisor,getHead,started}=fixture({failBuild:true});
  // Deliberately model the missing-child recovery case separately.
  await supervisor.inspect();
  await supervisor.apply();
  assert.equal(supervisor.getState().phase,"error");
  assert.equal(getHead(),SHA_A);
  assert.deepEqual(started,["server"],
    "supervisor may launch the restored relay when its child was missing");
});
test("dirty or diverged branches do not execute merge, npm or restart",async()=>{
  for(const options of [{dirty:true},{diverged:true}]){
    const {supervisor,seen}=fixture(options);
    await supervisor.inspect();
    assert.equal(supervisor.getState().phase,"error");
    await assert.rejects(supervisor.apply(),/Check for updates first/);
    assert.ok(!seen.some(x=>x.startsWith("git merge ")));
    assert.ok(!seen.some(x=>x.startsWith("npm ")));
  }
});
test("loopback supervisor denies requests lacking its separate private token",async()=>{
  const {supervisor}=fixture();
  const {server}=supervisor;
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const url="http://127.0.0.1:"+server.address().port;
    assert.equal((await fetch(url+"/status")).status,403);
    assert.equal((await fetch(url+"/status",{headers:{"X-Mikan-Supervisor":"wrong"}})).status,403);
    const status=await fetch(url+"/status",{headers:{"X-Mikan-Supervisor":token}});
    assert.equal(status.status,200);
    assert.equal((await status.json()).mode,"relay-only");
    assert.equal((await fetch(url+"/run",{method:"POST",
      headers:{"X-Mikan-Supervisor":token}})).status,404);
    const check=await fetch(url+"/check",{method:"POST",
      headers:{"X-Mikan-Supervisor":token}});
    assert.equal(check.status,202);
    // Poll until fake local git check has settled.
    for(let i=0;i<25&&supervisor.getState().phase==="checking";i++)
      await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(supervisor.getState().phase,"ready");
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
test("proxy client forwards only fixed method and endpoint with private header",async()=>{
  const observed=[];
  const client=createDevSupervisorClient({
    token,base:"http://127.0.0.1:3849",
    transport:async(url,options)=>{
      observed.push({url,...options});
      return {ok:true,json:async()=>({available:true,phase:"ready"})};
    }
  });
  assert.equal((await client.status()).phase,"ready");
  await client.check();
  await client.apply();
  assert.deepEqual(observed.map(x=>x.url.split("/").at(-1)),["status","check","apply"]);
  assert.deepEqual(observed.map(x=>x.method),["GET","POST","POST"]);
  assert.ok(observed.every(x=>x.headers["X-Mikan-Supervisor"]===token));
});

test("updater reports the failing TAP assertion rather than a generic npm command",()=>{
  const error=new Error("Command failed: node.exe npm-cli.js run test:server");
  error.stdout=[
    "> mikan-desktop-companion@0.9.8 test:server",
    "# Subtest: public relay test",
    "not ok 3 - public relay test",
    "  ---",
    "  error: expected status 200 but received 409",
    "  ..."
  ].join("\n");
  error.stderr="";
  const message=formatSupervisorError(error);
  assert.match(message,/not ok 3 - public relay test/);
  assert.match(message,/expected status 200 but received 409/);
  assert.doesNotMatch(message,/Command failed: node.exe/);
});
