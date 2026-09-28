import assert from "node:assert/strict";
import { test } from "vitest";
import { desktopWithFloatingApp, history, workspace } from "./trellis-adapter";
const nested = () =>
  workspace({
    name: "workspace",
    direction: "row",
    views: [{ name: "writing", direction: "column", views: ["notes", "mail"] }, "finder"],
  });

test("NAV-01: hierarchy navigation steps one level toward the view under the pointer", () => {
  const w = nested();
  assert.equal(w.step("workspace", "in", { x: 0.2, y: 0.8 }), "writing");
  assert.equal(w.step("writing", "in", { x: 0.2, y: 0.8 }), "mail");
  assert.equal(w.step("mail", "out"), "writing");
  assert.equal(w.step("writing", "out"), "workspace");
  assert.equal(w.step("workspace", "out"), "workspace");
  assert.equal(w.step("mail", "in"), "mail");
});
test("NAV-02: aligned splits add no extra navigation level; a perpendicular split does", () => {
  const w = workspace("notes");
  w.split("notes", "mail", "row");
  const row = w.step("notes", "out");
  w.split("mail", "finder", "row");
  assert.equal(w.step("finder", "out"), row);
  w.split("mail", "calendar", "column");
  const column = w.step("calendar", "out");
  assert.notEqual(column, row);
  assert.equal(w.step(column, "out"), row);
});
test("NAV-03: views and groups remain snap targets despite small gesture noise", () => {
  const w = nested();
  for (const id of ["workspace", "writing", "notes", "mail", "finder"]) {
    const r = w.bounds(id);
    assert.equal(w.snap(r), id);
    assert.equal(w.snap({ ...r, x: r.x + r.w * 0.01, w: r.w * 1.02, h: r.h * 1.02 }), id);
  }
  assert.equal(w.snap({ x: -0.1, y: -0.1, w: 1.2, h: 1.2 }), "workspace");
});
test("NAV-04: contiguous views can be framed together without changing their layout", () => {
  const w = workspace({
    name: "workspace",
    direction: "row",
    views: ["a", "b", "c", "d"],
    shares: [0.1, 0.2, 0.3, 0.4],
  });
  const before = w.views().map(w.bounds);
  const frame = w.frame(["b", "c"]);
  assert.deepEqual(w.framedViews(frame), ["b", "c"]);
  assert.equal(w.snap(w.bounds(frame)), frame);
  assert.deepEqual(w.views().map(w.bounds), before);
});
test("NAV-07: maximize restores the exact prior framing even after skipping hierarchy levels", () => {
  const w = nested();
  for (const origin of ["workspace", "writing"]) {
    const maximized = w.maximize(origin, "notes");
    assert.equal(maximized.destination, "notes");
    assert.equal(w.maximize("notes", "notes", maximized.session).destination, origin);
  }
});
test("NAV-08: if the prior framing disappears, maximize restores its nearest surviving ancestor", () => {
  const w = nested();
  const maximized = w.maximize("writing", "notes");
  w.close("mail");
  const restored = w.maximize("notes", "notes", maximized.session);
  assert.equal(restored.destination, "workspace");
});
test("NAV-09: a saved framing follows remaining views and becomes unavailable when none survive", () => {
  const w = nested();
  assert.equal(w.savedFrame(["notes", "mail"]), "writing");
  w.close("mail");
  assert.equal(w.savedFrame(["notes", "mail"]), "notes");
  w.close("notes");
  assert.equal(w.savedFrame(["notes", "mail"]), null);
});
test("NAV-10: repeated visits do not duplicate history; a new visit after going back replaces forward history", () => {
  const h = history("workspace");
  h.visit("notes");
  h.visit("notes");
  h.visit("mail");
  assert.deepEqual(h.destinations(), ["workspace", "notes", "mail"]);
  h.at(1);
  h.visit("finder");
  assert.deepEqual(h.destinations(), ["workspace", "notes", "finder"]);
  assert.equal(h.position(), 2);
});
test("NAV-11: revisiting a framing with different contents records the changed view", () => {
  const h = history("workspace");
  h.visit("writing", ["notes", "mail"]);
  h.visit("writing", ["notes"]);
  assert.deepEqual(h.destinations(), ["workspace", "writing", "writing"]);
});
test("NAV-12: floating windows belong to the desktop and are not independent zoom snap targets", () => {
  const d = desktopWithFloatingApp({ x: 0.2, y: 0.3, w: 0.5, h: 0.4 });
  assert.deepEqual(d.desktop, { x: 0, y: 0, w: 1, h: 1 });
  assert.deepEqual(d.window, { x: 0.2, y: 0.3, w: 0.5, h: 0.4 });
  assert.equal(d.snap(d.window), "desktop");
});
