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

  test("a window floating over a filled stage moves where it's dropped", async ({ page }) => {
    // Stage floats sit over the stage's content; views not allowed in the stage used to find no
    // target there, so the move was cancelled.
    await page.goto("/?scenario=vanilla&floating=stage");
    await expect(tab(page, "a")).toBeVisible();
    await panel(page, "right").locator("[data-trellis-part=panel-menu]").click();
    await page.getByRole("menuitem", { name: "Float" }).click();
    await expect(panel(page, "right")).toHaveAttribute("data-floating", "");
    const before = (await doc(page)).floating[0].rect;
    const stage = await box(panel(page, "docs"));
    const bar = await box(panel(page, "right").locator("[data-trellis-part=tabbar]"));
    const start = { x: bar.x + bar.width - 40, y: bar.y + bar.height / 2 };
    await drag(page, start, { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 });
    await page.waitForTimeout(500);
    const after = (await doc(page)).floating;
    expect(after).toHaveLength(1);
    expect(after[0].rect).not.toEqual(before);
    expect(await panelOf(page, "outline")).toBe("right");
  });

  test("a split-off filled tab sits at the start of its row", async ({ page }) => {
    // The selected tab's flared corner once overflowed a full row, leaving it scrolled a few px.
    for (const inset of [4, 0]) {
      await page.evaluate((inset) => (window as any).ws.update({ tabs: { fill: true, inset } }), inset);
      const target = await box(panel(page, "docs"));
      await drag(page, center(await box(tab(page, "b"))), {
        x: target.x + target.width - 20,
        y: target.y + target.height / 2,
      });
      await page.waitForTimeout(700);
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[data-trellis-part=tabs]")].map((list) => ({
          scroll: list.scrollLeft,
          offset: Math.round(
            list.firstElementChild!.getBoundingClientRect().left -
              list.closest("[data-trellis-part=tabbar]")!.getBoundingClientRect().left,
          ),
        })),
      );
      for (const row of rows) expect(row).toEqual({ scroll: 0, offset: inset });
      // Put b back so the next round starts from the same layout.
      await drag(page, center(await box(tab(page, "b"))), center(await box(tab(page, "a"))));
      await page.waitForTimeout(700);
    }
  });

  test("a panel too small to use shows only its icon, with no tab bar", async ({ page }) => {
    // Squeeze the right-hand panel to a sliver so it drops to its icon-only form.
    await page.evaluate(() => {
      const ws = (window as any).ws;
      const doc = ws.getDocument();
      const root = doc.root;
      root.weights = root.children.map((_: unknown, i: number) =>
        i === root.children.length - 1 ? 0.02 : 1,
      );
      ws.setDocument(doc);
    });
    const tiny = panel(page, "right");
    await expect(tiny).toHaveAttribute("data-frame-only", "");
    await expect(tiny.locator("[data-trellis-part=tabbar]")).toBeHidden();
    await expect(tiny.locator("[data-trellis-part=frame-icon]")).toBeVisible();
    // Double-clicking the tile zooms to the panel, which then shows its tabs.
    await tiny.dblclick();
    await expect(tiny).not.toHaveAttribute("data-frame-only", "");
    await expect(tiny.locator("[data-trellis-part=tabbar]")).toBeVisible();
  });

  test("a group whose parts are all too small collapses into one tile", async ({ page }) => {
    // Under the right-hand panel, nest a row of three whose last cell is split again. Squeezing the
    // column makes that row scale down until its parts are too small even for icons.
    const ids = await page.evaluate(() => {
      const ws = (window as any).ws;
      const x1 = ws.open("files", { placement: { beside: "right", edge: "bottom", share: 0.5 } });
      const x2 = ws.open("search", { placement: { beside: x1.panelId, edge: "right" } });
      const x3 = ws.open("files", { placement: { beside: x2.panelId, edge: "right" } });
      ws.open("search", { placement: { beside: x3.panelId, edge: "bottom" } });
      const doc = ws.getDocument();
      doc.root.weights = [1, 12, 0.3];
      ws.setDocument(doc);
      ws.navigation.overview();
      return { x1: x1.panelId };
    });
    const group = page.locator("[data-trellis-part=group]");
    await expect(group).toHaveCount(1);
    await expect(panel(page, ids.x1)).toBeHidden();
    // Two levels of lines: the row's two seams, and the split nested in its last cell.
    await expect(group.locator("i")).toHaveCount(3);
    // Hidden panels keep their content mounted.
    expect(await page.evaluate(() => (window as any).mounts.outline)).toBe(1);
    // Double-clicking zooms to the part under the pointer: the left of the tile is x1.
    const tile = await box(group);
    await page.mouse.dblclick(tile.x + tile.width * 0.1, tile.y + tile.height / 2);
    await expect(panel(page, ids.x1)).toBeVisible();
    await expect(group).toHaveCount(0);
    // A moderately small nest keeps its icon tiles: collapsing is only for parts too small for icons.
    await page.evaluate(() => {
      const ws = (window as any).ws;
      const doc = ws.getDocument();
      doc.root.weights = [1, 5, 0.9];
      ws.setDocument(doc);
      ws.navigation.overview();
    });
    await expect(group).toHaveCount(0);
    await expect(panel(page, ids.x1)).toHaveAttribute("data-frame-only", "");
    // detail: false keeps every panel, however small.
    await page.evaluate(() => {
      const ws = (window as any).ws;
      const doc = ws.getDocument();
      doc.root.weights = [1, 12, 0.3];
      ws.setDocument(doc);
      ws.navigation.overview();
      ws.update({ detail: false });
    });
    await expect(group).toHaveCount(0);
    await expect(panel(page, ids.x1)).toBeVisible();
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
    const floated = (await doc(page)).floating[0].rect;
    const bar = await box(panel(page, "right").locator("[data-trellis-part=tabbar]"));
    const start = { x: bar.x + bar.width - 60, y: bar.y + bar.height / 2 };
    await drag(page, start, { x: start.x - 150, y: start.y + 100 });
    const moved = (await doc(page)).floating[0].rect;
    expect(moved.x).toBeLessThan(floated.x);
    expect(moved.y).toBeGreaterThan(floated.y);
    // Resize from the south-east corner, grabbing just inside the panel. The handle must sit above
    // the content there (it once sat under it, so only its outer few pixels worked).
    const f = await box(panel(page, "right"));
    const grab = { x: f.x + f.width - 6, y: f.y + f.height - 6 };
    expect(
      await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("data-dir"), grab),
    ).toBe("se");
    await drag(page, grab, { x: f.x + f.width + 80, y: f.y + f.height + 40 });
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

  test("a panelMenu function edits every panel's menu by item id", async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any;
      w.menuContexts = [];
      w.ws.update({
        panelMenu: (entries: any[], context: any) => {
          w.menuContexts.push({ panelId: context.panelId, view: context.view.id, region: context.region });
          return [
            { id: "copy", label: `Copy ${context.view.id}`, run: () => (w.copied = context.view.id) },
            "separator",
            ...entries.filter((e) => e === "separator" || e.id !== "hide"),
          ];
        },
      });
    });
    await panel(page, "docs").locator("[data-trellis-part=panel-menu]").click();
    const items = page.getByRole("menu").getByRole("menuitem");
    await expect(items.first()).toHaveText("Copy a");
    await expect(page.getByRole("menuitem", { name: "Hide" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /^Close a\.ts/ })).toBeVisible();
    await items.first().click();
    expect(await page.evaluate(() => (window as any).copied)).toBe("a");
    expect(await page.evaluate(() => (window as any).menuContexts.at(-1))).toEqual({
      panelId: "docs",
      view: "a",
      region: "stage",
    });
    // An empty menu hides the button.
    await page.evaluate(() => (window as any).ws.update({ panelMenu: () => [] }));
    await expect(panel(page, "docs").locator("[data-trellis-part=panel-menu]")).toBeHidden();
  });

  test("renderMenu replaces the built-in menu", async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any;
      w.ws.update({
        renderMenu: (request: any) => {
          w.request = {
            ids: request.entries.map((e: any) => (e === "separator" ? "-" : e.id)),
            align: request.align,
            anchored: !!request.anchor,
            panelId: request.panelId,
            x: request.x,
          };
          w.menuRequest = request;
        },
      });
    });
    const button = panel(page, "docs").locator("[data-trellis-part=panel-menu]");
    await button.click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const request = await page.evaluate(() => (window as any).request);
    expect(request.ids).toEqual(expect.arrayContaining(["maximize", "move", "hide", "close"]));
    expect(request.ids[0]).not.toBe("-");
    expect(request.ids.at(-1)).not.toBe("-");
    expect(request).toMatchObject({ align: "end", anchored: true, panelId: "docs" });
    expect(request.x).toBeCloseTo((await box(button)).x + (await box(button)).width, 0);
    // Running an entry and closing work through the request.
    await page.evaluate(() => {
      const r = (window as any).menuRequest;
      r.entries.find((e: any) => e.id === "hide").run();
      r.close();
    });
    await expect(panel(page, "docs")).toBeHidden();
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
    await expect(page.locator("trellis-workspace .note").first()).toHaveText("Note first");
    // Views without an id get generated ones (an unset element id once made them all "").
    await expect(page.locator("trellis-workspace [data-trellis-part=tab]")).toHaveCount(4);
    await expect(page.locator("trellis-workspace .tool")).toBeVisible();
    await expect(page.locator("[data-test=chrome]")).toBeVisible();
    await expect(page.locator(".trellis")).toHaveAttribute("data-theme", "dark");
    const id = await page.evaluate(() => (window as any).ws.open("note", { params: { name: "second" } }).id);
    await expect(surface(page, id).locator(".note")).toHaveText("Note second");
  });
});

