// Paints, then moves the document around the workspace and checks the pixels survive.
// Usage (dev server running): node examples/paint/scripts/interact.mjs [url] [shotDir]
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:5311";
const shots = process.argv[3] ?? "notes/shots";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.evaluate(() => {
  window.__log = [];
  window.__paint.ws.on("focus", (id) => window.__log.push("focus " + id));
  let last = null;
  window.__paint.app.subscribe(() => {
    const a = window.__paint.app.get().activeDoc;
    if (a !== last) { last = a; window.__log.push("active " + a + " " + new Error().stack.split("\n").slice(2,5).join("|")); }
  });
});
const DOC = "doc-untitled";
const tab = (name) => page.locator('[data-trellis-part="tab"]', { hasText: name });
const canvasBox = async () => (await page.locator(`canvas[data-doc="${DOC}"]`).boundingBox());

// Layer pixel (document space) of the doc, alpha + rgb.
const docPixel = (x, y) =>
  page.evaluate(([id, x, y]) => {
    const d = window.__paint.documents.get(id);
    return [...d.composite().getContext("2d").getImageData(x, y, 1, 1).data];
  }, [DOC, x, y]);
// Pixel as displayed on screen (visible canvas), at a document coordinate.
const screenPixel = (x, y) =>
  page.evaluate(([id, x, y]) => {
    const d = window.__paint.documents.get(id);
    const c = document.querySelector(`canvas[data-doc="${id}"]`);
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.round((d.view.x + x * d.view.zoom) * dpr);
    const sy = Math.round((d.view.y + y * d.view.zoom) * dpr);
    return [...c.getContext("2d").getImageData(sx, sy, 1, 1).data];
  }, [DOC, x, y]);
const toScreen = (x, y) =>
  page.evaluate(([id, x, y]) => {
    const d = window.__paint.documents.get(id);
    const r = document.querySelector(`canvas[data-doc="${id}"]`).getBoundingClientRect();
    return { x: r.left + d.view.x + x * d.view.zoom, y: r.top + d.view.y + y * d.view.zoom };
  }, [DOC, x, y]);
const painted = (px) => px[3] === 255 && !(px[0] > 245 && px[1] > 245 && px[2] > 245);

// 1. Select the blank document and paint an S-curve plus a scribble.
await tab("Untitled-1").click();
await page.waitForTimeout(300);
await page.evaluate(() => (window.__paint.app.set({ tool: "brush" }), window.__paint.app.setBrush({ size: 40 })));
const pts = [];
for (let i = 0; i <= 40; i++) pts.push([300 + i * 25, 500 + Math.sin(i / 6) * 200]);
let s = await toScreen(...pts[0]);
await page.mouse.move(s.x, s.y);
await page.mouse.down();
for (const p of pts.slice(1)) {
  s = await toScreen(...p);
  await page.mouse.move(s.x, s.y, { steps: 2 });
}
await page.mouse.up();
await page.evaluate(() => window.__paint.app.setColor({ h: 210, s: 0.8, v: 0.9 }));
s = await toScreen(800, 250);
await page.mouse.move(s.x, s.y);
await page.mouse.down();
for (let i = 0; i < 30; i++) {
  const p = await toScreen(800 + Math.cos(i / 3) * 150, 250 + i * 8);
  await page.mouse.move(p.x, p.y, { steps: 2 });
}
await page.mouse.up();
await page.waitForTimeout(200);
const probe = [300, 500];
check(painted(await docPixel(...probe)), "stroke is in the document");
check(painted(await screenPixel(...probe)), "stroke is on screen");
check((await tab("Untitled-1").textContent()).includes("•"), "tab title shows the dirty dot");
await page.evaluate((id) => (document.querySelector(`canvas[data-doc="${id}"]`).__marker = "original"), DOC);
await page.screenshot({ path: `${shots}/paint-2-painted.png` });

// 2. Drag the tab to the right edge of the stage → split.
const t = await tab("Untitled-1").boundingBox();
const stage = await page.locator('[data-trellis-part="panel"]', { has: tab("Dusk Study") }).boundingBox();
await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
await page.mouse.down();
const target = { x: stage.x + stage.width - 40, y: stage.y + stage.height / 2 };
for (let i = 1; i <= 20; i++)
  await page.mouse.move(t.x + t.width / 2 + ((target.x - t.x - t.width / 2) * i) / 20, t.y + t.height / 2 + ((target.y - t.y - t.height / 2) * i) / 20);
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(900);
const panels = await page.evaluate(() => {
  const ws = window.__paint.ws;
  const views = ws.getSnapshot().views;
  return { dusk: views.find((v) => v.id === "doc-dusk").panelId, untitled: views.find((v) => v.id === "doc-untitled").panelId };
});
check(panels.dusk !== panels.untitled, `tab docked into its own panel (${panels.untitled})`);
check((await page.evaluate((id) => document.querySelector(`canvas[data-doc="${id}"]`).__marker, DOC)) === "original", "canvas element was not remounted");
check(painted(await docPixel(...probe)), "pixels survive docking");
check(painted(await screenPixel(...probe)), "pixels still on screen after docking");
await page.screenshot({ path: `${shots}/paint-3-split.png` });

