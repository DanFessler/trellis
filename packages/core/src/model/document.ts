import {
  findNode,
  findStage,
  insertBeside,
  normalize,
  panelsOf,
  removeNode,
  replaceNode,
} from "./tree";
import type {
  Edge,
  FloatingLayer,
  FloatingPanel,
  LayoutDocument,
  LayoutNode,
  PanelNode,
  Rect,
  RestoreTarget,
  SplitNode,
} from "./types";

let counter = 0;
/** Short unique ids for panels and splits. Views may use caller-supplied ids. */
export function uid(prefix: string): string {
  counter = (counter + 1) % 1e6;
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${random}${counter.toString(36)}`;
}

export function emptyDocument(): LayoutDocument {
  return { schema: 1, root: null, floating: [], hidden: [], views: {} };
}

export type PanelLocation =
  | { where: "docked"; panel: PanelNode }
  | { where: "floating"; panel: PanelNode; float: FloatingPanel }
  | { where: "hidden"; panel: PanelNode; restore: RestoreTarget };

export function allPanels(doc: LayoutDocument): PanelNode[] {
  return [
    ...panelsOf(doc.root),
    ...doc.floating.map((f) => f.panel),
    ...doc.hidden.map((h) => h.panel),
  ];
}

export function locatePanel(
  doc: LayoutDocument,
  panelId: string,
): PanelLocation | null {
  const docked = findNode(doc.root, panelId);
  if (docked?.kind === "panel") return { where: "docked", panel: docked };
  const float = doc.floating.find((f) => f.panel.id === panelId);
  if (float) return { where: "floating", panel: float.panel, float };
  const hidden = doc.hidden.find((h) => h.panel.id === panelId);
  if (hidden)
    return { where: "hidden", panel: hidden.panel, restore: hidden.restore };
  return null;
}

export function panelOfView(
  doc: LayoutDocument,
  viewId: string,
): PanelNode | null {
  return allPanels(doc).find((p) => p.views.includes(viewId)) ?? null;
}

/** Replace a panel wherever it lives. An empty panel is removed. */
export function updatePanel(
  doc: LayoutDocument,
  panel: PanelNode,
): LayoutDocument {
  if (!panel.views.length) return removePanel(doc, panel.id);
  if (!panel.views.includes(panel.selected))
    panel = { ...panel, selected: panel.views[0] };
  const location = locatePanel(doc, panel.id);
  if (!location) return doc;
  if (location.where === "docked")
    return { ...doc, root: replaceNode(doc.root, panel.id, panel) };
  if (location.where === "floating")
    return {
      ...doc,
      floating: doc.floating.map((f) =>
        f.panel.id === panel.id ? { ...f, panel } : f,
      ),
    };
  return {
    ...doc,
    hidden: doc.hidden.map((h) =>
      h.panel.id === panel.id ? { ...h, panel } : h,
    ),
  };
}

export function removePanel(
  doc: LayoutDocument,
  panelId: string,
): LayoutDocument {
  const location = locatePanel(doc, panelId);
  if (!location) return doc;
  if (location.where === "docked")
    return { ...doc, root: removeNode(doc.root, panelId) };
  if (location.where === "floating")
    return {
      ...doc,
      floating: doc.floating.filter((f) => f.panel.id !== panelId),
    };
  return { ...doc, hidden: doc.hidden.filter((h) => h.panel.id !== panelId) };
}

/** Detach a view from its panel, keeping its record. */
export function detachView(
  doc: LayoutDocument,
  viewId: string,
): LayoutDocument {
  const panel = panelOfView(doc, viewId);
  if (!panel) return doc;
  const views = panel.views.filter((id) => id !== viewId);
  let selected = panel.selected;
  if (selected === viewId) {
    const index = panel.views.indexOf(viewId);
    selected = views[Math.min(index, views.length - 1)] ?? "";
  }
  return updatePanel(doc, { ...panel, views, selected });
}

export function closeView(
  doc: LayoutDocument,
  viewId: string,
): LayoutDocument {
  const next = detachView(doc, viewId);
  const views = { ...next.views };
  delete views[viewId];
  return { ...next, views };
}

export function selectView(
  doc: LayoutDocument,
  viewId: string,
): LayoutDocument {
  const panel = panelOfView(doc, viewId);
  if (!panel || panel.selected === viewId) return doc;
  return updatePanel(doc, { ...panel, selected: viewId });
}

export function addTab(
  doc: LayoutDocument,
  panelId: string,
  viewId: string,
  index?: number,
  select = true,
): LayoutDocument {
  const location = locatePanel(doc, panelId);
  if (!location) return doc;
  const views = location.panel.views.filter((id) => id !== viewId);
  views.splice(
    index === undefined ? views.length : Math.max(0, Math.min(index, views.length)),
    0,
    viewId,
  );
  return updatePanel(doc, {
    ...location.panel,
    views,
    selected: select ? viewId : location.panel.selected || viewId,
  });
}

export function reorderTabs(
  doc: LayoutDocument,
  panelId: string,
  order: string[],
): LayoutDocument {
  const location = locatePanel(doc, panelId);
  if (!location) return doc;
  const views = location.panel.views;
  if (
    order.length !== views.length ||
    order.some((id) => !views.includes(id))
  )
    return doc;
  return updatePanel(doc, { ...location.panel, views: order });
}

export type DockTarget =
  | { beside: string; edge: Edge; share?: number }
  | { into: string; index?: number };

/** Insert a panel that is not currently in the document. */
export function insertPanel(
  doc: LayoutDocument,
  panel: PanelNode,
  target: DockTarget,
): LayoutDocument {
  if ("into" in target) {
    const node = findNode(doc.root, target.into);
    if (node?.kind === "stage") {
      if (!node.child)
        return {
          ...doc,
          root: replaceNode(doc.root, node.id, { ...node, child: panel }),
        };
      const first = panelsOf(node.child)[0];
      return mergeInto(doc, panel, first.id, target.index);
    }
    return mergeInto(doc, panel, target.into, target.index);
  }
  if (!doc.root) return { ...doc, root: panel };
  if (!findNode(doc.root, target.beside))
    return insertPanel(doc, panel, { beside: doc.root.id, edge: target.edge });
  return {
    ...doc,
    root: insertBeside(
      doc.root,
      target.beside,
      panel,
      target.edge,
      uid("split"),
      target.share,
    ),
  };
}

function mergeInto(
  doc: LayoutDocument,
  panel: PanelNode,
  intoId: string,
  index?: number,
): LayoutDocument {
  const location = locatePanel(doc, intoId);
  if (!location) return doc;
  const views = [...location.panel.views];
  views.splice(index ?? views.length, 0, ...panel.views);
  return updatePanel(doc, {
    ...location.panel,
    views,
    selected: panel.selected,
  });
}

export function floatPanel(
  doc: LayoutDocument,
  panel: PanelNode,
  rect: Rect,
  layer: FloatingLayer,
): LayoutDocument {
  const z = Math.max(0, ...doc.floating.map((f) => f.z)) + 1;
  return {
    ...removePanel(doc, panel.id),
    floating: [
      ...removePanel(doc, panel.id).floating,
      { panel, rect: clampFloat(rect), z, layer },
    ],
  };
}

export function clampFloat(rect: Rect): Rect {
  const w = Math.min(1, Math.max(0.02, rect.w));
  const h = Math.min(1, Math.max(0.02, rect.h));
  return {
    w,
    h,
    x: Math.min(1 - Math.min(w, 0.05), Math.max(-w + 0.05, rect.x)),
    y: Math.min(1 - Math.min(h, 0.05), Math.max(0, rect.y)),
  };
}

export function raiseFloat(
  doc: LayoutDocument,
  panelId: string,
): LayoutDocument {
  const top = Math.max(0, ...doc.floating.map((f) => f.z));
  const float = doc.floating.find((f) => f.panel.id === panelId);
  if (!float || float.z === top) return doc;
  return {
    ...doc,
    floating: doc.floating.map((f) =>
      f.panel.id === panelId ? { ...f, z: top + 1 } : f,
    ),
  };
}

/** Remember how to restore a docked panel: beside a surviving neighbour. */
export function restoreTargetFor(
  doc: LayoutDocument,
  panelId: string,
): RestoreTarget | null {
  const location = locatePanel(doc, panelId);
  if (!location) return null;
  if (location.where === "floating")
    return {
      kind: "floating",
      rect: location.float.rect,
      layer: location.float.layer,
    };
  if (location.where === "hidden") return location.restore;
  const parent = parentSplit(doc.root, panelId);
  if (!parent) {
    const stage = findStage(doc.root);
    if (stage && stage.child?.id === panelId)
      return { kind: "tab", panel: stage.id };
    return { kind: "docked", beside: doc.root?.id ?? "", edge: "left", share: 0.5 };
  }
  const index = parent.children.findIndex((c) => c.id === panelId);
  const after = !!parent.children[index + 1];
  const neighbourIndex = after ? index + 1 : index - 1;
  const neighbour = parent.children[neighbourIndex];
  // The neighbour absorbs this panel's space, so restore the same fraction of their combined size.
  const own = parent.weights[index];
  const share = own / (own + parent.weights[neighbourIndex]);
  const edge: Edge =
    parent.axis === "x" ? (after ? "left" : "right") : after ? "top" : "bottom";
  return { kind: "docked", beside: neighbour.id, edge, share };
}

export function parentSplit(
  root: LayoutNode | null,
  id: string,
): SplitNode | null {
  if (!root || root.kind === "panel") return null;
  if (root.kind === "stage") return parentSplit(root.child ?? null, id);
  if (root.children.some((c) => c.id === id)) return root;
  for (const child of root.children) {
    const found = parentSplit(child, id);
    if (found) return found;
  }
  return null;
}

export function hidePanel(
  doc: LayoutDocument,
  panelId: string,
): LayoutDocument {
  const location = locatePanel(doc, panelId);
  if (!location || location.where === "hidden") return doc;
  const restore = restoreTargetFor(doc, panelId)!;
  const removed = removePanel(doc, panelId);
  return {
    ...removed,
    hidden: [...removed.hidden, { panel: location.panel, restore }],
  };
}

export function restorePanel(
  doc: LayoutDocument,
  panelId: string,
  fallbackLayer: FloatingLayer,
): LayoutDocument {
  const hidden = doc.hidden.find((h) => h.panel.id === panelId);
  if (!hidden) return doc;
  const without = {
    ...doc,
    hidden: doc.hidden.filter((h) => h.panel.id !== panelId),
  };
  const { restore, panel } = hidden;
  if (restore.kind === "floating")
    return floatPanel(without, panel, restore.rect, restore.layer);
  if (restore.kind === "tab") {
    const target = locatePanel(without, restore.panel);
    const node = findNode(without.root, restore.panel);
    if ((target && target.where !== "hidden") || node?.kind === "stage")
      return insertPanel(without, panel, { into: restore.panel });
  }
  if (restore.kind === "docked" && findNode(without.root, restore.beside))
    return insertPanel(without, panel, {
      beside: restore.beside,
      edge: restore.edge,
      share: restore.share,
    });
  if (without.root)
    return floatPanel(
      without,
      panel,
      { x: 0.25, y: 0.2, w: 0.5, h: 0.6 },
      fallbackLayer,
    );
  return { ...without, root: panel };
}

/** Repair anything inconsistent in a document from storage or a caller. */
export function sanitize(
  input: LayoutDocument,
  isKnownType: (type: string) => boolean = () => true,
): LayoutDocument {
  const doc: LayoutDocument = {
    schema: 1,
    version: input.version,
    root: input.root ?? null,
    floating: Array.isArray(input.floating) ? input.floating : [],
    hidden: Array.isArray(input.hidden) ? input.hidden : [],
    views: { ...(input.views ?? {}) },
    navigation: input.navigation,
  };
  const seen = new Set<string>();
  const seenPanels = new Set<string>();
  const keep = (id: string) => {
    const record = doc.views[id];
    if (!record || typeof record.type !== "string" || seen.has(id)) return false;
    if (!isKnownType(record.type)) return false;
    seen.add(id);
    return true;
  };
  const fixPanel = (panel: PanelNode): PanelNode | null => {
    if (!panel || panel.kind !== "panel" || seenPanels.has(panel.id)) return null;
    seenPanels.add(panel.id);
    const views = (panel.views ?? []).filter(keep);
    if (!views.length) return null;
    return {
      ...panel,
      views,
      selected: views.includes(panel.selected) ? panel.selected : views[0],
    };
  };
  let stages = 0;
  const fixNode = (node: LayoutNode): LayoutNode | null => {
    if (!node || typeof node !== "object") return null;
    if (node.kind === "panel") return fixPanel(node);
    if (node.kind === "stage") {
      if (stages++) return node.child ? fixNode(node.child) : null;
      const child = node.child ? fixNode(node.child) : null;
      return {
        kind: "stage",
        id: node.id,
        child: child?.kind === "stage" ? undefined : (child ?? undefined),
      };
    }
    if (node.kind === "split" && Array.isArray(node.children)) {
      const children: LayoutNode[] = [];
      const weights: number[] = [];
      node.children.forEach((c, i) => {
        const fixed = fixNode(c);
        if (fixed) {
          children.push(fixed);
          const w = node.weights?.[i];
          weights.push(Number.isFinite(w) && w > 0 ? w : 1);
        }
      });
      if (!children.length) return null;
      return normalize({
        kind: "split",
        id: node.id,
        axis: node.axis === "y" ? "y" : "x",
        weights,
        children,
      });
    }
    return null;
  };
  doc.root = doc.root ? fixNode(doc.root) : null;
  doc.root = doc.root ? normalize(doc.root) : null;
  doc.floating = doc.floating
    .map((f) => {
      const panel = f && fixPanel(f.panel);
      return panel
        ? {
            panel,
            rect: clampFloat(f.rect ?? { x: 0.2, y: 0.2, w: 0.4, h: 0.4 }),
            z: Number.isFinite(f.z) ? f.z : 1,
            layer: f.layer === "stage" ? ("stage" as const) : ("overlay" as const),
          }
        : null;
    })
    .filter((f): f is FloatingPanel => !!f);
  doc.hidden = doc.hidden
    .map((h) => {
      const panel = h && fixPanel(h.panel);
      return panel ? { panel, restore: h.restore ?? { kind: "floating", rect: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, layer: "overlay" } } : null;
    })
    .filter((h): h is NonNullable<typeof h> => !!h) as LayoutDocument["hidden"];
  for (const id of Object.keys(doc.views)) if (!seen.has(id)) delete doc.views[id];
  return doc;
}

export function viewIds(doc: LayoutDocument): string[] {
  return allPanels(doc).flatMap((p) => p.views);
}