test.describe("navigation requirements", () => {
  test("floating windows are not camera targets; double-clicking one frames its desktop", async ({
    page,
  }) => {
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
    const id = await page.evaluate(
      () =>
        (window as any).ws.open("files", { placement: { float: { x: 0.1, y: 0.1, w: 0.37, h: 0.41 } } })
          .panelId,
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
      ws.setDocument(
        { ...ws.getDocument(), root: { ...root, weights: [0.1, 0.8, 0.1] } },
        { animate: false },
      );
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

test.describe("minimum sizes", () => {
  // Panels keep at least 80px of width in their group's own layout space. A group whose panels
  // can't fit is scaled down as a whole, and zooming to it brings them back to full size.
  const width = async (page: Page, id: string) => (await box(panel(page, id))).width;

  test.beforeEach(async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
  });

  test("narrowing the workspace keeps side panels at their minimum", async ({ page }) => {
    // At 330px, the weights (1:3:1) would give the side panels 66px each.
    await page.evaluate(() => {
      (document.querySelector(".trellis")!.parentElement as HTMLElement).style.width = "330px";
    });
    await page.waitForTimeout(300);
    expect(await width(page, "left")).toBeGreaterThanOrEqual(79.5);
    expect(await width(page, "right")).toBeGreaterThanOrEqual(79.5);
  });

  test("dragging a divider next to a squeezed panel moves it smoothly, without jumping", async ({ page }) => {
    // Weights that would make the right panel 27px wide: it's raised to its minimum instead.
    await page.evaluate(() => {
      const ws = (window as any).ws;
      const doc = ws.getDocument();
      doc.root.weights = [1, 12, 0.3];
      ws.setDocument(doc);
    });
    await page.waitForTimeout(300);
    const before = await width(page, "right");
    expect(before).toBeGreaterThanOrEqual(79.5);
    const divider = page.locator("[data-trellis-part=divider][data-index='1']").first();
    const d = await box(divider);
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
    await page.mouse.down();
    await page.mouse.move(d.x + d.width / 2 - 2, d.y + d.height / 2, { steps: 2 });
    const firstStep = (await width(page, "right")) - before;
    await page.mouse.move(d.x + d.width / 2 - 20, d.y + d.height / 2, { steps: 4 });
    const after = (await width(page, "right")) - before;
    await page.mouse.up();
    expect(firstStep).toBeGreaterThan(0);
    expect(firstStep).toBeLessThan(4);
    expect(after).toBeGreaterThan(17);
    expect(after).toBeLessThan(23);
  });

  test("a group whose panels can't fit scales down, and zooming to it restores their minimum", async ({
    page,
  }) => {
    const ids = await page.evaluate(() => {
      const ws = (window as any).ws;
      const x1 = ws.open("files", { placement: { beside: "right", edge: "bottom", share: 0.5 } });
      const x2 = ws.open("search", { placement: { beside: x1.panelId, edge: "right" } });
      const doc = ws.getDocument();
      doc.root.weights = [1, 12, 0.3];
      ws.setDocument(doc);
      ws.navigation.overview();
      return { x1: x1.panelId, x2: x2.panelId };
    });
    await page.waitForTimeout(300);
    // The column gets its 80px minimum; the two panels side by side in it need 160, so their row
    // is drawn at about half size.
    expect(await width(page, "right")).toBeGreaterThanOrEqual(79.5);
    const scaled = await width(page, ids.x1);
    expect(scaled).toBeLessThan(60);
    expect(scaled).toBeGreaterThan(20);
    // The handle reports the geometry as drawn, including how much the group is scaled.
    const scale = await page.evaluate((id) => (window as any).ws.getLayoutRects().get(id).scale, ids.x1);
    expect(scale).toBeGreaterThan(0.3);
    expect(scale).toBeLessThan(0.7);
    await page.evaluate((ids) => (window as any).ws.navigation.frame([ids.x1, ids.x2]), ids);
    await page.waitForTimeout(600);
    expect(await width(page, ids.x1)).toBeGreaterThanOrEqual(79.5);
    expect(await width(page, ids.x2)).toBeGreaterThanOrEqual(79.5);
  });
});

test.describe("layout during motion", () => {
  // Zooming far into a scaled view makes its neighbours many times larger than the window. Content
  // must not be laid out at those sizes, or relaid out on every frame of the animation.
  test.beforeEach(async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
  });

  const setup = (page: Page) =>
    page.evaluate(() => {
      const ws = (window as any).ws;
      ws.update({ motion: "full", detail: false });
      let at = "right";
      for (let i = 0; i < 10; i++)
        at = ws.open(i % 2 ? "search" : "files", {
          placement: { beside: at, edge: i % 2 ? "bottom" : "right" },
        }).panelId;
      const doc = ws.getDocument();
      doc.root.weights = [1, 12, 0.3];
      ws.setDocument(doc);
      ws.navigation.overview();
      return at as string;
    });
  const contentSizes = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-trellis-part=content]")]
        .filter((el) => el.closest<HTMLElement>("[data-trellis-part=surface]")!.style.visibility !== "hidden")
        .map((el) => ({ w: el.offsetWidth, h: el.offsetHeight })),
    );

  test("content is never laid out much larger than the window, even mid-zoom", async ({ page }) => {
    const deepest = await setup(page);
    await page.waitForTimeout(800);
    // Record the largest visible content layout on every frame of the zoom.
    await page.evaluate((id) => {
      const w = window as any;
      w.__largest = { w: 0, h: 0 };
      let frames = 0;
      const sample = () => {
        for (const c of document.querySelectorAll<HTMLElement>("[data-trellis-part=content]")) {
          const surface = c.closest<HTMLElement>("[data-trellis-part=surface]")!;
          if (surface.style.visibility === "hidden" || surface.style.display === "none") continue;
          w.__largest.w = Math.max(w.__largest.w, c.offsetWidth);
          w.__largest.h = Math.max(w.__largest.h, c.offsetHeight);
        }
        if (++frames < 90) requestAnimationFrame(sample);
      };
      w.ws.navigation.frame([id]);
      requestAnimationFrame(sample);
    }, deepest);
    await page.waitForTimeout(2500);
    const largest = await page.evaluate(() => (window as any).__largest);
    const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    expect(largest.w).toBeLessThanOrEqual(w * 2 + 1);
    expect(largest.h).toBeLessThanOrEqual(h * 2 + 1);
  });

  test("content isn't resized on every frame while the camera moves", async ({ page }) => {
    const deepest = await setup(page);
    await page.waitForTimeout(800);
    // Sample content sizes on each animation frame during the zoom.
    await page.evaluate((id) => {
      const w = window as any;
      w.__sizes = [];
      const sample = () => {
        w.__sizes.push(
          [...document.querySelectorAll<HTMLElement>("[data-trellis-part=content]")]
            .map((c) => `${c.style.width}x${c.style.height}`)
            .join("|"),
        );
        if (w.__sizes.length < 40) requestAnimationFrame(sample);
      };
      w.ws.navigation.frame([id]);
      requestAnimationFrame(sample);
    }, deepest);
    await page.waitForTimeout(1500);
    const sizes: string[] = await page.evaluate(() => (window as any).__sizes);
    // At most a couple of distinct layouts (before and after), not one per frame.
    expect(new Set(sizes.slice(1, -1)).size).toBeLessThanOrEqual(2);
  });

  test("views that end the zoom out of view are never laid out again", async ({ page }) => {
    const deepest = await setup(page);
    await page.waitForTimeout(800);
    await page.evaluate((id) => {
      const w = window as any;
      const size = (c: HTMLElement) => `${c.style.width}x${c.style.height}`;
      const contents = () => [
        ...document.querySelectorAll<HTMLElement>(
          "[data-trellis-part=surface] > [data-trellis-part=content]",
        ),
      ];
      // Each view's layout before the zoom, and every layout it gets during it.
      w.__before = new Map(contents().map((c) => [c, size(c)]));
      w.__during = new Map(contents().map((c) => [c, new Set<string>()]));
      const start = performance.now();
      const sample = () => {
        for (const c of contents()) w.__during.get(c)?.add(size(c));
        if (performance.now() - start < 2000) requestAnimationFrame(sample);
      };
      w.ws.navigation.frame([id]);
      requestAnimationFrame(sample);
    }, deepest);
    await page.waitForTimeout(3000);
    const offscreen = await page.evaluate(() => {
      const w = window as any;
      const results: { view: string; before: string; during: string[] }[] = [];
      for (const [c, during] of w.__during as Map<HTMLElement, Set<string>>) {
        const shell = c.parentElement!;
        const r = shell.getBoundingClientRect();
        const inView =
          shell.style.visibility !== "hidden" &&
          r.right > 0 &&
          r.bottom > 0 &&
          r.left < innerWidth &&
          r.top < innerHeight;
        if (inView || w.__before.get(c) === "x") continue;
        results.push({ view: shell.dataset.view!, before: w.__before.get(c), during: [...during] });
      }
      return results;
    });
    expect(offscreen.length).toBeGreaterThan(3);
    for (const v of offscreen) expect(v.during, v.view).toEqual([v.before]);
  });

  test("a pinch only scales content, uniformly, until it's released", async ({ page }) => {
    await page.waitForTimeout(300);
    const result = await page.evaluate(
      () =>
        new Promise<{ before: string[]; during: string[]; transforms: string[]; after: string[] }>(
          (resolve) => {
            const contents = () =>
              [...document.querySelectorAll<HTMLElement>("[data-trellis-part=surface]")]
                .filter((shell) => shell.style.visibility !== "hidden")
                .map((shell) => shell.querySelector<HTMLElement>(":scope > [data-trellis-part=content]")!);
            const sizes = () => contents().map((c) => `${c.style.width}x${c.style.height}`);
            const before = sizes();
            const during = new Set<string>();
            const transforms = new Set<string>();
            const bar = document.querySelector<HTMLElement>(
              "[data-trellis-part=panel][data-panel=right] [data-trellis-part=tabbar]",
            )!;
            const r = bar.getBoundingClientRect();
            let events = 0;
            // A trackpad pinch: a stream of ctrl+wheel events, one per frame.
            const pinch = () => {
              bar.dispatchEvent(
                new WheelEvent("wheel", {
                  deltaY: -8,
                  ctrlKey: true,
                  clientX: r.right - 30,
                  clientY: r.top + r.height / 2,
                  bubbles: true,
                  cancelable: true,
                }),
              );
              requestAnimationFrame(() => {
                for (const size of sizes()) during.add(size);
                for (const c of contents()) transforms.add(c.style.transform);
                if (++events < 15) pinch();
                else {
                  // Released: record every layout until the snap has settled.
                  const after = new Set<string>();
                  const start = performance.now();
                  const settle = () => {
                    after.add(sizes().join("|"));
                    if (performance.now() - start < 1500) requestAnimationFrame(settle);
                    else
                      resolve({
                        before,
                        during: [...during],
                        transforms: [...transforms],
                        after: [...after],
                      });
                  };
                  requestAnimationFrame(settle);
                }
              });
            };
            pinch();
          },
        ),
    );
    // Nothing is laid out again while the fingers are down...
    expect(result.during.every((size) => result.before.includes(size))).toBe(true);
    // ...and nothing is stretched: every view scales by one factor.
    for (const t of result.transforms) expect(t).toMatch(/^(scale\([^,)]+\))?$/);
    expect(result.transforms.some((t) => t)).toBe(true);
    // Released, it snaps and lays out once, at the snapped size.
    expect(result.after.length).toBeLessThanOrEqual(2);
  });

  test("the view being zoomed to is laid out at its final size from the first frame", async ({ page }) => {
    const deepest = await setup(page);
    await page.waitForTimeout(800);
    // Content laid out at its old, tiny size and stretched up makes buttons and sliders huge mid-zoom.
    await page.evaluate((id) => {
      const w = window as any;
      const view = w.ws.getDocument();
      const find = (n: any): any =>
        n?.kind === "panel"
          ? n.id === id
            ? n
            : null
          : (n?.children?.map(find).find(Boolean) ?? (n?.child && find(n.child)));
      const content = document.querySelector<HTMLElement>(
        `[data-trellis-part=surface][data-view="${find(view.root).selected}"] [data-trellis-part=content]`,
      )!;
      w.__zoomSizes = [];
      w.__zoomContent = content;
      // Sample for the whole zoom, however fast frames come.
      const start = performance.now();
      const sample = () => {
        w.__zoomSizes.push(`${content.style.width}x${content.style.height}`);
        if (performance.now() - start < 2000) requestAnimationFrame(sample);
      };
      w.ws.navigation.frame([id]);
      requestAnimationFrame(sample);
    }, deepest);
    await page.waitForTimeout(3000);
    const sizes: string[] = await page.evaluate(() => (window as any).__zoomSizes);
    // Before its first placement a view has no size yet; once placed, it keeps one size throughout.
    const placed = sizes.filter((s) => s !== "x");
    expect(placed.length).toBeGreaterThan(1);
    const settled = await page.evaluate(() => {
      const c = (window as any).__zoomContent as HTMLElement;
      return `${c.style.width}x${c.style.height}`;
    });
    expect([...new Set(placed)]).toEqual([settled]);
  });
});

