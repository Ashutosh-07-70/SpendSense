"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/components/theme-provider";

export type ThemeSwitcherProps = {
  className?: string;
  variant?: "full" | "compact" | "auto";
  showSubtitle?: boolean;
};

const THEMES: { id: Theme; label: string; subtitle: string }[] = [
  { id: "dark", label: "Dark", subtitle: "Obsidian" },
  { id: "light", label: "Light", subtitle: "Clean" },
  { id: "spider-man", label: "Spider-Man", subtitle: "Midnight" },
];

type BubbleParticle = {
  id: number;
  x: number;
  y: number;
  size: number;
  dx: number;
  dy: number;
  delay: number;
  duration: number;
  scale: number;
  accent: string;
};

type BubbleWash = {
  id: number;
  x: number;
  y: number;
  accent: string;
};

type MenuCoords = { top: number; left: number; width: number; openUp: boolean };

function themeAccent(theme: Theme) {
  if (theme === "spider-man") return "#00f0ff";
  if (theme === "light") return "#789b36";
  return "#b8e86a";
}

export default function ThemeSwitcher({
  className = "",
  variant = "auto",
  showSubtitle = true,
}: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const labelId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [bubbles, setBubbles] = useState<BubbleParticle[]>([]);
  const [wash, setWash] = useState<BubbleWash | null>(null);
  const bubbleId = useRef(0);

  const current = useMemo(
    () => THEMES.find((item) => item.id === theme) ?? THEMES[0],
    [theme],
  );

  useEffect(() => setMounted(true), []);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(236, Math.max(rect.width, 188), window.innerWidth - 24);
    const estimatedHeight = 168;
    const gap = 8;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    let left = rect.right - width;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    const top = openUp ? rect.top - gap : rect.bottom + gap;
    setMenuCoords({ top, left, width, openUp });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const selected = THEMES.findIndex((item) => item.id === theme);
    setActiveIndex(selected >= 0 ? selected : 0);
  }, [open, theme]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      const menu = document.getElementById(listboxId);
      if (menu?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, listboxId]);

  const spawnBubbles = useCallback((origin: HTMLElement, next: Theme) => {
    if (reduceMotion) return;
    const rect = origin.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const accent = themeAccent(next);
    const nextBubbles: BubbleParticle[] = Array.from({ length: 14 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 48 + Math.random() * 160;
      return {
        id: ++bubbleId.current,
        x: cx,
        y: cy,
        size: 6 + Math.random() * 18,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance - 20,
        delay: Math.random() * 0.08,
        duration: 0.55 + Math.random() * 0.45,
        scale: 1.15 + Math.random() * 0.45,
        accent,
      };
    });
    setBubbles((prev) => [...prev, ...nextBubbles]);
    setWash({ id: ++bubbleId.current, x: cx, y: cy, accent });
  }, [reduceMotion]);

  const selectTheme = useCallback((next: Theme, origin?: HTMLElement) => {
    const source = origin ?? triggerRef.current;
    if (!source) {
      setTheme(next);
      setOpen(false);
      return;
    }
    if (next !== theme) spawnBubbles(source, next);
    setTheme(next, source);
    setOpen(false);
    triggerRef.current?.focus();
  }, [setTheme, spawnBubbles, theme]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = (index + 1) % THEMES.length;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = (index - 1 + THEMES.length) % THEMES.length;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = THEMES.length - 1;
    } else if (event.key === "Tab") {
      setOpen(false);
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    } else {
      return;
    }
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[activeIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- focus only on open

  const overlays = mounted
    ? createPortal(
        <>
          <AnimatePresence>
            {open && menuCoords && (
              <motion.div
                key="theme-menu"
                id={listboxId}
                role="listbox"
                aria-labelledby={labelId}
                className="theme-switcher-menu"
                style={{
                  position: "fixed",
                  top: menuCoords.openUp ? undefined : menuCoords.top,
                  bottom: menuCoords.openUp
                    ? Math.max(12, window.innerHeight - menuCoords.top)
                    : undefined,
                  left: menuCoords.left,
                  width: menuCoords.width,
                  transformOrigin: menuCoords.openUp ? "bottom right" : "top right",
                }}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: menuCoords.openUp ? 6 : -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.94, y: menuCoords.openUp ? 4 : -4 }}
                transition={{ duration: 0.18, ease: [0.22, 0.8, 0.24, 1] }}
              >
                {THEMES.map((item, index) => {
                  const selected = item.id === theme;
                  return (
                    <button
                      key={item.id}
                      ref={(el) => { optionRefs.current[index] = el; }}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      tabIndex={activeIndex === index ? 0 : -1}
                      className={`theme-switcher-option ${selected ? "is-selected" : ""}`}
                      onClick={(event) => selectTheme(item.id, event.currentTarget)}
                      onKeyDown={(event) => onOptionKeyDown(event, index)}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <span className="theme-switcher-option-icon" aria-hidden="true">
                        <ThemeGlyph id={item.id} size={17} />
                      </span>
                      <span className="theme-option-copy">
                        <strong>{item.label}</strong>
                        {showSubtitle && <small>{item.subtitle}</small>}
                      </span>
                      {selected && (
                        <span className="theme-switcher-check" aria-hidden="true">
                          <Check size={14} strokeWidth={2.4} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="theme-bubble-layer" aria-hidden="true">
            <AnimatePresence>
              {wash && (
                <motion.span
                  key={`wash-${wash.id}`}
                  className="theme-bubble-wash"
                  style={{
                    left: wash.x,
                    top: wash.y,
                    ["--bubble-accent" as string]: wash.accent,
                  }}
                  initial={{ opacity: 0.38, scale: 0 }}
                  animate={{ opacity: 0, scale: 28 }}
                  transition={{ duration: 0.72, ease: [0.2, 0.78, 0.24, 1] }}
                  onAnimationComplete={() => setWash((prev) => (prev?.id === wash.id ? null : prev))}
                />
              )}
              {bubbles.map((bubble) => (
                <motion.span
                  key={bubble.id}
                  className="theme-bubble"
                  style={{
                    left: bubble.x,
                    top: bubble.y,
                    width: bubble.size,
                    height: bubble.size,
                    ["--bubble-accent" as string]: bubble.accent,
                  }}
                  initial={{ opacity: 0.9, scale: 0.35, x: 0, y: 0 }}
                  animate={{
                    opacity: 0,
                    scale: bubble.scale,
                    x: bubble.dx,
                    y: bubble.dy,
                  }}
                  transition={{
                    duration: bubble.duration,
                    delay: bubble.delay,
                    ease: [0.16, 0.84, 0.24, 1],
                  }}
                  onAnimationComplete={() => {
                    setBubbles((prev) => prev.filter((item) => item.id !== bubble.id));
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        </>,
        document.body,
      )
    : null;

  return (
    <div
      ref={rootRef}
      className={`theme-switcher theme-variant-${variant} ${open ? "is-open" : ""} ${className}`.trim()}
    >
      <span id={labelId} className="sr-only">Appearance theme</span>
      <button
        ref={triggerRef}
        type="button"
        className="theme-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={labelId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="theme-switcher-trigger-icon" aria-hidden="true">
          <ThemeGlyph id={current.id} size={16} />
        </span>
        <span className="theme-switcher-trigger-label">{current.label}</span>
        <motion.span
          className="theme-switcher-chevron"
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 0.8, 0.24, 1] }}
        >
          <ChevronDown size={14} strokeWidth={2.4} />
        </motion.span>
      </button>
      {overlays}
    </div>
  );
}

function ThemeGlyph({ id, size }: { id: Theme; size: number }) {
  if (id === "spider-man") return <SpiderMaskIcon size={size} />;
  if (id === "light") return <Sun size={size} strokeWidth={2.2} />;
  return <Moon size={size} strokeWidth={2.2} />;
}

export function SpiderMaskIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`spider-glyph ${className}`.trim()}
      aria-hidden="true"
      style={{ width: `${size}px`, height: `${size}px`, flexShrink: 0 }}
    >
      <path
        d="M12 2.2C6.9 2.2 3.3 5.7 3.3 10.5C3.3 16 7.8 20.6 12 22.8C16.2 20.6 20.7 16 20.7 10.5C20.7 5.7 17.1 2.2 12 2.2Z"
        fill="currentColor"
      />
      <path
        d="M12 2.2V22.8M3.6 8.5C6.3 9.6 9 10.1 12 10.1C15 10.1 17.7 9.6 20.4 8.5M4.3 14C6.6 15.2 9.2 15.8 12 15.8C14.8 15.8 17.4 15.2 19.7 14M6.7 4.5L12 10.1L17.3 4.5M6 18L12 15.8L18 18"
        stroke="var(--theme-spider-web, rgba(255, 255, 255, 0.55))"
        strokeWidth="0.85"
        strokeLinecap="round"
      />
      <path
        d="M6 10.5C7.1 10.5 9.3 11.5 10.7 13.7C9 14.9 7 15.3 5.4 13.9C5.1 12.6 5.3 11 6 10.5ZM18 10.5C16.9 10.5 14.7 11.5 13.3 13.7C15 14.9 17 15.3 18.6 13.9C18.9 12.6 18.7 11 18 10.5Z"
        fill="#070c17"
        stroke="var(--theme-spider-web, #ffffff)"
        strokeWidth="0.75"
      />
      <path
        d="M6.5 11C7.3 11 9 11.8 10.1 13.4C8.7 14.3 7.1 14.6 5.8 13.5C5.6 12.5 5.9 11.3 6.5 11ZM17.5 11C16.7 11 15 11.8 13.9 13.4C15.3 14.3 16.9 14.6 18.2 13.5C18.4 12.5 18.1 11.3 17.5 11Z"
        fill="#ffffff"
      />
    </svg>
  );
}
