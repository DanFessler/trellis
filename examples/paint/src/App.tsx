import {
  Panel,
  Split,
  Stage,
  View,
  ViewType,
  Workspace,
  WorkspaceProvider,
  useOptionalWorkspace,
  useWorkspace,
  useWorkspaceState,
  type MenuEntry,
  type ViewHandle,
  type WorkspaceHandle,
} from "@danfessler/trellis-react";
import { useEffect, useRef } from "react";
import {
  activeDoc,
  alt,
  duplicateDocument,
  exportDocument,
  mod,
  newDocument,
  openSample,
  resetLayout,
  shift,
} from "./actions";
import type { DocParams } from "./paint/PaintDoc";
import { BrushPanel } from "./panels/BrushPanel";
import { ColorPanel } from "./panels/ColorPanel";
import { HistoryPanel } from "./panels/HistoryPanel";
import { LayersPanel } from "./panels/LayersPanel";
import { NavigatorPanel } from "./panels/NavigatorPanel";
import { ToolsPanel } from "./panels/ToolsPanel";
import { app, documents, useActiveDoc, useApp, type ThemeName, type Tool } from "./store";
import { DialogHost } from "./ui/Dialog";
import {
  BrushIcon,
  CompassIcon,
  DownloadIcon,
  FilePlusIcon,
  HistoryIcon,
  ImageIcon,
  LayersIcon,
  Logo,
  PaletteIcon,
  RedoIcon,
  SlidersIcon,
  ToolsIcon,
  UndoIcon,
} from "./ui/icons";
import { Menubar, type MenuDef } from "./ui/Menubar";
import { DocumentView, ZoomAccessory } from "./views/DocumentView";

const TOOL_PANELS = [
  { type: "tools", label: "Tools", Icon: ToolsIcon },
  { type: "brush", label: "Brush", Icon: BrushIcon },
  { type: "color", label: "Color", Icon: PaletteIcon },
  { type: "layers", label: "Layers", Icon: LayersIcon },
  { type: "history", label: "History", Icon: HistoryIcon },
  { type: "navigator", label: "Navigator", Icon: CompassIcon },
] as const;

const THEMES: { id: ThemeName; label: string; swatch: string }[] = [
  { id: "light", label: "Light", swatch: "#e9eaee" },
  { id: "medium", label: "Medium", swatch: "#45454a" },
  { id: "dark", label: "Dark", swatch: "#1a1b1f" },
  { id: "darker", label: "Darker", swatch: "#070708" },
];

const ACCENT: Record<ThemeName, string> = {
  light: "#6a4ff0",
  medium: "#8f7cff",
  dark: "#8b7bff",
  darker: "#8b7bff",
};

function documentMenu(ws: () => WorkspaceHandle | null) {
  return (view: ViewHandle): MenuEntry[] => {
    const doc = documents.get(view.id);
    return [
      { label: "Export PNG…", shortcut: `${shift}${mod}E`, run: () => exportDocument(view.id) },
      { label: "Duplicate", run: () => ws() && duplicateDocument(ws()!, view.id) },
      "separator",
      { label: "Fit on Screen", shortcut: `${mod}0`, run: () => doc?.fit() },
      { label: "Actual Pixels", shortcut: `${mod}1`, run: () => doc?.zoomTo(1) },
    ];
  };
}

