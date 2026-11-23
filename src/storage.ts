import { DEFAULT_PERSONALITY, readPersonality, type Personality } from "./personality";
import { DEFAULT_COMMUNICATION, readCommunicationPreferences, type CommunicationPreferences } from "./communication-preferences";
import type { ReasoningMode } from "./reasoning-mode";
import { captureInterval, restoreRegion, type RegionChoice } from "./capture-region";
import { DEFAULT_SOURCE_PREFERENCES, readSourcePreferences, type SourcePreference } from "./preferred-sources";
import { DEFAULT_VOICE_VOLUME, readVoiceVolume } from "./speech";
import { DEFAULT_EMOJI_BUBBLE_SECONDS, readEmojiBubbleSeconds } from "./emoji-reactions";
import { DEFAULT_AVATAR_VERTICAL_OFFSET, readAvatarVerticalOffset } from "./avatar-viewport";

export type ResearchMode = "simple" | "strict";
export type ChatRole = "user" | "assistant";
export type Message = { id: string; role: ChatRole; content: string };
export type Settings = { voice: VoiceSettings; endpoint: string; model: string; provider: "local" | "auto" | "gemini" | "openrouter" | "nvidia"; nvidiaModel: string; modelLed: boolean; geminiModel: string; openrouterModel: string; systemPrompt: string; communication: CommunicationPreferences; appearance: Appearance; personality: Personality; searxngEndpoint: string; autoSearch: boolean; researchMode: ResearchMode; mikanifyAnswer: boolean; autoManageSearch: boolean; sourcePreferences: SourcePreference[]; cacheHours: number; contextWindow: number | null; reasoningMode: ReasoningMode; autoRememberUser: boolean; autoRememberMikan: boolean; visionCaptureIntervalSeconds:number; visionRegion:RegionChoice|null };

export type VoiceSettings = {
  engine: "qwen" | "pocket";
  endpoint: string;
  autoSpeak: boolean;
  /** Persisted mute applies to all synthesized voice output. */
  muted: boolean;
  progressiveSpeak: boolean;
  prompt: string;
  speed: number;
  /** Local playback gain (0–100%). Independent from Windows system volume. */
  volume: number;
};
export const DEFAULT_VOICE: VoiceSettings = {
  engine: "qwen",
  endpoint: "http://127.0.0.1:8765",
  autoSpeak: false,
  muted: false,
  progressiveSpeak: true,
  prompt: "A warm, expressive young adult anime-inspired woman's voice. Medium to slightly high pitch, gentle natural American English, softly playful and lightly teasing. Clear and relaxed, not shrill, squeaky, childlike or constantly overexcited.",
  speed: 1,
  volume: DEFAULT_VOICE_VOLUME
};
function readVoice(value: unknown): VoiceSettings {
  const data = value && typeof value === "object" ? value as Partial<VoiceSettings> : {};
  return {
    engine: data.engine === "pocket" ? "pocket" : "qwen",
    endpoint: typeof data.endpoint === "string" ? data.endpoint : DEFAULT_VOICE.endpoint,
    autoSpeak: data.autoSpeak === true,
    muted: data.muted === true,
    progressiveSpeak: data.progressiveSpeak !== false,
    prompt: typeof data.prompt === "string" && data.prompt.trim() ? data.prompt : DEFAULT_VOICE.prompt,
    speed: typeof data.speed === "number" && Number.isFinite(data.speed)
      ? Math.max(0.8, Math.min(1.2, data.speed)) : DEFAULT_VOICE.speed,
    volume: readVoiceVolume(data.volume)
  };
}

export type Appearance = {
  accent: string;
  panel: string;
  opacity: number;
  fontFamily: "Segoe UI" | "Arial" | "Verdana" | "Georgia";
  fontSize: number;
  emojiBubbleSeconds: number;
  avatarVerticalOffset: number;
};
export const DEFAULT_APPEARANCE: Appearance = {
  accent: "#ffad7e",
  panel: "#211b25",
  opacity: 0.94,
  fontFamily: "Segoe UI",
  fontSize: 13,
  emojiBubbleSeconds: DEFAULT_EMOJI_BUBBLE_SECONDS,
  avatarVerticalOffset: DEFAULT_AVATAR_VERTICAL_OFFSET
};
function safeHex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
function readAppearance(value: unknown): Appearance {
  const v = value && typeof value === "object" ? value as Partial<Appearance> : {};
  const fonts = ["Segoe UI", "Arial", "Verdana", "Georgia"];
  return {
    accent: safeHex(v.accent, DEFAULT_APPEARANCE.accent),
    panel: safeHex(v.panel, DEFAULT_APPEARANCE.panel),
    opacity: typeof v.opacity === "number" && Number.isFinite(v.opacity) ? Math.max(0.65, Math.min(1, v.opacity)) : DEFAULT_APPEARANCE.opacity,
    fontFamily: fonts.includes(String(v.fontFamily)) ? v.fontFamily as Appearance["fontFamily"] : DEFAULT_APPEARANCE.fontFamily,
    fontSize: typeof v.fontSize === "number" && Number.isFinite(v.fontSize) ? Math.max(11, Math.min(20, Math.round(v.fontSize))) : DEFAULT_APPEARANCE.fontSize,
    emojiBubbleSeconds: readEmojiBubbleSeconds(v.emojiBubbleSeconds),
    avatarVerticalOffset: readAvatarVerticalOffset(v.avatarVerticalOffset)
  };
}

