import { describe, expect, it } from "vitest";
import { dragBoundary } from "../src/model/resize";
import { findNode, layoutRects, type LayoutMetrics } from "../src/model/tree";
import type { Axis, LayoutNode, PanelNode, SplitNode, StageNode } from "../src/model/types";

/** Dragging a divider pushes: past a neighbour's minimum it moves the next divider, and so on,
 * through parent groups, until the window's edge. Everything that doesn't have to move stays put. */

const panel = (id: string): PanelNode => ({ kind: "panel", id, views: [id], selected: id });
const split =
  (axis: Axis) =>
  (id: string, children: LayoutNode[], weights = children.map(() => 1)) => {
    const total = weights.reduce((a, b) => a + b, 0);
    return { kind: "split", id, axis, children, weights: weights.map((w) => w / total) } as SplitNode;
  };
const row = split("x");
const column = split("y");
const stage = (id: string, child?: SplitNode | PanelNode): StageNode => ({ kind: "stage", id, child });

/** A 1000 × 600 workspace. Panels need 100 × 50 unless `mins` says otherwise; an empty stage 120. */
const metrics = (mins: Record<string, number> = {}, width = 1000, height = 600): LayoutMetrics => ({
  width,
  height,
  min: (node, axis) =>
    mins[node.id] ?? (node.kind === "stage" && !node.child ? 120 : axis === "x" ? 100 : 50),
});
const px = (m: LayoutMetrics, axis: Axis) => (axis === "x" ? m.width : m.height);

/** A split's divider positions in pixels, outer edges included. */
function bounds(root: LayoutNode, m: LayoutMetrics, id: string): number[] {
  const e = layoutRects(root, m);
  const node = findNode(root, id) as SplitNode;
  const r = e.get(id)!.rect;
  const [pos, size] = node.axis === "x" ? ([r.x, r.w] as const) : ([r.y, r.h] as const);
  const inner = node.children.slice(1).map((c) => {
    const cr = e.get(c.id)!.rect;
    return node.axis === "x" ? cr.x : cr.y;
  });
  return [pos, ...inner, pos + size].map((v) => round(v * px(m, node.axis)));
}
const round = (v: number) => Math.round(v * 1e6) / 1e6;

/** Drag divider `index` of split `id` to `to` pixels, returning the new layout. */
function drag(root: LayoutNode, m: LayoutMetrics, id: string, index: number, to: number) {
  const d = dragBoundary(root, m, id, index)!;
  const axis = (findNode(root, id) as SplitNode).axis;
  return d.to(to / px(m, axis));
}

describe("dragging a divider in one row", () => {
  const m = metrics();
  const abc = row("r", [panel("a"), panel("b"), panel("c")], [300, 300, 400]);

  it("moves only the divider while the neighbour has room", () => {
    expect(bounds(drag(abc, m, "r", 0, 350), m, "r")).toEqual([0, 350, 600, 1000]);
  });

  it("past the neighbour's minimum, pushes the next divider", () => {
    expect(bounds(drag(abc, m, "r", 0, 700), m, "r")).toEqual([0, 700, 800, 1000]);
  });

  it("stops where every panel ahead is at its minimum", () => {
    expect(bounds(drag(abc, m, "r", 0, 950), m, "r")).toEqual([0, 800, 900, 1000]);
    expect(bounds(drag(abc, m, "r", 1, 20), m, "r")).toEqual([0, 100, 200, 1000]);
  });

  it("pushes the other way too", () => {
    expect(bounds(drag(abc, m, "r", 1, 150), m, "r")).toEqual([0, 100, 200, 1000]);
    expect(bounds(drag(abc, m, "r", 1, 250), m, "r")).toEqual([0, 150, 250, 1000]);
  });

  it("reports how far the divider can go", () => {
    const d = dragBoundary(abc, m, "r", 0)!;
    expect(d.axis).toBe("x");
    expect(d.start * 1000).toBeCloseTo(300, 9);
    expect(d.min * 1000).toBeCloseTo(100, 9);
    expect(d.max * 1000).toBeCloseTo(800, 9);
  });

  it("pushes nearest first: a panel further away only moves once the nearer ones are at their minimum", () => {
    const four = row("r", [panel("a"), panel("b"), panel("c"), panel("d")]);
    expect(bounds(drag(four, m, "r", 0, 400), m, "r")).toEqual([0, 400, 500, 750, 1000]);
    expect(bounds(drag(four, m, "r", 0, 500), m, "r")).toEqual([0, 500, 600, 750, 1000]);
    expect(bounds(drag(four, m, "r", 0, 700), m, "r")).toEqual([0, 700, 800, 900, 1000]);
  });

  it("is computed from where the drag started, so dragging back undoes every push", () => {
    const d = dragBoundary(abc, m, "r", 0)!;
    d.to(0.9);
    d.to(0.7);
    const back = d.to(d.start);
    expect(bounds(back, m, "r")).toEqual([0, 300, 600, 1000]);
  });

  it("works down a column the same way", () => {
    const col = column("col", [panel("a"), panel("b"), panel("c")]);
    expect(bounds(drag(col, m, "col", 0, 500), m, "col")).toEqual([0, 500, 550, 600]);
  });
});

