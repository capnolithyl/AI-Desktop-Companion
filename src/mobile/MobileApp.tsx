import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, BookOpen, Cat, Check, Copy, History, Image, LoaderCircle, MessageCircle, Plus, RotateCcw, Settings2, SlidersHorizontal, Sparkles, Square, Trash2 } from "lucide-react";
import defaultMikanPortrait from "./assets/mikan-portrait.webp";
import { ChatMarkdown } from "../components/ChatMarkdown";
import { PersonalityPresets, PersonalitySliders } from "../PersonalityControls";
import { CharacterCanonTab } from "../CharacterCanonTab";
import { personalityGuidance, findPreset, randomPersonality, PERSONALITY_TRAITS, type Personality } from "../personality";
import { parseSlashCommand, SLASH_HELP } from "../slash-commands";
import { loadSettings, saveSettings, loadPortrait, savePortrait, deletePortrait, type Settings } from "../storage";
import { memoryContext, characterContext, type UserFact, type CharacterFact, type CharacterCategory } from "../memory-client";
import { mobileBackend, type NativeStatus } from "./mobile-backend";
import { pocketMemory, type PocketThread, type PocketTurn } from "./mobile-memory";
import { resolveExplicitMemoryIntent, type ExplicitMemoryIntent } from "./memory-intent";
import { learningCommand, learningSessionActive, contextualLearningFact } from "./learning-memory";
import { planResearch, stripUnsupportedCitations } from "../research-routing";
import { verifyResearchAnswer } from "../evidence-verification";
import { retryTarget, type RetryTarget } from "./retry-response";
import { contextGuidance, needsContextResolution, resolveConversationQuestion } from "../conversation-engine";
import { priorResearchSources } from "../research-context";
import { compactWebContext, pageContext, type WebResult } from "../web-search";
import { deviceClockAnswer, pocketRuntimeContext } from "../runtime-context";
import "./mobile.css";

type Turn = PocketTurn;
type Thread = PocketThread;
type Screen = "chat" | "settings" | "personality" | "help" | "chats" | "memory" | "canon" | "log";
const THREAD_KEY = "mikan/mobile/threads/v1";
const ACTIVE_KEY = "mikan/mobile/active/v1";
const USER_KEY = "mikan/mobile/facts/v1";
const CANON_KEY = "mikan/mobile/canon/v1";
const AUTO_WEB_KEY = "mikan/mobile/automatic-web/v1";
const uuid = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36);
const newThread = (): Thread => ({ id: uuid(), title: "New chat", createdAt: Date.now(), turns: [] });
function readArray<T>(key: string): T[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch { return []; }
}
function buildPrompt(settings: Settings, facts: UserFact[], canon: CharacterFact[], turns: Turn[], research = "", verifiedMemory: string | null = null): string {
  const query = turns[turns.length - 1]?.content ?? "";
  const isLearning = learningSessionActive(turns);
  const learningGuidance = isLearning ? [
    "The user explicitly invited you to get to know them by asking questions and saving their answers. Ask exactly ONE short, specific question per reply, across varied topics.",
    "The app, not you, performs actual memory writes. Do not say a response was saved or that you'll definitely remember it unless the app explicitly verifies a write.",
    verifiedMemory
      ? "DATABASE WRITE VERIFIED FOR THIS USER REPLY: " + verifiedMemory + ". You may briefly acknowledge this true save, then ask the next question."
      : "No new memory write is confirmed for this turn. Do not assert you saved anything.",
    "Build on the user's answer without reciting earlier answers. Never pressure them to answer sensitive personal questions; they can stop the session any time."
  ].join(" ") : "";
  const context = [settings.systemPrompt, personalityGuidance(settings.personality), learningGuidance,
    pocketRuntimeContext(),
    "This is on-device Gemini Nano pocket mode. You cannot see the user's PC or desktop memory. You have no direct browsing abilities; when the application supplies WEB RESEARCH, use only those cited sources. Otherwise be candid about not having live data.",
    "When no WEB RESEARCH is provided for this turn, respond conversationally without citing sources or recycling earlier research. Do not invent numbered citations. Prior chat text is not verified evidence.",
    "Answer the CURRENT user question directly and concisely. For a follow-up, do not introduce the subject again, repeat previous facts or praise the user's taste. Only mention earlier details if essential to answer the NEW question.",
    "Do not turn a specific factual answer into another biography, timeline or generic recommendation. If you have no verified new information, say precisely what could not be confirmed, without replaying old search results.",
    "CRITICAL: Conversation text alone cannot save a memory. Never claim that a memory has been saved, filed away, or remembered permanently unless the application has confirmed a database write. Explicit save requests are handled by the app, not by your own text.",
    memoryContext(facts, query), characterContext(canon, query), research
  ].filter(Boolean).join("\n");
  // Keep earlier web replies as dialogue context, NOT as verified evidence.
  // Keep the most recent intact turns before truncating old context.
  const budget = Math.max(1200, (research ? 7900 : 5400) - context.length - query.length - 180);
  return context + "\n\n" + contextGuidance(turns.slice(0, -1), query, budget) + "\nMikan:";
}
function openLink(href: string) {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return;
    void mobileBackend.openLink(url.href).catch(failure => alert("Could not open the link: " + String(failure)));
  } catch { /* ignore malformed links */ }
}

