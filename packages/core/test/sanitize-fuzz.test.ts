import { describe, expect, it } from "vitest";
import { createDocument, layout as L } from "../src/model/builder";
import { sanitize } from "../src/model/document";
import type { LayoutDocument, LayoutNode } from "../src/model/types";

/**
 * Saved layouts come back from servers, local storage and older versions of an app. Whatever
 * arrives, sanitize must not throw, and must return a document the workspace can trust.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const base = (): LayoutDocument => {
  const doc = createDocument(
    L.row(
      [
        L.panel({ id: "left" }, L.view("files", { id: "files" }), L.view("search", { id: "search" })),
        L.column([
          L.stage(L.panel({ id: "docs" }, L.view("editor", { id: "a" }), L.view("editor", { id: "b" }))),
          L.view("terminal", { id: "t" }),
        ]),
        L.view("outline", { id: "outline" }),
      ],
      [1, 3, 1],
    ),
  );
  doc.floating.push({
    panel: { kind: "panel", id: "fl", views: ["float"], selected: "float" },
    rect: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
    z: 2,
    layer: "overlay",
  });
  doc.views.float = { type: "files" };
  doc.hidden.push({
    panel: { kind: "panel", id: "hid", views: ["gone"], selected: "gone" },
    restore: { kind: "docked", beside: "left", edge: "right", share: 0.3 },
  });
  doc.views.gone = { type: "search" };
  doc.navigation = { frame: ["docs"], framings: [{ id: "f1", name: "Docs", frame: ["docs"] }] };
  return doc;
};

const JUNK: (() => unknown)[] = [
  () => null,
  () => undefined,
  () => 42,
  () => -1,
  () => NaN,
  () => Infinity,
  () => "text",
  () => "",
  () => true,
  () => [],
  () => [1, "two", null],
  () => ({}),
  () => ({ kind: "panel" }),
  () => ({ kind: "split", children: "nope" }),
  () => ({ kind: "stage", child: 7 }),
  () => ({ kind: "mystery", id: "m" }),
];

/** Every object and array inside a value, with a way to set or delete each of its entries. */
function slots(value: unknown, out: { owner: any; key: string | number }[] = []) {
  if (value && typeof value === "object")
    for (const key of Object.keys(value)) {
      out.push({ owner: value, key: Array.isArray(value) ? Number(key) : key });
      slots((value as any)[key], out);
    }
  return out;
}

function corrupt(doc: unknown, random: () => number, count: number) {
  for (let i = 0; i < count; i++) {
    const all = slots(doc);
    if (!all.length) return;
    const { owner, key } = all[Math.floor(random() * all.length)];
    const r = random();
    if (r < 0.15) delete owner[key];
    else if (r < 0.3) {
      // Something real from elsewhere in the document: duplicates, cycles of ids, wrong places.
      const donor = all[Math.floor(random() * all.length)];
      owner[key] = structuredClone(donor.owner[donor.key]);
    } else owner[key] = JUNK[Math.floor(random() * JUNK.length)]();
  }
}

function nodesOf(node: LayoutNode | null | undefined, out: LayoutNode[] = []): LayoutNode[] {
  if (!node) return out;
  out.push(node);
  if (node.kind === "split") node.children.forEach((c) => nodesOf(c, out));
  if (node.kind === "stage" && node.child) nodesOf(node.child, out);
  return out;
}

