import { describe, expect, it } from "vitest";
import { RendererChoice } from "../src/runtime/renderer-choice";

/**
 * `worldTransform: "auto"` decides, per camera move, whether to lay every panel out on every frame
 * (the normal renderer) or to lay out once and transform the layer (the world transform). It
 * predicts what a normal frame would cost from how long layouts take here, and falls back to what
 * frames actually do.
 */

const HZ60 = 1000 / 60;

describe("RendererChoice", () => {
  it("keeps a layout that lays out quickly on the normal renderer", () => {
    const c = new RendererChoice();
    c.fullLayout(2, 25);
    expect(c.startMove(25)).toBe(false);
  });

  it("starts a move in world mode, from its first frame, when layouts are slow", () => {
    const c = new RendererChoice();
    c.fullLayout(200, 100);
    expect(c.startMove(100)).toBe(true);
  });

  it("with no measurements yet, uses the normal renderer", () => {
    expect(new RendererChoice().startMove(100)).toBe(false);
  });

  it("never uses world mode when only a few panels are on screen, even if frames are late", () => {
    const c = new RendererChoice();
    c.fullLayout(200, 100);
    expect(c.startMove(8)).toBe(false);
    for (let i = 0; i < 8; i++) expect(c.frame(60)).toBe(false);
    expect(c.startMove(8)).toBe(false);
  });

  it("scales the prediction by how many panels the move shows", () => {
    const c = new RendererChoice();
    // 0.4 ms a panel for a full layout; about half that for a moving frame.
    c.fullLayout(40, 100);
    expect(c.startMove(20)).toBe(false);
    expect(c.startMove(200)).toBe(true);
  });

  it("doesn't flip back and forth when the prediction sits between the thresholds", () => {
    // A moving frame predicted at half a frame: above the way down, below the way up.
    const half = (panels: number) => {
      const c = new RendererChoice();
      c.fullLayout(((HZ60 * 0.5) / 0.5 / panels) * panels, panels);
      return c;
    };
    const plain = half(50);
    expect(plain.startMove(50)).toBe(false);
    expect(plain.startMove(50)).toBe(false);

    const world = new RendererChoice();
    world.fullLayout(400, 50);
    expect(world.startMove(50)).toBe(true);
    // Layouts get cheaper, but not by enough to go back.
    for (let i = 0; i < 30; i++) world.fullLayout(((HZ60 * 0.5) / 0.5 / 50) * 50, 50);
    expect(world.startMove(50)).toBe(true);
    // Now they're cheap.
    for (let i = 0; i < 30; i++) world.fullLayout(2, 50);
    expect(world.startMove(50)).toBe(false);
  });

  it("learns how a moving frame compares with a full layout on this machine", () => {
    const c = new RendererChoice();
    // Full layouts cost 1 ms a panel: by default a moving frame is guessed at half of that.
    c.fullLayout(100, 100);
    expect(c.startMove(100)).toBe(true);
    // But moving frames measured here cost 0.03 ms a panel.
    for (let i = 0; i < 30; i++) c.plainFrame(3, 100);
    c.fullLayout(100, 100);
    expect(c.startMove(100)).toBe(false);
  });

  it("learns only from frames and layouts with enough panels to outweigh a frame's fixed cost", () => {
    const c = new RendererChoice();
    c.fullLayout(2, 25);
    // The end of a zoom in: one panel on screen, and a frame's fixed cost.
    for (let i = 0; i < 30; i++) c.plainFrame(0.5, 1);
    for (let i = 0; i < 30; i++) c.fullLayout(1.5, 4);
    expect(c.startMove(25)).toBe(false);
  });

  it("switches mid-move once frames run late, and starts the next move in world mode", () => {
    const c = new RendererChoice();
    c.fullLayout(2, 25);
    expect(c.startMove(25)).toBe(false);
    expect(c.frame(HZ60)).toBe(false);
    expect(c.frame(HZ60)).toBe(false);
    expect(c.frame(40)).toBe(false);
    // Two of the last four frames were late.
    expect(c.frame(40)).toBe(true);
    expect(c.startMove(25)).toBe(true);
  });

  it("one late frame on its own isn't enough", () => {
    const c = new RendererChoice();
    c.fullLayout(2, 25);
    c.startMove(25);
    for (let i = 0; i < 20; i++) expect(c.frame(i % 5 === 0 ? 50 : HZ60)).toBe(false);
  });

  it("late frames from an earlier move don't count towards the next", () => {
    const c = new RendererChoice();
    c.fullLayout(2, 25);
    c.startMove(25);
    expect(c.frame(40)).toBe(false);
    c.startMove(25);
    expect(c.frame(40)).toBe(false);
  });

  it("after late frames, tries the normal renderer again within a few moves", () => {
    const c = new RendererChoice();
    c.fullLayout(2, 25);
    c.startMove(25);
    c.frame(40);
    c.frame(40);
    const moves: boolean[] = [];
    for (let i = 0; i < 10; i++) moves.push(c.startMove(25));
    expect(moves[0]).toBe(true);
    const back = moves.indexOf(false);
    expect(back).toBeGreaterThan(0);
    expect(back).toBeLessThanOrEqual(8);
    // And once back, it stays back while frames are on time.
    expect(moves.slice(back).every((m) => m === false)).toBe(true);
  });

  it("goes straight back to world mode if frames are still late", () => {
    const c = new RendererChoice();
    c.fullLayout(2, 25);
    c.startMove(25);
    c.frame(40);
    c.frame(40);
    let move = 0;
    while (c.startMove(25) && move < 20) move++;
    // Back on the normal renderer: it's still slow.
    expect(c.frame(40)).toBe(false);
    expect(c.frame(40)).toBe(true);
  });

  it("judges lateness and budgets against the display's own frame rate", () => {
    const at = (interval: number) => {
      const c = new RendererChoice();
      for (let i = 0; i < 20; i++) c.frameInterval(interval);
      // A moving frame predicted at 7 ms.
      c.fullLayout(14, 50);
      return c;
    };
    // 7 ms fits a 60 Hz frame, but not a 120 Hz one.
    expect(at(HZ60).startMove(50)).toBe(false);
    expect(at(1000 / 120).startMove(50)).toBe(true);

    const fast = at(1000 / 120);
    fast.startMove(50);
    for (let i = 0; i < 30; i++) fast.fullLayout(1, 50);
    fast.startMove(50);
    // Frames are late when they'd visibly stutter: a missed frame and over 25 ms. A 120 Hz display
    // that drops to 60 Hz on its own (as variable-rate displays do) isn't stuttering.
    for (let i = 0; i < 8; i++) expect(fast.frame(HZ60)).toBe(false);
    fast.frame(30);
    expect(fast.frame(30)).toBe(true);
  });

  it("frames with uneven timing that never stutter aren't late", () => {
    const c = new RendererChoice();
    const uneven = [9, 21, 20, 19, 10, 9, 20, 10, 24, 9];
    for (const i of uneven) c.frameInterval(i);
    c.fullLayout(2, 25);
    c.startMove(25);
    for (let i = 0; i < 30; i++) expect(c.frame(uneven[i % uneven.length])).toBe(false);
  });

  it("a page that's busy from the start doesn't pass for a slow display", () => {
    const c = new RendererChoice();
    for (let i = 0; i < 30; i++) c.frameInterval(1000 / 30);
    c.fullLayout(2, 25);
    c.startMove(25);
    c.frame(1000 / 30);
    expect(c.frame(1000 / 30)).toBe(true);
  });

  it("ignores measurements that can't be right", () => {
    const c = new RendererChoice();
    c.fullLayout(NaN, 100);
    c.fullLayout(Infinity, 100);
    c.fullLayout(-5, 100);
    c.fullLayout(50, 0);
    c.plainFrame(NaN, 10);
    c.frameInterval(0);
    c.frameInterval(NaN);
    // Two renders in the same frame aren't a 0 ms display.
    for (let i = 0; i < 20; i++) c.frameInterval(0.5);
    c.fullLayout(2, 25);
    expect(c.startMove(25)).toBe(false);
    c.frame(HZ60);
    expect(c.frame(HZ60)).toBe(false);
  });
});
