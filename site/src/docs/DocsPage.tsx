import { useEffect, useMemo, useRef, useState } from "react";
import { indexes, latest, loaders, versions } from "virtual:docs";
import { Footer } from "../components/Footer";
import { Arrow, ArrowLeft, Close, Menu, Search } from "../components/icons";
import { GITHUB_URL, Nav } from "../components/Nav";
import { isInternal, Link, useRouter } from "../router";
import { docHref } from "./paths";

type Page = MarkdownPage;

const SECTION_ORDER = ["Getting started", "Guides", "Reference", "More"];
const cache = new Map<string, Page>();

function useDoc(version: string, slug: string) {
  const key = `${version}/${slug}`;
  const [page, setPage] = useState<Page | null | undefined>(() => cache.get(key));
  useEffect(() => {
    const load = loaders[version]?.[slug];
    if (!load) {
      setPage(null);
      return;
    }
    if (cache.has(key)) {
      setPage(cache.get(key));
      return;
    }
    let live = true;
    setPage(undefined);
    load().then((m) => {
      cache.set(key, m.default);
      if (live) setPage(m.default);
    });
    return () => {
      live = false;
    };
  }, [version, slug, key]);
  return page;
}

const labelOf = (v: DocVersion) =>
  v.kind === "next" ? "next (unreleased)" : `${v.version}${v.key === latest ? " (latest)" : ""}`;

