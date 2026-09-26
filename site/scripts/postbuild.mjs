// Emit a real index.html for every docs page (so deep links work on any static host,
// with the right <title> and description), plus a 404.html fallback.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "../dist");
const docsDir = path.join(here, "../../docs");
const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const front = (src) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  const data = {};
  if (m)
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0)
        data[line.slice(0, i).trim()] = line
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
    }
  return data;
};
// Attributes may be split across lines by the formatter, so match any whitespace between them.
const page = (title, description, url) =>
  template
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escape(description)}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${escape(title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${escape(description)}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${escape(url)}$2`);
const SITE = "https://trellisui.com";

let count = 0;
for (const file of fs.readdirSync(docsDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"))) {
  const slug = file.replace(/\.md$/, "");
  const data = front(fs.readFileSync(path.join(docsDir, file), "utf8"));
  const out = path.join(dist, "docs", slug);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, "index.html"),
    page(`${data.title ?? slug} · Trellis`, data.description ?? "", `${SITE}/docs/${slug}`),
  );
  count++;
}
fs.mkdirSync(path.join(dist, "docs"), { recursive: true });
fs.writeFileSync(
  path.join(dist, "docs", "index.html"),
  page("Docs · Trellis", "Trellis documentation.", `${SITE}/docs`),
);
fs.writeFileSync(path.join(dist, "404.html"), page("Not found · Trellis", "", SITE));
console.log(`postbuild: wrote ${count} docs pages and 404.html`);
