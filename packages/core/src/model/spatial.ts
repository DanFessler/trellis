/**
 * Docking and navigation geometry: focus layout, snap targets, hierarchy steps, framing, drop
 * targets and insertion.
 *
 * A stage is a transparent container. It occupies exactly its child's rect, so it never adds a
 * navigation level, and an empty stage acts as a leaf (the desktop).
 */
import {
  edgeAxis,
  edgeBefore,
  insertBeside,
  layoutRects,
  normalize,
  sum,
  UNIT,
  type Entry,
  type LayoutMetrics,
} from "./tree";
import type { Axis, Edge, LayoutNode, PanelNode, Rect, SplitNode } from "./types";

// ------------------------------------------------------------------ entries

/** Panels and empty stages: the "leaves" a view can sit beside. */
export function leafIds(node: LayoutNode | null | undefined): string[] {
  if (!node) return [];
  if (node.kind === "panel") return [node.id];
  if (node.kind === "stage") return node.child ? leafIds(node.child) : [node.id];
  return node.children.flatMap(leafIds);
}

export interface SpaceEntry extends Entry {
  /** A camera-only group of contiguous siblings; not a node in the tree. */
  virtual?: boolean;
}

/** Camera targets: every node, plus contiguous sibling ranges of splits with 3+ children. */
export function focusLayout(root: LayoutNode | null, metrics?: LayoutMetrics): Map<string, SpaceEntry> {
  const entries: Map<string, SpaceEntry> = layoutRects(root, metrics);
  for (const { node } of [...entries.values()]) {
    if (node.kind !== "split" || node.children.length < 3) continue;
    for (let start = 0; start < node.children.length - 1; start++) {
      for (let end = start + 2; end <= node.children.length; end++) {
        if (start === 0 && end === node.children.length) continue;
        const children = node.children.slice(start, end);
        const first = entries.get(children[0].id)!.rect;
        const last = entries.get(children[children.length - 1].id)!.rect;
        const id = rangeId(
          node.id,
          children.map((c) => c.id),
        );
        const weights = node.weights.slice(start, end);
        const total = sum(weights);
        entries.set(id, {
          node: { kind: "split", id, axis: node.axis, children, weights: weights.map((w) => w / total) },
          rect: { x: first.x, y: first.y, w: last.x + last.w - first.x, h: last.y + last.h - first.y },
          parent: node.id,
          virtual: true,
        });
      }
    }
  }
  return entries;
}
export const rangeId = (splitId: string, children: string[]) =>
  `range:${JSON.stringify([splitId, ...children])}`;

/** A node's parent for navigation, skipping containers that add no visible level (a stage). */
export function navParent(entries: Map<string, SpaceEntry>, id: string): string | null {
  const entry = entries.get(id);
  let at = entry?.parent ?? null;
  while (at) {
    const parent = entries.get(at);
    if (!parent) return null;
    if (!sameRect(parent.rect, entry!.rect)) return at;
    at = parent.parent;
  }
  return null;
}
/** Collapse a stage to its child so it is never its own navigation level. */
export function navNode(entries: Map<string, SpaceEntry>, id: string): string {
  let node = entries.get(id)?.node;
  while (node?.kind === "stage" && node.child) node = node.child;
  return node?.id ?? id;
}
function sameRect(a: Rect, b: Rect) {
  return (
    Math.abs(a.x - b.x) < 1e-9 &&
    Math.abs(a.y - b.y) < 1e-9 &&
    Math.abs(a.w - b.w) < 1e-9 &&
    Math.abs(a.h - b.h) < 1e-9
  );
}
export function containsNode(node: LayoutNode, id: string): boolean {
  if (node.id === id) return true;
  if (node.kind === "stage") return !!node.child && containsNode(node.child, id);
  if (node.kind === "split") return node.children.some((c) => containsNode(c, id));
  return false;
}

// ------------------------------------------------------------------ camera

/** Snap score: log-size difference plus 2.5 × normalized centre distance. */
export function bestFit(camera: Rect, entries: Map<string, SpaceEntry>): string {
  let best = "";
  let score = Infinity;
  for (const [id, { rect: r, node }] of entries) {
    if (node.kind === "stage" && node.child) continue;
    const size = Math.abs(Math.log(r.w / camera.w)) + Math.abs(Math.log(r.h / camera.h));
    const distance = Math.hypot(
      (r.x + r.w / 2 - camera.x - camera.w / 2) / camera.w,
      (r.y + r.h / 2 - camera.y - camera.h / 2) / camera.h,
    );
    const next = size + distance * 2.5;
    if (next < score) {
      best = id;
      score = next;
    }
  }
  return best;
}

