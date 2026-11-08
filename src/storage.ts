import { DEFAULT_PERSONALITY, readPersonality, type Personality } from "./personality";

export type ChatRole = "user" | "assistant";
export type Message = { id: string; role: ChatRole; content: string };
export type Settings = { voice: VoiceSettings; endpoint: string; model: string; systemPrompt: string; appearance: Appearance; personality: Personality; searxngEndpoint: string; autoSearch: boolean; autoManageSearch: boolean; cacheHours: number; contextWindow: number | null; autoRememberUser: boolean; autoRememberMikan: boolean };

export type VoiceSettings = {
  endpoint: string;
  autoSpeak: boolean;
  prompt: string;
  speed: number;
};
export const DEFAULT_VOICE: VoiceSettings = {
  endpoint: "http://127.0.0.1:8765",
  autoSpeak: false,
  prompt: "A warm, expressive young adult anime-inspired woman's voice. Medium to slightly high pitch, gentle natural American English, softly playful and lightly teasing. Clear and relaxed, not shrill, squeaky, childlike or constantly overexcited.",
  speed: 1
};
function readVoice(value: unknown): VoiceSettings {
  const data = value && typeof value === "object" ? value as Partial<VoiceSettings> : {};
  return {
    endpoint: typeof data.endpoint === "string" ? data.endpoint : DEFAULT_VOICE.endpoint,
    autoSpeak: data.autoSpeak === true,
    prompt: typeof data.prompt === "string" && data.prompt.trim() ? data.prompt : DEFAULT_VOICE.prompt,
    speed: typeof data.speed === "number" && Number.isFinite(data.speed)
      ? Math.max(0.8, Math.min(1.2, data.speed)) : DEFAULT_VOICE.speed
  };
}

export type Appearance = {
  accent: string;
  panel: string;
  opacity: number;
  fontFamily: "Segoe UI" | "Arial" | "Verdana" | "Georgia";
  fontSize: number;
};
export const DEFAULT_APPEARANCE: Appearance = {
  accent: "#ffad7e",
  panel: "#211b25",
  opacity: 0.94,
  fontFamily: "Segoe UI",
  fontSize: 13
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
    fontSize: typeof v.fontSize === "number" && Number.isFinite(v.fontSize) ? Math.max(11, Math.min(20, Math.round(v.fontSize))) : DEFAULT_APPEARANCE.fontSize
  };
}

export const DEFAULT_SETTINGS: Settings = {
  endpoint: "http://127.0.0.1:11434",
  voice: { ...DEFAULT_VOICE },
  searxngEndpoint: "http://127.0.0.1:8888",
  autoSearch: false,
  autoManageSearch: false,
  cacheHours: 24,
  contextWindow: null,
  autoRememberUser: true,
  autoRememberMikan: true,
  appearance: { ...DEFAULT_APPEARANCE },
  personality: { ...DEFAULT_PERSONALITY },
  model: "qwen3.5:9b",
  systemPrompt: "You are Mikan, a witty, curious, warm and occasionally teasing desktop AI companion. Keep replies conversational and concise, leading with the actual answer. Show personality through wit and tone, not repetitive stage directions or obligatory questions. Be genuinely useful and admit when you are uncertain. Never claim to have seen the user's screen or accessed the web unless you actually have."
};

const SETTINGS_KEY = "mikan/settings/v1";

export function loadSettings(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>;
    return {
      endpoint: typeof data.endpoint === "string" ? data.endpoint : DEFAULT_SETTINGS.endpoint,
      voice: readVoice(data.voice),
      searxngEndpoint: typeof data.searxngEndpoint === "string" ? data.searxngEndpoint : DEFAULT_SETTINGS.searxngEndpoint,
      autoSearch: data.autoSearch === true,
      autoManageSearch: typeof data.autoManageSearch === "boolean" ? data.autoManageSearch : data.autoSearch === true,
      cacheHours: typeof data.cacheHours === "number" && Number.isFinite(data.cacheHours) ? Math.max(1, Math.min(720, data.cacheHours)) : DEFAULT_SETTINGS.cacheHours,
      contextWindow: [4096, 8192, 16384, 32768].includes(Number(data.contextWindow)) && data.contextWindow != null
        ? Number(data.contextWindow) : null,
      autoRememberUser: data.autoRememberUser !== false,
      autoRememberMikan: data.autoRememberMikan !== false,
      model: typeof data.model === "string" ? data.model : DEFAULT_SETTINGS.model,
      systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : DEFAULT_SETTINGS.systemPrompt,
      appearance: readAppearance(data.appearance),
      personality: readPersonality(data.personality)
    };
  } catch {
    return { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_APPEARANCE }, voice: { ...DEFAULT_VOICE }, personality: { ...DEFAULT_PERSONALITY } };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mikan-local-media", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("assets")) {
        request.result.createObjectStore("assets");
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
