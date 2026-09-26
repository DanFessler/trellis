// Measure frame times during animated transitions in the stress scenario (36 panels, 108 views).
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:5330/?scenario=stress");
await page.waitForTimeout(500);
const result = await page.evaluate(async () => {
  const ws = window.ws;
  const measure = (action) =>
    new Promise((resolve) => {
      const frames = [];
      let last = performance.now();
      const start = last;
      action();
      const loop = (t) => {
        frames.push(t - last);
        last = t;
        if (t - start < 700) requestAnimationFrame(loop);
        else resolve(frames);
      };
      requestAnimationFrame(loop);
    });
  const panel = ws.getDocument().root.children[2].children[3].id;
  const zoom = await measure(() => ws.navigation.frame(panel));
  const back = await measure(() => ws.navigation.overview());
  const close = await measure(() => ws.close(ws.views()[40].id));
  const stats = (f) => ({ frames: f.length, avg: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1), max: +Math.max(...f).toFixed(1) });
  return { zoom: stats(zoom), back: stats(back), close: stats(close) };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
