import { useEffect, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import {
  BookHeart, Cat, Eye, History, MessageCircle,
  Palette, PawPrint, Plus, Search, Settings2, Shirt, Smile, Sparkles, Volume2, VolumeX, X
} from "lucide-react";
import "./default-companion.css";

export type WorkspaceChat={id:string;title:string;updatedAt:number};
type Props={
  avatar:ReactNode; modelPicker:ReactNode; transcript:ReactNode; composer:ReactNode;
  chats:ReadonlyArray<WorkspaceChat>; activeConversationId:string|null;
  transcriptVersion:string; busy:boolean; muted:boolean; ready:boolean; visionActive:boolean;
  modelLabel:string; displayName:string; lastActivity:string;
  onDrag:(event:ReactMouseEvent<HTMLElement>)=>void;
  onNewChat:()=>void; onOpenChat:(id:string)=>void; onOpenHistory:()=>void;
  onOpenMemory:()=>void; onOpenSettings:()=>void; onOpenSearch:()=>void;
  onOpenVision:()=>void; onAttach:()=>void; onVoice:()=>void;
  onMute:()=>void; onExpression:(kind:"smile"|"laugh"|"surprised"|"sad"|"angry"|"nod"|"shake")=>void; onOutfit:()=>void;
  onHide:()=>void;
};

/** Presentation only. No independent inference, conversations, or Iki instance.
 * All actions and JSX slots come from the existing App state.
 */
export function DefaultCompanionShell({
  avatar,modelPicker,transcript,composer,chats,activeConversationId,
  transcriptVersion,busy,muted,ready,visionActive,modelLabel,displayName,lastActivity,
  onDrag,onNewChat,onOpenChat,onOpenHistory,onOpenMemory,onOpenSettings,onOpenSearch,
  onOpenVision,onAttach,onVoice,onMute,onExpression,onOutfit,onHide
}:Props){
  const feedRef=useRef<HTMLDivElement>(null);
  const [expressionMenuOpen,setExpressionMenuOpen]=useState(false);
  // Hide AND unmount the real Iki player when space cannot accommodate it.
  // Merely CSS-hiding the canvas would leave an unnecessary GPU render loop.
  const [showAvatar,setShowAvatar]=useState(()=>window.innerWidth>1030);
  useEffect(()=>{
    const resize=()=>setShowAvatar(window.innerWidth>1030);
    window.addEventListener("resize",resize);
    return ()=>window.removeEventListener("resize",resize);
  },[]);
  useEffect(()=>{
    const el=feedRef.current;
    if(el)el.scrollTop=el.scrollHeight;
  },[transcriptVersion]);
  return <section className="mikan-workspace" aria-label="Mikan Desktop workspace">
    <header className="workspace-topbar">
      <div className="workspace-brand" onMouseDown={onDrag} title="Drag Mikan">
        <PawPrint size={28} strokeWidth={2.2}/>
        <span><strong>Mikan</strong><small>Your desktop companion</small></span>
        <Sparkles size={13} className="workspace-brand-sparkle"/>
      </div>
      <div className="workspace-model">{modelPicker}</div>
      <span className={"workspace-status "+(ready?"ready":"starting")} role="status">
        <span className="workspace-status-dot"/>{ready?"Ready":"Starting"}
      </span>
      <div className="workspace-top-decoration" onMouseDown={onDrag} aria-hidden="true">
        <PawPrint size={21}/><span/><Sparkles size={13}/><PawPrint size={26}/>
      </div>
      <div className="workspace-top-actions">
        {visionActive&&<button type="button" className="workspace-vision-on" onClick={onOpenVision}
          title="Live Vision is on · Click to turn it off"><Eye size={17}/> Vision on</button>}
        <button type="button" onClick={onOpenSettings} title="Control Center" aria-label="Control Center"><Settings2 size={19}/></button>
        <button type="button" onClick={onHide} title="Hide Mikan" aria-label="Hide Mikan"><X size={19}/></button>
      </div>
    </header>
    <div className="workspace-layout">
      <aside className="workspace-sidebar" aria-label="Conversations">
        <button type="button" className="workspace-new-chat" onClick={onNewChat} disabled={busy}>
          <Plus size={20}/> New chat
        </button>
        <div className="workspace-sidebar-label">RECENT CHATS</div>
        <nav className="workspace-recent">
          {chats.length===0&&<p className="workspace-empty-chats">Your conversations will appear here.</p>}
          {chats.slice(0,7).map(chat=><button type="button" key={chat.id}
            className={"workspace-chat-link"+(activeConversationId===chat.id?" active":"")}
            disabled={busy} title={chat.title} onClick={()=>onOpenChat(chat.id)}>
            <MessageCircle size={17}/><span>{chat.title||"Conversation"}</span>
          </button>)}
        </nav>
        <button type="button" className="workspace-see-all" onClick={onOpenHistory}>
          <History size={17}/> Chat history
        </button>
        <div className="workspace-sidebar-bottom">
          <div className="workspace-sidebar-cat" aria-hidden="true"><Cat size={44}/><Sparkles size={13}/></div>
          <button type="button" onClick={onOpenMemory} title="Open Memory & chats"><BookHeart size={20}/> Memory</button>
          <button type="button" onClick={onOpenSettings} title="Customize Mikan"><Palette size={20}/> Customize</button>
        </div>
      </aside>
      <section className="workspace-chat" aria-label="Current chat">
        <div className="workspace-chat-heading">
          <div className="workspace-heading-icon"><MessageCircle size={22}/></div>
          <div><strong>{displayName}</strong><small>{busy?lastActivity:"Chatting with Mikan ♡"}</small></div>
          <span className="workspace-chat-count">{modelLabel}</span>
        </div>
        <div className="workspace-transcript" ref={feedRef} role="log" aria-live="polite" aria-relevant="additions text">
          {transcript}
        </div>
        <div className="workspace-composer">
          <div className="workspace-action-chips" role="group" aria-label="Chat tools">
            <button type="button" onClick={onAttach}><Plus size={16}/> Attach</button>
            <button type="button" onClick={onVoice} title="Voice settings"><Volume2 size={16}/> Voice</button>
            <button type="button" onClick={onOpenVision} aria-pressed={visionActive}>
              <Eye size={17}/> {visionActive?"Vision on":"Vision"}
            </button>
            <button type="button" onClick={onOpenMemory}><BookHeart size={16}/> Memory</button>
            <button type="button" onClick={onOpenSearch}><Search size={17}/> Search</button>
          </div>
          {composer}
        </div>
      </section>
      {showAvatar && <aside className="workspace-avatar-pane" aria-label="Animated Mikan companion">
        <div className="workspace-avatar-glow" aria-hidden="true"/>
        <div className="workspace-avatar-top"><PawPrint size={20}/><strong>Mikan ♡</strong><Sparkles size={15}/></div>
        <div className="workspace-iki-stage">{avatar}</div>
        <div className="workspace-avatar-status">
          <PawPrint size={23}/>
          <span>{busy?"Thinking with you…":muted?"Here with you, quietly ♡":"Ready whenever you are ♡"}</span>
        </div>
        <div className="workspace-avatar-actions">
          <button type="button" onClick={onMute} aria-pressed={muted}>
            {muted?<VolumeX size={17}/>:<Volume2 size={17}/>} {muted?"Unmute":"Mute"}
          </button>
          <div className="workspace-expression-wrap">
            <button type="button" onClick={()=>setExpressionMenuOpen(open=>!open)}
              aria-haspopup="true" aria-expanded={expressionMenuOpen}
              title="Choose an Iki expression"><Smile size={17}/> Expression</button>
            {expressionMenuOpen&&<div className="workspace-expression-menu" role="group" aria-label="Play an Iki expression">
              {(["smile","laugh","surprised","sad","angry","nod","shake"] as const).map(kind=>
                <button type="button" key={kind} onClick={()=>{onExpression(kind);setExpressionMenuOpen(false);}}>
                  {kind[0].toUpperCase()+kind.slice(1)}
                </button>)}
            </div>}
          </div>
          <button type="button" onClick={onOutfit}><Shirt size={17}/> Outfit</button>
        </div>
      </aside>}
    </div>
  </section>;
}
