/* Phone-to-Kotlin transport. A future Tauri mobile adapter implements the same API. */
export type NativeStatus = { status: "READY" | "DOWNLOADABLE" | "DOWNLOADING" | "UNAVAILABLE" };

type NativeResponse = {
  id: string;
  kind: "delta" | "result" | "error";
  text?: string;
  status?: NativeStatus["status"];
  error?: string;
};
type NativeClient = { postMessage(json: string): void };
declare global {
  interface Window {
    MikanNative?: NativeClient;
    __mikanReceive?: (json: string) => void;
    __mikanBackgroundInterrupted?: () => void;
  }
}

let sequence = 0;
const pending = new Map<string, {
  resolve: (value: NativeResponse) => void;
  reject: (error: Error) => void;
  onDelta?: (delta: string) => void;
  method: string;
}>();

window.__mikanReceive = (payload: string) => {
  let response: NativeResponse;
  try { response = JSON.parse(payload) as NativeResponse; }
  catch { return; }
  const target = pending.get(response.id);
  if (!target) return;
  if (response.kind === "delta") {
    target.onDelta?.(response.text ?? "");
    return;
  }
  pending.delete(response.id);
  if (response.kind === "error") target.reject(new Error(response.error ?? "Local model failed"));
  else target.resolve(response);
};

// Native AICore may cancel while the WebView is paused. If its error event
// cannot be delivered during the pause, onResume rejects stale generate calls.
window.__mikanBackgroundInterrupted = () => {
  for (const [id, request] of pending) {
    if (request.method === "generate" || request.method === "generateResearch") {
      pending.delete(id);
      request.reject(new Error("App moved to background. Tap Retry to regenerate."));
    }
  }
};

function send(method: string, args: Record<string, unknown> = {}, onDelta?: (chunk: string) => void): Promise<NativeResponse> {
  if (!window.MikanNative) {
    return Promise.reject(new Error("Pocket Mikan native backend is unavailable. Install the Android APK."));
  }
  const id = "mobile-" + (++sequence);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onDelta, method });
    try { // Transport request ID must never be overwritten by a database record ID.
      window.MikanNative!.postMessage(JSON.stringify({ ...args, id, method })); }
    catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export const mobileBackend = {
  status: async (): Promise<NativeStatus["status"]> => (await send("status")).status ?? "UNAVAILABLE",
  portrait: async (): Promise<string> => (await send("portrait")).text ?? "",
  importLegacy: async (): Promise<string> => (await send("importLegacy")).text ?? "[]",
  memory: async <T>(action: string, args: Record<string, unknown> = {}): Promise<T> => {
    const response = await send("memory", { action, ...args });
    if (!response.text) throw new Error("Android SQLite returned an empty response");
    return JSON.parse(response.text) as T;
  },
  extractMemory: async (args: Record<string, unknown>): Promise<{ userSaved: number; characterSaved: number; skipped: boolean }> => {
    const response = await send("extractMemory", args);
    return JSON.parse(response.text ?? "{}") as { userSaved: number; characterSaved: number; skipped: boolean };
  },
  webStatus: async (): Promise<{ configured: boolean; provider: string }> =>
    JSON.parse((await send("webKeyStatus")).text ?? "{}"),
  saveWebKey: async (apiKey: string): Promise<{ configured: boolean; provider: string }> =>
    JSON.parse((await send("webSaveKey", { apiKey })).text ?? "{}"),
  clearWebKey: async (): Promise<{ configured: boolean; provider: string }> =>
    JSON.parse((await send("webClearKey")).text ?? "{}"),
  searchWeb: async (query: string, recent = false): Promise<{ results: import("../web-search").WebResult[] }> =>
    JSON.parse((await send("webSearch", { query, recent })).text ?? '{"results":[]}'),
  readWeb: async (url: string): Promise<import("../web-search").PageDocument> =>
    JSON.parse((await send("webRead", { url })).text ?? "{}"),
  openLink: async (url: string): Promise<void> => {
    await send("openLink", { url });
  },
  download: async (): Promise<NativeStatus["status"]> => (await send("download")).status ?? "UNAVAILABLE",
  generate: async (prompt: string, onDelta: (chunk: string) => void): Promise<string> =>
    (await send("generate", { prompt }, onDelta)).text ?? "",
  generateResearch: async (prompt: string, onDelta: (chunk: string) => void): Promise<string> =>
    (await send("generateResearch", { prompt }, onDelta)).text ?? "",
  cancel: (): void => { void send("cancel").catch(() => {}); }
};
