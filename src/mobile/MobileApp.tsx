import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, BookOpen, Cat, Check, Copy, History, Image, LoaderCircle, MessageCircle, Plus, Settings2, SlidersHorizontal, Sparkles, Square, Trash2 } from "lucide-react";
import mikanIcon from "../../assets/mikan-icon.svg";
import { ChatMarkdown } from "../components/ChatMarkdown";
import { PersonalityPresets, PersonalitySliders } from "../PersonalityControls";
import { CharacterCanonTab } from "../CharacterCanonTab";
import { personalityGuidance, findPreset, randomPersonality, PERSONALITY_TRAITS, type Personality } from "../personality";
import { parseSlashCommand, SLASH_HELP } from "../slash-commands";
import { loadSettings, saveSettings, loadPortrait, savePortrait, type Settings } from "../storage";
import { memoryContext, characterContext, type UserFact, type CharacterFact, type CharacterCategory } from "../memory-client";
import { mobileBackend, type NativeStatus } from "./mobile-backend";
import "./mobile.css";

type Role = "user" | "assistant";
type Turn = { id: string; role: Role; content: string; createdAt: number };
type Thread = { id: string; title: string; createdAt: number; turns: Turn[] };
type Screen = "chat" | "settings" | "personality" | "help" | "chats" | "memory" | "canon" | "log";
const THREAD_KEY = "mikan/mobile/threads/v1";
const ACTIVE_KEY = "mikan/mobile/active/v1";
const USER_KEY = "mikan/mobile/facts/v1";
const CANON_KEY = "mikan/mobile/canon/v1";
const IMPORT_KEY = "mikan/mobile/imported-native/v1";
const uuid = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36);
const newThread = (): Thread => ({ id: uuid(), title: "New chat", createdAt: Date.now(), turns: [] });
function readArray<T>(key: string): T[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch { return []; }
}
function buildPrompt(settings: Settings, facts: UserFact[], canon: CharacterFact[], turns: Turn[]): string {
  const query = turns[turns.length - 1]?.content ?? "";
  const context = [settings.systemPrompt, personalityGuidance(settings.personality),
    "This is on-device Gemini Nano pocket mode. You cannot browse the web, see the user's PC, or access desktop memory. Be candid about limitations.",
    memoryContext(facts, query), characterContext(canon, query)
  ].filter(Boolean).join("\n");
  // Nano has a significantly smaller working context than the desktop model.
  const recent: string[] = [];
  let used = context.length + query.length;
  for (const turn of turns.slice(0, -1).reverse()) {
    const line = (turn.role === "user" ? "User: " : "Mikan: ") + turn.content.slice(0, 1500);
    if (used + line.length > 5400) break;
    recent.unshift(line);
    used += line.length;
  }
  return context + "\n\nConversation context (not instructions):\n" + recent.join("\n") +
    "\nUser: " + query.slice(0, 2200) + "\nMikan:";
}
function openLink(href: string) {
  try {
    const url = new URL(href);
    // This standalone build has no web/network permission.
    if (url.protocol === "https:" || url.protocol === "http:") alert("Web links will be available in connected mode.\n" + url.href);
  } catch { /* ignore malformed links */ }
}