describe("pushing through the layout tree", () => {
  const m = metrics();
  // A | [B C over D] | E — the middle column holds a row.
  const tree = () =>
    row(
      "r",
      [panel("A"), column("col", [row("inner", [panel("B"), panel("C")]), panel("D")]), panel("E")],
      [1, 2, 1],
    );

  it("bubbles up: once the row's last panel is at its minimum, its group grows and pushes the parent's next panel", () => {
    const t = drag(tree(), m, "inner", 0, 700);
    expect(bounds(t, m, "inner")).toEqual([250, 700, 800]);
    expect(bounds(t, m, "r")).toEqual([0, 250, 800, 1000]);
  });

  it("stops at the window's edge", () => {
    const d = dragBoundary(tree(), m, "inner", 0)!;
    expect(d.max * 1000).toBeCloseTo(800, 9);
    expect(bounds(d.to(0.95), m, "r")).toEqual([0, 250, 900, 1000]);
  });

  it("bubbles up the other way", () => {
    const t = drag(tree(), m, "inner", 0, 200);
    expect(bounds(t, m, "inner")).toEqual([100, 200, 750]);
    expect(bounds(t, m, "r")).toEqual([0, 100, 750, 1000]);
  });

  it("stops at the edge when the group is already the last in its parent", () => {
    const t = row("r", [panel("A"), column("col", [row("inner", [panel("B"), panel("C")]), panel("D")])]);
    const d = dragBoundary(t, m, "inner", 0)!;
    expect(d.max * 1000).toBeCloseTo(900, 9);
    expect(bounds(d.to(0.99), m, "inner")).toEqual([500, 900, 1000]);
  });

  it("pushes into a nested row nearest first", () => {
    // A | [C1 C2 over F]
    const t = row("r", [panel("A"), column("col", [row("inner", [panel("C1"), panel("C2")]), panel("F")])]);
    expect(bounds(drag(t, m, "r", 0, 700), m, "inner")).toEqual([700, 800, 1000]);
    expect(dragBoundary(t, m, "r", 0)!.max * 1000).toBeCloseTo(800, 9);
  });

  it("a group can't shrink below the largest minimum inside it", () => {
    const t = row("r", [panel("A"), column("col", [row("inner", [panel("C1"), panel("C2")]), panel("F")])]);
    expect(dragBoundary(t, metrics({ F: 400 }), "r", 0)!.max * 1000).toBeCloseTo(600, 9);
  });

  it("the growing side changes as little as it can: only the panel beside the divider grows", () => {
    // [A1 A2 over G] | B
    const t = row("r", [column("col", [row("inner", [panel("A1"), panel("A2")]), panel("G")]), panel("B")]);
    const moved = drag(t, m, "r", 0, 700);
    expect(bounds(moved, m, "inner")).toEqual([0, 250, 700]);
    expect(bounds(moved, m, "r")).toEqual([0, 700, 1000]);
  });

  it("an empty stage keeps its own minimum", () => {
    const t = row("r", [panel("A"), stage("s"), panel("C")]);
    expect(dragBoundary(t, m, "r", 0)!.max * 1000).toBeCloseTo(1000 - 100 - 120, 9);
  });

  it("a stage passes pushes through to what it holds", () => {
    const t = row("r", [
      panel("A"),
      stage("s", column("sc", [row("sr", [panel("P"), panel("Q")]), panel("R")])),
    ]);
    expect(bounds(drag(t, m, "r", 0, 700), m, "sr")).toEqual([700, 800, 1000]);
  });
});

