import { useEffect, useState } from "react";

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

function PrimitivesArt() {
  return (
    <div className="art-prims" aria-hidden="true">
      <div className="p-side" />
      <div className="p-stage">
        <span>stage</span>
      </div>
      <div className="p-side r" />
      <div className="p-float">float</div>
      <div className="p-frame" />
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
    key: "mounts",
    wide: true,
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
    key: "prims",
    title: "A stage, floating panels and zoom",
    body: "Documents open on a central stage. Panels can float over the stage or the whole app, and users can maximize a panel or zoom around the layout.",
    art: <PrimitivesArt />,
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
            Users arrange panels however they like,
            <br className="br-lg" /> and your views keep their state.
          </h2>
          <p className="section-lede">
            Trellis is built for tools people keep open all day. Moving a panel doesn't reload an iframe or
            reset a canvas, and animation shows where each panel went.
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
