import assert from "node:assert/strict";
import { test } from "vitest";
import {
  dropPreview,
  edgeAt,
  workspace,
  type Bounds,
  type Side,
} from "./trellis-adapter";

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
function sameBounds(actual: Bounds, expected: Bounds) {
  for (const key of ["x", "y", "w", "h"] as const)
    near(actual[key], expected[key]);
}
function partitions(rects: Bounds[]) {
  near(
    rects.reduce((sum, r) => sum + r.w * r.h, 0),
    1,
  );
  for (const [i, r] of rects.entries()) {
    assert.ok(r.w > 0 && r.h > 0);
    assert.ok(
      r.x >= -1e-9 &&
        r.y >= -1e-9 &&
        r.x + r.w <= 1 + 1e-9 &&
        r.y + r.h <= 1 + 1e-9,
    );
    for (const other of rects.slice(i + 1)) {
      const overlapW =
        Math.min(r.x + r.w, other.x + other.w) - Math.max(r.x, other.x);
      const overlapH =
        Math.min(r.y + r.h, other.y + other.h) - Math.max(r.y, other.y);
      assert.ok(overlapW <= 1e-9 || overlapH <= 1e-9, "Views must not overlap");
    }
  }
}
for (const direction of ["row", "column"] as const) {
  test(`LAYOUT-01: splitting a view in a ${direction} halves its space and leaves other views untouched`, () => {
    const w = workspace({
      name: "workspace",
      direction,
      views: ["notes", "mail"],
      shares: [0.4, 0.6],
    });
    const untouched = w.bounds("mail"),
      original = w.bounds("notes");
    w.split("notes", "finder", direction);
    assert.deepEqual(w.bounds("mail"), untouched);
    const a = w.bounds("notes"),
      b = w.bounds("finder");
    near(a.w * a.h, (original.w * original.h) / 2);
    near(b.w * b.h, a.w * a.h);
    if (direction === "row") {
      near(a.x + a.w, b.x);
      near(a.y, b.y);
      near(a.h, b.h);
    } else {
      near(a.y + a.h, b.y);
      near(a.x, b.x);
      near(a.w, b.w);
    }
    partitions(w.views().map(w.bounds));
  });
  test(`LAYOUT-02: resizing a ${direction} seam changes only the adjacent views`, () => {
    const w = workspace({
      name: "workspace",
      direction,
      views: ["a", "b", "c", "d"],
      shares: [0.2, 0.3, 0.1, 0.4],
    });
    const a = w.bounds("a"),
      d = w.bounds("d");
    w.resize("workspace", 1, 0.4);
    assert.deepEqual(w.bounds("a"), a);
    sameBounds(w.bounds("d"), d);
    near(direction === "row" ? w.bounds("b").w : w.bounds("b").h, 0.2);
    partitions(w.views().map(w.bounds));
    for (const position of [-100, 100]) {
      w.resize("workspace", 1, position);
      partitions(w.views().map(w.bounds));
      assert.deepEqual(w.bounds("a"), a);
      sameBounds(w.bounds("d"), d);
    }
  });
}
for (const closing of ["b", "c"]) {
  test(`LAYOUT-03: closing ${closing} gives its space to the next neighbor, or previous at the end`, () => {
    const w = workspace({
      name: "workspace",
      direction: "row",
      views: ["a", "b", "c"],
      shares: [0.2, 0.3, 0.5],
    });
    const untouched = w.bounds("a");
    w.close(closing);
    assert.deepEqual(w.views(), ["a", closing === "b" ? "c" : "b"]);
    assert.deepEqual(w.bounds("a"), untouched);
    near(w.bounds(closing === "b" ? "c" : "b").w, 0.8);
    partitions(w.views().map(w.bounds));
  });
}
test("LAYOUT-04: the last remaining view stays open", () => {
  const w = workspace({
    name: "workspace",
    direction: "row",
    views: ["a", "b"],
  });
  w.close("a");
  w.close("b");
  assert.deepEqual(w.views(), ["b"]);
  assert.deepEqual(w.bounds("b"), { x: 0, y: 0, w: 1, h: 1 });
});
for (const side of ["left", "right", "top", "bottom"] as Side[]) {
  test(`DOCK-01: moving a view to the ${side} keeps every view and places it on the requested side`, () => {
    const w = workspace({
      name: "workspace",
      direction: "row",
      views: ["a", { name: "right", direction: "column", views: ["b", "c"] }],
    });
    w.move("a", "c", side);
    assert.deepEqual(w.views(), ["a", "b", "c"]);
    const a = w.bounds("a"),
      c = w.bounds("c");
    if (side === "left") near(a.x + a.w, c.x);
    if (side === "right") near(c.x + c.w, a.x);
    if (side === "top") near(a.y + a.h, c.y);
    if (side === "bottom") near(c.y + c.h, a.y);
    near(a.w, c.w);
    near(a.h, c.h);
    partitions(w.views().map(w.bounds));
  });
  test(`DOCK-02: the ${side} preview reserves equal space for incoming and existing views`, () => {
    const r = { x: 0, y: 0, w: 1, h: 1 };
    const { incoming, existing } = dropPreview(r, side);
    partitions([incoming, existing]);
    near(incoming.w * incoming.h, 0.5);
    assert.equal(
      edgeAt(
        { x: incoming.x + incoming.w * 0.5, y: incoming.y + incoming.h * 0.5 },
        r,
      ),
      side,
    );
  });
}
test("DOCK-03: either side of a shared edge and the seam produce the same visible arrangement", () => {
  const make = () =>
    workspace({
      name: "workspace",
      direction: "row",
      views: ["a", "b", "c"],
      shares: [0.2, 0.3, 0.5],
    });
  const left = make(),
    right = make(),
    seam = make();
  left.addAtEdge("incoming", "a", "right");
  right.addAtEdge("incoming", "b", "left");
  seam.addAtSeam("incoming", "workspace", 1);
  for (const id of left.views()) {
    assert.deepEqual(left.bounds(id), right.bounds(id));
    assert.deepEqual(left.bounds(id), seam.bounds(id));
  }
  near(left.bounds("a").x + left.bounds("a").w, left.bounds("incoming").x);
  near(
    left.bounds("incoming").x + left.bounds("incoming").w,
    left.bounds("b").x,
  );
});
test("DOCK-04: a seam between nested groups creates a view spanning the whole group", () => {
  const w = workspace({
    name: "workspace",
    direction: "row",
    views: [
      { name: "left", direction: "column", views: ["a", "b"] },
      { name: "right", direction: "column", views: ["c", "d"] },
    ],
  });
  w.addAtSeam("incoming", "workspace", 1);
  near(w.bounds("incoming").h, 1);
  assert.ok(w.bounds("incoming").x > w.bounds("a").x);
  assert.ok(w.bounds("incoming").x < w.bounds("c").x);
  partitions(w.views().map(w.bounds));
});
test("DOCK-05: the outer frame inserts around the visible group and ignores outside drops", () => {
  const w = workspace({
    name: "workspace",
    direction: "row",
    views: ["a", "b"],
  });
  w.addAtFrame("outside", { x: -1, y: 300 });
  assert.deepEqual(w.views(), ["a", "b"]);
  w.addAtFrame("incoming", { x: 500, y: 4 });
  near(w.bounds("incoming").w, 1);
  near(w.bounds("incoming").y + w.bounds("incoming").h, w.bounds("a").y);
  partitions(w.views().map(w.bounds));
});
test("DOCK-06: dropping a view onto itself does not change the layout", () => {
  const w = workspace({
    name: "workspace",
    direction: "row",
    views: ["a", "b"],
  });
  const before = w.views().map(w.bounds);
  w.move("a", "a", "left");
  assert.deepEqual(w.views().map(w.bounds), before);
});