describe("what a drag leaves alone", () => {
  const m = metrics();

  it("returns the same document when nothing moves", () => {
    const t = row("r", [panel("a"), panel("b")]);
    const d = dragBoundary(t, m, "r", 0)!;
    expect(d.to(d.start)).toBe(t);
  });

  it("keeps the document's own weights on groups the drag doesn't change", () => {
    // The bottom row's first weight is below its minimum: the layout raises it, but the document
    // keeps what it was given until someone resizes that row.
    const bottom = row("bottom", [panel("c"), panel("d"), panel("e")], [0.02, 0.49, 0.49]);
    const t = column("col", [row("top", [panel("a"), panel("b")]), bottom]);
    const moved = drag(t, m, "top", 0, 700);
    expect(findNode(moved, "bottom")).toBe(bottom);
    expect(findNode(moved, "col")).not.toBe(t);
    expect((findNode(moved, "col") as SplitNode).weights).toEqual(t.weights);
  });

  it("never changes the other axis", () => {
    const t = row("r", [
      panel("A"),
      column("col", [row("inner", [panel("B"), panel("C")]), panel("D")], [3, 1]),
      panel("E"),
    ]);
    const moved = drag(t, m, "inner", 0, 700);
    expect((findNode(moved, "col") as SplitNode).weights).toEqual((findNode(t, "col") as SplitNode).weights);
  });
});

describe("scaled groups", () => {
  // The right half holds ten panels that need 1000px: the group is drawn at half size.
  const m = metrics();
  const t = () =>
    row("r", [
      panel("a"),
      row(
        "inner",
        Array.from({ length: 10 }, (_, i) => panel(`q${i}`)),
      ),
    ]);

  it("a scaled group is already at its minimum, so it can't be pushed any smaller", () => {
    const d = dragBoundary(t(), m, "r", 0)!;
    expect(d.max).toBeCloseTo(d.start, 9);
  });

  it("given more room, the dragged divider follows the pointer and the group scales up evenly", () => {
    const moved = drag(t(), m, "r", 0, 300);
    const b = bounds(moved, m, "inner");
    expect(b[0]).toBeCloseTo(300, 6);
    const widths = b.slice(1).map((v, i) => v - b[i]);
    for (const w of widths) expect(w).toBeCloseTo(70, 6);
  });

  it("a divider inside a scaled group follows the pointer, growing the group, and the panel it's dragged into gets the room", () => {
    // A | [g1 g2 g3], where the group has 200px but needs 300: it's drawn at two thirds.
    const tree = row("r", [panel("A"), row("g", [panel("g1"), panel("g2"), panel("g3")])], [4, 1]);
    const d = dragBoundary(tree, m, "g", 0)!;
    expect(d.min * 1000).toBeLessThan(d.start * 1000 - 300);
    const moved = d.to(0.5);
    const b = bounds(moved, m, "g");
    expect(b[1]).toBeCloseTo(500, 6);
    expect(b[0]).toBeLessThan(800 - 300);
    const [g1, g2, g3] = b.slice(1).map((v, i) => v - b[i]);
    expect(g2).toBeGreaterThan(2 * g3);
    expect(g1).toBeCloseTo(100, 6);
    expect(g3).toBeCloseTo(100, 6);
  });

  it("keeps a scaled group's own proportions, so it doesn't turn lopsided once there's room for it", () => {
    const tree = t();
    const moved = drag(tree, m, "r", 0, 300);
    expect(findNode(moved, "inner")).toBe(findNode(tree, "inner"));
  });
});

