import { useState } from "react";
import { ArrowLeft, Check, MessageCircle, Plus, RotateCw, Star, Trash2, X } from "lucide-react";
import type { CharacterCategory, CharacterFact, InterestItem, MemoryConversation, UserFact } from "./memory-client";
import type { IncomingCanon, IncomingInterest } from "./interest-import";
import { InterestCollectionTab } from "./InterestCollectionTab";
import {MemoryImporter} from "./MemoryImporter";
import {MEMORY_CATEGORIES,parseTags,type ImportMemory,type MemoryCategory} from "./memory-import";
import { CharacterCanonTab } from "./CharacterCanonTab";
import { MemoryReviews } from "./MemoryReviews";
import type { SessionSummary } from "./memory-budget";

type Props = {
  embedded?: boolean;
  initialTab?: "chats" | "facts" | "character" | "collections";
  conversations: MemoryConversation[];
  sessionSummaries: SessionSummary[];
  facts: UserFact[];
  characterFacts: CharacterFact[];
  interests: InterestItem[];
  onImportInterests: (items:IncomingInterest[])=>Promise<{inserted:number;duplicates:number}>;
  onEditInterest: (id:number,item:IncomingInterest)=>Promise<void>;
  onDeleteInterest: (id:number)=>Promise<void>;
  onImportCharacter: (items:IncomingCanon[])=>Promise<{inserted:number;duplicates:number}>;
  autoRememberUser: boolean;
  autoRememberMikan: boolean;
  automaticError: string | null;
  onAutoRememberUserChange: (enabled: boolean) => void;
  onAutoRememberMikanChange: (enabled: boolean) => void;
  currentId: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onNew: () => void;
  onOpen: (id: string) => Promise<void>;
  onDeleteChat: (id: string) => Promise<void>;
  onDeleteSessionSummary: (conversationId: string) => Promise<void>;
  onAddFact: (fact: string) => Promise<void>;
  onEditFact: (id: number, fact: string) => Promise<void>;
  onDeleteFact: (id: number) => Promise<void>;
  onPinFact: (id: number, pinned: boolean) => Promise<void>;
  onUpdateFactMetadata: (id: number, category: MemoryCategory, tags: string[]) => Promise<void>;
  onImportFacts: (items: ImportMemory[]) => Promise<{inserted:number;duplicates:number}>;
  onExportFacts: () => Promise<{path:string;count:number}>;
  onReplaceFacts: (items: ImportMemory[], expectedCount: number) =>
    Promise<{inserted:number;oldCount:number;backupPath:string}>;
  onRefresh: () => Promise<void>;
  onAddCharacter: (category: CharacterCategory, label: string, value: string) => Promise<void>;
  onEditCharacter: (id: number, category: CharacterCategory, label: string, value: string) => Promise<void>;
  onDeleteCharacter: (id: number) => Promise<void>;
};

function shortDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Separate fact and conversation controls; no automatic memory extraction in phase one. */
export function MemoryPanel({
  embedded = false, initialTab = "facts", conversations, sessionSummaries, facts, characterFacts,
  interests,onImportInterests,onEditInterest,onDeleteInterest,onImportCharacter,
  autoRememberUser, autoRememberMikan, automaticError, onAutoRememberUserChange, onAutoRememberMikanChange,
  currentId, busy, error, onClose, onNew,
  onOpen, onDeleteChat, onDeleteSessionSummary, onAddFact, onEditFact, onDeleteFact, onPinFact,
  onUpdateFactMetadata, onImportFacts, onExportFacts, onReplaceFacts, onRefresh,
  onAddCharacter, onEditCharacter, onDeleteCharacter
}: Props) {
  const [tab, setTab] = useState<"chats" | "facts" | "character" | "collections">(initialTab);
  const [newFact, setNewFact] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [filterCategory,setFilterCategory]=useState<MemoryCategory|"all">("all");
  const [filterText,setFilterText]=useState("");
  const [visibleLimit,setVisibleLimit]=useState(100);
  const [organizeId,setOrganizeId]=useState<number|null>(null);
  const [organizeCategory,setOrganizeCategory]=useState<MemoryCategory>("other");
  const [organizeTags,setOrganizeTags]=useState("");
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

  const filteredFacts=facts.filter(f=>(filterCategory==="all"||f.category===filterCategory) &&
    (!filterText.trim() || [f.fact,f.category??"other",...(f.tags??[])].join(" ").toLowerCase().includes(filterText.trim().toLowerCase())));

  return <section className={embedded ? "drawer settings-inner-panel" : "drawer"}
    role={embedded ? "region" : "dialog"} aria-label="Mikan memory">
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
      <button type="button" className={tab === "collections" ? "active" : ""} onClick={() => setTab("collections")}>
        Interests ({interests.length})
      </button>
      <button type="button" className={tab === "character" ? "active" : ""} onClick={() => setTab("character")}>
        About Mikan ({characterFacts.length})
      </button>
      <button type="button" className={tab === "chats" ? "active" : ""} onClick={() => setTab("chats")}>
        Chats ({conversations.length})
      </button>
    </nav>
    <div className="memory-body">
      {(error || actionError) && <div className="memory-error" role="alert">{actionError || error}</div>}
      {automaticError && (autoRememberUser || autoRememberMikan) &&
        <p className="memory-auto-warning" role="status">{automaticError}</p>}
      {tab === "facts" ? <>
        <p className="memory-explainer">Facts about you that Mikan can refer to across conversations. You can save, correct, or delete any entry.</p>
        <label className="memory-auto-toggle">
          <input type="checkbox" checked={autoRememberUser}
            onChange={event => onAutoRememberUserChange(event.target.checked)}/>
          <span><strong>Automatically remember useful facts about you</strong>
            <small>Checks explicit, lasting details after a reply. Sensitive information is skipped by default.</small>
          </span>
        </label>
        <MemoryReviews onChanged={onRefresh}/>
        <MemoryImporter facts={facts} onImport={onImportFacts} onExport={onExportFacts} onReplace={onReplaceFacts}/>
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
        {!!facts.length && <div className="memory-filter">
          <input value={filterText} placeholder="Search facts or tags…" aria-label="Filter memories"
            onChange={e=>{setFilterText(e.target.value);setVisibleLimit(100);}}/>
          <select value={filterCategory} aria-label="Filter by memory category"
            onChange={e=>{setFilterCategory(e.target.value as MemoryCategory|"all");setVisibleLimit(100);}}>
            <option value="all">All categories ({facts.length})</option>
            {MEMORY_CATEGORIES.map(cat=><option value={cat.id} key={cat.id}>{cat.label}</option>)}
          </select>
          <small>{filteredFacts.length} matching memories</small>
        </div>}
        {facts.length>0 && !filteredFacts.length && <p className="memory-empty">No memories match those filters.</p>}
        {filteredFacts.slice(0,visibleLimit).map(fact => <article className="memory-item" key={fact.id}>
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
            <div className="memory-labels">
              <span>{MEMORY_CATEGORIES.find(cat=>cat.id===fact.category)?.label??"Other"}</span>
              {(fact.tags??[]).map(tag=><span key={tag}>#{tag}</span>)}
            </div>
            {organizeId===fact.id && <div className="memory-organize">
              <label>Category <select value={organizeCategory} onChange={e=>setOrganizeCategory(e.target.value as MemoryCategory)}>
                {MEMORY_CATEGORIES.map(cat=><option key={cat.id} value={cat.id}>{cat.label}</option>)}
              </select></label>
              <label>Tags <input aria-label="Memory tags" value={organizeTags} onChange={e=>setOrganizeTags(e.target.value)} placeholder="Separate tags with commas"/></label>
              <div className="memory-actions">
                <button type="button" disabled={working} onClick={()=>void run(async()=>{
                  await onUpdateFactMetadata(fact.id,organizeCategory,parseTags(organizeTags));setOrganizeId(null);
                })}><Check size={13}/> Save labels</button>
                <button type="button" onClick={()=>setOrganizeId(null)}>Cancel</button>
              </div>
            </div>}
            <div className="memory-actions">
              <small>#{fact.id} · {shortDate(fact.updatedAt)}
                {(fact.referenceCount ?? 0) > 0 && " · Recalled " + fact.referenceCount + "×"}</small>
              <button type="button" disabled={working}
                title={(fact.importance ?? 50) >= 90 ? "Remove from core profile" : "Keep in core profile"}
                onClick={() => void run(() => onPinFact(fact.id,(fact.importance ?? 50)<90))}>
                <Star size={13} fill={(fact.importance ?? 50)>=90 ? "currentColor":"none"}/>
                {(fact.importance ?? 50)>=90 ? "Pinned":"Pin"}
              </button>
              <button type="button" onClick={()=>{
                setOrganizeId(fact.id);setOrganizeCategory(fact.category??"other");setOrganizeTags((fact.tags??[]).join(", "));
              }}>Organize</button>
              <button type="button" onClick={() => { setEditId(fact.id); setEditValue(fact.fact); }}>Edit</button>
              {confirmId === `fact:${fact.id}` ? <>
                <button type="button" className="memory-danger" disabled={working}
                  onClick={() => void run(async () => { await onDeleteFact(fact.id); setConfirmId(null); })}>Confirm delete</button>
                <button type="button" onClick={() => setConfirmId(null)}>Cancel</button>
              </> : <button type="button" onClick={() => setConfirmId(`fact:${fact.id}`)}><Trash2 size={13}/> Delete</button>}
            </div>
          </>}
        </article>)}
        {filteredFacts.length>visibleLimit && <button type="button" className="secondary-action" onClick={()=>setVisibleLimit(n=>n+100)}>
          Show 100 more ({filteredFacts.length-visibleLimit} remaining)
        </button>}
      </> : tab === "collections" ? <>
        <InterestCollectionTab items={interests} onImport={onImportInterests}
          onEdit={onEditInterest} onDelete={onDeleteInterest}/>
      </> : tab === "character" ? <>
        <label className="memory-auto-toggle">
          <input type="checkbox" checked={autoRememberMikan}
            onChange={event => onAutoRememberMikanChange(event.target.checked)}/>
          <span><strong>Automatically remember Mikan's new preferences</strong>
            <small>When you ask about her interests, a specific answer can become part of her identity.</small>
          </span>
        </label>
        <CharacterCanonTab facts={characterFacts} onAdd={onAddCharacter}
          onEdit={onEditCharacter} onDelete={onDeleteCharacter} onImport={onImportCharacter}/>
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
          {sessionSummaries.find(s=>s.conversationId===chat.id &&
              !s.summary.startsWith("- No durable")) && <details className="memory-session-notes">
            <summary>Session notes</summary>
            <p style={{whiteSpace:"pre-line"}}>
              {sessionSummaries.find(s=>s.conversationId===chat.id)?.summary}
            </p>
            <small>Conversation continuity only, not verified permanent facts</small>
            <button type="button" className="secondary-action" disabled={working || busy}
              onClick={() => void run(()=>onDeleteSessionSummary(chat.id))}>
              <Trash2 size={12}/> Forget session notes
            </button>
          </details>}
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
    <footer className="drawer-footer">Your facts, interest collections, Mikan's canon and session notes are stored separately. Webpage knowledge remains independent.</footer>
  </section>;
}
