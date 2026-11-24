/** Settings runs in its own Tauri webview; the compact avatar never resizes. */
export const SETTINGS_WINDOW_LABEL = "settings";
export const SETTINGS_TABS = [
  "ai", "internet", "notion", "voice", "appearance", "interface",
  "personality", "memory", "capabilities", "brain", "home", "vision"
] as const;
export type SettingsTab = typeof SETTINGS_TABS[number];
export type MemoryTab = "facts" | "chats" | "character" | "collections";

export function validSettingsTab(value: string | null): SettingsTab {
  return SETTINGS_TABS.find(tab => tab === value) ?? "home";
}
export function validMemoryTab(value: string | null): MemoryTab {
  return value === "chats" || value === "character" || value === "collections" ? value : "facts";
}
export function isStandaloneSettingsWindow(search = typeof window === "undefined" ? "" : window.location.search): boolean {
  return new URLSearchParams(search).get("settings") === "1";
}
export function initialSettingsTab(search = typeof window === "undefined" ? "" : window.location.search): SettingsTab {
  return validSettingsTab(new URLSearchParams(search).get("tab"));
}
export function initialMemoryTab(search = typeof window === "undefined" ? "" : window.location.search): MemoryTab {
  return validMemoryTab(new URLSearchParams(search).get("memoryTab"));
}