// ------------------------------------------------------------------------ properties

/** A small seeded random generator, so failures reproduce. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomTree(random: () => number) {
  let n = 0;
  let stages = 0;
  const mins: Record<string, number> = {};
  const build = (axis: Axis, depth: number): LayoutNode => {
    // Now and then a stage: empty (a leaf with its own minimum), or holding a panel or a split
    // (possibly one along the same axis as the split around it).
    if (depth > 0 && stages === 0 && random() < 0.15) {
      stages++;
      const id = `st${n++}`;
      const kind = random();
      if (kind < 0.3) {
        mins[id] = 30 + Math.floor(random() * 40);
        return stage(id);
      }
      const inner = kind < 0.6 ? build(axis, 99) : build(random() < 0.5 ? "x" : "y", depth + 1);
      // As in the workspace, a stage needs what the panel it holds needs.
      if (inner.kind === "panel") mins[id] = mins[inner.id];
      return stage(id, inner as SplitNode | PanelNode);
    }
    if (depth > 3 || (depth > 0 && random() < 0.35)) {
      const id = `p${n++}`;
      mins[id] = 20 + Math.floor(random() * 60);
      return panel(id);
    }
    const count = 2 + Math.floor(random() * 3);
    const children = Array.from({ length: count }, () => build(axis === "x" ? "y" : "x", depth + 1));
    return split(axis)(
      `s${n++}`,
      children,
      children.map(() => 0.2 + random()),
    );
  };
  return { root: build(random() < 0.5 ? "x" : "y", 0), mins };
}

interface Edge {
  id: string;
  lo: number;
  hi: number;
}
/** Every panel's extent along an axis, in pixels. */
function extents(root: LayoutNode, m: LayoutMetrics, axis: Axis): Edge[] {
  const out: Edge[] = [];
  for (const [id, e] of layoutRects(root, m)) {
    if (e.node.kind !== "panel" && !(e.node.kind === "stage" && !e.node.child)) continue;
    const lo = axis === "x" ? e.rect.x : e.rect.y;
    const size = axis === "x" ? e.rect.w : e.rect.h;
    out.push({ id, lo: lo * px(m, axis), hi: (lo + size) * px(m, axis) });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
const splitsOf = (node: LayoutNode): SplitNode[] =>
  node.kind === "split"
    ? [node, ...node.children.flatMap(splitsOf)]
    : node.kind === "stage" && node.child
      ? splitsOf(node.child)
      : [];

describe("properties, over random layouts", () => {
  const EPS = 1e-6;
  const cases: { root: LayoutNode; m: LayoutMetrics; split: SplitNode; index: number; target: number }[] = [];
  const random = rng(20260927);
  while (cases.length < 400) {
    const { root, mins } = randomTree(random);
    const m: LayoutMetrics = {
      width: 1400,
      height: 1000,
      min: (node, axis) => (axis === "x" ? (mins[node.id] ?? 20) : (mins[node.id] ?? 20) * 0.6),
    };
    // Only layouts that fit without scaling: inside a scaled group, the layout redistributes.
    if ([...layoutRects(root, m).values()].some((e) => (e.scale ?? 1) < 1 - 1e-9)) continue;
    const splits = splitsOf(root);
    if (!splits.length) continue;
    const s = splits[Math.floor(random() * splits.length)];
    const index = Math.floor(random() * (s.children.length - 1));
    cases.push({ root, m, split: s, index, target: random() * 1.2 - 0.1 });
  }

  it("the divider lands on the target, clamped to the range it reports", () => {
    for (const c of cases) {
      const d = dragBoundary(c.root, c.m, c.split.id, c.index)!;
      expect(d.min).toBeLessThanOrEqual(d.start + 1e-12);
      expect(d.max).toBeGreaterThanOrEqual(d.start - 1e-12);
      const moved = d.to(c.target);
      const b = bounds(moved, c.m, c.split.id);
      const expected = Math.max(d.min, Math.min(d.max, c.target)) * px(c.m, c.split.axis);
      expect(b[c.index + 1]).toBeCloseTo(expected, 5);
    }
  });

  it("every panel keeps its minimum, in both directions", () => {
    for (const c of cases) {
      const moved = dragBoundary(c.root, c.m, c.split.id, c.index)!.to(c.target);
      for (const axis of ["x", "y"] as const)
        for (const e of extents(moved, c.m, axis))
          expect(e.hi - e.lo).toBeGreaterThanOrEqual(c.m.min(findNode(moved, e.id)!, axis) - EPS);
    }
  });

  it("nothing moves against the drag, and nothing behind the divider moves at all", () => {
    for (const c of cases) {
      const d = dragBoundary(c.root, c.m, c.split.id, c.index)!;
      const moved = d.to(c.target);
      const start = d.start * px(c.m, d.axis);
      const right = c.target > d.start;
      const before = extents(c.root, c.m, d.axis);
      const after = extents(moved, c.m, d.axis);
      before.forEach((b, i) => {
        const a = after[i];
        for (const [was, is] of [
          [b.lo, a.lo],
          [b.hi, a.hi],
        ]) {
          if (right) {
            expect(is).toBeGreaterThanOrEqual(was - EPS);
            if (was < start - EPS) expect(is).toBeCloseTo(was, 6);
          } else {
            expect(is).toBeLessThanOrEqual(was + EPS);
            if (was > start + EPS) expect(is).toBeCloseTo(was, 6);
          }
        }
      });
    }
  });

  it("every edge that moved was pushed: a panel at its minimum sits between it and the divider", () => {
    for (const c of cases) {
      const d = dragBoundary(c.root, c.m, c.split.id, c.index)!;
      const moved = d.to(c.target);
      const right = c.target > d.start;
      const pos = Math.max(d.min, Math.min(d.max, c.target)) * px(c.m, d.axis);
      const before = extents(c.root, c.m, d.axis);
      const after = extents(moved, c.m, d.axis);
      // The moving edge of each panel: its far edge when pushing right, its near edge when left.
      const lead = (e: Edge) => (right ? e.hi : e.lo);
      const trail = (e: Edge) => (right ? e.lo : e.hi);
      after.forEach((a, i) => {
        const b = before[i];
        if (Math.abs(lead(a) - lead(b)) < EPS || Math.abs(lead(a) - pos) < EPS) return;
        // Some panel ending at this same edge is at its minimum, and its other edge moved too.
        const holder = after.some((q, j) => {
          const qb = before[j];
          if (Math.abs(lead(q) - lead(a)) > EPS || Math.abs(lead(qb) - lead(b)) > EPS) return false;
          const tight = Math.abs(q.hi - q.lo - c.m.min(findNode(moved, q.id)!, d.axis)) < EPS;
          const pushed = Math.abs(trail(q) - trail(qb)) > EPS || Math.abs(trail(q) - pos) < EPS;
          return tight && pushed;
        });
        expect(holder, `${a.id} moved without being pushed`).toBe(true);
      });
    }
  });

  it("moves continuously: a small step of the pointer moves nothing further than that", () => {
    for (const c of cases.slice(0, 150)) {
      const d = dragBoundary(c.root, c.m, c.split.id, c.index)!;
      const step = 0.003;
      const a = extents(d.to(c.target), c.m, d.axis);
      const b = extents(d.to(c.target + step), c.m, d.axis);
      a.forEach((e, i) => {
        expect(Math.abs(b[i].lo - e.lo)).toBeLessThanOrEqual(step * px(c.m, d.axis) + EPS);
        expect(Math.abs(b[i].hi - e.hi)).toBeLessThanOrEqual(step * px(c.m, d.axis) + EPS);
      });
    }
  });

  it("returning to the start restores the layout exactly", () => {
    for (const c of cases) {
      const d = dragBoundary(c.root, c.m, c.split.id, c.index)!;
      d.to(c.target);
      expect(d.to(d.start)).toBe(c.root);
    }
  });

  it("never touches the other axis", () => {
    for (const c of cases) {
      const d = dragBoundary(c.root, c.m, c.split.id, c.index)!;
      const other = d.axis === "x" ? "y" : "x";
      const before = extents(c.root, c.m, other);
      const after = extents(d.to(c.target), c.m, other);
      after.forEach((a, i) => {
        expect(a.lo).toBeCloseTo(before[i].lo, 6);
        expect(a.hi).toBeCloseTo(before[i].hi, 6);
      });
    }
  });
});

describe("properties, over cramped layouts with scaled groups", () => {
  const cases: { root: LayoutNode; m: LayoutMetrics; split: SplitNode; index: number; target: number }[] = [];
  const random = rng(7);
  let scaled = 0;
  while (cases.length < 300) {
    const { root, mins } = randomTree(random);
    const m: LayoutMetrics = {
      width: 300 + random() * 500,
      height: 200 + random() * 300,
      min: (node, axis) => (axis === "x" ? (mins[node.id] ?? 20) : (mins[node.id] ?? 20) * 0.6),
    };
    const splits = splitsOf(root);
    if (!splits.length) continue;
    if ([...layoutRects(root, m).values()].some((e) => (e.scale ?? 1) < 1 - 1e-9)) scaled++;
    const s = splits[Math.floor(random() * splits.length)];
    cases.push({
      root,
      m,
      split: s,
      index: Math.floor(random() * (s.children.length - 1)),
      target: random(),
    });
  }

  it("covers plenty of scaled layouts", () => {
    expect(scaled).toBeGreaterThan(100);
  });

  it("the divider still lands on the target, clamped to its range", () => {
    for (const c of cases) {
      const d = dragBoundary(c.root, c.m, c.split.id, c.index)!;
      const b = bounds(d.to(c.target), c.m, c.split.id);
      const expected = Math.max(d.min, Math.min(d.max, c.target)) * px(c.m, c.split.axis);
      expect(b[c.index + 1]).toBeCloseTo(expected, 5);
    }
  });

  it("dragging further never moves the divider back", () => {
    for (const c of cases.slice(0, 120)) {
      const d = dragBoundary(c.root, c.m, c.split.id, c.index)!;
      let last = -Infinity;
      for (let t = -0.05; t <= 1.05; t += 0.05) {
        const at = bounds(d.to(t), c.m, c.split.id)[c.index + 1];
        expect(at).toBeGreaterThanOrEqual(last - 1e-6);
        last = at;
      }
    }
  });

  it("no panel gets smaller than its minimum at the scale it's drawn", () => {
    for (const c of cases) {
      const d = dragBoundary(c.root, c.m, c.split.id, c.index)!;
      const moved = d.to(c.target);
      const e = layoutRects(moved, c.m);
      for (const edge of extents(moved, c.m, d.axis)) {
        const node = findNode(moved, edge.id)!;
        const min = c.m.min(node, d.axis) * (e.get(edge.id)!.scale ?? 1);
        expect(edge.hi - edge.lo).toBeGreaterThanOrEqual(min - 1e-6);
      }
    }
  });

  it("returning to the start restores the layout exactly", () => {
    for (const c of cases) {
      const d = dragBoundary(c.root, c.m, c.split.id, c.index)!;
      d.to(c.target);
      expect(d.to(d.start)).toBe(c.root);
    }
  });
});
