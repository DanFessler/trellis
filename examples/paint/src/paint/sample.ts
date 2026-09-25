import { PRESETS, type BrushSettings, type Point } from "./brush";
import { hexToRgb } from "./color";
import type { PaintDoc } from "./PaintDoc";

/** Deterministic pseudo-random numbers so the sample looks the same every time. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const preset = (id: string, patch: Partial<BrushSettings> = {}): BrushSettings => ({
  ...PRESETS.find((p) => p.id === id)!.settings,
  ...patch,
});
function path(pts: [number, number][], taper = true, steps = 14): Point[] {
  const out: Point[] = [];
  const total = (pts.length - 1) * steps;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[i];
    const [cx, cy] = pts[i + 1];
    const [dx, dy] = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      // Catmull-Rom
      const x = 0.5 * (2 * bx + (-ax + cx) * t + (2 * ax - 5 * bx + 4 * cx - dx) * t2 + (-ax + 3 * bx - 3 * cx + dx) * t3);
      const y = 0.5 * (2 * by + (-ay + cy) * t + (2 * ay - 5 * by + 4 * cy - dy) * t2 + (-ay + 3 * by - 3 * cy + dy) * t3);
      const u = (i * steps + s) / total;
      out.push({ x, y, p: taper ? Math.sin(Math.PI * Math.min(1, u * 1.08)) ** 0.7 : 1 });
    }
  }
  const [lx, ly] = pts[pts.length - 1];
  out.push({ x: lx, y: ly, p: taper ? 0.05 : 1 });
  return out;
}

/** A small painted dusk landscape, spread over a few layers. */
export function paintSample(doc: PaintDoc) {
  const W = doc.width;
  const H = doc.height;
  const rand = rng(7);
  const bg = doc.layers[0];
  bg.name = "Sky";
  const sky = bg.canvas.getContext("2d")!;
  const g = sky.createLinearGradient(0, 0, 0, H * 0.78);
  g.addColorStop(0, "#161a3b");
  g.addColorStop(0.35, "#3a2f6b");
  g.addColorStop(0.62, "#9a4a7c");
  g.addColorStop(0.82, "#f08a64");
  g.addColorStop(1, "#ffc98a");
  sky.fillStyle = g;
  sky.fillRect(0, 0, W, H);

  // Stars
  const stars = doc.makeLayer("Stars");
  const sc = stars.canvas.getContext("2d")!;
  for (let i = 0; i < 140; i++) {
    const x = rand() * W;
    const y = rand() * H * 0.45;
    const r = rand() ** 3 * 1.8 + 0.4;
    sc.globalAlpha = 0.35 + rand() * 0.6 * (1 - y / (H * 0.5));
    sc.fillStyle = "#fff6e8";
    sc.beginPath();
    sc.arc(x, y, r, 0, Math.PI * 2);
    sc.fill();
  }
  sc.globalAlpha = 1;
  stars.opacity = 0.85;
  stars.blend = "screen";

  // Sun glow
  const sun = doc.makeLayer("Sun");
  doc.layers.push(stars, sun);
  doc.activeLayerId = sun.id;
  const sx = W * 0.64;
  const sy = H * 0.6;
  const su = sun.canvas.getContext("2d")!;
  const glow = su.createRadialGradient(sx, sy, 0, sx, sy, W * 0.36);
  glow.addColorStop(0, "rgba(255,214,150,0.9)");
  glow.addColorStop(0.25, "rgba(255,160,110,0.35)");
  glow.addColorStop(1, "rgba(255,120,90,0)");
  su.fillStyle = glow;
  su.fillRect(0, 0, W, H);
  su.fillStyle = "#ffe7b8";
  su.beginPath();
  su.arc(sx, sy, W * 0.055, 0, Math.PI * 2);
  su.fill();
  sun.blend = "screen";

  // Hills: filled silhouettes, then painterly strokes along the ridges.
  const hills = doc.makeLayer("Hills");
  doc.layers.push(hills);
  doc.activeLayerId = hills.id;
  const hc = hills.canvas.getContext("2d")!;
  const ranges = [
    { base: 0.66, amp: 0.07, color: "#6b3a6e", ridge: "#b25f7f", freq: 2.1 },
    { base: 0.74, amp: 0.06, color: "#43285a", ridge: "#7d4577", freq: 3.3 },
    { base: 0.83, amp: 0.05, color: "#24173a", ridge: "#4d2a55", freq: 1.6 },
  ];
  ranges.forEach((r, k) => {
    const phase = rand() * 6;
    const yAt = (x: number) =>
      H * (r.base - r.amp * (Math.sin((x / W) * Math.PI * r.freq + phase) * 0.6 + Math.sin((x / W) * Math.PI * r.freq * 2.7 + phase * 2) * 0.4));
    hc.fillStyle = r.color;
    hc.beginPath();
    hc.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) hc.lineTo(x, yAt(x));
    hc.lineTo(W, H);
    hc.closePath();
    hc.fill();
    const ridge: [number, number][] = [];
    for (let x = -20; x <= W + 20; x += W / 14) ridge.push([x, yAt(x) + 6 + k * 2]);
    doc.paintPath(preset("marker", { size: 16 - k * 3, opacity: 0.5 }), hexToRgb(r.ridge)!, path(ridge, false, 10), { record: false });
  });

  // Ink: birds and a few hand-drawn accents.
  const ink = doc.makeLayer("Ink");
  doc.layers.push(ink);
  doc.activeLayerId = ink.id;
  const pen = preset("ink", { size: 5 });
  const inkColor = hexToRgb("#1a1024")!;
  const birds = [
    [0.3, 0.3, 1],
    [0.36, 0.26, 0.8],
    [0.25, 0.36, 0.7],
    [0.42, 0.33, 0.6],
  ];
  for (const [bx, by, s] of birds) {
    const x = bx * W;
    const y = by * H;
    const w = 34 * s;
    doc.paintPath(pen, inkColor, path([[x - w, y - w * 0.3], [x - w * 0.45, y - w * 0.45], [x, y]], true, 10), { record: false });
    doc.paintPath(pen, inkColor, path([[x, y], [x + w * 0.45, y - w * 0.5], [x + w, y - w * 0.25]], true, 10), { record: false });
  }
  // Grass tufts on the foreground hill.
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = H * (0.9 + rand() * 0.08);
    const h = 30 + rand() * 50;
    const lean = (rand() - 0.5) * 30;
    doc.paintPath(preset("ink", { size: 4 }), inkColor, path([[x, y], [x + lean * 0.4, y - h * 0.55], [x + lean, y - h]], true, 8), { record: false });
  }
  // Warm haze near the horizon.
  const haze = doc.makeLayer("Haze");
  haze.opacity = 0.55;
  haze.blend = "soft-light";
  doc.layers.push(haze);
  doc.paintPath(preset("airbrush", { size: 420, flow: 0.06 }), hexToRgb("#ffb27a")!, path([[-100, H * 0.7], [W * 0.5, H * 0.66], [W + 100, H * 0.72]], false, 30), { record: false });
  doc.activeLayerId = ink.id;
  for (const l of doc.layers) l.rev++;
  doc.emit(true);
}