/** Switch versions, staying on the same page when the other version has it. */
function VersionPicker({ version, slug }: { version: string; slug: string }) {
  const { navigate } = useRouter();
  if (versions.length < 2) return null;
  return (
    <label className="docs-version">
      <span>Version</span>
      <select
        value={version}
        onChange={(e) => {
          const next = e.target.value;
          const has = indexes[next]?.some((d) => d.slug === slug);
          navigate(docHref(next, has ? slug : "introduction"));
        }}
      >
        {versions.map((v) => (
          <option key={v.key} value={v.key}>
            {labelOf(v)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Says when you're not reading the latest release's docs, and links to them. */
function VersionNote({ version, slug }: { version: string; slug: string }) {
  const current = versions.find((v) => v.key === version);
  const newest = versions.find((v) => v.key === latest);
  if (!current || version === latest || !newest) return null;
  const target = indexes[latest]?.some((d) => d.slug === slug) ? slug : "introduction";
  return (
    <div className="docs-version-note" role="note">
      {current.kind === "next" ? (
        <>
          These docs describe changes on <code>main</code> that aren’t released yet. The latest release is{" "}
          {newest.version}.
        </>
      ) : (
        <>
          You’re reading the docs for Trellis {current.version}. The latest release is {newest.version}.
        </>
      )}{" "}
      <Link href={docHref(latest, target)}>Read the {newest.version} docs</Link>
    </div>
  );
}

function Sidebar({ version, slug, onNavigate }: { version: string; slug: string; onNavigate(): void }) {
  const [query, setQuery] = useState("");
  const docs = indexes[version] ?? [];
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = docs.filter(
      (d) => !q || d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
    );
    return SECTION_ORDER.map((section) => ({
      section,
      items: list.filter((d) => d.section === section),
    })).filter((g) => g.items.length);
  }, [query, docs]);
  return (
    <nav className="docs-nav" aria-label="Documentation">
      <VersionPicker version={version} slug={slug} />
      <label className="docs-search">
        <Search />
        <input
          type="search"
          placeholder="Filter pages"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter documentation pages"
        />
      </label>
      {groups.map((g) => (
        <div key={g.section} className="docs-nav-group">
          <h4>{g.section}</h4>
          <ul>
            {g.items.map((d) => (
              <li key={d.slug}>
                <Link
                  href={docHref(version, d.slug)}
                  aria-current={d.slug === slug ? "page" : undefined}
                  onClick={onNavigate}
                >
                  {d.nav ?? d.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!groups.length && <p className="docs-nav-empty">No pages match “{query}”.</p>}
    </nav>
  );
}

function Toc({ headings }: { headings: Page["headings"] }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter((x): x is HTMLElement => !!x);
    if (!els.length) return;
    const onScroll = () => {
      let current: string | null = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top < 120) current = el.id;
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [headings]);
  if (!headings.length) return null;
  return (
    <aside className="docs-toc" aria-label="On this page">
      <h4>On this page</h4>
      <ul>
        {headings.map((h) => (
          <li key={h.id} data-depth={h.depth}>
            <a href={`#${h.id}`} aria-current={active === h.id ? "true" : undefined}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function DocsPage({ version, slug }: { version: string; slug: string }) {
  const page = useDoc(version, slug);
  const docs = indexes[version] ?? [];
  const current = versions.find((v) => v.key === version);
  const { navigate, location } = useRouter();
  const article = useRef<HTMLDivElement>(null);
  const [drawer, setDrawer] = useState(false);
  const index = docs.findIndex((d) => d.slug === slug);
  const meta = docs[index];
  const prev = index > 0 ? docs[index - 1] : null;
  const next = index >= 0 && index < docs.length - 1 ? docs[index + 1] : null;

  useEffect(() => {
    const suffix = version === latest ? "" : ` (${current?.kind === "next" ? "next" : current?.version})`;
    document.title = meta ? `${meta.title}${suffix} · Trellis` : "Not found · Trellis";
    document.querySelector('meta[name="description"]')?.setAttribute("content", meta?.description ?? "");
  }, [meta, version, current]);

  // Scroll to hash after content renders.
  useEffect(() => {
    if (!page) return;
    if (location.hash) {
      const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el) requestAnimationFrame(() => el.scrollIntoView());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Client-side navigation for links inside rendered Markdown.
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return;
    const href = a.getAttribute("href") ?? "";
    if (!isInternal(href)) return;
    e.preventDefault();
    if (href.startsWith("#")) {
      history.replaceState(null, "", href);
      document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: "smooth" });
    } else navigate(href);
  };

  return (
    <>
      <Nav wide solid />
      <div className="docs">
        <button type="button" className="docs-drawer-btn" onClick={() => setDrawer(true)}>
          <Menu /> {meta?.title ?? "Docs"}
        </button>
        <div className="docs-sidebar" data-open={drawer ? "" : undefined}>
          <div className="docs-sidebar-head">
            <span>Documentation</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close menu"
              onClick={() => setDrawer(false)}
            >
              <Close />
            </button>
          </div>
          <Sidebar version={version} slug={slug} onNavigate={() => setDrawer(false)} />
        </div>
        {drawer && <div className="docs-scrim" onClick={() => setDrawer(false)} />}
        <main className="docs-main">
          {page === null ? (
            <article className="prose">
              <p className="eyebrow">404</p>
              <h1>Page not found</h1>
              <p>
                There’s no documentation page at <code>{docHref(version, slug)}</code>. Try the{" "}
                <Link href={docHref(version, "introduction")}>introduction</Link>.
              </p>
            </article>
          ) : (
            <article className="prose" data-loading={page === undefined || undefined}>
              <VersionNote version={version} slug={slug} />
              {meta && <p className="docs-section-label">{meta.section}</p>}
              {page && (
                <>
                  <div ref={article} onClick={onClick} dangerouslySetInnerHTML={{ __html: page.html }} />
                  <div className="docs-footer">
                    {current?.kind === "release" && version !== latest ? (
                      <a
                        className="docs-edit"
                        href={`${GITHUB_URL}/blob/${current.ref}/docs/${slug}.md`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View this page at {current.ref} on GitHub
                      </a>
                    ) : (
                      <a
                        className="docs-edit"
                        href={`${GITHUB_URL}/edit/main/docs/${slug}.md`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Edit this page on GitHub
                      </a>
                    )}
                    <nav className="docs-pager" aria-label="Previous and next page">
                      {prev ? (
                        <Link className="pager prev" href={docHref(version, prev.slug)}>
                          <span>
                            <ArrowLeft /> Previous
                          </span>
                          <strong>{prev.title}</strong>
                        </Link>
                      ) : (
                        <span />
                      )}
                      {next ? (
                        <Link className="pager next" href={docHref(version, next.slug)}>
                          <span>
                            Next <Arrow />
                          </span>
                          <strong>{next.title}</strong>
                        </Link>
                      ) : (
                        <span />
                      )}
                    </nav>
                  </div>
                </>
              )}
            </article>
          )}
          {page && <Toc headings={page.headings} />}
        </main>
      </div>
      <Footer />
    </>
  );
}
