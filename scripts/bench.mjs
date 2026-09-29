// Performance benchmarks: startup, memory and frame timing for large workspaces, at full speed
// and with the CPU slowed 4×. `npm run bench` (no build needed; serves the e2e app with Vite).
// Prints Markdown tables: the numbers in docs/performance.md come from here.
// `WORLD=1 npm run bench` measures with the experimental `worldTransform` option on, and
// `WORLD=auto` with it deciding per move.
import os from "node:os";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const PORT = 5340;
const VIEWPORT = { width: 1600, height: 1000 };
const SIZES = [
  { cols: 4, rows: 4, tabs: 1 },
  { cols: 6, rows: 6, tabs: 3 },
  { cols: 10, rows: 10, tabs: 3 },
];
const THROTTLES = [1, 4];

const server = await createServer({
  configFile: "e2e/app/vite.config.ts",
  server: { port: PORT, strictPort: true },
  logLevel: "error",
});
await server.listen();
const browser = await chromium.launch();

/** Frame timing over `action`: every frame's duration, and main-thread tasks over 50 ms. */
async function frames(page, action) {
  await page.evaluate(() => {
    const w = window;
    w.__frames = [];
    w.__long = 0;
    w.__recording = true;
    let last = performance.now();
    const tick = (t) => {
      w.__frames.push(t - last);
      last = t;
      if (w.__recording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    w.__observer = new PerformanceObserver((list) => (w.__long += list.getEntries().length));
    w.__observer.observe({ type: "longtask" });
  });
  await action();
  const { list, long } = await page.evaluate(() => {
    const w = window;
    w.__recording = false;
    w.__observer.disconnect();
    return { list: w.__frames.slice(1), long: w.__long };
  });
  const sorted = [...list].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    median: at(0.5),
    p95: at(0.95),
    worst: sorted[sorted.length - 1] ?? 0,
    // Frames that took more than one and a half 60 Hz frames.
    slow: list.filter((f) => f > 25).length / Math.max(1, list.length),
    long,
  };
}

const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function run(size, throttle) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await page.goto(
    `http://localhost:${PORT}/?scenario=stress&cols=${size.cols}&rows=${size.rows}&tabs=${size.tabs}&world=${process.env.WORLD ?? ""}`,
  );
  await page.waitForFunction(() => window.startup !== undefined, null, { timeout: 60000 });
  const startup = await page.evaluate(() => window.startup);
  await page.waitForTimeout(500);
  await cdp.send("HeapProfiler.collectGarbage");
  const metrics = Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
  );
  const views = await page.evaluate(() => window.ws.getSnapshot().views.length);

  // Dragging a divider a quarter of the screen and back, so the layout ends where it started.
  const divider = center(await page.locator("[data-trellis-part=divider]:visible").first().boundingBox());
  const dragDivider = async () => {
    await page.mouse.move(divider.x, divider.y);
    await page.mouse.down();
    await page.mouse.move(divider.x + VIEWPORT.width / 4, divider.y, { steps: 30 });
    await page.mouse.move(divider.x, divider.y, { steps: 30 });
    await page.mouse.up();
  };
  // Dragging a tab (or, when panels are icon tiles, a whole tile) over the layout, with live drop
  // previews, then cancelling.
  const handle = page.locator(
    "[data-trellis-part=tab]:visible, [data-trellis-part=panel][data-frame-only]:visible",
  );
  const grab = center(await handle.first().boundingBox());
  const dragTab = async () => {
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 20, grab.y + 20, { steps: 4 });
    await page.mouse.move(VIEWPORT.width * 0.8, VIEWPORT.height * 0.7, { steps: 60 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
  };
  // The first time is measured on its own: the browser compiles and lays things out for it.
  const firstDrag = await frames(page, dragTab);
  await dragDivider();
  const divide = await frames(page, dragDivider);
  const tabDrag = await frames(page, dragTab);

  // An animated zoom to one panel and back out.
  await page.evaluate(() => window.ws.update({ motion: "full" }));
  const zoom = await frames(page, async () => {
    await page.evaluate(() => window.ws.navigation.frame(window.ws.getSnapshot().views[0].panelId));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.ws.navigation.overview());
    await page.waitForTimeout(700);
  });

  // A trackpad pinch: a stream of small Ctrl+wheel events.
  const pinch = await frames(page, async () => {
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let i = 0;
          const target = document.querySelector("[data-trellis-part=surface]");
          const next = () => {
            if (i++ >= 40) return resolve();
            target.dispatchEvent(
              new WheelEvent("wheel", {
                deltaY: -4.5,
                ctrlKey: true,
                clientX: 800,
                clientY: 500,
                bubbles: true,
                cancelable: true,
              }),
            );
            setTimeout(next, 16);
          };
          next();
        }),
    );
    await page.waitForTimeout(500);
  });

  await context.close();
  return {
    startup,
    heap: metrics.JSHeapUsedSize / 1024 / 1024,
    nodes: metrics.Nodes,
    views,
    firstDrag,
    divide,
    tabDrag,
    zoom,
    pinch,
  };
}

const ms = (v) => `${v.toFixed(1)} ms`;
const pct = (v) => `${(v * 100).toFixed(0)}%`;
const chromiumVersion = browser.version();
console.log(
  `Machine: ${os.cpus()[0].model}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
);
console.log(`Browser: Chromium ${chromiumVersion} (headless), ${VIEWPORT.width}×${VIEWPORT.height}\n`);

for (const throttle of THROTTLES) {
  console.log(`### ${throttle === 1 ? "Full speed" : `CPU slowed ${throttle}×`}\n`);
  console.log(
    "| Layout | Views | Startup | JS heap | Interaction | Median frame | 95th percentile | Worst | Slow frames | Long tasks |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const size of SIZES) {
    const r = await run(size, throttle);
    const label = `${size.cols}×${size.rows} panels`;
    const rows = [
      ["First drag", r.firstDrag],
      ["Divider drag", r.divide],
      ["Tab drag", r.tabDrag],
      ["Animated zoom", r.zoom],
      ["Pinch zoom", r.pinch],
    ];
    rows.forEach(([name, f], i) =>
      console.log(
        `| ${i ? "" : label} | ${i ? "" : r.views} | ${i ? "" : ms(r.startup)} | ${i ? "" : `${r.heap.toFixed(1)} MB`} | ${name} | ${ms(f.median)} | ${ms(f.p95)} | ${ms(f.worst)} | ${pct(f.slow)} | ${f.long} |`,
      ),
    );
  }
  console.log("");
}

await browser.close();
await server.close();