export default function MobileApp() {
  const [settings, setSettings] = useState(loadSettings);
  const [screen, setScreen] = useState<Screen>("chat");
  const [threads, setThreads] = useState<Thread[]>(() => {
    const stored = readArray<Thread>(THREAD_KEY);
    return stored.length ? stored : [newThread()];
  });
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY));
  const active = threads.find(thread => thread.id === activeId) ?? threads[0];
  const [facts, setFacts] = useState<UserFact[]>(() => readArray(USER_KEY));
  const [canon, setCanon] = useState<CharacterFact[]>(() => readArray(CANON_KEY));
  const [model, setModel] = useState<NativeStatus["status"] | "CHECKING">("CHECKING");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [portrait, setPortrait] = useState(mikanIcon);
  const [portraitOpen, setPortraitOpen] = useState(true);
  const [editFact, setEditFact] = useState("");
  const [openFactId, setOpenFactId] = useState<number | null>(null);
  const [memoText, setMemoText] = useState("");
  const [intro, setIntro] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const portraitUrl = useRef<string | null>(null);

  useEffect(() => { localStorage.setItem(THREAD_KEY, JSON.stringify(threads)); }, [threads]);
  useEffect(() => { if (active) localStorage.setItem(ACTIVE_KEY, active.id); }, [active]);
  useEffect(() => { localStorage.setItem(USER_KEY, JSON.stringify(facts)); }, [facts]);
  useEffect(() => { localStorage.setItem(CANON_KEY, JSON.stringify(canon)); }, [canon]);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => {
    if (localStorage.getItem(IMPORT_KEY) !== "done") {
      void mobileBackend.importLegacy().then(json => {
        const old = JSON.parse(json) as Turn[];
        const alreadyHasChat = readArray<Thread>(THREAD_KEY).some(thread => thread.turns.length > 0);
        if (!alreadyHasChat && Array.isArray(old) && old.length) {
          const migrated: Thread = { id: uuid(), title: "Earlier Pocket Mikan chat", createdAt: Date.now(), turns: old };
          setThreads([migrated]);
          setActiveId(migrated.id);
        }
        localStorage.setItem(IMPORT_KEY, "done");
      }).catch(() => {});
    }
    void mobileBackend.status().then(setModel).catch(failure => {
      setModel("UNAVAILABLE");
      setError(String(failure));
    });
    void loadPortrait().then(blob => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        portraitUrl.current = url;
        setPortrait(url);
      } else {
        void mobileBackend.portrait().then(url => {
          if (url && !portraitUrl.current) setPortrait(url);
        }).catch(() => {});
      }
    }).catch(() => {});
    return () => {
      if (portraitUrl.current) URL.revokeObjectURL(portraitUrl.current);
    };
  }, []);
  useEffect(() => { if (screen === "chat") bottom.current?.scrollIntoView({ block: "end" }); }, [screen, active?.turns.length]);
  useEffect(() => {
    // Shrink the artwork while the keyboard is up. CSS retains the composer in view.
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => setPortraitOpen(viewport.height > window.innerHeight * .72);
    viewport.addEventListener("resize", resize);
    resize();
    return () => viewport.removeEventListener("resize", resize);
  }, []);

  function updateSettings(change: Partial<Settings>) {
    setSettings(current => ({ ...current, ...change }));
  }
  function updateAppearance(change: Partial<Settings["appearance"]>) {
    setSettings(current => ({ ...current, appearance: { ...current.appearance, ...change } }));
  }
  function updatePersonality(personality: Personality) { updateSettings({ personality }); }
  function writeTurn(threadId: string, turn: Turn) {
    setThreads(items => items.map(thread => thread.id === threadId ? {
      ...thread,
      title: thread.turns.length === 0 && turn.role === "user" ? turn.content.slice(0, 48) : thread.title,
      turns: [...thread.turns, turn].slice(-200)
    } : thread));
  }
  function replaceTurn(threadId: string, id: string, content: string) {
    setThreads(items => items.map(thread => thread.id === threadId ? {
      ...thread, turns: thread.turns.map(turn => turn.id === id ? { ...turn, content } : turn)
    } : thread));
  }
  function startChat() {
    if (busy) return;
    const fresh = newThread();
    setThreads(items => [fresh, ...items]);
    setActiveId(fresh.id);
    setScreen("chat");
  }
  function addFact(fact: string): UserFact {
    const timestamp = Math.floor(Date.now() / 1000);
    const entry = { id: Date.now(), fact: fact.trim(), createdAt: timestamp, updatedAt: timestamp };
    setFacts(items => [...items, entry]);
    return entry;
  }
  function addCanon(category: CharacterCategory, label: string, value: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    const entry: CharacterFact = { id: Date.now(), personaId: "mikan", category, label, value, createdAt: timestamp, updatedAt: timestamp };
    setCanon(items => [...items, entry]);
  }
  function commandResponse(text: string) {
    setIntro(text);
    setScreen("chat");
  }
  function handleCommand(name: string, argument: string): boolean {
    if (["help", "settings", "personality", "chats", "log"].includes(name)) {
      setScreen(name === "help" ? "help" : name as Screen); return true;
    }
    if (name === "chat") { setScreen("chat"); return true; }
    if (name === "new") { startChat(); return true; }
    if (["appearance", "prompt", "portrait"].includes(name)) {
      setScreen("settings");
      if (name === "portrait") window.setTimeout(() => fileInput.current?.click(), 50);
      return true;
    }
    if (["memories", "canon"].includes(name)) {
      setScreen(name === "memories" ? "memory" : "canon"); return true;
    }
    if (name === "remember") {
      if (!argument) commandResponse("Usage: /remember <fact>");
      else { addFact(argument); commandResponse("Saved that fact locally on your phone."); }
      return true;
    }
    if (name === "forget") {
      const id = Number(argument.replace(/^#/, ""));
      if (!Number.isFinite(id)) commandResponse("Usage: /forget <fact id>");
      else { setFacts(items => items.filter(f => f.id !== id)); commandResponse("Removed local fact #" + id + "."); }
      return true;
    }
    if (name === "canon-set") {
      const colon = argument.indexOf(":");
      if (colon < 1) commandResponse("Usage: /canon-set <detail>: <value>");
      else {
        addCanon("other", argument.slice(0, colon).trim(), argument.slice(colon + 1).trim());
        commandResponse("Added that detail to phone-local Mikan canon.");
      }
      return true;
    }
    if (name === "canon-forget") {
      const id = Number(argument.replace(/^#/, ""));
      setCanon(items => items.filter(f => f.id !== id));
      commandResponse("Removed Mikan canon entry #" + id + ".");
      return true;
    }
    if (name === "randomize") {
      updatePersonality(randomPersonality()); commandResponse("Rolled a new personality mix."); return true;
    }
    if (name === "preset") {
      const preset = findPreset(argument);
      if (preset) updatePersonality({ ...preset.values });
      commandResponse(preset ? "Personality switched to " + preset.name + "." : "Unknown preset. Try classic, cozy, flirty, focused or chaos.");
      return true;
    }
    if (PERSONALITY_TRAITS.some(trait => trait.key === name)) {
      const score = Number(argument);
      if (!argument || !Number.isInteger(score) || score < 0 || score > 100) {
        commandResponse("Enter a number from 0 to 100.");
      } else updatePersonality({ ...settings.personality, [name]: score });
      if (argument && Number.isInteger(score) && score >= 0 && score <= 100)
        commandResponse(name + " set to " + score + "%.");
      return true;
    }
    if (["accent", "panel"].includes(name)) {
      if (/^#[0-9a-f]{6}$/i.test(argument)) {
        updateAppearance({ [name]: argument });
        commandResponse("Updated the " + name + " color.");
      } else commandResponse("Please enter a six-digit hex color, e.g. #ffad7e.");
      return true;
    }
    if (name === "opacity") {
      const value = Number(argument);
      if (value >= 65 && value <= 100) updateAppearance({ opacity: value / 100 });
      commandResponse(value >= 65 && value <= 100 ? "Opacity updated." : "Use 65–100%.");
      return true;
    }
    if (name === "fontsize") {
      const value = Number(argument);
      if (value >= 11 && value <= 20) updateAppearance({ fontSize: value });
      commandResponse(value >= 11 && value <= 20 ? "Font size updated." : "Use a size between 11 and 20.");
      return true;
    }
    if (name === "font") {
      const font = ["Segoe UI", "Arial", "Verdana", "Georgia"].find(f => f.toLowerCase() === argument.toLowerCase());
      if (font) updateAppearance({ fontFamily: font as Settings["appearance"]["fontFamily"] });
      commandResponse(font ? "Font updated." : "Choose Segoe UI, Arial, Verdana or Georgia.");
      return true;
    }
    const desktopOnly = new Set(["hide", "models", "model", "search", "read", "internet", "search-status", "search-start", "search-stop", "ollama", "searxng"]);
    if (desktopOnly.has(name)) {
      commandResponse("/" + name + " needs the desktop or a future PC-connected backend. Pocket mode is completely offline.");
      return true;
    }
    commandResponse("Unknown command /" + name + ". Type /help for available commands.");
    return true;
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setIntro("");
    const cmd = parseSlashCommand(text);
    if (cmd) { handleCommand(cmd.name, cmd.argument); return; }
    if (model !== "READY") { setIntro("Gemini Nano isn't ready yet. Check the model status first."); return; }
    setBusy(true);
    setError("");
    const threadId = active.id;
    const user: Turn = { id: uuid(), role: "user", content: text, createdAt: Date.now() };
    const assistant: Turn = { id: uuid(), role: "assistant", content: "", createdAt: Date.now() };
    writeTurn(threadId, user);
    writeTurn(threadId, assistant);
    let output = "";
    try {
      const answer = await mobileBackend.generate(buildPrompt(settings, facts, canon, [...active.turns, user]), chunk => {
        output += chunk;
        replaceTurn(threadId, assistant.id, output);
      });
      replaceTurn(threadId, assistant.id, answer);
    } catch (failure) {
      replaceTurn(threadId, assistant.id, output || "(No response)");
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  async function choosePortrait(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 15_000_000) {
      setError("Choose an image under 15 MB."); return;
    }
    try {
      await savePortrait(file);
      if (portraitUrl.current) URL.revokeObjectURL(portraitUrl.current);
      const url = URL.createObjectURL(file);
      portraitUrl.current = url;
      setPortrait(url);
    } catch (failure) { setError(String(failure)); }
  }
  const mobileStyle = {
    "--pocket-accent": settings.appearance.accent,
    "--pocket-panel": settings.appearance.panel,
    "--pocket-opacity": String(settings.appearance.opacity),
    "--pocket-font-size": settings.appearance.fontSize + "px",
    fontFamily: settings.appearance.fontFamily
  } as React.CSSProperties;
  const title = ({ chat: "Chat", settings: "Settings", personality: "Personality", help: "Commands", chats: "Conversations", memory: "User memories", canon: "About Mikan", log: "Conversation log" } as const)[screen];
  return <main className="pocket" style={mobileStyle}>
    <header className="pocket-header">
      <button className="pocket-icon-button" aria-label="Return to chat" onClick={() => setScreen("chat")}>{screen === "chat" ? <Cat size={25}/> : <ArrowLeft size={22}/>}</button>
      <div className="pocket-heading"><strong>{screen === "chat" ? "Mikan" : title}</strong><span>POCKET COMPANION · LOCAL</span></div>
      <button className="pocket-icon-button" aria-label="Settings" onClick={() => setScreen("settings")}><Settings2 size={23}/></button>
    </header>
    {screen === "chat" ? <>
      <section className="pocket-status">
        <span>{model === "READY" ? "● Gemini Nano ready · Offline" : model === "DOWNLOADABLE" ? "Local model needs download" : model === "DOWNLOADING" ? "Downloading local model…" : model === "CHECKING" ? "Checking Gemini Nano…" : "Gemini Nano unavailable"}</span>
        <button onClick={() => {
          setError("");
          void (model === "DOWNLOADABLE" ? mobileBackend.download() : mobileBackend.status()).then(setModel).catch(err => setError(String(err)));
        }} disabled={busy}>{model === "DOWNLOADABLE" ? "Download" : "Check"}</button>
      </section>
      <section className={"pocket-portrait " + (portraitOpen ? "" : "pocket-portrait-hidden")}>
        <img src={portrait} alt="Mikan's portrait" onClick={() => fileInput.current?.click()}/>
        {portrait === mikanIcon && <span>Tap to import Mikan's character portrait</span>}
        <button onClick={() => fileInput.current?.click()} aria-label="Change Mikan portrait"><Image size={15}/> Change</button>
      </section>
      <section className="pocket-transcript" aria-label="Chat history">
        {active.turns.length === 0 && <div className="pocket-welcome">Hey! Pocket Mikan reporting for duty. Let's see what this little phone-brain can do. ✨</div>}
        {active.turns.map(turn => <article className={"pocket-turn " + turn.role} key={turn.id}>
          <strong>{turn.role === "user" ? "YOU" : "MIKAN"}</strong>
          <div className="pocket-bubble">{turn.content ? <ChatMarkdown text={turn.content} onOpenLink={openLink}/> : <LoaderCircle size={16} className="spin"/>}</div>
        </article>)}
        {intro && <p className="pocket-notice">{intro}</p>}
        {error && <p className="pocket-error" role="alert">{error}</p>}
        <div ref={bottom}/>
      </section>
      <form className="pocket-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
        <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={2}
          placeholder="Chat with Mikan… (/help for commands)"
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}/>
        <button type={busy ? "button" : "submit"} aria-label={busy ? "Stop generation" : "Send message"}
          onClick={busy ? () => mobileBackend.cancel() : undefined}>
          {busy ? <Square size={20}/> : <ArrowUp size={21}/>}
        </button>
      </form>
      <nav className="pocket-nav" aria-label="Pocket navigation">
        <button onClick={() => setScreen("chats")}><History size={20}/>Chats</button>
        <button onClick={() => setScreen("memory")}><BookOpen size={20}/>Memory</button>
        <button onClick={() => setScreen("personality")}><SlidersHorizontal size={20}/>Persona</button>
        <button onClick={startChat}><Plus size={20}/>New</button>
      </nav>
    </> : <section className="pocket-page">
      {screen === "settings" && <>
        <h2>Mikan's settings</h2>
        <p className="pocket-hint">Using desktop Mikan's shared settings model. Phone values stay on this device until optional sync exists.</p>
        <h3>Personality</h3>
        <PersonalityPresets value={settings.personality} onChange={updatePersonality}/>
        <button className="pocket-wide-button" onClick={() => setScreen("personality")}><SlidersHorizontal size={18}/> Adjust individual traits</button>
        <h3>Appearance</h3>
        <div className="pocket-field"><label htmlFor="accent-color">Accent</label><input id="accent-color" type="color" value={settings.appearance.accent} onChange={event => updateAppearance({accent:event.target.value})}/></div>
        <div className="pocket-field"><label htmlFor="panel-color">Panel</label><input id="panel-color" type="color" value={settings.appearance.panel} onChange={event => updateAppearance({panel:event.target.value})}/></div>
        <div className="pocket-field"><label htmlFor="font-size">Text size · {settings.appearance.fontSize}px</label><input id="font-size" type="range" min="11" max="20" value={settings.appearance.fontSize} onChange={event => updateAppearance({fontSize:Number(event.target.value)})}/></div>
        <div className="pocket-field"><label htmlFor="font-family">Font</label><select id="font-family" value={settings.appearance.fontFamily} onChange={event => updateAppearance({fontFamily:event.target.value as Settings["appearance"]["fontFamily"]})}>{["Segoe UI","Arial","Verdana","Georgia"].map(font => <option key={font}>{font}</option>)}</select></div>
        <button className="pocket-wide-button" onClick={() => fileInput.current?.click()}><Image size={18}/> Choose portrait image</button>
        <h3>AI</h3>
        <p className="pocket-hint">Model: Gemini Nano (AICore), offline. Desktop Ollama models aren't installed on the phone.</p>
        <label className="pocket-field pocket-prompt">System prompt<textarea value={settings.systemPrompt} rows={6} onChange={event => updateSettings({ systemPrompt:event.target.value })}/></label>
        <p className="pocket-hint">Web search, automatic memory extraction, and PC connections require separate services. They aren't silently enabled here.</p>
        <button className="pocket-wide-button" onClick={() => setScreen("help")}>See supported slash commands</button>
      </>}
      {screen === "personality" && <>
        <h2>Personality controls</h2>
        <PersonalityPresets value={settings.personality} onChange={updatePersonality}/>
        <PersonalitySliders value={settings.personality} onChange={updatePersonality}/>
      </>}
      {screen === "help" && <>
        <p className="pocket-hint">The same slash-command definitions as desktop Mikan. Commands requiring Windows, Ollama or search are marked accordingly.</p>
        {SLASH_HELP.map(item => {
          const name = parseSlashCommand(item.insert.trimEnd())?.name ?? item.insert.split(" ")[0].slice(1);
          const disabled = ["search","search-start","search-stop","search-status","read","model","models","ollama","searxng","internet","hide"].includes(name);
          return <button className="pocket-command" key={item.usage} onClick={() => {
            if (disabled) { setIntro("That command needs the desktop or a future connected mode."); setScreen("chat"); }
            else { setDraft(item.insert); setScreen("chat"); }
          }}><code>{item.usage}</code><span>{item.description}{disabled ? " · Desktop only" : ""}</span></button>;
        })}
      </>}
      {screen === "chats" && <>
        <button className="pocket-wide-button" onClick={startChat}><Plus size={18}/> New conversation</button>
        {threads.map(thread => <div className="pocket-history-item" key={thread.id}>
          <button onClick={() => { setActiveId(thread.id); setScreen("chat"); }}><MessageCircle size={18}/><span>{thread.title}<small>{thread.turns.length} messages</small></span>{active.id === thread.id && <Check size={15}/>}</button>
          <button aria-label="Delete conversation" onClick={() => {
            if (!confirm("Delete this phone-local conversation?")) return;
            const next = threads.filter(t => t.id !== thread.id);
            const kept = next.length ? next : [newThread()];
            setThreads(kept);
            if (active.id === thread.id) setActiveId(kept[0].id);
          }}><Trash2 size={18}/></button>
        </div>)}
      </>}
      {screen === "memory" && <>
        <p className="pocket-hint">These are facts about you, stored on this phone only. They are not automatically shared with desktop Mikan.</p>
        <form onSubmit={event => { event.preventDefault(); if (memoText.trim()) { addFact(memoText); setMemoText(""); } }} className="pocket-memory-form">
          <textarea rows={3} value={memoText} onChange={event => setMemoText(event.target.value)} placeholder="Fact to remember…" maxLength={500}/>
          <button type="submit"><Plus size={18}/> Save local memory</button>
        </form>
        {facts.map(fact => <article className="pocket-fact" key={fact.id}>
          {openFactId === fact.id ? <><textarea value={editFact} onChange={event=>setEditFact(event.target.value)}/>
            <button onClick={() => { setFacts(items=>items.map(f=>f.id===fact.id?{...f,fact:editFact,updatedAt:Math.floor(Date.now()/1000)}:f));setOpenFactId(null);}}>Save</button></> : <p>{fact.fact}</p>}
          <small>#{fact.id}</small>
          <div className="pocket-actions"><button onClick={() => { setOpenFactId(fact.id);setEditFact(fact.fact); }}>Edit</button><button onClick={() => { if(confirm("Delete this memory?")) setFacts(items=>items.filter(f=>f.id!==fact.id)); }}>Delete</button></div>
        </article>)}
      </>}
      {screen === "canon" && <CharacterCanonTab facts={canon} onAdd={async (cat,label,value)=>addCanon(cat,label,value)}
        onEdit={async (id,cat,label,value)=>setCanon(items=>items.map(f=>f.id===id?{...f,category:cat,label,value,updatedAt:Math.floor(Date.now()/1000)}:f))}
        onDelete={async id=>setCanon(items=>items.filter(f=>f.id!==id))}/>}
      {screen === "log" && <>
        <button className="pocket-wide-button" onClick={() => void navigator.clipboard.writeText(active.turns.map(t => (t.role==="user"?"YOU":"MIKAN")+": "+t.content).join("\n\n")).catch(() => setError("Clipboard unavailable"))}><Copy size={18}/> Copy conversation</button>
        {active.turns.map(turn => <article className="pocket-fact" key={turn.id}><small>{turn.role === "user" ? "YOU" : "MIKAN"}</small><p>{turn.content}</p></article>)}
      </>}
      {error && <p className="pocket-error">{error}</p>}
    </section>}
    <input ref={fileInput} hidden type="file" accept="image/*" onChange={event => { void choosePortrait(event.target.files?.[0]); event.currentTarget.value=""; }}/>
    {screen !== "chat" && <footer className="pocket-page-footer"><button onClick={() => setScreen("chat")}><ArrowLeft size={16}/> Back to chat</button><span><Sparkles size={14}/> Mikan · local</span></footer>}
  </main>;
}
