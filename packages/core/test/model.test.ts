import { describe, expect, it } from "vitest";
import { createDocument, layout as L } from "../src/model/builder";
import {
  addTab,
  closeView,
  detachView,
  floatPanel,
  hidePanel,
  insertPanel,
  locatePanel,
  panelOfView,
  reorderTabs,
  restorePanel,
  sanitize,
  selectView,
  viewIds,
} from "../src/model/document";
import { edgeSlot, hitTest, nearestEdge, type HitScene } from "../src/model/docking";
import {
  findNode,
  findStage,
  insertBeside,
  layoutRects,
  normalize,
  panelsOf,
  removeNode,
  resizeBoundary,
} from "../src/model/tree";
import type { LayoutDocument, PanelNode, SplitNode } from "../src/model/types";

const panel = (id: string, ...views: string[]): PanelNode => ({
  kind: "panel",
  id,
  views,
  selected: views[0],
});

function ide(): LayoutDocument {
  return createDocument(
    L.row(
      [
        L.panel({ id: "left" }, L.view("files", { id: "files" }), L.view("search", { id: "search" })),
        L.stage(L.panel({ id: "docs" }, L.view("editor", { id: "a" }), L.view("editor", { id: "b" })), {
          id: "stage",
        }),
        L.panel({ id: "outline" }, L.view("outline", { id: "outline" })),
      ],
      [1, 3, 1],
    ),
  );
}

describe("builder", () => {
  it("compiles specs into a document with a view table", () => {
    const doc = ide();
    expect(viewIds(doc).sort()).toEqual(["a", "b", "files", "outline", "search"]);
    expect(doc.views.a).toEqual({ type: "editor" });
    expect(findStage(doc.root)?.id).toBe("stage");
    const root = doc.root as SplitNode;
    expect(root.weights.reduce((a, b) => a + b)).toBeCloseTo(1);
    expect(root.weights[1]).toBeCloseTo(0.6);
  });
  it("wraps bare views in panels and honours selected", () => {
    const doc = createDocument(L.panel({ selected: 1 }, L.view("x", { id: "1" }), L.view("x", { id: "2" })));
    expect(doc.root).toMatchObject({ kind: "panel", views: ["1", "2"], selected: "2" });
  });
  it("rejects duplicate ids and multiple stages", () => {
    expect(() => createDocument(L.row([L.view("x", { id: "a" }), L.view("x", { id: "a" })]))).toThrow(
      /duplicate/,
    );
    expect(() => createDocument(L.row([L.stage(), L.stage()]))).toThrow(/one stage/);
  });
  it("generates deterministic ids that avoid explicit ones", () => {
    const spec = L.row([L.view("x"), L.view("x", { id: "x-2" }), L.view("x"), L.view("y")]);
    const a = viewIds(createDocument(spec));
    expect(a).toEqual(["x-1", "x-2", "x-3", "y-1"]);
    expect(viewIds(createDocument(spec))).toEqual(a);
  });
  it("generates unique ids when omitted", () => {
    const doc = createDocument(L.row([L.view("x"), L.view("x"), L.view("x")]));
    expect(new Set(viewIds(doc)).size).toBe(3);
  });
});

