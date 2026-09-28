import { isMac } from "./keymap";

/** One key combo, several (any of them works), or `null` for off. */
export type GestureCombo = string | string[] | null;

/** Keys held with the pointer or wheel for free-navigation gestures. */
export interface GestureKeys {
  /** Drag to pan. */
  pan: GestureCombo;
  /** Drag to scale around the press point. */
  scale: GestureCombo;
  /** Drag a rectangle; releasing frames what fits it best. */
  rect: GestureCombo;
  /** Scroll to step in or out a level. */
  step: GestureCombo;
}

/**
 * The defaults: every gesture starts from ⌘⌥ (Ctrl+Alt), and V or Shift picks scale or rectangle.
 * Scale and rectangle also have two-key chords: ⌘⇧ (Ctrl+Shift) for a rectangle everywhere, and
 * ⌘⌃ for scale on macOS only, since elsewhere Mod is Ctrl and Mod+Ctrl would be Ctrl alone.
 */
export function defaultGestureKeys(mac = isMac()): GestureKeys {
  return {
    pan: "Mod+Alt",
    scale: mac ? ["Mod+Alt+V", "Mod+Ctrl"] : "Mod+Alt+V",
    rect: ["Mod+Alt+Shift", "Mod+Shift"],
    step: "Mod+Alt",
  };
}

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

/** "Mod+Alt+V" → modifiers plus held keys. Letters and digits match by physical key. */
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

/** Every combo in a gesture's setting. */
export const combosOf = (combo: GestureCombo): string[] => (combo ? [combo].flat() : []);

/** Exactly one combo's modifiers, and every key in that combo currently held. */
export function matchesChord(e: Modifiers, combo: GestureCombo, held: ReadonlySet<string>): boolean {
  return combosOf(combo).some((one) => matchesOne(e, one, held));
}
function matchesOne(e: Modifiers, combo: string, held: ReadonlySet<string>): boolean {
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
