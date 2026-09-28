import { layoutRects, sum, type LayoutMetrics } from "./tree";
import type { Axis, LayoutNode, Rect, SplitNode } from "./types";

/**
 * Divider drags that push.
 *
 * Every divider along the drag's axis, across the whole tree, is a position on one line. A split's
 * outer edges are the same positions as the dividers around it in its ancestors, so nested groups
 * share them. Each panel is a constraint between the two positions on either side of it: they
 * must be at least its minimum apart.
 *
 * Dragging puts one divider at the pointer and keeps every other divider where it was when the
 * drag started, unless a constraint forces it along. Moving right, a position ends up at whichever
 * is further right: where it was, or the pointer plus the longest chain of minimums between the
 * two. That's nearest-first pushing, through parent groups and up to the window's edges, with
 * nothing moving that doesn't have to. Each call works from the starting layout, so dragging back
 * undoes every push.
 */
export interface BoundaryDrag {
  axis: Axis;
  /** Where the divider started, and how far it can go, in world units (fractions of the layout). */
  start: number;
  min: number;
  max: number;
  /** The layout with the divider at `position` (clamped), pushing what it has to. */
  to(position: number): LayoutNode;
}

interface Group {
  node: SplitNode;
  /** Its boundary positions, outer edges included. */
  ids: number[];
  /** Laid out scaled down because its own children don't fit along the axis: it redistributes
   * evenly whenever it gets more room, so its weights are left alone. */
  cramped: boolean;
}

