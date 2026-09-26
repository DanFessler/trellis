import { createContext, useContext, useMemo, useState } from "react";

export type Point = [number, number];
export interface Stroke {
  layer: string;
  color: string;
  size: number;
  points: Point[];
  /** Closed shapes are filled with this color. */
  fill?: string;
}
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
}

/** Logical artboard size; the canvas scales it to fit. */
export const BOARD = { w: 1000, h: 640 };

export const SWATCHES = ["#2f7d32", "#6fbf3a", "#b5e36a", "#1f5f5b", "#3a86c8", "#7b61d1", "#d04e7b", "#e0663d", "#f0a430", "#f2d45c", "#6b4a33", "#1c1f1a"];

function seed(): Stroke[] {
  const strokes: Stroke[] = [];
  // Lattice: diagonal slats.
  for (let i = -6; i <= 12; i++) {
    const x0 = i * 110;
    strokes.push({ layer: "lattice", color: "#c8b99a", size: 9, points: [[x0, 700], [x0 + 760, -60]] });
    strokes.push({ layer: "lattice", color: "#b9a886", size: 9, points: [[x0, -60], [x0 + 760, 700]] });
  }
  // Vine: a sinuous climb from bottom-left to top-right.
  const vine: Point[] = [];
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const x = 90 + t * 820;
    const y = 590 - t * 500 + Math.sin(t * Math.PI * 3.2) * 70;
    vine.push([x, y]);
  }
  strokes.push({ layer: "vine", color: "#3f6b2a", size: 7, points: vine });
  // Tendrils.
  const curl = (cx: number, cy: number, r: number, turns: number, dir: number): Point[] => {
    const pts: Point[] = [];
    for (let a = 0; a <= Math.PI * 2 * turns; a += 0.25) {
      const rr = r * (1 - a / (Math.PI * 2 * turns + 0.5));
      pts.push([cx + Math.cos(a * dir) * rr, cy + Math.sin(a * dir) * rr]);
    }
    return pts;
  };
  strokes.push({ layer: "vine", color: "#4d7d33", size: 3, points: curl(300, 330, 34, 1.6, 1) });
  strokes.push({ layer: "vine", color: "#4d7d33", size: 3, points: curl(640, 250, 28, 1.5, -1) });
  // Leaves along the vine.
  const leaf = (cx: number, cy: number, angle: number, len: number, color: string): Stroke => {
    const pts: Point[] = [];
    const steps = 18;
    for (let i = 0; i <= steps * 2; i++) {
      const t = i <= steps ? i / steps : 2 - i / steps;
      const side = i <= steps ? 1 : -1;
      const along = t * len;
      const width = Math.sin(t * Math.PI) * len * 0.34 * side;
      pts.push([cx + Math.cos(angle) * along - Math.sin(angle) * width, cy + Math.sin(angle) * along + Math.cos(angle) * width]);
    }
    return { layer: "leaves", color: "#3f7a26", size: 3, points: pts, fill: color };
  };
  const leaves: [number, number, number, number, string][] = [
    [170, 520, -2.2, 70, "#6fbf3a"],
    [250, 440, -0.5, 80, "#5aa832"],
    [395, 400, -2.4, 74, "#7fcf45"],
    [470, 330, -0.7, 90, "#5aa832"],
    [560, 245, -2.3, 66, "#6fbf3a"],
    [700, 205, -0.4, 84, "#7fcf45"],
    [790, 170, -2.1, 62, "#5aa832"],
    [870, 110, -0.9, 58, "#6fbf3a"],
  ];
  for (const [x, y, a, l, c] of leaves) strokes.push(leaf(x, y, a, l, c));
  // A few blossoms.
  for (const [x, y] of [[520, 300], [760, 150], [330, 450]] as Point[]) {
    const petals: Point[] = [];
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.1) {
      const r = 16 + Math.sin(a * 5) * 7;
      petals.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    strokes.push({ layer: "leaves", color: "#d9683f", size: 3, points: petals, fill: "#f2a07a" });
    strokes.push({ layer: "leaves", color: "#f2d45c", size: 9, points: [[x, y], [x + 0.5, y + 0.5]] });
  }
  return strokes;
}

interface DemoState {
  color: string;
  size: number;
  layers: Layer[];
  activeLayer: string;
  strokes: Stroke[];
  setColor(color: string): void;
  setSize(size: number): void;
  toggleLayer(id: string): void;
  setActiveLayer(id: string): void;
  addStroke(stroke: Stroke): void;
  undo(): void;
  clear(): void;
}

const Context = createContext<DemoState | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [color, setColor] = useState("#d04e7b");
  const [size, setSize] = useState(8);
  const [layers, setLayers] = useState<Layer[]>([
    { id: "leaves", name: "Leaves & blooms", visible: true },
    { id: "vine", name: "Vine", visible: true },
    { id: "lattice", name: "Lattice", visible: true },
  ]);
  const [activeLayer, setActiveLayer] = useState("leaves");
  const [strokes, setStrokes] = useState<Stroke[]>(seed);
  const value = useMemo<DemoState>(
    () => ({
      color,
      size,
      layers,
      activeLayer,
      strokes,
      setColor,
      setSize,
      setActiveLayer,
      toggleLayer: (id) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))),
      addStroke: (s) => setStrokes((all) => [...all, s]),
      undo: () => setStrokes((all) => (all.length > 0 ? all.slice(0, -1) : all)),
      clear: () => setStrokes(seed()),
    }),
    [color, size, layers, activeLayer, strokes],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDemo(): DemoState {
  const ctx = useContext(Context);
  if (!ctx) throw Error("useDemo outside DemoProvider");
  return ctx;
}

/** When each view's content first mounted. A remount would reset its clock. */
export const aliveSince = new Map<string, number>();
