import { useSyncExternalStore } from "react";
import type { Theme, WorkspaceHandle } from "@danfessler/trellis-react";

/** App-level state that lives outside the workspace: the active editor, cursors, dialogs, palette. */
export type IdeTheme = Exclude<Theme, "system">;
export interface Cursor {
  line: number; // 1-based
  col: number; // 1-based
  selected: number;
}
export interface ConfirmRequest {
  title: string;
  message: string;
  buttons: { label: string; value: string; primary?: boolean; danger?: boolean }[];
  resolve(value: string): void;
}
export type PaletteMode = "commands" | "files";

interface IdeState {
  activeEditor: string | null;
  cursors: Record<string, Cursor>;
  theme: IdeTheme;
  palette: { open: boolean; mode: PaletteMode; nonce: number };
  confirm: ConfirmRequest | null;
  toast: { text: string; nonce: number } | null;
}

const THEME_KEY = "trellis-ide:theme";
function initialTheme(): IdeTheme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "medium" || t === "dark" || t === "darker") return t;
  } catch {
    /* ignore */
  }
  return "dark";
}

let state: IdeState = {
  activeEditor: null,
  cursors: {},
  theme: initialTheme(),
  palette: { open: false, mode: "commands", nonce: 0 },
  confirm: null,
  toast: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<IdeState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useIde<T>(select: (s: IdeState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const ide = {
  get: () => state,
  setActiveEditor(id: string | null) {
    if (state.activeEditor !== id) set({ activeEditor: id });
  },
  setCursor(viewId: string, cursor: Cursor) {
    const prev = state.cursors[viewId];
    if (prev && prev.line === cursor.line && prev.col === cursor.col && prev.selected === cursor.selected) return;
    set({ cursors: { ...state.cursors, [viewId]: cursor } });
  },
  setTheme(theme: IdeTheme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  openPalette(mode: PaletteMode) {
    set({ palette: { open: true, mode, nonce: state.palette.nonce + 1 } });
  },
  closePalette() {
    if (state.palette.open) set({ palette: { ...state.palette, open: false } });
  },
  confirm(request: Omit<ConfirmRequest, "resolve">): Promise<string> {
    return new Promise((resolve) => {
      set({
        confirm: {
          ...request,
          resolve: (value) => {
            set({ confirm: null });
            resolve(value);
          },
        },
      });
    });
  },
  toast(text: string) {
    set({ toast: { text, nonce: (state.toast?.nonce ?? 0) + 1 } });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 1800);
  },
};

// ------------------------------------------------------------------ editor registry
export interface EditorApi {
  reveal(line: number, col?: number, length?: number): void;
  focus(): void;
}
const editors = new Map<string, EditorApi>();
const pendingReveal = new Map<string, { line: number; col: number; length: number }>();
export const editorRegistry = {
  register(viewId: string, api: EditorApi) {
    editors.set(viewId, api);
    const pending = pendingReveal.get(viewId);
    if (pending) {
      pendingReveal.delete(viewId);
      requestAnimationFrame(() => api.reveal(pending.line, pending.col, pending.length));
    }
    return () => {
      if (editors.get(viewId) === api) editors.delete(viewId);
    };
  },
  get: (viewId: string) => editors.get(viewId),
};

/** Open a file in the stage (once per path) and optionally move the caret to a 0-based line/col. */
export function openFile(ws: WorkspaceHandle, path: string, at?: { line: number; col?: number; length?: number }) {
  const info = ws.open("editor", { params: { path }, reuse: "params" });
  if (at) {
    const target = { line: at.line, col: at.col ?? 0, length: at.length ?? 0 };
    const api = editors.get(info.id);
    if (api) requestAnimationFrame(() => api.reveal(target.line, target.col, target.length));
    else pendingReveal.set(info.id, target);
  } else {
    const api = editors.get(info.id);
    if (api) requestAnimationFrame(() => api.focus());
  }
  return info;
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const mod = isMac ? "⌘" : "Ctrl+";
export const shift = isMac ? "⇧" : "Shift+";
