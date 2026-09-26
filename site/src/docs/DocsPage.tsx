import { useEffect, useMemo, useRef, useState } from "react";
import { docs, loaders } from "virtual:docs";
import { Footer } from "../components/Footer";
import { Arrow, ArrowLeft, Close, Menu, Search } from "../components/icons";
import { GITHUB_URL, Nav } from "../components/Nav";
import { isInternal, Link, useRouter } from "../router";

type Page = MarkdownPage;

const SECTION_ORDER = ["Getting started", "Guides", "Reference", "More"];
const cache = new Map<string, Page>();

function useDoc(slug: string) {
  const [page, setPage] = useState<Page | null | undefined>(() => cache.get(slug));
  useEffect(() => {
    const load = loaders[slug];
    if (!load) {
      setPage(null);
      return;
    }
    if (cache.has(slug)) {
      setPage(cache.get(slug));
      return;
    }
    let live = true;
    setPage(undefined);
    load().then((m) => {
      cache.set(slug, m.default);
      if (live) setPage(m.default);
    });
    return () => {
      live = false;
    };
  }, [slug]);
  return page;
}

function Sidebar({ slug, onNavigate }: { slug: string; onNavigate(): void }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = docs.filter(
      (d) => !q || d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
    );
    return SECTION_ORDER.map((section) => ({
      section,
      items: list.filter((d) => d.section === section),
    })).filter((g) => g.items.length);
  }, [query]);
  return (
    <nav className="docs-nav" aria-label="Documentation">
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
                  href={`/docs/${d.slug}`}
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

export function DocsPage({ slug }: { slug: string }) {
  const page = useDoc(slug);
  const { navigate, location } = useRouter();
  const article = useRef<HTMLDivElement>(null);
  const [drawer, setDrawer] = useState(false);
  const index = docs.findIndex((d) => d.slug === slug);
  const meta = docs[index];
  const prev = index > 0 ? docs[index - 1] : null;
  const next = index >= 0 && index < docs.length - 1 ? docs[index + 1] : null;

  useEffect(() => {
    document.title = meta ? `${meta.title} · Trellis` : "Not found · Trellis";
    document.querySelector('meta[name="description"]')?.setAttribute("content", meta?.description ?? "");
  }, [meta]);

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
          <Sidebar slug={slug} onNavigate={() => setDrawer(false)} />
        </div>
        {drawer && <div className="docs-scrim" onClick={() => setDrawer(false)} />}
        <main className="docs-main">
          {page === null ? (
            <article className="prose">
              <p className="eyebrow">404</p>
              <h1>Page not found</h1>
              <p>
                There’s no documentation page at <code>/docs/{slug}</code>. Try the{" "}
                <Link href="/docs/introduction">introduction</Link>.
              </p>
            </article>
          ) : (
            <article className="prose" data-loading={page === undefined || undefined}>
              {meta && <p className="docs-section-label">{meta.section}</p>}
              {page && (
                <>
                  <div ref={article} onClick={onClick} dangerouslySetInnerHTML={{ __html: page.html }} />
                  <div className="docs-footer">
                    <a
                      className="docs-edit"
                      href={`${GITHUB_URL}/edit/main/docs/${slug}.md`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Edit this page on GitHub
                    </a>
                    <nav className="docs-pager" aria-label="Previous and next page">
                      {prev ? (
                        <Link className="pager prev" href={`/docs/${prev.slug}`}>
                          <span>
                            <ArrowLeft /> Previous
                          </span>
                          <strong>{prev.title}</strong>
                        </Link>
                      ) : (
                        <span />
                      )}
                      {next ? (
                        <Link className="pager next" href={`/docs/${next.slug}`}>
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
