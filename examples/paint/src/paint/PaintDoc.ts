import { StrokeEngine, type BrushSettings, type Point } from "./brush";
import type { RGB } from "./color";

export type Blend = "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "soft-light" | "difference" | "color";
export const BLEND_MODES: { value: Blend; label: string }[] = [
  { value: "source-over", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "soft-light", label: "Soft Light" },
  { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" },
  { value: "color-dodge", label: "Color Dodge" },
  { value: "difference", label: "Difference" },
  { value: "color", label: "Color" },
];

export interface Layer {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  visible: boolean;
  opacity: number;
  blend: Blend;
  /** Bumped whenever this layer's pixels change (for thumbnails). */
  rev: number;
}

export type HistoryKind = "open" | "brush" | "eraser" | "fill" | "layer" | "clear" | "props" | "merge";
export interface HistoryEntry {
  label: string;
  kind: HistoryKind;
  key?: string;
  time: number;
  undo(): void;
  redo(): void;
}

export interface DocParams {
  name?: string;
  width?: number;
  height?: number;
  background?: string; // "transparent" or a hex color
  sample?: string;
  cloneOf?: string;
}

let uidCounter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`;

export function createCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: false })!;

const ZOOM_STEPS = [0.05, 0.083, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
const MAX_HISTORY = 60;

export class PaintDoc {
  readonly id: string;
  name: string;
  readonly width: number;
  readonly height: number;
  layers: Layer[] = [];
  activeLayerId = "";
  history: HistoryEntry[] = [];
  /** Number of history entries currently applied. */
  index = 0;
  savedIndex = 0;
  /** Screen transform: screen = view.x + doc * view.zoom (CSS px, relative to the canvas element). */
  view = { zoom: 1, x: 0, y: 0, fit: true };
  viewport = { w: 0, h: 0 };
  /** Any change (re-render React). */
  version = 0;
  /** Changes that affect the composite image. */
  pixels = 0;
  cursor: { x: number; y: number } | null = null;

  private listeners = new Set<() => void>();
  private buffer: HTMLCanvasElement;
  private scratch: HTMLCanvasElement;
  private compositeCanvas: HTMLCanvasElement;
  private compositeFor = -1;
  private stroke: { engine: StrokeEngine; layer: Layer; erase: boolean; opacity: number; label: string } | null = null;

  constructor(id: string, name: string, width: number, height: number, background: string) {
    this.id = id;
    this.name = name;
    this.width = width;
    this.height = height;
    this.buffer = createCanvas(width, height);
    this.scratch = createCanvas(width, height);
    this.compositeCanvas = createCanvas(width, height);
    const bg = this.makeLayer("Background");
    if (background !== "transparent") {
      const c = ctx2d(bg.canvas);
      c.fillStyle = background;
      c.fillRect(0, 0, width, height);
    }
    this.layers = [bg];
    this.activeLayerId = bg.id;
  }

  // ------------------------------------------------------------ subscription
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit(pixels = false) {
    this.version++;
    if (pixels) this.pixels++;
    for (const fn of [...this.listeners]) fn();
  }

  get dirty() {
    return this.index !== this.savedIndex;
  }
  get activeLayer(): Layer {
    return this.layers.find((l) => l.id === this.activeLayerId) ?? this.layers[this.layers.length - 1];
  }
  get painting() {
    return !!this.stroke;
  }
  markSaved() {
    this.savedIndex = this.index;
    this.emit();
  }

  // ------------------------------------------------------------ history
  push(entry: Omit<HistoryEntry, "time">) {
    const now = performance.now();
    const top = this.history[this.index - 1];
    if (entry.key && top && top.key === entry.key && this.index === this.history.length && now - top.time < 1500) {
      top.redo = entry.redo;
      top.time = now;
      if (this.savedIndex === this.index) this.savedIndex = -1;
      this.emit(true);
      return;
    }
    this.history.length = this.index;
    this.history.push({ ...entry, time: now });
    if (this.savedIndex > this.index) this.savedIndex = -1;
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
      this.savedIndex--;
    }
    this.index = this.history.length;
    this.emit(true);
  }
  undo() {
    if (this.stroke || this.index === 0) return;
    this.history[--this.index].undo();
    this.emit(true);
  }
  redo() {
    if (this.stroke || this.index >= this.history.length) return;
    this.history[this.index++].redo();
    this.emit(true);
  }
  goTo(index: number) {
    if (this.stroke) return;
    while (this.index > index) this.history[--this.index].undo();
    while (this.index < index && this.index < this.history.length) this.history[this.index++].redo();
    this.emit(true);
  }

  // ------------------------------------------------------------ layers
  makeLayer(name: string): Layer {
    return { id: uid("layer"), name, canvas: createCanvas(this.width, this.height), visible: true, opacity: 1, blend: "source-over", rev: 0 };
  }
  private layerIndex(id: string) {
    return this.layers.findIndex((l) => l.id === id);
  }
  private insert(layer: Layer, index: number, label: string, kind: HistoryKind = "layer") {
    const prevActive = this.activeLayerId;
    const apply = () => {
      this.layers.splice(index, 0, layer);
      this.activeLayerId = layer.id;
    };
    apply();
    this.push({
      label,
      kind,
      undo: () => {
        this.layers.splice(this.layerIndex(layer.id), 1);
        this.activeLayerId = prevActive;
      },
      redo: apply,
    });
  }
  addLayer(name?: string) {
    const n = this.layers.length;
    const layer = this.makeLayer(name ?? `Layer ${n}`);
    this.insert(layer, this.layerIndex(this.activeLayerId) + 1, "New Layer");
    return layer;
  }
  duplicateLayer(id = this.activeLayerId) {
    const src = this.layers[this.layerIndex(id)];
    if (!src) return;
    const copy = { ...this.makeLayer(`${src.name} copy`), visible: src.visible, opacity: src.opacity, blend: src.blend };
    ctx2d(copy.canvas).drawImage(src.canvas, 0, 0);
    this.insert(copy, this.layerIndex(id) + 1, "Duplicate Layer");
  }
  deleteLayer(id = this.activeLayerId) {
    if (this.layers.length <= 1) return;
    const i = this.layerIndex(id);
    if (i < 0) return;
    const layer = this.layers[i];
    const prevActive = this.activeLayerId;
    const apply = () => {
      this.layers.splice(i, 1);
      if (this.activeLayerId === layer.id) this.activeLayerId = this.layers[Math.max(0, i - 1)].id;
    };
    apply();
    this.push({
      label: "Delete Layer",
      kind: "layer",
      undo: () => {
        this.layers.splice(i, 0, layer);
        this.activeLayerId = prevActive;
      },
      redo: apply,
    });
  }
  moveLayer(id: string, to: number) {
    const from = this.layerIndex(id);
    to = Math.max(0, Math.min(this.layers.length - 1, to));
    if (from < 0 || from === to) return;
    const move = (a: number, b: number) => {
      const [l] = this.layers.splice(a, 1);
      this.layers.splice(b, 0, l);
    };
    move(from, to);
    this.push({ label: "Reorder Layers", kind: "layer", undo: () => move(to, from), redo: () => move(from, to) });
  }
  selectLayer(id: string) {
    if (this.layerIndex(id) < 0) return;
    this.activeLayerId = id;
    this.emit();
  }
  /** Change layer properties. Consecutive changes to the same property coalesce into one history step. */
  setLayer(id: string, patch: Partial<Pick<Layer, "name" | "visible" | "opacity" | "blend">>) {
    const layer = this.layers[this.layerIndex(id)];
    if (!layer) return;
    const before: Partial<Layer> = {};
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) (before as any)[k] = layer[k];
    Object.assign(layer, patch);
    const field = Object.keys(patch)[0];
    const labels: Record<string, string> = { name: "Rename Layer", visible: patch.visible ? "Show Layer" : "Hide Layer", opacity: "Layer Opacity", blend: "Blend Mode" };
    const key = field === "visible" ? undefined : `${field}:${id}`;
    this.push({
      label: labels[field] ?? "Layer Properties",
      kind: "props",
      key,
      undo: () => Object.assign(layer, before),
      redo: () => Object.assign(layer, patch),
    });
  }
  mergeDown(id = this.activeLayerId) {
    const i = this.layerIndex(id);
    if (i <= 0) return;
    const top = this.layers[i];
    const below = this.layers[i - 1];
    const before = ctx2d(below.canvas).getImageData(0, 0, this.width, this.height);
    const c = ctx2d(below.canvas);
    if (top.visible) {
      c.globalAlpha = top.opacity;
      c.globalCompositeOperation = top.blend;
      c.drawImage(top.canvas, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
    }
    const after = c.getImageData(0, 0, this.width, this.height);
    const apply = () => {
      ctx2d(below.canvas).putImageData(after, 0, 0);
      this.layers.splice(this.layerIndex(top.id), 1);
      this.activeLayerId = below.id;
      below.rev++;
    };
    apply();
    this.push({
      label: "Merge Down",
      kind: "merge",
      undo: () => {
        ctx2d(below.canvas).putImageData(before, 0, 0);
        this.layers.splice(this.layerIndex(below.id) + 1, 0, top);
        this.activeLayerId = top.id;
        below.rev++;
      },
      redo: apply,
    });
  }
  flatten() {
    if (this.layers.length <= 1) return;
    const prev = [...this.layers];
    const prevActive = this.activeLayerId;
    const flat = this.makeLayer("Background");
    ctx2d(flat.canvas).drawImage(this.composite(), 0, 0);
    const apply = () => {
      this.layers = [flat];
      this.activeLayerId = flat.id;
    };
    apply();
    this.push({
      label: "Flatten Image",
      kind: "merge",
      undo: () => {
        this.layers = [...prev];
        this.activeLayerId = prevActive;
      },
      redo: apply,
    });
  }

  // ------------------------------------------------------------ pixel edits
  /** Record a pixel change to `layer` within `rect`, given the pixels before it. */
  private recordPixels(layer: Layer, rect: { x: number; y: number; w: number; h: number }, before: ImageData, label: string, kind: HistoryKind) {
    const after = ctx2d(layer.canvas).getImageData(rect.x, rect.y, rect.w, rect.h);
    layer.rev++;
    this.push({
      label,
      kind,
      undo: () => {
        ctx2d(layer.canvas).putImageData(before, rect.x, rect.y);
        layer.rev++;
      },
      redo: () => {
        ctx2d(layer.canvas).putImageData(after, rect.x, rect.y);
        layer.rev++;
      },
    });
  }
  private clampRect(x0: number, y0: number, x1: number, y1: number) {
    const x = Math.max(0, Math.floor(x0));
    const y = Math.max(0, Math.floor(y0));
    const r = Math.min(this.width, Math.ceil(x1));
    const b = Math.min(this.height, Math.ceil(y1));
    return r > x && b > y ? { x, y, w: r - x, h: b - y } : null;
  }

  beginStroke(settings: BrushSettings, rgb: RGB, erase: boolean, point: Point) {
    const layer = this.activeLayer;
    if (!layer.visible) return false;
    const b = ctx2d(this.buffer);
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalAlpha = 1;
    b.clearRect(0, 0, this.width, this.height);
    this.stroke = {
      engine: new StrokeEngine(b, settings, rgb),
      layer,
      erase,
      opacity: settings.opacity,
      label: erase ? "Eraser" : "Brush Stroke",
    };
    this.stroke.engine.add(point);
    this.emit(true);
    return true;
  }
  strokeTo(points: Point[]) {
    if (!this.stroke) return;
    for (const p of points) this.stroke.engine.add(p);
    this.emit(true);
  }
  endStroke(last: Point | null) {
    const s = this.stroke;
    if (!s) return;
    s.engine.finish(last);
    this.stroke = null;
    const { x0, y0, x1, y1 } = s.engine.bounds;
    const rect = this.clampRect(x0, y0, x1, y1);
    if (!rect) return this.emit(true);
    const c = ctx2d(s.layer.canvas);
    const before = c.getImageData(rect.x, rect.y, rect.w, rect.h);
    c.globalAlpha = s.opacity;
    c.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    c.drawImage(this.buffer, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    this.recordPixels(s.layer, rect, before, s.label, s.erase ? "eraser" : "brush");
  }
  cancelStroke() {
    this.stroke = null;
    this.emit(true);
  }

  /** Paint programmatically (sample art, brush previews in tests). */
  paintPath(settings: BrushSettings, rgb: RGB, points: Point[], opts: { erase?: boolean; record?: boolean } = {}) {
    if (!points.length) return;
    if (!this.beginStroke(settings, rgb, !!opts.erase, points[0])) return;
    this.strokeTo(points.slice(1));
    if (opts.record === false) {
      const s = this.stroke!;
      this.stroke = null;
      const c = ctx2d(s.layer.canvas);
      c.globalAlpha = s.opacity;
      c.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      c.drawImage(this.buffer, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
      s.layer.rev++;
      this.emit(true);
    } else this.endStroke(null);
  }

  clearLayer(id = this.activeLayerId) {
    const layer = this.layers[this.layerIndex(id)];
    if (!layer) return;
    const c = ctx2d(layer.canvas);
    const before = c.getImageData(0, 0, this.width, this.height);
    c.clearRect(0, 0, this.width, this.height);
    this.recordPixels(layer, { x: 0, y: 0, w: this.width, h: this.height }, before, "Clear Layer", "clear");
  }
  fillLayer(rgb: RGB, id = this.activeLayerId) {
    const layer = this.layers[this.layerIndex(id)];
    if (!layer) return;
    const c = ctx2d(layer.canvas);
    const before = c.getImageData(0, 0, this.width, this.height);
    c.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    c.fillRect(0, 0, this.width, this.height);
    this.recordPixels(layer, { x: 0, y: 0, w: this.width, h: this.height }, before, "Fill Layer", "fill");
  }

  /** Flood fill the active layer, sampling the visible image. */
  floodFill(px: number, py: number, rgb: RGB, opacity = 1, tolerance = 40) {
    const layer = this.activeLayer;
    if (!layer.visible) return;
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const W = this.width;
    const H = this.height;
    if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
    const src = ctx2d(this.composite()).getImageData(0, 0, W, H).data;
    const at = (x: number, y: number) => (y * W + x) * 4;
    const i0 = at(x0, y0);
    const t = [src[i0], src[i0 + 1], src[i0 + 2], src[i0 + 3]];
    const tol = tolerance * tolerance * 4;
    const match = (i: number) => {
      const dr = src[i] - t[0];
      const dg = src[i + 1] - t[1];
      const db = src[i + 2] - t[2];
      const da = src[i + 3] - t[3];
      return dr * dr + dg * dg + db * db + da * da <= tol;
    };
    const mask = new Uint8Array(W * H);
    const stack: number[] = [x0, y0];
    let minX = x0, maxX = x0, minY = y0, maxY = y0;
    while (stack.length) {
      const y = stack.pop()!;
      let x = stack.pop()!;
      while (x >= 0 && !mask[y * W + x] && match(at(x, y))) x--;
      x++;
      let up = false;
      let down = false;
      while (x < W && !mask[y * W + x] && match(at(x, y))) {
        mask[y * W + x] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y > 0) {
          const m = !mask[(y - 1) * W + x] && match(at(x, y - 1));
          if (m && !up) stack.push(x, y - 1);
          up = m;
        }
        if (y < H - 1) {
          const m = !mask[(y + 1) * W + x] && match(at(x, y + 1));
          if (m && !down) stack.push(x, y + 1);
          down = m;
        }
        x++;
      }
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // Grow by one pixel so fills tuck under anti-aliased edges.
    const rect = this.clampRect(minX - 1, minY - 1, maxX + 2, maxY + 2)!;
    const fill = new ImageData(rect.w, rect.h);
    for (let y = rect.y; y < rect.y + rect.h; y++)
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const hit =
          mask[y * W + x] ||
          (x > 0 && mask[y * W + x - 1]) ||
          (x < W - 1 && mask[y * W + x + 1]) ||
          (y > 0 && mask[(y - 1) * W + x]) ||
          (y < H - 1 && mask[(y + 1) * W + x]);
        if (!hit) continue;
        const o = ((y - rect.y) * rect.w + (x - rect.x)) * 4;
        fill.data[o] = rgb.r;
        fill.data[o + 1] = rgb.g;
        fill.data[o + 2] = rgb.b;
        fill.data[o + 3] = 255;
      }
    const tmp = createCanvas(rect.w, rect.h);
    ctx2d(tmp).putImageData(fill, 0, 0);
    const c = ctx2d(layer.canvas);
    const before = c.getImageData(rect.x, rect.y, rect.w, rect.h);
    c.globalAlpha = opacity;
    c.drawImage(tmp, rect.x, rect.y);
    c.globalAlpha = 1;
    this.recordPixels(layer, rect, before, "Paint Bucket", "fill");
  }

  sample(px: number, py: number): RGB | null {
    const x = Math.floor(px);
    const y = Math.floor(py);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const d = ctx2d(this.composite()).getImageData(x, y, 1, 1).data;
    if (d[3] === 0) return null;
    return { r: d[0], g: d[1], b: d[2] };
  }

  // ------------------------------------------------------------ rendering
  /** The flattened image, including a stroke in progress. Cached between changes. */
  composite(): HTMLCanvasElement {
    if (this.compositeFor === this.pixels) return this.compositeCanvas;
    const c = ctx2d(this.compositeCanvas);
    c.clearRect(0, 0, this.width, this.height);
    for (const layer of this.layers) {
      if (!layer.visible) continue;
      let source = layer.canvas;
      if (this.stroke && this.stroke.layer === layer) {
        const s = ctx2d(this.scratch);
        s.globalAlpha = 1;
        s.globalCompositeOperation = "copy";
        s.drawImage(layer.canvas, 0, 0);
        s.globalAlpha = this.stroke.opacity;
        s.globalCompositeOperation = this.stroke.erase ? "destination-out" : "source-over";
        s.drawImage(this.buffer, 0, 0);
        s.globalAlpha = 1;
        s.globalCompositeOperation = "source-over";
        source = this.scratch;
      }
      c.globalAlpha = layer.opacity;
      c.globalCompositeOperation = layer.blend;
      c.drawImage(source, 0, 0);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    this.compositeFor = this.pixels;
    return this.compositeCanvas;
  }

  toBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => this.composite().toBlob((b) => (b ? resolve(b) : reject(Error("export failed"))), "image/png"));
  }

  /** Copy another document's layers (Duplicate). */
  copyFrom(other: PaintDoc) {
    this.layers = other.layers.map((l) => {
      const copy = { ...this.makeLayer(l.name), visible: l.visible, opacity: l.opacity, blend: l.blend };
      ctx2d(copy.canvas).drawImage(l.canvas, 0, 0);
      return copy;
    });
    const i = other.layers.findIndex((l) => l.id === other.activeLayerId);
    this.activeLayerId = this.layers[Math.max(0, i)].id;
    this.emit(true);
  }

  // ------------------------------------------------------------ viewport
  setViewport(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    const prev = this.viewport;
    this.viewport = { w, h };
    if (this.view.fit || prev.w === 0) this.fit(false);
    else {
      // Keep the same document point at the centre.
      this.view.x += (w - prev.w) / 2;
      this.view.y += (h - prev.h) / 2;
    }
    this.emit();
  }
  fitZoom() {
    const pad = Math.min(56, Math.min(this.viewport.w, this.viewport.h) * 0.08);
    return Math.max(0.02, Math.min((this.viewport.w - pad * 2) / this.width, (this.viewport.h - pad * 2) / this.height, 8));
  }
  fit(emit = true) {
    const z = this.fitZoom();
    this.view = { zoom: z, x: (this.viewport.w - this.width * z) / 2, y: (this.viewport.h - this.height * z) / 2, fit: true };
    if (emit) this.emit();
  }
  zoomTo(zoom: number, anchor = { x: this.viewport.w / 2, y: this.viewport.h / 2 }) {
    const z = Math.max(0.02, Math.min(32, zoom));
    const dx = (anchor.x - this.view.x) / this.view.zoom;
    const dy = (anchor.y - this.view.y) / this.view.zoom;
    this.view = { zoom: z, x: anchor.x - dx * z, y: anchor.y - dy * z, fit: false };
    this.clampView();
    this.emit();
  }
  zoomStep(dir: 1 | -1) {
    const z = this.view.zoom;
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z * 1.01) : [...ZOOM_STEPS].reverse().find((s) => s < z * 0.99);
    this.zoomTo(next ?? z);
  }
  panBy(dx: number, dy: number) {
    this.view = { ...this.view, x: this.view.x + dx, y: this.view.y + dy, fit: false };
    this.clampView();
    this.emit();
  }
  /** Center the view on a document point. */
  centerOn(x: number, y: number) {
    this.view = { ...this.view, x: this.viewport.w / 2 - x * this.view.zoom, y: this.viewport.h / 2 - y * this.view.zoom, fit: false };
    this.clampView();
    this.emit();
  }
  private clampView() {
    // Keep at least a sliver of the document on screen.
    const m = 48;
    const v = this.view;
    const w = this.width * v.zoom;
    const h = this.height * v.zoom;
    v.x = Math.min(this.viewport.w - m, Math.max(m - w, v.x));
    v.y = Math.min(this.viewport.h - m, Math.max(m - h, v.y));
  }
  toDoc(sx: number, sy: number) {
    return { x: (sx - this.view.x) / this.view.zoom, y: (sy - this.view.y) / this.view.zoom };
  }
}
