export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "osionos:theme-mode";

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "system") {
    const prefersDark = globalThis.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    root.dataset.theme = prefersDark ? "dark" : "light";
    return;
  }
  root.dataset.theme = mode;
}

export function readStoredThemeMode(): ThemeMode {
  if (globalThis.window === undefined) return "system";
  const stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function persistThemeMode(mode: ThemeMode) {
  if (globalThis.window === undefined) return;
  globalThis.localStorage.setItem(THEME_STORAGE_KEY, mode);
}

