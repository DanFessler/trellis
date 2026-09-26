import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createDocument,
  layout as L,
  useView,
  ViewType,
  Workspace,
  type LayoutSpec,
  type WorkspaceHandle,
  type WorkspaceSnapshot,
} from "@danfessler/trellis-react";
import { useSiteTheme } from "../../theme";
import { useMedia } from "../../components/useMedia";
import { Reset } from "../../components/icons";
import { LogoMark } from "../../components/Logo";

/** The demo explains itself: each panel nests one level deeper than the last, and its line only
 * becomes readable once you've zoomed far enough in. */
const STEPS = [
  { tab: "Hello", line: "This is a panel.", note: "Drag its tab anywhere.", color: "#2f7d32" },
  { tab: "Nesting", line: "Panels hold panels.", note: "Split, tab or float them.", color: "#3a86c8" },
  { tab: "Depth", line: "As deep as you like.", note: "There's no limit.", color: "#7b61d1" },
  { tab: "Zoom", line: "Too small to read?", note: "That's the point. Zoom in.", color: "#c2456f" },
  { tab: "Live", line: "Everything stays live.", note: "clock", color: "#d35a2f" },
  { tab: "Back", line: "Esc zooms back out.", note: "One level at a time.", color: "#9c7424" },
  { tab: "Bottom", line: "Panels all the way down.", note: "You found the end.", color: "#1f5f5b" },
] as const;

const ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M8.5 2.5v11M8.5 8h5" opacity=".55"/></svg>`;

const stepPanel = (i: number) =>
  L.panel({ id: `p-${i}` }, L.view("step", { id: `step-${i}`, params: { i } }));
/** Each level splits off a panel and leaves a smaller copy of the rest, alternating direction. */
function spiral(i: number, axis: "x" | "y"): LayoutSpec {
  if (i === STEPS.length - 1) return stepPanel(i);
  return L.split(axis, [stepPanel(i), spiral(i + 1, axis === "x" ? "y" : "x")], { weights: [1.618, 1] });
}
const layoutFor = (compact: boolean) => createDocument(spiral(0, compact ? "y" : "x"));

/** The tour frames each level in turn, so the demo reads itself out, then shows everything again. */
const levelFrom = (i: number) => STEPS.slice(i).map((_, k) => `p-${i + k}`);
const TOUR = STEPS.slice(1).map((_, k) => levelFrom(k + 1));

function Step() {
  const view = useView<{ i: number }>();
  const step = STEPS[view.params.i];
  return (
    <div className="fx-card" style={{ background: step.color }}>
      <div className="fx-step">
        <p className="fx-line">{step.line}</p>
        <p className="fx-note">{step.note === "clock" ? <Alive /> : step.note}</p>
      </div>
    </div>
  );
}

/** Proof the content never remounts: this timer keeps counting through every drag and zoom. */
function Alive() {
  const [start] = useState(() => performance.now());
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.floor((performance.now() - start) / 1000);
  return (
    <>
      Running for {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")} through every move.
    </>
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
  const { theme } = useSiteTheme();
  const compact = useMedia("(max-width: 760px)");
  const [ws, setWs] = useState<WorkspaceHandle | null>(null);
  const [navigation, setNavigation] = useState<"focus" | "free">("focus");
  const snapshot = useHandleSnapshot(ws);
  const defaultLayout = useMemo(() => layoutFor(compact), [compact]);
  const windowRef = useRef<HTMLDivElement>(null);
  const [touring, setTouring] = useState(false);
  const tourTimers = useRef<number[]>([]);

  const stopTour = () => {
    tourTimers.current.forEach(clearTimeout);
    tourTimers.current = [];
    setTouring(false);
  };
  const startTour = () => {
    if (!ws) return;
    stopTour();
    setTouring(true);
    const steps = [...TOUR.map((ids) => () => ws.navigation.frame(ids)), () => ws.navigation.overview()];
    steps.forEach((step, i) => tourTimers.current.push(window.setTimeout(step, 300 + i * 1600)));
    tourTimers.current.push(window.setTimeout(() => setTouring(false), 300 + steps.length * 1600));
  };

  // Play the tour once, when the demo first comes into view. Any input from the visitor stops it.
  useEffect(() => {
    const el = windowRef.current;
    if (!ws || !el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let started = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (started || !entry.isIntersecting) return;
        started = true;
        tourTimers.current.push(window.setTimeout(startTour, 1400));
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    const interrupt = (e: Event) => {
      if ((e.target as HTMLElement).closest?.("[data-tour-button]")) return;
      started = true;
      stopTour();
    };
    for (const type of ["pointerdown", "wheel", "keydown"]) el.addEventListener(type, interrupt, true);
    return () => {
      observer.disconnect();
      for (const type of ["pointerdown", "wheel", "keydown"]) el.removeEventListener(type, interrupt, true);
      tourTimers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);

  // Every key appears in both themes: tokens removed from the object aren't cleared by the
  // workspace, so light mode sets "" (which removes the property) for dark-only overrides.
  const tokens: Record<string, string> = {
    "--trellis-font": "Inter, ui-sans-serif, system-ui, sans-serif",
    ...(theme === "dark"
      ? {
          "--trellis-accent": "#b5f068",
          "--trellis-accent-contrast": "#0d1606",
          "--trellis-bg": "#0b0c0b",
          "--trellis-panel": "#171917",
          "--trellis-tabbar": "#121412",
          "--trellis-tab-active": "#171917",
          "--trellis-menu": "#1d201d",
        }
      : {
          "--trellis-accent": "#4f8f14",
          "--trellis-accent-contrast": "#ffffff",
          "--trellis-bg": "#e4e5df",
          "--trellis-panel": "",
          "--trellis-tabbar": "#f3f3ef",
          "--trellis-tab-active": "",
          "--trellis-menu": "",
        }),
  };

  return (
    <div className="hero-window" ref={windowRef} data-compact={compact || undefined}>
      <div className="hero-bar">
        <div className="hero-bar-title">
          <LogoMark className="hero-bar-mark" />
          <span>demo.trellis</span>
          <span className="hero-bar-live">
            <span className="pulse" /> Live
          </span>
        </div>
        <div className="hero-bar-tray" aria-label="Hidden panels">
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
          <button
            type="button"
            className="hero-bar-btn"
            data-tour-button
            onClick={() => (touring ? stopTour() : startTour())}
            aria-pressed={touring}
          >
            {touring ? "Stop tour" : "Zoom tour"}
          </button>
          <button
            type="button"
            className="hero-bar-btn icon"
            onClick={() => {
              stopTour();
              ws?.reset();
            }}
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
          floating="overlay"
          navigation={navigation}
          label="Trellis demo workspace"
          defaultLayout={defaultLayout}
        >
          <ViewType
            id="step"
            title={(v) => STEPS[Number(v.params.i)].tab}
            icon={ICON}
            closable={false}
            minSize={{ width: 220, height: 130 }}
            render={() => <Step />}
          />
        </Workspace>
      </div>
    </div>
  );
}
