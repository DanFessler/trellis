import { useEffect } from "react";
import { Footer } from "../components/Footer";
import { Arrow, Copy } from "../components/icons";
import { Nav } from "../components/Nav";
import { Link, useRouter } from "../router";
import { HeroDemo } from "./demo/HeroDemo";
import { Features } from "./Features";
import { CodeSample, Examples, FinalCta, Pricing } from "./Sections";
import { ThemeShowcase } from "./ThemeShowcase";

const INSTALL = "npm i @danfessler/trellis @danfessler/trellis-react";

function Lattice({ className }: { className: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern
          id={`${className}-p`}
          width="56"
          height="56"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <path d="M0 0H56M0 0V56" stroke="var(--lattice)" strokeWidth="1.5" fill="none" />
          <circle cx="0" cy="0" r="2.2" fill="var(--lattice)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${className}-p)`} />
    </svg>
  );
}

export function Landing() {
  const { location } = useRouter();
  useEffect(() => {
    document.title = "Trellis · Fractal, dockable workspaces for web tools";
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Nav />
      <main>
        <section className="hero">
          <Lattice className="hero-lattice" />
          <div className="hero-glow" aria-hidden="true" />
          <div className="container hero-copy">
            <Link className="pill" href="/docs/migrating-from-react-dockable">
              <span className="pill-tag">Preview</span>
              <span className="pill-long">Trellis 0.1, the successor to react-dockable</span>
              <span className="pill-short">The successor to react-dockable</span>
              <Arrow />
            </Link>
            <h1>
              What happens when your
              <br /> layout is <span className="grow">fractal</span>?
            </h1>
            <p className="hero-sub">
              Trellis lets people nest panels inside panels as deep as they like, then zoom to whichever part
              they need. Everything else stays live. It's a dockable workspace for web tools such as art
              programs and IDEs.
            </p>
            <div className="hero-ctas">
              <Link className="btn btn-primary" href="/docs/quick-start-react">
                Get started <Arrow />
              </Link>
              <button
                type="button"
                className="install"
                data-copy
                data-copy-text={INSTALL}
                aria-label="Copy install command"
              >
                <span className="install-prompt">$</span>
                <code>npm i @danfessler/trellis</code>
                <Copy />
                <span className="sr-only">Copy</span>
              </button>
            </div>
            <a
              className="hero-video"
              href="https://www.youtube.com/watch?v=Kd9AbKawwhg"
              target="_blank"
              rel="noreferrer"
            >
              Watch the 2-minute video that started it <Arrow />
            </a>
          </div>
          <div className="container hero-demo">
            <HeroDemo />
            <ul className="hints" aria-label="Things to try">
              <li>
                <span className="hint-key">Double-click</span> any tab bar to zoom to it
              </li>
              <li>
                <kbd>Esc</kbd> steps back out one level
              </li>
              <li>
                <span className="hint-key">Free zoom</span> then <kbd>Shift</kbd>+scroll to move through
                levels
              </li>
              <li>
                <span className="hint-key">Drag</span> a tab onto a panel edge to dock it
              </li>
            </ul>
          </div>
        </section>

        <section className="stats">
          <div className="container stats-grid">
            <div>
              <strong>0</strong>
              <span>remounts when a view docks, tabs, floats or hides</span>
            </div>
            <div>
              <strong>~33 kB</strong>
              <span>gzipped core with zero runtime dependencies</span>
            </div>
            <div>
              <strong>4</strong>
              <span>built-in themes, all driven by CSS tokens</span>
            </div>
            <div>
              <strong>1</strong>
              <span>JSON document describes the entire workspace</span>
            </div>
          </div>
        </section>

        <Features />
        <CodeSample />
        <Examples />
        <ThemeShowcase />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
