import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import {
  ArrowUp, Cat, Check, CircleHelp, ImagePlus, LoaderCircle, MessageCircle,
  Minus, RotateCw, Settings2, Sparkles, SquarePen, X
} from "lucide-react";
import {
  DEFAULT_SETTINGS, loadPortrait, loadSettings, savePortrait, saveSettings,
  type Message, type Settings
} from "./storage";

type ChatChunk = { requestId: string; content: string; done: boolean };
type Connection = { mode: "loading" | "online" | "offline"; message: string };
type Screen = "chat" | "settings";
const HOTKEY = "Control+Alt+M";

function formatError(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("chat");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [draft, setDraft] = useState<Settings>(settings);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [bubble, setBubble] = useState("Hey, I'm Mikan. What are we working on?");
  const [portrait, setPortrait] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [connection, setConnection] = useState<Connection>({ mode: "loading", message: "Checking Ollama…" });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const portraitUrl = useRef<string | null>(null);

  const showPortrait = useCallback((blob: Blob | null) => {
    if (portraitUrl.current) URL.revokeObjectURL(portraitUrl.current);
    const url = blob ? URL.createObjectURL(blob) : null;
    portraitUrl.current = url;
    setPortrait(url);
  }, []);

  useEffect(() => {
    let alive = true;
    void loadPortrait().then(blob => {
      if (alive) showPortrait(blob);
    }).catch(() => setImageError("Could not read saved portrait."));
    return () => {
      alive = false;
      if (portraitUrl.current) URL.revokeObjectURL(portraitUrl.current);
    };
  }, [showPortrait]);

  useEffect(() => {
    let registered = false;
    void register(HOTKEY, event => {
      if (event.state === "Pressed") void invoke("toggle_companion");
    }).then(() => { registered = true; }).catch(error => {
      console.warn("Global hotkey unavailable:", error);
    });
    return () => { if (registered) void unregister(HOTKEY); };
  }, []);

  const refreshModels = useCallback(async (endpoint: string) => {
    setConnection({ mode: "loading", message: "Checking Ollama…" });
    try {
      const models = await invoke<string[]>("list_models", { endpoint });
      setAvailableModels(models);
      setConnection({
        mode: "online",
        message: models.length ? `Ollama connected · ${models.length} model${models.length === 1 ? "" : "s"}` : "Connected · no models installed"
      });
    } catch (error) {
      setAvailableModels([]);
      setConnection({ mode: "offline", message: formatError(error) });
    }
  }, []);

  useEffect(() => { void refreshModels(settings.endpoint); }, [refreshModels, settings.endpoint]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (screen === "chat") inputRef.current?.focus();
  }, [screen]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;

    const user: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const replyId = crypto.randomUUID();
    const history: Message[] = [...messages, user];
    const requestId = crypto.randomUUID();
    setMessages([...history, { id: replyId, role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setBubble("Thinking…");
    let unlisten: UnlistenFn | null = null;
    let receivedText = "";

    try {
      unlisten = await listen<ChatChunk>("mikan://chat", event => {
        if (event.payload.requestId !== requestId) return;
        const delta = event.payload.content;
        if (!delta) return;
        receivedText += delta;
        setMessages(current => current.map(message =>
          message.id === replyId ? { ...message, content: receivedText } : message
        ));
        setBubble(receivedText);
      });

      await invoke("chat_stream", {
        request: {
          requestId,
          endpoint: settings.endpoint,
          model: settings.model,
          messages: [
            { role: "system", content: settings.systemPrompt },
            ...history.map(message => ({ role: message.role, content: message.content }))
          ]
        }
      });

      if (!receivedText.trim()) {
        setMessages(current => current.map(message =>
          message.id === replyId ? { ...message, content: "(No text returned by the model.)" } : message
        ));
        setBubble("No response text returned. Try another model.");
      }
    } catch (error) {
      const message = formatError(error);
      setMessages(current => current.map(item =>
        item.id === replyId ? { ...item, content: receivedText ? `${receivedText}\n\n[Interrupted: ${message}]` : `Error: ${message}` } : item
      ));
      setBubble("I couldn't get an answer. Check the chat for details.");
      setConnection(old => old.mode === "online" ? { mode: "offline", message } : old);
    } finally {
      unlisten?.();
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const choosePortrait = async (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setImageError("Please choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setImageError("Portraits must be smaller than 15 MB.");
      return;
    }
    try {
      await savePortrait(file);
      showPortrait(file);
      setImageError(null);
    } catch (error) {
      setImageError(formatError(error));
    }
  };

  const applySettings = () => {
    const updated = {
      endpoint: draft.endpoint.trim().replace(/\/+$/, ""),
      model: draft.model.trim(),
      systemPrompt: draft.systemPrompt.trim()
    };
    setSettings(updated);
    saveSettings(updated);
    setScreen("chat");
  };

  return (
    <main className="window-shell">
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className="brand-mark"><Cat size={21} strokeWidth={2.2} /></span>
          <div data-tauri-drag-region><strong>Mikan</strong><small>Desktop Companion · Prototype 0.1</small></div>
        </div>
        <div className="title-actions">
          <span className="hotkey">Ctrl + Alt + M</span>
          <button type="button" className="icon-button" aria-label="Hide Mikan"
            onClick={() => void invoke("hide_companion")}><Minus size={19} /></button>
          <button type="button" className="icon-button" aria-label="Hide Mikan"
            onClick={() => void invoke("hide_companion")}><X size={19} /></button>
        </div>
      </header>

      <section className="app-body">
        <aside className="character-pane">
          <div className="character-label"><span className="online-dot" /> YOUR DESKTOP COMPANION</div>
          <div className="character-stage">
            {portrait
              ? <img className="portrait" src={portrait} alt="Mikan" />
              : <div className="portrait-placeholder">
                  <Cat size={105} strokeWidth={1} />
                  <strong>Mikan's portrait goes here</strong>
                  <span>Choose the PNG we've already designed.</span>
                  <button className="secondary-button" type="button" onClick={() => setScreen("settings")}><ImagePlus size={16}/> Choose portrait</button>
                </div>
            }
          </div>
          <div className="speech-bubble">
            <span className="speech-label"><Sparkles size={14} /> MIKAN SAYS</span>
            <p>{bubble}</p>
          </div>
          <div className="character-footnote">Local-first. No subscription. Entirely your problem now.</div>
        </aside>

        <div className="right-pane">
          <div className="tab-bar">
            <button className={screen === "chat" ? "tab active" : "tab"} onClick={() => setScreen("chat")}>
              <MessageCircle size={17} /> Chat
            </button>
            <button className={screen === "settings" ? "tab active" : "tab"} onClick={() => { setDraft(settings); setScreen("settings"); }}>
              <Settings2 size={17} /> Settings
            </button>
            <span className="tab-spacer" />
            {screen === "chat" && <button type="button" className="small-button" disabled={busy}
              onClick={() => { setMessages([]); setBubble("A fresh start! What's on your mind?"); }}>
              <SquarePen size={15} /> New chat
            </button>}
          </div>

          {screen === "chat" ? (
            <>
              <div className="connection-row">
                <span className={`connection-indicator ${connection.mode}`} />
                <span title={connection.message}>{connection.message}</span>
                <button className="icon-button quiet" title="Refresh Ollama connection"
                  onClick={() => void refreshModels(settings.endpoint)}><RotateCw size={16} /></button>
              </div>

              <div className="message-list" ref={scrollRef} aria-live="polite">
                {!messages.length && <div className="empty-chat">
                  <span className="empty-icon"><Sparkles size={32} /></span>
                  <h1>She's all ears.</h1>
                  <p>Say hello, ask a question, or test how much personality a few billion parameters can manage.</p>
                  <span>First launch? Install a model and check Settings.</span>
                </div>}
                {messages.map(message => (
                  <div key={message.id} className={`message ${message.role}`}>
                    <div className="message-name">{message.role === "user" ? "YOU" : "MIKAN"}</div>
                    <div className="message-text">
                      {message.content || (busy && <span className="typing"><i/><i/><i/></span>)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="composer">
                <textarea
                  ref={inputRef}
                  value={input}
                  aria-label="Message Mikan"
                  placeholder="Ask Mikan anything…"
                  rows={3}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <button type="button" className="send-button" disabled={busy || !input.trim()}
                  aria-label="Send message" onClick={() => void send()}>
                  {busy ? <LoaderCircle size={20} className="spinner" /> : <ArrowUp size={21}/>}
                </button>
                <div className="composer-hint">Enter to send · Shift+Enter for a new line</div>
              </div>
            </>
          ) : (
            <div className="settings-panel">
              <div className="settings-heading">
                <div><h2>Settings</h2><p>Just your machine, your model, your character.</p></div>
                <button type="button" className="secondary-button" onClick={() => setDraft({ ...DEFAULT_SETTINGS })}>Restore defaults</button>
              </div>
              <label className="field">Ollama endpoint
                <input value={draft.endpoint} spellCheck={false} onChange={event => setDraft({ ...draft, endpoint: event.target.value })}
                  placeholder="http://127.0.0.1:11434" />
                <small>Local HTTP only. Remote API keys are a future feature, not needed for Ollama.</small>
              </label>
              <label className="field">Model
                <input value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })}
                  list="available-models" placeholder="qwen3.5:9b" spellCheck={false} />
                <datalist id="available-models">{availableModels.map(name => <option key={name} value={name}/>)}</datalist>
                <small>Pull a model with <code>ollama pull qwen3.5:9b</code>, or type another installed model name.</small>
              </label>
              <label className="field">Mikan's system prompt
                <textarea rows={5} value={draft.systemPrompt} onChange={event => setDraft({ ...draft, systemPrompt: event.target.value })} />
                <small>Change her personality without touching the AI model.</small>
              </label>
              <label className="field">Character portrait
                <input className="file-input" type="file" accept="image/png,image/jpeg,image/webp"
                  onChange={event => void choosePortrait(event.target.files?.[0])}/>
                <small>Choose your existing Mikan PNG. Stored only on this device.</small>
                {imageError && <small className="field-error">{imageError}</small>}
                {portrait && <span className="portrait-saved"><Check size={15}/> Portrait loaded successfully</span>}
              </label>
              <div className="settings-note"><CircleHelp size={17}/>
                Conversations and voice are not persisted yet. This version is meant to validate the basics first.
              </div>
              <button type="button" className="save-button" onClick={applySettings}><Check size={18} /> Save settings</button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