export default function MobileApp() {
  const [settings, setSettings] = useState(loadSettings);
  const [screen, setScreen] = useState<Screen>("chat");
  const [threads, setThreads] = useState<Thread[]>(() => [newThread()]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = threads.find(thread => thread.id === activeId) ?? threads[0];
  const [facts, setFacts] = useState<UserFact[]>([]);
  const [canon, setCanon] = useState<CharacterFact[]>([]);
  const [memoryReady, setMemoryReady] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryNotice, setMemoryNotice] = useState<string | null>(null);
  const [memoryToast, setMemoryToast] = useState<{ key: number; message: string } | null>(null);
  const [webConfigured, setWebConfigured] = useState(false);
  const [webKeyDraft, setWebKeyDraft] = useState("");
  const [webEnabled, setWebEnabled] = useState(() => localStorage.getItem(AUTO_WEB_KEY) !== "false");
  const [webBusy, setWebBusy] = useState(false);
  const [webActivity, setWebActivity] = useState("");
  const [webError, setWebError] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [autoMemoryBusy, setAutoMemoryBusy] = useState(false);
  const [model, setModel] = useState<NativeStatus["status"] | "CHECKING">("CHECKING");
  const [modelAction, setModelAction] = useState<"check" | "download" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [portrait, setPortrait] = useState(defaultMikanPortrait);
  const [portraitIsCustom, setPortraitIsCustom] = useState(false);
  const [portraitOpen, setPortraitOpen] = useState(true);
  const [editFact, setEditFact] = useState("");
  const [openFactId, setOpenFactId] = useState<number | null>(null);
  const [memoText, setMemoText] = useState("");
  const [intro, setIntro] = useState("");
  const transcript = useRef<HTMLElement>(null);
  const followLatest = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const portraitUrl = useRef<string | null>(null);
  const memoryQueue = useRef<Promise<void>>(Promise.resolve());
  const memoryToastId = useRef(0);

  useEffect(() => { if (memoryReady && active) localStorage.setItem(ACTIVE_KEY, active.id); }, [active, memoryReady]);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { localStorage.setItem(AUTO_WEB_KEY, String(webEnabled)); }, [webEnabled]);
  useEffect(() => {
    if (!memoryToast) return;
    const timer = window.setTimeout(() => {
      setMemoryToast(current => current?.key === memoryToast.key ? null : current);
    }, 3300);
    return () => window.clearTimeout(timer);
  }, [memoryToast]);
  useEffect(() => {
    // One-time, transactional migration. Never erase the legacy browser data
    // unless native SQLite confirms that the import completed successfully.
    const preferredId = localStorage.getItem(ACTIVE_KEY);
    void pocketMemory.bootstrap({
      threads: readArray<Thread>(THREAD_KEY),
      facts: readArray<UserFact>(USER_KEY),
      canon: readArray<CharacterFact>(CANON_KEY)
    }).then(snapshot => {
      const stored = (snapshot.threads.length ? snapshot.threads : [newThread()])
        .map(thread => ({...thread, turns:thread.turns.map(turn =>
          turn.role === "assistant" && !turn.content.trim()
            ? {...turn, failed:true} : turn)}));
      setThreads(stored);
      setFacts(snapshot.facts);
      setCanon(snapshot.canon);
      setActiveId(stored.some(thread => thread.id === preferredId) ? preferredId : stored[0].id);
      setMemoryReady(true);
      localStorage.removeItem(THREAD_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(CANON_KEY);
    }).catch(failure => {
      setMemoryError("Couldn't open SQLite memory: " + String(failure));
    });
    void mobileBackend.webStatus().then(status => setWebConfigured(status.configured)).catch(() => {});
    void mobileBackend.status().then(setModel).catch(failure => {
      setModel("UNAVAILABLE");
      setError(String(failure));
    });
    void loadPortrait().then(blob => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        portraitUrl.current = url;
        setPortrait(url);
        setPortraitIsCustom(true);
      }
    }).catch(() => {});
    return () => {
      if (portraitUrl.current) URL.revokeObjectURL(portraitUrl.current);
    };
  }, []);
  useEffect(() => {
    // Keep streaming replies and appended source links in view, but let the user
    // scroll upward to read older messages without yanking the view back down.
    if (screen === "chat" && followLatest.current && transcript.current) {
      transcript.current.scrollTop = transcript.current.scrollHeight;
    }
  }, [screen, active?.turns, intro, webActivity, error]);
  useEffect(() => {
    // Shrink the artwork while the keyboard is up. CSS retains the composer in view.
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => setPortraitOpen(viewport.height > window.innerHeight * .72);
    viewport.addEventListener("resize", resize);
    resize();
    return () => viewport.removeEventListener("resize", resize);
  }, []);

  async function manageLocalModel() {
    if (modelAction || busy || model === "DOWNLOADING") return;
    const download = model === "DOWNLOADABLE";
    setModelAction(download ? "download" : "check");
    setError("");
    if (download) setModel("DOWNLOADING");
    try {
      setModel(download ? await mobileBackend.download() : await mobileBackend.status());
    } catch (failure) {
      setModel(download ? "DOWNLOADABLE" : "UNAVAILABLE");
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setModelAction(null);
    }
  }

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
      turns: [...thread.turns, turn]
    } : thread));
  }
  function replaceTurn(threadId: string, id: string, content: string, sources?: WebResult[], failed?: boolean) {
    setThreads(items => items.map(thread => thread.id === threadId ? {
      ...thread, turns: thread.turns.map(turn => turn.id === id ?
        { ...turn, content, ...(sources !== undefined ? { sources } : {}),
          ...(failed !== undefined ? { failed } : {}) } : turn)
    } : thread));
  }
  function startChat() {
    if (busy || !memoryReady) return;
    const fresh = newThread();
    followLatest.current = true;
    setThreads(items => [fresh, ...items]);
    setActiveId(fresh.id);
    setScreen("chat");
    void pocketMemory.createConversation(fresh.id).catch(failure => setMemoryError(String(failure)));
  }
  function confirmMemorySaved(message: string) {
    setMemoryToast({ key: ++memoryToastId.current, message });
  }
  async function refreshUserFacts(): Promise<UserFact[]> {
    const current = await pocketMemory.listFacts();
    setFacts(current);
    return current;
  }
  async function refreshCharacterFacts(): Promise<CharacterFact[]> {
    const current = await pocketMemory.listCanon();
    setCanon(current);
    return current;
  }
  async function addFact(fact: string): Promise<UserFact> {
    const saved = await pocketMemory.addFact(fact);
    await refreshUserFacts();
    confirmMemorySaved("Memory saved");
    return saved;
  }
  async function editUserFact(id: number, fact: string): Promise<void> {
    setMemoryBusy(true);
    setMemoryNotice(null);
    try {
      await pocketMemory.updateFact(id, fact);
      const current = await refreshUserFacts();
      if (!current.some(item => item.id === id && item.fact === fact.trim().replace(/\s+/g, " "))) {
        throw new Error("SQLite did not return the updated memory");
      }
      setMemoryError(null);
      setMemoryNotice("Memory updated and verified in SQLite.");
      confirmMemorySaved("Memory updated");
    } finally { setMemoryBusy(false); }
  }
  async function deleteUserFact(id: number): Promise<void> {
    setMemoryBusy(true);
    setMemoryNotice(null);
    try {
      await pocketMemory.deleteFact(id);
      const current = await refreshUserFacts();
      if (current.some(item => item.id === id)) {
        throw new Error("SQLite still contains the deleted memory");
      }
      setMemoryError(null);
      setMemoryNotice("Memory deleted and verified in SQLite.");
    } finally { setMemoryBusy(false); }
  }
  async function addCanon(category: CharacterCategory, label: string, value: string): Promise<void> {
    await pocketMemory.addCanon(category, label, value);
    await refreshCharacterFacts();
    confirmMemorySaved("Mikan detail saved");
  }
  async function editCanon(id: number, category: CharacterCategory, label: string, value: string): Promise<void> {
    setMemoryBusy(true);
    try {
      await pocketMemory.updateCanon(id, category, label, value);
      await refreshCharacterFacts();
      setMemoryError(null);
      confirmMemorySaved("Mikan detail updated");
    } finally { setMemoryBusy(false); }
  }
  async function deleteCanon(id: number): Promise<void> {
    setMemoryBusy(true);
    try {
      await pocketMemory.deleteCanon(id);
      await refreshCharacterFacts();
      setMemoryError(null);
    } finally { setMemoryBusy(false); }
  }
  async function deleteThread(id: string): Promise<void> {
    if (!confirm("Delete this phone-local conversation?")) return;
    try {
      await pocketMemory.deleteConversation(id);
      const next = threads.filter(thread => thread.id !== id);
      const kept = next.length ? next : [newThread()];
      setThreads(kept);
      if (active.id === id) setActiveId(kept[0].id);
    } catch (failure) {
      setMemoryError(String(failure));
    }
  }
  function captureAutomaticMemory(threadId: string, userId: string, assistantId: string) {
    if (!settings.autoRememberUser && !settings.autoRememberMikan) return;
    memoryQueue.current = memoryQueue.current.catch(() => {}).then(async () => {
      setAutoMemoryBusy(true);
      try {
        const result = await pocketMemory.processTurn(threadId, userId, assistantId,
          settings.autoRememberUser, settings.autoRememberMikan);
        if (result.userSaved || result.characterSaved) {
          const [savedUserFacts, savedCanon] = await Promise.all([
            pocketMemory.listFacts(), pocketMemory.listCanon()
          ]);
          setFacts(savedUserFacts);
          setCanon(savedCanon);
          const saved = [
            result.userSaved ? `${result.userSaved} about you` : "",
            result.characterSaved ? `${result.characterSaved} about Mikan` : ""
          ].filter(Boolean).join(" · ");
          confirmMemorySaved(`Remembered: ${saved}`);
        }
        setMemoryError(null);
      } catch (failure) {
        setMemoryError("Automatic memory extraction skipped: " + String(failure));
      } finally {
        setAutoMemoryBusy(false);
      }
    });
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
    if (name === "search") {
      if (!argument) commandResponse("Usage: /search <what to look up>");
      else void send("Search the web for: " + argument, "search");
      return true;
    }
    if (name === "read") {
      if (!argument) commandResponse("Usage: /read <public https URL>");
      else void send("Read and summarize this webpage: " + argument, "read");
      return true;
    }
    if (name === "new") { startChat(); return true; }
    if (["appearance", "prompt", "portrait"].includes(name)) {
      setScreen("settings");
      return true;
    }
    if (["memories", "canon"].includes(name)) {
      setScreen(name === "memories" ? "memory" : "canon"); return true;
    }
    if (name === "remember") {
      if (!argument) commandResponse("Usage: /remember <fact>");
      else void addFact(argument)
        .then(() => commandResponse("Saved to your phone's SQLite memory."))
        .catch(failure => setMemoryError(String(failure)));
      return true;
    }
    if (name === "forget") {
      const id = Number(argument.replace(/^#/, ""));
      if (!Number.isSafeInteger(id) || id <= 0) commandResponse("Usage: /forget <fact id>");
      else void deleteUserFact(id).then(() => commandResponse("Removed local fact #" + id + "."))
        .catch(failure => setMemoryError(String(failure)));
      return true;
    }
    if (name === "canon-set") {
      const colon = argument.indexOf(":");
      if (colon < 1) commandResponse("Usage: /canon-set <detail>: <value>");
      else {
        void addCanon("other", argument.slice(0, colon).trim(), argument.slice(colon + 1).trim())
          .then(() => commandResponse("Saved Mikan's character detail in SQLite."))
          .catch(failure => setMemoryError(String(failure)));
      }
      return true;
    }
    if (name === "canon-forget") {
      const id = Number(argument.replace(/^#/, ""));
      if (!Number.isSafeInteger(id) || id <= 0) commandResponse("Usage: /canon-forget <detail id>");
      else void deleteCanon(id).then(() => commandResponse("Removed Mikan canon entry #" + id + "."))
        .catch(failure => setMemoryError(String(failure)));
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
    const desktopOnly = new Set(["hide", "models", "model", "internet", "search-status", "search-start", "search-stop", "ollama", "searxng"]);
    if (desktopOnly.has(name)) {
      commandResponse("/" + name + " needs the desktop or a future PC-connected backend. Pocket mode is completely offline.");
      return true;
    }
    commandResponse("Unknown command /" + name + ". Type /help for available commands.");
    return true;
  }

  async function saveExplicitMemory(
    intent: ExplicitMemoryIntent,
    threadId: string, user: Turn, assistant: Turn
  ): Promise<void> {
    let reply = "";
    try {
      // Save the new turn first, then persist the actual memory before
      // acknowledging it. A generated "sure" is not a database commit.
      await pocketMemory.saveMessage(threadId, user);
      if (intent.kind === "clarify") {
        reply = intent.description;
      } else if (intent.kind === "user") {
        await addFact(intent.fact);
        reply = "Saved to your user memories: " + intent.fact + ". You can check or edit it under Memory.";
      } else {
        await addCanon(intent.category, intent.label, intent.value);
        reply = "Saved to my character canon: " + intent.description + ". You can check it under /canon.";
      }
      setMemoryError(null);
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : String(failure);
      // Don't lie about persistence and don't fall back to a model-generated
      // assurance if SQLite rejects a write.
      reply = "I couldn't save that memory. " + detail;
      setMemoryError(detail);
    }
    replaceTurn(threadId, assistant.id, reply);
    try {
      await pocketMemory.saveMessage(threadId, { ...assistant, content: reply });
    } catch (failure) {
      setMemoryError("Could not save the conversation reply: " + String(failure));
    }
  }

  async function send(textOverride?: string, mode?: "search" | "read", retry?: RetryTarget) {
    const text = (textOverride ?? draft).trim();
    if (!text || busy || !memoryReady) return;
    if (textOverride === undefined && !retry) setDraft("");
    setIntro("");
    const cmd = textOverride === undefined && !retry ? parseSlashCommand(text) : null;
    if (cmd) { handleCommand(cmd.name, cmd.argument); return; }
    const history = retry?.history ?? active.turns;
    const explicitMemory = retry ? null : resolveExplicitMemoryIntent(text, history);
    const learnCommand = mode || retry ? null : learningCommand(text);
    const learningAnswer = mode || retry || learnCommand || explicitMemory
      ? null : contextualLearningFact(text, history);
    const localClockAnswer = mode || retry ? null : deviceClockAnswer(text);
    if (!explicitMemory && !localClockAnswer && model !== "READY") {
      setIntro("Gemini Nano isn't ready yet. Open Settings to check or download the local model.");
      return;
    }
    followLatest.current = true;
    setBusy(true);
    setError("");
    const threadId = retry?.threadId ?? active.id;
    const user: Turn = retry?.user ?? { id: uuid(), role: "user", content: text, createdAt: Date.now() };
    const assistant: Turn = retry?.assistant ?? { id: uuid(), role: "assistant", content: "", createdAt: Date.now() };
    if (retry) {
      // Keep the same assistant ID and don't append a duplicate user message.
      replaceTurn(threadId, assistant.id, "", retry.assistant.sources ?? [], false);
    } else {
      writeTurn(threadId, user);
      writeTurn(threadId, assistant);
    }
    let output = "";
    let sources: WebResult[] = retry?.assistant.sources ?? [];
    try {
      // The message is durable before inference and can be cited as evidence.
      if (explicitMemory) {
        await saveExplicitMemory(explicitMemory, threadId, user, assistant);
        return;
      }
      await pocketMemory.saveMessage(threadId, user);
      // Persist the placeholder before inference so Android process death
      // cannot lose the question or produce an un-retryable half-message.
      await pocketMemory.saveMessage(threadId, { ...assistant, content:"", sources, failed:false });
      // A learning session is explicit consent, persisted in chat history.
      // Stop never depends on a model response or an asynchronous extraction.
      if (learnCommand === "stop") {
        const reply = "Got it! I'll stop collecting answers. Already saved memories remain editable under Memory.";
        replaceTurn(threadId, assistant.id, reply);
        await pocketMemory.saveMessage(threadId, { ...assistant, content: reply });
        return;
      }
      let verifiedMemory: string | null = null;
      let promptFacts = facts;
      if (learningAnswer) {
        try {
          // Save first. Only a successful read-back allows the AI to claim it
          // remembers the answer. This works even if auto-memory is disabled.
          const saved = await pocketMemory.addFact(learningAnswer.fact);
          const readBack = await pocketMemory.listFacts();
          if (!readBack.some(f => f.id === saved.id && f.fact === learningAnswer.fact)) {
            throw new Error("Saved fact could not be verified in SQLite.");
          }
          setFacts(readBack);
          promptFacts = readBack;
          verifiedMemory = learningAnswer.fact;
          confirmMemorySaved("Saved answer to user memory");
        } catch (failure) {
          const detail = failure instanceof Error ? failure.message : String(failure);
          const reply = "I couldn't save that answer, so I won't claim to remember it. " + detail;
          replaceTurn(threadId, assistant.id, reply);
          await pocketMemory.saveMessage(threadId, { ...assistant, content: reply });
          setMemoryError(detail);
          return;
        }
      }
      if (localClockAnswer) {
        // A local date/time request needs neither Tavily nor Gemini Nano.
        // Never attach stale research links or an unrelated album summary.
        replaceTurn(threadId, assistant.id, localClockAnswer);
        await pocketMemory.saveMessage(threadId, { ...assistant, content: localClockAnswer });
        return;
      }
      let research = "";
      const researchPlan = planResearch(text, history);
      // Resolve ambiguous factual follow-ups using a local Nano-only request.
      // Only the resulting standalone query (not the chat history) reaches Tavily.
      const condensed = !mode && webEnabled && researchPlan.mode !== "chat" &&
        needsContextResolution(text, history)
        ? await resolveConversationQuestion(text, history,
            prompt => mobileBackend.generate(prompt, () => {}))
        : null;
      const lookup = condensed?.rewritten ? condensed.standaloneQuestion :
        (researchPlan.query ?? text);
      const planned = researchPlan.mode === "chat" ? null : {
        query: lookup, recent: researchPlan.recent ||
          (condensed?.rewritten ? planResearch(lookup, history).recent : false)
      };
      const prior = priorResearchSources(history, text);
      // If the user requests fresh information while search is disabled, stop
      // before Nano improvises a convincing but unsourced release date.
      if (planned?.recent && !webEnabled && mode !== "search" && mode !== "read") {
        throw new Error("I can't verify current news while automatic search is off. Enable it in Settings → Internet or use /search.");
      }
      // Never ask Nano to guess about breaking news if the requested provider
      // hasn't been configured yet. Timeless knowledge remains available offline.
      if (webEnabled && planned?.recent && !webConfigured && mode !== "read") {
        throw new Error("Current information needs Tavily. Add your free API key in Settings → Internet, or turn off automatic search to use Nano offline.");
      }
      // Retrying a failed generation reuses the already retrieved evidence.
      // This avoids unnecessary Tavily credits and preserves the same sources.
      if (retry?.assistant.sources?.length) {
        sources = retry.assistant.sources;
        research = compactWebContext(lookup, sources);
      } else if (mode === "read") {
        if (!webConfigured) throw new Error("Set a Tavily API key in Settings → Internet before reading webpages.");
        const address = text.replace(/^Read and summarize this webpage:\s*/i, "").trim();
        setWebActivity("Reading webpage…");
        setWebBusy(true);
        try {
          const page = await mobileBackend.readWeb(address);
          sources = [{title:page.title, url:page.url, content:page.content.slice(0, 3300), engine:"Tavily"}];
          research = pageContext(text, { ...page, content: page.content.slice(0, 3300) });
        } finally {
          setWebBusy(false);
          setWebActivity("");
        }
      } else if (mode !== "search" && webEnabled && prior.length && !planned?.recent && !condensed?.rewritten &&
        !/\b(?:my|me|mine|our|ours|yourself)\b/i.test(text)) {
        // Follow-up evidence is already stored locally in SQLite metadata.
        // Reuse it rather than charging another search credit unnecessarily.
        sources = prior;
        research = compactWebContext(lookup, sources);
      } else if (mode === "search" || (webEnabled && webConfigured && planned)) {
        if (!webConfigured) throw new Error("Set a Tavily API key in Settings → Internet before searching.");
        const request = mode === "search" ?
          {query:text.replace(/^Search the web for:\s*/i,"").trim(), recent:false} : planned!;
        setWebActivity("Searching the web…");
        setWebBusy(true);
        try {
          const response = await mobileBackend.searchWeb(request.query,request.recent);
          sources = response.results;
          if (!sources.length) throw new Error("The search returned no usable sources. Try a different query.");
          research = compactWebContext(lookup, sources);
        } finally {
          setWebBusy(false);
          setWebActivity("");
        }
      }
      // Save retrieved sources before Nano starts. An app switch can interrupt
      // AICore; Retry then uses identical evidence without a second web query.
      if (sources.length) {
        await pocketMemory.saveMessage(threadId, {...assistant,content:"",sources,failed:false});
      }
      const answer = await (sources.length ? mobileBackend.generateResearch : mobileBackend.generate)(
        buildPrompt(settings, promptFacts, canon,
        [...history, user], research, verifiedMemory), chunk => {
        output += chunk;
        // Don't flash possibly fabricated factual claims before verification.
        if (!sources.length) {
          replaceTurn(threadId, assistant.id, stripUnsupportedCitations(output));
        }
      });
      const displayedAnswer = sources.length
        ? (mode === "read" ? answer : verifyResearchAnswer(answer, sources).text)
        : stripUnsupportedCitations(answer);
      replaceTurn(threadId, assistant.id, displayedAnswer, sources, false);
      await pocketMemory.saveMessage(threadId, {...assistant,content:displayedAnswer,sources,failed:false});
      // A successful retry is the first completed answer for this user turn.
      // Native extraction deduplicates by assistant ID when replayed.
      if (!verifiedMemory) captureAutomaticMemory(threadId, user.id, assistant.id);
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : String(failure);
      const reply = output && !sources.length
        ? output : "Generation interrupted. Tap Retry to regenerate this answer.";
      replaceTurn(threadId, assistant.id, reply, sources, true);
      setError(detail);
      await pocketMemory.saveMessage(threadId, {...assistant,content:reply,sources,failed:true})
        .catch(() => {});
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
      setPortraitIsCustom(true);
      setError("");
    } catch (failure) { setError(String(failure)); }
  }
  async function restoreDefaultPortrait() {
    try {
      await deletePortrait();
      if (portraitUrl.current) URL.revokeObjectURL(portraitUrl.current);
      portraitUrl.current = null;
      setPortrait(defaultMikanPortrait);
      setPortraitIsCustom(false);
      setError("");
    } catch (failure) {
      setError("Couldn't reset the portrait: " + String(failure));
    }
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
      <div className="pocket-heading">
        <strong>{screen === "chat" ? "Mikan" : title}</strong>
        <span className="pocket-subtitle">
          POCKET COMPANION · LOCAL · v{__POCKET_VERSION__}
          <button type="button" className={`pocket-model-indicator ${model === "READY" ? "ready" : "attention"}`}
            onClick={() => setScreen("settings")} title="View local model status in settings"
            aria-label={`Gemini Nano: ${model.toLowerCase()}. Open model settings`}>
            <i className="pocket-model-dot" aria-hidden="true"/>
            {model === "READY" ? "Nano ready" : model === "CHECKING" ? "Checking" :
              model === "DOWNLOADABLE" ? "Download" : model === "DOWNLOADING" ? "Downloading" : "Unavailable"}
          </button>
        </span>
      </div>
      <button className="pocket-icon-button" aria-label="Settings" onClick={() => setScreen("settings")}><Settings2 size={23}/></button>
    </header>
    {screen === "chat" ? <>
      {model !== "READY" && <button type="button" className="pocket-model-warning"
        onClick={() => setScreen("settings")}>
        {model === "CHECKING" ? "Checking the local model…" :
          model === "DOWNLOADABLE" ? "Gemini Nano needs a download. Open Settings." :
          model === "DOWNLOADING" ? "Gemini Nano is downloading. View in Settings." :
          "Gemini Nano is unavailable. Check its status in Settings."}
      </button>}
      <section className={"pocket-portrait " + (portraitOpen ? "" : "pocket-portrait-hidden")}>
        <img src={portrait} alt="Mikan's portrait"/>
      </section>
      <section ref={transcript} className="pocket-transcript" aria-label="Chat history"
         onScroll={event => {
           const panel = event.currentTarget;
           followLatest.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 96;
         }}>
        {active.turns.length === 0 && <div className="pocket-welcome">Hey! Pocket Mikan reporting for duty. Let's see what this little phone-brain can do. ✨</div>}
        {active.turns.map(turn => <article className={"pocket-turn " + turn.role} key={turn.id}>
          <strong>{turn.role === "user" ? "YOU" : "MIKAN"}</strong>
          <div className="pocket-bubble">{turn.content ? <ChatMarkdown text={turn.content} onOpenLink={openLink}/> : <LoaderCircle size={16} className="spin"/>}</div>
          {turn.sources && turn.sources.length > 0 && <details className="pocket-web-sources">
            <summary aria-label={`Sources used in this answer, ${turn.sources.length}. Expand or collapse`}>
              Sources <span className="pocket-source-count">{turn.sources.length}</span>
            </summary>
            <div className="pocket-web-source-list">
              {turn.sources.slice(0, 5).map((source, index) =>
                <button type="button" key={source.url} onClick={() => openLink(source.url)}
                  title={source.url}>{index + 1}. {source.title}</button>)}
            </div>
          </details>}
          {turn.role === "assistant" && (turn.failed || (!turn.content.trim() && !busy)) &&
            retryTarget(active.id, active.turns, turn.id) && <button
              type="button" className="pocket-retry"
              disabled={busy || !memoryReady || model !== "READY"}
              onClick={() => {
                const target = retryTarget(active.id, active.turns, turn.id);
                if (target) void send(target.user.content, undefined, target);
              }}><RotateCcw size={15}/> Retry answer</button>}
        </article>)}
        {intro && <p className="pocket-notice">{intro}</p>}
        {webActivity && <p className="pocket-web-activity" role="status"><LoaderCircle size={14} className="spin"/> {webActivity}</p>}
        {!memoryReady && <p className="pocket-notice">{memoryError ?? "Opening local SQLite memory…"}</p>}
        {memoryReady && memoryError && <p className="pocket-error" role="alert">{memoryError}</p>}
        {error && <p className="pocket-error" role="alert">{error}</p>}
      </section>
      <form className="pocket-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
        <textarea value={draft} onChange={event => setDraft(event.target.value)} disabled={!memoryReady} rows={2}
          placeholder="Chat with Mikan… (/help for commands)"
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}/>
        <button type={busy ? "button" : "submit"} disabled={!memoryReady} aria-label={busy ? "Stop generation" : "Send message"}
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
        <div className="pocket-portrait-settings">
          <img src={portrait} alt="Current Mikan portrait preview" className="pocket-portrait-settings-preview"/>
          <div className="pocket-portrait-settings-body">
            <strong>{portraitIsCustom ? "Custom portrait" : "Mikan's default portrait"}</strong>
            <p className="pocket-hint">Change Mikan's appearance without cluttering the chat.</p>
            <button className="pocket-wide-button" onClick={() => fileInput.current?.click()}><Image size={18}/> Choose image</button>
            {portraitIsCustom && <button className="pocket-portrait-reset" onClick={() => void restoreDefaultPortrait()}>Reset to default</button>}
          </div>
        </div>
        <h3>AI</h3>
        <p className="pocket-hint">Model: Gemini Nano (AICore), offline. Desktop Ollama models aren't installed on the phone.</p>
        <div className="pocket-model-settings">
          <div className="pocket-model-details">
            <strong>Local model</strong>
            <span><i className={`pocket-model-dot ${model === "READY" ? "ready" : "attention"}`} aria-hidden="true"/>
              {model === "READY" ? "Ready · Works offline" :
                model === "CHECKING" ? "Checking availability…" :
                model === "DOWNLOADABLE" ? "Download required before chatting" :
                model === "DOWNLOADING" ? "Downloading model…" : "Unavailable on this device"}
            </span>
          </div>
          <button type="button" onClick={() => void manageLocalModel()}
            disabled={busy || !!modelAction || model === "DOWNLOADING"}>
            {modelAction ? (modelAction === "download" ? "Downloading…" : "Checking…") :
              model === "DOWNLOADABLE" ? "Download" : "Check status"}
          </button>
        </div>
        <label className="pocket-field pocket-prompt">System prompt<textarea value={settings.systemPrompt} rows={6} onChange={event => updateSettings({ systemPrompt:event.target.value })}/></label>
        <h3>Internet</h3>
        <p className="pocket-hint">Optional independent web search over Wi-Fi or mobile data. Gemini Nano still runs on your phone; search queries and page URLs are sent to Tavily. No PC required. Tavily offers a free API tier.</p>
        <div className="pocket-web-settings">
          <strong>{webConfigured ? "Tavily connected" : "Tavily not configured"}</strong>
          <p className="pocket-hint">Get a free key from <button type="button" className="pocket-inline-link"
            onClick={() => openLink("https://app.tavily.com/")}>app.tavily.com</button>. Your key stays encrypted on this phone and is never saved in the chat or GitHub.</p>
          <label className="pocket-web-key-label" htmlFor="tavily-key">Tavily API key</label>
          <input id="tavily-key" type="password" autoComplete="off" autoCapitalize="none"
            spellCheck={false} placeholder={webConfigured ? "Saved securely; enter to replace" : "tvly-…"}
            value={webKeyDraft} onChange={event => setWebKeyDraft(event.target.value)} />
          <div className="pocket-web-key-actions">
            <button type="button" disabled={!webKeyDraft.trim() || webBusy} onClick={() => {
              setWebBusy(true); setWebError("");
              void mobileBackend.saveWebKey(webKeyDraft).then(status => {
                setWebConfigured(status.configured);
                setWebKeyDraft("");
                setWebError("");
              }).catch(failure => setWebError(String(failure)))
                .finally(() => setWebBusy(false));
            }}>Save key</button>
            {webConfigured && <button type="button" disabled={webBusy} onClick={() => {
              if (!confirm("Remove the saved Tavily key from this phone?")) return;
              setWebBusy(true); setWebError("");
              void mobileBackend.clearWebKey().then(() => {
                setWebConfigured(false); setWebKeyDraft("");
              }).catch(failure => setWebError(String(failure)))
                .finally(() => setWebBusy(false));
            }}>Remove key</button>}
          </div>
          {webError && <p className="pocket-error" role="alert">{webError}</p>}
        </div>
        <label className="pocket-toggle"><input type="checkbox" checked={webEnabled}
          onChange={event => setWebEnabled(event.target.checked)}/>
          Search automatically when a question needs current or verifiable information</label>
        <p className="pocket-hint">You can always use /search &lt;query&gt; or /read &lt;https URL&gt; even if automatic search is off. Searching consumes Tavily credits; no search runs for casual conversation.</p>
        <h3>Memories</h3>
        <p className="pocket-hint">User facts and Mikan's character canon are separate SQLite records. Automatic capture runs a second, short Gemini Nano analysis after completed replies and validates exact source evidence. It uses additional on-device inference, and may skip facts Nano cannot substantiate.</p>
        <label className="pocket-toggle"><input type="checkbox" checked={settings.autoRememberUser}
          onChange={event => updateSettings({ autoRememberUser: event.target.checked })}/>
          Automatically remember stable facts about me</label>
        <label className="pocket-toggle"><input type="checkbox" checked={settings.autoRememberMikan}
          onChange={event => updateSettings({ autoRememberMikan: event.target.checked })}/>
          Automatically remember Mikan's stated preferences</label>
        <p className="pocket-hint">{autoMemoryBusy ? "Analyzing the last completed turn locally…" :
          "Both switches are optional. Saved memories can be edited or deleted from their respective panels."}</p>
        {memoryError && <p className="pocket-error" role="alert">{memoryError}</p>}
        <p className="pocket-hint">Documentation caching, cloud sync and PC connections are not enabled in standalone pocket mode.</p>
        <button className="pocket-wide-button" onClick={() => setScreen("help")}>See supported slash commands</button>
      </>}
      {screen === "personality" && <>
        <h2>Personality controls</h2>
        <PersonalityPresets value={settings.personality} onChange={updatePersonality}/>
        <PersonalitySliders value={settings.personality} onChange={updatePersonality}/>
      </>}
      {screen === "help" && <>
        <p className="pocket-hint">The same slash-command definitions as desktop Mikan. /search and /read work with a configured Tavily key; Windows and Ollama commands remain desktop-only.</p>
        {SLASH_HELP.map(item => {
          const name = parseSlashCommand(item.insert.trimEnd())?.name ?? item.insert.split(" ")[0].slice(1);
          const disabled = ["search-start","search-stop","search-status","model","models","ollama","searxng","internet","hide"].includes(name);
          return <button className="pocket-command" key={item.usage} onClick={() => {
            if (disabled) { setIntro("That command needs the desktop or a future connected mode."); setScreen("chat"); }
            else { setDraft(item.insert); setScreen("chat"); }
          }}><code>{item.usage}</code><span>{item.description}{disabled ? " · Desktop only" : ""}</span></button>;
        })}
      </>}
      {screen === "chats" && <>
        <button className="pocket-wide-button" onClick={startChat}><Plus size={18}/> New conversation</button>
        {threads.map(thread => <div className="pocket-history-item" key={thread.id}>
          <button onClick={() => { followLatest.current = true; setActiveId(thread.id); setScreen("chat"); }}><MessageCircle size={18}/><span>{thread.title}<small>{thread.turns.length} messages</small></span>{active.id === thread.id && <Check size={15}/>}</button>
          <button aria-label="Delete conversation" disabled={!memoryReady || busy}
            onClick={() => { void deleteThread(thread.id); }}><Trash2 size={18}/></button>
        </div>)}
      </>}
      {screen === "memory" && <>
        <p className="pocket-hint">These are facts about you in this phone's SQLite database, separate from Mikan's character canon. Automatic capture is configurable in Settings. Nothing is synced to desktop yet.</p>
        {memoryNotice && <p className="pocket-memory-status" role="status">{memoryNotice}</p>}
        {memoryError && <p className="pocket-error" role="alert">{memoryError}</p>}
        <form onSubmit={event => {
          event.preventDefault();
          if (!memoText.trim() || !memoryReady || memoryBusy) return;
          setMemoryBusy(true);
          setMemoryNotice(null);
          void addFact(memoText).then(() => {
            setMemoText("");
            setMemoryError(null);
            setMemoryNotice("Memory saved and verified in SQLite.");
          }).catch(failure => setMemoryError(String(failure)))
            .finally(() => setMemoryBusy(false));
        }} className="pocket-memory-form">
          <textarea rows={3} value={memoText} onChange={event => setMemoText(event.target.value)} disabled={memoryBusy} placeholder="Fact to remember…" maxLength={500}/>
          <button type="submit" disabled={memoryBusy || !memoryReady}><Plus size={18}/> {memoryBusy ? "Saving…" : "Save local memory"}</button>
        </form>
        {facts.map(fact => <article className="pocket-fact" key={fact.id}>
          {openFactId === fact.id ? <>
            <textarea value={editFact} disabled={memoryBusy} onChange={event=>setEditFact(event.target.value)} maxLength={500}/>
            <div className="pocket-actions">
              <button type="button" disabled={memoryBusy || !editFact.trim()} onClick={() => {
                void editUserFact(fact.id,editFact).then(() => setOpenFactId(null))
                  .catch(failure => setMemoryError(String(failure)));
              }}>Save changes</button>
              <button type="button" disabled={memoryBusy} onClick={() => setOpenFactId(null)}>Cancel</button>
            </div>
          </> : <>
            <p>{fact.fact}</p>
            <div className="pocket-actions">
              <button type="button" disabled={memoryBusy} onClick={() => {
                setOpenFactId(fact.id); setEditFact(fact.fact); setMemoryNotice(null);
              }}>Edit</button>
              <button type="button" disabled={memoryBusy} onClick={() => {
                if (!confirm("Delete this memory?")) return;
                void deleteUserFact(fact.id).then(() => {
                  if (openFactId === fact.id) setOpenFactId(null);
                }).catch(failure => setMemoryError(String(failure)));
              }}>Delete</button>
            </div>
          </>}
          <small>#{fact.id}</small>
        </article>)}
      </>}
      {screen === "canon" && <CharacterCanonTab facts={canon}
        onAdd={(cat,label,value) => addCanon(cat,label,value)}
        onEdit={(id,cat,label,value) => editCanon(id,cat,label,value)}
        onDelete={id => deleteCanon(id)}/>}
      {screen === "log" && <>
        <button className="pocket-wide-button" onClick={() => void navigator.clipboard.writeText(active.turns.map(t => (t.role==="user"?"YOU":"MIKAN")+": "+t.content).join("\n\n")).catch(() => setError("Clipboard unavailable"))}><Copy size={18}/> Copy conversation</button>
        {active.turns.map(turn => <article className="pocket-fact" key={turn.id}><small>{turn.role === "user" ? "YOU" : "MIKAN"}</small><p>{turn.content}</p></article>)}
      </>}
      {error && <p className="pocket-error">{error}</p>}
      {memoryError && <p className="pocket-error">{memoryError}</p>}
    </section>}
    {memoryToast && <div key={memoryToast.key}
      className={"pocket-save-toast" + (screen === "chat" ? " on-chat" : "")}
      role="status" aria-live="polite" aria-atomic="true">
      <Check size={15} aria-hidden="true"/>
      <span>{memoryToast.message}</span>
    </div>}
    <input ref={fileInput} hidden type="file" accept="image/*" onChange={event => { void choosePortrait(event.target.files?.[0]); event.currentTarget.value=""; }}/>
    {screen !== "chat" && <footer className="pocket-page-footer"><button onClick={() => setScreen("chat")}><ArrowLeft size={16}/> Back to chat</button><span><Sparkles size={14}/> Mikan · local</span></footer>}
  </main>;
}
