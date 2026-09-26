export type Command =
  | "frame.toggle"
  | "navigation.back"
  | "navigation.forward"
  | "navigation.overview"
  | "panel.next"
  | "panel.previous"
  | "tab.next"
  | "tab.previous"
  | "view.close"
  | "panel.float"
  | "panel.hide";

export type Keymap = Partial<Record<Command, string | null>>;

export const DEFAULT_KEYMAP: Record<Command, string | null> = {
  "frame.toggle": "Mod+Shift+Enter",
  "navigation.back": "Mod+Alt+ArrowLeft",
  "navigation.forward": "Mod+Alt+ArrowRight",
  "navigation.overview": "Mod+Alt+ArrowUp",
  "panel.next": "F6",
  "panel.previous": "Shift+F6",
  "tab.next": "Mod+Alt+]",
  "tab.previous": "Mod+Alt+[",
  "view.close": "Mod+Alt+W",
  "panel.float": null,
  "panel.hide": null,
};

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const CODES: Record<string, string> = {
  "[": "BracketLeft",
  "]": "BracketRight",
  ".": "Period",
  ",": "Comma",
  "/": "Slash",
  ";": "Semicolon",
  "'": "Quote",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
  "\\": "Backslash",
};

interface Combo {
  key: string;
  code?: string;
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

export function parseCombo(combo: string): Combo {
  const parts = combo.split("+").map((p) => p.trim());
  // "Mod++" style: a trailing empty part means the key is "+".
  let key = parts.pop() || "+";
  if (key === "" && parts.length) key = "+";
  const has = (name: string) => parts.some((p) => p.toLowerCase() === name.toLowerCase());
  const result: Combo = {
    key,
    mod: has("Mod"),
    ctrl: has("Ctrl") || has("Control"),
    meta: has("Meta") || has("Cmd"),
    alt: has("Alt") || has("Option"),
    shift: has("Shift"),
  };
  if (/^[a-z0-9]$/i.test(key)) result.code = /\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`;
  else if (CODES[key]) result.code = CODES[key];
  return result;
}

export function matches(event: KeyboardEvent, combo: string): boolean {
  const c = parseCombo(combo);
  const mac = isMac();
  const wantCtrl = c.ctrl || (c.mod && !mac);
  const wantMeta = c.meta || (c.mod && mac);
  if (event.ctrlKey !== wantCtrl || event.metaKey !== wantMeta) return false;
  if (event.altKey !== c.alt || event.shiftKey !== c.shift) return false;
  if (c.code) return event.code === c.code;
  return event.key.toLowerCase() === c.key.toLowerCase();
}

/** Human-readable shortcut, e.g. "⌘⌥←" on macOS or "Ctrl+Alt+←" elsewhere. */
export function formatCombo(combo: string): string {
  const c = parseCombo(combo);
  const mac = isMac();
  const arrows: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Enter: mac ? "↩" : "Enter",
  };
  const key = arrows[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key);
  if (mac)
    return `${c.ctrl ? "⌃" : ""}${c.alt ? "⌥" : ""}${c.shift ? "⇧" : ""}${c.mod || c.meta ? "⌘" : ""}${key}`;
  return [
    c.mod || c.ctrl ? "Ctrl" : "",
    c.meta ? "Meta" : "",
    c.alt ? "Alt" : "",
    c.shift ? "Shift" : "",
    key,
  ]
    .filter(Boolean)
    .join("+");
}
