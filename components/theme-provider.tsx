"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { nextTheme, persistThemePreference, readThemePreference, type Theme } from "@/lib/theme-state";

export type { Theme } from "@/lib/theme-state";
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme, origin?: HTMLElement) => void; toggleTheme: (origin?: HTMLElement) => void };
const CHANGE_EVENT = "spendsense:theme-change";
const ThemeContext = createContext<ThemeContextValue | null>(null);
let memoryTheme: Theme = "light";

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getThemeSnapshot(): Theme {
  try { return readThemePreference(window.localStorage, memoryTheme); }
  catch { return memoryTheme; }
}

function getServerThemeSnapshot(): Theme { return "light"; }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getServerThemeSnapshot);
  const transitionLocked = useRef(false);
  useEffect(() => { documentTheme(theme); }, [theme]);
  const setTheme = useCallback((next: Theme, origin?: HTMLElement) => {
    if (transitionLocked.current) return;
    if (next === getThemeSnapshot()) return;
    const applyTheme = () => {
      memoryTheme = next;
      documentTheme(next);
      try {
        persistThemePreference(window.localStorage, next);
      } catch { /* Theme remains available for this page session. */ }
      flushSync(() => window.dispatchEvent(new Event(CHANGE_EVENT)));
    };
    const root = document.documentElement;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) { applyTheme(); return; }

    const box = origin?.getBoundingClientRect();
    const x = box ? box.left + box.width / 2 : window.innerWidth / 2;
    const y = box ? box.top + box.height / 2 : window.innerHeight / 2;
    const radius = Math.ceil(Math.max(
      Math.hypot(x, y),
      Math.hypot(window.innerWidth - x, y),
      Math.hypot(x, window.innerHeight - y),
      Math.hypot(window.innerWidth - x, window.innerHeight - y),
    ));
    root.style.setProperty("--theme-reveal-x", `${x}px`);
    root.style.setProperty("--theme-reveal-y", `${y}px`);
    root.style.setProperty("--theme-reveal-radius", `${radius}px`);

    type ViewTransitionDocument = Document & { startViewTransition?: (callback: () => void) => { finished: Promise<void> } };
    const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
    if (!startViewTransition) {
      transitionLocked.current = true;
      root.classList.add("theme-fallback-transition");
      applyTheme();
      window.setTimeout(() => {
        root.classList.remove("theme-fallback-transition");
        root.style.removeProperty("--theme-reveal-x");
        root.style.removeProperty("--theme-reveal-y");
        root.style.removeProperty("--theme-reveal-radius");
        transitionLocked.current = false;
      }, 520);
      return;
    }

    transitionLocked.current = true;
    let unlocked = false;
    let fallbackTimer = 0;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      window.clearTimeout(fallbackTimer);
      root.style.removeProperty("--theme-reveal-x");
      root.style.removeProperty("--theme-reveal-y");
      root.style.removeProperty("--theme-reveal-radius");
      transitionLocked.current = false;
    };
    try {
      const transition = startViewTransition.call(document, applyTheme);
      void transition.finished.then(unlock, unlock);
      fallbackTimer = window.setTimeout(unlock, 1200);
    } catch {
      unlock();
      applyTheme();
    }
  }, []);
  const toggleTheme = useCallback((origin?: HTMLElement) => {
    const current = getThemeSnapshot();
    setTheme(nextTheme(current), origin);
  }, [setTheme]);
  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function documentTheme(theme: Theme) {
  if (typeof document !== "undefined" && document.documentElement.dataset.theme !== theme) {
    document.documentElement.dataset.theme = theme;
  }
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