// 3. Paint in the new position, then float the panel with an Alt-drag.
s = await toScreen(1300, 800);
await page.mouse.move(s.x, s.y);
await page.mouse.down();
for (let i = 0; i < 12; i++) {
  const p = await toScreen(1300 - i * 20, 800 - i * 10);
  await page.mouse.move(p.x, p.y, { steps: 2 });
}
await page.mouse.up();
const t2 = await tab("Untitled-1").boundingBox();
await page.keyboard.down("Alt");
await page.mouse.move(t2.x + t2.width / 2, t2.y + t2.height / 2);
await page.mouse.down();
for (let i = 1; i <= 16; i++) await page.mouse.move(t2.x + t2.width / 2 - i * 25, t2.y + t2.height / 2 + i * 14);
await page.waitForTimeout(150);
await page.mouse.up();
await page.keyboard.up("Alt");
await page.waitForTimeout(900);
let placement = await page.evaluate(() => window.__paint.ws.getSnapshot().views.find((v) => v.id === "doc-untitled").placement);
if (placement !== "floating") {
  console.log(`  (alt-drag gave placement=${placement}; floating via ws.float)`);
  await page.evaluate(() => window.__paint.ws.float("doc-untitled"));
  await page.waitForTimeout(900);
  placement = await page.evaluate(() => window.__paint.ws.getSnapshot().views.find((v) => v.id === "doc-untitled").placement);
}
check(placement === "floating", "document floats");
check((await page.evaluate((id) => document.querySelector(`canvas[data-doc="${id}"]`).__marker, DOC)) === "original", "canvas survives floating");
check(painted(await docPixel(...probe)) && painted(await docPixel(1300, 800)), "pixels survive floating");
check(painted(await screenPixel(...probe)), "pixels on screen while floating");
await page.screenshot({ path: `${shots}/paint-4-floating.png` });

// 4. Dock it back into the stage and maximize via double-click on the tab bar.
await page.evaluate(() => window.__paint.ws.dock("doc-untitled", "stage"));
await page.waitForTimeout(900);
const bar = page.locator('[data-trellis-part="panel"]', { has: tab("Untitled-1") }).locator('[data-trellis-part="tabbar"]');
const bb = await bar.boundingBox();
await page.mouse.dblclick(bb.x + bb.width - 120, bb.y + bb.height / 2);
await page.waitForTimeout(1000);
const framed = await page.evaluate(() => window.__paint.ws.getSnapshot().framed);
check(!!framed, `double-click maximized a panel (${framed})`);
check(painted(await screenPixel(...probe)), "pixels on screen while maximized");
await page.screenshot({ path: `${shots}/paint-5-maximized.png` });
console.log("  active before esc:", await page.evaluate(() => [window.__paint.app.get().activeDoc, window.__paint.ws.getSnapshot().focusedView]));
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
console.log("  active after esc:", await page.evaluate(() => [window.__paint.app.get().activeDoc, window.__paint.ws.getSnapshot().focusedView, window.__paint.ws.getSnapshot().framed]));

// 5. Canvas zoom: ctrl+wheel over the canvas zooms the document, not the workspace.
const z0 = await page.evaluate((id) => window.__paint.documents.get(id).view.zoom, DOC);
const cb = await canvasBox();
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await page.keyboard.down("Control");
for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -40);
await page.keyboard.up("Control");
await page.waitForTimeout(200);
const z1 = await page.evaluate((id) => window.__paint.documents.get(id).view.zoom, DOC);
check(z1 > z0 * 1.3, `ctrl+wheel zooms the canvas (${z0.toFixed(2)} → ${z1.toFixed(2)})`);
check(!(await page.evaluate(() => window.__paint.ws.getSnapshot().framed)), "workspace navigation unaffected");
await page.keyboard.press("Control+0");

// 6. Undo / redo.
console.log("  active:", await page.evaluate(() => [window.__paint.app.get().activeDoc, window.__paint.ws.getSnapshot().focusedView, document.activeElement?.outerHTML.slice(0, 80)]));
const before = await page.evaluate((id) => window.__paint.documents.get(id).index, DOC);
await page.keyboard.press("Control+z");
const afterUndo = await page.evaluate((id) => window.__paint.documents.get(id).index, DOC);
await page.keyboard.press("Control+Shift+z");
const afterRedo = await page.evaluate((id) => window.__paint.documents.get(id).index, DOC);
check(afterUndo === before - 1 && afterRedo === before, `undo/redo (${before} → ${afterUndo} → ${afterRedo})`);

// 7. Close guard: closing a dirty document asks first; Cancel keeps it.
await tab("Untitled-1").hover();
await tab("Untitled-1").locator('[data-trellis-part="tab-close"]').click();
await page.waitForTimeout(300);
check(await page.locator(".dialog").isVisible(), "close guard dialog appears");
await page.screenshot({ path: `${shots}/paint-6-close-guard.png` });
await page.locator(".dialog button", { hasText: "Cancel" }).click();
await page.waitForTimeout(300);
check((await tab("Untitled-1").count()) === 1, "Cancel keeps the document open");

// 8. Window menu hides and restores a panel.
await page.locator(".menubar-button", { hasText: "Window" }).dispatchEvent("pointerdown", { button: 0 });
await page.locator(".dropdown-item", { hasText: "Navigator" }).click();
await page.waitForTimeout(600);
let hidden = await page.evaluate(() => window.__paint.ws.getSnapshot().hidden.length);
check(hidden === 1, "Window → Navigator hides it");
await page.locator(".menubar-button", { hasText: "Window" }).dispatchEvent("pointerdown", { button: 0 });
await page.locator(".dropdown-item", { hasText: "Navigator" }).click();
await page.waitForTimeout(600);
hidden = await page.evaluate(() => window.__paint.ws.getSnapshot().hidden.length);
check(hidden === 0, "Window → Navigator restores it");

// 9. Reload: layout (Trellis persistence) and pixels (IndexedDB) come back.
await page.waitForTimeout(1200);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
check((await tab("Untitled-1").count()) === 1, "document tab restored after reload");
check(painted(await docPixel(...probe)), "pixels restored after reload");

check(errors.length === 0, `no page errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