describe("tree", () => {
  it("lays out weighted splits in unit space", () => {
    const rects = layoutRects(ide().root);
    expect(rects.get("left")!.rect).toMatchObject({ x: 0, w: 0.2 });
    expect(rects.get("docs")!.rect.x).toBeCloseTo(0.2);
    expect(rects.get("docs")!.rect.w).toBeCloseTo(0.6);
    expect(rects.get("stage")!.rect).toEqual(rects.get("docs")!.rect);
  });
  it("flattens aligned splits and collapses single children", () => {
    const nested: SplitNode = {
      kind: "split",
      id: "outer",
      axis: "x",
      weights: [0.5, 0.5],
      children: [
        panel("a", "1"),
        {
          kind: "split",
          id: "inner",
          axis: "x",
          weights: [0.5, 0.5],
          children: [panel("b", "2"), panel("c", "3")],
        },
      ],
    };
    const n = normalize(nested) as SplitNode;
    expect(n.children.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(n.weights).toEqual([0.5, 0.25, 0.25]);
    expect(
      normalize({ kind: "split", id: "s", axis: "y", weights: [1], children: [panel("a", "1")] }),
    ).toMatchObject({ id: "a" });
  });
  it("never removes the stage, and gives removed space to a neighbour", () => {
    const doc = ide();
    const without = removeNode(doc.root, "left") as SplitNode;
    expect(without.children.map((c) => c.id)).toEqual(["stage", "outline"]);
    expect(without.weights[0]).toBeCloseTo(0.8);
    expect(removeNode(doc.root, "stage")).toBe(doc.root);
    const emptied = removeNode(doc.root, "docs");
    expect(findStage(emptied)?.child).toBeUndefined();
  });
  it("inserts beside a node with a share", () => {
    const root = insertBeside(panel("a", "1"), "a", panel("b", "2"), "left", "s", 0.25) as SplitNode;
    expect(root.children.map((c) => c.id)).toEqual(["b", "a"]);
    expect(root.weights).toEqual([0.25, 0.75]);
    const below = insertBeside(root, "a", panel("c", "3"), "bottom", "t") as SplitNode;
    expect(findNode(below, "t")).toMatchObject({ axis: "y" });
  });
  it("clamps boundary resizes to minimum sizes", () => {
    const split: SplitNode = {
      kind: "split",
      id: "s",
      axis: "x",
      weights: [0.5, 0.5],
      children: [panel("a", "1"), panel("b", "2")],
    };
    expect(resizeBoundary(split, 0, 0.3).weights[0]).toBeCloseTo(0.3);
    expect(resizeBoundary(split, 0, 0.01, () => 0.2).weights[0]).toBeCloseTo(0.2);
    expect(resizeBoundary(split, 0, 0.99, () => 0.2).weights[1]).toBeCloseTo(0.2);
  });
});

describe("document operations", () => {
  it("closes views, removing empty panels but keeping the stage", () => {
    let doc = ide();
    doc = closeView(doc, "a");
    expect(locatePanel(doc, "docs")?.panel.selected).toBe("b");
    doc = closeView(doc, "b");
    expect(locatePanel(doc, "docs")).toBeNull();
    expect(findStage(doc.root)).toMatchObject({ id: "stage", child: undefined });
    expect(doc.views.a).toBeUndefined();
  });
  it("detaches a view and re-adds it as a tab at an index", () => {
    let doc = detachView(ide(), "b");
    expect(doc.views.b).toBeDefined();
    doc = addTab(doc, "left", "b", 1);
    expect(locatePanel(doc, "left")?.panel).toMatchObject({ views: ["files", "b", "search"], selected: "b" });
  });
  it("selects and reorders tabs", () => {
    let doc = selectView(ide(), "b");
    expect(panelOfView(doc, "b")?.selected).toBe("b");
    doc = reorderTabs(doc, "docs", ["b", "a"]);
    expect(panelOfView(doc, "a")?.views).toEqual(["b", "a"]);
    expect(reorderTabs(doc, "docs", ["a"])).toBe(doc);
  });
  it("docks into an empty stage and as tabs into an occupied one", () => {
    let doc = closeView(closeView(ide(), "a"), "b");
    doc = { ...doc, views: { ...doc.views, n: { type: "editor" } } };
    doc = insertPanel(doc, panel("p1", "n"), { into: "stage" });
    expect(findStage(doc.root)?.child).toMatchObject({ id: "p1" });
    doc = { ...doc, views: { ...doc.views, m: { type: "editor" } } };
    doc = insertPanel(doc, panel("p2", "m"), { into: "stage" });
    expect(locatePanel(doc, "p1")?.panel.views).toEqual(["n", "m"]);
  });
  it("floats, hides and restores panels to their previous place", () => {
    let doc = ide();
    doc = hidePanel(doc, "outline");
    expect(doc.hidden[0].restore).toMatchObject({ kind: "docked", beside: "stage", edge: "right" });
    expect(panelsOf(doc.root).map((p) => p.id)).not.toContain("outline");
    doc = restorePanel(doc, "outline", "overlay");
    const root = doc.root as SplitNode;
    expect(root.children.map((c) => c.id)).toEqual(["left", "stage", "outline"]);
    expect(root.weights[2]).toBeCloseTo(0.2);
    const floating = floatPanel(
      doc,
      locatePanel(doc, "outline")!.panel,
      { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
      "overlay",
    );
    expect(floating.floating).toHaveLength(1);
    const hidden = hidePanel(floating, "outline");
    expect(hidden.hidden[0].restore).toMatchObject({ kind: "floating", layer: "overlay" });
    expect(restorePanel(hidden, "outline", "overlay").floating).toHaveLength(1);
  });
  it("sanitizes broken documents", () => {
    const broken = {
      schema: 1,
      root: {
        kind: "split",
        id: "s",
        axis: "x",
        weights: [NaN, 2],
        children: [
          panel("p", "a", "ghost"),
          panel("q", "a"),
          { kind: "stage", id: "st1" },
          { kind: "stage", id: "st2" },
        ],
      },
      floating: [{ panel: panel("f", "c"), rect: { x: 5, y: -1, w: 3, h: 0 }, z: 1, layer: "weird" }],
      hidden: [],
      views: { a: { type: "x" }, c: { type: "x" }, orphan: { type: "x" } },
    } as unknown as LayoutDocument;
    const doc = sanitize(broken);
    expect(viewIds(doc).sort()).toEqual(["a", "c"]);
    expect(doc.views.orphan).toBeUndefined();
    expect(panelsOf(doc.root).map((p) => p.id)).toEqual(["p"]);
    expect(doc.floating[0].layer).toBe("overlay");
    expect(doc.floating[0].rect.w).toBeLessThanOrEqual(1);
    let stages = 0;
    JSON.stringify(doc.root, (k, v) => {
      if (k === "kind" && v === "stage") stages++;
      return v;
    });
    expect(stages).toBe(1);
  });
});

describe("hit testing", () => {
  const scene = (overrides: Partial<HitScene> = {}): HitScene => ({
    viewport: { x: 0, y: 0, w: 1000, h: 600 },
    rootId: "root",
    stage: null,
    panels: [
      {
        id: "a",
        rect: { x: 0, y: 0, w: 500, h: 600 },
        tabbar: { x: 0, y: 0, w: 500, h: 34 },
        tabs: [
          { x: 4, y: 0, w: 100, h: 34 },
          { x: 106, y: 0, w: 100, h: 34 },
        ],
        region: "side",
        floating: false,
        z: 0,
      },
      {
        id: "b",
        rect: { x: 500, y: 0, w: 500, h: 600 },
        tabbar: { x: 500, y: 0, w: 500, h: 34 },
        tabs: [],
        region: "side",
        floating: false,
        z: 0,
      },
    ],
    allowed: () => true,
    ...overrides,
  });
  it("finds edges within the band", () => {
    expect(nearestEdge({ x: 5, y: 50 }, { x: 0, y: 0, w: 100, h: 100 })).toBe("left");
    expect(nearestEdge({ x: 50, y: 50 }, { x: 0, y: 0, w: 100, h: 100 })).toBeNull();
    expect(edgeSlot({ x: 0, y: 0, w: 100, h: 100 }, "right")).toEqual({ x: 50, y: 0, w: 50, h: 100 });
  });
  it("targets tab positions in the tab bar", () => {
    expect(hitTest(scene(), { x: 30, y: 15 })).toMatchObject({ kind: "tab", panel: "a", index: 0 });
    expect(hitTest(scene(), { x: 200, y: 15 })).toMatchObject({ kind: "tab", panel: "a", index: 2 });
  });
  it("splits at panel edges, merges in the centre, docks at the perimeter", () => {
    expect(hitTest(scene(), { x: 480, y: 300 })).toMatchObject({ kind: "split", beside: "a", edge: "right" });
    expect(hitTest(scene(), { x: 250, y: 320 })).toMatchObject({ kind: "tab", panel: "a", index: 2 });
    expect(hitTest(scene(), { x: 5, y: 300 })).toMatchObject({ kind: "split", beside: "root", edge: "left" });
  });
  it("respects allow rules", () => {
    const s = scene({ allowed: (r) => r !== "side" });
    expect(hitTest(s, { x: 250, y: 320 })).toBeNull();
  });
  it("prefers floating panels on top", () => {
    const s = scene();
    s.panels.push({
      id: "f",
      rect: { x: 200, y: 200, w: 200, h: 200 },
      tabbar: { x: 200, y: 200, w: 200, h: 34 },
      tabs: [],
      region: "floating",
      floating: true,
      z: 5,
    });
    expect(hitTest(s, { x: 300, y: 300 })).toMatchObject({ kind: "tab", panel: "f" });
  });
  it("docks into an empty stage centre and beside it at its edges", () => {
    const s = scene({
      panels: [],
      rootId: "root",
      stage: { id: "stage", rect: { x: 200, y: 0, w: 600, h: 600 }, empty: true },
    });
    expect(hitTest(s, { x: 500, y: 300 })).toMatchObject({ kind: "stage" });
    expect(hitTest(s, { x: 220, y: 300 })).toMatchObject({ kind: "split", beside: "stage", edge: "left" });
  });
  it("falls back to floating outside targets when allowed", () => {
    expect(hitTest(scene(), { x: 2000, y: 2000 })).toEqual({ kind: "float" });
    expect(hitTest(scene({ allowed: (r) => r !== "floating" }), { x: 2000, y: 2000 })).toBeNull();
  });
});

describe("hit testing near the stage boundary", () => {
  it("lets tab bars win over the beside-the-stage band", () => {
    const scene: HitScene = {
      viewport: { x: 0, y: 0, w: 1000, h: 600 },
      rootId: "root",
      stage: { id: "stage", rect: { x: 200, y: 6, w: 600, h: 590 }, empty: false },
      panels: [
        {
          id: "p",
          rect: { x: 200, y: 6, w: 600, h: 590 },
          tabbar: { x: 200, y: 6, w: 600, h: 34 },
          tabs: [],
          region: "stage",
          floating: false,
          z: 0,
        },
      ],
      allowed: () => true,
    };
    expect(hitTest(scene, { x: 500, y: 12 })).toMatchObject({ kind: "tab", panel: "p" });
    expect(hitTest(scene, { x: 205, y: 300 })).toMatchObject({
      kind: "split",
      beside: "stage",
      edge: "left",
    });
  });
});
