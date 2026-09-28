/** A rectangle. In the document, rects are fractions of their container (0–1). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Axis = "x" | "y";
export type Edge = "left" | "right" | "top" | "bottom";
export type Params = Record<string, unknown>;

/** A weighted row (`x`) or column (`y`) of panels, splits and at most one stage. */
export interface SplitNode {
  kind: "split";
  id: string;
  axis: Axis;
  /** Relative sizes. Normalized to sum to 1. */
  weights: number[];
  children: LayoutNode[];
}
/** A tab group of one or more views. The unit users drag, dock and float. */
export interface PanelNode {
  kind: "panel";
  id: string;
  views: string[];
  selected: string;
}
/** The primary region. Never collapses; default destination for new views. */
export interface StageNode {
  kind: "stage";
  id: string;
  child?: SplitNode | PanelNode;
}
export type LayoutNode = SplitNode | PanelNode | StageNode;

export type FloatingLayer = "stage" | "overlay";
export interface FloatingPanel {
  panel: PanelNode;
  /** Fractions of the stage (layer `stage`) or of the workspace (layer `overlay`). */
  rect: Rect;
  z: number;
  layer: FloatingLayer;
}
export type RestoreTarget =
  | { kind: "floating"; rect: Rect; layer: FloatingLayer }
  | { kind: "docked"; beside: string; edge: Edge; share: number }
  | { kind: "tab"; panel: string };
export interface HiddenPanel {
  panel: PanelNode;
  restore: RestoreTarget;
}
export interface ViewRecord {
  type: string;
  params?: Params;
  title?: string;
}
export interface Framing {
  id: string;
  name: string;
  frame: string[];
}

/** The complete, serializable workspace state. Persist it; hand it back later. */
export interface LayoutDocument {
  schema: 1;
  /** Your own layout version. A mismatch discards a persisted document. */
  version?: string | number;
  root: LayoutNode | null;
  floating: FloatingPanel[];
  hidden: HiddenPanel[];
  views: Record<string, ViewRecord>;
  navigation?: { frame?: string[]; framings?: Framing[] };
}

export type Placement =
  | "stage"
  | "float"
  | "side"
  | "tab"
  | { beside: string; edge: Edge; share?: number }
  | { into: string; index?: number }
  | { float: Rect; layer?: FloatingLayer };

export interface ViewRules {
  /** Where `open()` puts a view of this type unless the caller says otherwise. */
  placement?: Placement;
  /** Where users may drop it. Every region is allowed by default. */
  allow?: { stage?: boolean; side?: boolean; floating?: boolean };
  /** At most one instance; `open()` focuses the existing one. */
  singleton?: boolean;
  closable?: boolean;
  /** Content lays out at no less than this size and scales down below it. */
  minSize?: { width: number; height: number };
  /** Below `minSize`: "interactive" (default) scales content down and keeps it usable; "inert"
   * scales it down and ignores input until it's back at full size; `false` never scales it, so
   * content lays out at whatever size its panel has. */
  scaling?: "interactive" | "inert" | false;
  /** Tab bar: "always" (default) sits above the content; "auto" hides it while the view is alone
   * in its panel; "never" always hides it (rearrange from the menu or API); "overlay" lays it over
   * the top of a lone view, whose content extends underneath and draws its own title bar using
   * `--trellis-titlebar-height` and `--trellis-titlebar-inset-end`. */
  tabbar?: "always" | "auto" | "never" | "overlay";
}
