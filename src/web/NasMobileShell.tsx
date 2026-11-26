import {useEffect,useRef,useState,type ComponentProps,type CSSProperties} from "react";
import {BookHeart,Cat,Copy,Download,History,Layers3,LoaderCircle,Lock,MessageCircle,PawPrint,Plus,Search,Settings2,Shirt,Sparkles,Trash2} from "lucide-react";
import type {DefaultCompanionShell} from "../DefaultCompanionShell";
import {WorkspacePeekCat} from "../WorkspaceDecor";

const portrait=new URL("../../assets/iki/mikan-chat-avatar.webp",import.meta.url).href;
const mobileQuery="(max-width: 760px), (max-width: 1050px) and (pointer: coarse)";
export function useNasMobile(){
  const [mobile,setMobile]=useState(()=>window.matchMedia(mobileQuery).matches);
  useEffect(()=>{const query=window.matchMedia(mobileQuery);const update=()=>setMobile(query.matches);update();query.addEventListener("change",update);return()=>query.removeEventListener("change",update);},[]);
  return mobile;
}
export type MobileView="chat"|"chats"|"character";
type MobileDestination=MobileView|"settings";
type Props=ComponentProps<typeof DefaultCompanionShell>&{view:MobileView;onViewChange:(view:MobileView)=>void;onDownloadChatDebug:(id:string)=>Promise<void>;exporting:boolean};

/** Keep primary destinations identical on every mobile screen. */
export function NasMobileNav({active,onNavigate}:{active:MobileDestination;onNavigate:(destination:MobileDestination)=>void}){
  const items=[{id:"chats",label:"Chats",icon:History},{id:"chat",label:"Chat",icon:MessageCircle},{id:"character",label:"Mikan",icon:Cat},{id:"settings",label:"Settings",icon:Settings2}] as const;
  return <nav className="nas-mobile-bottom-nav" aria-label="Main navigation">{items.map(({id,label,icon:Icon})=><button key={id} type="button" aria-current={active===id?"page":undefined} onClick={()=>onNavigate(id)}><Icon size={22}/><span>{label}</span></button>)}</nav>;
}

