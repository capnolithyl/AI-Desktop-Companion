export type ChatRole = "user" | "assistant";
export type Message = { id: string; role: ChatRole; content: string };
export type Settings = { endpoint: string; model: string; systemPrompt: string };

export const DEFAULT_SETTINGS: Settings = {
  endpoint: "http://127.0.0.1:11434",
  model: "qwen3.5:9b",
  systemPrompt: "You are Mikan, a witty, curious, warm and occasionally teasing desktop AI companion. Keep replies conversational and reasonably concise. Be genuinely useful and admit when you are uncertain. Never claim to have seen the user's screen or accessed the web unless you actually have."
};

const SETTINGS_KEY = "mikan/settings/v1";

export function loadSettings(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>;
    return {
      endpoint: typeof data.endpoint === "string" ? data.endpoint : DEFAULT_SETTINGS.endpoint,
      model: typeof data.model === "string" ? data.model : DEFAULT_SETTINGS.model,
      systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : DEFAULT_SETTINGS.systemPrompt
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
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
