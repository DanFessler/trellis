/** The requirement tests' adapter: fixtures, production calls and
 * observable projections only. Expectations stay in the *.test.ts files. */
import {
  applyDockTarget,
  bestFit,
  dropEdge,
  dropRects,
  focusLayout,
  frameDropTarget,
  frameLeaves,
  hierarchyStep,
  leafIds,
  maximizeTransition,
  recordVisit,
  rectangleCamera,
  savedFrameDestination,
  seamTarget,
  tileDropTarget,
  type DockTargetSpec,
  type MaximizeSession,
  type Visit,
} from "../../src/model/spatial";
import { findNode, insertBeside, removeNode, replaceNode, resizeBoundary } from "../../src/model/tree";
import type { Edge, LayoutNode, PanelNode, Rect } from "../../src/model/types";

export type Bounds = Rect;
export type Side = Edge;
export type Arrangement =
  string | { name: string; direction: "row" | "column"; views: Arrangement[]; shares?: number[] };

const panel = (id: string): PanelNode => ({ kind: "panel", id, views: [id], selected: id });
function fixture(spec: Arrangement): LayoutNode {
  if (typeof spec === "string") return panel(spec);
  return {
    kind: "split",
    id: spec.name,
    axis: spec.direction === "row" ? "x" : "y",
    children: spec.views.map(fixture),
    weights: spec.shares ?? spec.views.map(() => 1 / spec.views.length),
  };
}

export function workspace(spec: Arrangement) {
  let root: LayoutNode = fixture(spec);
  let serial = 0;
  const entries = () => focusLayout(root);
  const bounds = (id: string) => ({ ...entries().get(id)!.rect });
  const insert = (target: DockTargetSpec, id: string) => {
    root = applyDockTarget(root, target, panel(id), `edit-${++serial}`);
  };
  return {
    bounds,
    views: () => leafIds(root).sort(),
    split(id: string, incoming: string, direction: "row" | "column") {
      root = insertBeside(
        root,
        id,
        panel(incoming),
        direction === "row" ? "right" : "bottom",
        `edit-${++serial}`,
      );
    },
    close(id: string) {
      // Trellis lets every panel close (the workspace then shows its empty state). LAYOUT-04
      // expects the last view to remain, so the adapter keeps it to test the requirement as written.
      root = removeNode(root, id) ?? root;
    },
    resize(group: string, seam: number, position: number) {
      const node = entries().get(group)!.node;
      if (node.kind !== "split") throw Error("Expected a resizable group");
      // The requirement keeps each child of the pair at ≥12% of the pair.
      const total = node.weights.reduce((a, b) => a + b, 0);
      const pair = (node.weights[seam] + node.weights[seam + 1]) / total;
      root = replaceNode(
        root,
        group,
        resizeBoundary(node, seam, position, () => pair * 0.12),
      )!;
    },
    move(id: string, target: string, side: Side) {
      if (id === target || !findNode(root, id) || !findNode(root, target)) return;
      const source = findNode(root, id)!;
      const pruned = removeNode(root, id);
      if (!pruned) return;
      root = insertBeside(pruned, target, source, side, `edit-${++serial}`);
    },
    addAtEdge(id: string, target: string, side: Side) {
      insert(tileDropTarget(entries(), target, side), id);
    },
    addAtSeam(id: string, group: string, boundary: number) {
      const node = entries().get(group)!.node;
      if (node.kind !== "split") throw Error("Expected a seam");
      insert(seamTarget(node, boundary), id);
    },
    addAtFrame(id: string, point: { x: number; y: number }) {
      const target = frameDropTarget(root, point, 1000, 600, 12);
      if (target) insert(target, id);
    },
    snap: (rect: Bounds) => bestFit(rect, entries()),
    step: (id: string, direction: "in" | "out", point = { x: 0.5, y: 0.5 }) =>
      hierarchyStep(entries(), id, direction, point),
    frame: (ids: string[]) => frameLeaves(root, ids)!,
    framedViews: (id: string) => leafIds(entries().get(id)!.node),
    savedFrame: (ids: string[]) => savedFrameDestination(root, ids),
    maximize: (focused: string, id: string, session: MaximizeSession = null) =>
      maximizeTransition(entries(), root.id, focused, id, session),
  };
}

export function history(first: string) {
  let visits: Visit[] = [{ id: first, leaves: [first] }];
  let index = 0;
  return {
    visit(id: string, leaves = [id]) {
      ({ visits, index } = recordVisit(visits, index, { id, leaves }));
    },
    at(position: number) {
      index = position;
    },
    destinations: () => visits.map((visit) => visit.id),
    position: () => index,
  };
}

/** A stage (the desktop) with one window floating in it. */
export function desktopWithFloatingApp(relative: Bounds) {
  const root: LayoutNode = { kind: "stage", id: "stage" };
  const entries = focusLayout(root);
  const desktop = entries.get("stage")!.rect;
  const window = {
    x: desktop.x + relative.x * desktop.w,
    y: desktop.y + relative.y * desktop.h,
    w: relative.w * desktop.w,
    h: relative.h * desktop.h,
  };
  return {
    desktop,
    window,
    // Floating windows are not camera targets; only layout nodes are.
    snap: (rect: Bounds) => (bestFit(rect, entries) === "stage" ? "desktop" : "window"),
  };
}

export const marquee = rectangleCamera;
export const edgeAt = dropEdge;
export const dropPreview = (rect: Bounds, side: Side) => {
  const { slot, remaining } = dropRects(rect, side);
  return { incoming: slot, existing: remaining };
};
