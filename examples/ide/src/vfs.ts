import { useSyncExternalStore } from "react";
import { SEED } from "./seed";

/** In-memory virtual file system. Each file has a live buffer and its last saved contents.
 * Saved contents persist to localStorage so reloads keep your work. */
export interface FileEntry {
  path: string;
  content: string;
  saved: string;
}

const STORAGE_KEY = "trellis-ide:fs:v1";

function load(): Map<string, FileEntry> {
  let stored: Record<string, string> | null = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    stored = null;
  }
  const source = stored ?? SEED;
  return new Map(Object.entries(source).map(([path, text]) => [path, { path, content: text, saved: text }]));
}

let files = load();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  for (const l of listeners) l();
}
function persist() {
  try {
    const out: Record<string, string> = {};
    for (const f of files.values()) out[f.path] = f.saved;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    /* storage unavailable */
  }
}

export const vfs = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  version: () => version,
  paths(): string[] {
    return [...files.keys()].sort(comparePaths);
  },
  all(): FileEntry[] {
    return vfs.paths().map((p) => files.get(p)!);
  },
  get(path: string): FileEntry | undefined {
    return files.get(path);
  },
  exists(path: string) {
    return files.has(path);
  },
  read(path: string): string | undefined {
    return files.get(path)?.content;
  },
  isDirty(path: string) {
    const f = files.get(path);
    return !!f && f.content !== f.saved;
  },
  dirtyPaths(): string[] {
    return vfs.paths().filter((p) => vfs.isDirty(p));
  },
  /** Update the live buffer (unsaved). */
  write(path: string, content: string) {
    const f = files.get(path);
    if (f) {
      if (f.content === content) return;
      files.set(path, { ...f, content });
    } else files.set(path, { path, content, saved: "" });
    emit();
  },
  /** Create (or overwrite) a file and save it immediately. */
  create(path: string, content = "") {
    files.set(path, { path, content, saved: content });
    persist();
    emit();
  },
  save(path: string) {
    const f = files.get(path);
    if (!f || f.content === f.saved) return;
    files.set(path, { ...f, saved: f.content });
    persist();
    emit();
  },
  saveAll() {
    let changed = false;
    for (const f of files.values())
      if (f.content !== f.saved) {
        files.set(f.path, { ...f, saved: f.content });
        changed = true;
      }
    if (changed) {
      persist();
      emit();
    }
  },
  revert(path: string) {
    const f = files.get(path);
    if (!f || f.content === f.saved) return;
    files.set(path, { ...f, content: f.saved });
    emit();
  },
  /** Restore the seed project. */
  resetProject() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    files = new Map(Object.entries(SEED).map(([path, text]) => [path, { path, content: text, saved: text }]));
    emit();
  },
};

/** Folders first, then alphabetical, like every file tree. */
export function comparePaths(a: string, b: string) {
  const pa = a.split("/");
  const pb = b.split("/");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue;
    const aDir = i < pa.length - 1;
    const bDir = i < pb.length - 1;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return pa[i].localeCompare(pb[i]);
  }
  return pa.length - pb.length;
}

/** Re-render when any file changes. Returns a version number (use the vfs getters). */
export function useVfs(): number {
  return useSyncExternalStore(vfs.subscribe, vfs.version, vfs.version);
}
export function useFile(path: string): FileEntry | undefined {
  useVfs();
  return vfs.get(path);
}

export const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
export const dirname = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
export const extname = (path: string) => {
  const b = basename(path);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i + 1).toLowerCase() : "";
};

export type Language = "ts" | "js" | "css" | "html" | "md" | "json" | "text";
export function languageOf(path: string): Language {
  const ext = extname(path);
  if (ext === "ts" || ext === "tsx") return "ts";
  if (ext === "js" || ext === "mjs" || ext === "jsx") return "js";
  if (ext === "css") return "css";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "md") return "md";
  if (ext === "json") return "json";
  return "text";
}
export const LANGUAGE_NAMES: Record<Language, string> = {
  ts: "TypeScript",
  js: "JavaScript",
  css: "CSS",
  html: "HTML",
  md: "Markdown",
  json: "JSON",
  text: "Plain Text",
};
