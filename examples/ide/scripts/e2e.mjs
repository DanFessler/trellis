// End-to-end check for the IDE example. Start the dev server first (npm run dev -w trellis-example-ide), then:
//   node examples/ide/scripts/e2e.mjs [url] [--shots=dir]
// Verifies that view content survives Trellis moves: typed text, caret position and the native undo stack
// of an editor survive dragging its tab into a split, and the preview iframe is never reloaded when its
// panel is re-docked, floated or maximized.
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "http://localhost:5312";
const shots = args.find((a) => a.startsWith("--shots="))?.slice(8);

let failures = 0;
const check = (cond, message) => {
  console.log(`${cond ? "✓" : "✗"} ${message}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);

const snapshot = () =>
  page.evaluate(() => {
    const s = window.__ide.ws.getSnapshot();
    return { views: s.views, floating: s.document.floating.length, framed: s.framed };
  });
async function drag(from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(700);
}
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

// ------------------------------------------------------------------ editor: type, split, verify
const path = "src/timer.ts";
const editor = page.locator(`textarea[data-path="${path}"]`);
const original = await editor.inputValue();
await editor.evaluate((el) => {
  el.focus();
  const i = el.value.indexOf("export class Timer");
  el.setSelectionRange(i, i);
});
const marker = "// typed by e2e";
await page.keyboard.type(marker);
await page.keyboard.press("Enter");
await page.keyboard.type("const answer = 42;");
const typed = await editor.inputValue();
const caret = await editor.evaluate((el) => el.selectionStart);
check(typed.includes(marker + "\nconst answer = 42;"), "typed text landed in the editor buffer");

const tab = page.locator('[data-trellis-part="tab"]', { hasText: "timer.ts" });
check(
  !(await tab.locator('[data-trellis-part="tab-badge"]').evaluate((el) => el.hidden)),
  "dirty badge shows on the tab",
);
const accessory = await page.locator(".accessory-text", { hasText: "Ln" }).first().innerText();
check(
  /Ln 6, Col 19/.test(accessory),
  `cursor accessory shows the caret position (${accessory.replace(/\s+/g, " ")})`,
);

const before = await snapshot();
const editorsBefore = before.views.filter((v) => v.type === "editor");
check(new Set(editorsBefore.map((v) => v.panelId)).size === 1, "both editors start in one panel");

const stageBox = await page
  .locator(`[data-trellis-part="surface"][data-type="editor"]:has(textarea[data-path="${path}"])`)
  .boundingBox();
const tabBox = await tab.boundingBox();
await drag(center(tabBox), { x: stageBox.x + stageBox.width - 24, y: stageBox.y + stageBox.height / 2 });
if (shots) await page.screenshot({ path: `${shots}/ide-e2e-split.png` });

const after = await snapshot();
const editorsAfter = after.views.filter((v) => v.type === "editor");
check(
  new Set(editorsAfter.map((v) => v.panelId)).size === 2,
  "dragging the tab split the editors into two panels",
);
check((await editor.inputValue()) === typed, "editor text survived the move");
check((await editor.evaluate((el) => el.selectionStart)) === caret, "caret position survived the move");
check(
  await editor.evaluate(
    (el) => el.isConnected && el === document.querySelector(`textarea[data-path="src/timer.ts"]`),
  ),
  "same textarea element (never remounted)",
);

await editor.focus();
let undos = 0;
while ((await editor.inputValue()) !== original && undos < 80) {
  await page.keyboard.press("ControlOrMeta+z");
  undos++;
}
check(
  (await editor.inputValue()) === original,
  `native undo history survived the move (${undos} undo steps back to the original)`,
);
await page.keyboard.press("ControlOrMeta+Shift+z");
check((await editor.inputValue()) !== original, "redo works too");

// ------------------------------------------------------------------ preview iframe: state across moves
const previewFrame = () => page.frames().find((f) => f.url().startsWith("blob:"));
await page.waitForFunction(() =>
  [...document.querySelectorAll("iframe")].some((f) => f.contentWindow?.__renders > 0),
);
let frame = previewFrame();
const bootId = await frame.evaluate(() => window.__bootId);
await frame.click("#toggle");
await page.waitForTimeout(2300);
const clockBefore = await frame.textContent("#clock");
check(clockBefore !== "25:00", `preview app is running (clock ${clockBefore})`);

const previewInfo = () => snapshot().then((s) => s.views.find((v) => v.type === "preview"));
const p0 = await previewInfo();
// 1) Re-dock: drag the preview tab onto the bottom panel's tab bar.
const previewTab = page.locator('[data-trellis-part="tab"]', { hasText: "Preview" });
const terminalTab = page.locator('[data-trellis-part="tab"]', { hasText: "Terminal" });
const tb = await terminalTab.boundingBox();
await drag(center(await previewTab.boundingBox()), { x: tb.x + tb.width + 140, y: tb.y + tb.height / 2 });
const p1 = await previewInfo();
check(p1.panelId !== p0.panelId, "preview moved into another panel");
frame = previewFrame();
check((await frame.evaluate(() => window.__bootId)) === bootId, "iframe was not reloaded by the re-dock");
check(
  (await frame.textContent("#toggle")) === "Pause",
  "preview app state (running timer) survived the re-dock",
);
if (shots) await page.screenshot({ path: `${shots}/ide-e2e-preview-docked.png` });

// 2) Maximize it (focus navigation), 3) float it, then dock it back.
await page.evaluate((id) => window.__ide.ws.navigation.toggle(id), p1.id);
await page.waitForTimeout(700);
check(!!(await snapshot()).framed, "preview panel maximized");
if (shots) await page.screenshot({ path: `${shots}/ide-e2e-preview-max.png` });
check(
  (await previewFrame().evaluate(() => window.__bootId)) === bootId,
  "iframe was not reloaded by maximize",
);
await page.evaluate(() => window.__ide.ws.navigation.back());
await page.waitForTimeout(600);
await page.evaluate((id) => window.__ide.ws.float(id), p1.id);
await page.waitForTimeout(600);
check((await snapshot()).floating === 1, "preview floated");
if (shots) await page.screenshot({ path: `${shots}/ide-e2e-preview-float.png` });
check(
  (await previewFrame().evaluate(() => window.__bootId)) === bootId,
  "iframe was not reloaded by floating",
);
await page.evaluate((id) => window.__ide.ws.dock(id, { beside: "stage", edge: "right" }), p1.id);
await page.waitForTimeout(600);
check((await snapshot()).floating === 0, "preview docked back beside the stage");
const clockAfter = await previewFrame().textContent("#clock");
check(
  (await previewFrame().evaluate(() => window.__bootId)) === bootId,
  "iframe was not reloaded by docking back",
);
check(
  clockAfter !== clockBefore && clockAfter !== "25:00",
  `timer kept ticking throughout (${clockBefore} → ${clockAfter})`,
);

// ------------------------------------------------------------------ app features
// Explorer opens each file once (reuse: "params").
const fileRow = page.locator('.explorer [data-path="src/format.ts"]');
await fileRow.click();
await fileRow.click();
await page.waitForTimeout(300);
check(
  (await snapshot()).views.filter((v) => v.type === "editor" && v.params.path === "src/format.ts").length ===
    1,
  "explorer opens a file once, then focuses it",
);

// Save clears the dirty badge.
await editor.focus();
await page.keyboard.press("ControlOrMeta+s");
await page.waitForTimeout(150);
check(
  await tab.locator('[data-trellis-part="tab-badge"]').evaluate((el) => el.hidden),
  "Cmd/Ctrl+S saves and clears the dirty badge",
);

// Outline click moves the caret in the active editor.
await page.locator(".outline .symbol", { hasText: "reduce" }).click();
await page.waitForTimeout(300);
const caretLine = await editor.evaluate((el) => el.value.slice(0, el.selectionStart).split("\n").length);
const reduceLine =
  (await editor.inputValue()).split("\n").findIndex((l) => l.includes("export function reduce")) + 1;
check(caretLine === reduceLine, `outline click reveals the symbol (line ${caretLine})`);

// Palette: toggle the terminal off (hide) and back on (restore).
const terminalHidden = async () =>
  (await page.evaluate(() => window.__ide.ws.getSnapshot().hidden)).some((h) =>
    h.views.some((v) => v.type === "terminal"),
  );
await page.locator('[data-trellis-part="tab"]', { hasText: "Terminal" }).click();
for (const expected of [true, false]) {
  await page.keyboard.press("ControlOrMeta+Shift+p");
  await page.keyboard.type("toggle terminal");
  const chosen = await page.locator(".palette-item.selected").innerText();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  if (process.env.DEBUG) console.log("  chose:", chosen.replace(/\s+/g, " "));
  check(
    (await terminalHidden()) === expected,
    `palette "Toggle Terminal" ${expected ? "hides" : "restores"} the terminal panel`,
  );
}

// Terminal commands.
await page.locator('[data-trellis-part="tab"]', { hasText: "Terminal" }).click();
const term = page.locator(".term-input input");
await term.fill("open README.md");
await term.press("Enter");
await page.waitForTimeout(300);
check(
  (await snapshot()).views.some((v) => v.type === "editor" && v.params.path === "README.md"),
  "terminal `open README.md` opens an editor",
);

// Persistence: the layout (including the split editors) comes back after a reload.
const beforeReload = await snapshot();
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);
const afterReload = await snapshot();
const shape = (s) =>
  s.views
    .map((v) => `${v.type}:${v.params.path ?? ""}`)
    .sort()
    .join(",");
check(shape(afterReload) === shape(beforeReload), "layout persisted across reload");
check(
  new Set(afterReload.views.filter((v) => v.type === "editor").map((v) => v.panelId)).size === 2,
  "editor split persisted",
);

check(errors.length === 0, `no page errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
