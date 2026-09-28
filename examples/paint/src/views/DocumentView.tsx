import { useCloseGuard, useView, useViewTitle } from "@danfessler/trellis-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Point } from "../paint/brush";
import { hsvToHex, rgbToHsv } from "../paint/color";
import type { DocParams, PaintDoc } from "../paint/PaintDoc";
import { app, documents, exportPng, useApp, useDoc } from "../store";
import { confirmDialog } from "../ui/Dialog";
import { ImageIcon, MinusIcon, PlusIcon } from "../ui/icons";
import { localPoint } from "../ui/localPoint";

let checker: CanvasPattern | null = null;
function checkerPattern(ctx: CanvasRenderingContext2D) {
  if (checker) return checker;
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = "#e3e4e8";
  g.fillRect(0, 0, 8, 8);
  g.fillRect(8, 8, 8, 8);
  checker = ctx.createPattern(c, "repeat");
  return checker;
}

/** Ask before closing a document with unsaved changes. */
export async function guardDocument(doc: PaintDoc): Promise<boolean> {
  if (!doc.dirty) return true;
  const choice = await confirmDialog({
    title: `Save changes to “${doc.name}”?`,
    message: "Your changes will be lost if you close this document without exporting it.",
    icon: <ImageIcon size={22} />,
    cancel: "cancel",
    actions: [
      { value: "discard", label: "Don't Save", kind: "danger" },
      { value: "cancel", label: "Cancel" },
      { value: "export", label: "Export PNG & Close", kind: "primary" },
    ],
  });
  if (choice === "export") {
    await exportPng(doc);
    return true;
  }
  return choice === "discard";
}

export function DocumentView() {
  const view = useView<DocParams>();
  // The registry outlives moves; this component is mounted once per view no matter where the tab goes.
  useSyncExternalStore(documents.subscribe, documents.version);
  const doc = documents.get(view.id) ?? documents.ensure(view.id, view.params);
  useDoc(doc);
  useViewTitle(doc.dirty ? `${doc.name} •` : doc.name);
  useCloseGuard(() => guardDocument(doc));

  // Tool panels follow the most recently focused document (see also the workspace "focus" event in App).
  useEffect(() => {
    if (view.focused || (view.selected && !documents.get(app.get().activeDoc)))
      app.set({ activeDoc: view.id });
  }, [view.focused, view.selected, view.id]);

  return <PaintCanvas doc={doc} visible={view.visible} />;
}