export function App() {
  // The provider lets the app bar (outside <Workspace>) use the workspace hooks.
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function Shell() {
  const ws = useOptionalWorkspace();
  const wsRef = useRef<WorkspaceHandle | null>(null);
  wsRef.current = ws;
  const theme = useApp((s) => s.theme);
  useShortcuts(ws);
  useActiveDocFallback();
  useEffect(() => {
    if (!ws) return;
    if (import.meta.env.DEV) (window as any).__paint.ws = ws;
    // Tool panels act on the most recently focused document.
    return ws.on("focus", (id) => {
      if (id && ws.view(id)?.type === "document") app.set({ activeDoc: id });
    });
  }, [ws]);

  return (
    <div className="app" data-theme={theme}>
      <AppBar />
      <main className="app-main">
        <Workspace
          theme={theme}
          tokens={{ "--trellis-accent": ACCENT[theme], "--trellis-radius": "10px" }}
          floating="overlay"
          navigation="focus"
          storageKey="trellis-paint"
          version={1}
          label="Paint workspace"
          onClose={(v) => {
            if (v.type === "document") documents.dispose(v.id);
          }}
        >
          <ViewType<DocParams>
            id="document"
            title={(v) => v.params.name ?? "Untitled"}
            icon={<ImageIcon size={14} />}
            placement="stage"
            allow={{ side: false }}
            accessory={(v) => <ZoomAccessory id={v.id} />}
            menu={documentMenu(() => wsRef.current)}
          >
            <DocumentView />
          </ViewType>
          <ViewType
            id="tools"
            title="Tools"
            icon={<ToolsIcon size={14} />}
            singleton
            allow={{ stage: false }}
            placement="side"
          >
            <ToolsPanel />
          </ViewType>
          <ViewType
            id="brush"
            title="Brush"
            icon={<SlidersIcon size={14} />}
            singleton
            allow={{ stage: false }}
            placement="side"
          >
            <BrushPanel />
          </ViewType>
          <ViewType
            id="color"
            title="Color"
            icon={<PaletteIcon size={14} />}
            singleton
            allow={{ stage: false }}
            placement="side"
          >
            <ColorPanel />
          </ViewType>
          <ViewType
            id="layers"
            title="Layers"
            icon={<LayersIcon size={14} />}
            singleton
            allow={{ stage: false }}
            placement="side"
          >
            <LayersPanel />
          </ViewType>
          <ViewType
            id="history"
            title="History"
            icon={<HistoryIcon size={14} />}
            singleton
            allow={{ stage: false }}
            placement="side"
          >
            <HistoryPanel />
          </ViewType>
          <ViewType
            id="navigator"
            title="Navigator"
            icon={<CompassIcon size={14} />}
            singleton
            allow={{ stage: false }}
            placement="float"
          >
            <NavigatorPanel />
          </ViewType>

          <Split weights={[0.17, 0.62, 0.21]}>
            <Split axis="y" weights={[0.18, 0.82]}>
              <View type="tools" id="tools" />
              <View type="brush" id="brush" />
            </Split>
            <Stage empty={<StageEmpty />}>
              <Panel selected={0}>
                <View
                  type="document"
                  id="doc-dusk"
                  params={{ name: "Dusk Study", width: 1600, height: 1000, sample: "dusk" }}
                />
                <View
                  type="document"
                  id="doc-untitled"
                  params={{ name: "Untitled-1", width: 1600, height: 1000, background: "#ffffff" }}
                />
              </Panel>
            </Stage>
            <Split axis="y" weights={[0.37, 0.4, 0.23]}>
              <View type="color" id="color" />
              <Panel selected={0}>
                <View type="layers" id="layers" />
                <View type="history" id="history" />
              </Panel>
              <View type="navigator" id="navigator" />
            </Split>
          </Split>
        </Workspace>
      </main>
      <DialogHost />
    </div>
  );
}

function StageEmpty() {
  const ws = useWorkspace();
  return (
    <div className="stage-empty">
      <div className="stage-empty-art">
        <ImageIcon size={28} />
      </div>
      <h2>No documents open</h2>
      <p>Create a canvas, or drag a document tab back here.</p>
      <div className="stage-empty-actions">
        <button type="button" className="btn btn-primary" onClick={() => newDocument(ws)}>
          <FilePlusIcon size={15} /> New Document
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => openSample(ws)}>
          Open Sample
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ app bar
function AppBar() {
  const ws = useOptionalWorkspace();
  const snap = useWorkspaceState();
  const doc = useActiveDoc();
  const theme = useApp((s) => s.theme);
  const windowButton = useRef<HTMLButtonElement>(null);

  const panelState = (type: string) => {
    const hidden = snap.hidden.find((h) => h.views.some((v) => v.type === type));
    const view = snap.views.find((v) => v.type === type);
    return { hidden, view, shown: !!view && !hidden };
  };
  // Hiding keeps a panel's state and remembers where it was; a tab hides on its own.
  const togglePanel = (type: string) => {
    if (!ws) return;
    const { hidden, view } = panelState(type);
    const button = windowButton.current ?? undefined;
    if (hidden) ws.restore(hidden.panelId, { from: button });
    else if (view) ws.hide(view.id, { toward: button });
    else ws.open(type);
  };

  const docViewId = doc?.id ?? null;
  const menus = [
    {
      label: "File",
      items: (): MenuDef[] => [
        { label: "New Document…", shortcut: `${alt}N`, run: () => ws && newDocument(ws) },
        { label: "Open Sample", run: () => ws && openSample(ws) },
        "separator",
        {
          label: "Duplicate",
          disabled: !docViewId,
          run: () => ws && docViewId && duplicateDocument(ws, docViewId),
        },
        {
          label: "Export PNG…",
          shortcut: `${shift}${mod}E`,
          disabled: !docViewId,
          run: () => exportDocument(docViewId),
        },
        "separator",
        {
          label: "Close Document",
          disabled: !docViewId,
          run: () => ws && docViewId && void ws.close(docViewId),
        },
      ],
    },
    {
      label: "Edit",
      items: (): MenuDef[] => [
        {
          label: doc?.history[doc.index - 1] ? `Undo ${doc.history[doc.index - 1].label}` : "Undo",
          shortcut: `${mod}Z`,
          disabled: !doc || doc.index === 0,
          run: () => doc?.undo(),
        },
        {
          label: doc?.history[doc.index] ? `Redo ${doc.history[doc.index].label}` : "Redo",
          shortcut: `${shift}${mod}Z`,
          disabled: !doc || doc.index >= doc.history.length,
          run: () => doc?.redo(),
        },
        "separator",
        {
          label: "Fill with Color",
          shortcut: `${alt}⌫`,
          disabled: !doc,
          run: () => doc?.fillLayer(app.colorRgb()),
        },
        { label: "Clear Layer", shortcut: "⌫", disabled: !doc, run: () => doc?.clearLayer() },
      ],
    },
    {
      label: "Layer",
      items: (): MenuDef[] => [
        { label: "New Layer", shortcut: `${shift}${mod}N`, disabled: !doc, run: () => doc?.addLayer() },
        { label: "Duplicate Layer", disabled: !doc, run: () => doc?.duplicateLayer() },
        { label: "Delete Layer", disabled: !doc || doc.layers.length <= 1, run: () => doc?.deleteLayer() },
        "separator",
        {
          label: "Merge Down",
          shortcut: `${mod}E`,
          disabled: !doc || doc.layers.indexOf(doc.activeLayer) <= 0,
          run: () => doc?.mergeDown(),
        },
        { label: "Flatten Image", disabled: !doc || doc.layers.length <= 1, run: () => doc?.flatten() },
      ],
    },
    {
      label: "View",
      items: (): MenuDef[] => [
        { label: "Zoom In", shortcut: `${mod}+`, disabled: !doc, run: () => doc?.zoomStep(1) },
        { label: "Zoom Out", shortcut: `${mod}−`, disabled: !doc, run: () => doc?.zoomStep(-1) },
        { label: "Fit on Screen", shortcut: `${mod}0`, disabled: !doc, run: () => doc?.fit() },
        { label: "Actual Pixels", shortcut: `${mod}1`, disabled: !doc, run: () => doc?.zoomTo(1) },
        "separator",
        {
          label: snap.framed ? "Exit Focus" : "Focus Document",
          shortcut: `${shift}${mod}↩`,
          disabled: !docViewId && !snap.framed,
          run: () =>
            snap.framed ? ws?.navigation.back() : ws && docViewId && ws.navigation.toggle(docViewId),
        },
      ],
    },
    {
      label: "Window",
      buttonRef: windowButton,
      items: (): MenuDef[] => [
        ...TOOL_PANELS.map(({ type, label }) => ({
          label,
          checked: panelState(type).shown,
          run: () => togglePanel(type),
        })),
        "separator",
        { section: "Theme" },
        ...THEMES.map((t) => ({
          label: t.label,
          checked: theme === t.id,
          radio: true,
          run: () => app.set({ theme: t.id }),
        })),
        "separator",
        { label: "Reset Layout…", run: () => ws && void resetLayout(ws) },
      ],
    },
  ];

  return (
    <header className="appbar">
      <div className="appbar-brand">
        <Logo size={22} />
        <span className="appbar-name">Paint</span>
      </div>
      <Menubar menus={menus} />
      <div className="appbar-doc">
        {doc ? (
          <>
            <span className="appbar-doc-name">{doc.name}</span>
            {doc.dirty && <span className="dirty-dot" title="Unsaved changes" />}
            <span className="appbar-doc-meta">
              {doc.width} × {doc.height} · {Math.round(doc.view.zoom * 100)}% · {doc.activeLayer.name}
            </span>
          </>
        ) : (
          <span className="appbar-doc-meta">No document</span>
        )}
      </div>
      <div className="appbar-actions">
        <button
          type="button"
          className="icon-btn"
          title={`Undo (${mod}Z)`}
          disabled={!doc || doc.index === 0}
          onClick={() => doc?.undo()}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={`Redo (${shift}${mod}Z)`}
          disabled={!doc || doc.index >= doc.history.length}
          onClick={() => doc?.redo()}
        >
          <RedoIcon />
        </button>
        <span className="appbar-sep" />
        <div className="theme-switch" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              title={`${t.label} theme`}
              className="theme-dot"
              style={{ background: t.swatch }}
              onClick={() => app.set({ theme: t.id })}
            />
          ))}
        </div>
        <span className="appbar-sep" />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!doc}
          onClick={() => exportDocument(docViewId)}
        >
          <DownloadIcon size={14} /> Export
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ behaviour
/** Keep the panels pointed at a document: when the active one closes, follow the selected tab. */
function useActiveDocFallback() {
  const snap = useWorkspaceState();
  const active = useApp((s) => s.activeDoc);
  useEffect(() => {
    const docs = snap.views.filter((v) => v.type === "document" && v.placement !== "hidden");
    // Only when the active document is gone (closed).
    if (active && documents.get(active)) return;
    const next = docs.find((v) => v.id === snap.focusedView) ?? docs.find((v) => v.selected) ?? docs[0];
    if (next && documents.get(next.id)) app.set({ activeDoc: next.id });
  }, [snap, active]);
}