export const DEFAULT_SETTINGS: Settings = {
  endpoint: "http://127.0.0.1:11434",
  provider: "nvidia",
  nvidiaModel: "nvidia/nemotron-3-ultra-550b-a55b",
  modelLed: false,
  geminiModel: "gemini-3.8-flash",
  openrouterModel: "openrouter/free",
  voice: { ...DEFAULT_VOICE },
  searxngEndpoint: "http://127.0.0.1:8888",
  autoSearch: false,
  sourcePreferences: readSourcePreferences(DEFAULT_SOURCE_PREFERENCES),
  researchMode: "simple",
  mikanifyAnswer: false,
  autoManageSearch: false,
  cacheHours: 24,
  contextWindow: 16384,
  reasoningMode: "auto",
  autoRememberUser: true,
  autoRememberMikan: true,
  visionCaptureIntervalSeconds:15,
  visionRegion:null,
  appearance: { ...DEFAULT_APPEARANCE },
  personality: { ...DEFAULT_PERSONALITY },
  communication: { ...DEFAULT_COMMUNICATION },
  model: "qwen3.5:9b",
  systemPrompt: "You are Mikan, the owner's witty, affectionate catgirl desktop companion. You are curious, expressive, warm, playful and occasionally teasing, not a generic helpdesk chatbot. Your character comes through in the actual conversation: react to what the owner shared, enjoy natural banter when appropriate, and have a point of view without inventing facts or pretending to have experiences you do not have. A passing personal update is an invitation to talk, not automatically a request for a report, unsolicited benchmark roundup, or a string of questions. When discussing code, research or complex problems, stay technically sharp and useful while still sounding like yourself; never sacrifice accuracy for cuteness. Let the owner's personality sliders and communication settings decide how warm, flirty, sassy, energetic and detailed to be. Do not force meows, emojis, nicknames or jokes into every answer. Do not narrate gestures, ear or tail movements or imaginary physical contact unless the owner explicitly requests roleplay. Respect the limits of your actual memories: if a detail of their setup or history has not been provided in the conversation or retrieved context, ask a natural follow-up when needed instead of guessing. Distinguish verified evidence from assumptions and clearly acknowledge uncertainty. Never claim screen or web access unless you actually used it."
};

// Migrate only known shipped defaults; never overwrite an owner-customized prompt.
const SHIPPED_0_9_63_DEFAULT_SYSTEM_PROMPT = "You are Mikan, a warm, witty, affectionate and occasionally teasing desktop AI companion. Be lively, conversational and playful in your actual words. Do not narrate physical gestures, stage directions, ear or tail movements, or imaginary touches unless the user specifically asks for roleplay. Keep factual answers well supported by evidence, and distinguish separate events and milestones carefully. Admit when you are uncertain. Never claim to have seen the user's screen or accessed the web unless you actually have.";
const PREVIOUS_GESTURE_DEFAULT_SYSTEM_PROMPT = "You are Mikan, a warm, witty, affectionate and occasionally teasing desktop AI companion. Be lively and conversational, including playful asides and little character gestures when they fit. Keep factual answers well supported by evidence, and distinguish separate events and milestones carefully. Admit when you are uncertain. Never claim to have seen the user's screen or accessed the web unless you actually have.";
const PRIOR_DEFAULT_SYSTEM_PROMPT = "You are Mikan, a witty, curious, warm and occasionally teasing desktop AI companion. Keep replies conversational and concise, leading with the actual answer. Show personality through wit and tone, not repetitive stage directions or obligatory questions. Be genuinely useful and admit when you are uncertain. Never claim to have seen the user's screen or accessed the web unless you actually have.";
const SETTINGS_KEY = "mikan/settings/v1";