test.describe("live reflow", () => {
  // While the camera is still, views are laid out at their size every frame: every visible view
  // fills its surface at one uniform scale, never stretched from another size.
  const stretched = () =>
    [...document.querySelectorAll<HTMLElement>("[data-trellis-part=surface]")]
      .filter((shell) => shell.style.visibility !== "hidden")
      .flatMap((shell) => {
        const c = shell.querySelector<HTMLElement>(":scope > [data-trellis-part=content]")!;
        const m = /^scale\(([^,)]+)\)$/.exec(c.style.transform);
        if (c.style.transform && !m) return [`${shell.dataset.view}: ${c.style.transform}`];
        const k = m ? Number(m[1]) : 1;
        const off = Math.max(
          Math.abs(c.offsetWidth * k - shell.clientWidth),
          Math.abs(c.offsetHeight * k - shell.clientHeight),
        );
        return off > 1.5 ? [`${shell.dataset.view}: off by ${off}px`] : [];
      });
  test.beforeEach(async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
  });

  test("dragging a divider reflows the panels beside it live, without stretching them", async ({ page }) => {
    const d = await box(page.locator("[data-trellis-part=divider]").first());
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(d.x + d.width / 2 + i * 15, d.y + d.height / 2);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      expect(await page.evaluate(stretched)).toEqual([]);
    }
    await page.mouse.up();
  });

  test("layout animations reflow the panels they move live, without stretching them", async ({ page }) => {
    const found = await page.evaluate(
      (check) =>
        new Promise<string[]>((resolve) => {
          const w = window as any;
          w.ws.update({ motion: "full" });
          const stretched = new Function(`return (${check})()`) as () => string[];
          const seen = new Set<string>();
          let frames = 0;
          const sample = () => {
            for (const s of stretched()) seen.add(s);
            if (++frames < 30) requestAnimationFrame(sample);
            else resolve([...seen]);
          };
          w.ws.close("outline");
          requestAnimationFrame(sample);
        }),
      stretched.toString(),
    );
    expect(found).toEqual([]);
  });
});

test.describe("scaled views", () => {
  // Under free navigation, views lay out at no less than 480 × 320 and scale below it. The narrow
  // "right" panel's outline view is scaled.
  const typeInto = async (page: Page, view: string) => {
    const input = surface(page, view).locator("[data-test=input]");
    await input.click({ force: true });
    await page.keyboard.type("hi");
    return input.inputValue();
  };
  const interactive = (page: Page, view: string) =>
    page.evaluate((v) => (window as any).ws.view(v).interactive, view);

  test("are interactive by default", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(surface(page, "outline")).toHaveAttribute("data-scaled", "");
    expect(await typeInto(page, "outline")).toBe("hi");
    expect(await interactive(page, "outline")).toBe(true);
  });

  test('scaling: "inert" scales them but ignores input', async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free&scaling=inert");
    await expect(surface(page, "outline")).toHaveAttribute("data-scaled", "inert");
    expect(await typeInto(page, "outline")).toBe("");
    expect(await interactive(page, "outline")).toBe(false);
  });

  test("scaling: false lays content out at the panel's size instead", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free&scaling=false");
    await expect(tab(page, "outline")).toBeVisible();
    await expect(surface(page, "outline")).not.toHaveAttribute("data-scaled");
    const { transform, width, shell } = await surface(page, "outline").evaluate((el) => {
      const c = el.querySelector<HTMLElement>(":scope > [data-trellis-part=content]")!;
      return { transform: c.style.transform, width: c.offsetWidth, shell: el.clientWidth };
    });
    expect(transform).toBe("");
    expect(width).toBe(shell);
    expect(width).toBeLessThan(480);
    expect(await typeInto(page, "outline")).toBe("hi");
  });
});

