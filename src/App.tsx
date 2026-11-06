import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { webContext, pageContext, type PageDocument, type WebResult } from "./web-search";
import { priorResearchSources } from "./research-context";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import {
  ArrowLeft, ArrowUp, Brain, Cat, Check, Clock3, History,
  BookOpen, ExternalLink, HardDrive, LoaderCircle, MessageCircle, RotateCw, Search, Settings2, SlidersHorizontal, Sparkles, Square, SquarePen, X
} from "lucide-react";
import {
  DEFAULT_SETTINGS, DEFAULT_APPEARANCE, loadPortrait, loadSettings, savePortrait, saveSettings,
  type Message, type Settings
} from "./storage";
import {
  PERSONALITY_TRAITS, PERSONALITY_PRESETS,
  findPreset, personalityGuidance, randomPersonality, type Personality
} from "./personality";
import { PersonalityPresets, PersonalitySliders } from "./PersonalityControls";
import { parseSlashCommand, SLASH_HELP } from "./slash-commands";
import { runtimeContext } from "./runtime-context";
import { memoryApi, memoryContext, readMessageMetadata, type MemoryConversation, type UserFact, type PersistedMessage } from "./memory-client";
import { MemoryPanel } from "./MemoryPanel";

type Screen = "compact" | "log" | "settings" | "search" | "page" | "personality" | "help" | "memory";
type SettingsTab = "ai" | "internet" | "appearance";
type SearchService = { state: string; message: string };
type CacheInfo = { pages: number; bytes: number };
type Activity = { requestId: string; text: string };
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
type ChatCompletion = { content: string; stats: OllamaStats | null; sources: WebResult[]; searchQuery?: string | null; sourcesCarriedOver?: boolean };
type Diagnostics = { elapsedMs: number; firstTokenMs: number | null; model: string; stats: OllamaStats | null };
type LogMessage = Message & { createdAt: number; diagnostics?: Diagnostics; failed?: boolean; sources?: WebResult[]; searchQuery?: string; sourcesCarriedOver?: boolean };
const HOTKEY = "Control+Alt+M";
const BUNDLED_PORTRAIT = "/mikan.png";

function restoreMessage(saved: PersistedMessage): LogMessage {
  const metadata = readMessageMetadata(saved.metadataJson);
  return {
    id: saved.id, role: saved.role, content: saved.content, createdAt: saved.createdAt,
    ...(metadata.failed === true ? { failed: true } : {}),
    ...(metadata.diagnostics && typeof metadata.diagnostics === "object"
      ? { diagnostics: metadata.diagnostics as Diagnostics } : {}),
    ...(Array.isArray(metadata.sources) ? { sources: metadata.sources as WebResult[] } : {}),
    ...(typeof metadata.searchQuery === "string" ? { searchQuery: metadata.searchQuery } : {}),
    ...(metadata.sourcesCarriedOver === true ? { sourcesCarriedOver: true } : {})
  };
}