export function loadSettings(): Settings {
  try {
    // Old settings may have structuredResearch: true/false. The experimental
    // strict path stays available but new installs and upgrades try Simple.
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>;
    return {
      endpoint: typeof data.endpoint === "string" ? data.endpoint : DEFAULT_SETTINGS.endpoint,
      provider: data.provider === "nvidia" ? "nvidia" : data.provider === "auto" || data.provider === "gemini" || data.provider === "openrouter" || data.provider === "local" ? data.provider : DEFAULT_SETTINGS.provider,
      nvidiaModel: typeof data.nvidiaModel === "string" && ["nvidia/nemotron-3-ultra-550b-a55b","z-ai/glm-5.3-flash","mistralai/mistral-large-4-1t-a52b"].includes(data.nvidiaModel) ? data.nvidiaModel : DEFAULT_SETTINGS.nvidiaModel,
      modelLed: data.modelLed === true,
      openrouterModel: typeof data.openrouterModel === "string" && (data.openrouterModel === "openrouter/free" || /^[a-zA-Z0-9_./-]+:free$/.test(data.openrouterModel)) ? data.openrouterModel : DEFAULT_SETTINGS.openrouterModel,
      geminiModel: typeof data.geminiModel === "string" && /^gemini-[a-zA-Z0-9.-]{1,90}$/.test(data.geminiModel) ? data.geminiModel : DEFAULT_SETTINGS.geminiModel,
      voice: readVoice(data.voice),
      searxngEndpoint: typeof data.searxngEndpoint === "string" ? data.searxngEndpoint : DEFAULT_SETTINGS.searxngEndpoint,
      autoSearch: data.autoSearch === true,
      sourcePreferences: readSourcePreferences(data.sourcePreferences),
      researchMode: data.researchMode === "strict" ? "strict" : "simple",
      mikanifyAnswer: data.mikanifyAnswer === true,
      autoManageSearch: typeof data.autoManageSearch === "boolean" ? data.autoManageSearch : data.autoSearch === true,
      cacheHours: typeof data.cacheHours === "number" && Number.isFinite(data.cacheHours) ? Math.max(1, Math.min(720, data.cacheHours)) : DEFAULT_SETTINGS.cacheHours,
      // A deliberate "Ollama default" (null) must survive a restart.
      contextWindow: data.contextWindow === null && Object.prototype.hasOwnProperty.call(data,"contextWindow")
        ? null
        : [4096, 8192, 16384, 32768].includes(Number(data.contextWindow)) && data.contextWindow != null
          ? Number(data.contextWindow) : DEFAULT_SETTINGS.contextWindow,
      reasoningMode: data.reasoningMode === "fast" || data.reasoningMode === "deep"
        ? data.reasoningMode : DEFAULT_SETTINGS.reasoningMode,
      autoRememberUser: data.autoRememberUser !== false,
      autoRememberMikan: data.autoRememberMikan !== false,
      visionCaptureIntervalSeconds:captureInterval(data.visionCaptureIntervalSeconds),
      visionRegion:restoreRegion(data.visionRegion),
      model: typeof data.model === "string" ? data.model : DEFAULT_SETTINGS.model,
      systemPrompt: typeof data.systemPrompt === "string" && data.systemPrompt !== PRIOR_DEFAULT_SYSTEM_PROMPT &&
          data.systemPrompt !== PREVIOUS_GESTURE_DEFAULT_SYSTEM_PROMPT &&
          data.systemPrompt !== SHIPPED_0_9_63_DEFAULT_SYSTEM_PROMPT
        ? data.systemPrompt : DEFAULT_SETTINGS.systemPrompt,
      appearance: readAppearance(data.appearance),
      personality: readPersonality(data.personality),
      communication: readCommunicationPreferences(data.communication)
    };
  } catch {
    return { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_APPEARANCE }, voice: { ...DEFAULT_VOICE }, personality: { ...DEFAULT_PERSONALITY }, communication: { ...DEFAULT_COMMUNICATION } };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Shared with the animated wardrobe. Both callers must use DB v2:
    // opening the older version after a wardrobe upgrade throws VersionError.
    const request = indexedDB.open("mikan-local-media", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("assets")) {
        request.result.createObjectStore("assets");
      }
      if (!request.result.objectStoreNames.contains("iki-outfits")) {
        request.result.createObjectStore("iki-outfits", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePortrait(file: File): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("assets", "readwrite");
      transaction.objectStore("assets").put(file, "portrait");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function loadPortrait(): Promise<Blob | null> {
  const db = await openDatabase();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const transaction = db.transaction("assets", "readonly");
      const request = transaction.objectStore("assets").get("portrait");
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Remove only the custom portrait. Bundled defaults are left untouched. */
export async function deletePortrait(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("assets", "readwrite");
      transaction.objectStore("assets").delete("portrait");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
