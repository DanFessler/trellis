import type { RGB } from "./color";

export interface BrushSettings {
  /** Diameter in document pixels. */
  size: number;
  /** Maximum opacity of one stroke (0–1). Overlapping dabs never exceed it. */
  opacity: number;
  /** Paint deposited per dab (0–1). */
  flow: number;
  /** Edge hardness (0 = airbrush, 1 = crisp). */
  hardness: number;
  /** Dab spacing as a fraction of the diameter. */
  spacing: number;
  /** Stroke stabilization (0–1). */
  smoothing: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
}

export interface BrushPreset {
  id: string;
  name: string;
  settings: BrushSettings;
}

export const PRESETS: BrushPreset[] = [
  {
    id: "round",
    name: "Round",
    settings: { size: 18, opacity: 1, flow: 1, hardness: 0.85, spacing: 0.08, smoothing: 0.35, pressureSize: true, pressureOpacity: false },
  },
  {
    id: "ink",
    name: "Ink Pen",
    settings: { size: 7, opacity: 1, flow: 1, hardness: 1, spacing: 0.05, smoothing: 0.6, pressureSize: true, pressureOpacity: false },
  },
  {
    id: "pencil",
    name: "Pencil",
    settings: { size: 3, opacity: 0.85, flow: 0.8, hardness: 0.55, spacing: 0.12, smoothing: 0.2, pressureSize: false, pressureOpacity: true },
  },
  {
    id: "marker",
    name: "Marker",
    settings: { size: 30, opacity: 0.55, flow: 1, hardness: 0.7, spacing: 0.06, smoothing: 0.4, pressureSize: false, pressureOpacity: false },
  },
  {
    id: "airbrush",
    name: "Soft Airbrush",
    settings: { size: 140, opacity: 0.8, flow: 0.08, hardness: 0, spacing: 0.08, smoothing: 0.5, pressureSize: false, pressureOpacity: true },
  },
];

const tipCache = new Map<string, HTMLCanvasElement>();

/** A round dab of the given hardness, drawn once and scaled per dab. */
export function brushTip(diameter: number, hardness: number, rgb: RGB): HTMLCanvasElement {
  const d = Math.max(4, Math.min(512, Math.ceil(diameter)));
  const key = `${d}|${hardness.toFixed(2)}|${rgb.r},${rgb.g},${rgb.b}`;
  const hit = tipCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = d + 2;
  const ctx = c.getContext("2d")!;
  const r = d / 2;
  const g = ctx.createRadialGradient(r + 1, r + 1, 0, r + 1, r + 1, r);
  const col = (a: number) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  const inner = Math.min(0.97, hardness * 0.97);
  g.addColorStop(0, col(1));
  g.addColorStop(inner, col(1));
  // Smooth falloff from the hard core to the rim.
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    const u = inner + (1 - inner) * t;
    const a = 1 - t * t * (3 - 2 * t);
    g.addColorStop(Math.min(1, u), col(Math.max(0, a)));
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r + 1, r + 1, r, 0, Math.PI * 2);
  ctx.fill();
  if (tipCache.size > 64) tipCache.clear();
  tipCache.set(key, c);
  return c;
}

export interface Point {
  x: number;
  y: number;
  p: number;
}

/** Stamps dabs along a pointer path into a buffer canvas. */
export class StrokeEngine {
  bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  private pos: Point | null = null;
  private last: Point | null = null;
  private residual = 0;
  private tip: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: BrushSettings;

  constructor(ctx: CanvasRenderingContext2D, settings: BrushSettings, rgb: RGB) {
    this.ctx = ctx;
    this.settings = settings;
    this.tip = brushTip(settings.size, settings.hardness, rgb);
  }

  add(raw: Point) {
    const s = this.settings;
    if (!this.pos) {
      this.pos = { ...raw };
      this.last = { ...raw };
      this.dab(raw);
      return;
    }
    const k = 1 - Math.min(0.92, s.smoothing * 0.9);
    this.pos = {
      x: this.pos.x + (raw.x - this.pos.x) * k,
      y: this.pos.y + (raw.y - this.pos.y) * k,
      p: this.pos.p + (raw.p - this.pos.p) * Math.max(k, 0.5),
    };
    this.segmentTo(this.pos);
  }

  /** Catch up with the pointer so the stroke ends where the user lifted. */
  finish(raw: Point | null) {
    if (raw && this.pos && this.settings.smoothing > 0) this.segmentTo({ ...raw, p: this.pos.p });
  }

  private segmentTo(to: Point) {
    const from = this.last!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(0.4, this.settings.size * this.settings.spacing);
    let t = step - this.residual;
    while (t <= dist) {
      const u = t / dist;
      this.dab({ x: from.x + dx * u, y: from.y + dy * u, p: from.p + (to.p - from.p) * u });
      t += step;
    }
    this.residual = dist - (t - step);
    this.last = { ...to };
  }

  private dab({ x, y, p }: Point) {
    const s = this.settings;
    const pressure = Math.max(0, Math.min(1, p));
    const d = Math.max(0.6, s.size * (s.pressureSize ? 0.12 + 0.88 * pressure : 1));
    const alpha = s.flow * (s.pressureOpacity ? 0.15 + 0.85 * pressure : 1);
    const scale = d / (this.tip.width - 2);
    const w = this.tip.width * scale;
    this.ctx.globalAlpha = Math.min(1, alpha);
    this.ctx.drawImage(this.tip, x - w / 2, y - w / 2, w, w);
    const r = w / 2 + 1;
    const b = this.bounds;
    b.x0 = Math.min(b.x0, x - r);
    b.y0 = Math.min(b.y0, y - r);
    b.x1 = Math.max(b.x1, x + r);
    b.y1 = Math.max(b.y1, y + r);
  }
}
