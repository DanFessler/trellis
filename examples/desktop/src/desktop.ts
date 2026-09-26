import {
  layoutRects,
  type LayoutDocument,
  type LayoutNode,
  type Rect,
  type WorkspaceHandle,
} from "@danfessler/trellis";
import { STAGE_ID, type AppDefinition, type AppParams } from "./apps";

/**
 * Window-management helpers for the desktop, built only on Trellis's public handle.
 * Everything a "desktop" needs (launch, minimize to the dock, zoom, raise) is contrived here.
 */

// ------------------------------------------------------------------ geometry
/** World rects (fractions of the whole layout) of every node in the docked tree. */
export function worldRects(root: LayoutNode | null): Map<string, Rect> {
  return new Map([...layoutRects(root)].map(([id, entry]) => [id, entry.rect]));
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
    x = Math.max(0, Math.min(at.x, desk.w - w));
    y = Math.max(0, Math.min(at.y, desk.h - h));
  } else {
    const step = (cascade++ % 6) * 30;
    x = (desk.w - w) / 2 - 60 + step;
    y = Math.max(16, (desk.h - h) / 2 - 50 + step);
  }
  return { x: x / desk.w, y: y / desk.h, w: w / desk.w, h: h / desk.h };
}

export function dockIcon(appId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-dock-app="${appId}"] .dock-icon`);
}

/** Launch an app, or bring its existing window forward (restoring it from the dock if hidden). */
export function launch(
  ws: WorkspaceHandle,
  app: AppDefinition,
  params?: AppParams,
  at?: { x: number; y: number },
  from?: Element | null,
) {
  const snap = ws.getSnapshot();
  const matches = snap.views.filter(
    (v) =>
      v.type === app.id &&
      (app.singleton || (params?.folder !== undefined && v.params.folder === params.folder)),
  );
  const existing = matches[0];
  if (existing) {
    if (existing.placement === "hidden")
      ws.restore(existing.panelId, { from: dockIcon(app.id) ?? undefined });
    else ws.focus(existing.id);
    return existing.id;
  }
  // Trellis zooms out if the new window would open outside the current frame.
  const info = ws.open(app.id, {
    params,
    placement: { float: windowRect(ws, app, at), layer: "stage" },
    reuse: "none",
    from: from ?? undefined,
  });
  return info.id;
}

/** Dock click: launch, restore the app's minimized window, or cycle through its windows. */
export function activateApp(ws: WorkspaceHandle, app: AppDefinition, icon: Element | null) {
  const snap = ws.getSnapshot();
  const views = snap.views.filter((v) => v.type === app.id);
  if (!views.length) return launch(ws, app, undefined, undefined, icon);
  const visible = views.filter((v) => v.placement !== "hidden");
  if (!visible.length) {
    ws.restore(views[views.length - 1].panelId, { from: icon ?? undefined });
    return;
  }
  const current = visible.findIndex((v) => v.id === snap.focusedView);
  const next = visible[(current + 1) % visible.length];
  ws.focus(next.id);
}

// ------------------------------------------------------------------ window controls
/** Yellow button: fly into the app's dock icon. */
export function minimize(ws: WorkspaceHandle, viewId: string) {
  const type = ws.getSnapshot().views.find((v) => v.id === viewId)?.type ?? "";
  ws.hide(viewId, { toward: dockIcon(type) ?? undefined });
}

export function isDocked(ws: WorkspaceHandle, viewId: string) {
  const view = ws.getSnapshot().views.find((v) => v.id === viewId);
  return !!view && view.placement !== "floating" && view.placement !== "hidden";
}

/** Green button (the prototype's dock toggle): dock a window beside the desktop and frame both,
 * or float it back onto the desktop at its previous size. */
export function toggleDock(ws: WorkspaceHandle, viewId: string) {
  ws.toggleDock(viewId);
}

/** Clicking into a window's iframe should raise it; iframes swallow the pointer, so the app
 * reports clicks itself. Focusing a floating window raises it. */
export function raise(ws: WorkspaceHandle, viewId: string) {
  if (ws.getSnapshot().focusedView !== viewId) ws.focus(viewId);
}
