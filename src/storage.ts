import { DEFAULT_PERSONALITY, readPersonality, type Personality } from "./personality";

export type ChatRole = "user" | "assistant";
export type Message = { id: string; role: ChatRole; content: string };
export type Settings = { endpoint: string; model: string; systemPrompt: string; appearance: Appearance; personality: Personality; searxngEndpoint: string; autoSearch: boolean; autoManageSearch: boolean; cacheHours: number; contextWindow: number | null; autoRememberUser: boolean; autoRememberMikan: boolean };

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
  systemPrompt: "You are Mikan, a witty, curious, warm and occasionally teasing desktop AI companion. Keep replies conversational and reasonably concise. Be genuinely useful and admit when you are uncertain. Never claim to have seen the user's screen or accessed the web unless you actually have."
};

const SETTINGS_KEY = "mikan/settings/v1";

export function loadSettings(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>;
    return {
      endpoint: typeof data.endpoint === "string" ? data.endpoint : DEFAULT_SETTINGS.endpoint,
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
    return { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_APPEARANCE }, personality: { ...DEFAULT_PERSONALITY } };
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
