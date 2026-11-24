import { useEffect, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import {
  BookHeart, Cat, Eye, History, Layers3, MessageCircle, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Palette, PawPrint, Plus, Search, Settings2, Shirt, Smile, Sparkles, Volume2, VolumeX, X
} from "lucide-react";
import "./default-companion.css";

export type WorkspaceChat={id:string;title:string;updatedAt:number};
type Props={
  avatar:ReactNode; modelPicker:ReactNode; transcript:ReactNode; composer:ReactNode;
  chats:ReadonlyArray<WorkspaceChat>; activeConversationId:string|null;
  transcriptVersion:string; busy:boolean; muted:boolean; ready:boolean; memoryIssue:boolean; visionActive:boolean;
  modelLabel:string; displayName:string; lastActivity:string;
  onDrag:(event:ReactMouseEvent<HTMLElement>)=>void;
  onNewChat:()=>void; onOpenChat:(id:string)=>void; onOpenHistory:()=>void;
  onOpenMemory:()=>void; onOpenSettings:()=>void; onOpenSearch:()=>void;
  onOpenVision:()=>void; onAttach:()=>void; onVoice:()=>void;
  onMute:()=>void; onExpression:(kind:"smile"|"laugh"|"surprised"|"sad"|"angry"|"nod"|"shake")=>void; onOutfit:()=>void;
  onHide:()=>void;
};

type SidePanel = "chats" | "avatar";
function readPanelPreference(panel:SidePanel):boolean|null {
  try {
    const value=window.localStorage.getItem("mikan.workspace.panel."+panel);
    return value==="true"?true:value==="false"?false:null;
  } catch { return null; }
}
function savePanelPreference(panel:SidePanel,visible:boolean){
  try { window.localStorage.setItem("mikan.workspace.panel."+panel,String(visible)); }
  catch { /* Private storage or blocked localStorage: toggles still work in this session. */ }
}

/** Presentation only. No independent inference, conversations, or Iki instance.
 * All actions and JSX slots come from the existing App state.
 */
export function DefaultCompanionShell({
  avatar,modelPicker,transcript,composer,chats,activeConversationId,
  transcriptVersion,busy,muted,ready,memoryIssue,visionActive,modelLabel,displayName,lastActivity,
  onDrag,onNewChat,onOpenChat,onOpenHistory,onOpenMemory,onOpenSettings,onOpenSearch,
  onOpenVision,onAttach,onVoice,onMute,onExpression,onOutfit,onHide
}:Props){
  const feedRef=useRef<HTMLDivElement>(null);
  const [expressionMenuOpen,setExpressionMenuOpen]=useState(false);
  const [viewportWidth,setViewportWidth]=useState(()=>window.innerWidth);
  // Null means automatic responsive behavior. An explicit toggle is remembered.
  const [chatsPreference,setChatsPreference]=useState<boolean|null>(()=>readPanelPreference("chats"));
  const [avatarPreference,setAvatarPreference]=useState<boolean|null>(()=>readPanelPreference("avatar"));
  const showChats=chatsPreference??viewportWidth>830;
  const showAvatar=avatarPreference??viewportWidth>1030;
  useEffect(()=>{
    const resize=()=>setViewportWidth(window.innerWidth);
    window.addEventListener("resize",resize);
    return ()=>window.removeEventListener("resize",resize);
  },[]);
  const toggleChats=()=>{
    const next=!showChats;
    setChatsPreference(next);savePanelPreference("chats",next);
    if(next&&viewportWidth<960&&showAvatar){
      setAvatarPreference(false);savePanelPreference("avatar",false);
    }
  };
  const toggleAvatar=()=>{
    const next=!showAvatar;
    setAvatarPreference(next);savePanelPreference("avatar",next);
    if(next&&viewportWidth<960&&showChats){
      setChatsPreference(false);savePanelPreference("chats",false);
    }
    if(!next)setExpressionMenuOpen(false);
  };
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
      <span className={"workspace-status "+(memoryIssue?"error":ready?"ready":"starting")} role="status"
        title={memoryIssue?"Local memory needs attention":ready?"Local memory is available":"Local memory is loading"}>
        <span className="workspace-status-dot" aria-hidden="true"/>
        {memoryIssue?"Memory issue":ready?"Memory ready":"Memory loading"}
      </span>
      <div className="workspace-top-decoration" onMouseDown={onDrag} aria-hidden="true">
        <PawPrint size={21}/><span/><Sparkles size={13}/><PawPrint size={26}/>
      </div>
      <div className="workspace-top-actions">
        <button type="button" onClick={toggleChats} aria-pressed={showChats}
          aria-label={showChats?"Hide chat history panel":"Show chat history panel"}
          title={showChats?"Hide chat history":"Show chat history"}>
          {showChats?<PanelLeftClose size={19}/>:<PanelLeftOpen size={19}/>}
        </button>
        <button type="button" onClick={toggleAvatar} aria-pressed={showAvatar}
          aria-label={showAvatar?"Hide Mikan avatar panel":"Show Mikan avatar panel"}
          title={showAvatar?"Hide avatar panel":"Show avatar panel"}>
          {showAvatar?<PanelRightClose size={19}/>:<PanelRightOpen size={19}/>}
        </button>
        {visionActive&&<button type="button" className="workspace-vision-on" onClick={onOpenVision}
          title="Live Vision is on · Click to turn it off"><Eye size={17}/> Vision on</button>}
        <button type="button" onClick={onOpenSettings} title="Control Center" aria-label="Control Center"><Settings2 size={19}/></button>
        <button type="button" onClick={onHide} title="Hide Mikan" aria-label="Hide Mikan"><X size={19}/></button>
      </div>
    </header>
    <div className={"workspace-layout"+(showChats?" has-sidebar":"")+(showAvatar?" has-avatar":"")}>
      {showChats&&<aside className="workspace-sidebar" aria-label="Conversations">
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
      </aside>}
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
      {showAvatar&&<aside className="workspace-avatar-pane" aria-label="Animated Mikan companion">
        <div className="workspace-avatar-glow" aria-hidden="true"/>
        <div className="workspace-avatar-card">
          <div className="workspace-avatar-top">
            <PawPrint size={20}/><strong>Mikan ♡</strong><Sparkles size={15}/>
          </div>
          <div className="workspace-iki-stage" aria-label="Animated Mikan portrait">{avatar}</div>
          <div className="workspace-avatar-status" role="status">
            <PawPrint size={22}/>
            <span>{busy?"Thinking with you…":muted?"Here with you, quietly ♡":"Ready whenever you are ♡"}</span>
          </div>
        </div>
        <div className="workspace-companion-details" aria-label="Companion status">
          <div className="workspace-panel-heading">AT A GLANCE</div>
          <div className="workspace-detail-row">
            <span><Layers3 size={16}/> Selected model</span>
            <strong title={modelLabel}>{modelLabel}</strong>
          </div>
          <div className="workspace-detail-row">
            <span><BookHeart size={16}/> Local memory</span>
            <strong className={memoryIssue?"warning":ready?"positive":""}>
              {memoryIssue?"Issue":ready?"Ready":"Loading"}
            </strong>
          </div>
          <div className="workspace-detail-row">
            <span><Eye size={16}/> Live vision</span><strong>{visionActive?"Enabled":"Off"}</strong>
          </div>
          <div className="workspace-detail-row">
            <span>{muted?<VolumeX size={16}/>:<Volume2 size={16}/>} Voice output</span>
            <strong>{muted?"Muted":"Unmuted"}</strong>
          </div>
        </div>
        <div className="workspace-companion-activity" role="status">
          <div className="workspace-panel-heading">RIGHT NOW</div>
          <p>{busy?(lastActivity||"Thinking…"):"Just hanging out with you ♡"}</p>
        </div>
        <div className="workspace-avatar-actions" role="group" aria-label="Companion actions">
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
