import { uid } from "./document";
import { normalize } from "./tree";
import type {
  Axis,
  FloatingLayer,
  LayoutDocument,
  LayoutNode,
  Params,
  PanelNode,
  Rect,
} from "./types";

/** Authoring nodes: a readable way to describe an initial layout. */
export type LayoutSpec = ViewSpec | PanelSpec | SplitSpec | StageSpec;
export interface ViewSpec {
  kind: "view";
  type: string;
  id?: string;
  params?: object;
  title?: string;
}
export interface PanelSpec {
  kind: "panel";
  id?: string;
  views: ViewSpec[];
  /** Index of the initially selected view. */
  selected?: number;
}
export interface SplitSpec {
  kind: "split";
  id?: string;
  axis: Axis;
  children: LayoutSpec[];
  weights?: number[];
}
export interface StageSpec {
  kind: "stage";
  id?: string;
  child?: LayoutSpec;
}
export interface FloatSpec {
  panel: PanelSpec | ViewSpec;
  rect: Rect;
  layer?: FloatingLayer;
}

export const layout = {
  view(type: string, options: Omit<ViewSpec, "kind" | "type"> = {}): ViewSpec {
    return { kind: "view", type, ...options };
  },
  panel(
    ...args: ViewSpec[] | [{ id?: string; selected?: number }, ...ViewSpec[]]
  ): PanelSpec {
    const [first, ...rest] = args;
    if (first && (first as ViewSpec).kind !== "view") {
      const options = first as { id?: string; selected?: number };
      return { kind: "panel", views: rest as ViewSpec[], ...options };
    }
    return { kind: "panel", views: args as ViewSpec[] };
  },
  split(
    axis: Axis,
    children: LayoutSpec[],
    options: { weights?: number[]; id?: string } = {},
  ): SplitSpec {
    return { kind: "split", axis, children, ...options };
  },
  row(children: LayoutSpec[], weights?: number[]): SplitSpec {
    return { kind: "split", axis: "x", children, weights };
  },
  column(children: LayoutSpec[], weights?: number[]): SplitSpec {
    return { kind: "split", axis: "y", children, weights };
  },
  stage(child?: LayoutSpec, options: { id?: string } = {}): StageSpec {
    return { kind: "stage", child, ...options };
  },
};

/** Compile a layout description into a document. */
export function createDocument(
  root: LayoutSpec | null,
  options: { floating?: FloatSpec[]; version?: string | number } = {},
): LayoutDocument {
  const views: LayoutDocument["views"] = {};
  const addView = (spec: ViewSpec) => {
    let id = spec.id ?? uid(spec.type);
    while (views[id] && !spec.id) id = uid(spec.type);
    if (views[id]) throw Error(`Trellis: duplicate view id "${id}"`);
    views[id] = {
      type: spec.type,
      ...(spec.params ? { params: spec.params as Params } : {}),
      ...(spec.title ? { title: spec.title } : {}),
    };
    return id;
  };
  const panel = (spec: PanelSpec | ViewSpec): PanelNode => {
    const specs = spec.kind === "view" ? [spec] : spec.views;
    const ids = specs.map(addView);
    const index = spec.kind === "panel" ? (spec.selected ?? 0) : 0;
    return {
      kind: "panel",
      id: (spec.kind === "panel" && spec.id) || uid("panel"),
      views: ids,
      selected: ids[Math.min(index, ids.length - 1)] ?? "",
    };
  };
  let stages = 0;
  const build = (spec: LayoutSpec): LayoutNode => {
    switch (spec.kind) {
      case "view":
      case "panel":
        return panel(spec);
      case "stage": {
        if (stages++) throw Error("Trellis: a layout may contain one stage");
        const child = spec.child ? build(spec.child) : undefined;
        if (child?.kind === "stage")
          throw Error("Trellis: a stage cannot contain a stage");
        return { kind: "stage", id: spec.id ?? "stage", child };
      }
      case "split": {
        const children = spec.children.map(build);
        const weights =
          spec.weights && spec.weights.length === children.length
            ? spec.weights
            : children.map(() => 1);
        return {
          kind: "split",
          id: spec.id ?? uid("split"),
          axis: spec.axis,
          weights,
          children,
        };
      }
    }
  };
  const tree = root ? normalize(build(root)) : null;
  return {
    schema: 1,
    ...(options.version !== undefined ? { version: options.version } : {}),
    root: tree,
    floating: (options.floating ?? []).map((f, i) => ({
      panel: panel(f.panel),
      rect: f.rect,
      z: i + 1,
      layer: f.layer ?? "overlay",
    })),
    hidden: [],
    views,
  };
}
