// Capture screenshots of the IDE in several states (dev server must be running):
//   node examples/ide/scripts/tour.mjs [url] [outDir]
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:5312";
const out = process.argv[3] ?? "notes/shots";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = async (name) => {
  await page.screenshot({ path: `${out}/ide-${name}.png` });
  console.log(`saved ${out}/ide-${name}.png`);
};

await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(900);
await shot("default");

// Edit a file so there is a dirty tab, a change bar and a squiggle.
const ed = page.locator('textarea[data-path="src/timer.ts"]');
await ed.evaluate((el) => {
  el.focus();
  const i = el.value.indexOf("\n  pause() {");
  el.setSelectionRange(i, i);
});
await page.keyboard.press("Enter");
await page.keyboard.type("  skip(): any {");
await page.keyboard.press("Enter");
await page.keyboard.type("this.reset();");
await page.keyboard.press("Enter");
await page.keyboard.type("}");
await page.waitForTimeout(300);
await page.mouse.move(700, 300);
await shot("editing");

// Terminal
await page.locator('[data-trellis-part="tab"]', { hasText: "Terminal" }).click();
const term = page.locator(".term-input input");
for (const cmd of ["ls src", "git status", "npm test"]) {
  await term.click();
  await term.fill(cmd);
  await term.press("Enter");
  await page.waitForTimeout(cmd === "npm test" ? 900 : 150);
}
await shot("terminal");

// Command palette
await page.keyboard.press("ControlOrMeta+Shift+P");
await page.waitForTimeout(200);
await page.keyboard.type("toggle");
await page.waitForTimeout(200);
await shot("palette");
await page.keyboard.press("Escape");

// Quick open
await page.keyboard.press("ControlOrMeta+P");
await page.waitForTimeout(150);
await page.keyboard.type("fmt");
await page.waitForTimeout(150);
await shot("quick-open");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);

// Search
await page.locator('[data-trellis-part="tab"]', { hasText: "Search" }).click();
await page.locator('input[aria-label="Search in files"]').fill("remaining");
await page.waitForTimeout(200);
await shot("search");

// Problems
await page.locator('[data-trellis-part="tab"]', { hasText: "Problems" }).click();
await page.waitForTimeout(200);
await shot("problems");

// Close guard
const timerTab = page.locator('[data-trellis-part="tab"]', { hasText: "timer.ts" });
await timerTab.hover();
await timerTab.locator('[data-trellis-part="tab-close"]').click();
await page.waitForTimeout(300);
await shot("close-guard");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// Themes
for (const theme of ["light", "medium", "darker"]) {
  await page.evaluate((t) => window.__ide.ide.setTheme(t), theme);
  await page.waitForTimeout(300);
  await shot(`theme-${theme}`);
}
await page.evaluate(() => window.__ide.ide.setTheme("dark"));

// Maximized editor
await page.locator('textarea[data-path="src/timer.ts"]').focus();
await page.evaluate(() => window.__ide.ws.navigation.toggle());
await page.waitForTimeout(900);
await shot("maximized");

if (errors.length) console.log("Page errors:\n" + errors.join("\n"));
await browser.close();
