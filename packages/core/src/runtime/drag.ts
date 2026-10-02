/**
 * Window and tab dragging.
 *
 * The source stays in place at pickup. The lifted window keeps its size over its origin and eases
 * to a compact card as it leaves (280 ms). Drop targets settle for 150 ms and preview as a real
 * reflow of the layout. The source collapses on the first target and never reopens. Seams and the
 * frame band are targets, and release commits the current candidate.
 *
 * Tab-bar drops insert at an index. Allow rules remove targets. Overlay floats treat the whole
 * workspace as their desktop, and the stage is the desktop only when floats live in it.
 */
import {
  insertPanel,
  floatPanel,
  removePanel,
  detachView,
  reorderTabs,
  selectView,
  uid,
} from "../model/document";
import {
  applyDockTarget,
  containsNode,
  dropEdge,
  dropRects,
  frameDropTarget,
  leafIds,
  seamTarget,
  tileDropTarget,
  type DockTargetSpec,
} from "../model/spatial";
import { findNode, findStage, layoutRects, type Entry, type LayoutMetrics } from "../model/tree";
import type { Edge, FloatingLayer, LayoutDocument, LayoutNode, PanelNode, Rect } from "../model/types";
import type { Lifetime } from "./lifetime";
import type { LayoutTween } from "./motion";

export const DROP_SLOT = "__trellis-drop-slot";
export const SOURCE_SLOT = "__trellis-source-slot";
const THRESHOLD = 6;
const SETTLE_MS = 150;
const PICKUP_MS = 280;
const COMPACT = { w: 380, h: 260 };
const DESKTOP_SPLIT_MAX_PX = 64;
const MIN_SEAM_HIT_WIDTH = 8;
/** Overlay floats pass over panels freely; only this much of a panel's edge docks them. */
const OVERLAY_EDGE_BAND = 0.14;

export type Region = "stage" | "side" | "floating";
export type DropTarget =
  | { kind: "dock"; spec: DockTargetSpec }
  | { kind: "tab"; panel: string; index?: number }
  | { kind: "stage"; stage: string }
  | { kind: "float" };

export interface DragHost {
  root: HTMLElement;
  lifetime: Lifetime;
  tween: LayoutTween;
  lastRects: Map<string, Rect>;
  reduced(): boolean;
  doc(): LayoutDocument;
  /** Replace the document without committing (no change event, no history). */
  setDoc(doc: LayoutDocument): void;
  commit(next: LayoutDocument, from: Map<string, Rect>, settle: string | null): void;
  render(): void;
  schedule(): void;
  busy(active: boolean): void;
  closeMenus(): void;
  camera(): Rect;
  viewport(): { w: number; h: number };
  inset(): number;
  tabbarHeight(panel: PanelNode): number;
  toScreen(world: Rect): Rect;
  fromScreen(p: { x: number; y: number }): { x: number; y: number };
  /** Right to left: tabs run leftward and floating rects are measured from the right. */
  rtl(): boolean;
  /** Whether users may turn a docked panel into a floating window, or back. */
  canFloat(): boolean;
  /** Screen rect of a docked node, inset by the gap. */
  panelScreen(world: Rect): Rect;
  /** Inverse of panelScreen. */
  fromScreenRect(screen: Rect | undefined | null): Rect | null;
  floatWorld(panelId: string): Rect | null;
  floatingLayer(): FloatingLayer | false;
  panelDom(
    id: string,
  ): { tabbar: HTMLElement; tablist: HTMLElement; tabs: Map<string, { el: HTMLElement }> } | undefined;
  frameOnly(panelId: string): boolean;
  /** Pixel minimums for laying a tree out, matching what's on screen. */
  layoutMetrics(): LayoutMetrics;
  /** The collapsed group standing in for a panel, if it's too small on screen to show. */
  collapsedGroupOf(panelId: string): string | null;
  /** Whether a split sits inside a collapsed group (or is one). */
  collapsedSplit(splitId: string): boolean;
  allowed(viewIds: string[], region: Region): boolean;
  /** The framed node (possibly a virtual sibling range), for the frame band. */
  framedNode(): LayoutNode | null;
  /** The content minimum a lifted window grows to over the desktop. */
  minSize(viewIds: string[]): { w: number; h: number };
  /** Called after a move commits, to adjust framing and focus. */
  moved(panel: PanelNode, from: "docked" | "floating", to: DropTarget["kind"] | null): void;
  announce(text: string): void;
}

