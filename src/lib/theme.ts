export const THEME_STORAGE_KEY = "auditops-theme";
export const THEMES = ["white", "black", "emerald"] as const;
export type Theme = (typeof THEMES)[number];

export function resolveTheme(value: unknown): Theme {
  return THEMES.find((theme) => theme === value) ?? "white";
}

export function readTheme(): Theme {
  try {
    return resolveTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "white";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset["theme"] = theme;
  document.documentElement.classList.toggle("dark", theme !== "white");
}

export function saveTheme(theme: Theme) {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selection still works when browser storage is unavailable.
  }
}