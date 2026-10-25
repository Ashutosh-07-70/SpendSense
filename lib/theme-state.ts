export type Theme = "light" | "dark" | "spider-man";
export const THEME_STORAGE_KEY = "spendsense.theme.v1";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "spider-man";
}

export function readThemePreference(storage: Pick<Storage, "getItem">, fallback: Theme = "light"): Theme {
  try {
    const saved = storage.getItem(THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : fallback;
  } catch { return fallback; }
}

export function persistThemePreference(storage: Pick<Storage, "setItem">, theme: Theme) {
  storage.setItem(THEME_STORAGE_KEY, theme);
}

export function nextTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : theme === "dark" ? "spider-man" : "light";
}
