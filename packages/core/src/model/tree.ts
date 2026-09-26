import type { Axis, Edge, LayoutNode, PanelNode, Rect, SplitNode, StageNode } from "./types";

export const UNIT: Rect = { x: 0, y: 0, w: 1, h: 1 };

export function edgeAxis(edge: Edge): Axis {
  return edge === "left" || edge === "right" ? "x" : "y";
}
export function edgeBefore(edge: Edge): boolean {
  return edge === "left" || edge === "top";
}

export interface Entry {
  node: LayoutNode;
  rect: Rect;
  parent: string | null;
}

/** World geometry of every node, as fractions of the whole layout. */
export function layoutRects(
  node: LayoutNode | null,
  rect: Rect = UNIT,
  parent: string | null = null,
  out = new Map<string, Entry>(),
): Map<string, Entry> {
  if (!node) return out;
  out.set(node.id, { node, rect, parent });
  if (node.kind === "stage") {
    if (node.child) layoutRects(node.child, rect, node.id, out);
  } else if (node.kind === "split") {
    const total = sum(node.weights);
    let offset = 0;
    node.children.forEach((child, i) => {
      const share = node.weights[i] / total;
      const r =
        node.axis === "x"
          ? { ...rect, x: rect.x + offset * rect.w, w: rect.w * share }
          : { ...rect, y: rect.y + offset * rect.h, h: rect.h * share };
      layoutRects(child, r, node.id, out);
      offset += share;
    });
  }
  return out;
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function findNode(node: LayoutNode | null | undefined, id: string): LayoutNode | null {
  if (!node) return null;
  if (node.id === id) return node;
  if (node.kind === "stage") return findNode(node.child, id);
  if (node.kind === "split")
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  return null;
}

export function panelsOf(node: LayoutNode | null | undefined): PanelNode[] {
  if (!node) return [];
  if (node.kind === "panel") return [node];
  if (node.kind === "stage") return panelsOf(node.child);
  return node.children.flatMap(panelsOf);
}

export function findStage(node: LayoutNode | null | undefined): StageNode | null {
  if (!node) return null;
  if (node.kind === "stage") return node;
  if (node.kind === "split")
    for (const child of node.children) {
      const stage = findStage(child);
      if (stage) return stage;
    }
  return null;
}

/** Whether `id` is `ancestor` or lies inside it. */
export function contains(root: LayoutNode | null, ancestor: string, id: string) {
  const node = findNode(root, ancestor);
  return !!node && !!findNode(node, id);
}

/** Collapse single-child splits, flatten aligned splits and drop empty ones.
 * Geometry is preserved. Stages are never removed. */
export function normalize(node: LayoutNode): LayoutNode | null {
  if (node.kind === "panel") return node.views.length ? node : null;
  if (node.kind === "stage") {
    const child = node.child ? normalize(node.child) : null;
    if ((child ?? undefined) === node.child) return node;
    return {
      ...node,
      child: (child as SplitNode | PanelNode | null) ?? undefined,
    };
  }
  const children: LayoutNode[] = [];
  const weights: number[] = [];
  node.children.forEach((child, i) => {
    const next = normalize(child);
    const raw = node.weights[i];
    const weight = Number.isFinite(raw) && raw > 0 ? raw : 1e-3;
    if (!next) return;
    if (next.kind === "split" && next.axis === node.axis) {
      const total = sum(next.weights);
      next.children.forEach((grandchild, j) => {
        children.push(grandchild);
        weights.push((weight * next.weights[j]) / total);
      });
    } else {
      children.push(next);
      weights.push(weight);
    }
  });
  if (!children.length) return null;
  if (children.length === 1) return children[0];
  const total = sum(weights);
  const normalized = weights.map((w) => w / total);
  if (
    children.length === node.children.length &&
    children.every(
      (child, i) => child === node.children[i] && Math.abs(normalized[i] - node.weights[i]) < 1e-12,
    )
  )
    return node;
  return { ...node, children, weights: normalized };
}

/** Remove a node. Its share goes to the next sibling (previous at the end). */
export function removeNode(root: LayoutNode | null, id: string): LayoutNode | null {
  if (!root) return null;
  if (root.id === id) return root.kind === "stage" ? root : null;
  if (root.kind === "panel") return root;
  if (root.kind === "stage") {
    if (!root.child) return root;
    if (root.child.id === id) return { ...root, child: undefined };
    const child = removeNode(root.child, id) as SplitNode | PanelNode | null;
    return child === root.child ? root : { ...root, child: child ?? undefined };
  }
  const index = root.children.findIndex((child) => child.id === id);
  if (index >= 0) {
    if (root.children[index].kind === "stage") return root;
    const children = [...root.children];
    const weights = [...root.weights];
    const removed = weights[index];
    children.splice(index, 1);
    weights.splice(index, 1);
    if (!children.length) return null;
    weights[Math.min(index, weights.length - 1)] += removed;
    return normalize({ ...root, children, weights });
  }
  let changed = false;
  const children: LayoutNode[] = [];
  const weights: number[] = [];
  root.children.forEach((child, i) => {
    const next = removeNode(child, id);
    if (next !== child) changed = true;
    if (next) {
      children.push(next);
      weights.push(root.weights[i]);
    } else if (weights.length) weights[weights.length - 1] += root.weights[i];
  });
  if (!changed) return root;
  if (!children.length) return null;
  return normalize({ ...root, children, weights });
}

/** Insert `incoming` beside `targetId`, taking `share` of the target's space. */
export function insertBeside(
  root: LayoutNode | null,
  targetId: string,
  incoming: LayoutNode,
  edge: Edge,
  splitId: string,
  share = 0.5,
): LayoutNode {
  if (!root) return incoming;
  share = Math.min(0.9, Math.max(0.1, share));
  const wrap = (target: LayoutNode): LayoutNode => {
    const before = edgeBefore(edge);
    return normalize({
      kind: "split",
      id: splitId,
      axis: edgeAxis(edge),
      weights: before ? [share, 1 - share] : [1 - share, share],
      children: before ? [incoming, target] : [target, incoming],
    })!;
  };
  if (root.id === targetId) return wrap(root);
  if (root.kind === "panel") return root;
  if (root.kind === "stage") {
    if (!root.child) return root;
    const child = insertBeside(root.child, targetId, incoming, edge, splitId, share);
    return child === root.child ? root : { ...root, child: child as SplitNode | PanelNode };
  }
  let changed = false;
  const children = root.children.map((child) => {
    const next = insertBeside(child, targetId, incoming, edge, splitId, share);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? normalize({ ...root, children })! : root;
}

export function replaceNode(root: LayoutNode | null, id: string, replacement: LayoutNode): LayoutNode | null {
  if (!root) return root;
  if (root.id === id) return replacement;
  if (root.kind === "panel") return root;
  if (root.kind === "stage") {
    if (!root.child) return root;
    const child = replaceNode(root.child, id, replacement);
    return child === root.child ? root : { ...root, child: child as SplitNode | PanelNode };
  }
  let changed = false;
  const children = root.children.map((child) => {
    const next = replaceNode(child, id, replacement)!;
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

/** Move the boundary after child `index` to `position` (fraction of the split).
 * `min` gives each child's minimum size as a fraction of the split. */
export function resizeBoundary(
  split: SplitNode,
  index: number,
  position: number,
  min: (childIndex: number) => number = () => 0.04,
): SplitNode {
  const weights = [...split.weights];
  const total = sum(weights);
  const normalized = weights.map((w) => w / total);
  const start = sum(normalized.slice(0, index));
  const pair = normalized[index] + normalized[index + 1];
  const lo = Math.min(min(index), pair / 2);
  const hi = pair - Math.min(min(index + 1), pair / 2);
  const left = Math.max(lo, Math.min(hi, position - start));
  normalized[index] = left;
  normalized[index + 1] = pair - left;
  return { ...split, weights: normalized };
}