export function NasMobileShell(p:Props){
  const view=p.view,setView=p.onViewChange;
  const [copying,setCopying]=useState<string|null>(null);
  const [deleting,setDeleting]=useState<string|null>(null);
  const [feedback,setFeedback]=useState("");
  const [expressions,setExpressions]=useState(false);
  const feed=useRef<HTMLDivElement>(null);
  const follow=useRef(true);
  const active=p.activeConversationId;
  useEffect(()=>{follow.current=true;},[active]);
  useEffect(()=>{if(view==="chat"&&feed.current&&follow.current)feed.current.scrollTop=feed.current.scrollHeight;},[p.transcriptVersion,active,view]);
  const open=(id:string)=>{p.onOpenChat(id);follow.current=true;setView("chat");};
  const create=()=>{p.onNewChat();follow.current=true;setView("chat");};
  const copy=async(id:string)=>{if(copying)return;setCopying(id);setFeedback("");try{await p.onCopyChatDebug(id);setFeedback("Debug log copied. Review before sharing.");}catch{setFeedback("Could not copy debug log.");}finally{setCopying(null);}};
  const remove=async(id:string)=>{if(deleting||!window.confirm("Delete this conversation and all its messages?"))return;setDeleting(id);setFeedback("");try{await p.onDeleteChat(id);setFeedback("Conversation deleted.");}catch(e){setFeedback(e instanceof Error?e.message:"Could not delete conversation.");}finally{setDeleting(null);}};
  const background=p.avatarBackground==="plain"?undefined:{ "--workspace-avatar-background":`url("${import.meta.env.BASE_URL}mikan-backgrounds/${p.avatarBackground}.webp")` } as CSSProperties;
  return <section className="mikan-workspace nas-mobile-shell" aria-label="Mikan mobile workspace">
    <header className="nas-mobile-header">
      <button type="button" className="nas-mobile-brand" onClick={()=>setView("character")} aria-label="Open Mikan companion"><img src={portrait} alt=""/><span><strong>Mikan <span className="nas-mobile-heart">♡</span></strong><small><i className={p.busy?"thinking":""}/>{p.busy?"Thinking…":"Beholder · online"}</small></span></button>
      <div className="nas-mobile-header-actions"><button type="button" onClick={create} disabled={p.busy||!!deleting} aria-label="New chat" title="New chat"><Plus size={23}/></button><button type="button" onClick={p.onOpenSettings} aria-label="Control Center" title="Control Center"><Settings2 size={22}/></button></div>
    </header>
    {view==="chat"&&<section className="workspace-chat nas-mobile-chat" aria-label="Current conversation">
      <div className="nas-mobile-chat-title"><div><small>CONVERSATION</small><strong>{p.displayName}</strong></div><button type="button" onClick={p.onOpenCurrentLog} aria-label="Conversation log"><History size={19}/></button><button type="button" disabled={!active||p.exporting} onClick={()=>{if(active)void p.onDownloadChatDebug(active);}} aria-label="Download current chat JSON" title="Download chat JSON">{p.exporting?<LoaderCircle className="spin" size={19}/>:<Download size={19}/>}</button></div>
      <div className="workspace-transcript" role="log" aria-live="polite" ref={feed} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;}}>{p.transcript}</div>
      <div className="workspace-composer">{p.composer}</div>
    </section>}
    {view==="chats"&&<section className="nas-mobile-scroll nas-mobile-chats" aria-label="Conversations">
      <div className="nas-mobile-section-heading"><div><small>YOUR MOMENTS TOGETHER</small><h2>Chats</h2></div><MessageCircle size={29}/></div>
      <button className="workspace-new-chat" type="button" onClick={create} disabled={p.busy||!!deleting}><Plus size={20}/> New conversation</button>
      {p.chats.length===0&&<p className="workspace-empty-chats">Your conversations will appear here.</p>}
      {p.chats.map(chat=><article key={chat.id} className={"nas-mobile-chat-card"+(chat.id===active?" active":"")}>
        <button className="nas-mobile-chat-open" type="button" onClick={()=>open(chat.id)} disabled={p.busy||!!deleting}><MessageCircle size={20}/><span><strong>{chat.title||"Conversation"}</strong><small>{chat.id===active?"Current conversation":new Date(chat.updatedAt<1e12?chat.updatedAt*1000:chat.updatedAt).toLocaleDateString()}</small></span></button>
        <button type="button" className="nas-mobile-icon-button" disabled={!!copying||!!deleting} onClick={()=>void copy(chat.id)} aria-label={"Copy debug log for "+chat.title}>{copying===chat.id?<LoaderCircle className="spin" size={18}/>:<Copy size={18}/>}</button>
        <button type="button" className="nas-mobile-icon-button" disabled={p.busy||!!deleting||!!copying} onClick={()=>void remove(chat.id)} aria-label={"Delete "+chat.title}>{deleting===chat.id?<LoaderCircle className="spin" size={18}/>:<Trash2 size={18}/>}</button>
      </article>)}
      {feedback&&<p className="nas-mobile-feedback" role="status">{feedback}</p>}
      <button className="nas-mobile-wide-action" type="button" onClick={p.onOpenHistory}><History size={19}/> Chat history & session notes</button>
      <div className="nas-mobile-peek"><WorkspacePeekCat/></div>
    </section>}
    {view==="character"&&<section className="nas-mobile-scroll nas-mobile-character" aria-label="Mikan companion">
      <div className="workspace-avatar-card" data-background={p.avatarBackground} style={background} onContextMenu={p.onAvatarContextMenu}>
        <div className="workspace-iki-stage">{p.avatar}</div><div className="workspace-avatar-status"><PawPrint size={20}/><span>{p.busy?"Thinking with you…":"Here with you ♡"}</span></div>
      </div>
      <div className="nas-mobile-character-actions"><button type="button" onClick={p.onOutfit}><Shirt size={20}/> Wardrobe</button><button type="button" aria-expanded={expressions} onClick={()=>setExpressions(x=>!x)}><Sparkles size={20}/> Expressions</button></div>
      {expressions&&<div className="nas-mobile-expression-grid">{(["smile","laugh","surprised","sad","angry","nod","shake"] as const).map(kind=><button type="button" key={kind} onClick={()=>p.onExpression(kind)}>{kind[0].toUpperCase()+kind.slice(1)}</button>)}</div>}
      <section className="nas-mobile-panel"><h3><Layers3 size={18}/> Inference model</h3><div className="workspace-model">{p.modelPicker}</div><button className="nas-mobile-wide-action" type="button" onClick={p.onOpenMemory}><BookHeart size={18}/> Memory <small>{p.memoryIssue?"Needs attention":"Ready"}</small></button><button className="nas-mobile-wide-action" type="button" onClick={p.onOpenSearch}><Search size={18}/> Web research settings</button></section>
      <section className="nas-mobile-panel workspace-activity-log"><h3><History size={18}/> Activity log</h3>{p.busy&&<p role="status">{p.lastActivity}</p>}{p.activityError&&<p role="alert">{p.activityError}</p>}{!p.activityEntries.length&&!p.activityError&&<p className="workspace-activity-empty">Memories and research activity will appear here.</p>}{p.activityEntries.map(entry=><article key={entry.id} className="workspace-activity-entry"><div className="workspace-activity-entry-title"><strong>{entry.title}</strong><time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</time></div>{entry.detail&&<p className="workspace-activity-detail">{entry.detail}</p>}{entry.lines.length>0&&<ul>{entry.lines.map((line,i)=><li key={i}>{line}</li>)}</ul>}</article>)}</section>
      <div className="nas-mobile-system">{p.sidebarVersion}<button type="button" className="nas-mobile-wide-action" onClick={p.onHide}><Lock size={18}/> Lock Mikan</button></div>
    </section>}
    <NasMobileNav active={view} onNavigate={destination=>{if(destination==="settings")p.onOpenSettings();else{if(destination==="chat")follow.current=true;setView(destination);}}}/>
  </section>;
}