test.describe("pushing dividers", () => {
  const width = async (page: Page, id: string) => (await box(panel(page, id))).width;
  test.beforeEach(async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
  });

  /** Drags the first divider right past the stage's minimum, then back to where it started,
   * returning the right panel's width at the start, when pushed, and back again. */
  const pushAndReturn = async (page: Page) => {
    const start = await width(page, "right");
    const d = await box(page.locator("[data-trellis-part=divider][data-index='0']").first());
    const y = d.y + d.height / 2;
    await page.mouse.move(d.x + d.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(d.x + 880, y, { steps: 10 });
    // The stage is at its minimum and the right panel has been pushed smaller.
    expect(await width(page, "docs")).toBeLessThan(100);
    const pushed = await width(page, "right");
    await page.mouse.move(d.x + d.width / 2, y, { steps: 10 });
    const back = await width(page, "right");
    await page.mouse.up();
    return { start, pushed, back, after: await width(page, "right") };
  };

  test("dragging past a neighbour's minimum pushes the next panel, which stays pushed when dragging back", async ({
    page,
  }) => {
    const w = await pushAndReturn(page);
    expect(w.pushed).toBeLessThan(w.start - 50);
    expect(Math.abs(w.back - w.pushed)).toBeLessThan(1);
    expect(Math.abs(w.after - w.pushed)).toBeLessThan(1);
  });

  test("keepPushed: false makes dragging back undo the pushes", async ({ page }) => {
    await page.evaluate(() => (window as any).ws.update({ keepPushed: false }));
    const w = await pushAndReturn(page);
    expect(w.pushed).toBeLessThan(w.start - 50);
    expect(Math.abs(w.back - w.start)).toBeLessThan(1);
    expect(Math.abs(w.after - w.start)).toBeLessThan(1);
  });

  test("a divider inside a group pushes past the group's edge into its parent's panels", async ({ page }) => {
    // Files | [ Search | stage ] over Outline
    await page.evaluate(() => {
      const ws = (window as any).ws;
      const doc = ws.getDocument();
      const panel = (id: string, views: string[]) => ({ kind: "panel", id, views, selected: views[0] });
      doc.root = {
        kind: "split",
        id: "r",
        axis: "x",
        weights: [1, 2],
        children: [
          panel("left", ["files"]),
          {
            kind: "split",
            id: "col",
            axis: "y",
            weights: [1, 1],
            children: [
              {
                kind: "split",
                id: "inner",
                axis: "x",
                weights: [1, 1],
                children: [
                  panel("x1", ["search"]),
                  { kind: "stage", id: "stage", child: panel("docs", ["a", "b"]) },
                ],
              },
              panel("right", ["outline"]),
            ],
          },
        ],
      };
      ws.setDocument(doc, { animate: false });
    });
    await expect(panel(page, "x1")).toBeVisible();
    const left = await width(page, "left");
    const outline = await width(page, "right");
    const d = await box(page.locator("[data-trellis-part=divider][data-split='inner']"));
    const y = d.y + d.height / 2;
    await page.mouse.move(d.x + d.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(d.x - 700, y, { steps: 10 });
    await page.mouse.up();
    // Search is at its minimum, so the group grew to the left and pushed Files smaller;
    // Outline, below, spans the whole group and widened with it.
    expect(await width(page, "x1")).toBeLessThan(100);
    expect(await width(page, "left")).toBeLessThan(left - 100);
    expect(await width(page, "right")).toBeGreaterThan(outline + 100);
  });

  test("the keyboard pushes too", async ({ page }) => {
    const right = await width(page, "right");
    const divider = page.locator("[data-trellis-part=divider][data-index='0']").first();
    await divider.focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowRight");
    expect(await width(page, "docs")).toBeLessThan(100);
    expect(await width(page, "right")).toBeLessThan(right - 50);
  });
});

test.describe("free navigation gestures", () => {
  const framed = (page: Page) => page.evaluate(() => (window as any).ws.navigation.framed);
  const camera = (page: Page) => page.evaluate(() => ({ ...(window as any).ws.navigation.camera }));
  const open = async (page: Page, extra = "") => {
    await page.goto(`/?scenario=vanilla&navigation=free${extra}`);
    await expect(tab(page, "a")).toBeVisible();
  };
  /** Wheel events as a trackpad pinch (small deltas) or a mouse wheel (notches) produce them. */
  const wheel = (
    page: Page,
    at: { x: number; y: number },
    deltas: number[],
    mods: { ctrlKey?: boolean; shiftKey?: boolean } = {},
  ) =>
    page.evaluate(
      ({ at, deltas, mods }) =>
        new Promise<void>((resolve) => {
          const target = document.elementFromPoint(at.x, at.y)!;
          let i = 0;
          const next = () => {
            if (i >= deltas.length) return resolve();
            const e = new WheelEvent("wheel", {
              deltaY: deltas[i++],
              clientX: at.x,
              clientY: at.y,
              bubbles: true,
              cancelable: true,
              ...mods,
            });
            target.dispatchEvent(e);
            // A steady stream, like a real pinch: frames on a slow machine can be further apart
            // than the pause that ends a gesture.
            setTimeout(next, 10);
          };
          next();
        }),
      { at, deltas, mods },
    );
  const inside = async (locator: Locator) => center(await box(locator));
  /** Hold the workspace key (⌘⌥ on macOS, Ctrl+Alt elsewhere), plus any extra keys. */
  const hold = async (page: Page, ...extra: string[]) => {
    for (const key of ["ControlOrMeta", "Alt", ...extra]) await page.keyboard.down(key);
  };
  const release = async (page: Page, ...extra: string[]) => {
    for (const key of [...extra, "Alt", "ControlOrMeta"]) await page.keyboard.up(key);
  };

  test("a pinch zooms the workspace, even over a text field", async ({ page }) => {
    await open(page);
    const field = await inside(surface(page, "outline").locator("[data-test=input]"));
    await wheel(page, field, Array(14).fill(-6.5), { ctrlKey: true });
    await expect.poll(() => framed(page)).not.toBeNull();
  });

  test("a mouse wheel with Ctrl steps a level toward the pointer instead of zooming continuously", async ({
    page,
  }) => {
    await open(page);
    await wheel(page, await inside(surface(page, "files")), [-100], { ctrlKey: true });
    await expect.poll(() => framed(page)).toBe("left");
  });

  test("plain and Shift scrolling never move the camera, over chrome or content", async ({ page }) => {
    await open(page);
    const before = await camera(page);
    for (const at of [
      await inside(panel(page, "right").locator("[data-trellis-part=tabbar]")),
      await inside(surface(page, "outline")),
    ]) {
      await wheel(page, at, [-120, -120, -120]);
      await wheel(page, at, [-120, -120, -120], { shiftKey: true });
    }
    await page.waitForTimeout(400);
    expect(await framed(page)).toBeNull();
    expect(await camera(page)).toEqual(before);
  });

  test("Shift-click and Alt-click inside content reach the content", async ({ page }) => {
    await open(page);
    const input = surface(page, "outline").locator("[data-test=input]");
    await input.fill("hello workspace");
    const b = await box(input);
    await page.mouse.click(b.x + 8, b.y + b.height / 2);
    await page.keyboard.down("Shift");
    await page.mouse.click(b.x + b.width - 8, b.y + b.height / 2);
    await page.keyboard.up("Shift");
    const selected = await input.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!);
    expect(selected).toBeGreaterThan(5);
    await input.evaluate((el) => el.addEventListener("click", (e) => ((window as any).__alt = e.altKey)));
    await page.keyboard.down("Alt");
    await page.mouse.click(b.x + 20, b.y + b.height / 2);
    await page.keyboard.up("Alt");
    expect(await page.evaluate(() => (window as any).__alt)).toBe(true);
    expect(await framed(page)).toBeNull();
  });

  test("holding the workspace key and dragging pans, even over content", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const w = window as any;
      w.__downs = 0;
      document
        .querySelector("[data-trellis-part=surface][data-view=outline] [data-trellis-part=content]")!
        .addEventListener("pointerdown", () => w.__downs++);
    });
    const start = await inside(surface(page, "outline"));
    await hold(page);
    await expect(page.locator(".trellis")).toHaveAttribute("data-gesture-key", "pan");
    const before = await camera(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 150, start.y + 60, { steps: 6 });
    const during = await camera(page);
    await page.mouse.up();
    await release(page);
    await expect(page.locator(".trellis")).not.toHaveAttribute("data-gesture-key");
    // Dragging left and down moves the view right and up: the camera moves the other way.
    expect(during.x).toBeGreaterThan(before.x + 0.01);
    expect(during.y).toBeLessThan(before.y - 0.01);
    expect(during.w).toBeCloseTo(before.w, 6);
    expect(await page.evaluate(() => (window as any).__downs)).toBe(0);
  });

  test("holding the workspace key and V and dragging scales", async ({ page }) => {
    await open(page);
    const start = await inside(surface(page, "a"));
    await hold(page, "v");
    await expect(page.locator(".trellis")).toHaveAttribute("data-gesture-key", "scale");
    const before = await camera(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y - 120, { steps: 6 });
    const during = await camera(page);
    await page.mouse.up();
    await release(page, "v");
    // Dragging up or right zooms in: the camera covers less of the layout.
    expect(during.w).toBeLessThan(before.w * 0.9);
    await expect.poll(() => framed(page)).not.toBeNull();
  });

  test("holding the workspace key and Shift and dragging a rectangle frames what fits it best", async ({
    page,
  }) => {
    await open(page);
    const right = await box(panel(page, "right"));
    await hold(page, "Shift");
    await expect(page.locator(".trellis")).toHaveAttribute("data-gesture-key", "rect");
    await page.mouse.move(right.x + 4, right.y + 4);
    await page.mouse.down();
    await page.mouse.move(right.x + right.width - 4, right.y + right.height - 4, { steps: 6 });
    await expect(page.locator("[data-trellis-part=marquee-target]")).toHaveAttribute("data-visible", "");
    await page.mouse.up();
    await release(page, "Shift");
    await expect.poll(() => framed(page)).toBe("right");
  });

  test("Mod+Shift and dragging draws a rectangle too, with two keys", async ({ page }) => {
    await open(page);
    const right = await box(panel(page, "right"));
    for (const key of ["ControlOrMeta", "Shift"]) await page.keyboard.down(key);
    await expect(page.locator(".trellis")).toHaveAttribute("data-gesture-key", "rect");
    await page.mouse.move(right.x + 4, right.y + 4);
    await page.mouse.down();
    await page.mouse.move(right.x + right.width - 4, right.y + right.height - 4, { steps: 6 });
    await page.mouse.up();
    for (const key of ["Shift", "ControlOrMeta"]) await page.keyboard.up(key);
    await expect.poll(() => framed(page)).toBe("right");
  });

  test("on macOS, ⌘⌃ and dragging scales, without opening a context menu", async ({ page }) => {
    await open(page);
    test.skip(!(await page.evaluate(() => /Mac/.test(navigator.platform))), "⌘⌃ is a macOS-only default");
    await page.evaluate(() => {
      (window as any).__menus = 0;
      document.addEventListener("contextmenu", (e) => !e.defaultPrevented && (window as any).__menus++);
    });
    const start = await inside(surface(page, "a"));
    for (const key of ["Meta", "Control"]) await page.keyboard.down(key);
    await expect(page.locator(".trellis")).toHaveAttribute("data-gesture-key", "scale");
    const before = await camera(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y - 120, { steps: 6 });
    const during = await camera(page);
    await page.mouse.up();
    for (const key of ["Control", "Meta"]) await page.keyboard.up(key);
    expect(during.w).toBeLessThan(before.w * 0.9);
    expect(await page.evaluate(() => (window as any).__menus)).toBe(0);
  });

  test("Escape cancels a rectangle without changing the framing", async ({ page }) => {
    await open(page);
    const right = await box(panel(page, "right"));
    await hold(page, "Shift");
    await page.mouse.move(right.x + 4, right.y + 4);
    await page.mouse.down();
    await page.mouse.move(right.x + right.width - 4, right.y + right.height - 4, { steps: 6 });
    await expect(page.locator("[data-trellis-part=marquee-target]")).toHaveAttribute("data-visible", "");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-trellis-part=marquee-target]")).not.toHaveAttribute("data-visible");
    await page.mouse.up();
    await release(page, "Shift");
    await page.waitForTimeout(300);
    expect(await framed(page)).toBeNull();
  });

  test("holding the workspace key and scrolling steps a level toward the pointer", async ({ page }) => {
    await open(page);
    const at = await inside(surface(page, "files"));
    await page.mouse.move(at.x, at.y);
    await hold(page);
    await page.mouse.wheel(0, -100);
    await release(page);
    await expect.poll(() => framed(page)).toBe("left");
  });

  test('content with gestures: "exclusive" keeps pinch; the workspace key still navigates over it', async ({
    page,
  }) => {
    await open(page, "&gestures=outline:exclusive");
    const at = await inside(surface(page, "outline"));
    await wheel(page, at, Array(14).fill(-6.5), { ctrlKey: true });
    await page.waitForTimeout(400);
    expect(await framed(page)).toBeNull();
    await page.mouse.move(at.x, at.y);
    await hold(page);
    await page.mouse.wheel(0, -100);
    await release(page);
    await expect.poll(() => framed(page)).toBe("right");
  });

  test('content with gestures: "workspace" steps on a plain scroll', async ({ page }) => {
    await open(page, "&gestures=outline:workspace");
    await wheel(page, await inside(surface(page, "outline")), [-100]);
    await expect.poll(() => framed(page)).toBe("right");
  });

  test("gesture keys can be changed or turned off", async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).ws.update({ gestureKeys: { pan: null, step: "Shift" } }));
    await hold(page);
    await expect(page.locator(".trellis")).not.toHaveAttribute("data-gesture-key");
    await release(page);
    const at = await inside(surface(page, "files"));
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Shift");
    await expect.poll(() => framed(page)).toBe("left");
  });

  test("stepping out with Escape is a keymap command, and can be turned off", async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).ws.navigation.frame("left"));
    await page.evaluate(() => (window as any).ws.update({ keymap: { "navigation.stepOut": null } }));
    await tab(page, "files").focus();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    expect(await framed(page)).toBe("left");
    await page.evaluate(() =>
      (window as any).ws.update({ keymap: { "navigation.stepOut": "Mod+Alt+ArrowDown" } }),
    );
    await page.keyboard.press("ControlOrMeta+Alt+ArrowDown");
    await expect.poll(() => framed(page)).toBeNull();
  });
});

