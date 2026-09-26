// Renders the social preview image (site/public/og.png, 1200 × 630) with Playwright.
// node site/scripts/og-image.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const paths = readFileSync(here("../src/components/logo-paths.ts"), "utf8");
const MARK = JSON.parse(`{${/MARK = \{([^}]*)\}/.exec(paths)[1].replace(/(\w+):/g, '"$1":')}}`);

// The nested stack of panels from the features card, drawn at a fixed zoom.
const PHI = (1 + Math.sqrt(5)) / 2;
function spiral(width, height) {
  const tiles = [];
  let x = 0,
    y = 0,
    w = PHI,
    h = 1;
  for (let i = 0; i < 14; i++) {
    if (i % 2 === 0) {
      tiles.push({ x, y, s: h, i });
      x += h;
      w -= h;
    } else {
      tiles.push({ x, y, s: w, i });
      y += w;
      h -= w;
    }
  }
  const unit = Math.min(width / PHI, height);
  const gap = 5;
  return tiles
    .map((t) => {
      const size = t.s * unit - gap * 2;
      if (size < 4) return "";
      const px = t.x * unit + gap;
      const py = t.y * unit + gap;
      const r = Math.min(10, size / 4);
      const even = t.i % 2 === 0;
      const bar = size > 60 ? 18 : 0;
      const lights =
        size > 110
          ? [0, 1, 2]
              .map((k) => `<circle cx="${px + 14 + k * 10}" cy="${py + bar / 2}" r="3" fill="#0a0b0a"/>`)
              .join("")
          : "";
      return `<rect x="${px}" y="${py}" width="${size}" height="${size}" rx="${r}" fill="${even ? "rgba(181,240,104,.13)" : "#171a17"}" stroke="${even ? "rgba(181,240,104,.45)" : "rgba(236,242,230,.16)"}"/>${
        bar
          ? `<path d="M${px} ${py + r}a${r} ${r} 0 0 1 ${r} ${-r}h${size - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${bar - r}h${-size}z" fill="${even ? "rgba(181,240,104,.45)" : "rgba(236,242,230,.16)"}"/>${lights}`
          : ""
      }`;
    })
    .join("");
}

const html = `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,650;12..96,750&family=Inter:wght@450&display=swap">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: #0a0b0a; color: #eef1ea; font-family: Inter, sans-serif; overflow: hidden; position: relative; }
  .glow { position: absolute; inset: auto -200px -300px auto; width: 900px; height: 700px; background: radial-gradient(closest-side, rgba(150,230,70,.16), transparent); }
  .copy { position: absolute; left: 80px; top: 88px; width: 560px; }
  .brand { display: flex; align-items: center; gap: 14px; font: 650 34px "Bricolage Grotesque", sans-serif; letter-spacing: -0.02em; }
  .brand svg { width: 38px; height: 38px; }
  h1 { margin-top: 64px; font: 750 88px/0.98 "Bricolage Grotesque", sans-serif; letter-spacing: -0.035em; }
  h1 span { color: #b5f068; }
  p { margin-top: 30px; font-size: 27px; line-height: 1.4; color: #a9b1a1; }
  .art { position: absolute; right: 64px; top: 174px; }
</style></head><body>
<div class="glow"></div>
<div class="copy">
  <div class="brand"><svg viewBox="0 0 ${MARK.size} ${MARK.size}"><path d="${MARK.tiles}" fill="#eef1ea" fill-opacity=".28"/><path d="${MARK.leaf}" fill="#b5f068"/></svg>Trellis</div>
  <h1><span>Fractal</span> layouts for web apps</h1>
  <p>Nest panels to any depth and zoom to the part you need. Everything else stays live.</p>
</div>
<svg class="art" width="466" height="288" viewBox="0 0 466 288">${spiral(466, 288)}</svg>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: here("../public/og.png") });
await browser.close();
console.log("Wrote site/public/og.png");
