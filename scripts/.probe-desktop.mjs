import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:5313", { waitUntil: "networkidle" });
await p.waitForTimeout(800);
console.log(await p.evaluate(() => {
  const a = document.activeElement;
  const cs = getComputedStyle(a);
  return [a.outerHTML.slice(0, 200), cs.outline, cs.boxShadow, a.matches(":focus-visible")];
}));
await b.close();