/** One hierarchy step: outward to the parent, inward to the immediate child under the pointer. */
export function hierarchyStep(
  entries: Map<string, SpaceEntry>,
  focused: string,
  direction: "in" | "out",
  point: { x: number; y: number },
): string {
  const id = navNode(entries, focused);
  const entry = entries.get(id);
  if (!entry) return focused;
  if (direction === "out") return navParent(entries, id) ?? id;
  if (entry.node.kind !== "split") return id;
  const split = entry.node;
  const coordinate = split.axis === "x" ? point.x : point.y;
  for (const child of split.children.slice(0, -1)) {
    const r = entries.get(child.id)!.rect;
    if (coordinate < (split.axis === "x" ? r.x + r.w : r.y + r.h)) return navNode(entries, child.id);
  }
  return navNode(entries, split.children[split.children.length - 1].id);
}

/** The smallest camera target (node or sibling range) containing all of `ids`. */
export function frameLeaves(root: LayoutNode | null, ids: string[]): string | null {
  if (!root) return null;
  const entries = focusLayout(root);
  const wanted = ids.filter((id) => entries.has(id));
  let best = entries.get(root.id)!;
  for (const entry of entries.values()) {
    if (entry.node.kind === "stage" && entry.node.child) continue;
    if (
      entry.rect.w * entry.rect.h < best.rect.w * best.rect.h &&
      wanted.every((id) => containsNode(entry.node, id))
    )
      best = entry;
  }
  return best.node.id;
}

/** Convert a screen-space marquee into world coordinates through the camera, clipped to the layout. */
export function rectangleCamera(
  a: { x: number; y: number },
  b: { x: number; y: number },
  viewport: Rect,
  camera: Rect,
): Rect {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const ax = clamp((a.x - viewport.x) / viewport.w);
  const ay = clamp((a.y - viewport.y) / viewport.h);
  const bx = clamp((b.x - viewport.x) / viewport.w);
  const by = clamp((b.y - viewport.y) / viewport.h);
  return {
    x: camera.x + Math.min(ax, bx) * camera.w,
    y: camera.y + Math.min(ay, by) * camera.h,
    w: Math.abs(bx - ax) * camera.w,
    h: Math.abs(by - ay) * camera.h,
  };
}

// ------------------------------------------------------------------ history & maximize

export type Visit = { id: string; leaves: string[] };
export type MaximizeSession = { id: string; returnPath: string[] } | null;

/** A new visit after going back replaces forward history; repeats are not duplicated. */
export function recordVisit(
  visits: Visit[],
  index: number,
  visit: Visit,
): { visits: Visit[]; index: number } {
  const previous = visits[index];
  if (previous && previous.id === visit.id && previous.leaves.join("|") === visit.leaves.join("|"))
    return { visits, index };
  const next = [...visits.slice(0, index + 1), visit];
  return { visits: next, index: next.length - 1 };
}

/** Saved framings follow surviving views; with none left, the framing is unavailable. */
export function savedFrameDestination(root: LayoutNode | null, leaves: string[]): string | null {
  const entries = layoutRects(root);
  const surviving = leaves.filter((id) => entries.has(id));
  return surviving.length ? frameLeaves(root, surviving) : null;
}

/** Maximize remembers the exact prior level, then its surviving ancestors. */
export function maximizeTransition(
  entries: Map<string, SpaceEntry>,
  rootId: string,
  focused: string,
  id: string,
  session: MaximizeSession,
): { destination: string; session: MaximizeSession } {
  if (focused === id) {
    const destination =
      session?.id === id
        ? (session.returnPath.find((key) => key !== id && entries.has(key)) ?? rootId)
        : (navParent(entries, id) ?? rootId);
    return { destination, session: null };
  }
  const returnPath: string[] = [];
  let at: string | null = focused;
  while (at) {
    returnPath.push(at);
    at = entries.get(at)?.parent ?? null;
  }
  return { destination: id, session: { id, returnPath } };
}

// ------------------------------------------------------------------ docking

export type SplitSeam = { axis: Axis; leaves: string[]; before: string[] };
export type DockTargetSpec =
  | { id: string; edge: Edge; seam?: undefined }
  | { id: string; edge: Edge; seam: SplitSeam; boundary?: number };

/** Nearest edge within a 28% band of the rect, else null. */
export function dropEdge(point: { x: number; y: number }, rect: Rect): Edge | null {
  if (rect.w <= 0 || rect.h <= 0) return null;
  const x = (point.x - rect.x) / rect.w;
  const y = (point.y - rect.y) / rect.h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  const edges: [Edge, number][] = [
    ["left", x],
    ["right", 1 - x],
    ["top", y],
    ["bottom", 1 - y],
  ];
  edges.sort((a, b) => a[1] - b[1]);
  return edges[0][1] <= 0.28 ? edges[0][0] : null;
}