test.describe("errors in views", () => {
  /** Adds a vanilla type whose mount throws until window.__fixed is set. */
  const addBroken = (page: Page) =>
    page.evaluate(() => {
      const w = window as any;
      w.errors = [];
      w.ws.on("error", (e: any) => w.errors.push(`${e.source}:${e.viewId ?? ""}:${e.type ?? ""}`));
      w.ws.update({
        types: {
          ...w.types,
          broken: {
            title: "Broken",
            mount(el: HTMLElement) {
              if (!w.__fixed) throw new Error("mount failed");
              el.innerHTML = '<p data-test="broken-ok">recovered</p>';
            },
          },
        },
      });
      return w.ws.open("broken", { placement: { beside: "right", edge: "bottom" } }).id as string;
    });

  test("a view that fails to mount shows a fallback, reports it, and the rest keeps working", async ({
    page,
  }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
    const id = await addBroken(page);
    const fallback = surface(page, id).locator("[data-trellis-part=view-error]");
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute("role", "alert");
    await expect(fallback).toContainText("Broken");
    await expect(fallback).toContainText("mount failed");
    expect(await page.evaluate(() => (window as any).errors)).toContain(`mount:${id}:broken`);
    // The rest of the workspace is untouched.
    await surface(page, "a").locator("[data-test=input]").fill("still here");
    await expect(surface(page, "a").locator("[data-test=input]")).toHaveValue("still here");
    // Try again mounts it once the problem is fixed.
    await page.evaluate(() => ((window as any).__fixed = true));
    await fallback.getByRole("button", { name: "Try again" }).click();
    await expect(surface(page, id).locator("[data-test=broken-ok]")).toBeVisible();
    await expect(surface(page, id).locator("[data-trellis-part=view-error]")).toHaveCount(0);
  });

  test("errorFallback replaces the built-in fallback", async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
    await page.evaluate(() =>
      (window as any).ws.update({
        errorFallback: ({ error, retry }: any) => {
          const el = document.createElement("div");
          el.dataset.test = "custom-fallback";
          el.textContent = `custom: ${error.message}`;
          el.addEventListener("click", retry);
          return el;
        },
      }),
    );
    const id = await addBroken(page);
    await expect(surface(page, id).locator("[data-test=custom-fallback]")).toHaveText("custom: mount failed");
  });

  test("a throwing title function falls back to the type and reports it", async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
    const id = await page.evaluate(() => {
      const w = window as any;
      w.errors = [];
      w.ws.on("error", (e: any) => w.errors.push(`${e.source}:${e.viewId ?? ""}`));
      w.ws.update({
        types: {
          ...w.types,
          untitled: {
            title: () => {
              throw new Error("no title");
            },
            mount() {},
          },
        },
      });
      return w.ws.open("untitled").id as string;
    });
    await expect(tab(page, id)).toContainText("untitled");
    expect(await page.evaluate(() => (window as any).errors)).toContain(`title:${id}`);
  });

  test("a throwing event listener doesn't stop others and is reported", async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
    const result = await page.evaluate(() => {
      const w = window as any;
      const seen: string[] = [];
      w.ws.on("error", (e: any) => seen.push(`error:${e.source}`));
      w.ws.on("change", () => {
        throw new Error("listener broke");
      });
      w.ws.on("change", () => seen.push("second listener ran"));
      w.ws.select("b");
      return seen;
    });
    expect(result).toContain("second listener ran");
    expect(result).toContain("error:listener");
  });

  test("ws.reportError sends an app's own errors through the same channel", async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
    const seen = await page.evaluate(() => {
      const w = window as any;
      const out: any[] = [];
      w.ws.on("error", (e: any) =>
        out.push({ source: e.source, viewId: e.viewId, type: e.type, message: e.error.message }),
      );
      w.ws.reportError(new Error("socket dropped"), { viewId: "a", source: "content" });
      return out;
    });
    expect(seen).toEqual([{ source: "content", viewId: "a", type: "editor", message: "socket dropped" }]);
  });

  test("React: a view that throws while rendering shows a fallback; other views keep their state", async ({
    page,
  }) => {
    await page.goto("/?scenario=react");
    await expect(page.locator("[data-test=inc]").first()).toBeVisible();
    await page.locator("[data-test=inc]").first().click();
    await expect(page.locator("[data-test=inc]").first()).toHaveText("count 1");
    await page.evaluate(() => ((window as any).__boom = true));
    const id = await page.evaluate(() => (window as any).ws.open("boom").id as string);
    const fallback = surface(page, id).locator("[data-trellis-part=view-error]");
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText(`boom in ${id}`);
    expect(await page.evaluate(() => (window as any).errors)).toContain(`render:${id}`);
    // The workspace and the other views survived, state included.
    await page.evaluate(() => (window as any).ws.focus("c1"));
    await expect(page.locator("[data-test=inc]").first()).toHaveText("count 1");
    await page.evaluate(() => ((window as any).__boom = false));
    await page.evaluate((v) => (window as any).ws.focus(v), id);
    await fallback.getByRole("button", { name: "Try again" }).click();
    await expect(surface(page, id).locator("[data-test=boom-ok]")).toBeVisible();
  });
});

