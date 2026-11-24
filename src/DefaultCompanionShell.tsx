import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  BookHeart, Check, Copy, Eye, History, Layers3, LoaderCircle, MessageCircle, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Palette, PawPrint, Plus, Search, Settings2, Shirt, Smile, Trash2, Volume2, VolumeX, X
} from "lucide-react";
import { clampPanelWidth, resolveWorkspaceWidths, resizeWorkspacePanel, type WorkspaceActivityEntry, type WorkspacePanel, type WorkspaceWidths } from "./workspace-activity";
import { type AvatarBackground } from "./avatar-background";
import { WorkspaceBrandArtwork, WorkspaceHeaderFlourish, WorkspacePeekCat } from "./WorkspaceDecor";
import "./default-companion.css";

export type WorkspaceChat={id:string;title:string;updatedAt:number};
type Props={
  avatar:ReactNode; modelPicker:ReactNode; transcript:ReactNode; composer:ReactNode;
  avatarBackground:AvatarBackground; onAvatarContextMenu:(event:ReactMouseEvent<HTMLElement>)=>void;
  chats:ReadonlyArray<WorkspaceChat>; activeConversationId:string|null;
  transcriptVersion:string; busy:boolean; muted:boolean; ready:boolean; memoryIssue:boolean; visionActive:boolean;
  displayName:string; lastActivity:string; visionBusy:boolean; activityEntries:ReadonlyArray<WorkspaceActivityEntry>;
  onDrag:(event:ReactMouseEvent<HTMLElement>)=>void;
  onNewChat:()=>void; onOpenChat:(id:string)=>void; onOpenHistory:()=>void;
  onCopyChatDebug:(id:string)=>Promise<void>; onDeleteChat:(id:string)=>Promise<void>; onOpenCurrentLog:()=>void;
  onOpenMemory:()=>void; onOpenSettings:()=>void; onOpenSearch:()=>void;
  onToggleVision:()=>void; onVoice:()=>void;
  onMute:()=>void; onExpression:(kind:"smile"|"laugh"|"surprised"|"sad"|"angry"|"nod"|"shake")=>void; onOutfit:()=>void;
  onHide:()=>void;
  unavailable?:{search?:boolean;voice?:boolean;vision?:boolean};
  webMode?:boolean;
  sidebarVersion?:ReactNode;
};