function PaintCanvas({ doc, visible }: { doc: PaintDoc; visible: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLSpanElement>(null);
  const tool = useApp((s) => (s.spaceHeld ? "hand" : s.tool));
  const size = useApp((s) => s.brush.size);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const frame = useRef(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const render = () => {
    frame.current = 0;
    const el = canvas.current;
    if (!el || !visibleRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = el.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { zoom, x, y } = doc.view;
    const w = doc.width * zoom;
    const h = doc.height * zoom;
    // Page shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = checkerPattern(ctx) ?? "#fff";
    ctx.fillRect(x, y, w, h);
    ctx.imageSmoothingEnabled = zoom < 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(doc.composite(), x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1 / dpr;
    ctx.strokeRect(x - 0.5 / dpr, y - 0.5 / dpr, w + 1 / dpr, h + 1 / dpr);
  };
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(render);
  };

  useEffect(() => doc.subscribe(schedule), [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (visible) schedule();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Size the backing store to the element.
  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h || !r.width) return;
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.current!;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      doc.setViewport(w, h);
      render();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Brush ring follows zoom/size changes.
  useEffect(() => {
    const r = ring.current;
    if (!r) return;
    const d = Math.max(2, size * doc.view.zoom);
    r.style.width = r.style.height = `${d}px`;
  });

  // Gestures over the canvas belong to the canvas: pinch / ctrl+wheel zooms, wheel pans.
  useEffect(() => {
    const el = wrap.current!;
    const local = (e: { clientX: number; clientY: number }) => localPoint(el, e);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const k = e.deltaMode === 1 ? 0.05 : 0.0105;
        doc.zoomTo(doc.view.zoom * Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * k), local(e));
      } else {
        const m = e.deltaMode === 1 ? 16 : 1;
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        doc.panBy(-dx * m, -dy * m);
      }
    };
    // Safari trackpad pinch
    let gestureStart = 1;
    const onGestureStart = (e: any) => {
      e.preventDefault();
      gestureStart = doc.view.zoom;
    };
    const onGestureChange = (e: any) => {
      e.preventDefault();
      doc.zoomTo(gestureStart * e.scale, local(e));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart as any);
    el.addEventListener("gesturechange", onGestureChange as any);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart as any);
      el.removeEventListener("gesturechange", onGestureChange as any);
    };
  }, [doc]);

  // Pointer input
  const gesture = useRef<{
    mode: "paint" | "pan" | "pick" | "pinch" | null;
    last: { x: number; y: number };
    lastPoint: Point | null;
    touches: Map<number, { x: number; y: number }>;
    pinch?: { dist: number; zoom: number; mid: { x: number; y: number } };
  }>({ mode: null, last: { x: 0, y: 0 }, lastPoint: null, touches: new Map() });

  const local = (e: { clientX: number; clientY: number }) => localPoint(wrap.current!, e);
  const docPoint = (e: PointerEvent | ReactPointerEvent): Point => {
    const l = local(e);
    const p = doc.toDoc(l.x, l.y);
    const pressure = e.pointerType === "pen" ? e.pressure || 0.01 : 1;
    return { x: p.x, y: p.y, p: pressure };
  };
  const moveRing = (e: { clientX: number; clientY: number }) => {
    const l = local(e);
    if (ring.current) ring.current.style.transform = `translate(${l.x}px, ${l.y}px) translate(-50%, -50%)`;
    const p = doc.toDoc(l.x, l.y);
    if (hud.current)
      hud.current.textContent =
        p.x >= 0 && p.y >= 0 && p.x < doc.width && p.y < doc.height
          ? `${Math.floor(p.x)}, ${Math.floor(p.y)}`
          : "";
  };
  const pick = (e: ReactPointerEvent) => {
    const p = docPoint(e);
    const rgb = doc.sample(p.x, p.y);
    if (rgb) app.setColor(rgbToHsv(rgb, app.get().color.h));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    app.set({ activeDoc: doc.id });
    if (e.pointerType === "touch") {
      g.touches.set(e.pointerId, local(e));
      if (g.touches.size === 2) {
        if (g.mode === "paint") doc.cancelStroke();
        const [a, b] = [...g.touches.values()];
        g.mode = "pinch";
        g.pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          zoom: doc.view.zoom,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (g.touches.size > 2) return;
    }
    if (g.mode) return;
    const t = toolRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    g.last = local(e);
    if (e.button === 1 || t === "hand") {
      e.preventDefault();
      g.mode = "pan";
      wrap.current!.dataset.panning = "";
      return;
    }
    if (e.button !== 0) return;
    const p = docPoint(e);
    const s = app.get();
    if (t === "brush" || t === "eraser") {
      if (doc.beginStroke(s.brush, app.colorRgb(), t === "eraser", p)) {
        g.mode = "paint";
        g.lastPoint = p;
        if (t === "brush") app.pushRecent(hsvToHex(s.color));
      } else flashHidden();
    } else if (t === "fill") {
      if (!doc.activeLayer.visible) return flashHidden();
      doc.floodFill(p.x, p.y, app.colorRgb(), s.brush.opacity);
      app.pushRecent(hsvToHex(s.color));
    } else if (t === "eyedropper") {
      g.mode = "pick";
      pick(e);
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    moveRing(e);
    if (e.pointerType === "touch" && g.touches.has(e.pointerId)) {
      g.touches.set(e.pointerId, local(e));
      if (g.mode === "pinch" && g.pinch && g.touches.size >= 2) {
        const [a, b] = [...g.touches.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        doc.panBy(mid.x - g.pinch.mid.x, mid.y - g.pinch.mid.y);
        doc.zoomTo(g.pinch.zoom * (dist / g.pinch.dist), mid);
        g.pinch.mid = mid;
        return;
      }
    }
    if (g.mode === "pan") {
      const l = local(e);
      doc.panBy(l.x - g.last.x, l.y - g.last.y);
      g.last = l;
    } else if (g.mode === "paint") {
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      const pts = (events.length ? events : [e.nativeEvent]).map(docPoint);
      g.lastPoint = pts[pts.length - 1];
      doc.strokeTo(pts);
    } else if (g.mode === "pick") pick(e);
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    g.touches.delete(e.pointerId);
    if (g.mode === "pinch") {
      if (g.touches.size === 0) g.mode = null;
      return;
    }
    if (g.mode === "paint") {
      if (e.type === "pointercancel") doc.cancelStroke();
      else doc.endStroke(g.lastPoint);
    }
    g.mode = null;
    delete wrap.current!.dataset.panning;
  };
  const flashHidden = () => {
    const el = wrap.current!;
    el.dataset.flash = "";
    setTimeout(() => delete el.dataset.flash, 500);
  };

  const showRing = tool === "brush" || tool === "eraser";
  return (
    <div
      ref={wrap}
      className="paint-canvas"
      data-tool={tool}
      data-ring={showRing && size * doc.view.zoom >= 5 ? "" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={() => hud.current && (hud.current.textContent = "")}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvas} className="paint-surface" data-doc={doc.id} />
      <div ref={ring} className="brush-ring" data-eraser={tool === "eraser" || undefined} />
      <div className="doc-hud">
        <span>
          {doc.width} × {doc.height}
        </span>
        <span ref={hud} className="doc-hud-pos" />
      </div>
      <div className="hidden-layer-toast">Layer is hidden</div>
    </div>
  );
}

/** Tab-bar accessory: the document's zoom level. */
export function ZoomAccessory({ id }: { id: string }) {
  const doc = useDoc(documents.get(id));
  if (!doc) return null;
  const pct = Math.round(doc.view.zoom * 100);
  return (
    <div className="zoom-acc" onDoubleClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label="Zoom out" onClick={() => doc.zoomStep(-1)}>
        <MinusIcon size={12} />
      </button>
      <button
        type="button"
        className="zoom-acc-value"
        title="Fit on screen"
        onClick={() => (doc.view.fit ? doc.zoomTo(1) : doc.fit())}
      >
        {pct}%
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => doc.zoomStep(1)}>
        <PlusIcon size={12} />
      </button>
    </div>
  );
}
