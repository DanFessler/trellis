import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useView, useWorkspaceState } from "@danfessler/trellis-react";
import heroCode from "../../snippets/hero-code.md";
import { aliveSince, BOARD, SWATCHES, useDemo, type Point, type Stroke } from "./store";

/** Records when this view's content mounted. Survives docking, tabbing, floating and hiding. */
function useAliveClock() {
  const view = useView();
  useState(() => {
    aliveSince.set(view.id, performance.now());
    return 0;
  });
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.points;
  if (!pts.length) return;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1] + 0.1);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  if (pts.length > 1) ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.stroke();
}

// ------------------------------------------------------------------ Sketch (stage document)
export function Sketch() {
  useAliveClock();
  const demo = useDemo();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke | null>(null);
  const fit = useRef({ scale: 1, x: 0, y: 0 });
  const latest = useRef(demo);
  latest.current = demo;

  const paint = () => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box) return;
    const w = box.clientWidth;
    const h = box.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
    }
    const pad = Math.max(12, Math.min(w, h) * 0.06);
    const scale = Math.max(0.05, Math.min((w - pad * 2) / BOARD.w, (h - pad * 2) / BOARD.h));
    const x = (w - BOARD.w * scale) / 2;
    const y = (h - BOARD.h * scale) / 2;
    fit.current = { scale, x, y };
    const ctx = el.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Paper
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#f5f1e6";
    ctx.beginPath();
    ctx.roundRect(x, y, BOARD.w * scale, BOARD.h * scale, 6);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, BOARD.w * scale, BOARD.h * scale, 6);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { layers, strokes } = latest.current;
    // Bottom layer first.
    for (const layer of [...layers].reverse()) {
      if (!layer.visible) continue;
      for (const s of strokes) if (s.layer === layer.id) drawStroke(ctx, s);
      if (live.current && live.current.layer === layer.id) drawStroke(ctx, live.current);
    }
    ctx.restore();
  };

  useLayoutEffect(paint, [demo.strokes, demo.layers]);
  useEffect(() => {
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap.current!);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toBoard = (e: React.PointerEvent): Point => {
    const r = canvas.current!.getBoundingClientRect();
    const { scale, x, y } = fit.current;
    // The content may be visually scaled by the workspace; map through the rendered rect.
    const sx = canvas.current!.clientWidth / r.width;
    return [((e.clientX - r.left) * sx - x) / scale, ((e.clientY - r.top) * sx - y) / scale];
  };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const d = latest.current;
    live.current = { layer: d.activeLayer, color: d.color, size: d.size, points: [toBoard(e)] };
    paint();
  };
  const move = (e: React.PointerEvent) => {
    if (!live.current) return;
    live.current.points.push(toBoard(e));
    paint();
  };
  const up = () => {
    if (!live.current) return;
    const stroke = live.current;
    live.current = null;
    latest.current.addStroke(stroke);
  };
  const activeName = demo.layers.find((l) => l.id === demo.activeLayer)?.name;
  const hidden = !demo.layers.find((l) => l.id === demo.activeLayer)?.visible;
  return (
    <div className="d-sketch" ref={wrap}>
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Drawing canvas" />
      <div className="d-sketch-hint">
        <span className="d-dot" style={{ background: demo.color }} />
        {hidden ? `“${activeName}” is hidden` : `Draw on ${activeName}`}
        <span className="d-sep" />
        {demo.strokes.length} strokes
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Code (stage document)
export function CodeView() {
  useAliveClock();
  return <div className="d-code" dangerouslySetInnerHTML={{ __html: heroCode.html }} />;
}

// ------------------------------------------------------------------ Layers
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
    {off && <path d="M2.5 13.5l11-11" />}
  </svg>
);
export function Layers() {
  useAliveClock();
  const demo = useDemo();
  return (
    <div className="d-pane">
      <ul className="d-layers" role="listbox" aria-label="Layers">
        {demo.layers.map((l) => {
          const count = demo.strokes.filter((s) => s.layer === l.id).length;
          const active = demo.activeLayer === l.id;
          return (
            <li key={l.id} role="option" aria-selected={active} data-active={active || undefined} onClick={() => demo.setActiveLayer(l.id)}>
              <button
                type="button"
                className="d-eye"
                aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  demo.toggleLayer(l.id);
                }}
              >
                <EyeIcon off={!l.visible} />
              </button>
              <span className={`d-thumb d-thumb-${l.id}`} />
              <span className="d-layer-name" data-dim={!l.visible || undefined}>{l.name}</span>
              <span className="d-count">{count}</span>
            </li>
          );
        })}
      </ul>
      <div className="d-actions">
        <button type="button" onClick={demo.undo}>Undo</button>
        <button type="button" onClick={demo.clear}>Reset art</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Color
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
function hslToHex(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}
export function ColorPicker() {
  useAliveClock();
  const demo = useDemo();
  const [h, s, l] = hexToHsl(demo.color);
  return (
    <div className="d-pane d-color">
      <div className="d-color-top">
        <span className="d-color-preview" style={{ background: demo.color }} />
        <div>
          <div className="d-color-hex">{demo.color.toUpperCase()}</div>
          <div className="d-muted">
            H {Math.round(h)} · S {Math.round(s)} · L {Math.round(l)}
          </div>
        </div>
      </div>
      <label className="d-slider">
        <span>Hue</span>
        <input
          type="range"
          min={0}
          max={359}
          value={Math.round(h)}
          onChange={(e) => demo.setColor(hslToHex(Number(e.target.value), Math.max(s, 45), Math.min(Math.max(l, 35), 65)))}
          style={{ background: "linear-gradient(90deg,#f33,#fd3,#3f5,#3df,#35f,#f3d,#f33)" }}
        />
      </label>
      <div className="d-swatches">
        {SWATCHES.map((c) => (
          <button key={c} type="button" aria-label={`Color ${c}`} data-active={c === demo.color || undefined} style={{ background: c }} onClick={() => demo.setColor(c)} />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Brush (floating)
export function Brush() {
  useAliveClock();
  const demo = useDemo();
  return (
    <div className="d-pane d-brush">
      <div className="d-brush-preview">
        <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M10 40 C 50 5, 90 60, 130 28 S 180 20, 190 30" stroke={demo.color} strokeWidth={demo.size} fill="none" strokeLinecap="round" />
        </svg>
      </div>
      <label className="d-slider">
        <span>Size</span>
        <input type="range" min={1} max={32} value={demo.size} onChange={(e) => demo.setSize(Number(e.target.value))} />
        <output>{demo.size}px</output>
      </label>
    </div>
  );
}

// ------------------------------------------------------------------ Inspector
const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export function Inspector() {
  useAliveClock();
  const self = useView();
  const state = useWorkspaceState();
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const focused = state.views.find((v) => v.id === state.focusedView);
  return (
    <div className="d-pane d-inspector">
      <dl className="d-kv">
        <dt>Focused</dt>
        <dd>{focused?.title ?? "—"}</dd>
        <dt>Maximized</dt>
        <dd>{state.framed ? "yes · Esc to return" : "no"}</dd>
        <dt>This panel</dt>
        <dd>
          {self.size.width}×{self.size.height} · {self.placement}
        </dd>
      </dl>
      <div className="d-inspector-head">
        <span>View</span>
        <span>Alive</span>
      </div>
      <ul className="d-views">
        {state.views.map((v) => {
          const since = aliveSince.get(v.id);
          return (
            <li key={v.id}>
              <span className={`d-place d-place-${v.placement}`} title={v.placement} />
              <span className="d-view-title">{v.title}</span>
              <span className="d-alive">{since === undefined ? "—" : fmt(now - since)}</span>
            </li>
          );
        })}
      </ul>
      <p className="d-note">Clocks start when content mounts. Drag panels anywhere — they never reset.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Preview (iframe)
const PREVIEW_HTML = `<!doctype html><html><head><meta name="color-scheme" content="light dark"><style>
html,body{margin:0;height:100%;background:transparent;font:500 12px/1.4 Inter,system-ui,sans-serif;color:#8a9489}
body{display:grid;place-items:center;text-align:center}
.t{font:600 28px/1 "JetBrains Mono",ui-monospace,monospace;color:#79b93f;letter-spacing:-.02em;margin:10px 0 6px}
.leaf{width:34px;height:34px;margin:0 auto;animation:sway 3s ease-in-out infinite;transform-origin:50% 100%}
@keyframes sway{50%{transform:rotate(9deg)}}
</style></head><body><div><svg class="leaf" viewBox="0 0 24 24" fill="none" stroke="#79b93f" stroke-width="1.6" stroke-linecap="round"><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 14 10"/></svg>
<div class="t" id="t">0:00</div><div>iframe alive · never reloaded</div></div>
<script>var s=Date.now();setInterval(function(){var x=Math.floor((Date.now()-s)/1000);document.getElementById("t").textContent=Math.floor(x/60)+":"+String(x%60).padStart(2,"0")},250)</script></body></html>`;
export const PREVIEW_URL = "data:text/html;charset=utf-8," + encodeURIComponent(PREVIEW_HTML);
