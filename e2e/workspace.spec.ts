import { expect, test, type Locator, type Page } from "@playwright/test";

const tab = (page: Page, view: string) => page.locator(`[data-trellis-part=tab][data-view="${view}"]`);
const panel = (page: Page, id: string) => page.locator(`[data-trellis-part=panel][data-panel="${id}"]`);
const surface = (page: Page, view: string) =>
  page.locator(`[data-trellis-part=surface][data-view="${view}"]`);

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw Error("no bounding box");
  return b;
}
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  release = true,
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 12, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  if (release) await page.mouse.up();
}
const center = (b: { x: number; y: number; width: number; height: number }) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});
async function doc(page: Page) {
  return page.evaluate(() => (window as any).ws.getDocument());
}
async function panelOf(page: Page, view: string): Promise<string> {
  return page.evaluate((v) => (window as any).ws.views().find((x: any) => x.id === v)?.panelId, view);
}

test.describe("vanilla workspace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
  });

  test("renders panels, accessible tabs and the stage", async ({ page }) => {
    await expect(page.locator("[data-trellis-part=panel]")).toHaveCount(3);
    await expect(page.getByRole("tab", { name: "a.ts" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "b.ts" })).toHaveAttribute("aria-selected", "false");
    await expect(page.locator(".trellis")).toHaveAttribute("data-has-stage", "");
    await expect(surface(page, "a")).toBeVisible();
    await expect(surface(page, "b")).toBeHidden();
  });

  test("selects tabs by click and with the keyboard", async ({ page }) => {
    await tab(page, "b").click();
    await expect(tab(page, "b")).toHaveAttribute("aria-selected", "true");
    await tab(page, "b").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(tab(page, "a")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, "a")).toBeFocused();
  });

  test("drags a tab to a panel edge to split, keeping content state", async ({ page }) => {
    await surface(page, "a").locator("input").fill("hello");
    const target = await box(panel(page, "docs"));
    await drag(page, center(await box(tab(page, "b"))), {
      x: target.x + target.width - 20,
      y: target.y + target.height / 2,
    });
    await expect(panel(page, "docs")).toBeVisible();
    const b = await panelOf(page, "b");
    expect(b).not.toBe("docs");
    const stage = (await doc(page)).root.children[1];
    expect(stage.kind).toBe("stage");
    expect(stage.child.kind).toBe("split");
    // Drag a with its typed text into the new panel's tab bar.
    const bar = await box(tab(page, "b"));
    await drag(page, center(await box(tab(page, "a"))), {
      x: bar.x + bar.width + 10,
      y: bar.y + bar.height / 2,
    });
    expect(await panelOf(page, "a")).toBe(b);
    await expect(surface(page, "a").locator("input")).toHaveValue("hello");
    expect(await page.evaluate(() => (window as any).mounts.a)).toBe(1);
  });

  test("reorders tabs within a tab bar", async ({ page }) => {
    const a = await box(tab(page, "a"));
    const b = await box(tab(page, "b"));
    await drag(page, center(a), { x: b.x + b.width - 4, y: b.y + b.height / 2 });
    expect((await doc(page)).root.children[1].child.views).toEqual(["b", "a"]);
  });

  test("refuses drops that violate allow rules", async ({ page }) => {
    const before = JSON.stringify((await doc(page)).root);
    const stage = await box(panel(page, "docs"));
    await drag(page, center(await box(tab(page, "files"))), center(stage), false);
    await expect(page.locator(".trellis")).toHaveAttribute("data-drop", "none");
    await page.mouse.up();
    expect(await panelOf(page, "files")).toBe("left");
    expect(JSON.stringify((await doc(page)).root)).toBe(before);
  });

  test("docks at the workspace perimeter", async ({ page }) => {
    await drag(page, center(await box(tab(page, "outline"))), { x: 1195, y: 400 }, false);
    await expect(page.locator(".trellis")).toHaveAttribute("data-drop", "dock");
    await page.mouse.move(600, 797, { steps: 4 });
    await page.mouse.up();
    const root = (await doc(page)).root;
    expect(root.kind).toBe("split");
    expect(root.axis).toBe("y");
    expect(root.children[1].id).toBe("right");
  });

  test("escape cancels a drag", async ({ page }) => {
    const before = JSON.stringify(await doc(page));
    await drag(page, center(await box(tab(page, "outline"))), { x: 300, y: 400 }, false);
    await expect(page.locator(".trellis")).toHaveAttribute("data-dragging", "");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".trellis")).not.toHaveAttribute("data-dragging", "");
    expect(JSON.stringify(await doc(page))).toBe(before);
  });

  test("floats from the menu, moves, resizes and docks back", async ({ page }) => {
    await panel(page, "right").locator("[data-trellis-part=panel-menu]").click();
    await page.getByRole("menuitem", { name: "Float" }).click();
    await expect(panel(page, "right")).toHaveAttribute("data-floating", "");
    expect((await doc(page)).floating).toHaveLength(1);
    await surface(page, "outline").locator("input").fill("kept");
    // Move by the tab bar.
    const bar = await box(panel(page, "right").locator("[data-trellis-part=tabbar]"));
    const start = { x: bar.x + bar.width - 60, y: bar.y + bar.height / 2 };
    await drag(page, start, { x: start.x - 150, y: start.y + 100 });
    const moved = (await doc(page)).floating[0].rect;
    // Resize from the south-east corner.
    const f = await box(panel(page, "right"));
    await drag(
      page,
      { x: f.x + f.width - 2, y: f.y + f.height - 2 },
      { x: f.x + f.width + 80, y: f.y + f.height + 40 },
    );
    const resized = (await doc(page)).floating[0].rect;
    expect(resized.w).toBeGreaterThan(moved.w);
    // Dock into the files panel's tab bar.
    const files = await box(tab(page, "search"));
    const b2 = await box(panel(page, "right").locator("[data-trellis-part=tabbar]"));
    await drag(
      page,
      { x: b2.x + b2.width - 60, y: b2.y + b2.height / 2 },
      { x: files.x + files.width + 10, y: files.y + files.height / 2 },
    );
    expect((await doc(page)).floating).toHaveLength(0);
    expect(await panelOf(page, "outline")).toBe("left");
    await expect(surface(page, "outline").locator("input")).toHaveValue("kept");
  });

  test("modifier presses start navigation, not drags", async ({ page }) => {
    const before = JSON.stringify(await doc(page));
    const t = center(await box(tab(page, "outline")));
    await page.keyboard.down("Alt");
    await drag(page, t, { x: 300, y: 400 });
    await page.keyboard.up("Alt");
    expect(JSON.stringify(await doc(page))).toBe(before);
  });

  test("moves a tab with the keyboard through the panel menu", async ({ page }) => {
    await tab(page, "b").click();
    await tab(page, "b").focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitem", { name: "Move b.ts to" }).hover();
    await page.getByRole("menuitem", { name: "New split right" }).click();
    const stage = (await doc(page)).root.children[1];
    expect(stage.child.kind).toBe("split");
    expect(await panelOf(page, "b")).not.toBe("docs");
  });

  test("hides and restores a panel with state", async ({ page }) => {
    await surface(page, "outline").locator("input").fill("still here");
    await page.evaluate(() => (window as any).ws.hide("right"));
    await expect(panel(page, "right")).toHaveCount(0);
    const snapshot = await page.evaluate(() => (window as any).ws.getSnapshot().hidden);
    expect(snapshot[0].panelId).toBe("right");
    await page.evaluate(() => (window as any).ws.restore("right"));
    await expect(panel(page, "right")).toBeVisible();
    await expect(surface(page, "outline").locator("input")).toHaveValue("still here");
    expect(await page.evaluate(() => (window as any).mounts.outline)).toBe(1);
  });

  test("hides a single tab and restores it into its panel", async ({ page }) => {
    await tab(page, "b").click();
    await surface(page, "b").locator("input").fill("tab state");
    await page.evaluate(() => (window as any).ws.hide("b"));
    await expect(tab(page, "b")).toHaveCount(0);
    await expect(tab(page, "a")).toBeVisible();
    const hidden = await page.evaluate(() => (window as any).ws.getSnapshot().hidden);
    expect(hidden).toHaveLength(1);
    await page.evaluate((id) => (window as any).ws.restore(id), hidden[0].panelId);
    expect(await panelOf(page, "b")).toBe("docs");
    await tab(page, "b").click();
    await expect(surface(page, "b").locator("input")).toHaveValue("tab state");
  });

  test("lists dragged views in the snapshot mid-drag", async ({ page }) => {
    await drag(page, center(await box(tab(page, "b"))), { x: 600, y: 500 }, false);
    const ids = await page.evaluate(() => (window as any).ws.getSnapshot().views.map((v: any) => v.id));
    expect(ids).toContain("b");
    await page.mouse.up();
  });

  test("maximizes a panel by double-clicking its tab bar; Escape returns", async ({ page }) => {
    const bar = panel(page, "left").locator("[data-trellis-part=tabbar]");
    const b = await box(bar);
    await page.mouse.dblclick(b.x + b.width - 50, b.y + b.height / 2);
    await expect(page.locator(".trellis")).toHaveAttribute("data-framed", "");
    await expect.poll(async () => (await box(panel(page, "left"))).width).toBeGreaterThan(1150);
    await tab(page, "files").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".trellis")).not.toHaveAttribute("data-framed", "");
    await expect.poll(async () => (await box(panel(page, "left"))).width).toBeLessThan(300);
  });

  test("resizes with dividers, by pointer and keyboard", async ({ page }) => {
    const divider = page.locator("[data-trellis-part=divider]").first();
    const d = await box(divider);
    const before = (await doc(page)).root.weights[0];
    await drag(page, center(d), { x: d.x + 120, y: d.y + d.height / 2 });
    const after = (await doc(page)).root.weights[0];
    expect(after).toBeGreaterThan(before + 0.05);
    await divider.focus();
    await page.keyboard.press("ArrowLeft");
    expect((await doc(page)).root.weights[0]).toBeLessThan(after);
  });

  test("opens views with placement, reuse and singletons", async ({ page }) => {
    const result = await page.evaluate(() => {
      const ws = (window as any).ws;
      const e1 = ws.open("editor", { params: { name: "c.ts" } });
      const e2 = ws.open("editor", { params: { name: "c.ts" }, reuse: "params" });
      const o = ws.open("outline");
      const f = ws.open("files", { placement: "float" });
      return { e1: e1.id, e2: e2.id, e1panel: e1.panelId, o: o.id, float: f.placement };
    });
    expect(result.e2).toBe(result.e1);
    expect(result.e1panel).toBe("docs");
    expect(result.o).toBe("outline");
    expect(result.float).toBe("floating");
  });

  test("hides the tab bar for tabbar: auto views until they share a panel", async ({ page }) => {
    const id = await page.evaluate(() => {
      const ws = (window as any).ws;
      ws.update({
        types: {
          files: { title: "Files" },
          search: { title: "Search" },
          editor: { title: "Editor", placement: "stage" },
          outline: { title: "Outline" },
          bare: { title: "Bare", tabbar: "auto" },
        },
      });
      return ws.open("bare", { placement: "side" }).panelId;
    });
    await expect(panel(page, id)).toHaveAttribute("data-tabbar", "hidden");
    const p = await box(panel(page, id));
    const s = await box(page.locator(`[data-trellis-part=surface][data-view]`).last());
    expect(Math.abs(s.y - p.y)).toBeLessThan(2);
    await page.evaluate((pid) => (window as any).ws.open("outline", { placement: { into: pid } }), id);
    await expect(panel(page, id)).not.toHaveAttribute("data-tabbar", "hidden");
  });

  test("close guards and closable rules", async ({ page }) => {
    const vetoed = await page.evaluate(async () => {
      const ws = (window as any).ws;
      const off = ws.view("a").guardClose(() => false);
      const first = await ws.close("a");
      off();
      const second = await ws.close("a");
      return [first, second];
    });
    expect(vetoed).toEqual([false, true]);
    await expect(tab(page, "a")).toHaveCount(0);
    const events = await page.evaluate(() => (window as any).events);
    expect(events).toContain("close:a");
    expect(await page.evaluate(() => (window as any).unmounts.a)).toBe(1);
  });

  test("closing the last view in the stage keeps the stage", async ({ page }) => {
    await page.evaluate(async () => {
      const ws = (window as any).ws;
      await ws.close("a");
      await ws.close("b");
    });
    await expect(page.locator(".trellis")).toHaveAttribute("data-stage-empty", "");
    const id = await page.evaluate(
      () => (window as any).ws.open("editor", { params: { name: "n.ts" } }).panelId,
    );
    const stage = (await doc(page)).root.children[1];
    expect(stage.child.id).toBe(id);
  });
});

