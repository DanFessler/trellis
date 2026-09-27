/**
 * Camera navigation.
 *
 * Frames any node or contiguous sibling range. Supports rubber-banded zoom (up to 1.35× the
 * layout, 30% edge overshoot) that springs to the best fit 180 ms after the gesture;
 * Shift+wheel hierarchy steps; Shift+drag marquee; Alt+drag zoom; touch pinch; Safari gesture
 * events; maximize that restores the exact prior framing; overview that toggles back; history
 * of visits by their views; saved framings that follow surviving views.
 *
 * Gestures run only with `navigation: "free"`; `"focus"` keeps maximize, Escape and
 * history. Floating windows are never camera targets (NAV-12).
 */
import {
  bestFit,
  focusLayout,
  frameLeaves,
  hierarchyStep,
  leafIds,
  maximizeTransition,
  navNode,
  navParent,
  recordVisit,
  rectangleCamera,
  savedFrameDestination,
  type MaximizeSession,
  type SpaceEntry,
  type Visit,
} from "../model/spatial";
import { findStage, UNIT, type LayoutMetrics } from "../model/tree";
import type { Framing, LayoutDocument, LayoutNode, Rect } from "../model/types";
import { uid } from "../model/document";
import { h } from "./dom";
import type { Lifetime } from "./lifetime";
import { sameRect, type RectSpring } from "./motion";

export interface NavigationHost {
  root: HTMLElement;
  lifetime: Lifetime;
  camera: RectSpring;
  doc(): LayoutDocument;
  mode(): false | "focus" | "free";
  reduced(): boolean;
  viewport(): { w: number; h: number };
  /** Pixel minimums for laying the tree out, so the camera sees the same geometry as the screen. */
  layoutMetrics(): LayoutMetrics;
  fromScreen(p: { x: number; y: number }): { x: number; y: number };
  toScreen(world: Rect): Rect;
  panelScreen(world: Rect): Rect;
  /** Pause per-frame content updates while a gesture drives the camera. */
  setGesture(active: boolean): void;
  busy(): boolean;
  /** Whether a wheel over this element should stay with the content. */
  contentOwnsWheel(target: Element, e: WheelEvent): boolean;
  titleOf(node: LayoutNode): string;
  schedule(): void;
  render(): void;
  changed(): void;
}

const MAX_HISTORY = 100;

