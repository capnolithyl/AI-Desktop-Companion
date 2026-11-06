import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { webContext, type WebResult } from "./web-search";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import {
  ArrowLeft, ArrowUp, Cat, Check, Clock3, History,
  ExternalLink, LoaderCircle, MessageCircle, RotateCw, Search, Settings2, SlidersHorizontal, Sparkles, SquarePen, X
} from "lucide-react";
import {
  DEFAULT_SETTINGS, DEFAULT_APPEARANCE, loadPortrait, loadSettings, savePortrait, saveSettings,
  type Message, type Settings
} from "./storage";
import {
  DEFAULT_PERSONALITY, PERSONALITY_TRAITS, PERSONALITY_PRESETS,
  findPreset, personalityGuidance, randomPersonality, type Personality
} from "./personality";
import { PersonalityPresets, PersonalitySliders } from "./PersonalityControls";
import { parseSlashCommand, SLASH_HELP } from "./slash-commands";

type Screen = "compact" | "log" | "settings" | "search" | "personality" | "help";
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
type LogMessage = Message & { createdAt: number; diagnostics?: Diagnostics; failed?: boolean; sources?: WebResult[] };
const HOTKEY = "Control+Alt+M";
const BUNDLED_PORTRAIT = "/mikan.png";

function rgbOf(hex: string): string {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(" ");
}
function localEndpoint(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}
async function openSource(url: string): Promise<void> {
  try {
    const target = new URL(url);
    if (target.protocol !== "https:" && target.protocol !== "http:") return;
    await openUrl(target.href);
  } catch (error) {
    console.warn("Could not open external link:", error);
  }
}
function MarkdownText({ text }: { text: string }) {
  // Do not enable raw HTML. Open citations in the user's default browser.
  return <div className="markdown-text"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <a href={href} onClick={event => {
      event.preventDefault();
      if (href) void openSource(href);
    }}>{children}</a>
  }}>{text}</ReactMarkdown></div>;
}
const FONTS = ["Segoe UI", "Arial", "Verdana", "Georgia"] as const;
const ACCENTS = ["#ffad7e", "#f28bb6", "#ae9dff", "#80d6c5", "#8dbbff"];
const PANELS = ["#211b25", "#18191f", "#2b2020", "#152336"];

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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WebResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchHasRun, setSearchHasRun] = useState(false);
  const [greeting, setGreeting] = useState("Hey! I'm Mikan. What are we working on?");
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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
  useEffect(() => {
    if (screen === "compact") focusInput();
    if (screen === "search") requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [screen, focusInput]);

  const clearChat = () => {
    if (busy) return;
    setMessages([]);
    setFeedback(null);
    setGreeting("New conversation! What shall we talk about?");
    goCompact();
  };

  const openSettings = () => {
    setDraft(settings);
    void refreshModels(settings.endpoint);
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

  // Quick controls and slash commands persist immediately without editing the system prompt.
  const applySetting = (change: Partial<Settings>) => {
    const updated = { ...settings, ...change };
    setSettings(updated);
    saveSettings(updated);
    setDraft(current => ({ ...current, ...change }));
  };
  const updatePersonality = (personality: Personality) => applySetting({ personality });

  // Switch between local models without reopening Settings or restarting Mikan.
  // Existing chat context is retained; choose New chat for a fresh comparison.
  const switchModel = (model: string) => {
    if (busy || !model || model === settings.model) return;
    const updated = { ...settings, model };
    setSettings(updated);
    saveSettings(updated);
    setDraft(current => ({ ...current, model }));
  };

  const saveConfiguration = () => {
    const updated = {
      endpoint: draft.endpoint.trim().replace(/\/+$/, ""),
      model: draft.model.trim(),
      systemPrompt: draft.systemPrompt.trim(),
      searxngEndpoint: draft.searxngEndpoint.trim().replace(/\/+$/, ""),
      appearance: { ...draft.appearance },
      personality: { ...draft.personality }
    };
    setSettings(updated);
    saveSettings(updated);
    goCompact();
  };

  const performSearch = async (query: string) => {
    const trimmed = query.trim();
    setScreen("search");
    setSearchQuery(trimmed);
    setSearchResults([]);
    setSearchError(null);
    setSearchHasRun(false);
    if (!trimmed) return;
    setSearchBusy(true);
    try {
      const results = await invoke<WebResult[]>("web_search", {
        endpoint: settings.searxngEndpoint,
        query: trimmed
      });
      setSearchResults(results);
      setSearchHasRun(true);
    } catch (error) {
      setSearchError(errorText(error));
      setSearchHasRun(true);
    } finally {
      setSearchBusy(false);
    }
  };

  const runSlashCommand = (text: string): void => {
    setInput("");
    setFeedback(null);
    const parsed = parseSlashCommand(text);
    if (!parsed) {
      setFeedback("Invalid slash command. Type /help to see available commands.");
      return;
    }
    const { name, argument } = parsed;
    const trait = PERSONALITY_TRAITS.find(item => item.key === name);
    if (trait) {
      if (!argument) {
        setFeedback(`${trait.label}: ${settings.personality[trait.key]}%. Try /${name} 80 to change it.`);
      } else if (!/^\d{1,3}$/.test(argument) || Number(argument) > 100) {
        setFeedback(`Use /${name} with a number from 0 to 100.`);
      } else {
        const value = Number(argument);
        updatePersonality({ ...settings.personality, [trait.key]: value });
        setFeedback(`${trait.label} set to ${value}%. The next reply will use this setting.`);
      }
      return;
    }
    switch (name) {
      case "help": setScreen("help"); return;
      case "personality":
      case "presets": setScreen("personality"); return;
      case "preset": {
        if (!argument) { setScreen("personality"); return; }
        const preset = findPreset(argument);
        if (!preset) {
          setFeedback(`Unknown preset "${argument}". Choose: ${PERSONALITY_PRESETS.map(p => p.id).join(", ")}.`);
          return;
        }
        updatePersonality({ ...preset.values });
        setFeedback(`Personality: ${preset.name}. ${preset.description}.`);
        return;
      }
      case "random":
      case "randomize":
        updatePersonality(randomPersonality());
        setFeedback("New personality mix rolled! Use /personality to see the results.");
        return;
      case "search":
        void performSearch(argument);
        return;
      case "log":
      case "history": setScreen("log"); return;
      case "settings":
      case "appearance":
      case "portrait":
      case "prompt":
      case "endpoint":
      case "models":
        openSettings(); return;
      case "model":
        if (!argument) { openSettings(); return; }
        if (busy) { setFeedback("Wait until Mikan finishes her reply before switching models."); return; }
        if (!availableModels.includes(argument)) {
          setFeedback(`Model "${argument}" wasn't found in Ollama. Use /models to check installed models.`);
          return;
        }
        switchModel(argument);
        setFeedback(`Model selected: ${argument}.`);
        return;
      case "refresh":
        void refreshModels(settings.endpoint);
        setFeedback("Refreshing the installed Ollama model list…");
        return;
      case "chat": goCompact(); return;
      case "new":
      case "clear":
        if (busy) { setFeedback("Wait until the current reply finishes before clearing the chat."); return; }
        clearChat();
        return;
      case "accent":
      case "panel": {
        if (!/^#[0-9a-fA-F]{6}$/.test(argument)) {
          setFeedback(`Use /${name} #RRGGBB, such as /${name} #ffad7e.`);
          return;
        }
        applySetting({ appearance: { ...settings.appearance, [name]: argument } });
        setFeedback(`${name === "accent" ? "Accent" : "Panel"} color updated to ${argument}.`);
        return;
      }
      case "opacity": {
        const value = Number(argument);
        if (!/^\d{2,3}$/.test(argument) || value < 65 || value > 100) {
          setFeedback("Use /opacity with a percentage from 65 to 100.");
          return;
        }
        applySetting({ appearance: { ...settings.appearance, opacity: value / 100 } });
        setFeedback(`Panel opacity set to ${value}%.`);
        return;
      }
      case "fontsize": {
        const value = Number(argument);
        if (!/^\d{2}$/.test(argument) || value < 11 || value > 20) {
          setFeedback("Use /fontsize with a size from 11 to 20.");
          return;
        }
        applySetting({ appearance: { ...settings.appearance, fontSize: value } });
        setFeedback(`Message font size set to ${value}px.`);
        return;
      }
      case "font": {
        const font = FONTS.find(item => item.toLowerCase() === argument.toLowerCase());
        if (!font) {
          setFeedback(`Unknown font. Try: ${FONTS.join(", ")}.`);
          return;
        }
        applySetting({ appearance: { ...settings.appearance, fontFamily: font } });
        setFeedback(`Font changed to ${font}.`);
        return;
      }
      case "ollama":
      case "searxng": {
        const endpoint = localEndpoint(argument);
        if (!endpoint) {
          setFeedback(`Use /${name} with a local HTTP URL, e.g. http://127.0.0.1:${name === "ollama" ? "11434" : "8888"}.`);
          return;
        }
        applySetting(name === "ollama" ? { endpoint } : { searxngEndpoint: endpoint });
        setFeedback(`${name === "ollama" ? "Ollama" : "SearXNG"} URL updated to ${endpoint}.`);
        return;
      }
      case "hide":
        void invoke("hide_companion");
        return;
      default:
        setFeedback(`Unknown command /${name}. Type /help to see available commands.`);
    }
  };

  const send = async (withSearch?: { query: string; results: WebResult[] }) => {
    const text = withSearch ? withSearch.query : input.trim();
    if (!text) return;

    // Slash commands stay inside the app and never reach the language model.
    if (!withSearch && text.startsWith("/")) {
      runSlashCommand(text);
      return;
    }

    if (busy) return;
    setFeedback(null);
    const user: LogMessage = { id: crypto.randomUUID(), role: "user", content: text, createdAt: Date.now() };
    const assistantId = crypto.randomUUID();
    const history = [...messages, user];
    const requestId = crypto.randomUUID();
    setMessages([...history, {
      id: assistantId, role: "assistant", content: "", createdAt: Date.now(),
      ...(withSearch ? { sources: withSearch.results } : {})
    }]);
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
            { role: "system", content: [settings.systemPrompt.trim(), personalityGuidance(settings.personality)].filter(Boolean).join("\n\n") },
            ...(withSearch ? [{ role: "user", content: webContext(withSearch.query, withSearch.results) }] : []),
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
  const replyText = busy ? (lastReply?.content || "Thinking…") : (feedback ?? lastReply?.content ?? greeting);

  const theme = {
    "--accent": settings.appearance.accent,
    "--accent-rgb": rgbOf(settings.appearance.accent),
    "--panel-rgb": rgbOf(settings.appearance.panel),
    "--panel-opacity": String(settings.appearance.opacity),
    "--mikan-font": `"${settings.appearance.fontFamily}", system-ui, sans-serif`,
    "--mikan-font-size": `${settings.appearance.fontSize}px`
  } as CSSProperties;
  const dragPortrait = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button === 0) void getCurrentWindow().startDragging().catch(console.warn);
  };

  return <main className="companion" style={theme}>
    <div className="portrait-space" title="Drag Mikan to move the window" onMouseDown={dragPortrait}>
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
          <div className="reply-title"><span className="cat-dot" /> <strong>MIKAN</strong>
            {busy && <LoaderCircle size={15} className="spin" />}
            {!busy && lastReply?.failed && <span className="error-caption">Error</span>}
          </div>
          <div className="dock-actions">
            <button className="dock-icon" title="Web search (/search)" aria-label="Web search"
              onClick={() => setScreen("search")}><Search size={17}/></button>
            <button className="dock-icon" title="Quick personality presets (/personality)" aria-label="Personality presets"
              onClick={() => setScreen("personality")}><SlidersHorizontal size={17}/></button>
            <button className="dock-icon" title="Conversation log (/log)" aria-label="Conversation log" onClick={() => setScreen("log")}><History size={17}/></button>
            <button className="dock-icon" title="Settings (/settings)" aria-label="Settings" onClick={openSettings}><Settings2 size={17}/></button>
            <button className="dock-icon" title="Hide Mikan" aria-label="Hide Mikan" onClick={() => void invoke("hide_companion")}><X size={18}/></button>
          </div>
        </div>
        <div className="latest-reply"><MarkdownText text={replyText}/></div>
      </div>
      <div className="input-row">
        <textarea
          ref={inputRef}
          aria-label="Message Mikan"
          rows={2}
          placeholder="Message Mikan…  /help for commands"
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
        <div className="model-switcher" title={connection.text}>
          <span className={`status-dot ${connection.mode}`} />
          <select
            aria-label="Active Ollama model"
            title="Switch Ollama model"
            value={availableModels.includes(settings.model) ? settings.model : "__current__"}
            disabled={busy || connection.mode !== "online" || !availableModels.length}
            onChange={event => switchModel(event.target.value)}
          >
            {!availableModels.includes(settings.model) &&
              <option value="__current__">{settings.model || "No model selected"} (not detected)</option>}
            {availableModels.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <button type="button" className="refresh-model-button" title="Refresh installed Ollama models"
            aria-label="Refresh installed models" disabled={busy || connection.mode === "loading"}
            onClick={() => void refreshModels(settings.endpoint)}><RotateCw size={13}/></button>
        </div>
        <span>Ctrl + Alt + M</span>
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
          <div className={m.failed ? "message-error message-content" : "message-content"}><MarkdownText text={m.content || (busy ? "Thinking…" : "")}/></div>
          {m.sources && m.sources.length > 0 && <div className="message-sources">
            <strong>Web sources</strong>
            {m.sources.map((source, index) => <button key={source.url} className="source-link" type="button"
              onClick={() => void openSource(source.url)} title={source.url}>
              [{index + 1}] {source.title} <ExternalLink size={13}/>
            </button>)}
          </div>}
          {m.role === "assistant" && <ReplyMetrics diagnostics={m.diagnostics}/>}
        </article>)}
      </div>
      <footer className="drawer-footer"><Clock3 size={14}/> Token counts and timings come from Ollama; wall time includes app overhead.</footer>
    </section>}

    {screen === "search" && <section className="drawer" role="dialog" aria-label="SearXNG web search">
      <header className="drawer-header">
        <button className="back-button" title="Back to companion" onClick={goCompact}><ArrowLeft size={19}/></button>
        <div className="drawer-title"><strong>Web search</strong><span>Local SearXNG · {settings.searxngEndpoint}</span></div>
      </header>
      <form className="search-form" onSubmit={event => {
        event.preventDefault();
        if (!searchBusy) void performSearch(searchQuery);
      }}>
        <input ref={searchInputRef} aria-label="Search query" value={searchQuery}
          onChange={event => {
            setSearchQuery(event.target.value);
            setSearchResults([]);
            setSearchHasRun(false);
          }}
          placeholder="Search the web…" maxLength={250}/>
        <button className="secondary-action" type="submit" disabled={searchBusy || !searchQuery.trim()}>
          {searchBusy ? <LoaderCircle size={16} className="spin"/> : <Search size={16}/>} Search
        </button>
      </form>
      <div className="search-body">
        {searchBusy && <div className="search-empty"><LoaderCircle size={32} className="spin"/> Searching SearXNG…</div>}
        {!searchBusy && searchError && <div className="search-error">
          <strong>Search unavailable</strong><p>{searchError}</p>
          <span>Check Docker Desktop, tools/searxng/start.ps1, and the SearXNG URL in Settings.</span>
        </div>}
        {!searchBusy && !searchError && !searchHasRun && <div className="search-empty">
          <Search size={32}/> Search is on demand. No automatic web requests yet.
        </div>}
        {!searchBusy && !searchError && searchHasRun && searchResults.length === 0 &&
          <div className="search-empty">No results returned. Try another query or check SearXNG's enabled search engines.</div>}
        {!searchBusy && !searchError && searchResults.map((result,index) => <article key={result.url} className="search-result">
          <button type="button" className="search-result-title" title={result.url}
            onClick={() => void openSource(result.url)}>
            <span>[{index + 1}] {result.title}</span><ExternalLink size={15}/>
          </button>
          {result.content && <p>{result.content}</p>}
          <small>{result.engine || new URL(result.url).hostname}</small>
        </article>)}
      </div>
      <footer className="search-footer">
        <span>Results are snippets, not full webpages. Verify important claims at the source.</span>
        <button type="button" className="save-button" disabled={busy || searchBusy || !searchResults.length}
          onClick={() => void send({ query: searchQuery, results: searchResults })}>
          <Sparkles size={16}/> Ask Mikan
        </button>
      </footer>
    </section>}

    {screen === "personality" && <section className="drawer" role="dialog" aria-label="Quick personality controls">
      <header className="drawer-header">
        <button className="back-button" title="Back to companion" onClick={goCompact}><ArrowLeft size={19}/></button>
        <div className="drawer-title"><strong>Mikan's personality</strong><span>Change her mood in one click</span></div>
      </header>
      <div className="settings-body">
        <PersonalityPresets value={settings.personality} onChange={updatePersonality}/>
        <div className="appearance-heading personality-heading">
          <strong>Fine-tune</strong>
          <small>Personality settings are saved instantly. They affect future replies.</small>
        </div>
        <PersonalitySliders value={settings.personality} onChange={updatePersonality}/>
        <p className="settings-note"><Sparkles size={16}/> The presets and sliders guide Mikan's tone. They don't guarantee an exact behavior in every reply.</p>
      </div>
      <footer className="settings-footer">
        <button type="button" className="secondary-action" onClick={openSettings}><Settings2 size={15}/> Full settings</button>
      </footer>
    </section>}

    {screen === "help" && <section className="drawer" role="dialog" aria-label="Slash commands">
      <header className="drawer-header">
        <button className="back-button" title="Back to companion" onClick={goCompact}><ArrowLeft size={19}/></button>
        <div className="drawer-title"><strong>Slash commands</strong><span>Click one to fill the chat input</span></div>
      </header>
      <div className="help-command-list">
        {SLASH_HELP.map(item => <button type="button" key={item.usage} className="help-command"
          onClick={() => { setInput(item.insert); goCompact(); }}>
          <code>{item.usage}</code><span>{item.description}</span>
        </button>)}
      </div>
      <footer className="drawer-footer">Commands are handled locally, without sending them to Ollama.</footer>
    </section>}

    {screen === "settings" && <section className="drawer" role="dialog" aria-label="Mikan settings">
      <header className="drawer-header">
        <button className="back-button" title="Back to companion" onClick={goCompact}><ArrowLeft size={19}/></button>
        <div className="drawer-title"><strong>Settings</strong><span>Mikan v0.4.1 · Local first</span></div>
        <button className="secondary-action" onClick={() => setDraft({ ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_APPEARANCE }, personality: { ...DEFAULT_PERSONALITY } })}><RotateCw size={14}/> Reset</button>
      </header>
      <div className="settings-body">
        <label className="setting-field">Ollama endpoint
          <input spellCheck={false} value={draft.endpoint} onChange={event => setDraft({ ...draft, endpoint: event.target.value })}/>
          <small>Local HTTP only. No API key required.</small>
        </label>
        <label className="setting-field">Ollama model
          <select
            aria-label="Installed Ollama models"
            value={availableModels.includes(draft.model) ? draft.model : "__custom__"}
            onChange={event => setDraft({ ...draft, model: event.target.value === "__custom__" ? "" : event.target.value })}
          >
            {availableModels.map(name => <option key={name} value={name}>{name}</option>)}
            <option value="__custom__">Other / enter model name manually</option>
          </select>
          {!availableModels.includes(draft.model) && <input
            aria-label="Manual Ollama model name"
            spellCheck={false}
            placeholder="model-name:tag"
            value={draft.model}
            onChange={event => setDraft({ ...draft, model: event.target.value })}
          />}
          <small>{availableModels.length
            ? `${availableModels.length} locally installed model${availableModels.length === 1 ? "" : "s"} detected. Choose one or enter a name manually.`
            : connection.mode === "loading"
              ? "Checking Ollama for installed models…"
              : "No models listed. Check Ollama or enter a model name manually."}</small>
        </label>
        <button className="inline-action" disabled={connection.mode === "loading"}
          onClick={() => void refreshModels(draft.endpoint)}><RotateCw size={14}/> Refresh installed models</button>
        <div className="appearance-heading">
          <strong>Internet search</strong>
          <small>Self-hosted SearXNG. No paid API key needed. Searching is on demand.</small>
        </div>
        <label className="setting-field">SearXNG URL
          <input spellCheck={false} value={draft.searxngEndpoint}
            onChange={event => setDraft({ ...draft, searxngEndpoint: event.target.value })}
            placeholder="http://127.0.0.1:8888"/>
          <small>Start the SearXNG Docker container first. Only localhost is supported.</small>
        </label>
        <label className="setting-field">Personality prompt
          <textarea rows={6} value={draft.systemPrompt} onChange={event => setDraft({ ...draft, systemPrompt: event.target.value })}/>
          <small>The sliders below add short behavioral guidance without replacing this prompt.</small>
        </label>
        <div className="appearance-heading personality-heading">
          <strong>Personality</strong>
          <small>Tune Mikan's style. Sliders are tendencies, not exact guarantees.</small>
        </div>
        <PersonalityPresets value={draft.personality}
          onChange={personality => setDraft(current => ({ ...current, personality }))}/>
        <PersonalitySliders value={draft.personality}
          onChange={personality => setDraft(current => ({ ...current, personality }))}/>
        <button type="button" className="inline-action personality-reset"
          onClick={() => setDraft(current => ({ ...current, personality: { ...DEFAULT_PERSONALITY } }))}>
          <RotateCw size={14}/> Reset personality
        </button>
        <label className="setting-field">Character portrait
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void choosePortrait(event.target.files?.[0])}/>
          <small>The included portrait is the default. You can still replace it here.</small>
          {imageError && <small className="field-error">{imageError}</small>}
          {portrait && <span className="portrait-ready"><Check size={15}/> Portrait ready</span>}
        </label>
        <div className="appearance-heading">
          <strong>Appearance</strong>
          <small>Customize Mikan's colors and typography.</small>
        </div>
        <div className="setting-field">
          <span>Accent color</span>
          <div className="color-choices">
            {ACCENTS.map(color => <button key={color} type="button"
              className={draft.appearance.accent.toLowerCase() === color ? "color-swatch selected" : "color-swatch"}
              style={{backgroundColor: color}} aria-label={`Select accent ${color}`}
              title={color} onClick={() => setDraft({ ...draft, appearance: { ...draft.appearance, accent: color } })} />)}
            <label className="custom-color">Custom
              <input type="color" value={draft.appearance.accent}
                onChange={e => setDraft({ ...draft, appearance: { ...draft.appearance, accent: e.target.value } })}/>
            </label>
          </div>
        </div>
        <div className="setting-field">
          <span>Panel color</span>
          <div className="color-choices">
            {PANELS.map(color => <button key={color} type="button"
              className={draft.appearance.panel.toLowerCase() === color ? "color-swatch selected" : "color-swatch"}
              style={{backgroundColor: color}} aria-label={`Select panel ${color}`}
              title={color} onClick={() => setDraft({ ...draft, appearance: { ...draft.appearance, panel: color } })} />)}
            <label className="custom-color">Custom
              <input type="color" value={draft.appearance.panel}
                onChange={e => setDraft({ ...draft, appearance: { ...draft.appearance, panel: e.target.value } })}/>
            </label>
          </div>
        </div>
        <label className="setting-field">Panel opacity: {Math.round(draft.appearance.opacity * 100)}%
          <input type="range" min="65" max="100" step="5" value={Math.round(draft.appearance.opacity * 100)}
            onChange={e => setDraft({ ...draft, appearance: { ...draft.appearance, opacity: Number(e.target.value) / 100 } })}/>
        </label>
        <label className="setting-field">Font family
          <select value={draft.appearance.fontFamily}
            onChange={e => setDraft({ ...draft, appearance: { ...draft.appearance, fontFamily: e.target.value as typeof draft.appearance.fontFamily } })}>
            {FONTS.map(font => <option key={font} value={font}>{font}</option>)}
          </select>
        </label>
        <label className="setting-field">Message font size: {draft.appearance.fontSize}px
          <input type="range" min="11" max="20" step="1" value={draft.appearance.fontSize}
            onChange={e => setDraft({ ...draft, appearance: { ...draft.appearance, fontSize: Number(e.target.value) } })}/>
        </label>
        <p className="settings-note"><Sparkles size={16}/> Chats currently last until you quit the app. Persistence and voice are coming later.</p>
      </div>
      <footer className="settings-footer">
        <button className="save-button" onClick={saveConfiguration}><Check size={17}/> Save settings</button>
      </footer>
    </section>}
  </main>;
}