test.describe("right to left", () => {
  const open = async (page: Page, extra = "") => {
    await page.goto(`/?scenario=vanilla&dir=rtl${extra}`);
    await expect(tab(page, "a")).toBeVisible();
  };
  const x = async (locator: Locator) => (await box(locator)).x;
  const right = async (locator: Locator) => {
    const b = await box(locator);
    return b.x + b.width;
  };

  test("mirrors the layout: a row's first child is on the right", async ({ page }) => {
    await open(page);
    expect(await x(panel(page, "left"))).toBeGreaterThan(await x(panel(page, "docs")));
    expect(await x(panel(page, "docs"))).toBeGreaterThan(await x(panel(page, "right")));
    await expect(page.locator(".trellis")).toHaveCSS("direction", "rtl");
  });

  test("tabs run right to left, with the panel menu at the end", async ({ page }) => {
    await open(page);
    expect(await x(tab(page, "files"))).toBeGreaterThan(await x(tab(page, "search")));
    const menu = panel(page, "left").locator("[data-trellis-part=panel-menu]");
    expect(await x(menu)).toBeLessThan(await x(tab(page, "search")));
  });

  test("arrow keys in a tab list follow reading order", async ({ page }) => {
    await open(page);
    // Three tabs, so next and previous differ: a, b, c from right to left.
    await page.evaluate(() =>
      (window as any).ws.open("editor", { id: "c", params: { name: "c.ts" }, focus: false }),
    );
    await tab(page, "a").click();
    await page.keyboard.press("ArrowLeft");
    await expect(tab(page, "b")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(tab(page, "c")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "b")).toHaveAttribute("aria-selected", "true");
  });

  test("dividers move the way they're dragged, by pointer and keyboard", async ({ page }) => {
    await open(page);
    const width = async () => (await box(panel(page, "left"))).width;
    const before = await width();
    const d = await box(page.locator("[data-trellis-part=divider][data-index='0']").first());
    // The first divider sits on the left edge of the first panel, which is on the right.
    await drag(page, center(d), { x: d.x + d.width / 2 - 100, y: d.y + d.height / 2 });
    const dragged = await width();
    expect(dragged).toBeGreaterThan(before + 80);
    await page.locator("[data-trellis-part=divider][data-index='0']").first().focus();
    await page.keyboard.press("ArrowLeft");
    expect(await width()).toBeGreaterThan(dragged + 5);
  });

  test("dropping a tab on a panel's left edge docks it on the left", async ({ page }) => {
    await open(page);
    const docs = await box(panel(page, "docs"));
    const from = center(await box(tab(page, "outline")));
    await drag(page, from, { x: docs.x + 12, y: docs.y + docs.height / 2 }, false);
    await page.waitForTimeout(250);
    await page.mouse.up();
    await expect.poll(async () => (await box(surface(page, "outline"))).x).toBeLessThan(docs.x + 40);
    const outline = await box(surface(page, "outline"));
    expect(outline.x + outline.width).toBeLessThanOrEqual((await box(panel(page, "docs"))).x + 12);
    expect(outline.y).toBeGreaterThanOrEqual(docs.y - 2);
  });

  test("reordering tabs follows reading order", async ({ page }) => {
    await open(page);
    // a, b, c run from right to left. Drag c into the gap between a and b.
    await page.evaluate(() =>
      (window as any).ws.open("editor", { id: "c", params: { name: "c.ts" }, focus: false }),
    );
    const b = await box(tab(page, "b"));
    const c = center(await box(tab(page, "c")));
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 10, c.y, { steps: 3 });
    await page.mouse.move(b.x + b.width * 0.85, c.y, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const root = (await doc(page)).root;
        const stage = root.children.find((n: any) => n.kind === "stage");
        return stage.child.views;
      })
      .toEqual(["a", "c", "b"]);
  });

  test("floating windows are placed from the right and follow the pointer", async ({ page }) => {
    await open(page);
    const id = await page.evaluate(
      () =>
        (window as any).ws.open("files", { placement: { float: { x: 0.05, y: 0.1, w: 0.3, h: 0.4 } } })
          .panelId as string,
    );
    const start = await box(panel(page, id));
    expect(start.x).toBeGreaterThan(1200 / 2);
    const bar = await box(panel(page, id).locator("[data-trellis-part=tabbar]"));
    await drag(
      page,
      { x: bar.x + bar.width - 20, y: bar.y + bar.height / 2 },
      {
        x: bar.x + bar.width - 80,
        y: bar.y + bar.height / 2 + 30,
      },
    );
    await expect.poll(async () => (await box(panel(page, id))).x).toBeLessThan(start.x - 30);
  });

  test("menus open toward the start edge, and submenus to the left", async ({ page }) => {
    await open(page);
    const button = await box(panel(page, "docs").locator("[data-trellis-part=panel-menu]"));
    await panel(page, "docs").locator("[data-trellis-part=panel-menu]").click();
    const menu = page.locator(".trellis-menu").first();
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS("direction", "rtl");
    expect(Math.abs((await box(menu)).x - button.x)).toBeLessThan(4);
    const move = menu.getByRole("menuitem", { name: /^Move/ });
    await move.focus();
    await page.keyboard.press("ArrowLeft");
    const sub = page.locator(".trellis-menu").nth(1);
    await expect(sub).toBeVisible();
    // It overlaps its parent slightly, as it does left to right.
    expect(await right(sub)).toBeLessThanOrEqual((await box(menu)).x + 10);
    // The split that lands on the left says so.
    await expect(sub.getByRole("menuitem", { name: "New split left" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".trellis-menu")).toHaveCount(1);
    // Shortcuts keep reading left to right.
    await expect(menu.locator(".trellis-menu-shortcut").first()).toHaveCSS("direction", "ltr");
  });

  test("navigation gestures follow the pointer", async ({ page }) => {
    await open(page, "&navigation=free");
    // Stepping in toward the pointer frames the panel under it.
    const files = center(await box(surface(page, "files")));
    await page.mouse.move(files.x, files.y);
    for (const key of ["ControlOrMeta", "Alt"]) await page.keyboard.down(key);
    await page.mouse.wheel(0, -100);
    for (const key of ["Alt", "ControlOrMeta"]) await page.keyboard.up(key);
    await expect.poll(() => page.evaluate(() => (window as any).ws.navigation.framed)).toBe("left");
    await page.evaluate(() => (window as any).ws.navigation.frame("all"));
    await page.waitForTimeout(300);
    // A rectangle around a panel frames that panel.
    const r = await box(panel(page, "right"));
    for (const key of ["ControlOrMeta", "Alt", "Shift"]) await page.keyboard.down(key);
    await page.mouse.move(r.x + 4, r.y + 4);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width - 4, r.y + r.height - 4, { steps: 6 });
    await page.mouse.up();
    for (const key of ["Shift", "Alt", "ControlOrMeta"]) await page.keyboard.up(key);
    await expect.poll(() => page.evaluate(() => (window as any).ws.navigation.framed)).toBe("right");
    // Panning moves the layout with the pointer.
    await page.evaluate(() => (window as any).ws.navigation.frame("all"));
    await page.waitForTimeout(300);
    const before = await x(panel(page, "docs"));
    const at = center(await box(surface(page, "a")));
    for (const key of ["ControlOrMeta", "Alt"]) await page.keyboard.down(key);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 120, at.y, { steps: 6 });
    const during = await x(panel(page, "docs"));
    await page.mouse.up();
    for (const key of ["Alt", "ControlOrMeta"]) await page.keyboard.up(key);
    expect(during).toBeGreaterThan(before + 60);
  });

  test("a collapsed group mirrors its lines, and double-clicking zooms to the part under the pointer", async ({
    page,
  }) => {
    await open(page, "&navigation=free");
    const ids = await page.evaluate(() => {
      const ws = (window as any).ws;
      const x1 = ws.open("files", { placement: { beside: "right", edge: "bottom", share: 0.5 } });
      const x2 = ws.open("search", { placement: { beside: x1.panelId, edge: "right" } });
      const x3 = ws.open("files", { placement: { beside: x2.panelId, edge: "right" } });
      ws.open("search", { placement: { beside: x3.panelId, edge: "bottom" } });
      const doc = ws.getDocument();
      doc.root.weights = [1, 12, 0.3];
      ws.setDocument(doc);
      ws.navigation.overview();
      return { x1: x1.panelId };
    });
    const group = page.locator("[data-trellis-part=group]");
    await expect(group).toHaveCount(1);
    // The row's first seam, after x1, is measured from the tile's right edge.
    const first = group.locator("i[data-axis=x]").first();
    expect(await first.evaluate((el) => (el as HTMLElement).style.right)).not.toBe("");
    // x1 is the row's first part, so it's on the right of the tile.
    const tile = await box(group);
    await page.mouse.dblclick(tile.x + tile.width * 0.9, tile.y + tile.height / 2);
    await expect(panel(page, ids.x1)).toBeVisible();
  });

  test("resizing a floating window from its left edge grows it leftward", async ({ page }) => {
    await open(page);
    const id = await page.evaluate(
      () =>
        (window as any).ws.open("files", { placement: { float: { x: 0.1, y: 0.1, w: 0.3, h: 0.4 } } })
          .panelId as string,
    );
    const before = await box(panel(page, id));
    const handle = page.locator(`.trellis-handles[data-panel="${id}"] [data-dir=w]`);
    const h = center(await box(handle));
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x - 60, h.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await box(panel(page, id))).width).toBeGreaterThan(before.width + 50);
    const after = await box(panel(page, id));
    expect(Math.abs(after.x + after.width - (before.x + before.width))).toBeLessThan(2);
    // The document still measures it from the right: its start edge.
    const rect = await page.evaluate(
      (p) => (window as any).ws.getDocument().floating.find((f: any) => f.panel.id === p).rect,
      id,
    );
    expect(rect.x).toBeCloseTo(0.1, 2);
  });

  test('direction: "ltr" overrides the page', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).ws.update({ direction: "ltr" }));
    await expect.poll(async () => (await x(panel(page, "left"))) < (await x(panel(page, "docs")))).toBe(true);
  });
});

