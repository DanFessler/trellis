import { isMac } from "./keymap";

/** Keys held with the pointer or wheel for free-navigation gestures. `null` turns one off. */
export interface GestureKeys {
  /** Drag to pan. */
  pan: string | null;
  /** Drag to scale around the press point. */
  scale: string | null;
  /** Drag a rectangle; releasing frames what fits it best. */
  rect: string | null;
  /** Scroll to step in or out a level. */
  step: string | null;
}

export const DEFAULT_GESTURE_KEYS: GestureKeys = {
  pan: "Mod+Alt",
  scale: "Mod+Alt+Z",
  rect: "Mod+Alt+Shift",
  step: "Mod+Alt",
};

interface Chord {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  /** Physical keys held along with the modifiers, as `KeyboardEvent.code`s. */
  keys: string[];
}

const MODIFIERS: Record<string, "mod" | "ctrl" | "meta" | "alt" | "shift"> = {
  mod: "mod",
  ctrl: "ctrl",
  control: "ctrl",
  meta: "meta",
  cmd: "meta",
  alt: "alt",
  option: "alt",
  shift: "shift",
};

/** "Mod+Alt+Z" → modifiers plus held keys. Letters and digits match by physical key. */
export function parseChord(combo: string): Chord {
  const chord: Chord = { ctrl: false, meta: false, alt: false, shift: false, keys: [] };
  for (const part of combo.split("+").map((p) => p.trim())) {
    if (!part) continue;
    const modifier = MODIFIERS[part.toLowerCase()];
    if (modifier === "mod") chord[isMac() ? "meta" : "ctrl"] = true;
    else if (modifier) chord[modifier] = true;
    else if (/^[a-z]$/i.test(part)) chord.keys.push(`Key${part.toUpperCase()}`);
    else if (/^\d$/.test(part)) chord.keys.push(`Digit${part}`);
    else chord.keys.push(part === " " || part.toLowerCase() === "space" ? "Space" : part);
  }
  return chord;
}

type Modifiers = Pick<MouseEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/** Exactly these modifiers, and every key in the chord currently held. */
export function matchesChord(e: Modifiers, combo: string | null, held: ReadonlySet<string>): boolean {
  if (!combo) return false;
  const c = parseChord(combo);
  return (
    e.ctrlKey === c.ctrl &&
    e.metaKey === c.meta &&
    e.altKey === c.alt &&
    e.shiftKey === c.shift &&
    c.keys.every((k) => held.has(k))
  );
}

/**
 * Whether a wheel event came from a notched mouse wheel rather than a trackpad pinch. Browsers
 * report a pinch as a Ctrl+wheel stream of small, fractional deltas; a mouse wheel with Ctrl held
 * sends whole notches (about 100 pixels each) or counts lines or pages.
 */
export function isNotchedWheel(e: Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY">): boolean {
  if (e.deltaMode !== 0) return true;
  const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  return Math.abs(d) >= 40 && Number.isInteger(d);
}
