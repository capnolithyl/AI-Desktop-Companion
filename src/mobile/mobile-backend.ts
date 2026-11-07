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
  }
}

let sequence = 0;
const pending = new Map<string, {
  resolve: (value: NativeResponse) => void;
  reject: (error: Error) => void;
  onDelta?: (delta: string) => void;
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

function send(method: string, args: Record<string, unknown> = {}, onDelta?: (chunk: string) => void): Promise<NativeResponse> {
  if (!window.MikanNative) {
    return Promise.reject(new Error("Pocket Mikan native backend is unavailable. Install the Android APK."));
  }
  const id = "mobile-" + (++sequence);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onDelta });
    try { window.MikanNative!.postMessage(JSON.stringify({ id, method, ...args })); }
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
  download: async (): Promise<NativeStatus["status"]> => (await send("download")).status ?? "UNAVAILABLE",
  generate: async (prompt: string, onDelta: (chunk: string) => void): Promise<string> =>
    (await send("generate", { prompt }, onDelta)).text ?? "",
  cancel: (): void => { void send("cancel").catch(() => {}); }
};