function archiveMetadata(message: LogMessage): object {
  return {
    failed: message.failed === true,
    diagnostics: message.diagnostics ?? null,
    sources: message.sources ?? [],
    searchQuery: message.searchQuery ?? null,
    sourcesCarriedOver: message.sourcesCarriedOver === true
  };
}

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
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("ai");
  const [service, setService] = useState<SearchService | null>(null);
  const [serviceBusy, setServiceBusy] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [page, setPage] = useState<PageDocument | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageBusy, setPageBusy] = useState(false);
  const [pageReturn, setPageReturn] = useState<"search" | "compact">("compact");
  const [activity, setActivity] = useState("Thinking…");
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<MemoryConversation[]>([]);
  const [userFacts, setUserFacts] = useState<UserFact[]>([]);
  const [memoryReady, setMemoryReady] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryInitialTab, setMemoryInitialTab] = useState<"facts" | "chats">("facts");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
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
  const pageInputRef = useRef<HTMLInputElement>(null);
  const portraitUrl = useRef<string | null>(null);
  const activeRequestId = useRef<string | null>(null);
  const stopRequested = useRef(false);

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

  // Check the real HTTP endpoint, not just Docker's container flag. Polling
  // uses a one-shot timer so slow starts can't overlap or spin in the tray.
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      let delay = 45_000;
      try {
        const status = await invoke<SearchService>("search_service", {
          action: settings.autoManageSearch ? "ensure" : "status",
          endpoint: settings.searxngEndpoint
        });
        if (disposed) return;
        setService(status);
        setServiceError(null);
        if (status.state === "starting") delay = 8_000;
        else if (status.state !== "ready") delay = 30_000;
      } catch (error) {
        if (disposed) return;
        const message = errorText(error);
        setService({ state: "unavailable", message });
        setServiceError(message);
        delay = 60_000;
      }
      if (!disposed) timer = setTimeout(() => { void check(); }, delay);
    };
    void check();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [settings.autoManageSearch, settings.searxngEndpoint]);

  useEffect(() => {
    if (screen === "log") logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [screen, messages]);
  useEffect(() => {
    if (screen === "compact") focusInput();
    if (screen === "search") requestAnimationFrame(() => searchInputRef.current?.focus());
    if (screen === "page") requestAnimationFrame(() => pageInputRef.current?.focus());
  }, [screen, focusInput]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        // Initialize the SQLite schema on one connection before reading facts.
        const archive = await memoryApi.listConversations();
        const facts = await memoryApi.listFacts();
        if (disposed) return;
        setConversations(archive);
        setUserFacts(facts);
        const latest = archive[0];
        if (latest) {
          const restored = await memoryApi.listMessages(latest.id);
          if (!disposed) {
            setMessages(restored.map(restoreMessage));
            setActiveConversationId(latest.id);
          }
        }
      } catch (error) {
        if (!disposed) setMemoryError(`Local memory unavailable: ${errorText(error)}`);
      } finally {
        if (!disposed) setMemoryReady(true);
      }
    })();
    return () => { disposed = true; };
  }, []);

  const refreshArchive = async () => {
    setConversations(await memoryApi.listConversations());
  };
  const refreshFacts = async () => {
    setUserFacts(await memoryApi.listFacts());
  };
  const refreshMemory = async () => {
    const [archive, facts] = await Promise.all([
      memoryApi.listConversations(), memoryApi.listFacts()
    ]);
    setConversations(archive);
    setUserFacts(facts);
    setMemoryError(null);
  };
  const addUserFact = async (fact: string) => {
    await memoryApi.addFact(fact);
    await refreshFacts();
    setMemoryError(null);
  };
  const editUserFact = async (id: number, fact: string) => {
    await memoryApi.updateFact(id, fact);
    await refreshFacts();
  };
  const deleteUserFact = async (id: number) => {
    await memoryApi.deleteFact(id);
    await refreshFacts();
  };
  const openConversation = async (id: string) => {
    if (busy) return;
    const stored = await memoryApi.listMessages(id);
    setMessages(stored.map(restoreMessage));
    setActiveConversationId(id);
    setFeedback(null);
    goCompact();
  };
  const deleteConversation = async (id: string) => {
    if (busy) throw new Error("Stop the current reply before deleting a conversation");
    await memoryApi.deleteConversation(id);
    if (id === activeConversationId) {
      setActiveConversationId(null);
      setMessages([]);
      setFeedback(null);
    }
    await refreshArchive();
  };
  const openMemory = (tab: "chats" | "facts" = "facts") => {
    setMemoryInitialTab(tab);
    setScreen("memory");
    void refreshMemory().catch(error => setMemoryError(errorText(error)));
  };

  const clearChat = () => {
    if (busy || !memoryReady) return;
    setMessages([]);
    setActiveConversationId(null);
    setFeedback(null);
    setGreeting("New conversation! What shall we talk about?");
    goCompact();
  };

  const refreshService = async () => {
    setServiceBusy(true);
    setServiceError(null);
    try { setService(await invoke<SearchService>("search_service", { action: "status", endpoint: settings.searxngEndpoint })); }
    catch (error) { setServiceError(errorText(error)); }
    finally { setServiceBusy(false); }
  };
  const manageService = async (action: "start" | "stop" | "status") => {
    // Start enables recovery so a Docker Desktop cold start finishes booting
    // SearXNG; Stop disables it so the monitor cannot undo a manual stop.
    if ((action === "start" && !settings.autoManageSearch) ||
        (action === "stop" && settings.autoManageSearch)) {
      const autoManageSearch = action === "start";
      const updated = { ...settings, autoManageSearch };
      setSettings(updated);
      saveSettings(updated);
      setDraft(current => ({ ...current, autoManageSearch }));
    }
    setServiceBusy(true);
    setServiceError(null);
    try {
      const state = await invoke<SearchService>("search_service", { action, endpoint: settings.searxngEndpoint });
      setService(state);
      if (screen === "compact") setFeedback(state.message);
    } catch (error) {
      const text = errorText(error);
      setServiceError(text);
      setService({ state: "unavailable", message: text });
      setFeedback(text);
    } finally { setServiceBusy(false); }
  };
  const refreshCache = async () => {
    try { setCacheInfo(await invoke<CacheInfo>("web_cache_info")); }
    catch (error) { console.warn("Web cache unavailable:", error); }
  };
  const openSettingsTab = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setDraft(settings);
    if (tab === "ai") void refreshModels(settings.endpoint);
    if (tab === "internet") { void refreshService(); void refreshCache(); }
    setScreen("settings");
  };
  const openSettings = () => openSettingsTab("ai");

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
    const updated: Settings = {
      ...draft,
      endpoint: draft.endpoint.trim().replace(/\/+$/, ""),
      model: draft.model.trim(),
      systemPrompt: draft.systemPrompt.trim(),
      searxngEndpoint: draft.searxngEndpoint.trim().replace(/\/+$/, ""),
      appearance: { ...draft.appearance },
      personality: { ...settings.personality }
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

  const openPage = async (url: string, fromSearch = false, refresh = false) => {
    setPageUrl(url);
    setPageReturn(fromSearch ? "search" : "compact");
    setScreen("page");
    setPage(null);
    setPageError(null);
    if (!url.trim()) return;
    setPageBusy(true);
    try {
      const document = await invoke<PageDocument>("read_page", {
        url: url.trim(), refresh, ttlHours: settings.cacheHours
      });
      setPage(document);
      void refreshCache();
    } catch (error) { setPageError(errorText(error)); }
    finally { setPageBusy(false); }
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
      case "read":
        void openPage(argument);
        return;
      case "search-start":
        void manageService("start"); return;
      case "search-stop":
        void manageService("stop"); return;
      case "search-status":
        void manageService("status"); return;
      case "internet":
        openSettingsTab("internet"); return;
      case "memory":
      case "memories": openMemory("facts"); return;
      case "chats":
      case "conversations": openMemory("chats"); return;
      case "remember":
        if (!argument) { setFeedback("Use /remember followed by a fact, e.g. /remember I like metal."); return; }
        void addUserFact(argument)
          .then(() => setFeedback("Saved to your local memories."))
          .catch(error => setFeedback(`Could not save memory: ${errorText(error)}`));
        return;
      case "forget": {
        const id = Number(argument);
        if (!/^\d+$/.test(argument) || !Number.isSafeInteger(id) || id <= 0) {
          setFeedback("Use /forget with the numeric ID from the Memory panel.");
          return;
        }
        void deleteUserFact(id)
          .then(() => setFeedback(`Deleted memory #${id} if it existed.`))
          .catch(error => setFeedback(`Could not delete memory: ${errorText(error)}`));
        return;
      }
      case "log":
      case "history": setScreen("log"); return;
      case "settings": openSettings(); return;
      case "appearance":
      case "portrait": openSettingsTab("appearance"); return;
      case "prompt":
      case "endpoint":
      case "models": openSettingsTab("ai"); return;
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

  const stopGeneration = async () => {
    const requestId = activeRequestId.current;
    if (!requestId || stopRequested.current) return;
    stopRequested.current = true;
    setStopping(true);
    setActivity("Stopping…");
    try {
      await invoke("cancel_chat", { requestId });
    } catch (error) {
      stopRequested.current = false;
      setStopping(false);
      setActivity(`Could not stop: ${errorText(error)}`);
    }
  };

  const send = async (withSearch?: { query: string; results: WebResult[]; page?: PageDocument }) => {
    const text = withSearch ? withSearch.query : input.trim();
    if (!text) return;

    // Slash commands stay inside the app and never reach the language model.
    if (!withSearch && text.startsWith("/")) {
      runSlashCommand(text);
      return;
    }

    if (busy) return;
    if (!memoryReady) { setFeedback("Loading conversation memory…"); return; }
    setFeedback(null);
    const user: LogMessage = { id: crypto.randomUUID(), role: "user", content: text, createdAt: Date.now() };
    const assistantId = crypto.randomUUID();
    const history = [...messages, user];
    const priorSources = !withSearch ? priorResearchSources(messages, text) : [];
    const conversationId = activeConversationId ?? crypto.randomUUID();
    setActiveConversationId(conversationId);
    const persistMessage = async (message: LogMessage) => {
      try {
        // Idempotent insert also covers the first message of a new conversation.
        await memoryApi.createConversation(conversationId);
        await memoryApi.saveMessage(conversationId, message, archiveMetadata(message));
        await refreshArchive();
        setMemoryError(null);
      } catch (error) {
        setMemoryError(`Chat is not being saved: ${errorText(error)}`);
      }
    };
    const requestId = crypto.randomUUID();
    setMessages([...history, {
      id: assistantId, role: "assistant", content: "", createdAt: Date.now(),
      ...(withSearch ? { sources: withSearch.results } : {})
    }]);
    setInput("");
    activeRequestId.current = requestId;
    stopRequested.current = false;
    setStopping(false);
    setBusy(true);
    setActivity("Thinking…");
    goCompact();
    const started = performance.now();
    let firstTokenMs: number | null = null;
    let accumulated = "";
    let unlisten: UnlistenFn | null = null;
    let unlistenActivity: UnlistenFn | null = null;

    try {
      await persistMessage(user);
      unlistenActivity = await listen<Activity>("mikan://activity", event => {
        if (event.payload.requestId === requestId) setActivity(event.payload.text);
      });
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
          autoSearch: settings.autoSearch && !withSearch,
          searxngEndpoint: settings.searxngEndpoint,
          cacheHours: settings.cacheHours,
          contextWindow: settings.contextWindow,
          priorSources,
          messages: [
            { role: "system", content: [settings.systemPrompt.trim(), personalityGuidance(settings.personality), runtimeContext(), memoryContext(userFacts, text)].filter(Boolean).join("\n\n") },
            ...(withSearch ? [{ role: "user", content: withSearch.page ? pageContext(withSearch.query, withSearch.page) : webContext(withSearch.query, withSearch.results) }] : []),
            ...history.filter(m => !withSearch || m.role === "user").slice(-32).map(m => ({ role: m.role, content: m.content }))
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
      const assistant: LogMessage = {
        id: assistantId, role: "assistant", content: finalText, createdAt: Date.now(),
        diagnostics, sources: completion.sources?.length ? completion.sources : withSearch?.results,
        searchQuery: completion.searchQuery || withSearch?.query,
        sourcesCarriedOver: completion.sourcesCarriedOver === true
      };
      setMessages(current => current.map(m => m.id === assistantId ? assistant : m));
      await persistMessage(assistant);
    } catch (error) {
      const message = errorText(error);
      const stopped = message === "Generation stopped" || stopRequested.current;
      const assistant: LogMessage = {
        id: assistantId, role: "assistant", createdAt: Date.now(),
        content: stopped
          ? (accumulated ? `${accumulated}\n\n[Stopped]` : "[Generation stopped]")
          : (accumulated ? `${accumulated}\n\n[Interrupted: ${message}]` : `Error: ${message}`),
        failed: !stopped,
        diagnostics: { elapsedMs: performance.now() - started, firstTokenMs, model: settings.model, stats: null },
        sources: withSearch?.results, searchQuery: withSearch?.query
      };
      setMessages(current => current.map(m => m.id === assistantId ? assistant : m));
      await persistMessage(assistant);
    } finally {
      unlistenActivity?.();
      unlisten?.();
      activeRequestId.current = null;
      stopRequested.current = false;
      setStopping(false);
      setBusy(false);
      focusInput();
    }
  };

  const lastReply = [...messages].reverse().find(m => m.role === "assistant");
  const replyText = busy ? (lastReply?.content || activity) : (feedback ?? lastReply?.content ?? greeting);

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
            <button className="dock-icon search-dock-action" title={service?.message || "Checking search service…"}
              aria-label={`Web search: ${service?.message || "Checking search service"}`}
              onClick={() => setScreen("search")}>
              <Search size={17}/>
              <span aria-hidden="true" className={`search-health-dot ${service?.state || "checking"}`}/>
            </button>
            <button className="dock-icon" title="Quick personality presets (/personality)" aria-label="Personality presets"
              onClick={() => setScreen("personality")}><SlidersHorizontal size={17}/></button>
            <button className="dock-icon" title="Memory and conversations (/memories)" aria-label="Memory and conversations"
              onClick={() => openMemory("facts")}><Brain size={17}/></button>
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
            if (event.key === "Escape" && busy) {
              event.preventDefault();
              void stopGeneration();
              return;
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        {busy ? (
          <button type="button" className="send-button stop-button" aria-label="Stop generating"
            title="Stop generation (Esc)" disabled={stopping} onClick={() => void stopGeneration()}>
            {stopping ? <LoaderCircle className="spin" size={20}/> : <Square size={18} fill="currentColor"/>}
          </button>
        ) : (
          <button type="button" className="send-button" aria-label="Send" title="Send message"
            disabled={!memoryReady || !input.trim()} onClick={() => void send()}><ArrowUp size={20}/></button>
        )}
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
        <span title={memoryError || "Memory ready"}>{memoryError ? "Memory unavailable" : !memoryReady ? "Loading memory…" : "Ctrl + Alt + M"}</span>
      </div>
    </section>

    {screen !== "compact" && <div className="panel-scrim" onMouseDown={goCompact} />}

    {screen === "log" && <section className="drawer" role="dialog" aria-label="Chat history">
      <header className="drawer-header">
        <button className="back-button" title="Back to companion" onClick={goCompact}><ArrowLeft size={19}/></button>
        <div className="drawer-title"><strong>Conversation log</strong><span>{messages.length} messages · current conversation</span></div>
        <button type="button" className="secondary-action" disabled={busy}
          onClick={() => openMemory("chats")}><History size={15}/> All chats</button>
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
          {m.role === "assistant" && m.sources?.length && m.diagnostics && !m.sources.some((_, index) => m.content.includes(`[${index + 1}]`)) &&
            <div className="research-warning">This answer does not cite any individual retrieved sources. Verify factual claims in the excerpts below.</div>}
          {(m.sources?.length || m.searchQuery) && <div className="message-sources">
            {m.searchQuery && <div className="research-query"><Search size={13}/> SearXNG query: <code>{m.searchQuery}</code></div>}
            <strong>{m.sourcesCarriedOver
              ? "Sources carried from earlier research (not refreshed)"
              : "Retrieved sources (claims are not independently verified)"}</strong>
            {m.sources?.map((source, index) => <div className="source-entry" key={source.url}>
              <button className="source-link" type="button"
                onClick={() => void openSource(source.url)} title={source.url}>
                [{index + 1}] {source.title} <ExternalLink size={13}/>
              </button>
              {source.publishedDate && <small>Published: {source.publishedDate}</small>}
              {source.content && <details className="source-evidence">
                <summary>See retrieved excerpt</summary>
                <p>{source.content}</p>
              </details>}
            </div>)}
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
          <Search size={32}/> Search manually here, or enable Auto web search under Settings → Internet.
        </div>}
        {!searchBusy && !searchError && searchHasRun && searchResults.length === 0 &&
          <div className="search-empty">No results returned. Try another query or check SearXNG's enabled search engines.</div>}
        {!searchBusy && !searchError && searchResults.map((result,index) => <article key={result.url} className="search-result">
          <button type="button" className="search-result-title" title={result.url}
            onClick={() => void openSource(result.url)}>
            <span>[{index + 1}] {result.title}</span><ExternalLink size={15}/>
          </button>
          {result.content && <p>{result.content}</p>}
          <small>{result.engine || new URL(result.url).hostname}{result.publishedDate ? ` · Published: ${result.publishedDate}` : ""}</small>
          {result.url.startsWith("https://") && <button className="inline-action read-result" type="button"
            onClick={() => void openPage(result.url, true)}><BookOpen size={14}/> Read full page</button>}
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

    {screen === "page" && <section className="drawer" role="dialog" aria-label="Webpage reader">
      <header className="drawer-header">
        <button className="back-button" title="Go back" onClick={() => {
          setScreen(pageReturn);
          if (pageReturn === "compact") focusInput();
        }}><ArrowLeft size={19}/></button>
        <div className="drawer-title"><strong>Webpage reader</strong><span>Public HTTPS · local page cache</span></div>
      </header>
      <form className="search-form" onSubmit={event => {
        event.preventDefault();
        if (!pageBusy) void openPage(pageUrl, pageReturn === "search");
      }}>
        <input ref={pageInputRef} aria-label="Webpage URL" placeholder="https://example.com/article"
          value={pageUrl} onChange={event => { setPageUrl(event.target.value); setPage(null); setPageError(null); }}/>
        <button className="secondary-action" type="submit" disabled={!pageUrl.trim() || pageBusy}>
          {pageBusy ? <LoaderCircle size={16} className="spin"/> : <BookOpen size={16}/>} Read
        </button>
      </form>
      <div className="search-body">
        {pageBusy && <div className="search-empty"><LoaderCircle size={32} className="spin"/> Reading webpage…</div>}
        {!pageBusy && pageError && <div className="search-error"><strong>Reader unavailable</strong><p>{pageError}</p>
          <span>Some sites block automated retrieval. Only public HTTPS HTML/text pages are allowed.</span>
        </div>}
        {!pageBusy && !pageError && !page && <div className="search-empty"><BookOpen size={32}/> Enter a public webpage URL to read and cache its main text.</div>}
        {!pageBusy && page && <article className="page-document">
          <h2>{page.title}</h2>
          <button type="button" className="source-link" title={page.url}
            onClick={() => void openSource(page.url)}>{page.url} <ExternalLink size={13}/></button>
          <div className="page-meta">{page.fromCache ? "Loaded from local cache" : "Fetched and cached"} ·
            {" "}Saved {new Date(page.fetchedAt * 1000).toLocaleString()}</div>
          <div className="page-text">{page.content}</div>
        </article>}
      </div>
      <footer className="search-footer">
        <button type="button" className="secondary-action" disabled={pageBusy || !pageUrl.trim()}
          onClick={() => void openPage(pageUrl, pageReturn === "search", true)}><RotateCw size={14}/> Refresh</button>
        <button type="button" className="save-button" disabled={busy || pageBusy || !page}
          onClick={() => {
            if (!page) return;
            const result: WebResult = {title: page.title,url:page.url,content:page.content.slice(0,450),engine:"webpage"};
            void send({ query: "Summarize and explain this webpage: " + page.title, results: [result], page });
          }}><Sparkles size={16}/> Ask Mikan</button>
      </footer>
    </section>}

    {screen === "memory" && <MemoryPanel key={memoryInitialTab} initialTab={memoryInitialTab}
      conversations={conversations} facts={userFacts} currentId={activeConversationId}
      busy={busy} error={memoryError} onClose={goCompact} onNew={clearChat}
      onOpen={openConversation} onDeleteChat={deleteConversation}
      onAddFact={addUserFact} onEditFact={editUserFact} onDeleteFact={deleteUserFact}
      onRefresh={refreshMemory}/>}

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
        <div className="drawer-title"><strong>Settings</strong><span>Mikan v0.6.2 · Local first</span></div>
        <button className="secondary-action" onClick={() => setDraft(current => ({
          ...current,
          ...(settingsTab === "ai" ? {
            endpoint: DEFAULT_SETTINGS.endpoint, model: DEFAULT_SETTINGS.model,
            systemPrompt: DEFAULT_SETTINGS.systemPrompt,
            contextWindow: DEFAULT_SETTINGS.contextWindow
          } : settingsTab === "internet" ? {
            searxngEndpoint: DEFAULT_SETTINGS.searxngEndpoint, autoSearch: false, cacheHours: 24
          } : { appearance: { ...DEFAULT_APPEARANCE } })
        }))}><RotateCw size={14}/> Reset tab</button>
      </header>
      <nav className="settings-tabs" aria-label="Settings categories">
        {([["ai", "AI & Models"], ["internet", "Internet"], ["appearance", "Appearance"]] as const).map(([tab, label]) =>
          <button type="button" key={tab} className={settingsTab === tab ? "settings-tab active" : "settings-tab"}
            onClick={() => { setSettingsTab(tab); if (tab === "internet") { void refreshService(); void refreshCache(); } }}>
            {label}
          </button>
        )}
      </nav>
      <div className="settings-body">
        {settingsTab === "ai" && <>
          <div className="settings-section-title">Local AI</div>
          <label className="setting-field">Ollama endpoint
            <input spellCheck={false} value={draft.endpoint}
              onChange={event => setDraft({ ...draft, endpoint: event.target.value })}/>
            <small>Local HTTP only. No API key required.</small>
          </label>
          <label className="setting-field">Ollama model
            <select aria-label="Installed Ollama models"
              value={availableModels.includes(draft.model) ? draft.model : "__custom__"}
              onChange={event => setDraft({ ...draft, model: event.target.value === "__custom__" ? "" : event.target.value })}>
              {availableModels.map(name => <option key={name} value={name}>{name}</option>)}
              <option value="__custom__">Other / enter model name manually</option>
            </select>
            {!availableModels.includes(draft.model) && <input aria-label="Manual Ollama model name"
              spellCheck={false} placeholder="model-name:tag" value={draft.model}
              onChange={event => setDraft({ ...draft, model: event.target.value })}/>}
            <small>{availableModels.length} local model(s) detected.</small>
          </label>
          <button className="inline-action" disabled={connection.mode === "loading"}
            onClick={() => void refreshModels(draft.endpoint)}><RotateCw size={14}/> Refresh models</button>
          <label className="setting-field">Context window
            <select aria-label="Ollama context window" value={draft.contextWindow ?? "default"}
              onChange={event => setDraft(current => ({
                ...current, contextWindow: event.target.value === "default" ? null : Number(event.target.value)
              }))}>
              <option value="default">Ollama default</option>
              <option value="4096">4K tokens</option>
              <option value="8192">8K tokens</option>
              <option value="16384">16K tokens</option>
              <option value="32768">32K tokens</option>
            </select>
            <small>Try 8K or 16K for research follow-ups. Larger windows use more VRAM and can slow responses. Only Mikan's Ollama requests are affected.</small>
          </label>
          <label className="setting-field">System/persona prompt
            <textarea rows={9} value={draft.systemPrompt}
              onChange={event => setDraft({ ...draft, systemPrompt: event.target.value })}/>
            <small>Core personality instructions. Presets and sliders live in the separate Personality panel.</small>
          </label>
          <button type="button" className="secondary-action"
            onClick={() => setScreen("personality")}><SlidersHorizontal size={15}/> Open Personality controls</button>
        </>}
        {settingsTab === "internet" && <>
          <div className="settings-section-title">Local search service</div>
          <label className="setting-field">SearXNG endpoint
            <input spellCheck={false} value={draft.searxngEndpoint}
              onChange={event => setDraft({ ...draft, searxngEndpoint: event.target.value })}
              placeholder="http://127.0.0.1:8888"/>
            <small>Only localhost endpoints. Docker Desktop must be running.</small>
          </label>
          <div className="service-panel">
            <div><strong>SearXNG container</strong>
              <span className={service?.state === "ready" ? "service-running" : "service-muted"}>
                {service?.message || "Checking Docker status…"}
              </span>
            </div>
            <div className="service-buttons">
              <button type="button" className="secondary-action" disabled={serviceBusy}
                onClick={() => void manageService("start")}>Start</button>
              <button type="button" className="secondary-action" disabled={serviceBusy}
                onClick={() => void manageService("stop")}>Stop</button>
              <button type="button" className="secondary-action" disabled={serviceBusy}
                onClick={() => void manageService("status")}><RotateCw size={14}/> Status</button>
            </div>
            {serviceError && <small className="field-error">{serviceError}</small>}
            <small>Start enables automatic recovery and Docker's unless-stopped policy; Stop disables recovery. First-time SearXNG setup is still manual; custom ports are monitored but not automatically restarted.</small>
          </div>
          <label className="settings-toggle">
            <input type="checkbox" checked={draft.autoManageSearch}
              onChange={e => setDraft(current => ({ ...current, autoManageSearch: e.target.checked }))}/>
            <span><strong>Automatic search startup &amp; recovery</strong>
              <small>Check SearXNG every 45 seconds, start Docker Desktop if needed, and recover a stopped or unresponsive container. Turning this off leaves services alone. Pressing Stop also disables recovery.</small>
            </span>
          </label>
          <label className="settings-toggle">
            <input type="checkbox" checked={draft.autoSearch}
              onChange={e => setDraft(current => ({ ...current, autoSearch: e.target.checked }))}/>
            <span><strong>Automatic web tools</strong>
              <small>Allow Ollama to decide when to search and read public webpages. Slower on some models; requests go to external sites. Off by default.</small>
            </span>
          </label>
          <div className="settings-section-title"><HardDrive size={17}/> Webpage cache</div>
          <label className="setting-field">Refresh cached pages after
            <select value={draft.cacheHours} onChange={e => setDraft(current => ({ ...current, cacheHours: Number(e.target.value) }))}>
              <option value={6}>6 hours</option>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
              <option value={720}>30 days</option>
            </select>
            <small>Previously read pages are stored locally. They aren't model training data.</small>
          </label>
          <div className="service-panel cache-panel">
            <span>{cacheInfo ? `${cacheInfo.pages} pages · ${Math.round(cacheInfo.bytes / 1024)} KB` : "Cache not checked"}</span>
            <button type="button" className="secondary-action" onClick={() => {
              void invoke<CacheInfo>("clear_web_cache")
                .then(setCacheInfo).catch(e => setServiceError(errorText(e)));
            }}>Clear cache</button>
          </div>
          <button type="button" className="inline-action" onClick={() => void openPage("")}><BookOpen size={14}/> Open webpage reader</button>
        </>}
        {settingsTab === "appearance" && <>
          <div className="settings-section-title">Character</div>
          <label className="setting-field">Portrait
            <input type="file" accept="image/png,image/jpeg,image/webp"
              onChange={event => void choosePortrait(event.target.files?.[0])}/>
            <small>Your existing Mikan portrait remains stored on this device.</small>
            {imageError && <small className="field-error">{imageError}</small>}
            {portrait && <span className="portrait-ready"><Check size={15}/> Portrait ready</span>}
          </label>
          <div className="settings-section-title">Colors and typography</div>
          <div className="setting-field"><span>Accent color</span>
            <div className="color-choices">
              {ACCENTS.map(color => <button key={color} type="button"
                className={draft.appearance.accent.toLowerCase() === color ? "color-swatch selected" : "color-swatch"}
                style={{ backgroundColor: color }} aria-label={`Select accent ${color}`}
                onClick={() => setDraft({ ...draft, appearance: { ...draft.appearance, accent: color } })}/>)}
              <label className="custom-color">Custom
                <input type="color" value={draft.appearance.accent}
                  onChange={e => setDraft({ ...draft, appearance: { ...draft.appearance, accent: e.target.value } })}/>
              </label>
            </div>
          </div>
          <div className="setting-field"><span>Panel color</span>
            <div className="color-choices">
              {PANELS.map(color => <button key={color} type="button"
                className={draft.appearance.panel.toLowerCase() === color ? "color-swatch selected" : "color-swatch"}
                style={{ backgroundColor: color }} aria-label={`Select panel ${color}`}
                onClick={() => setDraft({ ...draft, appearance: { ...draft.appearance, panel: color } })}/>)}
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
        </>}
      </div>
      <footer className="settings-footer">
        <button className="save-button" onClick={saveConfiguration}><Check size={17}/> Save settings</button>
      </footer>
    </section>}
  </main>;
}