test.describe("persistence", () => {
  test("restores a saved layout after reload", async ({ page }) => {
    await page.goto("/?scenario=vanilla&persist");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate(() => (window as any).ws.hide("right"));
    await page.waitForTimeout(300);
    await page.reload();
    await expect(tab(page, "a")).toBeVisible();
    expect(await page.evaluate(() => (window as any).ws.getSnapshot().hidden.length)).toBe(1);
    await page.evaluate(() => (window as any).ws.reset());
    expect(await page.evaluate(() => (window as any).ws.getSnapshot().hidden.length)).toBe(0);
  });
});

test.describe("free navigation", () => {
  test("ctrl+wheel zooms and snaps to a panel", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    const left = await box(panel(page, "left").locator("[data-trellis-part=tabbar]"));
    await page.mouse.move(left.x + left.width / 2, left.y + 10);
    await page.keyboard.down("Control");
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -60);
    await page.keyboard.up("Control");
    await expect.poll(() => page.evaluate(() => (window as any).ws.navigation.framed)).not.toBeNull();
    const cam = await page.evaluate(() => (window as any).ws.navigation.camera);
    expect(cam.w).toBeLessThan(1);
    await page.evaluate(() => (window as any).ws.navigation.overview());
    await expect.poll(() => page.evaluate(() => (window as any).ws.navigation.framed)).toBeNull();
  });
});

