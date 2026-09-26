import { useState } from "react";
import { useMedia } from "../components/useMedia";
import { Panel, Split, Stage, View, ViewType, Workspace, type Theme } from "@danfessler/trellis-react";

const THEMES: Exclude<Theme, "system">[] = ["light", "medium", "dark", "darker"];
const ACCENTS = [
  { name: "Default", value: "" },
  { name: "Sprout", value: "#8fd14f" },
  { name: "Ember", value: "#f0703c" },
  { name: "Orchid", value: "#b36cf0" },
  { name: "Tide", value: "#2fb7c4" },
  { name: "Rose", value: "#ec4f7f" },
];

const FILES = [
  { name: "src", dir: true, depth: 0 },
  { name: "panels", dir: true, depth: 1 },
  { name: "Canvas.tsx", depth: 2 },
  { name: "Layers.tsx", depth: 2 },
  { name: "theme.css", depth: 1, active: true },
  { name: "main.tsx", depth: 1 },
  { name: "package.json", depth: 0 },
];

function Explorer() {
  return (
    <ul className="ts-tree">
      {FILES.map((f) => (
        <li key={f.name} data-active={f.active || undefined} style={{ paddingLeft: 10 + f.depth * 14 }}>
          <span className="ts-ico">{f.dir ? "▾" : "·"}</span>
          {f.name}
        </li>
      ))}
    </ul>
  );
}

function Terminal() {
  return (
    <pre className="ts-term">
      <span className="ts-dim">$</span> npm run dev{"\n"}
      <span className="ts-ok">✓</span> ready in 212 ms{"\n"}
      <span className="ts-dim">➜</span> Local: http://localhost:5173/
    </pre>
  );
}

function CssView({ lines }: { lines: [string, string][] }) {
  return (
    <pre className="ts-css">
      <span className="ts-sel">.trellis</span> {"{"}
      {"\n"}
      {lines.length === 0 && <span className="ts-dim">{"  /* built-in theme defaults */\n"}</span>}
      {lines.map(([k, v]) => (
        <span key={k}>
          {"  "}
          <span className="ts-prop">{k}</span>: <span className="ts-val">{v}</span>;{"\n"}
        </span>
      ))}
      {"}"}
    </pre>
  );
}

export function ThemeShowcase() {
  const [theme, setTheme] = useState<Exclude<Theme, "system">>("medium");
  const [accent, setAccent] = useState("");
  const [radius, setRadius] = useState(10);
  const [gap, setGap] = useState(6);
  const [bar, setBar] = useState(34);
  const narrow = useMedia("(max-width: 640px)");

  const tokens: Record<string, string> = {
    "--trellis-radius": `${radius}px`,
    "--trellis-tab-radius": `${Math.max(0, Math.round(radius * 0.7))}px`,
    "--trellis-gap": `${gap}px`,
    "--trellis-tabbar-height": `${bar}px`,
    // An empty value clears the property, so the theme's own accent shows again.
    "--trellis-accent": accent,
  };
  const changed: [string, string][] = [];
  if (accent) changed.push(["--trellis-accent", accent]);
  if (radius !== 10)
    changed.push(
      ["--trellis-radius", `${radius}px`],
      ["--trellis-tab-radius", tokens["--trellis-tab-radius"]],
    );
  if (gap !== 6) changed.push(["--trellis-gap", `${gap}px`]);
  if (bar !== 34) changed.push(["--trellis-tabbar-height", `${bar}px`]);

  return (
    <section className="section" id="theming">
      <div className="container">
        <header className="section-head">
          <p className="eyebrow">Theming</p>
          <h2>Make it look like your product.</h2>
          <p className="section-lede">
            Pick a built-in theme, then override any token. Everything below is a live Trellis workspace — try
            dragging a tab while you tweak it.
          </p>
        </header>
        <div className="theming">
          <div className="theme-controls">
            <div className="control">
              <span className="control-label">Theme</span>
              <div className="seg seg-block" role="radiogroup" aria-label="Theme">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={theme === t}
                    onClick={() => setTheme(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="control">
              <span className="control-label">Accent</span>
              <div className="accents">
                {ACCENTS.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    aria-label={a.name}
                    title={a.name}
                    aria-pressed={accent === a.value}
                    className={a.value ? "" : "accent-default"}
                    style={a.value ? { background: a.value } : undefined}
                    onClick={() => setAccent(a.value)}
                  />
                ))}
              </div>
            </div>
            <label className="control">
              <span className="control-label">
                Radius <output>{radius}px</output>
              </span>
              <input
                type="range"
                min={0}
                max={18}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
            </label>
            <label className="control">
              <span className="control-label">
                Gap <output>{gap}px</output>
              </span>
              <input
                type="range"
                min={0}
                max={16}
                value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
              />
            </label>
            <label className="control">
              <span className="control-label">
                Tab bar <output>{bar}px</output>
              </span>
              <input
                type="range"
                min={28}
                max={44}
                value={bar}
                onChange={(e) => setBar(Number(e.target.value))}
              />
            </label>
            <div className="control control-code">
              <span className="control-label">Your CSS</span>
              <CssView lines={changed} />
            </div>
          </div>
          <div className="theme-stage" data-theme-name={theme}>
            <Workspace
              key={narrow ? "narrow" : "wide"}
              theme={theme}
              tokens={tokens}
              label="Theming demo workspace"
              navigation="focus"
            >
              <ViewType id="explorer" title="Explorer" singleton allow={{ stage: false }}>
                <Explorer />
              </ViewType>
              <ViewType id="file" title={(v) => String(v.params.name)} placement="stage">
                <CssView lines={changed} />
              </ViewType>
              <ViewType id="terminal" title="Terminal" allow={{ stage: false }}>
                <Terminal />
              </ViewType>
              <ViewType id="outline" title="Outline" allow={{ stage: false }}>
                <ul className="ts-tree">
                  <li style={{ paddingLeft: 10 }}>.trellis</li>
                  <li style={{ paddingLeft: 24 }}>--trellis-accent</li>
                  <li style={{ paddingLeft: 24 }}>--trellis-radius</li>
                </ul>
              </ViewType>
              {narrow ? (
                <Split axis="y" weights={[2, 1]}>
                  <Stage>
                    <Panel>
                      <View type="file" params={{ name: "theme.css" }} />
                      <View type="file" params={{ name: "tokens.css" }} />
                    </Panel>
                  </Stage>
                  <Panel>
                    <View type="explorer" />
                    <View type="terminal" />
                    <View type="outline" />
                  </Panel>
                </Split>
              ) : (
                <Split weights={[1, 3.2]}>
                  <Split axis="y" weights={[1.4, 1]}>
                    <View type="explorer" />
                    <View type="outline" />
                  </Split>
                  <Split axis="y" weights={[2.2, 1]}>
                    <Stage>
                      <Panel>
                        <View type="file" params={{ name: "theme.css" }} />
                        <View type="file" params={{ name: "tokens.css" }} />
                      </Panel>
                    </Stage>
                    <View type="terminal" />
                  </Split>
                </Split>
              )}
            </Workspace>
          </div>
        </div>
      </div>
    </section>
  );
}
