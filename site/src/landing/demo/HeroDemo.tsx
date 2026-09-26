import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  createDocument,
  layout as L,
  ViewType,
  Workspace,
  type WorkspaceHandle,
  type WorkspaceSnapshot,
} from "@danfessler/trellis-react";
import { useSiteTheme } from "../../theme";
import { useMedia } from "../../components/useMedia";
import { Reset } from "../../components/icons";
import { LogoMark } from "../../components/Logo";
import { Brush, CodeView, ColorPicker, Inspector, Layers, PREVIEW_URL, Sketch } from "./panels";
import { aliveSince, DemoProvider, useDemo } from "./store";

const ICONS = {
  sketch: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13c2-1 2.5-4 5-6.5s4.5-2.8 5-4"/><path d="M2.5 13.5h3"/></svg>`,
  code: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5l3.5 3.5-3.5 3.5"/></svg>`,
  layers: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M8 2 14 5.2 8 8.4 2 5.2Z"/><path d="m2 8.2 6 3.2 6-3.2M2 11l6 3.2 6-3.2" opacity=".6"/></svg>`,
  color: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="5.8"/><circle cx="8" cy="5.2" r="1.2" fill="currentColor"/><circle cx="5.4" cy="9.2" r="1.2" fill="currentColor"/><circle cx="10.6" cy="9.2" r="1.2" fill="currentColor"/></svg>`,
  brush: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M13.5 2.5 7 9"/><path d="M6.5 9.5c-2 0-3 1.3-3 2.6 0 .8-.6 1.4-1.4 1.4 1 .8 2.3 1 3.4 1 2 0 3-1.6 3-3"/></svg>`,
  inspect: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M5 6h6M5 8.5h4M5 11h5"/></svg>`,
  preview: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.8" y="3" width="12.4" height="10" rx="2"/><path d="M1.8 6h12.4"/></svg>`,
};

function desktopLayout() {
  return createDocument(
    L.row(
      [
        L.column(
          [
            L.panel({ id: "p-layers" }, L.view("layers", { id: "layers" })),
            L.panel({ id: "p-color" }, L.view("color", { id: "color" })),
          ],
          [1.1, 1],
        ),
        L.stage(
          L.panel(
            { id: "p-docs" },
            L.view("sketch", { id: "sketch-1", params: { name: "Climbing vine" } }),
            L.view("code", { id: "code" }),
          ),
        ),
        L.panel(
          { id: "p-inspect" },
          L.view("inspector", { id: "inspector" }),
          L.view("preview", { id: "preview" }),
        ),
      ],
      [1, 3.3, 1.3],
    ),
    {
      floating: [
        {
          panel: L.view("brush", { id: "brush" }),
          rect: { x: 0.62, y: 0.7, w: 0.35, h: 0.26 },
          layer: "stage",
        },
      ],
    },
  );
}
function compactLayout() {
  return createDocument(
    L.column(
      [
        L.stage(
          L.panel(
            { id: "p-docs" },
            L.view("sketch", { id: "sketch-1", params: { name: "Climbing vine" } }),
            L.view("code", { id: "code" }),
          ),
        ),
        L.panel(
          { id: "p-tools" },
          L.view("layers", { id: "layers" }),
          L.view("color", { id: "color" }),
          L.view("inspector", { id: "inspector" }),
        ),
      ],
      [1.6, 1],
    ),
  );
}

const empty = () => () => {};
function useHandleSnapshot(ws: WorkspaceHandle | null): WorkspaceSnapshot | null {
  return useSyncExternalStore(
    ws ? ws.subscribe : empty,
    () => (ws ? ws.getSnapshot() : null),
    () => null,
  );
}

export function HeroDemo() {
  return (
    <DemoProvider>
      <HeroWorkspace />
    </DemoProvider>
  );
}

