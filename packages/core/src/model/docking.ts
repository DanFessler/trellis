import type { Edge, Rect } from "./types";

export type Region = "stage" | "side" | "floating";

export type DropTarget =
  | { kind: "tab"; panel: string; index: number; region: Region; preview: Rect; marker: Rect | null }
  | { kind: "split"; beside: string; edge: Edge; region: Region; preview: Rect }
  | { kind: "stage"; stage: string; preview: Rect }
  | { kind: "float" };

export interface PanelBox {
  id: string;
  rect: Rect;
  tabbar: Rect;
  /** Screen rects of each tab, in order. The dragged view is excluded. */
  tabs: Rect[];
  region: Region;
  floating: boolean;
  z: number;
}
export interface HitScene {
  viewport: Rect;
  rootId: string | null;
  stage: { id: string; rect: Rect; empty: boolean } | null;
  panels: PanelBox[];
  /** Region a drop may use for the dragged content. */
  allowed(region: Region): boolean;
  /** The panel being dragged (never a target of itself). */
  source?: string;
  perimeter?: number;
}

export const EDGE_BAND = 0.28;

function inside(p: { x: number; y: number }, r: Rect) {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
}

/** Nearest edge within `band` (a fraction of the rect), else null. */
export function nearestEdge(
  p: { x: number; y: number },
  r: Rect,
  band = EDGE_BAND,
): Edge | null {
  if (r.w <= 0 || r.h <= 0) return null;
  const x = (p.x - r.x) / r.w;
  const y = (p.y - r.y) / r.h;
  const edges: [Edge, number][] = [
    ["left", x],
    ["right", 1 - x],
    ["top", y],
    ["bottom", 1 - y],
  ];
  edges.sort((a, b) => a[1] - b[1]);
  return edges[0][1] <= band ? edges[0][0] : null;
}

/** The half of `r` a panel dropped at `edge` will occupy. */
export function edgeSlot(r: Rect, edge: Edge, share = 0.5): Rect {
  switch (edge) {
    case "left":
      return { ...r, w: r.w * share };
    case "right":
      return { ...r, x: r.x + r.w * (1 - share), w: r.w * share };
    case "top":
      return { ...r, h: r.h * share };
    case "bottom":
      return { ...r, y: r.y + r.h * (1 - share), h: r.h * share };
  }
}

export function tabIndexAt(x: number, tabs: Rect[]): number {
  for (let i = 0; i < tabs.length; i++)
    if (x < tabs[i].x + tabs[i].w / 2) return i;
  return tabs.length;
}

function tabTarget(panel: PanelBox, p: { x: number; y: number }, append: boolean): DropTarget {
  const index = append ? panel.tabs.length : tabIndexAt(p.x, panel.tabs);
  const at = panel.tabs[index];
  const last = panel.tabs[panel.tabs.length - 1];
  const markerX = at ? at.x : last ? last.x + last.w : panel.tabbar.x + 8;
  return {
    kind: "tab",
    panel: panel.id,
    index,
    region: panel.region,
    preview: panel.rect,
    marker: { x: markerX - 1, y: panel.tabbar.y + 6, w: 2, h: panel.tabbar.h - 12 },
  };
}

/** Resolve what dropping at `p` would do. Stable: depends only on the scene. */
export function hitTest(scene: HitScene, p: { x: number; y: number }): DropTarget | null {
  const floatTarget: DropTarget | null = scene.allowed("floating") ? { kind: "float" } : null;
  if (!inside(p, scene.viewport)) return floatTarget;

  const floats = scene.panels
    .filter((b) => b.floating && b.id !== scene.source)
    .sort((a, b) => b.z - a.z);
  for (const box of floats) {
    if (!inside(p, box.rect)) continue;
    if (!scene.allowed("floating")) return null;
    return tabTarget(box, p, !inside(p, box.tabbar));
  }

  // The workspace perimeter docks beside everything. Tab bars sit along the top edge,
  // so they win there and the top band is thinner.
  const perimeter = scene.perimeter ?? 18;
  const overTabbar = scene.panels.some((b) => !b.floating && b.id !== scene.source && inside(p, b.tabbar));
  if (scene.rootId && scene.allowed("side") && !overTabbar) {
    const v = scene.viewport;
    const distances: [Edge, number][] = [
      ["left", p.x - v.x],
      ["right", v.x + v.w - p.x],
      ["top", (p.y - v.y) * 2],
      ["bottom", v.y + v.h - p.y],
    ];
    distances.sort((a, b) => a[1] - b[1]);
    if (distances[0][1] <= perimeter) {
      const edge = distances[0][0];
      return {
        kind: "split",
        beside: scene.rootId,
        edge,
        region: "side",
        preview: edgeSlot(v, edge, 0.25),
      };
    }
  }

  const stage = scene.stage;
  if (stage && !stage.empty && !overTabbar && inside(p, stage.rect) && scene.allowed("side") && scene.rootId !== stage.id) {
    // A thin band just inside the stage's boundary docks beside the whole stage.
    const band = Math.min(16, stage.rect.w * 0.08, stage.rect.h * 0.08);
    const s = stage.rect;
    const distances: [Edge, number][] = [
      ["left", p.x - s.x],
      ["right", s.x + s.w - p.x],
      ["top", p.y - s.y],
      ["bottom", s.y + s.h - p.y],
    ];
    distances.sort((a, b) => a[1] - b[1]);
    const [edge, distance] = distances[0];
    if (distance <= band)
      return { kind: "split", beside: stage.id, edge, region: "side", preview: edgeSlot(s, edge, 0.3) };
  }

  for (const box of scene.panels) {
    if (box.floating || box.id === scene.source || !inside(p, box.rect)) continue;
    if (!scene.allowed(box.region)) return null;
    if (inside(p, box.tabbar)) return tabTarget(box, p, false);
    const body: Rect = {
      x: box.rect.x,
      y: box.tabbar.y + box.tabbar.h,
      w: box.rect.w,
      h: box.rect.y + box.rect.h - (box.tabbar.y + box.tabbar.h),
    };
    const edge = nearestEdge(p, body);
    if (edge)
      return {
        kind: "split",
        beside: box.id,
        edge,
        region: box.region,
        preview: edgeSlot(box.rect, edge),
      };
    return tabTarget(box, p, true);
  }

  if (stage && stage.empty && inside(p, stage.rect)) {
    const edge = scene.rootId !== stage.id ? nearestEdge(p, stage.rect, 0.2) : null;
    if (edge && scene.allowed("side"))
      return { kind: "split", beside: stage.id, edge, region: "side", preview: edgeSlot(stage.rect, edge, 0.3) };
    if (scene.allowed("stage"))
      return { kind: "stage", stage: stage.id, preview: stage.rect };
    return null;
  }
  return floatTarget;
}