test.describe("react adapter", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?scenario=react");
    await expect(page.locator("[data-test=name]").first()).toBeVisible();
  });

  test("renders content through portals and keeps React state across moves", async ({ page }) => {
    const c1 = surface(page, "c1");
    await c1.locator("[data-test=inc]").click();
    await c1.locator("[data-test=inc]").click();
    await expect(c1.locator("[data-test=inc]")).toHaveText("count 2");
    const docs = await box(panel(page, "docs"));
    await drag(page, center(await box(tab(page, "c1"))), {
      x: docs.x + docs.width - 20,
      y: docs.y + docs.height / 2,
    });
    expect(await panelOf(page, "c1")).not.toBe("docs");
    await expect(c1.locator("[data-test=inc]")).toHaveText("count 2");
  });

  test("useView reflects focus and useWorkspace opens views", async ({ page }) => {
    await surface(page, "c1").click();
    await expect(surface(page, "c1").locator("[data-test=focused]")).toHaveText("true");
    await surface(page, "tools").locator("[data-test=open]").click();
    await expect(page.getByRole("tab", { name: "new" })).toBeVisible();
  });

  test("hooks work outside the workspace under a provider", async ({ page }) => {
    await expect(page.locator("[data-test=status]")).toHaveText(/^4:/);
    await tab(page, "c2").click();
    await surface(page, "c2").click();
    await expect(page.locator("[data-test=status]")).toHaveText("4:c2");
  });

  test("declares floating panels and stage slots in JSX", async ({ page }) => {
    const doc = await page.evaluate(() => (window as any).ws.getDocument());
    expect(doc.floating).toHaveLength(1);
    expect(doc.floating[0].panel.views).toEqual(["floating-tools"]);
    await expect(page.locator("[data-trellis-part=backdrop] [data-test=backdrop]")).toBeAttached();
  });

  test("useCloseGuard vetoes closing", async ({ page }) => {
    await surface(page, "c1").locator("[data-test=guard]").check();
    await tab(page, "c1").hover();
    await tab(page, "c1").locator("[data-trellis-part=tab-close]").click();
    await expect(tab(page, "c1")).toBeVisible();
    await surface(page, "c1").locator("[data-test=guard]").uncheck();
    await tab(page, "c1").locator("[data-trellis-part=tab-close]").click();
    await expect(tab(page, "c1")).toHaveCount(0);
  });

  test("empty stage slot renders when the stage empties", async ({ page }) => {
    await page.evaluate(async () => {
      const ws = (window as any).ws;
      await ws.close("c1");
      await ws.close("c2");
    });
    await expect(page.locator("[data-test=stage-empty]")).toBeVisible();
  });
});