test.describe("permissions", () => {
  const open = async (page: Page, permissions: unknown) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    await page.evaluate((p) => (window as any).ws.update({ permissions: p }), permissions);
  };
  const menuItems = async (page: Page, panelId: string) => {
    await panel(page, panelId).locator("[data-trellis-part=panel-menu]").click();
    const labels = await page.locator(".trellis-menu").first().getByRole("menuitem").allTextContents();
    await page.keyboard.press("Escape");
    return labels.map((l) => l.trim());
  };
  const tryDragTab = async (page: Page, view: string, target: string) => {
    const from = center(await box(tab(page, view)));
    const t = await box(panel(page, target));
    await drag(page, from, { x: t.x + t.width / 2, y: t.y + t.height / 2 });
    await page.waitForTimeout(300);
  };
  /** Whether dragging the first divider resizes anything. Without the resize permission there's
   * no divider to grab (or focus) at all. */
  const tryDivider = async (page: Page) => {
    const before = (await doc(page)).root.weights[0];
    const divider = page.locator("[data-trellis-part=divider][data-index='0']").first();
    if (!(await divider.isVisible())) return false;
    const d = await box(divider);
    await drag(page, center(d), { x: d.x + 120, y: d.y + d.height / 2 });
    return (await doc(page)).root.weights[0] !== before;
  };

  test("permissions: false locks every layout change, but content, tabs and code still work", async ({
    page,
  }) => {
    await open(page, false);
    const before = await doc(page);
    // Dragging a tab onto another panel does nothing.
    await tryDragTab(page, "outline", "docs");
    expect((await doc(page)).root).toEqual(before.root);
    // Dividers are gone, so there's nothing to drag or focus.
    expect(await tryDivider(page)).toBe(false);
    await expect(page.locator("[data-trellis-part=divider]:visible")).toHaveCount(0);
    // No close buttons; Delete and middle-click don't close.
    await expect(tab(page, "a").locator("[data-trellis-part=tab-close]")).toBeHidden();
    await tab(page, "a").focus();
    await page.keyboard.press("Delete");
    await tab(page, "b").click({ button: "middle" });
    expect(Object.keys((await doc(page)).views)).toEqual(Object.keys(before.views));
    // The panel menu offers nothing that changes the layout.
    const items = await menuItems(page, "docs");
    for (const label of items) expect(label).not.toMatch(/^(Move|Float|Dock|Hide|Close|New split)/);
    // Selecting tabs, typing and code all still work.
    await tab(page, "b").click();
    await expect(tab(page, "b")).toHaveAttribute("aria-selected", "true");
    await surface(page, "b").locator("[data-test=input]").fill("typed");
    await expect(surface(page, "b").locator("[data-test=input]")).toHaveValue("typed");
    await page.evaluate(() => (window as any).ws.close("b"));
    await expect(tab(page, "b")).toHaveCount(0);
  });

  test("each permission turns off only its own actions", async ({ page }) => {
    await open(page, { close: false });
    await expect(tab(page, "a").locator("[data-trellis-part=tab-close]")).toBeHidden();
    expect(await tryDivider(page)).toBe(true);
    await tryDragTab(page, "outline", "docs");
    expect(await panelOf(page, "outline")).toBe("docs");

    await open(page, { resize: false });
    expect(await tryDivider(page)).toBe(false);
    await expect(tab(page, "a").locator("[data-trellis-part=tab-close]")).toBeVisible();
    const floating = await page.evaluate(
      () => (window as any).ws.open("files", { placement: "float" }).panelId as string,
    );
    await expect(page.locator(`.trellis-handles[data-panel="${floating}"]`)).toBeHidden();

    await open(page, { rearrange: false });
    await tryDragTab(page, "outline", "docs");
    expect(await panelOf(page, "outline")).toBe("right");
    expect((await menuItems(page, "docs")).some((l) => l.startsWith("Move"))).toBe(false);
    expect(await tryDivider(page)).toBe(true);

    await open(page, { float: false, hide: false });
    const items = await menuItems(page, "right");
    expect(items.some((l) => /^(Float|Hide)/.test(l))).toBe(false);
    expect(items.some((l) => l.startsWith("Close"))).toBe(true);
  });

  test("without float, a floating window can't be dragged into the layout", async ({ page }) => {
    const floatInto = async () => {
      const id = await page.evaluate(
        () =>
          // An editor: files may not go in the stage, where the docs panel is.
          (window as any).ws.open("editor", {
            params: { name: "f.ts" },
            placement: { float: { x: 0.02, y: 0.62, w: 0.22, h: 0.3 } },
          }).id as string,
      );
      const panelId = await panelOf(page, id);
      // Drop the window, by its tab bar, onto the docs panel's tab bar.
      const bar = await box(panel(page, panelId).locator("[data-trellis-part=tabbar]"));
      const b = await box(tab(page, "b"));
      await drag(
        page,
        { x: bar.x + bar.width * 0.65, y: bar.y + bar.height / 2 },
        { x: b.x + b.width + 10, y: b.y + b.height / 2 },
      );
      await page.waitForTimeout(300);
      return (await doc(page)).floating.some((f: any) => f.panel.id === panelId);
    };
    await open(page, { float: false });
    expect(await floatInto()).toBe(true);
    await open(page, true);
    expect(await floatInto()).toBe(false);
  });

  test("Close other tabs leaves tabs that can't be closed", async ({ page }) => {
    await open(page, true);
    await page.evaluate(() =>
      (window as any).ws.open("locked", { placement: { into: "docs" }, focus: false }),
    );
    await tab(page, "a").click();
    await panel(page, "docs").locator("[data-trellis-part=panel-menu]").click();
    await page.getByRole("menuitem", { name: "Close other tabs" }).click();
    await expect(tab(page, "b")).toHaveCount(0);
    const views = (await doc(page)).views;
    expect(Object.values(views).some((v: any) => v.type === "locked")).toBe(true);
  });

  test("shortcuts respect permissions", async ({ page }) => {
    await open(page, { close: false, float: false, hide: false });
    await page.evaluate(() =>
      (window as any).ws.update({ keymap: { "panel.float": "Mod+Alt+F", "panel.hide": "Mod+Alt+H" } }),
    );
    await tab(page, "a").focus();
    for (const combo of ["ControlOrMeta+Alt+W", "ControlOrMeta+Alt+F", "ControlOrMeta+Alt+H"])
      await page.keyboard.press(combo);
    const d = await doc(page);
    expect(d.floating).toHaveLength(0);
    expect(d.hidden).toHaveLength(0);
    expect(Object.keys(d.views)).toContain("a");
  });

  test("permissions change at runtime", async ({ page }) => {
    await open(page, false);
    await expect(tab(page, "a").locator("[data-trellis-part=tab-close]")).toBeHidden();
    await page.evaluate(() => (window as any).ws.update({ permissions: true }));
    await expect(tab(page, "a").locator("[data-trellis-part=tab-close]")).toBeVisible();
    expect(await tryDivider(page)).toBe(true);
  });
});

test.describe("saved layouts", () => {
  /** A saved layout that also has a view of a type this app doesn't register (yet). */
  const withUnknown = (page: Page) =>
    page.evaluate(() => {
      const ws = (window as any).ws;
      const doc = ws.getDocument();
      doc.views.chart = { type: "chart", params: { series: 3 } };
      doc.root.children[2].views.push("chart");
      return doc;
    });

  test("a view of an unknown type shows a placeholder, and its content once the type is registered", async ({
    page,
  }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
    const saved = await withUnknown(page);
    await page.evaluate((d) => (window as any).ws.setDocument(d), saved);
    await tab(page, "chart").click();
    await expect(surface(page, "chart").locator("[data-trellis-part=view-missing]")).toContainText("chart");
    // Its record, params included, survives saving again.
    expect((await doc(page)).views.chart).toEqual({ type: "chart", params: { series: 3 } });
    await page.evaluate(() => {
      const w = window as any;
      w.ws.update({
        types: {
          ...w.types,
          chart: {
            title: "Chart",
            mount: (el: HTMLElement, view: any) => {
              el.innerHTML = `<p data-test="chart">${view.params.series} series</p>`;
            },
          },
        },
      });
    });
    await expect(surface(page, "chart").locator("[data-test=chart]")).toHaveText("3 series");
    await expect(tab(page, "chart")).toContainText("Chart");
  });

  test('onMissingType: "drop" leaves unknown views out', async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
    const saved = await withUnknown(page);
    await page.evaluate((d) => {
      const ws = (window as any).ws;
      ws.update({ onMissingType: () => "drop" });
      ws.setDocument(d);
    }, saved);
    await expect(tab(page, "chart")).toHaveCount(0);
    expect((await doc(page)).views.chart).toBeUndefined();
    await expect(tab(page, "outline")).toBeVisible();
  });

  test("setDocument accepts anything without throwing, and the workspace stays usable", async ({ page }) => {
    await page.goto("/?scenario=vanilla");
    await expect(tab(page, "a")).toBeVisible();
    const results = await page.evaluate(() => {
      const ws = (window as any).ws;
      const out: string[] = [];
      for (const junk of [null, 42, "layout", [], {}, { root: { kind: "split", children: "no" } }]) {
        try {
          ws.setDocument(junk);
          out.push("ok");
        } catch (error) {
          out.push(String(error));
        }
      }
      ws.open("editor", { params: { name: "after.ts" } });
      return out;
    });
    expect(results.every((r) => r === "ok")).toBe(true);
    await expect(page.locator("[data-trellis-part=tab]")).toHaveCount(1);
  });

  test("a corrupted saved layout falls back to the default", async ({ page }) => {
    await page.goto("/?scenario=vanilla&persist");
    await expect(tab(page, "a")).toBeVisible();
    for (const junk of ["{not json", JSON.stringify({ schema: 1, version: 1, root: 7, views: "x" })]) {
      await page.evaluate((j) => localStorage.setItem("e2e", j), junk);
      await page.reload();
      await expect(tab(page, "a")).toBeVisible();
      await expect(tab(page, "outline")).toBeVisible();
    }
  });
});