/** The incoming slot, the remaining space, and the collapsed slot a preview animates from. */
export function dropRects(rect: Rect, edge: Edge): { slot: Rect; remaining: Rect; collapsed: Rect } {
  const slot = { ...rect };
  const remaining = { ...rect };
  const collapsed = { ...rect };
  if (edge === "left" || edge === "right") {
    slot.w = remaining.w = rect.w / 2;
    collapsed.w = 0;
    if (edge === "left") remaining.x += slot.w;
    else {
      slot.x += slot.w;
      collapsed.x += rect.w;
    }
  } else {
    slot.h = remaining.h = rect.h / 2;
    collapsed.h = 0;
    if (edge === "top") remaining.y += slot.h;
    else {
      slot.y += slot.h;
      collapsed.y += rect.h;
    }
  }
  return { slot, remaining, collapsed };
}

/** One canonical target for both sides of an aligned boundary and its seam. */
export function seamTarget(group: SplitNode, boundary: number): DockTargetSpec {
  return {
    id: group.id,
    edge: group.axis === "x" ? "left" : "top",
    boundary,
    seam: {
      axis: group.axis,
      leaves: leafIds(group),
      before: group.children.slice(0, boundary).flatMap(leafIds),
    },
  };
}

/** An edge of a view whose parent runs along the same axis inserts at that seam instead. */
export function tileDropTarget(entries: Map<string, Entry>, id: string, edge: Edge): DockTargetSpec {
  const entry = entries.get(id);
  const parent = entry?.parent ? entries.get(entry.parent)?.node : null;
  if (parent?.kind === "split" && parent.axis === edgeAxis(edge)) {
    const index = parent.children.findIndex((child) => child.id === id);
    return seamTarget(parent, index + (edge === "right" || edge === "bottom" ? 1 : 0));
  }
  return { id, edge };
}

/** The frame perimeter (in screen px of the viewport) inserts before or after the whole group. */
export function frameDropTarget(
  group: LayoutNode,
  point: { x: number; y: number },
  width: number,
  height: number,
  radius: number,
): DockTargetSpec | null {
  if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) return null;
  const distances: [Edge, number][] = [
    ["left", point.x],
    ["right", width - point.x],
    ["top", point.y],
    ["bottom", height - point.y],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  const [edge, distance] = distances[0];
  if (distance > radius) return null;
  const axis = edgeAxis(edge);
  const after = edge === "right" || edge === "bottom";
  const inner = group.kind === "stage" && group.child ? group.child : group;
  if (inner.kind === "split" && inner.axis === axis)
    return seamTarget(inner, after ? inner.children.length : 0);
  return {
    id: group.id,
    edge,
    seam: { axis, leaves: leafIds(group), before: after ? leafIds(group) : [] },
  };
}

/** Insert at a seam, resolving the group by its surviving leaves (removing the source may
 * have promoted it). The newcomer takes an equal 1/(n+1) share of an aligned group. */
export function insertAtSeam(
  root: LayoutNode,
  seam: SplitSeam,
  incoming: LayoutNode,
  splitId: string,
): LayoutNode {
  const surviving = new Set(leafIds(root).filter((id) => seam.leaves.includes(id)));
  if (!surviving.size) return root;
  const insert = (node: LayoutNode): LayoutNode => {
    if (node.kind === "stage" && node.child) {
      const ids = new Set(leafIds(node.child));
      if ([...surviving].every((id) => ids.has(id)) && !surviving.has(node.id))
        return { ...node, child: insert(node.child) as SplitNode | PanelNode };
    }
    if (node.kind === "split") {
      const container = node.children.findIndex((child) => {
        const ids = new Set(leafIds(child));
        return [...surviving].every((id) => ids.has(id));
      });
      if (container >= 0)
        return {
          ...node,
          children: node.children.map((child, i) => (i === container ? insert(child) : child)),
        };
      if (node.axis === seam.axis) {
        const index = node.children.findIndex((child) =>
          leafIds(child).some((id) => !seam.before.includes(id)),
        );
        const children = [...node.children];
        const total = sum(node.weights);
        const share = 1 / (children.length + 1);
        const weights = node.weights.map((w) => (w / total) * (1 - share));
        children.splice(index < 0 ? children.length : index, 0, incoming);
        weights.splice(index < 0 ? node.children.length : index, 0, share);
        return { ...node, children, weights };
      }
    }
    const before = ![...surviving].some((id) => seam.before.includes(id));
    const edge: Edge = seam.axis === "x" ? (before ? "left" : "right") : before ? "top" : "bottom";
    return insertBeside(node, node.id, incoming, edge, splitId);
  };
  return normalize(insert(root)) ?? root;
}

/** Apply a dock target (edge or seam) to a tree. */
export function applyDockTarget(
  root: LayoutNode | null,
  target: DockTargetSpec,
  incoming: LayoutNode,
  splitId: string,
): LayoutNode {
  if (!root) return incoming;
  if (target.seam) return insertAtSeam(root, target.seam, incoming, splitId);
  return insertBeside(root, target.id, incoming, target.edge, splitId);
}

export { edgeBefore, UNIT };
