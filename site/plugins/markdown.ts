/**
 * A small build-time Markdown pipeline.
 *
 * - `import page from "./x.md"` → `{ title, description, headings, html }`, rendered with
 *   `marked` and highlighted with `shiki` in Node. No Markdown or highlighter code ships to the browser.
 * - `import { docs, loaders } from "virtual:docs"` → the docs index (from front matter) and lazy loaders.
 */
import fs from "node:fs";
import path from "node:path";
import { Marked, type Tokens } from "marked";
import { createHighlighter, type Highlighter } from "shiki";
import type { Plugin } from "vite";

export interface DocHeading {
  depth: number;
  id: string;
  text: string;
}
export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  section: string;
  order: number;
}

const LANGS = ["tsx", "ts", "jsx", "js", "json", "css", "html", "bash", "sh", "md", "diff"];
let highlighter: Promise<Highlighter> | null = null;
const getHighlighter = () =>
  (highlighter ??= createHighlighter({ themes: ["vitesse-light", "vitesse-dark"], langs: LANGS }));

export function parseFrontMatter(source: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    data[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return { data, body: source.slice(match[0].length) };
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      // Input is plain text (markup already removed), so "<ViewType>" is a literal name, not a tag.
      .replace(/&[a-z]+;/g, "")
      .replace(/[`'"“”‘’()[\]{}:;,.!?/\\*+=<>|@#$%^&~]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
  );
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COPY_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3.2V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

/** Render a fenced code block to highlighted HTML with a header and copy button. */
export async function renderCode(code: string, lang: string, meta = ""): Promise<string> {
  const hl = await getHighlighter();
  const language = LANGS.includes(lang) ? lang : "text";
  const title = /title="([^"]+)"/.exec(meta)?.[1];
  const html = hl.codeToHtml(code.replace(/\n$/, ""), {
    lang: language,
    themes: { light: "vitesse-light", dark: "vitesse-dark" },
    defaultColor: false,
  });
  const label =
    title ??
    (
      {
        tsx: "TSX",
        ts: "TypeScript",
        jsx: "JSX",
        js: "JavaScript",
        bash: "Terminal",
        sh: "Terminal",
        css: "CSS",
        html: "HTML",
        json: "JSON",
        diff: "Diff",
      } as Record<string, string>
    )[language] ??
    "";
  return (
    `<div class="code-block" data-lang="${language}">` +
    `<div class="code-head"><span class="code-title">${escapeHtml(label)}</span>` +
    `<button type="button" class="code-copy" data-copy aria-label="Copy code">${COPY_ICON}<span>Copy</span></button></div>` +
    html.replace(/ tabindex="0"/, "") +
    `</div>`
  );
}

export async function renderMarkdown(source: string) {
  const { data, body } = parseFrontMatter(source);
  const headings: DocHeading[] = [];
  const used = new Map<string, number>();
  const codeBlocks: Promise<string>[] = [];
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(this: any, token: Tokens.Heading) {
        const inner: string = this.parser.parseInline(token.tokens);
        const plain = inner
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        let id = slugify(plain) || "section";
        const n = used.get(id) ?? 0;
        used.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (token.depth === 2 || token.depth === 3) headings.push({ depth: token.depth, id, text: plain });
        if (token.depth === 1) return `<h1>${inner}</h1>\n`;
        return `<h${token.depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${token.depth}>\n`;
      },
      code(token: Tokens.Code) {
        const [lang = "", ...rest] = (token.lang ?? "").split(/\s+/);
        const index = codeBlocks.push(renderCode(token.text, lang, rest.join(" "))) - 1;
        return `<!--code:${index}-->`;
      },
      link(this: any, token: Tokens.Link) {
        let href = token.href;
        const inner = this.parser.parseInline(token.tokens);
        // ./page.md#hash → /docs/page#hash
        const md = /^(?:\.\/)?([\w-]+)\.md(#.*)?$/.exec(href);
        if (md) href = `/docs/${md[1]}${md[2] ?? ""}`;
        const external = /^https?:\/\//.test(href);
        return `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${inner}</a>`;
      },
      table(this: any, token: Tokens.Table) {
        const cell = (c: Tokens.TableCell) => this.parser.parseInline(c.tokens);
        const head = token.header.map((c) => `<th>${cell(c)}</th>`).join("");
        const rows = token.rows
          .map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`)
          .join("");
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
      blockquote(this: any, token: Tokens.Blockquote) {
        const inner: string = this.parser.parse(token.tokens);
        const kind = /^<p><strong>(Note|Tip|Warning|Important)<\/strong>/i.exec(inner)?.[1]?.toLowerCase();
        return `<blockquote${kind ? ` class="callout callout-${kind}"` : ""}>${inner}</blockquote>\n`;
      },
    },
  });
  let html = await marked.parse(body);
  const rendered = await Promise.all(codeBlocks);
  html = html.replace(/<!--code:(\d+)-->/g, (_, i) => rendered[Number(i)]);
  const title = data.title ?? /^#\s+(.+)$/m.exec(body)?.[1] ?? "";
  return { title, description: data.description ?? "", data, headings, html };
}

const VIRTUAL = "virtual:docs";
const RESOLVED = "\0" + VIRTUAL;

export function markdown(options: { docsDir: string }): Plugin {
  const docsDir = path.resolve(options.docsDir);
  const readIndex = (): DocMeta[] =>
    fs
      .readdirSync(docsDir)
      .filter((f) => f.endsWith(".md"))
      .map((file) => {
        const { data, body } = parseFrontMatter(fs.readFileSync(path.join(docsDir, file), "utf8"));
        return {
          slug: file.replace(/\.md$/, ""),
          title: data.title ?? /^#\s+(.+)$/m.exec(body)?.[1] ?? file,
          description: data.description ?? "",
          section: data.section ?? "Guides",
          order: Number(data.order ?? 999),
          nav: data.nav,
        };
      })
      .filter((d) => !d.slug.startsWith("_"))
      .sort((a, b) => a.order - b.order);
  return {
    name: "trellis-markdown",
    enforce: "pre",
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id !== RESOLVED) return;
      const docs = readIndex();
      for (const d of docs) this.addWatchFile(path.join(docsDir, `${d.slug}.md`));
      const loaders = docs
        .map(
          (d) =>
            `  ${JSON.stringify(d.slug)}: () => import(${JSON.stringify(path.join(docsDir, `${d.slug}.md`))}),`,
        )
        .join("\n");
      return `export const docs = ${JSON.stringify(docs)};\nexport const loaders = {\n${loaders}\n};\n`;
    },
    async transform(src, id) {
      if (!id.endsWith(".md")) return;
      const page = await renderMarkdown(src);
      return {
        code: `export default ${JSON.stringify({ title: page.title, description: page.description, headings: page.headings, html: page.html })};`,
        map: null,
      };
    },
    configureServer(server) {
      server.watcher.add(docsDir);
      const reindex = (file: string) => {
        if (!file.startsWith(docsDir) || !file.endsWith(".md")) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", reindex);
      server.watcher.on("unlink", reindex);
    },
  };
}