export function dragBoundary(
  root: LayoutNode,
  metrics: LayoutMetrics,
  splitId: string,
  index: number,
): BoundaryDrag | null {
  const entries = layoutRects(root, metrics);
  const dragged = entries.get(splitId)?.node;
  if (dragged?.kind !== "split" || index < 0 || index >= dragged.children.length - 1) return null;
  const axis = dragged.axis;
  const pixels = axis === "x" ? metrics.width : metrics.height;
  const lo = (r: Rect) => (axis === "x" ? r.x : r.y);
  const len = (r: Rect) => (axis === "x" ? r.w : r.h);
  const scaleOf = (id: string) => entries.get(id)?.scale ?? 1;

  // ------------------------------------------------ positions and constraints
  const pos: number[] = [];
  const next: { to: number; gap: number }[][] = [];
  const prev: { from: number; gap: number }[][] = [];
  const position = (at: number) => {
    pos.push(at);
    next.push([]);
    prev.push([]);
    return pos.length - 1;
  };
  const atLeast = (from: number, to: number, gap: number) => {
    next[from].push({ to, gap });
    prev[to].push({ from, gap });
  };
  /** A leaf's minimum in world units: pixels of its group's space, times how much that's scaled. */
  const minOf = (node: LayoutNode) => (metrics.min(node, axis) * scaleOf(node.id)) / pixels;

  const groups = new Map<string, Group>();
  const walk = (node: LayoutNode, a: number, b: number): void => {
    if (node.kind === "panel") return atLeast(a, b, minOf(node));
    if (node.kind === "stage") return node.child ? walk(node.child, a, b) : atLeast(a, b, minOf(node));
    // Across the axis, every child spans the same two positions.
    if (node.axis !== axis) return node.children.forEach((child) => walk(child, a, b));
    const ids = [a, ...node.children.slice(1).map((child) => position(lo(entries.get(child.id)!.rect))), b];
    groups.set(node.id, { node, ids, cramped: crampedAlong(node) });
    node.children.forEach((child, i) => walk(child, ids[i], ids[i + 1]));
  };
  const crampedAlong = (node: SplitNode) => {
    const own = scaleOf(node.id);
    const factor = scaleOf(node.children[0].id) / own;
    if (factor >= 1 - 1e-9) return false;
    // Its own layout is scaled; is that because its children don't fit along this axis?
    const size = (len(entries.get(node.id)!.rect) * pixels) / own;
    const need = sum(node.children.map((child) => metrics.min(child, axis)));
    return size / need <= factor + 1e-9;
  };
  const rootRect = entries.get(root.id)!.rect;
  const first = position(lo(rootRect));
  const last = position(lo(rootRect) + len(rootRect));
  walk(root, first, last);
  const handle = groups.get(splitId)!.ids[index + 1];

  // ------------------------------------------------ longest chains of minimums from the handle
  // Constraints only ever point from a position to one further along, so they form a DAG.
  const order = topological(next);
  const ahead = pos.map(() => -Infinity); // longest chain from the handle to each position
  ahead[handle] = 0;
  for (const u of order)
    if (ahead[u] > -Infinity) for (const e of next[u]) ahead[e.to] = Math.max(ahead[e.to], ahead[u] + e.gap);
  const behind = pos.map(() => -Infinity); // longest chain from each position to the handle
  behind[handle] = 0;
  for (const u of [...order].reverse())
    if (behind[u] > -Infinity)
      for (const e of prev[u]) behind[e.from] = Math.max(behind[e.from], behind[u] + e.gap);

  // The window's edges are the only positions that never move.
  const start = pos[handle];
  const reachMax = Math.max(start, pos[last] - ahead[last]);
  const reachMin = Math.min(start, pos[first] + behind[first]);

  /** The layout with the handle at `p`, within [reachMin, reachMax]. */
  const solve = (p: number): LayoutNode => {
    const moved = pos.map((at, v) =>
      p >= start
        ? ahead[v] > -Infinity
          ? Math.max(at, p + ahead[v])
          : at
        : behind[v] > -Infinity
          ? Math.min(at, p - behind[v])
          : at,
    );
    moved[handle] = p;
    // New weights for each group whose proportions changed. A group drawn scaled down that only
    // changed size keeps its own: it grows evenly, so it shouldn't turn lopsided once it has room.
    const weights = new Map<string, number[]>();
    for (const { node, ids, cramped } of groups.values()) {
      const before = ids.slice(1).map((id, i) => pos[id] - pos[ids[i]]);
      const after = ids.slice(1).map((id, i) => moved[id] - moved[ids[i]]);
      const total = sum(after);
      const was = sum(before);
      if (after.every((a, i) => Math.abs(a / total - before[i] / was) < 1e-12)) continue;
      if (cramped && ids.slice(1, -1).every((id) => moved[id] === pos[id])) continue;
      weights.set(
        node.id,
        after.map((a) => a / total),
      );
    }
    return weights.size ? reweigh(root, weights) : root;
  };
  /** Where the layout actually draws the handle. The same as asked, except inside a group drawn
   * scaled down: every child there sits at its minimum, so they all grow as the group does. */
  const beside = dragged.children[index + 1].id;
  const landed = (layout: LayoutNode) =>
    layout === root ? start : lo(layoutRects(layout, metrics).get(beside)!.rect);
  const min = reachMin === start ? start : Math.min(start, landed(solve(reachMin)));
  const max = reachMax === start ? start : Math.max(start, landed(solve(reachMax)));

  return {
    axis,
    start,
    min,
    max,
    to(target: number) {
      const p = Math.max(min, Math.min(max, target));
      const guess = solve(Math.max(reachMin, Math.min(reachMax, p)));
      if (Math.abs(landed(guess) - p) < 1e-9) return guess;
      // Where it lands rises with how far it's pushed: search for the push that lands on target.
      let [below, above] = p >= start ? [start, reachMax] : [reachMin, start];
      for (let i = 0; i < 50 && above - below > 1e-12; i++) {
        const mid = (below + above) / 2;
        if (landed(solve(mid)) < p) below = mid;
        else above = mid;
      }
      return solve(p >= start ? above : below);
    },
  };
}

/** Positions in an order where every constraint points forward. */
function topological(next: { to: number }[][]): number[] {
  const incoming = next.map(() => 0);
  for (const edges of next) for (const e of edges) incoming[e.to]++;
  const queue = incoming.flatMap((n, v) => (n === 0 ? [v] : []));
  const order: number[] = [];
  while (queue.length) {
    const u = queue.shift()!;
    order.push(u);
    for (const e of next[u]) if (--incoming[e.to] === 0) queue.push(e.to);
  }
  return order;
}

/** Replace the weights of the given splits, keeping every untouched node as it was. */
function reweigh(node: LayoutNode, weights: Map<string, number[]>): LayoutNode {
  if (node.kind === "panel") return node;
  if (node.kind === "stage") {
    if (!node.child) return node;
    const child = reweigh(node.child, weights) as SplitNode;
    return child === node.child ? node : { ...node, child };
  }
  const children = node.children.map((child) => reweigh(child, weights));
  const w = weights.get(node.id);
  if (!w && children.every((child, i) => child === node.children[i])) return node;
  return { ...node, children, weights: w ?? node.weights };
}
