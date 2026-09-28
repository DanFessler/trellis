import { describe, expect, it } from "vitest";
import {
  defaultGestureKeys,
  isNotchedWheel,
  matchesChord,
  parseChord,
  type GestureKeys,
} from "../src/runtime/gestures";
import { isMac } from "../src/runtime/keymap";

const mods = (m: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...m,
});
// Mod is ⌘ on macOS and Ctrl elsewhere, following the platform the tests run on.
const mac = isMac();
const mod = mac ? "metaKey" : "ctrlKey";
const none = new Set<string>();

describe("gesture chords", () => {
  it("parses modifiers and held keys, letters by physical key", () => {
    expect(parseChord("Mod+Alt+Z")).toEqual({
      ctrl: !mac,
      meta: mac,
      alt: true,
      shift: false,
      keys: ["KeyZ"],
    });
    expect(parseChord("Cmd+Option+Space").keys).toEqual(["Space"]);
    expect(parseChord("Shift").shift).toBe(true);
  });

  it("matches exactly these modifiers", () => {
    expect(matchesChord(mods({ [mod]: true, altKey: true }), "Mod+Alt", none)).toBe(true);
    expect(matchesChord(mods({ [mod]: true, altKey: true, shiftKey: true }), "Mod+Alt", none)).toBe(false);
    expect(matchesChord(mods({ [mod]: true }), "Mod+Alt", none)).toBe(false);
  });

  it("needs every held key in the chord to be down", () => {
    const e = mods({ [mod]: true, altKey: true });
    expect(matchesChord(e, "Mod+Alt+Z", none)).toBe(false);
    expect(matchesChord(e, "Mod+Alt+Z", new Set(["KeyZ"]))).toBe(true);
  });

  it("null never matches", () => {
    expect(matchesChord(mods(), null, none)).toBe(false);
  });
});

describe("telling a mouse wheel from a trackpad pinch", () => {
  it("treats line and page deltas as a wheel", () => {
    expect(isNotchedWheel({ deltaMode: 1, deltaX: 0, deltaY: -3 })).toBe(true);
    expect(isNotchedWheel({ deltaMode: 2, deltaX: 0, deltaY: 1 })).toBe(true);
  });

  it("treats whole notches of pixels as a wheel", () => {
    expect(isNotchedWheel({ deltaMode: 0, deltaX: 0, deltaY: -100 })).toBe(true);
    expect(isNotchedWheel({ deltaMode: 0, deltaX: 0, deltaY: 120 })).toBe(true);
  });

  it("treats small or fractional deltas as a pinch", () => {
    expect(isNotchedWheel({ deltaMode: 0, deltaX: 0, deltaY: -6.5 })).toBe(false);
    expect(isNotchedWheel({ deltaMode: 0, deltaX: 0, deltaY: 3 })).toBe(false);
    expect(isNotchedWheel({ deltaMode: 0, deltaX: 0, deltaY: -52.25 })).toBe(false);
  });
});

describe("default gesture keys", () => {
  const all = (keys: GestureKeys) =>
    (["pan", "scale", "rect"] as const).flatMap((g) =>
      [keys[g]].flat().map((combo) => ({ g, combo: combo! })),
    );

  it("on macOS, offer both the three-key and two-key chords", () => {
    const keys = defaultGestureKeys(true);
    expect(keys.pan).toEqual("Mod+Alt");
    expect(keys.scale).toEqual(["Mod+Alt+V", "Mod+Ctrl"]);
    expect(keys.rect).toEqual(["Mod+Alt+Shift", "Mod+Shift"]);
    expect(keys.step).toEqual("Mod+Alt");
  });

  it("elsewhere, leave out Mod+Ctrl, which would be Ctrl alone", () => {
    const keys = defaultGestureKeys(false);
    expect(keys.scale).toEqual("Mod+Alt+V");
    expect(keys.rect).toEqual(["Mod+Alt+Shift", "Mod+Shift"]);
  });

  it("give each drag its own exact set of keys, so one never starts another", () => {
    for (const mac of [true, false]) {
      const chords = all(defaultGestureKeys(mac)).map(({ g, combo }) => ({
        g,
        sig: JSON.stringify(parseChord(combo)),
      }));
      for (const a of chords) for (const b of chords) if (a.g !== b.g) expect(a.sig).not.toBe(b.sig);
    }
  });
});

describe("several combos for one gesture", () => {
  it("matches any of them", () => {
    const e = mods({ [mod]: true, shiftKey: true });
    expect(matchesChord(e, ["Mod+Alt+Shift", "Mod+Shift"], none)).toBe(true);
    expect(matchesChord(mods({ [mod]: true }), ["Mod+Alt+Shift", "Mod+Shift"], none)).toBe(false);
  });
});
