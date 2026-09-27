import { describe, expect, it } from "vitest";
import { layoutRects, type LayoutMetrics } from "../src/model/tree";
import type { LayoutNode, PanelNode, SplitNode } from "../src/model/types";

/** Minimum sizes and local scaling: minimums hold in each group's own layout space; a group whose
 * children can't fit is laid out at its natural size and scaled down into its slot. */

const panel = (id: string): PanelNode => ({ kind: "panel", id, views: [id], selected: id });
const row = (id: string, children: LayoutNode[], weights = children.map(() => 1)): SplitNode => ({
  kind: "split",
  id,
  axis: "x",
  children,
  weights,
});
const column = (id: string, children: LayoutNode[], weights = children.map(() => 1)): SplitNode => ({
  kind: "split",
  id,
  axis: "y",
  children,
  weights,
});

/** A 1000 × 600 workspace whose panels need at least 100 × 50 pixels. */
const metrics = (width = 1000, height = 600, minW = 100, minH = 50): LayoutMetrics => ({
  width,
  height,
  min: (_node, axis) => (axis === "x" ? minW : minH),
});
/** An entry's rect in pixels of the whole workspace. */
const px = (entries: ReturnType<typeof layoutRects>, id: string, m: LayoutMetrics) => {
  const r = entries.get(id)!.rect;
  return { x: r.x * m.width, y: r.y * m.height, w: r.w * m.width, h: r.h * m.height };
};
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("layout minimums", () => {
  it("without metrics, follows the weights exactly (unchanged behaviour)", () => {
    const root = row("r", [panel("a"), panel("b")], [1, 3]);
    const e = layoutRects(root);
    close(e.get("a")!.rect.w, 0.25);
    close(e.get("b")!.rect.w, 0.75);
  });

  it("with room to spare, follows the weights exactly", () => {
    const m = metrics();
    const e = layoutRects(row("r", [panel("a"), panel("b")], [1, 3]), m);
    close(px(e, "a", m).w, 250);
    close(px(e, "b", m).w, 750);
  });

  it("raises a child below its minimum, taking space from siblings with room in proportion", () => {
    // Weights would give a 20px; it gets its 100px minimum. b and c keep their 1:3 ratio.
    const m = metrics();
    const e = layoutRects(row("r", [panel("a"), panel("b"), panel("c")], [0.02, 0.245, 0.735]), m);
    close(px(e, "a", m).w, 100);
    close(px(e, "b", m).w, 225);
    close(px(e, "c", m).w, 675);
    // The children still tile the row exactly.
    close(px(e, "a", m).x + px(e, "a", m).w, px(e, "b", m).x);
    close(px(e, "c", m).x + px(e, "c", m).w, 1000);
  });

  it("applies minimums inside nested groups, against the group's own size", () => {
    // The right half (500px) holds a column of three; the top one's weight would give it 12px.
    const m = metrics();
    const right = column("col", [panel("t"), panel("u"), panel("v")], [0.02, 0.49, 0.49]);
    const e = layoutRects(row("r", [panel("a"), right]), m);
    close(px(e, "t", m).h, 50);
    close(px(e, "u", m).h, 275);
    close(px(e, "v", m).h, 275);
  });

  it("scales a group whose children can't fit, so each child keeps its minimum in the group's own space", () => {
    // A 1000px row of 20 panels needs 2000px: the row lays out at 2000 × 1200 and scales by 0.5.
    const m = metrics();
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const e = layoutRects(row("r", ids.map(panel)), m);
    for (const id of ids) {
      close(px(e, id, m).w, 50); // 100px minimum × 0.5 scale
      close(px(e, id, m).h, 600); // fills the slot's height: no centring, no empty space
      close(e.get(id)!.scale!, 0.5);
    }
    close(e.get("r")!.scale ?? 1, 1);
  });

  it("chooses the scale from whichever direction is tighter and fills the slot in both", () => {
    // 3 side by side need 300px of a 200px-wide slot (0.667); height is fine. The layout fills
    // the whole 200 × 600 slot.
    const m = metrics(200, 600);
    const e = layoutRects(row("r", [panel("a"), panel("b"), panel("c")]), m);
    const s = 200 / 300;
    for (const id of ["a", "b", "c"]) {
      close(e.get(id)!.scale!, s);
      close(px(e, id, m).w, 100 * s);
      close(px(e, id, m).h, 600);
    }
  });

  it("scales only the group whose own children can't fit, leaving its siblings at full size", () => {
    // Left panel takes 500px at full scale; the right 500px holds a 10-wide row that needs 1000px.
    const m = metrics();
    const inner = row(
      "inner",
      Array.from({ length: 10 }, (_, i) => panel(`q${i}`)),
    );
    const e = layoutRects(row("r", [panel("a"), inner]), m);
    close(px(e, "a", m).w, 500);
    close(e.get("a")!.scale ?? 1, 1);
    close(px(e, "inner", m).w, 500);
    for (let i = 0; i < 10; i++) {
      close(px(e, `q${i}`, m).w, 50);
      close(e.get(`q${i}`)!.scale!, 0.5);
    }
  });

  it("compounds scales for cramped groups nested inside cramped groups", () => {
    // The right 500px holds a 10-wide row (scale 0.5, 100px each in its own space); its last cell
    // is a 4-wide row needing 400px of its 100px, so it scales by 0.25 more: 0.125 overall.
    const m = metrics();
    const deepest = row(
      "deepest",
      Array.from({ length: 4 }, (_, i) => panel(`d${i}`)),
    );
    const inner = row("inner", [...Array.from({ length: 9 }, (_, i) => panel(`q${i}`)), deepest]);
    const e = layoutRects(row("r", [panel("a"), inner]), m);
    close(e.get("q0")!.scale!, 0.5);
    close(e.get("d0")!.scale!, 0.125);
    close(px(e, "d0", m).w, 12.5); // 100px minimum × 0.125
  });

  it("scales the whole layout when the window is too small for it", () => {
    const m = metrics(150, 600);
    const e = layoutRects(row("r", [panel("a"), panel("b")]), m);
    close(e.get("a")!.scale!, 0.75);
    close(px(e, "a", m).w, 75);
    close(px(e, "b", m).w, 75);
  });

  it("exposes each split's effective proportions on its entry", () => {
    const m = metrics();
    const e = layoutRects(row("r", [panel("a"), panel("b"), panel("c")], [0.02, 0.245, 0.735]), m);
    const split = e.get("r")!.node as SplitNode;
    close(split.weights[0], 0.1);
    close(split.weights[1], 0.225);
    close(split.weights[2], 0.675);
  });

  it("leaves the document's own weights untouched", () => {
    const root = row("r", [panel("a"), panel("b")], [0.02, 0.98]);
    layoutRects(root, metrics());
    expect(root.weights).toEqual([0.02, 0.98]);
  });
});
