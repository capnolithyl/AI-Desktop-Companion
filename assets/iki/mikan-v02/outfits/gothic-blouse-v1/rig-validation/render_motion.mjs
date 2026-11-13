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
 const steps=Array.from({length:721},(_,i)=>{const t=i/60;const wave=t<6?0:Math.sin(2*Math.PI*(t-6)/6);return {ParamAmbientSway:Math.sin(2*Math.PI*.23*t),ParamBreath:(1-Math.cos(2*Math.PI*.2*t))*.25,ParamAngleZ:30*wave,ParamBodyAngleZ:10*wave};});
 const report={engineBundle:bundle,fps:12,durationSeconds:12,description:'0-6 seconds ambient idle; 6-12 seconds combined head/body tilts. Actual engine physics, 60 Hz.',versions:{}};
 for(const version of ['original','gothic-blouse']){
  await evaluate('document.body.innerHTML=""');
  await evaluate(fs.readFileSync(bundle,'utf8'));
  const model=JSON.parse(fs.readFileSync(path.join(root,version==='original'?'../../../iki-ready/mikan-auto-rig-v3.iki':'../mikan-gothic-blouse-v1.iki'),'utf8'));
  const loaded=await evaluate(`window.__ikiRender.load(${JSON.stringify(model)},{canvas:{width:560,height:560}})`);
  if(loaded.failedTextures.length)throw Error('Texture load failure');
  const outputs=model.physics.map(p=>p.output.parameter);
  const selected=[0,18,36,54,72,90,108,126,143];
  const spec={parameters:Object.keys(steps[0]),steps,frameMs:1000/60*(1+1e-9),warmup:120,captureEvery:5,frames:144,frame:{width:560,height:560},physicsOutputs:outputs,sheet:{frames:selected,cell:{w:280,h:280},margin:10,labelBand:24,labels:selected.map(i=>`${(i/12).toFixed(2)} seconds`)}};
  await evaluate(`window.__ikiRender.sweepBegin(${JSON.stringify(spec)})`);
  const dir=path.join(root,`motion-v${version}`);fs.mkdirSync(dir,{recursive:true});const frames=[];
  for(let k=0;k<144;k++){
   const shot=await evaluate('window.__ikiRender.sweepFrame()');
   fs.writeFileSync(path.join(dir,`frame-${String(k).padStart(3,'0')}.png`),Buffer.from(shot.png.split(',')[1],'base64'));
   frames.push({t:k/12,values:shot.values});
  }
  const summary=await evaluate('window.__ikiRender.sweepEnd()');
  fs.writeFileSync(path.join(root,`motion-v${version}-sheet.png`),Buffer.from(summary.sheet.split(',')[1],'base64'));
  report.versions[version]={failedTextures:loaded.failedTextures,frames};
  console.log(`Rendered v${version}: 144 live physics frames`);
 }
 fs.writeFileSync(path.join(root,'motion-validation.json'),JSON.stringify(report,null,2));
 await send('Browser.close');
} finally {
 socket?.close(); child.kill();
 await new Promise(resolve=>setTimeout(resolve,1000));
 // Delete only the unique profile created by this run, inside the OS temp dir.
 const resolved=path.resolve(profile),tmp=path.resolve(os.tmpdir());
 if(path.dirname(resolved)!==tmp || !path.basename(resolved).startsWith('mikan-v3-render-'))throw Error('Unsafe profile cleanup path');
 try { fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:300}); } catch(e) { console.warn('Capture complete; temporary profile cleanup: '+e.code); }
}
