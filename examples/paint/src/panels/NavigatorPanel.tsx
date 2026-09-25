import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useActiveDoc } from "../store";
import { FitIcon, MinusIcon, PlusIcon } from "../ui/icons";
import { Slider } from "../ui/Slider";
import { NoDocument } from "./LayersPanel";

export function NavigatorPanel() {
  const doc = useActiveDoc();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  // Thumbnail: redraw when pixels change, at most once per frame.
  const pixels = doc?.pixels ?? 0;
  useEffect(() => {
    if (!doc || !canvas.current || !area.w) return;
    const id = requestAnimationFrame(() => {
      const c = canvas.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const s = Math.min(area.w / doc.width, area.h / doc.height);
      const w = Math.max(1, Math.round(doc.width * s));
      const h = Math.max(1, Math.round(doc.height * s));
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(doc.composite(), 0, 0, c.width, c.height);
    });
    return () => cancelAnimationFrame(id);
  }, [doc, pixels, area]);

  if (!doc) return <NoDocument what="overview" />;
  const s = area.w ? Math.min(area.w / doc.width, area.h / doc.height) : 0;
  const tw = doc.width * s;
  const th = doc.height * s;
  const ox = (area.w - tw) / 2;
  const oy = (area.h - th) / 2;
  const { zoom, x, y } = doc.view;
  // Visible document region → thumbnail rect (clipped to the thumbnail).
  const vx0 = Math.max(0, -x / zoom);
  const vy0 = Math.max(0, -y / zoom);
  const vx1 = Math.min(doc.width, (doc.viewport.w - x) / zoom);
  const vy1 = Math.min(doc.height, (doc.viewport.h - y) / zoom);
  const rect = { left: ox + vx0 * s, top: oy + vy0 * s, width: Math.max(0, (vx1 - vx0) * s), height: Math.max(0, (vy1 - vy0) * s) };
  const whole = vx0 <= 0 && vy0 <= 0 && vx1 >= doc.width && vy1 >= doc.height;

  const moveTo = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    doc.centerOn((e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s);
  };

  return (
    <div className="panel navigator-panel">
      <div
        className="nav-box"
        ref={box}
        onPointerDown={(e) => {
          if (e.button !== 0 || !s) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTo(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && moveTo(e)}
        onWheel={(e) => {
          if (!s) return;
          const r = box.current!.getBoundingClientRect();
          const px = (e.clientX - r.left - ox) / s;
          const py = (e.clientY - r.top - oy) / s;
          doc.zoomTo(doc.view.zoom * Math.exp(-e.deltaY * 0.004), { x: doc.view.x + px * doc.view.zoom, y: doc.view.y + py * doc.view.zoom });
        }}
      >
        <canvas ref={canvas} className="nav-thumb" style={{ left: ox, top: oy }} />
        {!whole && <div className="nav-rect" style={rect} />}
      </div>
      <div className="nav-controls">
        <button type="button" className="icon-btn" title="Zoom out" onClick={() => doc.zoomStep(-1)}>
          <MinusIcon />
        </button>
        <div className="nav-slider">
          <Slider label="Zoom" value={zoom} min={0.02} max={32} curve={3.2} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => doc.zoomTo(v)} />
        </div>
        <button type="button" className="icon-btn" title="Zoom in" onClick={() => doc.zoomStep(1)}>
          <PlusIcon />
        </button>
        <button type="button" className="icon-btn" title="Fit on screen (⌘0)" aria-pressed={doc.view.fit} onClick={() => doc.fit()}>
          <FitIcon />
        </button>
      </div>
    </div>
  );
}