/** What the workspace relies on. */
function expectTrustworthy(doc: LayoutDocument) {
  expect(doc.schema).toBe(1);
  expect(Array.isArray(doc.floating)).toBe(true);
  expect(Array.isArray(doc.hidden)).toBe(true);
  expect(doc.views && typeof doc.views).toBe("object");
  const nodes = nodesOf(doc.root);
  const panels = [
    ...nodes.filter((n) => n.kind === "panel"),
    ...doc.floating.map((f) => f.panel),
    ...doc.hidden.map((h) => h.panel),
  ];
  const ids = [
    ...nodes.map((n) => n.id),
    ...doc.floating.map((f) => f.panel.id),
    ...doc.hidden.map((h) => h.panel.id),
  ];
  for (const id of ids) expect(typeof id === "string" && id.length > 0, `bad id ${String(id)}`).toBe(true);
  expect(new Set(ids).size, "node ids are unique").toBe(ids.length);
  expect(nodes.filter((n) => n.kind === "stage").length).toBeLessThanOrEqual(1);
  const seenViews = new Set<string>();
  for (const panel of panels) {
    expect(panel.kind).toBe("panel");
    expect(Array.isArray(panel.views) && panel.views.length > 0).toBe(true);
    expect(panel.views).toContain(panel.selected);
    for (const v of panel.views) {
      expect(typeof v).toBe("string");
      expect(doc.views[v]?.type, `view ${v} has a record`).toBeTypeOf("string");
      expect(seenViews.has(v), `view ${v} appears once`).toBe(false);
      seenViews.add(v);
    }
  }
  expect(Object.keys(doc.views).sort()).toEqual([...seenViews].sort());
  for (const node of nodes)
    if (node.kind === "split") {
      expect(node.axis === "x" || node.axis === "y").toBe(true);
      expect(node.children.length).toBeGreaterThanOrEqual(2);
      expect(node.weights.length).toBe(node.children.length);
      for (const w of node.weights) expect(Number.isFinite(w) && w > 0).toBe(true);
    }
  for (const f of doc.floating) {
    for (const k of ["x", "y", "w", "h"] as const) expect(Number.isFinite(f.rect[k])).toBe(true);
    expect(f.rect.w).toBeGreaterThan(0);
    expect(f.rect.h).toBeGreaterThan(0);
    expect(Number.isFinite(f.z)).toBe(true);
    expect(["stage", "overlay"]).toContain(f.layer);
  }
  for (const h of doc.hidden) {
    const r = h.restore;
    expect(["floating", "docked", "tab"]).toContain(r.kind);
    if (r.kind === "floating")
      for (const k of ["x", "y", "w", "h"] as const) expect(Number.isFinite(r.rect[k])).toBe(true);
    if (r.kind === "docked") {
      expect(typeof r.beside).toBe("string");
      expect(["left", "right", "top", "bottom"]).toContain(r.edge);
      expect(Number.isFinite(r.share)).toBe(true);
    }
    if (r.kind === "tab") expect(typeof r.panel).toBe("string");
  }
  if (doc.navigation !== undefined) {
    const nav = doc.navigation;
    if (nav.frame !== undefined) expect(nav.frame.every((id) => typeof id === "string")).toBe(true);
    if (nav.framings !== undefined)
      for (const f of nav.framings) {
        expect(typeof f.id).toBe("string");
        expect(typeof f.name).toBe("string");
        expect(f.frame.every((id) => typeof id === "string")).toBe(true);
      }
  }
  // It survives a round trip through JSON unchanged.
  expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
}

describe("sanitize, whatever arrives", () => {
  it("keeps a valid document as it is", () => {
    const doc = base();
    const clean = sanitize(structuredClone(doc));
    expectTrustworthy(clean);
    expect(clean.root).toEqual(doc.root);
    expect(clean.floating).toEqual(doc.floating);
    expect(clean.hidden).toEqual(doc.hidden);
    expect(clean.navigation).toEqual(doc.navigation);
  });

  it("accepts anything at all at the top level", () => {
    for (const junk of [null, undefined, 0, "", "{}", [], {}, { schema: 1 }, { root: 5, views: [] }])
      expectTrustworthy(sanitize(junk as unknown as LayoutDocument));
  });

  it("never throws, and always returns a trustworthy document, for thousands of corrupted layouts", () => {
    const random = rng(911);
    for (let i = 0; i < 3000; i++) {
      const doc = base() as unknown;
      corrupt(doc, random, 1 + Math.floor(random() * 6));
      let clean!: LayoutDocument;
      expect(() => (clean = sanitize(doc as LayoutDocument)), `case ${i}`).not.toThrow();
      expectTrustworthy(clean);
    }
  });
});