export function createNavigator(host: NavigationHost) {
  let entries = new Map<string, SpaceEntry>();
  let framed: string | null = null;
  let framedLeaves: string[] = [];
  let visits: Visit[] = [{ id: "", leaves: [] }];
  let visitIndex = 0;
  let session: MaximizeSession = null;
  let overviewReturn: string[] | null = null;
  let framings: Framing[] = [];
  let gesture = false;
  let suppressClickUntil = 0;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;

  const rootId = () => host.doc().root?.id ?? "";
  const on = () => !!host.mode();
  const free = () => host.mode() === "free";

  // ---------------------------------------------------------------- framing
  /** Recompute targets after a layout change; the framing follows its views. */
  function sync() {
    entries = focusLayout(host.doc().root, host.layoutMetrics());
    if (framed && !entries.has(framed)) {
      const surviving = framedLeaves.filter((id) => entries.has(id));
      const next = surviving.length ? frameLeaves(host.doc().root, surviving) : null;
      framed = next && next !== rootId() ? next : null;
      framedLeaves = framed ? leafIds(entries.get(framed)!.node) : [];
    } else if (framed) framedLeaves = leafIds(entries.get(framed)!.node);
    if (session && !entries.has(session.id)) session = null;
    retarget();
  }
  function rectOf(id: string | null): Rect {
    return (id && entries.get(id)?.rect) || UNIT;
  }
  function retarget() {
    const target = rectOf(framed);
    if (!sameRect(host.camera.target, target)) {
      host.camera.target = { ...target };
      if (host.reduced()) host.camera.finish();
      host.schedule();
    }
    host.root.toggleAttribute("data-framed", !!framed);
  }
  /** Frame a node or sibling range. Floats frame the desktop they belong to. */
  function focus(id: string | null, record = true) {
    if (!on()) id = null;
    const doc = host.doc();
    if (id && doc.floating.some((f) => f.panel.id === id)) id = findStage(doc.root)?.id ?? null;
    if (id && !entries.has(id)) id = null;
    if (id) id = navNode(entries, id);
    if (id === rootId()) id = null;
    if (session && session.id !== id) session = null;
    if (record) {
      const visit: Visit = { id: id ?? rootId(), leaves: leafIds(id ? entries.get(id)!.node : doc.root) };
      ({ visits, index: visitIndex } = recordVisit(visits, visitIndex, visit));
      if (visits.length > MAX_HISTORY) {
        visits = visits.slice(-MAX_HISTORY);
        visitIndex = visits.length - 1;
      }
    }
    endGesture();
    const changed = framed !== id;
    framed = id;
    framedLeaves = id ? leafIds(entries.get(id)!.node) : [];
    retarget();
    if (changed) host.changed();
  }
  function endGesture() {
    host.lifetime.clearTimeout(wheelTimer);
    snapEl.removeAttribute("data-visible");
    if (gesture) {
      gesture = false;
      host.setGesture(false);
    }
  }
  /** Maximize a panel, or restore the exact prior framing (NAV-07/08). */
  function toggle(id: string): boolean {
    if (!on()) return false;
    const doc = host.doc();
    if (doc.floating.some((f) => f.panel.id === id)) return false;
    const node = entries.has(id) ? id : null;
    if (!node) return false;
    const next = maximizeTransition(entries, rootId(), framed ?? rootId(), navNode(entries, node), session);
    focus(next.destination);
    session = next.session;
    return true;
  }
  function stepOut() {
    if (!framed) return;
    focus(navParent(entries, framed) ?? null);
  }
  function stepIn(point?: { x: number; y: number }) {
    const p = point ?? host.fromScreen({ x: host.viewport().w / 2, y: host.viewport().h / 2 });
    focus(hierarchyStep(entries, framed ?? rootId(), "in", p));
  }
  function historyGo(direction: -1 | 1) {
    const next = visitIndex + direction;
    if (next < 0 || next >= visits.length) return;
    visitIndex = next;
    session = null;
    const destination = savedFrameDestination(host.doc().root, visits[next].leaves);
    // With none of its views left, a visit falls back to the desktop.
    focus(destination ?? findStage(host.doc().root)?.id ?? null, false);
  }
  /** Overview, and back to the previous framing (NAV-13). */
  function toggleOverview() {
    if (!framed && overviewReturn) {
      const leaves = overviewReturn;
      overviewReturn = null;
      focus(savedFrameDestination(host.doc().root, leaves));
    } else if (framed) {
      overviewReturn = [...framedLeaves];
      focus(null);
    }
  }
  function frame(target: string | string[] | "all" | "stage") {
    if (target === "all") return focus(null);
    if (target === "stage") return focus(findStage(host.doc().root)?.id ?? null);
    const ids = (Array.isArray(target) ? target : [target]).flatMap((id) =>
      entries.has(id) ? leafIds(entries.get(id)!.node) : [panelOf(id)].filter((x): x is string => !!x),
    );
    if (!ids.length) return;
    focus(frameLeaves(host.doc().root, ids));
  }
  function panelOf(viewId: string): string | null {
    const doc = host.doc();
    for (const id of leafIds(doc.root)) {
      const node = entries.get(id)?.node;
      if (node?.kind === "panel" && node.views.includes(viewId)) return id;
    }
    return null;
  }
  /** Keep a newly opened or focused docked view in frame; floats need their desktop in frame. */
  function ensureVisible(panelId: string) {
    if (!framed) return;
    const doc = host.doc();
    const node = entries.get(framed)?.node;
    if (!node) return;
    const float = doc.floating.find((f) => f.panel.id === panelId);
    if (float) {
      if (float.layer === "overlay") return;
      const stage = findStage(doc.root);
      if (stage && leafIds(node).includes(stage.id)) return;
      if (stage && (node.id === stage.id || contains(node, stage.id))) return;
      focus(stage?.id ?? null);
      return;
    }
    if (contains(node, panelId)) return;
    focus(frameLeaves(doc.root, [...framedLeaves, panelId]));
  }
  const contains = (node: LayoutNode, id: string): boolean =>
    node.id === id ||
    (node.kind === "split" && node.children.some((c) => contains(c, id))) ||
    (node.kind === "stage" && !!node.child && contains(node.child, id));

  // ---------------------------------------------------------------- gestures
  const bounds = () => host.root.getBoundingClientRect();
  function zoom(factor: number, clientX: number, clientY: number, panX = 0, panY = 0) {
    if (marquee || !entries.size) return;
    if (!gesture) {
      gesture = true;
      host.setGesture(true);
    }
    host.camera.velocity = { x: 0, y: 0, w: 0, h: 0 };
    const b = bounds();
    const c = host.camera.value;
    const px = (clientX - b.left) / b.width;
    const py = (clientY - b.top) / b.height;
    const min = Math.min(...[...entries.values()].map((e) => Math.min(e.rect.w, e.rect.h))) * 0.65;
    factor = Math.max(min / Math.min(c.w, c.h), Math.min(factor, 1.35 / Math.max(c.w, c.h)));
    const next = {
      x: c.x + c.w * px * (1 - factor) - (panX / b.width) * c.w,
      y: c.y + c.h * py * (1 - factor) - (panY / b.height) * c.h,
      w: c.w * factor,
      h: c.h * factor,
    };
    next.x = Math.max(-next.w * 0.3, Math.min(1 - next.w * 0.7, next.x));
    next.y = Math.max(-next.h * 0.3, Math.min(1 - next.h * 0.7, next.y));
    host.camera.jump(next);
    host.render();
    const candidate = entries.get(bestFit(host.camera.value, entries));
    if (candidate) {
      place(snapEl, host.panelScreen(candidate.rect));
      snapEl.setAttribute("data-visible", "");
    }
  }
  /** After a gesture, frame whatever fits the camera best. */
  function finishGesture() {
    if (!gesture) return;
    focus(bestFit(host.camera.value, entries));
  }

  // Wheel: Shift steps the hierarchy; otherwise zoom (content keeps plain wheels).
  let hierarchyWheel = { last: -Infinity, total: 0, steppedAt: -Infinity, direction: 0 };
  const resetHierarchyWheel = () =>
    (hierarchyWheel = { last: -Infinity, total: 0, steppedAt: -Infinity, direction: 0 });
  function handleHierarchyWheel(e: WheelEvent): boolean {
    if (!e.shiftKey) {
      resetHierarchyWheel();
      return false;
    }
    e.preventDefault();
    if (host.busy() || dragZoom || marquee) return true;
    const now = performance.now();
    // Some browsers convert Shift+wheel into horizontal deltas.
    const raw = e.deltaY || e.deltaX;
    const direction = Math.sign(raw);
    if (!direction) return true;
    if (now - hierarchyWheel.last > 260 || direction !== hierarchyWheel.direction) resetHierarchyWheel();
    hierarchyWheel.last = now;
    hierarchyWheel.direction = direction;
    hierarchyWheel.total += raw * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? host.viewport().h : 1);
    if (now - hierarchyWheel.steppedAt >= 140 && Math.abs(hierarchyWheel.total) >= 12) {
      hierarchyWheel.steppedAt = now;
      const b = bounds();
      const point = host.fromScreen({ x: e.clientX - b.left, y: e.clientY - b.top });
      const next = hierarchyStep(entries, framed ?? rootId(), hierarchyWheel.total > 0 ? "out" : "in", point);
      hierarchyWheel.total = 0;
      focus(next);
    }
    return true;
  }
  host.lifetime.listen(
    host.root,
    "wheel",
    (e: WheelEvent) => {
      if (!free()) return;
      if (handleHierarchyWheel(e)) return;
      const target = e.target as Element;
      if (!e.ctrlKey && !e.altKey && host.contentOwnsWheel(target, e)) return;
      if (target.closest?.("[data-trellis-part=tabs]") && !e.ctrlKey) {
        const list = target.closest("[data-trellis-part=tabs]") as HTMLElement;
        if (list.scrollWidth > list.clientWidth) return;
      }
      if (target.closest?.(".trellis-menu")) return;
      e.preventDefault();
      if (host.busy() || dragZoom || marquee) return;
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? host.viewport().h : 1);
      zoom(
        Math.exp(Math.max(-0.3, Math.min(0.3, delta * (e.ctrlKey ? 0.009 : 0.003)))),
        e.clientX,
        e.clientY,
      );
      host.lifetime.clearTimeout(wheelTimer);
      wheelTimer = host.lifetime.timeout(finishGesture, 180);
    },
    { passive: false },
  );
  host.lifetime.listen(host.root, "keyup", (e: KeyboardEvent) => {
    if (e.key === "Shift") resetHierarchyWheel();
  });
  // Escape cancels a marquee or drag-zoom before anything else sees it.
  host.lifetime.listen(
    window,
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (!marquee && !dragZoom)) return;
      e.preventDefault();
      e.stopPropagation();
      finishMarquee(false);
      finishDragZoom();
    },
    { capture: true },
  );
  host.lifetime.listen(window, "blur", () => {
    resetHierarchyWheel();
    finishDragZoom();
    finishMarquee(false);
  });

  // Shift+drag: marquee framing. Alt+drag: zoom around the press point (mouse pinch proxy).
  const marqueeEl = h("div", { "data-trellis-part": "marquee", "aria-hidden": "true" });
  // While a gesture drives the camera, outline what releasing will frame (the snap preview).
  const snapEl = h(
    "div",
    { "data-trellis-part": "snap-preview", "aria-hidden": "true" },
    h("span", {}, "Release to focus"),
  );
  host.root.append(snapEl);
  host.lifetime.add(() => snapEl.remove());
  const candidateEl = h("div", { "data-trellis-part": "marquee-target", "aria-hidden": "true" }, h("span"));
  host.root.append(marqueeEl, candidateEl);
  host.lifetime.add(() => {
    marqueeEl.remove();
    candidateEl.remove();
  });
  let marquee: {
    pointerId: number;
    start: { x: number; y: number };
    view: Rect;
    viewport: Rect;
    candidate: string | null;
  } | null = null;
  let dragZoom: { pointerId: number; x: number; y: number; lastY: number } | null = null;
  const place = (el: HTMLElement, r: Rect) => {
    el.style.transform = `translate(${r.x}px, ${r.y}px)`;
    el.style.width = `${Math.max(0, r.w)}px`;
    el.style.height = `${Math.max(0, r.h)}px`;
  };
  function moveMarquee(e: PointerEvent) {
    if (!marquee || marquee.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const m = marquee;
    const world = rectangleCamera(m.start, { x: e.clientX, y: e.clientY }, m.viewport, m.view);
    const screen = host.toScreen(world);
    place(marqueeEl, screen);
    m.candidate = screen.w >= 8 && screen.h >= 8 ? bestFit(world, entries) : null;
    candidateEl.toggleAttribute("data-visible", !!m.candidate);
    if (m.candidate) {
      const entry = entries.get(m.candidate)!;
      place(candidateEl, host.panelScreen(entry.rect));
      candidateEl.querySelector("span")!.textContent =
        `Release to focus ${host.titleOf(entry.node)} · Esc to cancel`;
    }
  }
  function finishMarquee(commit: boolean) {
    if (!marquee) return;
    const m = marquee;
    marquee = null;
    suppressClickUntil = performance.now() + 350;
    host.root.removeAttribute("data-marquee");
    candidateEl.removeAttribute("data-visible");
    try {
      if (host.root.hasPointerCapture(m.pointerId)) host.root.releasePointerCapture(m.pointerId);
    } catch {
      /* ignore */
    }
    focus(commit && m.candidate ? m.candidate : framed);
  }
  function finishDragZoom() {
    if (!dragZoom) return;
    const { pointerId } = dragZoom;
    dragZoom = null;
    suppressClickUntil = performance.now() + 350;
    host.root.removeAttribute("data-drag-zoom");
    try {
      if (host.root.hasPointerCapture(pointerId)) host.root.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
    finishGesture();
  }
  host.lifetime.listen(
    host.root,
    "pointerdown",
    (e: PointerEvent) => {
      if (!free() || host.busy() || e.button !== 0 || e.pointerType === "touch") return;
      if (e.shiftKey && !dragZoom) {
        e.preventDefault();
        e.stopPropagation();
        endGesture();
        const r = bounds();
        marquee = {
          pointerId: e.pointerId,
          start: { x: e.clientX, y: e.clientY },
          view: { ...host.camera.value },
          viewport: { x: r.left, y: r.top, w: r.width, h: r.height },
          candidate: null,
        };
        host.root.setPointerCapture(e.pointerId);
        host.root.setAttribute("data-marquee", "");
        moveMarquee(e);
      } else if (e.altKey && !marquee) {
        e.preventDefault();
        e.stopPropagation();
        dragZoom = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, lastY: e.clientY };
        host.root.setPointerCapture(e.pointerId);
        host.root.setAttribute("data-drag-zoom", "");
        zoom(1, e.clientX, e.clientY);
      }
    },
    { capture: true },
  );
  host.lifetime.listen(
    host.root,
    "pointermove",
    (e: PointerEvent) => {
      if (marquee) moveMarquee(e);
      else if (dragZoom && e.pointerId === dragZoom.pointerId) {
        e.preventDefault();
        e.stopPropagation();
        zoom(Math.exp((e.clientY - dragZoom.lastY) * 0.006), dragZoom.x, dragZoom.y);
        dragZoom.lastY = e.clientY;
      }
    },
    { capture: true },
  );
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const)
    host.lifetime.listen(
      host.root,
      type,
      (e: PointerEvent) => {
        if (marquee?.pointerId === e.pointerId) {
          e.stopPropagation();
          if (type === "pointerup") moveMarquee(e);
          finishMarquee(type === "pointerup");
        } else if (dragZoom?.pointerId === e.pointerId) {
          e.stopPropagation();
          finishDragZoom();
        }
      },
      { capture: true },
    );
  for (const type of ["click", "dblclick"] as const)
    host.lifetime.listen(
      host.root,
      type,
      (e: MouseEvent) => {
        if ((free() && e.altKey) || performance.now() < suppressClickUntil) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      { capture: true },
    );

  // Touch pinch (two fingers) and Safari trackpad gesture events.
  const pointers = new Map<number, { x: number; y: number }>();
  let lastPinch: { distance: number; x: number; y: number } | null = null;
  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  host.lifetime.listen(host.root, "pointerdown", (e: PointerEvent) => {
    if (!free() || host.busy() || e.pointerType !== "touch") return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) lastPinch = pinchState();
  });
  host.lifetime.listen(host.root, "pointermove", (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && lastPinch) {
      const p = pinchState();
      zoom(lastPinch.distance / Math.max(1, p.distance), p.x, p.y, p.x - lastPinch.x, p.y - lastPinch.y);
      lastPinch = p;
    }
  });
  for (const type of ["pointerup", "pointercancel"])
    host.lifetime.listen(host.root, type, (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2 && lastPinch) {
        lastPinch = null;
        finishGesture();
      }
    });
  let safariScale = 1;
  host.lifetime.listen(host.root, "gesturestart", (e: Event) => {
    if (!free()) return;
    e.preventDefault();
    safariScale = 1;
  });
  host.lifetime.listen(host.root, "gesturechange", (e: Event) => {
    if (!free()) return;
    e.preventDefault();
    const g = e as Event & { scale: number; clientX: number; clientY: number };
    zoom(safariScale / g.scale, g.clientX, g.clientY);
    safariScale = g.scale;
  });
  host.lifetime.listen(host.root, "gestureend", (e: Event) => {
    if (!free()) return;
    e.preventDefault();
    finishGesture();
  });

  // ---------------------------------------------------------------- persistence
  function serialize(): LayoutDocument["navigation"] {
    return {
      ...(framed ? { frame: [...framedLeaves] } : {}),
      ...(framings.length ? { framings } : {}),
    };
  }
  function restore(nav: LayoutDocument["navigation"]) {
    framings = nav?.framings ?? [];
    const leaves = nav?.frame ?? [];
    const destination = leaves.length ? savedFrameDestination(host.doc().root, leaves) : null;
    visits = [{ id: rootId(), leaves: leafIds(host.doc().root) }];
    visitIndex = 0;
    session = null;
    overviewReturn = null;
    framed = null;
    framedLeaves = [];
    if (destination && on()) focus(destination);
    else retarget();
  }

  return {
    sync,
    focus,
    toggle,
    stepOut,
    stepIn,
    back: () => historyGo(-1),
    forward: () => historyGo(1),
    overview: () => {
      if (framed) overviewReturn = [...framedLeaves];
      focus(null);
    },
    toggleOverview,
    frame,
    ensureVisible,
    /** Widen the framing to include these nodes (after a move). */
    include(ids: string[]) {
      if (!framed) return;
      focus(frameLeaves(host.doc().root, [...framedLeaves.filter((id) => entries.has(id)), ...ids]));
    },
    serialize,
    restore,
    cancelGestures() {
      finishMarquee(false);
      finishDragZoom();
      endGesture();
    },
    get entries() {
      return entries;
    },
    get framed() {
      return framed;
    },
    get framedNode(): LayoutNode | null {
      return framed ? (entries.get(framed)?.node ?? null) : null;
    },
    get gesture() {
      return gesture;
    },
    get canGoBack() {
      return visitIndex > 0;
    },
    get canGoForward() {
      return visitIndex < visits.length - 1;
    },
    get suppressClicks() {
      return performance.now() < suppressClickUntil;
    },
    framings: {
      save(name: string): Framing | null {
        // Blank names are rejected (NAV-14).
        if (!name.trim()) return null;
        const framing: Framing = {
          id: uid("framing"),
          name: name.trim(),
          frame: framed ? [...framedLeaves] : leafIds(host.doc().root),
        };
        framings = [...framings, framing];
        host.changed();
        return framing;
      },
      go(id: string) {
        const framing = framings.find((f) => f.id === id);
        if (!framing) return;
        focus(savedFrameDestination(host.doc().root, framing.frame));
      },
      remove(id: string) {
        framings = framings.filter((f) => f.id !== id);
        host.changed();
      },
      list: () => framings,
    },
  };
}
export type Navigator = ReturnType<typeof createNavigator>;
