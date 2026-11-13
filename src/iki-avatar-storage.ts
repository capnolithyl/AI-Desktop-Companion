/** Local-only Iki outfit library. Retains imported files, even when they are not selected. */
import { shippedOutfits, shippedOutfitById } from "./bundled-iki-outfits";
export type SavedIkiOutfit = {
  id: string;
  name: string;
  /** Local uploads have a Blob. Bundled rigs are lazy-loaded from their URL. */
  file: Blob | null;
  bundledUrl?: string;
  savedAt: number;
};
function shippedLibrary(): SavedIkiOutfit[] {
  return shippedOutfits.map(outfit => ({ ...outfit, file: null, savedAt: 0 }));
}
export type IkiWardrobe = { outfits: SavedIkiOutfit[]; active: SavedIkiOutfit | null };
export type AvatarDisplay = "animated" | "portrait";

const DISPLAY_KEY = "mikan/avatar-display/v1";
const FOLDER_KEY = "mikan/iki-outfit-folder/v1";
const DB_NAME = "mikan-local-media";
const LEGACY_RIG_KEY = "iki-rig";
const ACTIVE_KEY = "iki-active-outfit";
const OUTFITS_STORE = "iki-outfits";

export function loadAvatarDisplay(): AvatarDisplay {
  try { return localStorage.getItem(DISPLAY_KEY) === "portrait" ? "portrait" : "animated"; }
  catch { return "animated"; }
}

export function saveAvatarDisplay(display: AvatarDisplay): void {
  try { localStorage.setItem(DISPLAY_KEY, display); }
  catch { /* This session can still change modes. */ }
}

export function loadIkiOutfitFolder(): string {
  try { return localStorage.getItem(FOLDER_KEY) ?? ""; }
  catch { return ""; }
}

export function saveIkiOutfitFolder(path: string): void {
  try { localStorage.setItem(FOLDER_KEY, path); }
  catch { /* The picker can still work without a remembered folder. */ }
}

function openAssets(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Version 1 held a single custom rig in "assets". Version 2 adds a wardrobe
    // without deleting the earlier content or any other user-saved media.
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("assets")) {
        request.result.createObjectStore("assets");
      }
      if (!request.result.objectStoreNames.contains(OUTFITS_STORE)) {
        request.result.createObjectStore(OUTFITS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("The outfit library could not be saved."));
    tx.onabort = () => reject(tx.error ?? new Error("The outfit library was not updated."));
  });
}

function validOutfit(value: unknown): value is SavedIkiOutfit {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedIkiOutfit>;
  return typeof item.id === "string" && typeof item.name === "string"
    && item.file instanceof Blob && typeof item.savedAt === "number";
}

function outfitId(name: string): string {
  // Loading a newer iteration of the same outfit updates its cached copy
  // rather than adding multiple indistinguishable items to the selector.
  return "file:" + name.toLocaleLowerCase("en-US");
}

export async function loadIkiWardrobe(): Promise<IkiWardrobe> {
  const db = await openAssets();
  try {
    const existing = (await readRequest(db.transaction(OUTFITS_STORE, "readonly")
      .objectStore(OUTFITS_STORE).getAll() as IDBRequest<unknown[]>))
      .filter(validOutfit);
    const assets = db.transaction("assets", "readonly").objectStore("assets");
    const activeId = await readRequest(assets.get(ACTIVE_KEY) as IDBRequest<unknown>);

    // Import the owner's previously selected .iki file once, automatically.
    // Switching back to the bundled rig no longer erases that imported file.
    if (!existing.length) {
      const legacy = await readRequest(db.transaction("assets", "readonly")
        .objectStore("assets").get(LEGACY_RIG_KEY) as IDBRequest<unknown>);
      if (legacy && typeof legacy === "object") {
        const value = legacy as { name?: unknown; file?: unknown };
        if (typeof value.name === "string" && value.file instanceof Blob) {
          const migrated: SavedIkiOutfit = {
            id: outfitId(value.name), name: value.name, file: value.file, savedAt: Date.now()
          };
          const tx = db.transaction([OUTFITS_STORE, "assets"], "readwrite");
          const done = waitForTransaction(tx);
          tx.objectStore(OUTFITS_STORE).put(migrated);
          tx.objectStore("assets").put(migrated.id, ACTIVE_KEY);
          tx.objectStore("assets").delete(LEGACY_RIG_KEY);
          await done;
          return { outfits: [...shippedLibrary(), migrated], active: migrated };
        }
      }
    }

    // Bundled catalog entries need no IndexedDB copy and ship with the installer.
    // Local imports (including old copies of shipped costumes) stay untouched.
    const outfits = [...shippedLibrary(), ...existing].sort((a, b) => a.name.localeCompare(b.name));
    return {
      outfits,
      active: outfits.find(item => item.id === activeId) ?? null
    };
  } finally { db.close(); }
}

export async function saveIkiOutfit(file: File): Promise<SavedIkiOutfit> {
  const next: SavedIkiOutfit = {
    id: outfitId(file.name), name: file.name,
    file: file.slice(0, file.size, "application/json"),
    savedAt: Date.now()
  };
  const db = await openAssets();
  try {
    const tx = db.transaction([OUTFITS_STORE, "assets"], "readwrite");
    const done = waitForTransaction(tx);
    tx.objectStore(OUTFITS_STORE).put(next);
    tx.objectStore("assets").put(next.id, ACTIVE_KEY);
    await done;
    return next;
  } finally { db.close(); }
}

export async function selectIkiOutfit(id: string | null): Promise<void> {
  const db = await openAssets();
  try {
    if (id !== null && !shippedOutfitById(id)) {
      const value = await readRequest(db.transaction(OUTFITS_STORE, "readonly")
        .objectStore(OUTFITS_STORE).get(id) as IDBRequest<unknown>);
      if (!validOutfit(value)) throw new Error("This outfit is no longer saved.");
    }
    const tx = db.transaction("assets", "readwrite");
    const done = waitForTransaction(tx);
    if (id === null) tx.objectStore("assets").delete(ACTIVE_KEY);
    else tx.objectStore("assets").put(id, ACTIVE_KEY);
    await done;
  } finally { db.close(); }
}

export async function removeIkiOutfit(id: string): Promise<void> {
  if (shippedOutfitById(id)) throw new Error("Included outfits are part of Mikan's installation and cannot be removed here.");
  const db = await openAssets();
  try {
    const selected = await readRequest(db.transaction("assets", "readonly")
      .objectStore("assets").get(ACTIVE_KEY) as IDBRequest<unknown>);
    const tx = db.transaction([OUTFITS_STORE, "assets"], "readwrite");
    const done = waitForTransaction(tx);
    tx.objectStore(OUTFITS_STORE).delete(id);
    if (selected === id) tx.objectStore("assets").delete(ACTIVE_KEY);
    await done;
  } finally { db.close(); }
}
