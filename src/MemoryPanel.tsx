import { useState } from "react";
import { ArrowLeft, Check, MessageCircle, Plus, RotateCw, Trash2, X } from "lucide-react";
import type { MemoryConversation, UserFact } from "./memory-client";

type Props = {
  initialTab?: "chats" | "facts";
  conversations: MemoryConversation[];
  facts: UserFact[];
  currentId: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onNew: () => void;
  onOpen: (id: string) => Promise<void>;
  onDeleteChat: (id: string) => Promise<void>;
  onAddFact: (fact: string) => Promise<void>;
  onEditFact: (id: number, fact: string) => Promise<void>;
  onDeleteFact: (id: number) => Promise<void>;
  onRefresh: () => Promise<void>;
};

function shortDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Separate fact and conversation controls; no automatic memory extraction in phase one. */
export function MemoryPanel({
  initialTab = "facts", conversations, facts, currentId, busy, error, onClose, onNew,
  onOpen, onDeleteChat, onAddFact, onEditFact, onDeleteFact, onRefresh
}: Props) {
  const [tab, setTab] = useState<"chats" | "facts">(initialTab);
  const [newFact, setNewFact] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setActionError(null);
    try { await work(); }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setWorking(false); }
  };

  return <section className="drawer" role="dialog" aria-label="Mikan memory">
    <header className="drawer-header">
      <button type="button" className="back-button" title="Back to companion" onClick={onClose}><ArrowLeft size={19}/></button>
      <div className="drawer-title"><strong>Memory</strong><span>Private SQLite storage on this PC</span></div>
      <button type="button" className="secondary-action" disabled={working}
        onClick={() => void run(onRefresh)}><RotateCw size={14}/> Refresh</button>
    </header>
    <nav className="memory-tabs" aria-label="Memory categories">
      <button type="button" className={tab === "facts" ? "active" : ""} onClick={() => setTab("facts")}>
        About you ({facts.length})
      </button>
      <button type="button" className={tab === "chats" ? "active" : ""} onClick={() => setTab("chats")}>
        Chats ({conversations.length})
      </button>
    </nav>
    <div className="memory-body">
      {(error || actionError) && <div className="memory-error" role="alert">{actionError || error}</div>}
      {tab === "facts" ? <>
        <p className="memory-explainer">Facts about you that Mikan can refer to in future conversations. Only things you explicitly save are added in this first version.</p>
        <form className="memory-add" onSubmit={e => {
          e.preventDefault();
          if (!newFact.trim()) return;
          void run(async () => { await onAddFact(newFact); setNewFact(""); });
        }}>
          <textarea value={newFact} maxLength={500} rows={3} aria-label="New fact"
            onChange={e => setNewFact(e.target.value)}
            placeholder="e.g. I love melodic black metal and strategy games."/>
          <button type="submit" className="save-button" disabled={working || !newFact.trim()}>
            <Plus size={15}/> Remember
          </button>
        </form>
        {!facts.length && <p className="memory-empty">Nothing saved yet. Use this form or /remember followed by a fact.</p>}
        {facts.map(fact => <article className="memory-item" key={fact.id}>
          {editId === fact.id ? <>
            <textarea value={editValue} maxLength={500} rows={3} aria-label="Edit memory"
              onChange={e => setEditValue(e.target.value)}/>
            <div className="memory-actions">
              <button type="button" disabled={working || !editValue.trim()}
                onClick={() => void run(async () => { await onEditFact(fact.id, editValue); setEditId(null); })}>
                <Check size={14}/> Save
              </button>
              <button type="button" onClick={() => setEditId(null)}><X size={14}/> Cancel</button>
            </div>
          </> : <>
            <p>{fact.fact}</p>
            <div className="memory-actions">
              <small>{shortDate(fact.updatedAt)}</small>
              <button type="button" onClick={() => { setEditId(fact.id); setEditValue(fact.fact); }}>Edit</button>
              {confirmId === `fact:${fact.id}` ? <>
                <button type="button" className="memory-danger" disabled={working}
                  onClick={() => void run(async () => { await onDeleteFact(fact.id); setConfirmId(null); })}>Confirm delete</button>
                <button type="button" onClick={() => setConfirmId(null)}>Cancel</button>
              </> : <button type="button" onClick={() => setConfirmId(`fact:${fact.id}`)}><Trash2 size={13}/> Delete</button>}
            </div>
          </>}
        </article>)}
      </> : <>
        <div className="memory-chat-top">
          <p className="memory-explainer">Conversations persist across restarts. Open one to continue where you left off.</p>
          <button type="button" className="secondary-action" disabled={busy || working} onClick={onNew}><Plus size={15}/> New chat</button>
        </div>
        {!conversations.length && <p className="memory-empty">No saved conversations yet.</p>}
        {conversations.map(chat => <article className="memory-item memory-chat" key={chat.id}>
          <button type="button" className="memory-chat-open" disabled={busy || working}
            onClick={() => void run(() => onOpen(chat.id))}>
            <MessageCircle size={16}/>
            <span><strong>{chat.title}</strong><small>{shortDate(chat.updatedAt)}</small></span>
            {currentId === chat.id && <span className="memory-current">Current</span>}
          </button>
          <div className="memory-actions">
            {confirmId === `chat:${chat.id}` ? <>
              <span>Delete conversation and all its messages?</span>
              <button type="button" className="memory-danger" disabled={busy || working}
                onClick={() => void run(async () => { await onDeleteChat(chat.id); setConfirmId(null); })}>Confirm delete</button>
              <button type="button" onClick={() => setConfirmId(null)}>Cancel</button>
            </> : <button type="button" disabled={busy || working} onClick={() => setConfirmId(`chat:${chat.id}`)}>
              <Trash2 size={13}/> Delete chat
            </button>}
          </div>
        </article>)}
      </>}
    </div>
    <footer className="drawer-footer">User facts and chat history are separate from Mikan's character canon and webpage knowledge.</footer>
  </section>;
}
