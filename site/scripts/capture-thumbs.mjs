// Regenerate the example gallery thumbnails in public/thumbs/.
// 1) npm run build -w trellis-site   (builds the examples into dist/examples)
// 2) npm run dev -w trellis-site     (serves dist/examples at /examples/ in dev)
// 3) node site/scripts/capture-thumbs.mjs [baseUrl]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:5320";
const out = path.join(here, "../public/thumbs");
const browser = await chromium.launch();
for (const name of ["paint", "ide", "desktop", "vanilla"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
  // examples/desktop resolves its wallpaper relative to its CSS bundle when built with base "./".
  await page.route("**/assets/wallpapers/*", (route) =>
    route.fulfill({ path: path.join(here, "../dist/examples/desktop/wallpapers/sierra-dusk.jpg") }),
  );
  await page.goto(`${base}/examples/${name}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: "jpeg", quality: 78 });
  await page.close();
  console.log(`thumb: ${name}`);
}
await browser.close();
