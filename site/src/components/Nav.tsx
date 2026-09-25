import { useEffect, useState } from "react";
import { Link, useRouter } from "../router";
import { useSiteTheme } from "../theme";
import { Brand } from "./Logo";
import { Close, GitHub, Menu, Moon, Sun } from "./icons";

export const GITHUB_URL = "https://github.com/DanFessler/trellis";
export const SPONSORS_URL = "https://github.com/sponsors/danfessler";

export function ThemeToggle() {
  const { theme, toggle } = useSiteTheme();
  return (
    <button className="icon-btn" type="button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

export function Nav({ wide = false, solid = false }: { wide?: boolean; solid?: boolean }) {
  const { location } = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setOpen(false), [location.path]);
  const inDocs = location.path.startsWith("/docs");
  return (
    <header className="nav" data-scrolled={scrolled || open ? "" : undefined} data-solid={solid ? "" : undefined}>
      <div className={`container nav-inner${wide ? " nav-wide" : ""}`}>
        <Link href="/" aria-label="Trellis home">
          <Brand />
        </Link>
        <nav className="nav-links" data-open={open ? "" : undefined} aria-label="Primary">
          <Link href="/docs/introduction" aria-current={inDocs ? "page" : undefined}>Docs</Link>
          <Link href="/#examples">Examples</Link>
          <Link href="/#theming">Theming</Link>
          <Link href="/#pricing">Pricing</Link>
        </nav>
        <div className="nav-spacer" />
        <div className="nav-actions">
          <ThemeToggle />
          <a className="icon-btn" href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Trellis on GitHub">
            <GitHub />
          </a>
          <Link className="btn btn-primary btn-hide-sm" href="/docs/quick-start-react">
            Get started
          </Link>
          <button className="icon-btn nav-menu-btn" type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <Close /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}
