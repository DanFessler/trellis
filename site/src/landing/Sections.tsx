import { useEffect, useState } from "react";
import reactSample from "../snippets/react-sample.md";
import vanillaSample from "../snippets/vanilla-sample.md";
import elementSample from "../snippets/element-sample.md";
import { Arrow, Check, External, Heart } from "../components/icons";
import { SPONSORS_URL } from "../components/Nav";
import { Link } from "../router";

// ------------------------------------------------------------------ code sample
const SAMPLES = [
  { id: "react", label: "React", html: reactSample.html },
  { id: "vanilla", label: "Vanilla TS", html: vanillaSample.html },
  { id: "element", label: "Web component", html: elementSample.html },
];

export function CodeSample() {
  const [tab, setTab] = useState("react");
  return (
    <section className="section" id="code">
      <div className="container code-grid">
        <div className="code-copy-col">
          <p className="eyebrow">Developer experience</p>
          <h2>Describe the workspace. Trellis runs it.</h2>
          <p className="section-lede">
            Register view types, sketch an initial layout, and render your components. Trellis owns dragging,
            docking, focus, motion and persistence; your content just renders.
          </p>
          <ul className="checks">
            <li><Check /><span>Initial layout in JSX or with the <code>layout</code> builder</span></li>
            <li><Check /><span><code>open()</code> with placement, reuse and singleton rules</span></li>
            <li><Check /><span>Hooks for view state, titles, badges and close guards</span></li>
            <li><Check /><span>One JSON document for persistence or controlled state</span></li>
          </ul>
          <div className="code-links">
            <Link className="btn btn-ghost" href="/docs/quick-start-react">React quick start</Link>
            <Link className="text-link" href="/docs/quick-start-vanilla">
              Vanilla quick start <Arrow />
            </Link>
          </div>
        </div>
        <div className="code-panel">
          <div className="code-tabs" role="tablist" aria-label="Code sample language">
            {SAMPLES.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} onClick={() => setTab(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          {SAMPLES.map((s) => (
            <div key={s.id} role="tabpanel" hidden={tab !== s.id} dangerouslySetInnerHTML={{ __html: s.html }} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ examples
interface ExampleInfo {
  name: string;
  title: string;
  body: string;
  tags: string[];
  shape: "paint" | "ide" | "desktop" | "vanilla";
}
const EXAMPLES: ExampleInfo[] = [
  { name: "paint", title: "Paint", body: "An art program: documents on the stage, brush, color, layers and navigator palettes docked around it.", tags: ["React", "stage", "palettes"], shape: "paint" },
  { name: "ide", title: "IDE", body: "Explorer, editor tabs, terminal, problems and outline — plus a live-preview iframe that keeps running through every move.", tags: ["React", "iframes", "persistence"], shape: "ide" },
  { name: "desktop", title: "Desktop", body: "A desktop built only from primitives: windows are stage floats, the dock restores hidden panels, and you can zoom around it.", tags: ["React", "floating", "free zoom"], shape: "desktop" },
  { name: "vanilla", title: "Ops dashboard", body: "No framework: live charts, logs and a runbook iframe with createWorkspace and plain DOM — plus a <trellis-workspace> version.", tags: ["TypeScript", "core", "custom element"], shape: "vanilla" },
];

function ExampleThumb({ shape }: { shape: ExampleInfo["shape"] }) {
  const [failed, setFailed] = useState(false);
  if (!failed)
    return (
      <div className="thumb thumb-shot" aria-hidden="true">
        <img src={`/thumbs/${shape}.jpg`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      </div>
    );
  return (
    <div className={`thumb thumb-${shape}`} aria-hidden="true">
      {shape === "paint" && (
        <>
          <div className="t-col"><i /><i /></div>
          <div className="t-stage"><div className="t-paper"><svg viewBox="0 0 100 60"><path d="M8 52 C 30 10, 55 60, 92 12" /></svg></div><div className="t-float" /></div>
          <div className="t-col"><i /></div>
        </>
      )}
      {shape === "ide" && (
        <>
          <div className="t-col"><i /></div>
          <div className="t-main">
            <div className="t-editor">{Array.from({ length: 7 }, (_, i) => <b key={i} style={{ width: `${30 + ((i * 37) % 55)}%`, marginLeft: `${(i % 3) * 8}%` }} />)}</div>
            <div className="t-term" />
          </div>
          <div className="t-col"><i /></div>
        </>
      )}
      {shape === "desktop" && (
        <>
          <div className="t-wall" />
          <div className="t-win w1" />
          <div className="t-win w2" />
          <div className="t-dock"><i /><i /><i /><i /></div>
        </>
      )}
      {shape === "vanilla" && (
        <>
          <div className="t-col"><i /></div>
          <div className="t-stage t-plain"><code>createWorkspace()</code></div>
          <div className="t-col"><i /><i /></div>
        </>
      )}
    </div>
  );
}

export function Examples() {
  const [available, setAvailable] = useState<Set<string> | null>(null);
  useEffect(() => {
    fetch("/examples/manifest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((m: { examples: { name: string }[] }) => setAvailable(new Set(m.examples.map((e) => e.name))))
      .catch(() => setAvailable(null));
  }, []);
  const isLive = (name: string) => (available ? available.has(name) : import.meta.env.DEV);
  return (
    <section className="section" id="examples">
      <div className="container">
        <header className="section-head">
          <p className="eyebrow">Examples</p>
          <h2>Same engine. Very different tools.</h2>
          <p className="section-lede">Complete applications built with Trellis. Open one in a new tab and rearrange everything.</p>
        </header>
        <div className="examples">
          {EXAMPLES.map((e) => {
            const live = isLive(e.name);
            const Tag = live ? "a" : "div";
            return (
              <Tag key={e.name} className="example" data-disabled={live ? undefined : ""} {...(live ? { href: `/examples/${e.name}/`, target: "_blank", rel: "noreferrer" } : {})}>
                <ExampleThumb shape={e.shape} />
                <div className="example-copy">
                  <div className="example-title">
                    <h3>{e.title}</h3>
                    {live ? <External /> : <span className="soon">Coming soon</span>}
                  </div>
                  <p>{e.body}</p>
                  <div className="tags">{e.tags.map((t) => <span key={t}>{t}</span>)}</div>
                </div>
              </Tag>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ pricing
export function Pricing() {
  return (
    <section className="section" id="pricing">
      <div className="container">
        <header className="section-head center">
          <p className="eyebrow">License</p>
          <h2>Free to explore. Fair to ship.</h2>
          <p className="section-lede">
            Trellis is source-available. Non-commercial work is free; commercial use is licensed through GitHub
            Sponsors; organizations with more than ten people get an enterprise agreement.
          </p>
        </header>
        <div className="tiers">
          <article className="tier">
            <h3>Non-commercial</h3>
            <p className="price">Free</p>
            <p className="tier-desc">Personal, educational and other non-commercial projects.</p>
            <ul>
              <li><Check /> Use, modify and share</li>
              <li><Check /> Every package and feature</li>
              <li><Check /> Community support</li>
            </ul>
            <Link className="btn btn-ghost" href="/docs/installation">Install Trellis</Link>
          </article>
          <article className="tier">
            <h3>Individual</h3>
            <p className="price">$10<small>/month</small></p>
            <p className="tier-desc">Commercial use by an individual, while you sponsor on GitHub.</p>
            <ul>
              <li><Check /> Commercial projects & client work</li>
              <li><Check /> Bundle in products you ship</li>
              <li><Check /> Directly funds development</li>
            </ul>
            <a className="btn btn-ghost" href={SPONSORS_URL} target="_blank" rel="noreferrer">
              <Heart /> Sponsor
            </a>
          </article>
          <article className="tier featured">
            <div className="tier-badge">Teams</div>
            <h3>Studio</h3>
            <p className="price">$100<small>/month</small></p>
            <p className="tier-desc">A studio-wide commercial license for organizations of ten or fewer.</p>
            <ul>
              <li><Check /> Everyone on the team is covered</li>
              <li><Check /> Internal tools & products</li>
              <li><Check /> Directly funds development</li>
            </ul>
            <a className="btn btn-primary" href={SPONSORS_URL} target="_blank" rel="noreferrer">
              <Heart /> Sponsor on GitHub
            </a>
          </article>
          <article className="tier">
            <h3>Enterprise</h3>
            <p className="price">Let’s talk</p>
            <p className="tier-desc">More than ten people, or you need custom terms, priority support or SLAs.</p>
            <ul>
              <li><Check /> Custom licensing terms</li>
              <li><Check /> Priority support</li>
              <li><Check /> Legal review & SLAs</li>
            </ul>
            <a className="btn btn-ghost" href="mailto:dan@danfessler.com?subject=Trellis%20Enterprise%20License">Contact Dan</a>
          </article>
        </div>
        <p className="tiers-foot">
          Prices are GitHub Sponsors tiers. A summary, not legal advice — read the <Link href="/docs/license">license terms</Link>.
        </p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ final CTA
export function FinalCta() {
  return (
    <section className="final-cta">
      <div className="container">
        <div className="final-card">
          <div className="final-lattice" aria-hidden="true" />
          <h2>Give your tool a workspace people won’t want to leave.</h2>
          <p>Install the core and the React adapter, and have a dockable layout running in a few minutes.</p>
          <div className="hero-ctas">
            <Link className="btn btn-primary" href="/docs/quick-start-react">
              Read the quick start <Arrow />
            </Link>
            <Link className="btn btn-ghost" href="/docs/concepts">Learn the concepts</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
