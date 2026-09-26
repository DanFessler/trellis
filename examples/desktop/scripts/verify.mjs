// End-to-end check for the desktop example.
//   node examples/desktop/scripts/verify.mjs [url]      (dev server must be running; default :5313)
// Opens two apps, docks one to the desktop's edge, hides one into the dock, restores it, and checks
// that the iframe's state (typed text in Notes) survived every move.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5313";
const shots = fileURLToPath(new URL("../../../notes/shots/", import.meta.url));
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(8000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

let step = 0;
async function check(name, fn) {
  step++;
  try {
    await fn();
    console.log(`✓ ${step}. ${name}`);
  } catch (error) {
    console.error(`✗ ${step}. ${name}\n  ${error.message}`);
    await page.screenshot({ path: `${shots}desktop-verify-failure.png` });
    await browser.close();
    process.exit(1);
  }
}
const expect = (ok, message) => {
  if (!ok) throw Error(message);
};
const settle = () => page.waitForTimeout(700);
const panelFor = (title) => page.locator('[data-trellis-part="panel"]', { has: page.locator(`[data-trellis-part="tab-title"]:text-is("${title}")`) });
const notesText = () => page.frameLocator('iframe[title^="Notes"]').locator("textarea").inputValue();
const TYPED = " Typed before docking and hiding.";

await page.goto(url, { waitUntil: "networkidle" });
await settle();

await check("boots with Finder and Notes floating on the desktop", async () => {
  expect((await page.locator('[data-trellis-part="panel"][data-floating]').count()) === 2, "expected two floating windows");
  expect(await panelFor("Studio").isVisible(), "Finder (Studio) window missing");
  expect(await panelFor("Notes").isVisible(), "Notes window missing");
});

await check("type into the Notes iframe", async () => {
  const area = page.frameLocator('iframe[title^="Notes"]').locator("textarea");
  await area.click();
  await area.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
  await area.pressSequentially(TYPED);
  expect((await notesText()).includes(TYPED), "text was not typed");
});

await check("launch Mail from the dock (second app)", async () => {
  await page.click('[data-dock-app="mail"]');
  await settle();
  expect(await panelFor("Inbox").isVisible(), "Mail window did not open");
  expect((await page.locator('[data-dock-app="mail"][data-running]').count()) === 1, "Mail has no running indicator");
});

await check("drag Notes to the desktop's left edge to dock it", async () => {
  // Mail opened on top of Notes' title bar; the dock brings Notes forward first.
  await page.click('[data-dock-app="notes"]');
  await settle();
  const tab = panelFor("Notes").locator('[data-trellis-part="tab-title"]');
  const box = await tab.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(box.x + (6 - box.x) * t, box.y + (420 - box.y) * t);
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(150);
  expect((await page.locator('[data-trellis-part="drop-preview"][data-visible]').count()) === 1, "no dock preview near the edge");
  await page.screenshot({ path: `${shots}desktop-verify-1-dragging.png` });
  await page.mouse.up();
  await settle();
  const region = await panelFor("Notes").getAttribute("data-region");
  expect(region === "side", `Notes region is ${region}, expected side`);
  expect((await notesText()).includes(TYPED), "typed text lost after docking");
  await page.screenshot({ path: `${shots}desktop-verify-2-docked.png` });
});

await check("minimize Notes into the dock", async () => {
  await panelFor("Notes").locator(".light-minimize").click();
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${shots}desktop-verify-3-hiding.png` });
  await settle();
  expect((await panelFor("Notes").count()) === 0, "Notes panel still visible");
  expect((await page.locator(".dock-minimized").count()) === 1, "no minimized tile in the dock");
  await page.screenshot({ path: `${shots}desktop-verify-4-hidden.png` });
});

await check("restore Notes from the dock; iframe state survived", async () => {
  await page.click(".dock-minimized");
  await settle();
  expect(await panelFor("Notes").isVisible(), "Notes did not come back");
  expect((await panelFor("Notes").getAttribute("data-region")) === "side", "Notes did not return to its docked spot");
  const text = await notesText();
  expect(text.includes(TYPED), `typed text lost after hide/restore: …${text.slice(-40)}`);
  expect((await page.locator(".dock-minimized").count()) === 0, "minimized tile not removed");
  await page.screenshot({ path: `${shots}desktop-verify-5-restored.png` });
});

await check("double-click a desktop folder opens Finder there", async () => {
  await page.dblclick('.desktop-folder[data-folder="reference"]');
  await settle();
  expect(await panelFor("Reference").isVisible(), "Finder did not open at Reference");
});

await check("frame the docked Notes and step back", async () => {
  await panelFor("Notes").locator(".light-zoom").click();
  await settle();
  expect((await page.locator(".trellis[data-framed]").count()) === 1, "workspace not framed");
  expect(await page.locator('button[aria-label="Previous view"]').isEnabled(), "back disabled while framed");
  await page.screenshot({ path: `${shots}desktop-verify-6-framed.png` });
  await page.click('button[aria-label="Previous view"]');
  await settle();
  expect((await page.locator(".trellis[data-framed]").count()) === 0, "still framed after back");
  expect((await notesText()).includes(TYPED), "typed text lost after framing");
});

await check("no page errors", async () => {
  expect(!errors.length, errors.join("\n"));
});

await browser.close();
console.log("All desktop checks passed.");