function HeroWorkspace() {
  const demo = useDemo();
  const { theme } = useSiteTheme();
  const compact = useMedia("(max-width: 760px)");
  const [ws, setWs] = useState<WorkspaceHandle | null>(null);
  const [navigation, setNavigation] = useState<"focus" | "free">("focus");
  const snapshot = useHandleSnapshot(ws);
  const trayRef = useRef<HTMLDivElement>(null);
  const counter = useRef(1);
  const defaultLayout = useMemo(() => (compact ? compactLayout() : desktopLayout()), [compact]);

  // Iframe views have no React content; start their clocks when they open.
  useEffect(() => {
    if (!ws) return;
    const start = (id: string, type: string) => {
      if (type === "preview" && !aliveSince.has(id)) aliveSince.set(id, performance.now());
    };
    for (const v of ws.views()) start(v.id, v.type);
    const offOpen = ws.on("open", (v) => start(v.id, v.type));
    const offClose = ws.on("close", (v) => aliveSince.delete(v.id));
    return () => {
      offOpen();
      offClose();
    };
  }, [ws]);

  const accent = theme === "dark" ? "#b5f068" : "#4f8f14";
  const tokens = {
    "--trellis-accent": accent,
    "--trellis-accent-contrast": theme === "dark" ? "#0d1606" : "#ffffff",
    "--trellis-font": `Inter, ui-sans-serif, system-ui, sans-serif`,
    // Every key appears in both themes: tokens removed from the object are not cleared by the
    // workspace, so light mode sets "" (which removes the property) for dark-only overrides.
    ...(theme === "dark"
      ? {
          "--trellis-bg": "#0b0c0b",
          "--trellis-panel": "#171917",
          "--trellis-tabbar": "#121412",
          "--trellis-tab-active": "#171917",
          "--trellis-stage": "#0f110f",
          "--trellis-menu": "#1d201d",
        }
      : {
          "--trellis-bg": "#e4e5df",
          "--trellis-panel": "",
          "--trellis-tabbar": "#f3f3ef",
          "--trellis-tab-active": "",
          "--trellis-stage": "#eeeee9",
          "--trellis-menu": "",
        }),
  };

  const artMenu = [
    { label: "Undo stroke", run: () => demo.undo() },
    { label: "Reset artwork", run: () => demo.clear() },
  ];

  const newSketch = () => {
    counter.current += 1;
    ws?.open("sketch", { params: { name: `Sketch ${counter.current}` } });
  };

  return (
    <>
      <div className="hero-window" data-compact={compact || undefined}>
        <div className="hero-bar">
          <div className="hero-bar-title">
            <LogoMark className="hero-bar-mark" />
            <span>vine.trellis</span>
            <span className="hero-bar-live">
              <span className="pulse" /> Live
            </span>
          </div>
          <div className="hero-bar-tray" ref={trayRef} aria-label="Hidden panels">
            {snapshot?.hidden.map((h) => (
              <button
                key={h.panelId}
                type="button"
                className="tray-chip"
                onClick={(e) => ws?.restore(h.panelId, { from: e.currentTarget })}
                title="Restore panel"
              >
                {h.views.map((v) => v.title).join(" · ")}
              </button>
            ))}
          </div>
          <div className="hero-bar-actions">
            <div className="seg" role="radiogroup" aria-label="Navigation mode">
              {(["focus", "free"] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={navigation === n}
                  onClick={() => setNavigation(n)}
                >
                  {n === "focus" ? "Focus" : "Free zoom"}
                </button>
              ))}
            </div>
            <button type="button" className="hero-bar-btn" onClick={newSketch}>
              + Sketch
            </button>
            <button
              type="button"
              className="hero-bar-btn icon"
              onClick={() => ws?.reset()}
              aria-label="Reset layout"
              title="Reset layout"
            >
              <Reset />
            </button>
          </div>
        </div>
        <div className="hero-ws">
          <Workspace
            key={compact ? "compact" : "wide"}
            ref={setWs}
            theme={theme}
            tokens={tokens}
            floating="stage"
            navigation={navigation}
            label="Trellis demo workspace"
            defaultLayout={defaultLayout}
          >
            <ViewType
              id="sketch"
              title={(v) => String(v.params.name ?? "Sketch")}
              icon={ICONS.sketch}
              placement="stage"
              allow={{ side: false }}
              render={() => <Sketch />}
            />
            <ViewType id="code" title="Sprout.tsx" icon={ICONS.code} placement="stage" singleton>
              <CodeView />
            </ViewType>
            <ViewType
              id="layers"
              title="Layers"
              icon={ICONS.layers}
              singleton
              allow={{ stage: false }}
              menu={artMenu}
            >
              <Layers />
            </ViewType>
            <ViewType id="color" title="Color" icon={ICONS.color} singleton allow={{ stage: false }}>
              <ColorPicker />
            </ViewType>
            <ViewType
              id="brush"
              title="Brush"
              icon={ICONS.brush}
              singleton
              allow={{ stage: false }}
              placement="float"
            >
              <Brush />
            </ViewType>
            <ViewType
              id="inspector"
              title="Inspector"
              icon={ICONS.inspect}
              singleton
              allow={{ stage: false }}
            >
              <Inspector />
            </ViewType>
            <ViewType id="preview" title="Preview" icon={ICONS.preview} singleton iframe={PREVIEW_URL} />
          </Workspace>
        </div>
      </div>
      {ws && createPortal(<div className="d-backdrop" />, ws.slots.backdrop)}
      {ws &&
        createPortal(
          <div className="d-stage-empty">
            <p>The stage is empty.</p>
            <button type="button" onClick={newSketch}>
              New sketch
            </button>
          </div>,
          ws.slots.stageEmpty,
        )}
    </>
  );
}