type SidePanel = WorkspacePanel;
const INITIAL_WIDTHS:WorkspaceWidths={chats:225,avatar:305};
function readPanelWidths():WorkspaceWidths {
  try {
    const stored=JSON.parse(window.localStorage.getItem("mikan.workspace.widths")??"null");
    return {chats:clampPanelWidth("chats",stored?.chats??INITIAL_WIDTHS.chats),avatar:clampPanelWidth("avatar",stored?.avatar??INITIAL_WIDTHS.avatar)};
  } catch { return INITIAL_WIDTHS; }
}
function savePanelWidths(widths:WorkspaceWidths){
  try {window.localStorage.setItem("mikan.workspace.widths",JSON.stringify(widths));}catch { /* Session-only fallback. */ }
}
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
  avatar,avatarBackground,onAvatarContextMenu,modelPicker,transcript,composer,chats,activeConversationId,
  transcriptVersion,busy,muted,ready,memoryIssue,visionActive,visionBusy,displayName,lastActivity,activityEntries,
  onDrag,onNewChat,onOpenChat,onOpenHistory,onCopyChatDebug,onDeleteChat,onOpenCurrentLog,onOpenMemory,onOpenSettings,onOpenSearch,
  onToggleVision,onVoice,onMute,onExpression,onOutfit,onHide,unavailable,webMode=false,sidebarVersion
}:Props){
  const feedRef=useRef<HTMLDivElement>(null);
  const [copyStatus,setCopyStatus]=useState<{id:string;state:"copying"|"copied"|"failed"}|null>(null);
  const copyBusyRef=useRef(false);
  const [confirmDelete,setConfirmDelete]=useState<string|null>(null);
  const [deleting,setDeleting]=useState<string|null>(null);
  const [deleteError,setDeleteError]=useState("");
  const deleteBusyRef=useRef(false);
  const deleteChat=async(id:string)=>{
    if(busy||deleteBusyRef.current||confirmDelete!==id)return;
    deleteBusyRef.current=true;setDeleting(id);setDeleteError("");
    try{await onDeleteChat(id);setConfirmDelete(null);}
    catch(error){setDeleteError(error instanceof Error?error.message:String(error));}
    finally{deleteBusyRef.current=false;setDeleting(null);}
  };
  const copyChat=async(id:string)=>{
    if(copyBusyRef.current)return;
    copyBusyRef.current=true;
    setCopyStatus({id,state:"copying"});
    try{
      await onCopyChatDebug(id);
      setCopyStatus({id,state:"copied"});
    }catch(error){
      console.warn("Could not copy conversation debug log:",error);
      setCopyStatus({id,state:"failed"});
    }finally{
      copyBusyRef.current=false;
    }
  };
  useEffect(()=>{
    if(!copyStatus||copyStatus.state==="copying")return;
    const timer=window.setTimeout(()=>setCopyStatus(null),3500);
    return ()=>window.clearTimeout(timer);
  },[copyStatus]);
  const [expressionMenuOpen,setExpressionMenuOpen]=useState(false);
  const backgroundImage=avatarBackground==="plain"?undefined:
    `url("${import.meta.env.BASE_URL}mikan-backgrounds/${avatarBackground}.webp")`;
  const [viewportWidth,setViewportWidth]=useState(()=>window.innerWidth);
  // Null means automatic responsive behavior. An explicit toggle is remembered.
  const [chatsPreference,setChatsPreference]=useState<boolean|null>(()=>readPanelPreference("chats"));
  const [avatarPreference,setAvatarPreference]=useState<boolean|null>(()=>readPanelPreference("avatar"));
  const showChats=chatsPreference??viewportWidth>830;
  const showAvatar=(avatarPreference??viewportWidth>1030)&&(!showChats||viewportWidth>=830);
  const [preferredWidths,setPreferredWidths]=useState(readPanelWidths);
  const [draggingPanel,setDraggingPanel]=useState<WorkspacePanel|null>(null);
  const dragRef=useRef<{panel:WorkspacePanel;x:number;width:number}|null>(null);
  const layoutWidth=Math.max(0,viewportWidth-26);
  const widths=resolveWorkspaceWidths(layoutWidth,preferredWidths,showChats,showAvatar);
  const changePanelWidth=(panel:WorkspacePanel,value:number)=>{
    const other=panel==="chats"?"avatar":"chats";
    const next=resizeWorkspacePanel(panel,value,layoutWidth,widths[other],other==="chats"?showChats:showAvatar);
    setPreferredWidths(previous=>({...previous,[panel]:next}));
  };
  useEffect(()=>{savePanelWidths(preferredWidths);},[preferredWidths]);
  const beginResize=(panel:WorkspacePanel,event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0)return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current={panel,x:event.clientX,width:widths[panel]};
    setDraggingPanel(panel);
  };
  const moveResize=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const drag=dragRef.current;if(!drag)return;
    changePanelWidth(drag.panel,drag.width+(event.clientX-drag.x)*(drag.panel==="chats"?1:-1));
  };
  const endResize=()=>{dragRef.current=null;setDraggingPanel(null);};
  const renderDivider=(panel:WorkspacePanel)=><div
    className={"workspace-divider "+(draggingPanel===panel?"dragging":"")}
    role="separator" aria-orientation="vertical" tabIndex={0}
    aria-label={panel==="chats"?"Resize conversation sidebar":"Resize companion sidebar"}
    aria-valuemin={panel==="chats"?160:235} aria-valuemax={panel==="chats"?440:540} aria-valuenow={widths[panel]}
    title="Drag to resize · Double-click to reset"
    onPointerDown={event=>beginResize(panel,event)} onPointerMove={moveResize}
    onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={endResize}
    onDoubleClick={()=>changePanelWidth(panel,INITIAL_WIDTHS[panel])}
    onKeyDown={event=>{
      if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight"&&event.key!=="Home")return;
      event.preventDefault();
      changePanelWidth(panel,event.key==="Home"?INITIAL_WIDTHS[panel]:widths[panel]+(event.key==="ArrowRight"?1:-1)*(panel==="chats"?1:-1)*16);
    }}/>;

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
        <WorkspaceBrandArtwork/>
      </div>
      <div className="workspace-top-decoration" onMouseDown={onDrag} aria-hidden="true">
        <WorkspaceHeaderFlourish/>
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
        <button type="button" onClick={onOpenSettings} title="Control Center" aria-label="Control Center"><Settings2 size={19}/></button>
        <button type="button" onClick={onHide} title={webMode?"Lock Mikan":"Hide Mikan"} aria-label={webMode?"Lock Mikan":"Hide Mikan"}><X size={19}/></button>
      </div>
    </header>
    <div className={"workspace-layout"+(showChats?" has-sidebar":"")+(showAvatar?" has-avatar":"")+(draggingPanel?" resizing":"")}
      style={{"--workspace-left":widths.chats+"px","--workspace-right":widths.avatar+"px"} as CSSProperties}>
      {showChats&&<aside className="workspace-sidebar" aria-label="Conversations">
        <button type="button" className="workspace-new-chat" onClick={onNewChat} disabled={busy||deleting!==null}>
          <Plus size={20}/> New chat
        </button>
        <div className="workspace-sidebar-label">RECENT CHATS</div>
        <nav className="workspace-recent">
          {chats.length===0&&<p className="workspace-empty-chats">Your conversations will appear here.</p>}
          {chats.slice(0,7).map(chat=>{
            const status=copyStatus?.id===chat.id?copyStatus.state:null;
            const copyLabel=status==="copied"?"Copied debug log":status==="failed"?"Copy failed; retry debug log":"Copy debug log";
            return <div key={chat.id} className="workspace-chat-entry"><div className={"workspace-chat-row"+(activeConversationId===chat.id?" active":"")}>
              <button type="button" className="workspace-chat-link"
                disabled={busy||deleting!==null} title={chat.title} onClick={()=>onOpenChat(chat.id)}>
                <MessageCircle size={17}/><span>{chat.title||"Conversation"}</span>
              </button>
              <button type="button" className={"workspace-chat-copy"+(status?" "+status:"")}
                disabled={copyStatus?.state==="copying"||deleting!==null} title={copyLabel+" · Review before sharing"}
                aria-label={copyLabel+" for "+(chat.title||"conversation")}
                onClick={()=>void copyChat(chat.id)}>
                {status==="copying"?<LoaderCircle size={15} className="spin"/>:status==="copied"?<Check size={15}/>:status==="failed"?<X size={15}/>:<Copy size={15}/>}
              </button>
              <button type="button" className={"workspace-chat-delete"+(confirmDelete===chat.id?" confirming":"")}
                disabled={busy||deleting!==null||copyStatus?.state==="copying"}
                title="Delete chat" aria-label={"Delete chat "+(chat.title||"Conversation")}
                onClick={()=>{setConfirmDelete(chat.id);setDeleteError("");}}>
                <Trash2 size={15}/>
              </button>
            </div>
            {confirmDelete===chat.id&&<div className="workspace-chat-delete-confirm" role="group" aria-label="Confirm conversation deletion">
              <span>Delete this chat and its messages?</span>
              {deleteError&&<small role="alert">{deleteError}</small>}
              <div>
                <button type="button" className="workspace-chat-delete-accept" disabled={busy||deleting!==null} onClick={()=>void deleteChat(chat.id)}>
                  {deleting===chat.id?<LoaderCircle size={13} className="spin"/>:<Trash2 size={13}/>} Delete
                </button>
                <button type="button" disabled={deleting!==null} onClick={()=>{setConfirmDelete(null);setDeleteError("");}}>Cancel</button>
              </div>
            </div>}
            </div>;
          })}
        </nav>
        <span className="workspace-copy-announcement" role="status">
          {copyStatus?.state==="copied"?"Debug log copied to clipboard. Review before sharing.":copyStatus?.state==="failed"?"Could not copy debug log. Please try again.":""}
        </span>
        <button type="button" className="workspace-see-all" disabled={deleting!==null} onClick={onOpenHistory}>
          <History size={17}/> Chat history
        </button>
        <div className="workspace-sidebar-bottom">
          <div className="workspace-sidebar-cat" aria-hidden="true"><WorkspacePeekCat/></div>
          {sidebarVersion}
          <button type="button" onClick={onOpenSettings} title="Customize Mikan"><Palette size={20}/> Customize</button>
        </div>
      </aside>}
      {showChats&&renderDivider("chats")}
      <section className="workspace-chat" aria-label="Current chat">
        <div className="workspace-chat-heading">
          <div className="workspace-heading-icon"><MessageCircle size={22}/></div>
          <div><strong>{displayName}</strong><small>{busy?lastActivity:"Chatting with Mikan ♡"}</small></div>
          <button type="button" className="workspace-open-log" onClick={onOpenCurrentLog}
            aria-label="Open current conversation log" title="Current conversation log and diagnostics">
            <History size={18}/><span>Conversation log</span>
          </button>
        </div>
        <div className="workspace-transcript" ref={feedRef} role="log" aria-live="polite" aria-relevant="additions text">
          {transcript}
        </div>
        <div className="workspace-composer">
          <div className="workspace-action-chips" role="group" aria-label="Chat tools">
            <button type="button" disabled={unavailable?.search} title={unavailable?.search?"Web research not connected yet":undefined} onClick={onOpenSearch}><Search size={17}/> Search</button>
          </div>
          {composer}
        </div>
      </section>
      {showAvatar&&renderDivider("avatar")}
      {showAvatar&&<aside className="workspace-avatar-pane" aria-label="Animated Mikan companion">
        <div className="workspace-avatar-glow" aria-hidden="true"/>
        <div className="workspace-avatar-card" data-background={avatarBackground}
          onContextMenu={onAvatarContextMenu}
          style={backgroundImage?{"--workspace-avatar-background":backgroundImage} as CSSProperties:undefined}>
          <div className="workspace-iki-stage" aria-label="Animated Mikan portrait">{avatar}</div>
          <div className="workspace-avatar-status" role="status">
            <PawPrint size={22}/>
            <span>{busy?"Thinking with you…":muted?"Here with you, quietly ♡":"Ready whenever you are ♡"}</span>
          </div>
        </div>
        <div className="workspace-companion-details" aria-label="Companion controls">
          <div className="workspace-panel-heading">CONTROLS</div>
          <div className="workspace-model-label"><Layers3 size={16}/> Inference model</div>
          <div className="workspace-model">{modelPicker}</div>
          <button type="button" className="workspace-detail-row workspace-memory-control" onClick={onOpenMemory}
            title="Open local memory and manage saved facts">
            <span><BookHeart size={16}/> Memory</span>
            <strong className={memoryIssue?"warning":ready?"positive":""}>
              <span className={"workspace-status-dot "+(memoryIssue?"error":ready?"ready":"")} aria-hidden="true"/>
              {memoryIssue?"Issue":ready?"Ready":"Loading"}
            </strong>
          </button>
          <div className="workspace-detail-row">
            <span><Eye size={16}/> Live Vision</span>
            <button type="button" className="workspace-switch" role="switch" aria-checked={visionActive}
              aria-label="Live Vision" disabled={visionBusy||unavailable?.vision} onClick={onToggleVision}
              title={visionActive?"Stop ongoing screen capture":"Start Live Vision using the configured display or region"}>
              <span className="workspace-switch-track" aria-hidden="true"/>{visionActive?"On":"Off"}
            </button>
          </div>
          <div className="workspace-detail-row">
            <span>{muted?<VolumeX size={16}/>:<Volume2 size={16}/>} Voice output</span>
            <button type="button" className="workspace-switch" role="switch" aria-checked={!muted}
              aria-label="Voice output" disabled={unavailable?.voice} onClick={onMute} title={muted?"Unmute Mikan":"Mute Mikan"}>
              <span className="workspace-switch-track" aria-hidden="true"/>{muted?"Off":"On"}
            </button>
          </div>
        </div>
        <div className="workspace-avatar-actions" role="group" aria-label="Companion actions">
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
          <button type="button" onClick={onVoice} disabled={unavailable?.voice} title={unavailable?.voice?"Voice not connected yet":"Voice settings"}><Settings2 size={16}/> Voice settings</button>
        </div>
        <section className="workspace-activity-log" aria-label="Conversation activity">
          <div className="workspace-activity-heading">
            <div className="workspace-panel-heading">ACTIVITY LOG</div>
            <small>Current chat</small>
          </div>
          {busy&&<p className="workspace-activity-live" role="status"><span className="workspace-live-pulse"/>{lastActivity||"Working…"}</p>}
          <div className="workspace-activity-feed" role="log" aria-live="polite" aria-relevant="additions text">
            {!activityEntries.length&&<p className="workspace-activity-empty">Memories recalled and web searches will appear here as Mikan works.</p>}
            {activityEntries.map(entry=><article key={entry.id} className="workspace-activity-entry">
              <div className="workspace-activity-entry-title">
                {entry.kind==="memory"?<BookHeart size={16}/>:<Search size={16}/>}
                <strong>{entry.title}</strong>
                <time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</time>
              </div>
              {entry.detail&&<p className="workspace-activity-detail">{entry.detail}</p>}
              {entry.lines.length>0&&<ul>{entry.lines.map((line,i)=><li key={i}>{line}</li>)}</ul>}
            </article>)}
          </div>
        </section>
      </aside>}
    </div>
  </section>;
}
