/** Native Android wrapper has an origin-scoped, write-only document picker.
 * Browsers keep ordinary JSON downloads. Never send the export elsewhere. */
export function saveNasJson(filename:string,value:unknown){
  const text=JSON.stringify(value,null,2);
  if(new Blob([text]).size>8*1024*1024)throw new Error("JSON export exceeds 8 MB. No messages were truncated.");
  const bridge=(window as Window&{MikanJsonExport?:{postMessage:(message:string)=>void}}).MikanJsonExport;
  if(bridge&&typeof bridge.postMessage==="function"){
    bridge.postMessage(JSON.stringify({filename,text}));
    return "native" as const;
  }
  const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  return "browser" as const;
}
