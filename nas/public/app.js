const $ = id => document.getElementById(id);
let key=sessionStorage.getItem("mikan-nas-key")||"";
let currentId=localStorage.getItem("mikan-nas-chat")||"";
let busy=false;
const gate=$("gate"), chats=$("chats"), messages=$("messages"), prompt=$("prompt");

async function api(path, options={}) {
  const response=await fetch(path,{...options,headers:{Authorization:"Bearer "+key,...(options.body?{"Content-Type":"application/json"}:{}),...options.headers}});
  if (!response.ok) {
    let body={};
    try{body=await response.json();}catch{}
    throw new Error(body.error||"Request failed ("+response.status+")");
  }
  return response;
}
async function result(path,options={}) {return (await api(path,options)).json();}
function notify(message=""){$("notice").textContent=message;}
function bubble(role,text,waiting=false) {
  const item=document.createElement("div");
  item.className="bubble "+role+(waiting?" waiting":"");
  if(role==="assistant"){
    const title=document.createElement("span");title.className="name";title.textContent="Mikan";item.append(title);
  }
  const body=document.createElement("span");body.textContent=text;item.append(body);
  messages.append(item);messages.scrollTop=messages.scrollHeight;
  return {item,body};
}
function showMessages(rows){
  messages.replaceChildren();
  if(!rows.length){const welcome=document.createElement("p");welcome.className="welcome";welcome.textContent="Beholder is awake. What shall we talk about? 🐾";messages.append(welcome);}
  else for(const m of rows)bubble(m.role,m.content);
  messages.scrollTop=messages.scrollHeight;
}
async function loadChats(){
  const data=await result("/api/conversations");
  chats.replaceChildren();
  for(const chat of data.conversations){
    const button=document.createElement("button");button.className="chat-item"+(currentId===chat.id?" active":"");
    button.textContent=chat.title;button.title=chat.title;button.dataset.id=chat.id;
    button.addEventListener("click",()=>selectChat(chat.id));
    chats.append(button);
  }
  if(currentId && !data.conversations.some(c=>c.id===currentId)) currentId="";
  if(!currentId && data.conversations.length) currentId=data.conversations[0].id;
  if(!currentId) {
    const created=await result("/api/conversations",{method:"POST",body:"{}"});
    currentId=created.id;return loadChats();
  }
  localStorage.setItem("mikan-nas-chat",currentId);
  chats.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.id===currentId));
}
async function selectChat(id){
  if(busy)return;
  currentId=id;localStorage.setItem("mikan-nas-chat",id);
  const data=await result("/api/conversations/"+encodeURIComponent(id)+"/messages");
  showMessages(data.messages);await loadChats();$("sidebar").classList.remove("open");
}
async function loadMemories() {
  const rows=(await result("/api/memories")).memories;
  $("memories").replaceChildren();
  for(const memory of rows){
    const div=document.createElement("div");div.className="memory";
    const span=document.createElement("span");span.textContent=memory.fact;
    const button=document.createElement("button");button.textContent="×";button.title="Delete this fact";
    button.addEventListener("click",async()=>{
      if(!confirm("Delete this saved fact?"))return;
      await api("/api/memories/"+memory.id,{method:"DELETE"});await loadMemories();
    });
    div.append(span,button);$("memories").append(div);
  }
}
async function boot(){
  try{
    const info=await result("/api/status");
    $("status").textContent="Beholder · "+info.provider+" · "+info.model;
    await loadChats();await selectChat(currentId);await loadMemories();
    gate.hidden=true;notify("");
  }catch(error){gate.hidden=false;$("loginError").textContent=error.message;}
}
$("unlockForm").addEventListener("submit",async event=>{
  event.preventDefault();key=$("accessKey").value.trim();await boot();
  if(gate.hidden)sessionStorage.setItem("mikan-nas-key",key);
});
$("lock").addEventListener("click",()=>{
  key="";sessionStorage.removeItem("mikan-nas-key");$("accessKey").value="";gate.hidden=false;
});
$("sidebarToggle").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("newChat").addEventListener("click",async()=>{
  if(busy)return;
  try{const created=await result("/api/conversations",{method:"POST",body:"{}"});await selectChat(created.id);}
  catch(error){notify(error.message);}
});
$("rememberForm").addEventListener("submit",async event=>{
  event.preventDefault();const fact=$("memoryText").value.trim();if(!fact)return;
  try{await result("/api/memories",{method:"POST",body:JSON.stringify({fact})});$("memoryText").value="";await loadMemories();}
  catch(error){notify(error.message);}
});
prompt.addEventListener("keydown",event=>{
  if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();$("chatForm").requestSubmit();}
});
$("chatForm").addEventListener("submit",async event=>{
  event.preventDefault();const text=prompt.value.trim();if(!text||busy||!currentId)return;
  busy=true;$("send").disabled=true;notify("Mikan is thinking…");
  if(messages.querySelector(".welcome"))messages.replaceChildren();
  bubble("user",text);prompt.value="";
  const reply=bubble("assistant","",true);
  try {
    const response=await api("/api/chat",{method:"POST",body:JSON.stringify({conversationId:currentId,text})});
    const reader=response.body.getReader(), decoder=new TextDecoder();
    let buffer="",failed=false,complete=false;
    function handle(packet){
      const lines=packet.split("\n"),kind=lines.find(line=>line.startsWith("event:"))?.slice(6).trim();
      const payload=lines.find(line=>line.startsWith("data:"))?.slice(5).trim();
      if(!payload)return;
      let data;try{data=JSON.parse(payload);}catch{return;}
      if(kind==="delta"){reply.body.textContent+=data.text||"";messages.scrollTop=messages.scrollHeight;}
      if(kind==="done")complete=true;
      if(kind==="error"){failed=true;notify(data.error||"Cloud reply failed");}
    }
    while(true){
      const {done,value}=await reader.read();if(done)break;
      buffer+=decoder.decode(value,{stream:true});
      let at;while((at=buffer.indexOf("\n\n"))>=0){handle(buffer.slice(0,at));buffer=buffer.slice(at+2);}
    }
    if(buffer.trim())handle(buffer);
    if(!complete&&!failed)throw new Error("The response was interrupted");
    if(failed&&!reply.body.textContent)reply.body.textContent="Sorry, the cloud provider didn't answer.";
    if(!failed)notify("");
  }catch(error){notify(error.message);if(!reply.body.textContent)reply.body.textContent="Connection interrupted.";}
  finally{reply.item.classList.remove("waiting");busy=false;$("send").disabled=false;await loadChats();}
});
if(key)boot();
