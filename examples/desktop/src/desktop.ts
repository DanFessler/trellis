import type { LayoutDocument, LayoutNode, Rect, WorkspaceHandle } from "@danfessler/trellis";
import { APPS, STAGE_ID, type AppDefinition, type AppParams } from "./apps";

/**
 * Window-management helpers for the desktop, built only on Trellis's public handle.
 * Everything a "desktop" needs (launch, minimize to the dock, zoom, raise) is contrived here.
 */

// ------------------------------------------------------------------ geometry
/** World rects (fractions of the workspace) for every node in the docked tree.
 * Trellis computes these internally but does not export them, so the example mirrors the math. */
export function worldRects(node: LayoutNode | null, rect: Rect = { x: 0, y: 0, w: 1, h: 1 }, out = new Map<string, Rect>()) {
  if (!node) return out;
  out.set(node.id, rect);
  if (node.kind === "stage") worldRects(node.child ?? null, rect, out);
  else if (node.kind === "split") {
    const total = node.weights.reduce((a, b) => a + b, 0) || 1;
    let offset = 0;
    node.children.forEach((child, i) => {
      const share = node.weights[i] / total;
      const r =
        node.axis === "x"
          ? { ...rect, x: rect.x + offset * rect.w, w: rect.w * share }
          : { ...rect, y: rect.y + offset * rect.h, h: rect.h * share };
      worldRects(child, r, out);
      offset += share;
    });
  }
  return out;
}

function gapOf(ws: WorkspaceHandle) {
  const g = parseFloat(getComputedStyle(ws.element).getPropertyValue("--trellis-gap"));
  return Number.isFinite(g) ? g : 6;
}

/** The desktop's size in CSS pixels at overview zoom (independent of the camera). */
export function desktopSize(ws: WorkspaceHandle, doc: LayoutDocument = ws.getDocument()) {
  const world = worldRects(doc.root).get(STAGE_ID) ?? { x: 0, y: 0, w: 1, h: 1 };
  const gap = gapOf(ws);
  const W = ws.element.clientWidth - gap;
  const H = ws.element.clientHeight - gap;
  return { w: Math.max(200, world.w * W - gap), h: Math.max(200, world.h * H - gap) };
}

// ------------------------------------------------------------------ launching
let cascade = 0;
/** A float rect (fractions of the desktop) for a new window of `app`. */
export function windowRect(ws: WorkspaceHandle, app: AppDefinition, at?: { x: number; y: number }): Rect {
  const desk = desktopSize(ws);
  const w = Math.min(app.size.w, desk.w * 0.86);
  const h = Math.min(app.size.h, desk.h * 0.86);
  let x: number;
  let y: number;
  if (at) {
    x = at.x;
    y = at.y;
  } else {
    const step = (cascade++ % 6) * 30;
    x = (desk.w - w) / 2 - 60 + step;
    y = Math.max(16, (desk.h - h) / 2 - 50 + step);
  }
  return { x: x / desk.w, y: y / desk.h, w: w / desk.w, h: h / desk.h };
}

/** Floating windows live in the desktop, so opening one while the camera frames a docked panel
 * would open it offscreen. Trellis only keeps *docked* views in frame on open, so do it here. */
function bringDesktopIntoView(ws: WorkspaceHandle) {
  const framed = ws.navigation.framed;
  if (framed && framed !== STAGE_ID) ws.navigation.overview();
}

export function dockIcon(appId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-dock-app="${appId}"] .dock-icon`);
}

/** Launch an app, or bring its existing window forward (restoring it from the dock if hidden). */
export function launch(ws: WorkspaceHandle, app: AppDefinition, params?: AppParams, at?: { x: number; y: number }) {
  const snap = ws.getSnapshot();
  const matches = snap.views.filter(
    (v) => v.type === app.id && (app.singleton || (params?.folder !== undefined && v.params.folder === params.folder)),
  );
  const existing = matches[0];
  if (existing) {
    if (existing.placement === "hidden") ws.restore(existing.panelId, { from: dockIcon(app.id) ?? undefined });
    else ws.focus(existing.id);
    return existing.id;
  }
  bringDesktopIntoView(ws);
  const info = ws.open(app.id, {
    params,
    placement: { float: windowRect(ws, app, at), layer: "stage" },
    reuse: "none",
  });
  return info.id;
}

/** Dock click: launch, restore the app's minimized window, or cycle through its windows. */
export function activateApp(ws: WorkspaceHandle, app: AppDefinition, icon: Element | null) {
  const snap = ws.getSnapshot();
  const views = snap.views.filter((v) => v.type === app.id);
  if (!views.length) return launch(ws, app);
  const visible = views.filter((v) => v.placement !== "hidden");
  if (!visible.length) {
    ws.restore(views[views.length - 1].panelId, { from: icon ?? undefined });
    return;
  }
  const current = visible.findIndex((v) => v.id === snap.focusedView);
  const next = visible[(current + 1) % visible.length];
  if (next.placement === "floating") bringDesktopIntoView(ws);
  ws.focus(next.id);
}

// ------------------------------------------------------------------ window controls
/** Yellow button: fly into the app's dock icon. */
export function minimize(ws: WorkspaceHandle, viewId: string) {
  const type = ws.getSnapshot().views.find((v) => v.id === viewId)?.type ?? "";
  ws.hide(viewId, { toward: dockIcon(type) ?? undefined });
}

const FILL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const zoomedFrom = new Map<string, Rect>();
const near = (a: Rect, b: Rect) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h) < 0.01;

export function isZoomed(ws: WorkspaceHandle, viewId: string) {
  const doc = ws.getDocument();
  const float = doc.floating.find((f) => f.panel.views.includes(viewId));
  if (float) return near(float.rect, FILL);
  const panel = ws.getSnapshot().views.find((v) => v.id === viewId)?.panelId;
  return !!panel && ws.navigation.framed === panel;
}

/** Green button: floating windows fill the desktop (floats cannot be framed by navigation);
 * docked windows use Trellis's focus navigation. */
export function zoom(ws: WorkspaceHandle, viewId: string) {
  const doc = ws.getDocument();
  const float = doc.floating.find((f) => f.panel.views.includes(viewId));
  if (float) {
    const id = float.panel.id;
    if (near(float.rect, FILL)) {
      const app = APPS.find((a) => a.id === doc.views[viewId]?.type);
      ws.float(id, zoomedFrom.get(id) ?? (app ? windowRect(ws, app) : { x: 0.2, y: 0.15, w: 0.6, h: 0.7 }));
      zoomedFrom.delete(id);
    } else {
      zoomedFrom.set(id, float.rect);
      ws.float(id, FILL);
    }
    return;
  }
  ws.navigation.toggle(viewId);
}

/** Clicking into a window's iframe should raise it. Trellis focuses the view on pointerdown in
 * the surface, but only raises a float when its tab bar is pressed; `focus()` does both. */
export function raise(ws: WorkspaceHandle, viewId: string) {
  const snap = ws.getSnapshot();
  const float = snap.document.floating.find((f) => f.panel.views.includes(viewId));
  const top = Math.max(0, ...snap.document.floating.map((f) => f.z));
  if (snap.focusedView === viewId && (!float || float.z === top)) return;
  ws.focus(viewId);
}

export function floatOnDesktop(ws: WorkspaceHandle, viewId: string) {
  const app = APPS.find((a) => a.id === ws.getDocument().views[viewId]?.type);
  if (app) ws.float(viewId, windowRect(ws, app));
  else ws.float(viewId);
}
