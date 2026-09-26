// Marketing/QA screenshots: themes, menus, dialogs, empty stage.
// Usage (dev server running): node examples/paint/scripts/shots.mjs [url] [shotDir]
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:5311";
const dir = process.argv[3] ?? "notes/shots";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.screenshot({ path: `${dir}/paint-hero.png` });

const openMenu = async (label) => {
  await page.locator(".menubar-button", { hasText: label }).dispatchEvent("pointerdown", { button: 0 });
  await page.waitForTimeout(250);
};
await openMenu("Window");
await page.screenshot({ path: `${dir}/paint-window-menu.png`, clip: { x: 0, y: 0, width: 720, height: 480 } });
await page.keyboard.press("Escape");

for (const theme of ["light", "medium", "darker"]) {
  await page.evaluate((t) => window.__paint.app.set({ theme: t }), theme);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/paint-theme-${theme}.png` });
}
await page.evaluate(() => window.__paint.app.set({ theme: "dark" }));

await openMenu("File");
await page.locator(".dropdown-item", { hasText: "New Document" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${dir}/paint-new-doc.png` });
await page.keyboard.press("Escape");

// Empty stage: close both documents (they are clean, so no guard).
for (const id of ["doc-dusk", "doc-untitled"]) await page.evaluate((id) => window.__paint.ws.close(id), id);
await page.waitForTimeout(700);
await page.screenshot({ path: `${dir}/paint-empty.png` });
await page.evaluate(() => window.__paint.ws.reset());
await browser.close();
if (errors.length) console.log(errors.join("\n"));
console.log("done");