interface TabSort {
  row: DOMRect;
  items: { id: string; el: HTMLElement; x: number; width: number }[];
  order: string[];
  grab: number;
  started: boolean;
}
export interface DragSession {
  pointerId: number;
  start: { x: number; y: number };
  active: boolean;
  origin: LayoutDocument;
  /** The panel following the pointer (a new one after a tab detaches). */
  lifted: PanelNode;
  /** The lifted panel is part of the document (a whole-panel drag). */
  inDoc: boolean;
  pendingTab: string | null;
  tabSort: TabSort | null;
  excludedHost: string | null;
  tabOrigin: Rect | null;
  tabRollback: boolean;
  fromFloat: FloatingLayer | null;
  fromFrame: boolean;
  /** World rects at pickup (docked nodes) and the lifted window's screen rect. */
  base: Map<string, Rect>;
  sourceScreen: Rect;
  /** The document hit testing and previews use; the source is removed once it collapses. */
  pdoc: LayoutDocument;
  dropBase: Map<string, Entry>;
  collapsed: boolean;
  layoutTargets: Map<string, Rect>;
  floating: Rect;
  pickupAt: number;
  compactFrom: number;
  compactTo: number;
  compactAmount: number;
  desktopAmount: number;
  sizeTick: number;
  pointer: { x: number; y: number };
  grabX: number;
  grabY: number;
  target: DropTarget | null;
  candidate: DropTarget | null;
  targetTimer: ReturnType<typeof setTimeout> | undefined;
  dropLabel: string;
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "tab" && b.kind === "tab") return a.panel === b.panel && a.index === b.index;
  if (a.kind === "stage" && b.kind === "stage") return a.stage === b.stage;
  if (a.kind === "dock" && b.kind === "dock")
    return (
      a.spec.id === b.spec.id &&
      a.spec.edge === b.spec.edge &&
      (a.spec.seam ? `${a.spec.seam.axis}|${a.spec.seam.before.join()}|${a.spec.seam.leaves.join()}` : "") ===
        (b.spec.seam ? `${b.spec.seam.axis}|${b.spec.seam.before.join()}|${b.spec.seam.leaves.join()}` : "")
    );
  return true;
}
const inside = (p: { x: number; y: number }, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export function createDragController(host: DragHost) {
  let session: DragSession | null = null;
  let pickupFrame = 0;
  let cleanup: (() => void) | null = null;
  let suppressClickUntil = 0;

  const local = (e: { clientX: number; clientY: number }) => {
    const b = host.root.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  /** Start tracking a press on a tab (`viewId`) or on a panel's bar/frame (`viewId` null). */
  function begin(e: PointerEvent, panel: PanelNode, viewId: string | null) {
    if (session || e.button !== 0 || e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const doc = host.doc();
    const float = doc.floating.find((f) => f.panel.id === panel.id);
    const tab = viewId && panel.views.length > 1 ? viewId : null;
    const screen = host.lastRects.get(panel.id) ?? { x: 0, y: 0, w: 0, h: 0 };
    const p = local(e);
    session = {
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      active: false,
      origin: doc,
      lifted: panel,
      inDoc: true,
      pendingTab: tab,
      tabSort: null,
      excludedHost: null,
      tabOrigin: null,
      tabRollback: false,
      fromFloat: float ? float.layer : null,
      fromFrame: host.frameOnly(panel.id),
      base: new Map(),
      sourceScreen: { ...screen },
      pdoc: doc,
      dropBase: new Map(),
      collapsed: false,
      layoutTargets: new Map(),
      floating: { ...screen },
      pickupAt: 0,
      compactFrom: 0,
      compactTo: 0,
      compactAmount: 0,
      desktopAmount: 0,
      sizeTick: performance.now(),
      pointer: p,
      grabX: screen.w ? (p.x - screen.x) / screen.w : 0.5,
      grabY: p.y - screen.y,
      target: null,
      candidate: null,
      targetTimer: undefined,
      dropLabel: "",
    };
    if (tab) {
      const dom = host.panelDom(panel.id);
      if (dom) {
        const items = panel.views
          .map((id) => ({ id, el: dom.tabs.get(id)?.el }))
          .filter((x): x is { id: string; el: HTMLElement } => !!x.el)
          .map(({ id, el }) => {
            const r = el.getBoundingClientRect();
            return { id, el, x: r.left, width: r.width };
          });
        const grabbed = items.find((item) => item.id === tab);
        session.tabSort = {
          row: dom.tabbar.getBoundingClientRect(),
          items,
          order: items.map((item) => item.id),
          grab: grabbed ? e.clientX - grabbed.x : 0,
          started: false,
        };
      }
    }
    const controller = new AbortController();
    const signal = controller.signal;
    const onMove = (ev: PointerEvent) => {
      if (session && ev.pointerId === session.pointerId) move(ev);
    };
    const onUp = (ev: PointerEvent) => {
      if (!session || ev.pointerId !== session.pointerId) return;
      move(ev);
      end(true);
    };
    const onCancel = (ev: PointerEvent) => {
      if (session && ev.pointerId === session.pointerId) end(false);
    };
    window.addEventListener("pointermove", onMove, { signal });
    window.addEventListener("pointerup", onUp, { signal });
    window.addEventListener("pointercancel", onCancel, { signal });
    window.addEventListener("blur", () => end(false), { signal });
    window.addEventListener(
      "keydown",
      (ev) => {
        if (ev.key === "Escape" && session) {
          ev.preventDefault();
          ev.stopPropagation();
          end(false);
        }
      },
      { signal, capture: true },
    );
    host.lifetime.add(() => controller.abort());
    cleanup = () => controller.abort();
  }

  // ---------------------------------------------------------------- tab sorting (before lift)
  function clearTabSort(d: DragSession) {
    for (const item of d.tabSort?.items ?? []) {
      item.el.style.removeProperty("transform");
      item.el.removeAttribute("data-sorting");
      item.el.removeAttribute("data-dragging");
    }
  }
  function sortTabAtPointer(d: DragSession, e: PointerEvent) {
    const sort = d.tabSort!;
    sort.started = true;
    const dragged = sort.items.find((item) => item.id === d.pendingTab)!;
    const list = host.panelDom(d.lifted.id)?.tablist.getBoundingClientRect() ?? sort.row;
    const left = Math.max(list.left, Math.min(list.right - dragged.width, e.clientX - sort.grab));
    // Tabs run from the start edge: the left, or the right when right to left. `edge` walks the
    // row in reading order, one resting slot at a time.
    const rtl = host.rtl();
    const first = sort.items[0];
    const slot = (edge: number, width: number) => (rtl ? edge - width : edge);
    const step = (edge: number, width: number) => (rtl ? edge - width : edge + width);
    let edge = rtl ? first.x + first.width : first.x;
    let index = 0;
    for (const id of sort.order) {
      const item = sort.items.find((item) => item.id === id)!;
      // Reorder when the pointer crosses a neighbouring tab's resting centre.
      const centre = slot(edge, item.width) + item.width / 2;
      if (id !== dragged.id && (rtl ? e.clientX < centre : e.clientX > centre)) index++;
      edge = step(edge, item.width);
    }
    sort.order = sort.order.filter((id) => id !== dragged.id);
    sort.order.splice(index, 0, dragged.id);
    edge = rtl ? first.x + first.width : first.x;
    for (const id of sort.order) {
      const item = sort.items.find((item) => item.id === id)!;
      item.el.setAttribute("data-sorting", "");
      if (id === dragged.id) item.el.setAttribute("data-dragging", "");
      const x = id === dragged.id ? left : slot(edge, item.width);
      item.el.style.transform = `translateX(${x - item.x}px)`;
      edge = step(edge, item.width);
    }
  }

  // ---------------------------------------------------------------- move
  function move(e: PointerEvent) {
    const d = session!;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < THRESHOLD) return;
      if (d.pendingTab && d.tabSort) {
        const row = d.tabSort.row;
        if (
          e.clientX >= row.left &&
          e.clientX <= row.right &&
          e.clientY >= row.top &&
          e.clientY <= row.bottom
        ) {
          sortTabAtPointer(d, e);
          return;
        }
        clearTabSort(d);
      }
      activate(d);
    }
    d.pointer = local(e);
    retarget(d, e);
    host.schedule();
  }

  function activate(d: DragSession) {
    host.closeMenus();
    // Active before any document change, so a torn-out view stays mounted while it has no panel.
    d.active = true;
    let doc = host.doc();
    if (d.pendingTab) {
      // Tearing a tab out: it becomes its own window at the host's position; cancelling restores.
      const origin = host.lastRects.get(d.lifted.id) ?? d.sourceScreen;
      const hostPanel = d.lifted;
      const order = d.tabSort?.order ?? hostPanel.views;
      doc = reorderTabs(doc, hostPanel.id, order);
      doc = detachView(doc, d.pendingTab);
      d.lifted = { kind: "panel", id: uid("panel"), views: [d.pendingTab], selected: d.pendingTab };
      d.inDoc = false;
      d.excludedHost = hostPanel.id;
      d.tabOrigin = { ...origin };
      d.tabRollback = true;
      d.fromFloat = d.fromFloat ?? "stage";
      d.fromFrame = false;
      d.sourceScreen = { ...origin };
      d.pendingTab = null;
      host.setDoc(doc);
    }
    d.pdoc = doc;
    d.dropBase = layoutRects(doc.root, host.layoutMetrics());
    d.base = new Map([...d.dropBase].map(([id, e]) => [id, { ...e.rect }]));
    d.layoutTargets = restingLayout(d);
    d.pickupAt = performance.now();
    d.floating = { ...d.sourceScreen };
    try {
      host.root.setPointerCapture(d.pointerId);
    } catch {
      /* synthetic pointers can't be captured */
    }
    host.root.setAttribute("data-dragging", "");
    host.busy(true);
    const tick = () => {
      if (session !== d) return;
      host.render();
      pickupFrame = host.lifetime.frame(tick);
    };
    pickupFrame = host.lifetime.frame(tick);
  }

  /** Resolve the target under the pointer (frame band, seams, tab bars, edges, centres), then settle it. */
  function retarget(d: DragSession, e: PointerEvent) {
    const viewport = host.viewport();
    const p = d.pointer;
    const point = host.fromScreen(p);
    const within = p.x >= 0 && p.y >= 0 && p.x <= viewport.w && p.y <= viewport.h;
    const layer = host.floatingLayer();
    const doc = d.pdoc;
    const stage = findStage(doc.root);
    const stageIsDesktop = !!stage && !stage.child && layer === "stage";
    const overlayMove = d.fromFloat === "overlay";
    // A window floating over a filled stage moves like an overlay float while it stays over the
    // stage: its tab bars take tabs, a narrow edge band docks, and anywhere else repositions it.
    const stageWorld = stage?.child ? d.dropBase.get(stage.id)?.rect : undefined;
    // (A torn-out tab is also marked as a stage float, but it wasn't floating: it docks as usual.)
    const stageMove = d.fromFloat === "stage" && !d.tabRollback && !!stageWorld && inside(point, stageWorld);
    const floatMove = overlayMove || stageMove;
    let next: DropTarget | null = null;

    // Overlay floats are on top of everything; their centres take tabs.
    if (within) {
      const overlays = doc.floating
        .filter((f) => f.layer === "overlay" && f.panel.id !== d.lifted.id)
        .sort((a, b) => b.z - a.z);
      for (const f of overlays) {
        const r = host.lastRects.get(f.panel.id);
        if (!r || !inside(p, r)) continue;
        next = tabTarget(f.panel, p, r) ?? (dropEdge(p, r) ? null : { kind: "tab", panel: f.panel.id });
        return settle(d, filter(d, next));
      }
    }

    // Docked views under the pointer (stable pre-preview regions).
    let hovered: string | null = null;
    if (within)
      for (const id of leafIds(doc.root)) {
        if (id === d.lifted.id) continue;
        const r = d.dropBase.get(id)?.rect;
        if (r && inside(point, r)) {
          hovered = id;
          break;
        }
      }
    const hoveredNode = hovered ? findNode(doc.root, hovered) : null;
    // A collapsed group is one tile: views can dock beside it, not into it.
    const collapsed = hovered ? host.collapsedGroupOf(hovered) : null;
    if (collapsed) {
      const rect = d.dropBase.get(collapsed)?.rect;
      const edge = rect ? dropEdge(point, rect) : null;
      next = edge ? { kind: "dock", spec: tileDropTarget(d.dropBase, collapsed, edge) } : null;
    } else if (hovered && hoveredNode?.kind === "panel") {
      const screen = host.panelScreen(d.dropBase.get(hovered)!.rect);
      const bar = tabTarget(hoveredNode, p, screen);
      if (bar) next = bar;
      else {
        const edge = floatMove ? overlayEdge(p, screen) : dropEdge(point, d.dropBase.get(hovered)!.rect);
        next = edge
          ? { kind: "dock", spec: tileDropTarget(d.dropBase, hovered, edge) }
          : floatMove
            ? { kind: "float" }
            : { kind: "tab", panel: hovered };
      }
    }

    // Visible seam gaps override overlapping tile-edge targets; the nearest seam wins.
    const radius = Math.max(host.inset(), MIN_SEAM_HIT_WIDTH / 2);
    let closest = radius;
    if (within)
      for (const [id, entry] of d.dropBase) {
        const node = entry.node;
        if (node.kind !== "split" || host.collapsedSplit(node.id)) continue;
        const group = host.toScreen(entry.rect);
        if (!inside(p, group)) continue;
        node.children.slice(1).forEach((child, index) => {
          const r = host.toScreen(d.dropBase.get(child.id)!.rect);
          const distance = Math.abs(node.axis === "x" ? p.x - r.x : p.y - r.y);
          if (distance >= closest) return;
          if (!leafIds(node).some((leaf) => leaf !== d.lifted.id)) return;
          closest = distance;
          next = { kind: "dock", spec: seamTarget(node, index + 1) };
        });
        void id;
      }

    // An empty stage is the desktop: its edges dock beside it, its interior floats (or takes the view).
    if (within && stage && !stage.child && closest === radius) {
      const world = d.dropBase.get(stage.id)?.rect;
      if (world && inside(point, world)) {
        const s = host.panelScreen(world);
        const distances: [Edge, number][] = [
          ["left", p.x - s.x],
          ["right", s.x + s.w - p.x],
          ["top", p.y - s.y],
          ["bottom", s.y + s.h - p.y],
        ];
        distances.sort((a, b) => a[1] - b[1]);
        const dimension = distances[0][0] === "left" || distances[0][0] === "right" ? s.w : s.h;
        const nearEdge = distances[0][1] <= Math.min(DESKTOP_SPLIT_MAX_PX, dimension * 0.28);
        next = nearEdge
          ? { kind: "dock", spec: tileDropTarget(d.dropBase, stage.id, distances[0][0]) }
          : stageIsDesktop
            ? { kind: "float" }
            : { kind: "stage", stage: stage.id };
      }
    }

    // Over the desktop, a floating window's interior takes the view as a tab.
    if (next?.kind === "float" && stageIsDesktop)
      for (const f of [...doc.floating].filter((f) => f.layer === "stage").sort((a, b) => b.z - a.z)) {
        if (f.panel.id === d.lifted.id) continue;
        const r = host.floatWorld(f.panel.id);
        if (!r || !inside(point, r)) continue;
        const screen = host.lastRects.get(f.panel.id);
        next =
          (screen && tabTarget(f.panel, p, screen)) ??
          (dropEdge(point, r) ? next : { kind: "tab", panel: f.panel.id });
        break;
      }

    // The outer frame band inserts around the framed group and takes precedence over everything.
    const group = host.framedNode() ?? doc.root;
    if (group) {
      const frame = frameDropTarget(
        group,
        p,
        viewport.w,
        viewport.h,
        Math.max(host.inset() * 2, MIN_SEAM_HIT_WIDTH),
      );
      if (frame && leafIds(group).some((id) => id !== d.lifted.id)) next = { kind: "dock", spec: frame };
    }

    // A torn-out tab can't regroup with its own host; a floating host falls through to the desktop.
    if (next?.kind === "tab" && next.panel === d.excludedHost) {
      const hostFloat = doc.floating.find((f) => f.panel.id === d.excludedHost);
      next = hostFloat && hostFloat.layer === "stage" ? { kind: "float" } : null;
    }
    // Moving an overlay float over empty space, or a stage float over the stage, keeps it floating.
    if (!next && within && (overlayMove || stageMove)) next = { kind: "float" };
    settle(d, filter(d, next));
    void e;
  }

  /** Tab-bar drops insert at an index (Trellis addition). */
  function tabTarget(panel: PanelNode, p: { x: number; y: number }, screen: Rect): DropTarget | null {
    const bar = host.tabbarHeight(panel);
    if (!bar || !(p.x >= screen.x && p.x <= screen.x + screen.w && p.y >= screen.y && p.y <= screen.y + bar))
      return null;
    const dom = host.panelDom(panel.id);
    const rootBox = host.root.getBoundingClientRect();
    let index = panel.views.length;
    if (dom)
      for (let i = 0; i < panel.views.length; i++) {
        const el = dom.tabs.get(panel.views[i])?.el;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const centre = r.left - rootBox.left + r.width / 2;
        // Before this tab in reading order: left of its centre, or right of it right to left.
        if (host.rtl() ? p.x > centre : p.x < centre) {
          index = i;
          break;
        }
      }
    return { kind: "tab", panel: panel.id, index };
  }
  function overlayEdge(p: { x: number; y: number }, r: Rect): Edge | null {
    const x = (p.x - r.x) / r.w;
    const y = (p.y - r.y) / r.h;
    const edges: [Edge, number][] = [
      ["left", x],
      ["right", 1 - x],
      ["top", y],
      ["bottom", 1 - y],
    ];
    edges.sort((a, b) => a[1] - b[1]);
    return edges[0][1] <= OVERLAY_EDGE_BAND ? edges[0][0] : null;
  }

  /** Allow rules remove targets; they never reroute a drop. */
  function filter(d: DragSession, next: DropTarget | null): DropTarget | null {
    if (!next) return null;
    const views = d.lifted.views;
    const layer = host.floatingLayer();
    // Moving a floating window, or rearranging docked ones, is one thing; changing which it is
    // takes the float permission.
    if (!host.canFloat() && !!d.fromFloat !== (next.kind === "float")) return null;
    if (next.kind === "float") return layer && host.allowed(views, "floating") ? next : null;
    if (next.kind === "stage") return host.allowed(views, "stage") ? next : null;
    const doc = d.pdoc;
    const stage = findStage(doc.root);
    const inStage = (id: string) => !!stage?.child && id !== stage.id && containsNode(stage.child, id);
    if (next.kind === "tab") {
      const float = doc.floating.find((f) => f.panel.id === next.panel);
      return host.allowed(views, float ? "floating" : inStage(next.panel) ? "stage" : "side") ? next : null;
    }
    const spec = next.spec;
    const region: Region = spec.seam
      ? spec.seam.leaves.length && spec.seam.leaves.every((id) => inStage(id)) && inStage(spec.id)
        ? "stage"
        : "side"
      : inStage(spec.id)
        ? "stage"
        : "side";
    return host.allowed(views, region) ? next : null;
  }

  function settle(d: DragSession, next: DropTarget | null) {
    host.root.setAttribute("data-drop", next ? next.kind : "none");
    if (sameTarget(next, d.candidate)) return;
    d.candidate = next;
    host.lifetime.clearTimeout(d.targetTimer);
    d.targetTimer = undefined;
    if (sameTarget(next, d.target)) return;
    d.targetTimer = host.lifetime.timeout(() => {
      d.targetTimer = undefined;
      if (session !== d) return;
      apply(d, d.candidate);
      host.render();
    }, SETTLE_MS);
  }

  // ---------------------------------------------------------------- previews
  /** A seam slot grows from the seam's current position: the edge of the sibling after it (or
   * before it, at the end), measured where that sibling is on screen now. */
  function seamOrigin(d: DragSession, preview: Map<string, Entry>, slot: Rect): Rect {
    const parentId = preview.get(DROP_SLOT)?.parent;
    const parent = parentId ? preview.get(parentId)?.node : null;
    const collapsedAtCenter =
      parent?.kind === "split" && parent.axis === "y"
        ? { ...slot, y: slot.y + slot.h / 2, h: 0 }
        : { ...slot, x: slot.x + slot.w / 2, w: 0 };
    if (!parent || parent.kind !== "split") return collapsedAtCenter;
    const index = parent.children.findIndex((c) => c.id === DROP_SLOT);
    const after = parent.children[index + 1];
    const before = parent.children[index - 1];
    const neighbour = after ? currentWorld(d, after.id) : before ? currentWorld(d, before.id) : null;
    if (!neighbour) return collapsedAtCenter;
    if (parent.axis === "x") {
      const x = after ? neighbour.x : neighbour.x + neighbour.w;
      return { ...slot, x, w: 0 };
    }
    const y = after ? neighbour.y : neighbour.y + neighbour.h;
    return { ...slot, y, h: 0 };
  }
  function restingLayout(d: DragSession): Map<string, Rect> {
    const rects = new Map(d.base);
    for (const [id, entry] of d.dropBase) rects.set(id, entry.rect);
    if (d.collapsed) rects.set(SOURCE_SLOT, collapsedSource(d));
    else if (d.inDoc && !d.fromFloat && d.base.get(d.lifted.id))
      rects.set(SOURCE_SLOT, d.base.get(d.lifted.id)!);
    return rects;
  }
  function collapsedSource(d: DragSession): Rect {
    const entry = layoutRects(d.origin.root, host.layoutMetrics()).get(d.lifted.id);
    const rect = { ...(d.base.get(d.lifted.id) ?? entry?.rect ?? { x: 0, y: 0, w: 0, h: 0 }) };
    const parent = entry?.parent
      ? layoutRects(d.origin.root, host.layoutMetrics()).get(entry.parent)?.node
      : null;
    if (!parent || parent.kind !== "split") return { ...rect, w: 0 };
    const hasNext = parent.children.findIndex((c) => c.id === d.lifted.id) < parent.children.length - 1;
    if (parent.axis === "x") {
      if (!hasNext) rect.x += rect.w;
      rect.w = 0;
    } else {
      if (!hasNext) rect.y += rect.h;
      rect.h = 0;
    }
    return rect;
  }
  const worldOf = (id: string) => host.fromScreenRect(host.lastRects.get(id));
  /** Where a node is on screen right now (world units): its own rect, or the union of its panels. */
  function currentWorld(d: DragSession, id: string): Rect | null {
    const own = worldOf(id);
    if (own) return own;
    const node = findNode(d.pdoc.root, id);
    const rects = node
      ? leafIds(node)
          .map(worldOf)
          .filter((r): r is Rect => !!r)
      : [];
    if (!rects.length) return d.dropBase.get(id)?.rect ?? null;
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    return {
      x,
      y,
      w: Math.max(...rects.map((r) => r.x + r.w)) - x,
      h: Math.max(...rects.map((r) => r.y + r.h)) - y,
    };
  }

  function apply(d: DragSession, next: DropTarget | null) {
    if (sameTarget(next, d.target)) return;
    const previous = new Map(host.lastRects);
    const parent = layoutRects(d.origin.root, host.layoutMetrics()).get(d.lifted.id)?.parent;
    if (next && d.inDoc && !d.fromFloat && !d.collapsed && parent) {
      // Latch removal on the first target; leaving it never reopens the source.
      d.collapsed = true;
      d.pdoc = removePanel(d.pdoc, d.lifted.id);
      d.dropBase = layoutRects(d.pdoc.root, host.layoutMetrics());
    }
    d.layoutTargets = restingLayout(d);
    d.dropLabel = "";
    const setSlotFrom = (world: Rect) => previous.set(DROP_SLOT, host.panelScreen(world));
    if (next?.kind === "tab") {
      const world = d.dropBase.get(next.panel)?.rect ?? host.floatWorld(next.panel) ?? worldOf(next.panel);
      if (world) {
        d.layoutTargets.set(DROP_SLOT, world);
        setSlotFrom(world);
      } else {
        const screen = host.lastRects.get(next.panel);
        if (screen) {
          d.layoutTargets.set(DROP_SLOT, host.fromScreenRect(screen)!);
          previous.set(DROP_SLOT, screen);
        }
      }
      d.dropLabel = "Add as tab";
    } else if (next?.kind === "stage") {
      const world = d.dropBase.get(next.stage)!.rect;
      d.layoutTargets.set(DROP_SLOT, world);
      setSlotFrom({ ...world, x: world.x + world.w / 2, y: world.y + world.h / 2, w: 0, h: 0 });
    } else if (next?.kind === "dock") {
      const placeholder: PanelNode = {
        kind: "panel",
        id: DROP_SLOT,
        views: [DROP_SLOT],
        selected: DROP_SLOT,
      };
      const spec = next.spec;
      if (spec.seam || !d.dropBase.get(spec.id)) {
        const previewRoot = applyDockTarget(d.pdoc.root, spec, placeholder, "__trellis-seam-preview");
        const preview = layoutRects(previewRoot, host.layoutMetrics());
        for (const [id, entry] of preview) d.layoutTargets.set(id, entry.rect);
        const slot = preview.get(DROP_SLOT)?.rect;
        if (slot) setSlotFrom(seamOrigin(d, preview, slot));
      } else {
        const r = dropRects(d.dropBase.get(spec.id)!.rect, spec.edge);
        d.layoutTargets.set(spec.id, r.remaining);
        d.layoutTargets.set(DROP_SLOT, r.slot);
        // Grow from the target's edge where it is now, even if the target is still moving.
        const current = currentWorld(d, spec.id);
        setSlotFrom(current ? dropRects(current, spec.edge).collapsed : r.collapsed);
      }
    } else if (!next && d.target && d.target.kind !== "float") {
      // Leaving a target for nowhere collapses its slot; moving onto the desktop (a float) just
      // lets it fade where it is, since a desktop drop reserves no slot.
      const slot = previous.get(DROP_SLOT);
      const world = slot ? host.fromScreenRect(slot) : null;
      if (world) {
        const edge = d.target.kind === "dock" ? d.target.spec.edge : "left";
        d.layoutTargets.set(
          DROP_SLOT,
          edge === "left" || edge === "right"
            ? { ...world, x: world.x + world.w / 2, w: 0 }
            : { ...world, y: world.y + world.h / 2, h: 0 },
        );
      }
    }
    if (d.collapsed && !previous.has(SOURCE_SLOT)) {
      const base = d.base.get(d.lifted.id);
      if (base) previous.set(SOURCE_SLOT, host.panelScreen(base));
    }
    d.target = next;
    if (!host.reduced()) host.tween.begin(previous, performance.now());
  }

  // ---------------------------------------------------------------- pickup
  /** The lifted window's screen rect: full size over its origin, a compact card elsewhere. */
  function liftedRect(): Rect {
    const d = session!;
    const original = d.sourceScreen;
    const doc = d.pdoc;
    const stage = findStage(doc.root);
    const desktop =
      stage && !stage.child && host.floatingLayer() === "stage" && d.dropBase.get(stage.id)
        ? host.panelScreen(d.dropBase.get(stage.id)!.rect)
        : null;
    const source = d.collapsed
      ? null
      : (d.tabOrigin ??
        (d.fromFloat && !d.fromFrame
          ? (desktop ?? (d.fromFloat === "overlay" ? fullViewport() : original))
          : original));
    const now = performance.now();
    const amount = host.reduced() ? 1 : 1 - Math.exp(-(now - d.sizeTick) / 60);
    d.sizeTick = now;
    d.desktopAmount += ((desktop && inside(d.pointer, desktop) ? 1 : 0) - d.desktopAmount) * amount;
    const compactTo =
      (source && inside(d.pointer, source)) || (!d.fromFrame && desktop && inside(d.pointer, desktop))
        ? 0
        : 1;
    if (compactTo !== d.compactTo) {
      d.compactFrom = d.compactAmount;
      d.compactTo = compactTo;
      d.pickupAt = now;
    }
    const progress = host.reduced() ? 1 : Math.min(1, (now - d.pickupAt) / PICKUP_MS);
    const eased = 1 - (1 - progress) ** 3;
    d.compactAmount = d.compactFrom + (d.compactTo - d.compactFrom) * eased;
    const targetScale = Math.min(1, COMPACT.w / Math.max(1, original.w), COMPACT.h / Math.max(1, original.h));
    const scale = 1 + (targetScale - 1) * d.compactAmount;
    let w = d.fromFrame ? original.w + (COMPACT.w - original.w) * d.compactAmount : original.w * scale;
    let h = d.fromFrame ? original.h + (COMPACT.h - original.h) * d.compactAmount : original.h * scale;
    const min = host.minSize(d.lifted.views);
    const bar = host.tabbarHeight(d.lifted);
    w += (Math.max(w, min.w + host.inset() * 2) - w) * d.desktopAmount;
    h += (Math.max(h, min.h + bar + host.inset() * 2) - h) * d.desktopAmount;
    const grabY = d.grabY + (Math.min(d.grabY, 18) - d.grabY) * d.compactAmount;
    d.floating = { x: d.pointer.x - w * d.grabX, y: d.pointer.y - grabY, w, h };
    return d.floating;
  }
  const fullViewport = (): Rect => ({ x: 0, y: 0, ...host.viewport() });

  // ---------------------------------------------------------------- end
  function end(commit: boolean) {
    const d = session;
    if (!d) return;
    host.lifetime.clearTimeout(d.targetTimer);
    // Release expresses intent immediately, even before the hover delay expires.
    if (commit && d.active) apply(d, d.candidate);
    host.lifetime.cancelFrame(pickupFrame);
    pickupFrame = 0;
    session = null;
    cleanup?.();
    cleanup = null;
    try {
      if (host.root.hasPointerCapture(d.pointerId)) host.root.releasePointerCapture(d.pointerId);
    } catch {
      /* ignore */
    }
    host.root.removeAttribute("data-dragging");
    host.root.removeAttribute("data-drop");
    if (!d.active) return endPending(d, commit);
    suppressClickUntil = performance.now() + 350;
    host.busy(false);
    const lifted = d.lifted;
    const from = new Map(host.lastRects);
    from.set(lifted.id, { ...d.floating });
    const target = commit ? d.target : null;
    if (!target) {
      // Cancel or no target: restore the original arrangement; the window flies back.
      host.setDoc(d.origin);
      host.commit(d.origin, from, lifted.id);
      return;
    }
    const base = host.doc();
    const without = d.inDoc ? removePanel(base, lifted.id) : base;
    let next: LayoutDocument;
    const layer = host.floatingLayer() || "overlay";
    if (target.kind === "tab")
      next = insertPanel(without, lifted, { into: target.panel, index: target.index });
    else if (target.kind === "stage") next = insertPanel(without, lifted, { into: target.stage });
    else if (target.kind === "dock") {
      const root = applyDockTarget(without.root, target.spec, lifted, uid("split"));
      next = { ...without, root };
    } else {
      const floatLayer: FloatingLayer = d.fromFloat === "overlay" ? "overlay" : layer;
      next = floatPanel(without, lifted, floatRect(d, without, floatLayer), floatLayer);
    }
    const repositioning = target.kind === "float" && !!d.fromFloat && !d.tabRollback;
    host.setDoc(d.origin);
    host.commit(next, from, repositioning || target.kind === "tab" ? null : lifted.id);
    host.moved(lifted, d.fromFloat && !d.tabRollback ? "floating" : "docked", target.kind);
    host.announce("Moved");
  }

  /** Where a window dropped on the desktop lands, in fractions of its layer. */
  function floatRect(d: DragSession, next: LayoutDocument, layer: FloatingLayer): Rect {
    const viewport = host.viewport();
    const container =
      layer === "overlay"
        ? { x: 0, y: 0, w: viewport.w, h: viewport.h }
        : (() => {
            const stage = findStage(next.root);
            const world = stage ? layoutRects(next.root, host.layoutMetrics()).get(stage.id)?.rect : null;
            return host.toScreen(world ?? { x: 0, y: 0, w: 1, h: 1 });
          })();
    const current = d.fromFloat && !d.tabRollback ? host.lastRects.get(d.lifted.id) : null;
    const original = d.fromFrame ? d.floating : (current ?? d.sourceScreen);
    const min = host.minSize(d.lifted.views);
    const bar = host.tabbarHeight(d.lifted);
    let w: number;
    let h: number;
    if (d.fromFloat && !d.fromFrame && !d.tabRollback) {
      w = original.w;
      h = original.h;
    } else {
      w = Math.min(container.w * (2 / 3), original.w);
      h = Math.min(container.h * (2 / 3), original.h);
    }
    // The unscaled content minimum wins over the drop cap.
    w = Math.max(w, min.w + host.inset() * 2);
    h = Math.max(h, min.h + bar + host.inset() * 2);
    const grabY = Math.min(d.grabY, 18 + (d.grabY - 18) * (1 - d.compactAmount));
    const x = d.pointer.x - w * d.grabX;
    const y = d.pointer.y - grabY;
    return {
      // Measured from the layer's start edge (see floatScreen).
      x: host.rtl() ? (container.x + container.w - x - w) / container.w : (x - container.x) / container.w,
      y: (y - container.y) / container.h,
      w: w / container.w,
      h: h / container.h,
    };
  }

  /** A press that never became a drag: a click, or a finished tab sort. */
  function endPending(d: DragSession, commit: boolean) {
    const sort = d.tabSort;
    const positions = new Map(
      sort?.items.map((item) => [item.id, item.el.getBoundingClientRect().left]) ?? [],
    );
    clearTabSort(d);
    if (!commit || !sort?.started || !d.pendingTab) return;
    suppressClickUntil = performance.now() + 350;
    let next = reorderTabs(host.doc(), d.lifted.id, sort.order);
    next = selectView(next, d.pendingTab);
    host.commit(next, new Map(), null);
    if (host.reduced()) return;
    for (const item of sort.items) {
      const before = positions.get(item.id);
      if (before === undefined) continue;
      const after = item.el.getBoundingClientRect().left;
      if (Math.abs(before - after) < 0.5) continue;
      item.el.animate([{ transform: `translateX(${before - after}px)` }, { transform: "translateX(0)" }], {
        duration: 180,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
  }

  return {
    get session() {
      return session;
    },
    get active() {
      return !!session?.active;
    },
    /** Clicks right after a drag or sort are swallowed. */
    get suppressClicks() {
      return performance.now() < suppressClickUntil;
    },
    begin,
    cancel: () => end(false),
    liftedRect,
    /** World rect overrides for docked nodes and the two slots while dragging. */
    layoutTargets: () => (session?.active ? session.layoutTargets : null),
    dropLabel: () => session?.dropLabel ?? "",
  };
}
export type DragController = ReturnType<typeof createDragController>;