test.describe("custom element", () => {
  test("builds a workspace from templates and layout children", async ({ page }) => {
    await page.goto("/?scenario=element");
    await expect(page.locator("trellis-workspace .note")).toHaveText("Note first");
    await expect(page.locator("trellis-workspace .tool")).toBeVisible();
    await expect(page.locator("[data-test=chrome]")).toBeVisible();
    await expect(page.locator(".trellis")).toHaveAttribute("data-theme", "dark");
    const id = await page.evaluate(() => (window as any).ws.open("note", { params: { name: "second" } }).id);
    await expect(surface(page, id).locator(".note")).toHaveText("Note second");
  });
});

test.describe("prototype navigation", () => {
  test("floating windows are not camera targets; double-clicking one frames its desktop", async ({ page }) => {
    await page.goto("/?scenario=vanilla&floating=stage&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    const id = await page.evaluate(() => (window as any).ws.open("files", { placement: "float" }).panelId);
    expect(await page.evaluate((p) => (window as any).ws.navigation.toggle(p), id)).toBe(false);
    const bar = await box(panel(page, id).locator("[data-trellis-part=tabbar]"));
    await page.mouse.dblclick(bar.x + bar.width - 40, bar.y + bar.height / 2);
    // The stage is transparent to navigation: framing it frames its content.
    await expect.poll(() => page.evaluate(() => (window as any).ws.navigation.framed)).toBe("docs");
  });

  test("toggleDock docks a float beside the stage and restores its size (PLACEMENT-01)", async ({ page }) => {
    await page.goto("/?scenario=vanilla&floating=stage&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    const id = await page.evaluate(() =>
      (window as any).ws.open("files", { placement: { float: { x: 0.1, y: 0.1, w: 0.37, h: 0.41 } } }).panelId,
    );
    await page.evaluate((p) => (window as any).ws.toggleDock(p), id);
    let d = await doc(page);
    expect(d.floating).toHaveLength(0);
    await page.evaluate((p) => (window as any).ws.toggleDock(p), id);
    d = await doc(page);
    expect(d.floating[0].rect).toEqual({ x: 0.1, y: 0.1, w: 0.37, h: 0.41 });
  });

  test("tiny panels show only their icon (frame only)", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    await page.evaluate(() => {
      const ws = (window as any).ws;
      const root = ws.getDocument().root;
      ws.setDocument({ ...ws.getDocument(), root: { ...root, weights: [0.1, 0.8, 0.1] } }, { animate: false });
    });
    await expect(panel(page, "left")).toHaveAttribute("data-frame-only", "");
    await expect(panel(page, "left").locator("[data-trellis-part=frame-icon]")).toBeVisible();
    await expect(panel(page, "docs")).not.toHaveAttribute("data-frame-only", "");
  });

  test("maximize restores the exact prior framing (NAV-07); Escape steps out one level", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    const ws = (fn: string) => page.evaluate(fn);
    await ws("ws.navigation.frame(['left', 'stage'])");
    const range = await ws("ws.navigation.framed");
    expect(String(range)).toContain("range:");
    await ws("ws.navigation.toggle('left')");
    expect(await ws("ws.navigation.framed")).toBe("left");
    await ws("ws.navigation.toggle('left')");
    expect(await ws("ws.navigation.framed")).toBe(range);
    await tab(page, "files").focus();
    await page.keyboard.press("Escape");
    await expect.poll(() => ws("ws.navigation.framed")).toBeNull();
  });

  test("overview toggles back to the previous framing (NAV-13)", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    await page.evaluate(() => (window as any).ws.navigation.frame("right"));
    await page.evaluate(() => (window as any).ws.navigation.toggleOverview());
    expect(await page.evaluate(() => (window as any).ws.navigation.framed)).toBeNull();
    await page.evaluate(() => (window as any).ws.navigation.toggleOverview());
    expect(await page.evaluate(() => (window as any).ws.navigation.framed)).toBe("right");
  });

  test("a plain wheel over chrome zooms and snaps; over content it scrolls the content", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    const content = await box(surface(page, "outline"));
    await page.mouse.move(content.x + content.width / 2, content.y + content.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).ws.navigation.framed)).toBeNull();
    const bar = await box(panel(page, "right").locator("[data-trellis-part=tabbar]"));
    await page.mouse.move(bar.x + bar.width - 30, bar.y + bar.height / 2);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -120);
    await expect.poll(() => page.evaluate(() => (window as any).ws.navigation.framed)).not.toBeNull();
  });

  test("Shift+wheel steps the hierarchy toward the pointer (NAV-01)", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    const left = await box(panel(page, "left"));
    await page.mouse.move(left.x + left.width / 2, left.y + left.height / 2);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, -40);
    await page.keyboard.up("Shift");
    await expect.poll(() => page.evaluate(() => (window as any).ws.navigation.framed)).toBe("left");
  });

  test("Shift+drag draws a marquee that frames the best fit (NAV-05)", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    const right = await box(panel(page, "right"));
    await page.keyboard.down("Shift");
    await page.mouse.move(right.x + 4, right.y + 4);
    await page.mouse.down();
    await page.mouse.move(right.x + right.width - 4, right.y + right.height - 4, { steps: 6 });
    await expect(page.locator("[data-trellis-part=marquee-target]")).toHaveAttribute("data-visible", "");
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect.poll(() => page.evaluate(() => (window as any).ws.navigation.framed)).toBe("right");
  });

  test("tokens removed from options are cleared", async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await page.evaluate(() => (window as any).ws.update({ tokens: { "--trellis-panel": "rgb(1, 2, 3)" } }));
    const bg = () =>
      page
        .locator("[data-trellis-part=panel]")
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await bg()).toBe("rgb(1, 2, 3)");
    await page.evaluate(() => (window as any).ws.update({ tokens: {} }));
    expect(await bg()).not.toBe("rgb(1, 2, 3)");
  });
});
