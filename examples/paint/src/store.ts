import { useSyncExternalStore } from "react";
import { PRESETS, type BrushSettings } from "./paint/brush";
import { hexToHsv, hsvToHex, hsvToRgb, type HSV } from "./paint/color";
import { PaintDoc, type DocParams } from "./paint/PaintDoc";
import { clearDocs, deleteDoc, hydrate, loadDoc, saveDoc } from "./paint/persist";
import { paintSample } from "./paint/sample";

export type Tool = "brush" | "eraser" | "fill" | "eyedropper" | "hand";
export type ThemeName = "light" | "medium" | "dark" | "darker";

export interface AppState {
  tool: Tool;
  color: HSV;
  secondary: HSV;
  brush: BrushSettings;
  preset: string | null;
  recent: string[];
  activeDoc: string | null;
  theme: ThemeName;
  /** Temporary hand tool while Space is held. */
  spaceHeld: boolean;
}

const THEME_KEY = "trellis-paint:theme";
const readTheme = (): ThemeName => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "medium" || t === "dark" || t === "darker") return t;
  } catch {}
  return "dark";
};

let state: AppState = {
  tool: "brush",
  color: hexToHsv("#f0736a")!,
  secondary: { h: 0, s: 0, v: 1 },
  brush: { ...PRESETS[0].settings },
  preset: PRESETS[0].id,
  recent: [],
  activeDoc: null,
  theme: readTheme(),
  spaceHeld: false,
};
const listeners = new Set<() => void>();

export const app = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    const p = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...p };
    if (p.theme) {
      try {
        localStorage.setItem(THEME_KEY, p.theme);
      } catch {}
    }
    for (const fn of [...listeners]) fn();
  },
  setBrush(patch: Partial<BrushSettings>) {
    app.set((s) => ({ brush: { ...s.brush, ...patch }, preset: null }));
  },
  setColor(color: HSV) {
    app.set({ color });
  },
  /** Remember a color once it has actually been used. */
  pushRecent(hex: string) {
    app.set((s) => (s.recent[0] === hex ? {} : { recent: [hex, ...s.recent.filter((x) => x !== hex)].slice(0, 10) }));
  },
  swapColors() {
    app.set((s) => ({ color: s.secondary, secondary: s.color }));
  },
  colorRgb: () => hsvToRgb(state.color),
  colorHex: () => hsvToHex(state.color),
};

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(app.subscribe, () => select(state), () => select(state));
}

// ------------------------------------------------------------------ documents
const docs = new Map<string, PaintDoc>();
const docListeners = new Set<() => void>();
let docsVersion = 0;
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const notifyDocs = () => {
  docsVersion++;
  for (const fn of [...docListeners]) fn();
};

export const documents = {
  get: (id: string | null | undefined) => (id ? (docs.get(id) ?? null) : null),
  all: () => [...docs.values()],
  subscribe(fn: () => void) {
    docListeners.add(fn);
    return () => void docListeners.delete(fn);
  },
  version: () => docsVersion,
  /** Documents are keyed by Trellis view id: the view is the tab, this is its content. */
  ensure(id: string, params: DocParams): PaintDoc {
    const existing = docs.get(id);
    if (existing) return existing;
    const doc = new PaintDoc(id, params.name ?? "Untitled", params.width ?? 1600, params.height ?? 1000, params.background ?? "#ffffff");
    docs.set(id, doc);
    const source = documents.get(params.cloneOf);
    if (source && source.width === doc.width && source.height === doc.height) doc.copyFrom(source);
    else if (params.sample) paintSample(doc);
    // Restore pixels saved from a previous session (layout comes back via Trellis persistence).
    void loadDoc(id).then((stored) => (stored ? hydrate(doc, stored) : false)).finally(() => {
      let lastPixels = doc.pixels;
      let lastName = doc.name;
      doc.subscribe(() => {
        if (doc.painting || (doc.pixels === lastPixels && doc.name === lastName)) return;
        lastPixels = doc.pixels;
        lastName = doc.name;
        clearTimeout(saveTimers.get(id));
        saveTimers.set(id, setTimeout(() => docs.has(id) && void saveDoc(doc), 700));
      });
    });
    // May be called while rendering a view: notify other subscribers afterwards.
    queueMicrotask(notifyDocs);
    return doc;
  },
  dispose(id: string) {
    if (!docs.delete(id)) return;
    clearTimeout(saveTimers.get(id));
    void deleteDoc(id);
    if (state.activeDoc === id) app.set({ activeDoc: null });
    notifyDocs();
  },
  async forgetAll() {
    for (const t of saveTimers.values()) clearTimeout(t);
    docs.clear();
    await clearDocs();
    app.set({ activeDoc: null });
    notifyDocs();
  },
};

/** The document the tool panels act on (the last focused document tab). */
export function useActiveDoc(): PaintDoc | null {
  const id = useApp((s) => s.activeDoc);
  useSyncExternalStore(documents.subscribe, documents.version, documents.version);
  const doc = documents.get(id);
  useSyncExternalStore(doc?.subscribe ?? noopSubscribe, doc?.getVersion ?? zero, doc?.getVersion ?? zero);
  return doc;
}
export function useDoc(doc: PaintDoc | null) {
  useSyncExternalStore(doc?.subscribe ?? noopSubscribe, doc?.getVersion ?? zero, doc?.getVersion ?? zero);
  return doc;
}
const noopSubscribe = () => () => {};
const zero = () => 0;

export async function exportPng(doc: PaintDoc) {
  const blob = await doc.toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.name.replace(/[\\/:*?"<>|]+/g, "-") || "painting"}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  doc.markSaved();
}

if (import.meta.env.DEV) (window as any).__paint = { app, documents };
