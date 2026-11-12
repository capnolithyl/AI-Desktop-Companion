/** The default v3 rig is bundled. Only user-selected replacements are saved. */
export type SavedIkiRig = { name: string; file: Blob };
export type AvatarDisplay = "animated" | "portrait";

const DISPLAY_KEY = "mikan/avatar-display/v1";
const DB_NAME = "mikan-local-media";
const RIG_KEY = "iki-rig";

export function loadAvatarDisplay(): AvatarDisplay {
  try {
    return localStorage.getItem(DISPLAY_KEY) === "portrait" ? "portrait" : "animated";
  } catch {
    return "animated";
  }
}

export function saveAvatarDisplay(display: AvatarDisplay): void {
  try { localStorage.setItem(DISPLAY_KEY, display); }
  catch { /* Storage disabled: the current session still switches modes. */ }
}

function openAssets(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("assets")) {
        request.result.createObjectStore("assets");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadIkiRig(): Promise<SavedIkiRig | null> {
  const db = await openAssets();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("assets", "readonly").objectStore("assets").get(RIG_KEY);
      request.onsuccess = () => {
        const result: unknown = request.result;
        if (!result || typeof result !== "object") return resolve(null);
        const value = result as Partial<SavedIkiRig>;
        resolve(typeof value.name === "string" && value.file instanceof Blob
          ? { name: value.name, file: value.file } : null);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveIkiRig(file: File): Promise<void> {
  const db = await openAssets();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("assets", "readwrite");
      transaction.objectStore("assets").put({ name: file.name, file }, RIG_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteIkiRig(): Promise<void> {
  const db = await openAssets();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("assets", "readwrite");
      transaction.objectStore("assets").delete(RIG_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
