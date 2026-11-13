/** Locally configured wardrobe metadata and lightweight daily outfit scheduling. */
import wardrobeManifest from "../assets/iki/mikan-v02/outfits/wardrobe.json" with { type: "json" };
export type OutfitSeason = "all" | "spring" | "summer" | "autumn" | "winter";
export type OutfitHoliday = "none" | "halloween" | "christmas" | "easter";
export type OutfitMetadata = { season: OutfitSeason; holiday: OutfitHoliday; favorite: boolean };
export type WardrobeConfig = {
  auto: boolean;
  holidays: boolean;
  pinned: boolean;
  lastDay: string | null;
  lastId: string | null;
  outfits: Record<string, OutfitMetadata>;
};
export type WardrobeChoice = { id: string | null; name: string };
export const BUNDLED_OUTFIT_ID = "bundled";
const STORAGE_KEY = "mikan/wardrobe-config/v1";
const SEASONS: OutfitSeason[] = ["all", "spring", "summer", "autumn", "winter"];
const HOLIDAYS: OutfitHoliday[] = ["none", "halloween", "christmas", "easter"];

export const DEFAULT_WARDROBE_CONFIG: WardrobeConfig = {
  auto: false, holidays: true, pinned: false, lastDay: null, lastId: null, outfits: {}
};

export function wardrobeKey(id: string | null): string {
  return id ?? BUNDLED_OUTFIT_ID;
}

/** Resolve checked-in metadata for bundled and imported files, falling back gracefully for local-only outfits. */
export function outfitDefaults(name: string): OutfitMetadata {
  const lower = name.toLowerCase();
  const registered = wardrobeManifest.outfits.find(entry =>
    entry.name.toLowerCase() === lower ||
    entry.file.split("/").at(-1)?.toLowerCase() === lower ||
    ("default" in entry && entry.default === true && lower.includes("(bundled)"))
  );
  if (registered) return {
    season: registered.season as OutfitSeason,
    holiday: registered.holiday as OutfitHoliday,
    favorite: registered.favorite === true
  };
  if (/christmas|xmas|santa|yule/.test(lower)) return { season: "winter", holiday: "christmas", favorite: false };
  if (/halloween|witch|vampire|zombie/.test(lower)) return { season: "autumn", holiday: "halloween", favorite: false };
  if (/easter|bunny/.test(lower)) return { season: "spring", holiday: "easter", favorite: false };
  if (/summer|swim|beach/.test(lower)) return { season: "summer", holiday: "none", favorite: false };
  if (/gothic|goth/.test(lower)) return { season: "autumn", holiday: "none", favorite: false };
  if (/sweater|coat|hoodie/.test(lower)) return { season: "winter", holiday: "none", favorite: false };
  return { season: "all", holiday: "none", favorite: false };
}

export function outfitMetadata(config: WardrobeConfig, outfit: WardrobeChoice): OutfitMetadata {
  return config.outfits[wardrobeKey(outfit.id)] ?? outfitDefaults(outfit.name);
}

export function localWardrobeDay(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")].join("-");
}

export function currentSeason(date: Date): Exclude<OutfitSeason, "all"> {
  const month = date.getMonth();
  return month === 11 || month <= 1 ? "winter"
    : month <= 4 ? "spring" : month <= 7 ? "summer" : "autumn";
}

/** Gregorian computus: Easter Sunday, based on the PC's local calendar date. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k + 70) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return { month, day: ((h + l - 7 * m + 114) % 31) + 1 };
}

export function wardrobeHoliday(date: Date): OutfitHoliday {
  const month = date.getMonth() + 1, day = date.getDate();
  if (month === 10 && day === 31) return "halloween";
  if (month === 12 && day >= 24 && day <= 26) return "christmas";
  const easter = easterSunday(date.getFullYear());
  return month === easter.month && day === easter.day ? "easter" : "none";
}

/** No model inference, remote calls, background service, or rig mutation needed. */
export function pickDailyOutfit(
  choices: readonly WardrobeChoice[],
  config: WardrobeConfig,
  date: Date,
  random: () => number = Math.random
): WardrobeChoice | null {
  if (!choices.length) return null;
  const holiday = config.holidays ? wardrobeHoliday(date) : "none";
  const themed = holiday === "none" ? [] : choices.filter(choice => outfitMetadata(config, choice).holiday === holiday);
  let pool = themed.length ? themed
    : choices.filter(choice => outfitMetadata(config, choice).holiday === "none");
  if (!pool.length) pool = [...choices];
  const season = currentSeason(date);
  const seasonal = pool.filter(choice => {
    const tag = outfitMetadata(config, choice).season;
    return tag === "all" || tag === season;
  });
  if (!themed.length && seasonal.length) pool = seasonal;
  if (pool.length > 1 && config.lastId !== null) {
    const fresh = pool.filter(choice => wardrobeKey(choice.id) !== config.lastId);
    if (fresh.length) pool = fresh;
  }
  const weights = pool.map(choice => {
    const metadata = outfitMetadata(config, choice);
    return 1 + (metadata.season === season ? 4 : metadata.season === "all" ? 2 : 0)
      + (metadata.favorite ? 5 : 0);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let position = Math.max(0, Math.min(0.999999, random())) * total;
  for (let index = 0; index < pool.length; index++) {
    position -= weights[index];
    if (position < 0) return pool[index];
  }
  return pool[pool.length - 1];
}

export function loadWardrobeConfig(): WardrobeConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<WardrobeConfig>;
    const outfits: Record<string, OutfitMetadata> = {};
    if (raw.outfits && typeof raw.outfits === "object" && !Array.isArray(raw.outfits)) {
      for (const [key, value] of Object.entries(raw.outfits)) {
        if (!value || typeof value !== "object") continue;
        const item = value as Partial<OutfitMetadata>;
        outfits[key] = {
          season: SEASONS.includes(item.season as OutfitSeason) ? item.season as OutfitSeason : "all",
          holiday: HOLIDAYS.includes(item.holiday as OutfitHoliday) ? item.holiday as OutfitHoliday : "none",
          favorite: item.favorite === true
        };
      }
    }
    return {
      auto: raw.auto === true,
      holidays: raw.holidays !== false,
      pinned: raw.pinned === true,
      lastDay: typeof raw.lastDay === "string" ? raw.lastDay : null,
      lastId: typeof raw.lastId === "string" ? raw.lastId : null,
      outfits
    };
  } catch { return { ...DEFAULT_WARDROBE_CONFIG, outfits: {} }; }
}

export function saveWardrobeConfig(config: WardrobeConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }
  catch { /* Session-only fallback when local storage is unavailable. */ }
}