const TOOL_KEYS: Record<string, Tool> = { b: "brush", e: "eraser", g: "fill", i: "eyedropper", h: "hand" };

function useShortcuts(ws: WorkspaceHandle | null) {
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return (
        !!t &&
        (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) &&
        (t as HTMLInputElement).type !== "checkbox"
      );
    };
    const modal = () => !!document.querySelector(".dialog-scrim");
    const onDown = (e: KeyboardEvent) => {
      if (typing(e) || modal()) return;
      const doc = activeDoc();
      const m = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (m) {
        if (k === "z") return run(() => (e.shiftKey ? doc?.redo() : doc?.undo()));
        if (k === "y") return run(() => doc?.redo());
        if (k === "0") return run(() => doc?.fit());
        if (k === "1") return run(() => doc?.zoomTo(1));
        if (k === "=" || k === "+") return run(() => doc?.zoomStep(1));
        if (k === "-") return run(() => doc?.zoomStep(-1));
        if (k === "e" && e.shiftKey) return run(() => exportDocument(doc?.id));
        if (k === "e") return run(() => doc?.mergeDown());
        if (k === "n" && e.shiftKey) return run(() => doc?.addLayer());
        return;
      }
      if (e.altKey && e.code === "KeyN") return ws && run(() => void newDocument(ws));
      if (e.altKey && (k === "backspace" || k === "delete")) return run(() => doc?.fillLayer(app.colorRgb()));
      if (e.altKey) return;
      if (k === " " && !e.repeat) {
        if ((e.target as HTMLElement)?.closest?.("button, [role=slider]")) e.preventDefault();
        return run(() => app.set({ spaceHeld: true }));
      }
      if (TOOL_KEYS[k]) return run(() => app.set({ tool: TOOL_KEYS[k] }));
      if (k === "x") return run(() => app.swapColors());
      if (k === "[" || k === "]") {
        const s = app.get().brush.size;
        const step = Math.max(1, Math.round(s * 0.15));
        return run(() => app.setBrush({ size: Math.max(1, Math.min(400, s + (k === "]" ? step : -step))) }));
      }
      if (k === "backspace" || k === "delete") return run(() => doc?.clearLayer());
      if (/^[0-9]$/.test(k)) return run(() => app.setBrush({ opacity: k === "0" ? 1 : Number(k) / 10 }));
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") app.set({ spaceHeld: false });
    };
    const onBlur = () => app.get().spaceHeld && app.set({ spaceHeld: false });
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [ws]);
}
