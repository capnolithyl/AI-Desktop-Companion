// Uses the installed Iki renderer and its actual IkiMotion physics clock.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const bundle=process.env.IKI_RENDER_BUNDLE ?? 'C:/Users/marcu/AppData/Local/npm-cache/_npx/9914f1ebc890932f/node_modules/@ikijs/mcp/dist/render-page.global.js';
const chrome=process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mikan-v3-render-'));
const child=spawn(chrome,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--force-device-scale-factor=1','--enable-unsafe-swiftshader','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
try {
 const endpoint=await new Promise((resolve,reject)=>{let output=''; const timeout=setTimeout(()=>reject(Error('Chrome startup timeout')),30000);child.on('error',reject);child.stderr.on('data',b=>{output+=b;const m=/DevTools listening on (ws:\/\/\S+)/.exec(output);if(m){clearTimeout(timeout);resolve(m[1]);}});});
 socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let nextId=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,sessionId}));});}
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
 const poses=JSON.parse(fs.readFileSync(path.join(root,'poses.json'),'utf8'));
 const report={};
 for(const version of ['original','gothic-blouse']){
  const model=JSON.parse(fs.readFileSync(path.join(root,version==='original'?'../../../iki-ready/mikan-auto-rig-v3.iki':'../mikan-gothic-blouse-v1.iki'),'utf8'));
  report[version]={};
  for(const framing of ['detail','desktop']){
   await evaluate('document.body.innerHTML=""');await evaluate(fs.readFileSync(bundle,'utf8'));
   const options=framing==='detail'?{canvas:{width:1280,height:1280}}:{canvas:{width:514,height:472},view:{x:0,y:110,width:1150,height:1050}};
   report[version][framing]=await evaluate(`window.__ikiRender.load(${JSON.stringify(model)},${JSON.stringify(options)})`);
   const dir=path.join(root,`${framing}-${version}`);fs.mkdirSync(dir,{recursive:true});
   for(const pose of poses){
    const png=await evaluate(`window.__ikiRender.capture(${JSON.stringify(pose.values)})`);
    fs.writeFileSync(path.join(dir,pose.name+'.png'),Buffer.from(png.split(',')[1],'base64'));
   }
  }
  console.log('Detailed and desktop renders: '+version);
 }
 fs.writeFileSync(path.join(root,'detail-validation.json'),JSON.stringify(report,null,2));
 await send('Browser.close');
} finally {
 socket?.close(); child.kill();
 await new Promise(resolve=>setTimeout(resolve,1000));
 // Delete only the unique profile created by this run, inside the OS temp dir.
 const resolved=path.resolve(profile),tmp=path.resolve(os.tmpdir());
 if(path.dirname(resolved)!==tmp || !path.basename(resolved).startsWith('mikan-v3-render-'))throw Error('Unsafe profile cleanup path');
 try { fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:300}); } catch(e) { console.warn('Capture complete; temporary profile cleanup: '+e.code); }
}
