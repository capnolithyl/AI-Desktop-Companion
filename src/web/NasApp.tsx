import {useState,useRef,useEffect,useMemo,type FormEvent,type ChangeEvent,type CSSProperties} from "react";
import {ArrowLeft,Cat,Brain,Shirt,WandSparkles,Settings2,PawPrint,Sparkles,History,UserRound,Download,Upload,Plug2,Lock,LoaderCircle,Check,Copy,X,AlertTriangle,RefreshCw,Cpu,Globe,BookOpen} from "lucide-react";
import {DefaultCompanionShell} from "../DefaultCompanionShell";
import {WorkspaceAvatarRays,WorkspacePawSeal,WorkspaceSendPaw} from "../WorkspaceDecor";
import {ChatMarkdown} from "../components/ChatMarkdown";
import {PersonalityPresets,PersonalitySliders} from "../PersonalityControls";
import {PersonaCommunicationFields} from "../PersonaCommunicationFields";
import {IkiAvatar} from "../IkiAvatar";
import {defaultRigUrl,defaultOutfitName,shippedOutfits,shippedOutfitById} from "../bundled-iki-outfits";
import {AVATAR_BACKGROUNDS} from "../avatar-background";
import {PortraitContextMenu,type PortraitMenuItem} from "../PortraitContextMenu";
import {reactionFromReply,type AvatarReaction,type AvatarReactionKind} from "../avatar-reactions";
import {DEFAULT_COMPANION_PROFILE,importCompanionProfile,exportCompanionProfile,type CompanionProfile} from "../companion-profile";
import {NasClient,NasRequestError,type NasMessage,type NasChat,type LibrarySnapshot,type NasStatus,type LearningStatus,type LearningSettings,type LearningEvent} from "./nas-client";
import {MemoryPanel} from "../MemoryPanel";
import {NasLearningReviews} from "./NasLearningReviews";
import {NasUpdates} from "./NasUpdates";
import {NasResearch} from "./NasResearch";
import {NasKnowledge} from "./NasKnowledge";
import {NasBrainLab} from "./NasBrainLab";
import {NasTiming} from "./NasTiming";
import {NasModels,NasTokenUsage} from "./NasModels";
import type {NasModels as ModelSettings,CloudProvider,ReasoningEffort} from "./nas-client";
import {memoryNotice} from "./memory-notifications";
import {nasActivity} from "./nas-activity";
const portrait=new URL("../../assets/iki/mikan-chat-avatar.webp",import.meta.url).href;
const referencePortrait=new URL("../../assets/iki/mikan-reference.png",import.meta.url).href;
const KEY="mikan-nas-key";
const CLIENT_BUILD=__MIKAN_NAS_BUILD__;
type Page="chat"|"personality"|"appearance"|"memory"|"history"|"capabilities"|"models"|"research"|"knowledge"|"brain-lab"|"updates"|"log";
const tabs=[
  {id:"personality",label:"Personality",icon:WandSparkles},
  {id:"appearance",label:"Character",icon:Shirt},
  {id:"memory",label:"Memory & chats",icon:Brain},
  {id:"history",label:"Chat history",icon:History},
  {id:"capabilities",label:"Capabilities",icon:Plug2},
  {id:"models",label:"Models & providers",icon:Cpu},
  {id:"research",label:"Web research",icon:Globe},
  {id:"knowledge",label:"Knowledge & Notion",icon:BookOpen},
  {id:"brain-lab",label:"Brain Lab",icon:Brain},
  {id:"updates",label:"Software Updates",icon:RefreshCw}
] as const;
function downloadProfile(profile:CompanionProfile){
  const url=URL.createObjectURL(new Blob([JSON.stringify(exportCompanionProfile(profile),null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download="mikan-companion-profile.json";document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openLink(href:string){try{const url=new URL(href);if(["https:","http:"].includes(url.protocol))window.open(url.href,"_blank","noopener,noreferrer");}catch{/* Reject invalid URLs. */}}
function Bubble({message,latest,busy}:{message:NasMessage;latest:boolean;busy:boolean}){
  const assistant=message.role==="assistant";
  const timestamp=message.createdAt<1e12?message.createdAt*1000:message.createdAt;
  const date=new Date(timestamp);
  return <article className={"workspace-message "+message.role}>
    {assistant&&latest&&<WorkspaceAvatarRays/>}
    <span className="workspace-message-avatar" aria-hidden="true">{assistant?<img className="workspace-chat-portrait" src={portrait} alt="" width={58} height={58} draggable={false}/>:<UserRound size={19}/>}</span>
    <div className="workspace-message-body"><div className="workspace-message-author"><strong>{assistant?"Mikan ♡":"You"}</strong></div>
      <div className="workspace-message-bubble"><svg className="workspace-bubble-tail" viewBox="0 0 18 22" aria-hidden="true"><path d="M18 2 H13 Q11 8 2 8 Q8 12 13 20 H18Z" fill="var(--bubble-tail)"/><path d="M13 2 Q11 8 2 8 Q8 12 13 20" fill="none" stroke="var(--bubble-edge)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <div className="workspace-bubble-content"><ChatMarkdown text={message.content||(busy?"Thinking…":"")} onOpenLink={openLink}/>{assistant&&message.content.length>=120&&<WorkspacePawSeal/>}</div>
      {message.inference?.sources?.length?<div className="nas-source-list"><strong>Sources</strong>{message.inference.sources.map((source,index)=><div key={index}><a href={source.url} onClick={e=>{e.preventDefault();openLink(source.url);}}>[{index+1}] {source.title}</a> <small>{source.kind==="notion"?(source.coverage??"Notion reference"):source.kind==="cached-web"||source.fromCache?"Cached webpage":source.kind==="page"?"Page excerpt":"Search preview"}{source.publishedDate?" · "+source.publishedDate:source.syncedAt?" · synced "+new Date(source.syncedAt*1000).toLocaleDateString():source.fetchedAt?" · fetched "+new Date(source.fetchedAt).toLocaleDateString():""}</small></div>)}</div>:null}
      <div className="workspace-bubble-footer"><time dateTime={date.toISOString()}>{date.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</time></div></div>
    </div>
  </article>;
}

export function NasApp(){
  const [key,setKey]=useState(()=>sessionStorage.getItem(KEY)||"");
  const [token,setToken]=useState("");
  const [authenticated,setAuthenticated]=useState(false);
  const [connecting,setConnecting]=useState(false);
  const [status,setStatus]=useState<NasStatus|null>(null);
  const [profile,setProfile]=useState<CompanionProfile>(DEFAULT_COMPANION_PROFILE);
  const [draft,setDraft]=useState<CompanionProfile>(DEFAULT_COMPANION_PROFILE);
  const [chats,setChats]=useState<NasChat[]>([]);
  const [messages,setMessages]=useState<NasMessage[]>([]);
  const [active,setActive]=useState<string|null>(null);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [page,setPage]=useState<Page>("chat");
  const [notice,setNotice]=useState("");
  const [memoryToast,setMemoryToast]=useState<{key:number;message:string;warning:boolean}|null>(null);
  const [versionCopied,setVersionCopied]=useState(false);
  const toastSerial=useRef(0);
  const eventCursor=useRef<number|undefined>(undefined);
  const [activity,setActivity]=useState<{conversationId:string;events:LearningEvent[]}|null>(null);
  const [activityError,setActivityError]=useState("");
  const [eventError,setEventError]=useState("");
  const [learning,setLearning]=useState<LearningStatus|null>(null);
  const [library,setLibrary]=useState<LibrarySnapshot>({facts:[],characterFacts:[],interests:[],sessionSummaries:[]});
  const [rigError,setRigError]=useState("");
  const [reaction,setReaction]=useState<AvatarReaction|null>(null);
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null);
  const serial=useRef(0);
  const inFlight=useRef(false);
  const client=useMemo(()=>new NasClient(key),[key]);
  const file=useRef<HTMLInputElement>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(!key)return;
    let valid=true;setConnecting(true);setNotice("");
    void (async()=>{
      try{
        const [info,stored,list]=await Promise.all([client.status(),client.profile(),client.chats()]);
        if(!valid)return;
        let selected=list.find(c=>c.id===localStorage.getItem("mikan-nas-chat"))??list[0];
        if(!selected)selected=await client.createChat();
        const history=await client.messages(selected.id);
        // Establish the cursor before the chat can send its first message.
        const baseline=await client.learningEvents().catch(()=>null);
        if(!valid)return;
        eventCursor.current=baseline?.cursor;
        setEventError(baseline?"":"Memory notifications are unavailable; check the NAS build.");
        setStatus(info);setProfile(stored);setDraft(stored);setChats(list.length?list:[selected]);setActive(selected.id);setMessages(history);
        localStorage.setItem("mikan-nas-chat",selected.id);sessionStorage.setItem(KEY,key);setAuthenticated(true);
      }catch(error){if(valid){setAuthenticated(false);sessionStorage.removeItem(KEY);setNotice(String(error instanceof Error?error.message:error));}}
      finally{if(valid)setConnecting(false);}
    })();
    return()=>{valid=false;};
  },[key,client]);
  useEffect(()=>{setRigError("");},[profile.outfitId,profile.avatarDisplay]);
  useEffect(()=>{
    if(!memoryToast)return;
    const timer=window.setTimeout(()=>setMemoryToast(null),12000);
    return ()=>window.clearTimeout(timer);
  },[memoryToast]);
  useEffect(()=>{
    if(!versionCopied)return;
    const timer=window.setTimeout(()=>setVersionCopied(false),2500);
    return ()=>window.clearTimeout(timer);
  },[versionCopied]);
  useEffect(()=>{
    if(!authenticated)return;
    let cancelled=false,polling=false;
    const poll=async()=>{
      if(polling||cancelled)return;polling=true;
      try{
        const result=await client.learningEvents(eventCursor.current);
        if(cancelled)return;
        eventCursor.current=result.cursor;setEventError("");
        const notification=memoryNotice(result.items);
        if(notification)setMemoryToast({key:++toastSerial.current,...notification});
        if(result.items.some(e=>e.kind==="outcome"||e.kind==="failed")){
          const [snapshot,learn]=await Promise.all([client.library(),client.learning()]);
          if(!cancelled){setLibrary(snapshot);setLearning(learn);}
        }
      }catch{if(!cancelled)setEventError("Memory notifications disconnected. Retrying…");}
      finally{polling=false;}
    };
    void poll();const timer=window.setInterval(()=>void poll(),3000);
    const resume=()=>{if(document.visibilityState==="visible")void poll();};
    document.addEventListener("visibilitychange",resume);
    return ()=>{cancelled=true;window.clearInterval(timer);document.removeEventListener("visibilitychange",resume);};
  },[authenticated,client]);
  // Historical conversation activity is independent of the toast cursor.
  useEffect(()=>{
    if(!authenticated||!active)return;
    let cancelled=false,polling=false;
    setActivity(null);setActivityError("");
    const poll=async()=>{
      if(polling||cancelled)return;polling=true;
      try{
        const result=await client.learningDiagnostics(active);
        if(!cancelled){setActivity({conversationId:active,events:result.events});setActivityError("");}
      }catch{if(!cancelled)setActivityError("Activity log disconnected. Retrying…");}
      finally{polling=false;}
    };
    void poll();const timer=window.setInterval(()=>void poll(),3000);
    const resume=()=>{if(document.visibilityState==="visible")void poll();};
    document.addEventListener("visibilitychange",resume);
    return ()=>{cancelled=true;window.clearInterval(timer);document.removeEventListener("visibilitychange",resume);};
  },[authenticated,client,active]);
  const lock=()=>{if(busy||saving)return;setAuthenticated(false);setKey("");setToken("");sessionStorage.removeItem(KEY);setMessages([]);setChats([]);setLibrary({facts:[],characterFacts:[],interests:[],sessionSummaries:[]});setLearning(null);setMemoryToast(null);setActivity(null);setActivityError("");setEventError("");eventCursor.current=undefined;setActive(null);setPage("chat");setNotice("");};
  useEffect(()=>{
    if(!authenticated)return;
    let cancelled=false;
    const check=async()=>{try{const live=await client.status();if(!cancelled)setStatus(live);}catch{/* Server may be restarting. */}};
    const timer=window.setInterval(()=>void check(),30000);
    const resume=()=>{if(document.visibilityState==="visible")void check();};
    document.addEventListener("visibilitychange",resume);
    return ()=>{cancelled=true;window.clearInterval(timer);document.removeEventListener("visibilitychange",resume);};
  },[authenticated,client]);
  const versionMismatch=!!status&&(!status.build||CLIENT_BUILD.commit!==status.build.commit||CLIENT_BUILD.backendHash!==status.build.actualBackendHash);
  const copyVersion=async()=>{try{const live=await client.status();setStatus(live);await navigator.clipboard.writeText(JSON.stringify({service:"nas",browser:CLIENT_BUILD,server:live.build??null},null,2));setVersionCopied(true);}catch(error){setNotice(error instanceof Error?error.message:String(error));}};
  const report=(error:unknown)=>setNotice(error instanceof Error?error.message:String(error));
  const [switching,setSwitching]=useState(false);
  const applyModels=(models:ModelSettings)=>setStatus(old=>old?{...old,...models}:old);
  const switchModel=async(value:string)=>{
    const [provider,model]=JSON.parse(value) as [CloudProvider,string];
    setSwitching(true);try{applyModels(await client.saveModels({provider,model,select:true}));}catch(error){report(error);}finally{setSwitching(false);}
  };
  const switchEffort=async(effort:ReasoningEffort)=>{
    if(!status||busy||switching)return;
    setSwitching(true);try{applyModels(await client.saveModels({provider:status.provider,reasoningEffort:effort}));}catch(error){report(error);}finally{setSwitching(false);}
  };
  const refreshLibrary=async()=>{const [snapshot,list,learn]=await Promise.all([client.library(),client.chats(),client.learning()]);setLibrary(snapshot);setChats(list);setLearning(learn);};
  const setLearningFlags=async(next:LearningSettings)=>{try{await client.saveLearning(next);await refreshLibrary();}catch(error){report(error);}};
  const mutate=async<T,>(action:string,args:object):Promise<T>=>{const result=await client.memoryAction<T>(action,args);await refreshLibrary();return result;};
  const changeMemory=async(action:string,args:object)=>{await mutate(action,args);};
  const openPage=(next:Page)=>{
    if(saving)return;
    if((page==="personality"||page==="appearance")&&JSON.stringify(draft)!==JSON.stringify(profile)&&!window.confirm("Discard unsaved profile changes?"))return;
    setNotice("");setDraft(profile);setPage(next);
    if(next==="memory"||next==="history")void refreshLibrary().catch(report);
  };
  const openChat=async(id:string)=>{
    if(inFlight.current||busy)return;
    try{const history=await client.messages(id);setActive(id);setMessages(history);setPage("chat");setNotice("");localStorage.setItem("mikan-nas-chat",id);}
    catch(error){report(error);}
  };
  const newChat=async()=>{
    if(inFlight.current||busy)return;
    try{const chat=await client.createChat();setChats(previous=>[chat,...previous]);setMessages([]);setActive(chat.id);localStorage.setItem("mikan-nas-chat",chat.id);setPage("chat");setNotice("");}
    catch(error){report(error);}
  };
  const express=(kind:AvatarReactionKind)=>setReaction({kind,serial:++serial.current,source:"test"});
  const save=async(next:CompanionProfile)=>{
    if(saving)return;setSaving(true);setNotice("");
    try{const saved=await client.saveProfile(next);setProfile(saved);setDraft(saved);setNotice("Saved on Beholder.");}
    catch(error){report(error);}
    finally{setSaving(false);}
  };
  const importFile=async(event:ChangeEvent<HTMLInputElement>)=>{
    const selected=event.target.files?.[0];event.target.value="";
    if(!selected)return;
    try{if(selected.size>64000)throw new Error("Profile is too large");const imported=importCompanionProfile(JSON.parse(await selected.text()));setDraft(imported);setNotice("Profile loaded. Review it, then Save settings to apply.");}
    catch(error){report(error);}
  };
  const send=async(event?:FormEvent)=>{
    event?.preventDefault();
    const text=input.trim(),id=active;
    if(!text||!id||busy||switching||inFlight.current)return;
    inFlight.current=true;setBusy(true);setNotice("");setInput("");
    const stamp=Date.now(),pending="nas-pending-"+stamp;
    setMessages(previous=>[...previous,{id:pending+"-user",role:"user",content:text,createdAt:stamp},{id:pending,role:"assistant",content:"",createdAt:stamp+1}]);
    let full="";
    try{await client.chat(id,text,delta=>{full+=delta;setMessages(previous=>previous.map(m=>m.id===pending?{...m,content:full}:m));});
      const kind=reactionFromReply(full);if(kind)setReaction({kind,serial:++serial.current,source:"reply"});
    }catch(error){if(error instanceof NasRequestError&&[409,429,503].includes(error.status))setInput(previous=>previous||text);report(error);}
    finally{
      try{const [history,list]=await Promise.all([client.messages(id),client.chats()]);if(mounted.current){setMessages(history);setChats(list);}}
      catch(error){report(error);}
      inFlight.current=false;setBusy(false);
    }
  };
  const exportFacts=async()=>{
    const snapshot=await client.library();
    const memories=snapshot.facts.map(f=>({...f,pinned:(f.importance??50)>=90}));
    const url=URL.createObjectURL(new Blob([JSON.stringify({schema:"mikan-user-memories",version:1,memories},null,2)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="mikan-user-memories.json";document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    return {path:"mikan-user-memories.json (browser download)",count:memories.length};
  };
  const deleteChat=async(id:string)=>{
    if(inFlight.current||busy)throw new Error("Wait for the current reply before deleting a chat.");
    inFlight.current=true;setBusy(true);
    try{
      await client.memoryAction("deleteChat",{id});
      setChats(previous=>previous.filter(chat=>chat.id!==id));
      if(active===id){
        setActive(null);setMessages([]);setInput("");localStorage.removeItem("mikan-nas-chat");
        // Deletion is already committed; failure to create a replacement must
        // not resurrect the deleted chat or report that deletion failed.
        try{
          const chat=await client.createChat();
          setChats(previous=>[chat,...previous]);setActive(chat.id);localStorage.setItem("mikan-nas-chat",chat.id);
        }catch(error){report(error);}
      }
      try{await refreshLibrary();}catch(error){report(error);}
    }finally{inFlight.current=false;setBusy(false);}
  };
  if(!authenticated)return <main className="nas-gate"><form className="nas-login control-form-section" onSubmit={event=>{event.preventDefault();if(token.trim()===key){setKey("");window.setTimeout(()=>setKey(token.trim()),0);}else setKey(token.trim());}}>
    <img src={portrait} alt="Mikan"/><h1>Welcome home ♡</h1><p>Mikan · Beholder</p>
    <label className="setting-field">NAS access key<input type="password" value={token} autoComplete="off" onChange={event=>setToken(event.target.value)} required/></label>
    <button className="secondary-action" disabled={connecting}>{connecting?<LoaderCircle className="spin" size={16}/>:<Lock size={16}/>} {connecting?"Connecting…":"Unlock Mikan"}</button>
    {notice&&<p role="alert">{notice}</p>}
  </form></main>;
  const outfit=shippedOutfitById(profile.outfitId);
  const avatar=<div className="workspace-avatar-rig" style={{width:"100%",height:"100%"}}>
    {profile.avatarDisplay==="animated"&&!rigError?<IkiAvatar customRig={null} rigUrl={outfit?.bundledUrl||defaultRigUrl}
      rigLabel={outfit?.name||defaultOutfitName} speaking={false} reaction={reaction} debugVisible={false}
      presencePreferences={{followCursor:profile.followCursor,dragSway:false}} dragging={false} verticalOffset={profile.verticalOffset}
      onDebug={()=>{}} onError={setRigError}/>:<img className="character-portrait" src={referencePortrait} alt="Mikan" draggable={false}/>}
  </div>;
  const menuItems:PortraitMenuItem[]=[
    {id:"outfit",label:"Change outfit",children:[{id:"default",label:defaultOutfitName,selected:!profile.outfitId,onSelect:()=>void save({...profile,outfitId:null})},...shippedOutfits.map(item=>({id:item.id,label:item.name,selected:profile.outfitId===item.id,onSelect:()=>void save({...profile,outfitId:item.id})}))]},
    {id:"background",label:"Background",children:AVATAR_BACKGROUNDS.map(item=>({id:item.id,label:item.label,selected:profile.avatarBackground===item.id,onSelect:()=>void save({...profile,avatarBackground:item.id})}))},
    {id:"appearance",label:"Character settings",onSelect:()=>openPage("appearance")}
  ];
  const activityEntries=activity&&activity.conversationId===active?nasActivity(activity.events):[];
  const latest=[...messages].reverse().find(m=>m.role==="assistant")?.id;
  return <main className={"companion nas-app "+(page==="chat"?"default-layout-active":"settings-mode settings-standalone")}
    style={{"--mikan-font":"Segoe UI, system-ui, sans-serif"} as CSSProperties}>
    {page==="chat"?<DefaultCompanionShell sidebarVersion={<button type="button" className={"nas-build-label"+(versionMismatch?" mismatch":"")} onClick={()=>void copyVersion()} title="Copy browser and backend build identity" aria-label="Copy NAS version"><span>v{CLIENT_BUILD.version}<small>{CLIENT_BUILD.commit.slice(0,8)}{versionMismatch?" · build mismatch":""}</small></span>{versionCopied?<Check size={14}/>:<Copy size={14}/>}</button>} avatar={avatar} avatarBackground={profile.avatarBackground} onAvatarContextMenu={event=>{event.preventDefault();setMenu({x:event.clientX,y:event.clientY});}}
      chats={chats} activeConversationId={active} transcriptVersion={messages.length+":"+(messages.at(-1)?.content.length||0)+":"+busy}
      busy={busy} muted ready memoryIssue={!!(activityError||eventError||learning?.failed)} visionActive={false} visionBusy={false}
      displayName={chats.find(c=>c.id===active)?.title||"Beholder Companion"} lastActivity={busy?"Thinking…":"Ready"} activityEntries={activityEntries} activityError={activityError||eventError}
      webMode unavailable={{voice:true,vision:true,search:true}} onDrag={()=>{}} onHide={lock}
      onNewChat={()=>void newChat()} onOpenChat={id=>void openChat(id)} onOpenHistory={()=>openPage("history")}
      onCopyChatDebug={async id=>{const [history,live,diagnostics]=await Promise.all([client.messages(id),client.status(),client.learningDiagnostics(id).catch(()=>({events:[]}))]);await navigator.clipboard.writeText(JSON.stringify({service:"nas",configuredProvider:live.provider,configuredModel:live.model,browserBuild:CLIENT_BUILD,serverBuild:live.build??null,conversation:id,messages:history,memoryEvents:diagnostics.events},null,2));}}
      onDeleteChat={deleteChat}
      onOpenCurrentLog={()=>openPage("log")} onOpenMemory={()=>openPage("memory")} onOpenSettings={()=>openPage("personality")}
      onOpenSearch={()=>openPage("research")} onToggleVision={()=>{}} onVoice={()=>{}} onMute={()=>{}}
      onExpression={express} onOutfit={()=>openPage("appearance")}
      modelPicker={<div className="nas-model-controls"><div className="model-switcher"><select aria-label="Select NAS model" value={status?JSON.stringify([status.provider,status.model]):""} disabled={busy||switching||!!status?.busy||!status?.providers?.length} onChange={e=>void switchModel(e.target.value)}>{status?.providers?.filter(p=>p.configured||p.provider===status.provider).map(p=><optgroup key={p.provider} label={p.provider}>{p.models.map(model=><option key={model} value={JSON.stringify([p.provider,model])} disabled={!p.configured}>{model}</option>)}</optgroup>)??<option value="">Cloud model</option>}</select></div>{status&&<NasTokenUsage client={client} models={status} compact/>}</div>}
      transcript={<>{!messages.length&&<div className="workspace-greeting"><PawPrint size={42}/><strong>Ready for a little conversation?</strong><span>Beholder is awake.</span></div>}
        {messages.map(message=><Bubble key={message.id} message={message} latest={message.id===latest} busy={busy}/>)}
        {notice&&<div className="workspace-system-feedback" role="status"><Sparkles size={18}/><span>{notice}</span></div>}</>}
      composer={<div className="nas-composer-stack">{!!status?.reasoningOptions?.length&&<div className="nas-thinking-row"><label className="nas-thinking-select"><Brain size={14}/><span>Thinking effort</span><select aria-label="Thinking effort" value={status.reasoningEffort??""} disabled={busy||switching||!!status.busy} onChange={e=>void switchEffort(e.target.value as ReasoningEffort)}>{status.reasoningOptions.map(effort=><option key={effort} value={effort}>{({auto:"Auto",none:"Off",low:"Low",medium:"Medium",high:"High"})[effort]}</option>)}</select></label></div>}<form className="input-row" onSubmit={event=>void send(event)}>
        <textarea aria-label="Message Mikan" rows={2} placeholder="Message Mikan…" maxLength={4000} value={input} onChange={event=>setInput(event.target.value)}
          onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}}/>
        <button className="send-button chat-paw-send" type="submit" aria-label="Send message" disabled={busy||switching||!input.trim()}>{busy?<LoaderCircle className="spin" size={20}/>:<WorkspaceSendPaw/>}</button>
      </form></div>}/>:<section className="drawer control-center-window" role="dialog" aria-label="Mikan Control Center">
      <header className="drawer-header control-center-header"><button type="button" className="back-button" onClick={()=>openPage("chat")} title="Back to chat"><ArrowLeft size={20}/></button>
        <span className="control-header-glyph"><Settings2 size={22}/></span><div className="drawer-title"><strong>{tabs.find(t=>t.id===page)?.label||"Conversation log"}</strong><span>Mikan's control center · Beholder</span></div>
        <span className="control-local-indicator"><span/> NAS</span></header>
      <div className="settings-layout"><nav className="settings-tabs" aria-label="Settings categories">
        <div className="control-brand"><div className="control-brand-icon"><Cat size={25}/></div><div><strong>Mikan</strong><small>CONTROL CENTER</small></div></div>
        <div className="settings-nav-group"><div className="settings-nav-heading">YOUR COMPANION</div>
          {tabs.map(({id,label,icon:Icon})=><button type="button" key={id} className={"settings-tab"+(page===id?" active":"")} onClick={()=>openPage(id)}><span className="control-nav-icon"><Icon size={19}/></span><span>{label}</span></button>)}
        </div><div className="control-sidebar-decoration"><Sparkles size={13}/><PawPrint size={34}/><Sparkles size={10}/></div>
      </nav><div className={(page==="memory"||page==="history")?"settings-body settings-embedded settings-memory-view":"settings-body"}>
        {page==="personality"&&<>
          <div className="control-page-note"><WandSparkles size={20}/> Same personality and communication rules as desktop Mikan. Save to apply across browsers.</div>
          <div className="nas-profile-actions"><button className="secondary-action" onClick={()=>file.current?.click()}><Upload size={15}/> Import desktop profile</button><button className="secondary-action" onClick={()=>downloadProfile(draft)}><Download size={15}/> Export profile</button><input ref={file} type="file" accept=".json,application/json" hidden onChange={event=>void importFile(event)}/></div>
          <div className="settings-section-title">Mikan's personality</div><PersonalityPresets value={draft.personality} onChange={personality=>setDraft(current=>({...current,personality}))}/>
          <div className="settings-section-title">Fine-tune her personality</div><PersonalitySliders value={draft.personality} onChange={personality=>setDraft(current=>({...current,personality}))}/>
          <PersonaCommunicationFields value={draft} onChange={patch=>setDraft(current=>({...current,...patch}))}/>
        </>}
        {page==="appearance"&&<><div className="settings-section-title">Mikan's wardrobe</div>
          <section className="control-form-section"><label className="setting-field">Outfit<select value={draft.outfitId??""} onChange={event=>setDraft(current=>({...current,outfitId:event.target.value||null}))}><option value="">{defaultOutfitName}</option>{shippedOutfits.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="setting-field">Background<select value={draft.avatarBackground} onChange={event=>setDraft(current=>({...current,avatarBackground:event.target.value as CompanionProfile["avatarBackground"]}))}>{AVATAR_BACKGROUNDS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="setting-field">Avatar display<select value={draft.avatarDisplay} onChange={event=>setDraft(current=>({...current,avatarDisplay:event.target.value as CompanionProfile["avatarDisplay"]}))}><option value="animated">Animated Iki</option><option value="portrait">Portrait</option></select></label>
          <label className="setting-field">Vertical position · {draft.verticalOffset}<input type="range" min={-300} max={300} value={draft.verticalOffset} onChange={event=>setDraft(current=>({...current,verticalOffset:Number(event.target.value)}))}/></label>
          <label className="setting-field"><span>Follow cursor <input type="checkbox" checked={draft.followCursor} onChange={event=>setDraft(current=>({...current,followCursor:event.target.checked}))}/></span></label>
          {rigError&&<p role="alert">{rigError}</p>}
          <small>Bundled outfits are shared with desktop. Custom imported rigs are not yet supported in NAS mode.</small></section></>}
        {(page==="memory"||page==="history")&&<MemoryPanel embedded nasMode key={page} initialTab={page==="history"?"chats":"facts"}
          conversations={chats} sessionSummaries={library.sessionSummaries} facts={library.facts} characterFacts={library.characterFacts} interests={library.interests}
          onImportInterests={items=>mutate<{inserted:number;duplicates:number}>("importInterests",{items})}
          onEditInterest={(id,item)=>changeMemory("editInterest",{id,item})} onDeleteInterest={id=>changeMemory("deleteInterest",{id})}
          onMoveFactToInterest={(id,item)=>changeMemory("moveFact",{id,item})}
          onMoveInterestToFact={(id,fact,category,tags)=>changeMemory("moveInterest",{id,fact,category,tags})}
          onImportCharacter={items=>mutate<{inserted:number;duplicates:number}>("importCanon",{items})}
          nasLearning={learning?<NasLearningReviews status={learning} client={client} onChanged={refreshLibrary}/>:undefined}
          autoRememberUser={learning?.settings.user??false} autoRememberMikan={learning?.settings.character??false} automaticError={null} onAutoRememberUserChange={user=>{if(learning)void setLearningFlags({...learning.settings,user});}} onAutoRememberMikanChange={character=>{if(learning)void setLearningFlags({...learning.settings,character});}}
          currentId={active} busy={busy} error={notice||null} onClose={()=>openPage("chat")} onNew={()=>void newChat()} onOpen={openChat}
          onDeleteChat={deleteChat} onDeleteSessionSummary={id=>changeMemory("deleteSummary",{id})}
          onAddFact={fact=>changeMemory("addFact",{fact})} onEditFact={(id,fact)=>changeMemory("editFact",{id,fact})} onDeleteFact={id=>changeMemory("deleteFact",{id})}
          onPinFact={(id,pinned)=>changeMemory("pinFact",{id,pinned})} onUpdateFactMetadata={(id,category,tags)=>changeMemory("labelFact",{id,category,tags})}
          onImportFacts={items=>mutate<{inserted:number;duplicates:number}>("importFacts",{items})} onExportFacts={exportFacts}
          onRefresh={refreshLibrary} onAddCharacter={(category,label,value)=>changeMemory("addCanon",{item:{category,label,value}})}
          onEditCharacter={(id,category,label,value)=>changeMemory("editCanon",{id,item:{category,label,value}})} onDeleteCharacter={id=>changeMemory("deleteCanon",{id})}/>}
        {page==="log"&&<><div className="settings-section-title">Conversation log</div><p className="settings-note">Currently selected: {status?.provider} · {status?.model}</p>{messages.map(message=><div key={message.id} className="control-form-section"><strong>{message.role==="assistant"?"Mikan":"You"}</strong>{message.inference&&<p className="settings-note">{message.inference.provider} · {message.inference.actualModel||message.inference.requestedModel} · {message.inference.outcome}{!message.inference.actualModel?" (actual model not reported)":""}</p>}{message.inference?.timing&&<NasTiming timing={message.inference.timing}/>}<ChatMarkdown text={message.content} onOpenLink={openLink}/></div>)}</>}
        {page==="models"&&status?.providers&&<NasModels models={status} client={client} onChanged={applyModels} busy={busy||switching||status.busy}/>}
        {page==="brain-lab"&&status?.providers&&<NasBrainLab client={client} models={status} busy={busy||!!status.busy}/>}
        {page==="knowledge"&&<NasKnowledge client={client} busy={busy||!!status?.busy}/>}
        {page==="research"&&<NasResearch client={client} busy={busy||!!status?.busy}/>}
        {page==="updates"&&<NasUpdates client={client}/>}
        {page==="capabilities"&&<><div className="settings-section-title">Beholder runtime</div><section className="control-form-section"><p>Cloud chat · {status?.provider} · {status?.model}</p><p>Persistent conversations, owner facts, pins, character canon, structured interests, historical archive retrieval, opt-in automatic learning and review, shared persona, animated Iki, bundled outfits and backgrounds.</p><p>Not connected yet: Qdrant, voice synthesis, screen capture and desktop synchronization. Windows window controls and global hotkeys stay native.</p><p>The old prototype is still available at <a href="/legacy">/legacy</a>.</p></section></>}
        {notice&&<p className="settings-note" role="status">{notice}</p>}
        {(page==="personality"||page==="appearance")&&<div className="nas-save-row"><button className="secondary-action" disabled={saving} onClick={()=>void save(draft)}>{saving?"Saving…":"Save settings"}</button></div>}
      </div></div>
    </section>}
    {versionMismatch&&<div className="nas-update-notice" role="status"><AlertTriangle size={16}/><span>Browser and server builds differ.</span><button type="button" onClick={()=>{if((input.trim()||busy||saving||((page==="personality"||page==="appearance")&&JSON.stringify(profile)!==JSON.stringify(draft)))&&!window.confirm("Reload Mikan? Unsaved changes or an active reply may be lost."))return;window.location.reload();}}>Reload</button></div>}
    {memoryToast&&<div className={"workspace-memory-toast detailed nas-memory-toast"+(memoryToast.warning?" warning":"")} key={memoryToast.key} role="status" aria-live="polite">{memoryToast.warning?<AlertTriangle size={17}/>:<Check size={17}/>}<span>{memoryToast.message}</span><button type="button" onClick={()=>{setMemoryToast(null);openPage("memory");}}>Review memories</button><button type="button" aria-label="Dismiss memory notice" onClick={()=>setMemoryToast(null)}><X size={15}/></button></div>}
    {menu&&page==="chat"&&<PortraitContextMenu position={menu} items={menuItems} onClose={()=>setMenu(null)}/>}
  </main>;
}
