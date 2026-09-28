// Emit a real index.html for every docs page (so deep links work on any static host,
// with the right <title> and description), plus a 404.html fallback.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "../dist");
const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
// Attributes may be split across lines by the formatter, so match any whitespace between them.
const page = (title, description, url) =>
  template
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escape(description)}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${escape(title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${escape(description)}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${escape(url)}$2`);
const SITE = "https://trellisui.com";

// Every page of every version (see plugins/versions.ts). The latest release is at /docs/<page>;
// every version, the latest included, is also at /docs/<version>/<page>. Only the latest release's
// own URLs are indexed by search engines.
const manifest = JSON.parse(fs.readFileSync(path.join(here, "../.docs-cache/manifest.json"), "utf8"));
const noindex = (html) => html.replace("</head>", '  <meta name="robots" content="noindex" />\n  </head>');
let count = 0;
const write = (url, html) => {
  const out = path.join(dist, url);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "index.html"), html);
  count++;
};
for (const set of manifest.sets) {
  const latest = set.key === manifest.latest;
  const label = set.kind === "next" ? "next" : set.version;
  for (const { slug, title, description } of set.pages) {
    if (latest) write(`docs/${slug}`, page(`${title} · Trellis`, description, `${SITE}/docs/${slug}`));
    write(
      `docs/${set.key}/${slug}`,
      noindex(page(`${title} (${label}) · Trellis`, description, `${SITE}/docs/${set.key}/${slug}`)),
    );
  }
}
fs.mkdirSync(path.join(dist, "docs"), { recursive: true });
fs.writeFileSync(
  path.join(dist, "docs", "index.html"),
  page("Docs · Trellis", "Trellis documentation.", `${SITE}/docs`),
);
fs.writeFileSync(path.join(dist, "404.html"), page("Not found · Trellis", "", SITE));
console.log(
  `postbuild: wrote ${count} docs pages (${manifest.sets.map((s) => s.key).join(", ")}) and 404.html`,
);