test.describe("strict pages", () => {
  test("works with inline style attributes blocked and Trusted Types enforced", async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/?scenario=strict*", async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace(
        "<head>",
        `<head><meta http-equiv="Content-Security-Policy" content="style-src-attr 'none'; require-trusted-types-for 'script'">`,
      );
      await route.fulfill({ response, body: html });
    });
    await page.goto("/?scenario=strict");
    await expect(tab(page, "n3")).toBeVisible();
    // Built-in icons are there: close buttons, the menu button, and a submenu chevron.
    await expect(tab(page, "n3").locator("[data-trellis-part=tab-close] svg")).toBeAttached();
    await expect(panel(page, "docs").locator("[data-trellis-part=panel-menu] svg")).toBeAttached();
    await panel(page, "docs").locator("[data-trellis-part=panel-menu]").click();
    await expect(page.locator(".trellis-menu .trellis-menu-chevron svg").first()).toBeAttached();
    await page.keyboard.press("Escape");
    // The nested group is too small, so it collapses; its lines are positioned.
    const group = page.locator("[data-trellis-part=group]");
    await expect(group).toHaveCount(1);
    const tile = await box(group);
    const first = await box(group.locator("i[data-axis=x]").first());
    expect(first.x).toBeGreaterThan(tile.x + 2);
    expect(first.x).toBeLessThan(tile.x + tile.width - 2);
    // A panel too small for tabs shows its title's first letter.
    await expect(panel(page, "left")).toHaveAttribute("data-frame-only", "");
    await expect(panel(page, "left").locator("[data-trellis-part=frame-icon]")).toHaveText("N");
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as any).violations)).toEqual([]);
    void browserName;
  });
});

test.describe("world transform (experimental)", () => {
  /** Where the camera says each visible docked panel is on screen right now, and where it's drawn.
   * The layer is moved with one transform, so the gaps between panels scale with it while the
   * camera moves (the documented trade-off): each panel's center must be exact, and its size exact
   * once that scaled gap is allowed for. */
  const geometry = (page: Page) =>
    page.evaluate(() => {
      const ws = (window as any).ws;
      const layer = ws.element.querySelector(".trellis-layer") as HTMLElement;
      const m = new DOMMatrix(
        getComputedStyle(layer).transform === "none" ? "" : getComputedStyle(layer).transform,
      );
      const kx = m.a;
      const ky = m.d;
      const host = ws.element.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(ws.element).getPropertyValue("--trellis-gap")) || 0;
      const pad = gap / 2;
      const rtl = getComputedStyle(ws.element).direction === "rtl";
      const c = ws.navigation.camera;
      const W = host.width - pad * 2;
      const H = host.height - pad * 2;
      const out: { id: string; dx: number; dy: number; dw: number; dh: number }[] = [];
      for (const [id, e] of ws.getLayoutRects() as Map<string, any>) {
        if (e.node.kind !== "panel") continue;
        const el = document.querySelector<HTMLElement>(`[data-trellis-part=panel][data-panel="${id}"]`);
        if (!el || getComputedStyle(el).display === "none") continue;
        let x = pad + ((e.rect.x - c.x) / c.w) * W;
        const w = (e.rect.w / c.w) * W;
        if (rtl) x = host.width - x - w;
        const expected = {
          x: x + pad,
          y: pad + ((e.rect.y - c.y) / c.h) * H + pad,
          w: w - gap,
          h: (e.rect.h / c.h) * H - gap,
        };
        const r = el.getBoundingClientRect();
        // Only panels that are actually on screen.
        if (r.right < host.left || r.left > host.right || r.bottom < host.top || r.top > host.bottom)
          continue;
        out.push({
          id,
          dx: Math.abs(r.left - host.left + r.width / 2 - (expected.x + expected.w / 2)),
          dy: Math.abs(r.top - host.top + r.height / 2 - (expected.y + expected.h / 2)),
          dw: Math.abs(r.width - (expected.w + gap - gap * kx)),
          dh: Math.abs(r.height - (expected.h + gap - gap * ky)),
        });
      }
      return out;
    });
  /** Samples geometry on several frames of an animated zoom to `target`. */
  const sampleZoom = async (page: Page, target: string) => {
    await page.evaluate((t) => (window as any).ws.navigation.frame(t), target);
    const samples = [];
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => new Promise(requestAnimationFrame));
      samples.push(...(await geometry(page)));
    }
    return samples;
  };
  /** Waits for the camera, once it has started moving, to come to rest. */
  const still = async (page: Page) => {
    const camera = () => page.evaluate(() => JSON.stringify((window as any).ws.navigation.camera));
    let last = await camera();
    for (let i = 0; i < 50; i++) {
      await page.waitForTimeout(250);
      const now = await camera();
      if (now === last && i > 0) return;
      last = now;
    }
    throw new Error("the camera never came to rest");
  };
  const worst = (samples: { dx: number; dy: number; dw: number; dh: number }[]) =>
    Math.max(0, ...samples.map((s) => Math.max(s.dx, s.dy, s.dw, s.dh)));

  for (const dir of ["ltr", "rtl"])
    test(`panels are drawn exactly where the camera puts them, every frame (${dir})`, async ({ page }) => {
      await page.goto(`/?scenario=vanilla&navigation=free&dir=${dir}`);
      await expect(tab(page, "a")).toBeVisible();
      await page.evaluate(() => (window as any).ws.update({ motion: "full", worldTransform: true }));
      const zoomIn = await sampleZoom(page, "left");
      expect(zoomIn.length).toBeGreaterThan(8);
      expect(worst(zoomIn)).toBeLessThan(1.5);
      await still(page);
      const zoomOut = await sampleZoom(page, "all");
      expect(worst(zoomOut)).toBeLessThan(1.5);
    });

  test("overlay floating windows stay put while the camera moves", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    const id = await page.evaluate(() => {
      const ws = (window as any).ws;
      ws.update({ motion: "full", worldTransform: true });
      return ws.open("files", { placement: { float: { x: 0.55, y: 0.5, w: 0.3, h: 0.35 } } })
        .panelId as string;
    });
    // Let it finish appearing.
    await page.waitForTimeout(500);
    const before = await box(panel(page, id));
    await page.evaluate(() => (window as any).ws.navigation.frame("left"));
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const now = await box(panel(page, id));
      for (const k of ["x", "y", "width", "height"] as const)
        expect(Math.abs(now[k] - before[k])).toBeLessThan(1);
    }
  });

  test("with many panels, a camera move restyles only a few elements per frame", async ({ page }) => {
    await page.goto("/?scenario=stress&cols=10&rows=10&tabs=3");
    await page.waitForFunction(() => (window as any).startup !== undefined);
    const perFrame = await page.evaluate(async () => {
      const ws = (window as any).ws;
      ws.update({ motion: "full", worldTransform: true });
      const changed = new Set<Node>();
      const observer = new MutationObserver((records) => records.forEach((r) => changed.add(r.target)));
      observer.observe(ws.element, { attributes: true, subtree: true });
      const counts: number[] = [];
      ws.navigation.frame(ws.getSnapshot().views[0].panelId);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      for (let i = 0; i < 12; i++) {
        changed.clear();
        await new Promise(requestAnimationFrame);
        await Promise.resolve();
        observer.takeRecords().forEach((r) => changed.add(r.target));
        counts.push(changed.size);
      }
      observer.disconnect();
      return counts.sort((a, b) => a - b);
    });
    // The median frame restyles a handful of elements, not hundreds.
    expect(perFrame[Math.floor(perFrame.length / 2)]).toBeLessThanOrEqual(8);
  });

  test("the layout a camera move ends on is the same as without it", async ({ page }) => {
    const settled = async (world: boolean) => {
      await page.goto("/?scenario=vanilla&navigation=free");
      await expect(tab(page, "a")).toBeVisible();
      await page.evaluate((w) => (window as any).ws.update({ motion: "full", worldTransform: w }), world);
      await page.evaluate(() => (window as any).ws.navigation.frame("left"));
      await still(page);
      // What's on screen: elements out of view keep wherever they were last drawn.
      return page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[data-trellis-part=panel], [data-trellis-part=surface]")]
          .filter((el) => {
            const style = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return (
              style.display !== "none" && style.visibility !== "hidden" && r.right > 0 && r.left < innerWidth
            );
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            return `${el.dataset.panel ?? el.dataset.view} ${Math.round(r.x)} ${Math.round(r.y)} ${Math.round(r.width)} ${Math.round(r.height)}`;
          })
          .sort(),
      );
    };
    const plain = await settled(false);
    const world = await settled(true);
    expect(world).toEqual(plain);
    expect(
      await page.evaluate(() => (window as any).ws.element.querySelector(".trellis-layer").style.transform),
    ).toBe("");
  });

  test("a pinch draws correctly, and refines once it pauses", async ({ page }) => {
    await page.goto("/?scenario=vanilla&navigation=free");
    await expect(tab(page, "a")).toBeVisible();
    await page.evaluate(() => (window as any).ws.update({ worldTransform: true }));
    const at = center(await box(surface(page, "a")));
    // Pinch in a long way, frame by frame, checking geometry as it goes.
    const samples = [];
    for (let i = 0; i < 16; i++) {
      await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y)!;
        target.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: -6.5,
            ctrlKey: true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      }, at);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      samples.push(...(await geometry(page)));
    }
    expect(worst(samples)).toBeLessThan(1.5);
  });
});
