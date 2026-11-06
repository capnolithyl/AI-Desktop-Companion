import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import {
  ArrowLeft, ArrowUp, Cat, Check, Clock3, GripHorizontal, History,
  LoaderCircle, MessageCircle, RotateCw, Settings2, Sparkles, SquarePen, X
} from "lucide-react";
import {
  DEFAULT_SETTINGS, loadPortrait, loadSettings, savePortrait, saveSettings,
  type Message, type Settings
} from "./storage";

type Screen = "compact" | "log" | "settings";
type Connection = { mode: "loading" | "online" | "offline"; text: string };
type ChatChunk = { requestId: string; content: string };
type OllamaStats = {
  outputTokens: number | null;
  promptTokens: number | null;
  totalDurationNs: number | null;
  loadDurationNs: number | null;
  promptEvalDurationNs: number | null;
  evalDurationNs: number | null;
};
type ChatCompletion = { content: string; stats: OllamaStats | null };
type Diagnostics = { elapsedMs: number; firstTokenMs: number | null; model: string; stats: OllamaStats | null };
type LogMessage = Message & { createdAt: number; diagnostics?: Diagnostics; failed?: boolean };
const HOTKEY = "Control+Alt+M";
const BUNDLED_PORTRAIT = "/mikan.png";

function errorText(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
}
function seconds(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}
function nanoseconds(ns: number | null | undefined): string | null {
  return typeof ns === "number" ? seconds(ns / 1_000_000) : null;
}
function rate(stats: OllamaStats | null): string | null {
  if (stats?.outputTokens == null || !stats.evalDurationNs) return null;
  return `${(stats.outputTokens / (stats.evalDurationNs / 1e9)).toFixed(1)} tok/s`;
}
function Metric({ title, value }: { title: string; value: string | number | null | undefined }) {
  if (value == null) return null;
  return <span className="metric" title={title}>{title}: <strong>{value}</strong></span>;
}
function ReplyMetrics({ diagnostics }: { diagnostics?: Diagnostics }) {
  if (!diagnostics) return null;
  const s = diagnostics.stats;
  return <div className="reply-metrics" aria-label="Response performance">
    <Metric title="Wall time" value={seconds(diagnostics.elapsedMs)} />
    <Metric title="First token" value={diagnostics.firstTokenMs == null ? null : seconds(diagnostics.firstTokenMs)} />
    <Metric title="Output" value={s?.outputTokens == null ? null : `${s.outputTokens} tokens`} />
    <Metric title="Speed" value={rate(s)} />
    <Metric title="Prompt" value={s?.promptTokens == null ? null : `${s.promptTokens} tokens`} />
    <Metric title="Model time" value={nanoseconds(s?.totalDurationNs)} />
    <Metric title="Load time" value={nanoseconds(s?.loadDurationNs)} />
    <Metric title="Prompt eval" value={nanoseconds(s?.promptEvalDurationNs)} />
    <span className="metric model-tag" title="Model used">{diagnostics.model}</span>
  </div>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("compact");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [draft, setDraft] = useState<Settings>(settings);
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [portrait, setPortrait] = useState<string | null>(BUNDLED_PORTRAIT);
  const [imageError, setImageError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [connection, setConnection] = useState<Connection>({ mode: "loading", text: "Checking Ollama…" });
  const [greeting, setGreeting] = useState("Hey! I'm Mikan. What are we working on?");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const portraitUrl = useRef<string | null>(null);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const goCompact = useCallback(() => {
    setScreen("compact");
    focusInput();
  }, [focusInput]);

  const showPortrait = useCallback((blob: Blob | null) => {
    if (portraitUrl.current) URL.revokeObjectURL(portraitUrl.current);
    const url = blob ? URL.createObjectURL(blob) : BUNDLED_PORTRAIT;
    portraitUrl.current = blob ? url : null;
    setPortrait(url);
  }, []);

  useEffect(() => {
    let active = true;
    void loadPortrait().then(blob => {
      if (active) showPortrait(blob);
    }).catch(() => setImageError("Could not load saved portrait."));
    return () => {
      active = false;
      if (portraitUrl.current) URL.revokeObjectURL(portraitUrl.current);
    };
  }, [showPortrait]);

  useEffect(() => {
    let hotkeyRegistered = false;
    let unlisten: UnlistenFn | null = null;
    let disposed = false;
    void register(HOTKEY, event => {
      if (event.state === "Pressed") void invoke("toggle_companion");
    }).then(() => {
      hotkeyRegistered = true;
      if (disposed) void unregister(HOTKEY);
    }).catch(error => console.warn("Mikan hotkey could not be registered:", error));

    void listen("mikan://opened", () => goCompact()).then(stop => {
      if (disposed) stop();
      else unlisten = stop;
    });

    return () => {
      disposed = true;
      unlisten?.();
      if (hotkeyRegistered) void unregister(HOTKEY);
    };
  }, [goCompact]);

  const refreshModels = useCallback(async (endpoint: string) => {
    setConnection({ mode: "loading", text: "Checking Ollama…" });
    try {
      const names = await invoke<string[]>("list_models", { endpoint });
      setAvailableModels(names);
      setConnection({
        mode: "online",
        text: names.length ? `Ollama ready · ${names.length} model${names.length === 1 ? "" : "s"}` : "Connected · no models installed"
      });
    } catch (error) {
      setAvailableModels([]);
      setConnection({ mode: "offline", text: errorText(error) });
    }
  }, []);
  useEffect(() => { void refreshModels(settings.endpoint); }, [refreshModels, settings.endpoint]);
  useEffect(() => {
    if (screen === "log") logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [screen, messages]);
  useEffect(() => { if (screen === "compact") focusInput(); }, [screen, focusInput]);

  const clearChat = () => {
    if (busy) return;
    setMessages([]);
    setGreeting("New conversation! What shall we talk about?");
    goCompact();
  };

  const openSettings = () => {
    setDraft(settings);
    setScreen("settings");
  };

  const choosePortrait = async (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) {
      setImageError("Choose a PNG, JPG, or WebP smaller than 15 MB.");
      return;
    }
    try {
      await savePortrait(file);
      showPortrait(file);
      setImageError(null);
    } catch (error) {
      setImageError(errorText(error));
    }
  };

  const saveConfiguration = () => {
    const updated = {
      endpoint: draft.endpoint.trim().replace(/\/+$/, ""),
      model: draft.model.trim(),
      systemPrompt: draft.systemPrompt.trim()
    };
    setSettings(updated);
    saveSettings(updated);
    goCompact();
  };

  const send = async () => {
    const text = input.trim();
    if (!text) return;

    // Commands are local UI actions, never sent to the LLM.
    const command = text.toLowerCase();
    if (command === "/log" || command === "/history") {
      setInput("");
      setScreen("log");
      return;
    }
    if (command === "/settings") {
      setInput("");
      openSettings();
      return;
    }
    if (command === "/chat") {
      setInput("");
      goCompact();
      return;
    }
    if (command === "/new" || command === "/clear") {
      setInput("");
      clearChat();
      return;
    }

    if (busy) return;
    const user: LogMessage = { id: crypto.randomUUID(), role: "user", content: text, createdAt: Date.now() };
    const assistantId = crypto.randomUUID();
    const history = [...messages, user];
    const requestId = crypto.randomUUID();
    setMessages([...history, { id: assistantId, role: "assistant", content: "", createdAt: Date.now() }]);
    setInput("");
    setBusy(true);
    goCompact();
    const started = performance.now();
    let firstTokenMs: number | null = null;
    let accumulated = "";
    let unlisten: UnlistenFn | null = null;

    try {
      unlisten = await listen<ChatChunk>("mikan://chat", event => {
        if (event.payload.requestId !== requestId || !event.payload.content) return;
        if (firstTokenMs == null) firstTokenMs = performance.now() - started;
        accumulated += event.payload.content;
        const currentText = accumulated;
        setMessages(current => current.map(m =>
          m.id === assistantId ? { ...m, content: currentText } : m
        ));
      });

      const completion = await invoke<ChatCompletion>("chat_stream", {
        request: {
          requestId,
          endpoint: settings.endpoint,
          model: settings.model,
          messages: [
            { role: "system", content: settings.systemPrompt },
            ...history.map(m => ({ role: m.role, content: m.content }))
          ]
        }
      });
      const duration = performance.now() - started;
      const diagnostics: Diagnostics = {
        elapsedMs: duration,
        firstTokenMs,
        model: settings.model,
        stats: completion.stats
      };
      const finalText = completion.content || accumulated || "(The model returned no visible text.)";
      setMessages(current => current.map(m =>
        m.id === assistantId ? { ...m, content: finalText, diagnostics } : m
      ));
    } catch (error) {
      const message = errorText(error);
      setMessages(current => current.map(m => m.id === assistantId
        ? {
            ...m,
            content: accumulated ? `${accumulated}\n\n[Interrupted: ${message}]` : `Error: ${message}`,
            failed: true,
            diagnostics: { elapsedMs: performance.now() - started, firstTokenMs, model: settings.model, stats: null }
          }
        : m
      ));
    } finally {
      unlisten?.();
      setBusy(false);
      focusInput();
    }
  };

  const lastReply = [...messages].reverse().find(m => m.role === "assistant");
  const replyText = lastReply?.content || (busy ? "Thinking…" : greeting);

  return <main className="companion">
    <div className="floating-controls">
      <div
        className="drag-handle"
        title="Drag to move Mikan"
        onMouseDown={event => {
          if (event.button === 0) void getCurrentWindow().startDragging().catch(console.warn);
        }}
      ><GripHorizontal size={22} /><span>DRAG MIKAN</span></div>
      <div className="control-buttons">
        <button className="circle-button" title="Chat history (/log)" aria-label="Chat history" onClick={() => setScreen("log")}><History size={18}/></button>
        <button className="circle-button" title="Settings (/settings)" aria-label="Settings" onClick={openSettings}><Settings2 size={18}/></button>
        <button className="circle-button close-button" title="Hide Mikan (Ctrl+Alt+M)" aria-label="Hide Mikan"
          onClick={() => void invoke("hide_companion")}><X size={19}/></button>
      </div>
    </div>

    <div className="portrait-space">
      {portrait ? (
        <img className="character-portrait" src={portrait} alt="Mikan, your desktop companion" draggable={false}
          onError={() => setPortrait(null)}/>
      ) : (
        <div className="missing-portrait">
          <Cat size={72} strokeWidth={1.4} />
          <span>Mikan is camera-shy today.</span>
          <button type="button" onClick={openSettings}>Choose portrait</button>
        </div>
      )}
    </div>

    <section className="dock" aria-label="Chat with Mikan">
      <div className="reply-panel" aria-live="polite">
        <div className="reply-header">
          <div><span className="cat-dot" /> <strong>MIKAN</strong></div>
          {busy && <LoaderCircle size={15} className="spin" />}
          {!busy && lastReply?.failed && <span className="error-caption">Error</span>}
        </div>
        <div className="latest-reply">{replyText}</div>
      </div>
      <div className="input-row">
        <textarea
          ref={inputRef}
          aria-label="Message Mikan"
          rows={2}
          placeholder="Message Mikan…  /log  /settings"
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className="send-button" aria-label="Send" title="Send message"
          disabled={busy || !input.trim()} onClick={() => void send()}>
          {busy ? <LoaderCircle className="spin" size={20}/> : <ArrowUp size={20}/>}
        </button>
      </div>
      <div className="dock-footer">
        <span className="connection-status" title={connection.text}>
          <span className={`status-dot ${connection.mode}`} />
          {connection.mode === "online" ? settings.model : connection.mode === "loading" ? "Connecting…" : "Ollama offline"}
        </span>
        <span>Ctrl + Alt + M to show/hide</span>
      </div>
    </section>

    {screen !== "compact" && <div className="panel-scrim" onMouseDown={goCompact} />}

    {screen === "log" && <section className="drawer" role="dialog" aria-label="Chat history">
      <header className="drawer-header">
        <button className="back-button" title="Back to companion" onClick={goCompact}><ArrowLeft size={19}/></button>
        <div className="drawer-title"><strong>Conversation log</strong><span>{messages.length} messages · this session</span></div>
        <button className="secondary-action" disabled={busy} onClick={clearChat}><SquarePen size={15}/> New</button>
      </header>
      <div className="log-body" ref={logRef}>
        {!messages.length && <div className="log-empty">
          <MessageCircle size={39}/><strong>Nothing here yet</strong>
          <span>Your conversations will appear here after chatting.</span>
        </div>}
        {messages.map(m => <article key={m.id} className={`log-message ${m.role}`}>
          <div className="log-message-header">
            <strong>{m.role === "user" ? "YOU" : "MIKAN"}</strong>
            <time>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </div>
          <p className={m.failed ? "message-error" : ""}>{m.content || (busy ? "Thinking…" : "")}</p>
          {m.role === "assistant" && <ReplyMetrics diagnostics={m.diagnostics}/>}
        </article>)}
      </div>
      <footer className="drawer-footer"><Clock3 size={14}/> Token counts and timings come from Ollama; wall time includes app overhead.</footer>
    </section>}

    {screen === "settings" && <section className="drawer" role="dialog" aria-label="Mikan settings">
      <header className="drawer-header">
        <button className="back-button" title="Back to companion" onClick={goCompact}><ArrowLeft size={19}/></button>
        <div className="drawer-title"><strong>Settings</strong><span>Mikan v0.2 · Local only</span></div>
        <button className="secondary-action" onClick={() => setDraft({ ...DEFAULT_SETTINGS })}><RotateCw size={14}/> Reset</button>
      </header>
      <div className="settings-body">
        <label className="setting-field">Ollama endpoint
          <input spellCheck={false} value={draft.endpoint} onChange={event => setDraft({ ...draft, endpoint: event.target.value })}/>
          <small>Local HTTP only. No API key required.</small>
        </label>
        <label className="setting-field">Model
          <input list="model-list" spellCheck={false} value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })}/>
          <datalist id="model-list">{availableModels.map(name => <option key={name} value={name}/>)}</datalist>
        </label>
        <button className="inline-action" onClick={() => void refreshModels(draft.endpoint)}><RotateCw size={14}/> Refresh models</button>
        <label className="setting-field">Personality prompt
          <textarea rows={6} value={draft.systemPrompt} onChange={event => setDraft({ ...draft, systemPrompt: event.target.value })}/>
        </label>
        <label className="setting-field">Character portrait
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void choosePortrait(event.target.files?.[0])}/>
          <small>The included portrait is the default. You can still replace it here.</small>
          {imageError && <small className="field-error">{imageError}</small>}
          {portrait && <span className="portrait-ready"><Check size={15}/> Portrait ready</span>}
        </label>
        <p className="settings-note"><Sparkles size={16}/> Chats currently last until you quit the app. Persistence and voice are coming later.</p>
      </div>
      <footer className="settings-footer">
        <button className="save-button" onClick={saveConfiguration}><Check size={17}/> Save settings</button>
      </footer>
    </section>}
  </main>;
}
