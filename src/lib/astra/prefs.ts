import { useSyncExternalStore } from "react";

export type Prefs = {
  layout: "classic" | "launcher";
  accent: "star" | "rose" | "ember" | "mint" | "sky" | "violet";
  density: "compact" | "comfortable";
  fontScale: number;
  radius: number;
  background: "plain" | "dots" | "grid" | "glow";
  reduceMotion: boolean;
  glowTitle: boolean;
  tagline: string;
  homeName: string;
  showClock: boolean;
  openLinksInNewTab: boolean;
  searchEngine: "astra" | "duckduckgo" | "google" | "bing";
  proxyEnabled: boolean;
  proxyGames: boolean;
  wisp: string;
  transport: "astra" | "epoxy" | "libcurl";
  identity: "mirror" | "disguise";
  userAgent: string;
  tabCloak: boolean;
  cloakTitle: string;
  panicKey: string;
  panicUrl: string;
};

export const DEFAULT_PREFS: Prefs = {
  layout: "classic",
  accent: "star",
  density: "comfortable",
  fontScale: 100,
  radius: 0.3,
  background: "dots",
  reduceMotion: false,
  glowTitle: true,
  tagline: "everything in one place",
  homeName: "astra",
  showClock: true,
  openLinksInNewTab: false,
  searchEngine: "astra",
  proxyEnabled: false,
  proxyGames: false,
  wisp: "",
  transport: "astra",
  identity: "mirror",
  userAgent: "default",
  tabCloak: false,
  cloakTitle: "Google Docs",
  panicKey: "`",
  panicUrl: "https://classroom.google.com",
};

export const ACCENTS: Record<Prefs["accent"], string> = {
  star: "",
  rose: "oklch(0.7 0.17 10)",
  ember: "oklch(0.74 0.16 55)",
  mint: "oklch(0.78 0.14 160)",
  sky: "oklch(0.74 0.13 235)",
  violet: "oklch(0.68 0.17 295)",
};

const KEY = "astra-prefs";
let state: Prefs = DEFAULT_PREFS;
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    state = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch { /* ignore */ }
  apply();
}

function apply() {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  r.style.fontSize = `${state.fontScale}%`;
  r.style.setProperty("--radius", `${state.radius}rem`);
  const a = ACCENTS[state.accent];
  if (a) {
    r.style.setProperty("--star", a);
    r.style.setProperty("--ring", a);
  } else {
    r.style.removeProperty("--star");
    r.style.removeProperty("--ring");
  }
  r.dataset["bg"] = state.background;
  r.dataset["density"] = state.density;
  r.classList.toggle("reduce-motion", state.reduceMotion);
  document.title = state.tabCloak ? state.cloakTitle : document.title;
}

export function setPrefs(p: Partial<Prefs>) {
  load();
  state = { ...state, ...p };
  localStorage.setItem(KEY, JSON.stringify(state));
  apply();
  subs.forEach((f) => f());
}

export function resetPrefs() {
  setPrefs(DEFAULT_PREFS);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (f) => {
      load();
      subs.add(f);
      return () => subs.delete(f);
    },
    () => (load(), state),
    () => DEFAULT_PREFS,
  );
}

export function searchUrl(q: string, engine: Prefs["searchEngine"]) {
  const e = encodeURIComponent(q);
  if (engine === "google") return `https://www.google.com/search?q=${e}`;
  if (engine === "bing") return `https://www.bing.com/search?q=${e}`;
  if (engine === "duckduckgo") return `https://duckduckgo.com/?q=${e}`;
  return null;
}
