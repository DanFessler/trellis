import { useEffect, useRef, useState } from "react";

/** A stack of panels that nests into itself: each level splits off a square and leaves a smaller
 * copy of the whole. Zooming by φ² into the corner lands on an identical picture, so it loops.
 * Like real Trellis chrome, gaps, corners and tab bars stay the same size on screen while the
 * panels zoom, so each frame is drawn in pixels rather than by scaling the drawing. */
const PHI = (1 + Math.sqrt(5)) / 2;
const ZOOM_TILES = (() => {
  const tiles: { x: number; y: number; s: number }[] = [];
  let x = 0,
    y = 0,
    w = PHI,
    h = 1;
  for (let i = 0; i < 20; i++) {
    if (i % 2 === 0) {
      tiles.push({ x, y, s: h });
      x += h;
      w -= h;
    } else {
      tiles.push({ x, y, s: w });
      y += w;
      h -= w;
    }
  }
  return tiles;
})();
const ZOOM = { period: 6000, gap: 3, radius: 7, bar: 8, stroke: 1 };

function ZoomArt() {
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const bodies = useRef<(SVGPathElement | null)[]>([]);
  const bars = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    const el = host.current!;
    let width = 0,
      height = 0,
      frame = 0,
      visible = true;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rounded = (x: number, y: number, w: number, h: number, r: number, bottom = true) =>
      `M${x} ${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
      (bottom
        ? `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}Z`
        : `V${y + h}H${x}Z`);

    const draw = (time: number) => {
      if (!width || !height) return;
      // Hold, zoom two levels deeper at a constant apparent speed, hold, then start over.
      const p = reduced ? 0 : (time % ZOOM.period) / ZOOM.period;
      const t = Math.min(1, Math.max(0, (p - 0.25) / 0.6));
      const eased = t * t * (3 - 2 * t);
      const zoom = PHI ** (2 * eased);
      // Fill the width and keep the bottom-right corner (where the stack converges) in view.
      const unit = Math.max(width / PHI, height) * zoom;
      const cx = (width + Math.max(width / PHI, height) * PHI) / 2;
      const cy = height;
      ZOOM_TILES.forEach((tile, i) => {
        const body = bodies.current[i]!;
        const bar = bars.current[i]!;
        const x = cx + (tile.x - PHI) * unit + ZOOM.gap;
        const y = cy + (tile.y - 1) * unit + ZOOM.gap;
        const size = tile.s * unit - ZOOM.gap * 2;
        const offscreen = x > width || y > height || x + size < 0 || y + size < 0;
        if (size < 3 || offscreen) {
          body.style.display = bar.style.display = "none";
          return;
        }
        const r = Math.min(ZOOM.radius, size / 4);
        body.style.display = "";
        body.setAttribute("d", rounded(x, y, size, size, r));
        if (size < ZOOM.bar * 4) {
          bar.style.display = "none";
        } else {
          bar.style.display = "";
          bar.setAttribute("d", rounded(x, y, size, ZOOM.bar, r, false));
        }
      });
    };
    const loop = (time: number) => {
      draw(time);
      if (!reduced && visible) frame = requestAnimationFrame(loop);
    };
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      svg.current!.setAttribute("viewBox", `0 0 ${width} ${height}`);
      draw(performance.now());
    });
    resize.observe(el);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible && !reduced) frame = requestAnimationFrame(loop);
    });
    seen.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      seen.disconnect();
    };
  }, []);

  return (
    <div className="art-zoom" ref={host} aria-hidden="true">
      <svg ref={svg}>
        {ZOOM_TILES.map((_, i) => (
          <g key={i} data-even={i % 2 === 0 || undefined}>
            <path ref={(el) => void (bodies.current[i] = el)} className="art-zoom-body" />
            <path ref={(el) => void (bars.current[i] = el)} className="art-zoom-bar" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function MountsOnceArt() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="art-mounts" aria-hidden="true">
      <div className="art-slot s1">
        <span>side</span>
      </div>
      <div className="art-slot s2">
        <span>stage</span>
      </div>
      <div className="art-slot s3">
        <span>float</span>
      </div>
      <div className="art-mover">
        <div className="art-mover-bar">
          <i />
          <b>Canvas</b>
        </div>
        <div className="art-mover-body">
          <div className="art-counter">
            <span className="mono">useState</span>
            <strong>{n}</strong>
          </div>
          <div className="art-mounted">mounted 1×</div>
        </div>
      </div>
    </div>
  );
}

function MotionArt() {
  return (
    <div className="art-motion" aria-hidden="true">
      <svg viewBox="0 0 240 120" fill="none">
        <defs>
          <linearGradient id="motion-g" x1="0" x2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.15" />
            <stop offset="1" stopColor="currentColor" />
          </linearGradient>
        </defs>
        <path d="M8 108 H232" stroke="var(--line-strong)" strokeDasharray="2 4" />
        <path d="M8 30 H232" stroke="var(--line-strong)" strokeDasharray="2 4" />
        <path
          d="M8 108 C 50 108, 58 18, 96 22 S 130 36, 150 31 S 190 29, 232 30"
          stroke="url(#motion-g)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="232" cy="30" r="5" fill="currentColor" />
      </svg>
      <div className="art-motion-labels">
        <span>pick up</span>
        <span>overshoot</span>
        <span>settle</span>
      </div>
    </div>
  );
}

function AdaptersArt() {
  return (
    <div className="art-adapters" aria-hidden="true">
      <div className="pkg core">
        <b>@danfessler/trellis</b>
        <span>core · no dependencies</span>
      </div>
      <div className="pkg-links">
        <i />
        <i />
      </div>
      <div className="pkg-row">
        <div className="pkg">
          <b>trellis-react</b>
        </div>
        <div className="pkg">
          <b>trellis-element</b>
        </div>
      </div>
    </div>
  );
}

const THEMES = [
  { name: "light", bg: "#dfe0e4", panel: "#ffffff", bar: "#f1f1f4" },
  { name: "medium", bg: "#1f1f22", panel: "#45454a", bar: "#38383c" },
  { name: "dark", bg: "#0c0d0f", panel: "#1a1b1f", bar: "#141518" },
  { name: "darker", bg: "#050506", panel: "#111215", bar: "#0b0c0e" },
];
function ThemesArt() {
  return (
    <div className="art-themes" aria-hidden="true">
      {THEMES.map((t) => (
        <div key={t.name} className="art-theme" style={{ background: t.bg }}>
          <div className="art-theme-panel" style={{ background: t.panel }}>
            <div className="art-theme-bar" style={{ background: t.bar }}>
              <i style={{ background: t.panel }} />
            </div>
          </div>
          <span>{t.name}</span>
        </div>
      ))}
    </div>
  );
}

function PersistArt() {
  return (
    <pre className="art-json" aria-hidden="true">
      <span className="k">{"{"}</span>
      {"\n  "}
      <span className="p">"schema"</span>: <span className="n">1</span>,{"\n  "}
      <span className="p">"root"</span>: {"{ "}
      <span className="p">"kind"</span>: <span className="s">"split"</span>, …{" }"},{"\n  "}
      <span className="p">"floating"</span>: [ … ],{"\n  "}
      <span className="p">"hidden"</span>: [ … ],{"\n  "}
      <span className="p">"views"</span>: {"{ "}
      <span className="s">"doc-1"</span>: {"{ "}
      <span className="p">"type"</span>: <span className="s">"doc"</span>
      {" } }"}
      {"\n"}
      <span className="k">{"}"}</span>
    </pre>
  );
}

function RulesArt() {
  return (
    <div className="art-rules" aria-hidden="true">
      <code>singleton</code>
      <code>allow: {"{ stage: false }"}</code>
      <code>placement: "stage"</code>
      <code>minSize</code>
      <code>closable: false</code>
      <code>reuse: "params"</code>
    </div>
  );
}

function KeysArt() {
  return (
    <div className="art-keys" aria-hidden="true">
      <div>
        <kbd>⌘</kbd>
        <kbd>⇧</kbd>
        <kbd>↩</kbd>
        <span>Maximize</span>
      </div>
      <div>
        <kbd>F6</kbd>
        <span>Next panel</span>
      </div>
      <div>
        <kbd>⌘</kbd>
        <kbd>⌥</kbd>
        <kbd>]</kbd>
        <span>Next tab</span>
      </div>
      <div>
        <kbd>Esc</kbd>
        <span>Go back</span>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    key: "zoom",
    wide: true,
    title: "Nest panels as deep as you like, then zoom in",
    body: "Split panels inside panels to any depth. The view zooms to a panel, a group or a run of neighbours and resizes it to fill the workspace. Panels too small to use show as icons until you zoom in, and everything stays mounted the whole time.",
    art: <ZoomArt />,
  },
  {
    key: "mounts",
    title: "Views stay mounted when they move",
    body: "Each view renders once, into a container that stays put in the DOM. Docking, tabbing, floating and hiding move the container with CSS, so an iframe keeps its session and React keeps its state.",
    art: <MountsOnceArt />,
  },
  {
    key: "motion",
    title: "Animated drags and zoom",
    body: "Drags, drops and zooms animate, so users can see where each panel went. Views resize when the motion settles, not on every frame.",
    art: <MotionArt />,
  },
  {
    key: "adapters",
    title: "Works with or without React",
    body: "The core is plain TypeScript with no runtime dependencies. Use it through the React adapter, the <trellis-workspace> element or plain DOM.",
    art: <AdaptersArt />,
  },
  {
    key: "themes",
    title: "Themed with CSS custom properties",
    body: "Start from one of four built-in themes and override its tokens. Built-in rules have zero specificity, so your own CSS wins.",
    art: <ThemesArt />,
  },
  {
    key: "persist",
    title: "The layout is one JSON document",
    body: "The whole workspace serializes to one document. Pass storageKey to save it in localStorage, or keep it in your own state.",
    art: <PersistArt />,
  },
  {
    key: "rules",
    title: "Placement rules per view type",
    body: "Declare where each type of view may dock and how it opens. Trellis applies the rules during drags and in open().",
    art: <RulesArt />,
  },
  {
    key: "keys",
    title: "Keyboard navigation and shortcuts",
    body: "Tabs use roving focus, dividers move with the arrow keys, and Shift+F10 opens the panel menu. You can remap any shortcut.",
    art: <KeysArt />,
  },
];

export function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <header className="section-head">
          <p className="eyebrow">Features</p>
          <h2>
            A layout people can move through,
            <br className="br-lg" /> with every view kept alive.
          </h2>
          <p className="section-lede">
            Trellis is built for tools people keep open all day. They can pack in as many panels as they need
            and zoom to the part they're working on. Moving or zooming never reloads an iframe or resets a
            canvas.
          </p>
        </header>
        <div className="bento">
          {FEATURES.map((f) => (
            <article key={f.key} className={`card card-${f.key}${f.wide ? " wide" : ""}`}>
              <div className="card-art">{f.art}</div>
              <div className="card-copy">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
