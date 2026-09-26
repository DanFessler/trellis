import { useEffect, useRef } from "react";
import {
  Panel,
  Split,
  Stage,
  View,
  ViewType,
  Workspace,
  WorkspaceProvider,
  useOptionalView,
  useOptionalWorkspace,
  useWorkspaceState,
} from "@danfessler/trellis-react";
import { useDiagnostics, Problems } from "./views/Problems";
import { Editor, EditorAccessory, SeverityIcon, type EditorParams } from "./views/Editor";
import { Explorer } from "./views/Explorer";
import { Search } from "./views/Search";
import { Terminal } from "./views/Terminal";
import { Outline } from "./views/Outline";
import { Palette } from "./Palette";
import { PREVIEW_URL, PreviewAccessory } from "./preview";
import { countPanels, isShown, saveActive, togglePanel } from "./commands";
import { ide, isMac, mod, shift, useIde } from "./ide";
import { basename, languageOf, LANGUAGE_NAMES, useVfs, vfs } from "./vfs";
import { INITIAL_EDITORS, PROJECT_NAME } from "./seed";
import {
  BranchIcon,
  CommandIcon,
  FileIcon,
  FilesIcon,
  LayoutIcon,
  MaximizeIcon,
  OutlineIcon,
  PreviewIcon,
  ProblemsIcon,
  SearchIcon,
  TerminalIcon,
  TrellisMark,
} from "./icons";

const LAYOUT_VERSION = 4;
const STORAGE_KEY = "trellis-ide:layout";
const BELOW_STAGE = { beside: "stage", edge: "bottom", share: 0.3 } as const;
const RIGHT_OF_STAGE = { beside: "stage", edge: "right", share: 0.26 } as const;
const LEFT_OF_STAGE = { beside: "stage", edge: "left", share: 0.2 } as const;

/** Editor tab icon: rendered inside the view's context, so it can read the file path. */
function EditorTabIcon() {
  const view = useOptionalView();
  return <FileIcon path={String(view?.params.path ?? "")} />;
}

function StageEmpty() {
  const Row = ({ label, keys }: { label: string; keys: string }) => (
    <div className="empty-row">
      <span>{label}</span>
      <kbd>{keys}</kbd>
    </div>
  );
  return (
    <div className="stage-empty">
      <TrellisMark size={44} />
      <div className="empty-rows">
        <Row label="Show All Commands" keys={`${mod}${shift}P`} />
        <Row label="Go to File" keys={`${mod}P`} />
        <Row label="Toggle Terminal" keys={`${mod}J`} />
        <Row label="Maximize Panel" keys={`${mod}${shift}↵`} />
      </div>
    </div>
  );
}

function ConfirmDialog() {
  const request = useIde((s) => s.confirm);
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (request) requestAnimationFrame(() => primary.current?.focus());
  }, [request]);
  if (!request) return null;
  return (
    <div
      className="dialog-scrim"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          request.resolve("cancel");
        }
      }}
    >
      <div className="dialog" role="alertdialog" aria-label={request.title}>
        <div className="dialog-icon">
          <SeverityIcon severity="warning" size={22} />
        </div>
        <div className="dialog-body">
          <h2>{request.title}</h2>
          <p>{request.message}</p>
        </div>
        <div className="dialog-buttons">
          {request.buttons.map((b) => (
            <button
              key={b.value}
              ref={b.primary ? primary : undefined}
              className={"btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : "")}
              onClick={() => request.resolve(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toast() {
  const toast = useIde((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" key={toast.nonce}>
      {toast.text}
    </div>
  );
}

// The title bar and status bar live outside <Workspace>; <WorkspaceProvider> gives them its hooks.
function TitleBar() {
  const ws = useOptionalWorkspace();
  const snap = useWorkspaceState();
  useVfs();
  const left = useRef<HTMLButtonElement>(null);
  const bottom = useRef<HTMLButtonElement>(null);
  const right = useRef<HTMLButtonElement>(null);
  const shown = (type: string) => !!ws && snap.views.length > 0 && isShown(ws, type);
  const dirty = vfs.dirtyPaths().length;
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <div className="brand">
          <TrellisMark />
          <span className="brand-name">{PROJECT_NAME}</span>
          <span className="brand-branch">
            <BranchIcon size={13} /> main
          </span>
        </div>
      </div>
      <button className="command-center" onClick={() => ide.openPalette("files")} title="Search files, or type > for commands">
        <SearchIcon size={14} />
        <span>
          Search {PROJECT_NAME}
          {dirty ? <span className="muted"> · {dirty} unsaved</span> : null}
        </span>
        <kbd>{mod}P</kbd>
      </button>
      <div className="titlebar-right">
        <button
          ref={left}
          className={"layout-btn" + (shown("explorer") ? " on" : "")}
          title={`Toggle Explorer (${mod}B)`}
          onClick={() => ws && togglePanel(ws, "explorer", left.current)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" />
            <path d="M6 2.25v11.5" />
            <rect className="fill" x="1.75" y="2.25" width="4.25" height="11.5" rx="2" stroke="none" />
          </svg>
        </button>
        <button
          ref={bottom}
          className={"layout-btn" + (shown("terminal") ? " on" : "")}
          title={`Toggle Terminal (${mod}J)`}
          onClick={() => ws && togglePanel(ws, "terminal", bottom.current)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" />
            <path d="M1.75 9.75h12.5" />
            <rect className="fill" x="1.75" y="9.75" width="12.5" height="4" rx="2" stroke="none" />
          </svg>
        </button>
        <button
          ref={right}
          className={"layout-btn" + (shown("preview") ? " on" : "")}
          title="Toggle Preview"
          onClick={() => ws && togglePanel(ws, "preview", right.current)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" />
            <path d="M10 2.25v11.5" />
            <rect className="fill" x="10" y="2.25" width="4.25" height="11.5" rx="2" stroke="none" />
          </svg>
        </button>
        <span className="titlebar-sep" />
        <button className="layout-btn" title={`Command Palette (${mod}${shift}P)`} onClick={() => ide.openPalette("commands")}>
          <CommandIcon size={15} />
        </button>
      </div>
    </header>
  );
}

function StatusBar() {
  const ws = useOptionalWorkspace();
  const snap = useWorkspaceState();
  const activeEditor = useIde((s) => s.activeEditor);
  const cursor = useIde((s) => (activeEditor ? s.cursors[activeEditor] : undefined));
  const theme = useIde((s) => s.theme);
  const diagnostics = useDiagnostics();
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const focused = snap.views.find((v) => v.id === snap.focusedView);
  const editor = snap.views.find((v) => v.id === activeEditor);
  const path = editor?.params.path as string | undefined;
  const doc = snap.document;
  const panels = countPanels(doc?.root) + (doc?.floating.length ?? 0);
  const framedTitle = snap.framed
    ? (snap.views.find((v) => v.panelId === snap.framed && v.selected)?.title ?? (snap.framed === "stage" ? "Editors" : "Panel"))
    : null;
  const FocusIcon =
    { explorer: FilesIcon, search: SearchIcon, terminal: TerminalIcon, problems: ProblemsIcon, preview: PreviewIcon, outline: OutlineIcon }[
      focused?.type ?? ""
    ] ?? null;

  return (
    <footer className="statusbar">
      <div className="status-group">
        <button className="status-item" title="Source control">
          <BranchIcon size={13} /> main{vfs.dirtyPaths().length ? "*" : ""}
        </button>
        <button className="status-item" title="Toggle Problems" onClick={() => ws && togglePanel(ws, "problems")}>
          <SeverityIcon severity="error" size={13} /> {errors}
          <SeverityIcon severity="warning" size={13} /> {warnings}
        </button>
        {focused && (
          <span className="status-item focus-indicator" title="Focused view">
            {focused.type === "editor" ? <FileIcon path={String(focused.params.path)} /> : FocusIcon && <FocusIcon size={13} />}
            {focused.title}
          </span>
        )}
      </div>
      <div className="status-group">
        {path && (
          <>
            <span className="status-item">
              Ln {cursor?.line ?? 1}, Col {cursor?.col ?? 1}
              {cursor?.selected ? ` (${cursor.selected} selected)` : ""}
            </span>
            <span className="status-item">Spaces: 2</span>
            <span className="status-item">UTF-8</span>
            <span className="status-item">{LANGUAGE_NAMES[languageOf(path)]}</span>
          </>
        )}
        <button
          className={"status-item layout-indicator" + (framedTitle ? " framed" : "")}
          title={framedTitle ? "Restore layout (Esc)" : `Maximize focused panel (${mod}${shift}↵)`}
          onClick={() => ws?.navigation.toggle()}
          data-testid="layout-indicator"
        >
          {framedTitle ? <MaximizeIcon size={13} /> : <LayoutIcon size={13} />}
          {framedTitle
            ? `Maximized · ${framedTitle}`
            : `${panels} panel${panels === 1 ? "" : "s"}${doc?.floating.length ? ` · ${doc.floating.length} floating` : ""}${
                doc?.hidden.length ? ` · ${doc.hidden.length} hidden` : ""
              }`}
        </button>
        <button
          className="status-item"
          title="Switch color theme"
          onClick={() => ide.setTheme(({ light: "medium", medium: "dark", dark: "darker", darker: "light" } as const)[theme])}
        >
          {theme[0].toUpperCase() + theme.slice(1)}
        </button>
      </div>
    </footer>
  );
}

export function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function Shell() {
  const ws = useOptionalWorkspace();
  const theme = useIde((s) => s.theme);

  // Track the last focused editor so the outline and status bar keep context while you use tool panels.
  useEffect(() => {
    if (!ws) return;
    const sync = () => {
      const s = ws.getSnapshot();
      const focused = s.views.find((v) => v.id === s.focusedView);
      if (focused?.type === "editor") ide.setActiveEditor(focused.id);
      else {
        const current = ide.get().activeEditor;
        if (!current || !s.views.some((v) => v.id === current)) {
          const fallback = s.views.find((v) => v.type === "editor" && v.selected) ?? s.views.find((v) => v.type === "editor");
          ide.setActiveEditor(fallback?.id ?? null);
        }
      }
    };
    sync();
    // Start with the caret in the stage's selected editor rather than whatever panel happens to be first.
    const initial = ws.getSnapshot();
    const focusedType = initial.views.find((v) => v.id === initial.focusedView)?.type;
    if (focusedType !== "editor") {
      const editor = initial.views.find((v) => v.type === "editor" && v.selected);
      if (editor) requestAnimationFrame(() => ws.focus(editor.id));
    }
    (window as unknown as { __ide: unknown }).__ide = { ws, vfs, ide };
    return ws.subscribe(sync);
  }, [ws]);

  // Global shortcuts.
  useEffect(() => {
    if (!ws) return;
    const onKey = (e: KeyboardEvent) => {
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (!modKey || e.defaultPrevented) return;
      const key = e.key.toLowerCase();
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (key === "p" && e.shiftKey) run(() => ide.openPalette("commands"));
      else if (key === "k" && !e.shiftKey) run(() => ide.openPalette("commands"));
      else if (key === "p") run(() => ide.openPalette("files"));
      else if (key === "s" && !e.shiftKey) run(() => saveActive(ws));
      else if (key === "b" && !e.shiftKey) run(() => togglePanel(ws, "explorer"));
      else if (key === "j" && !e.shiftKey) run(() => togglePanel(ws, "terminal"));
      else if (key === "f" && e.shiftKey) run(() => togglePanel(ws, "search"));
      else if (key === "m" && e.shiftKey) run(() => togglePanel(ws, "problems"));
    };
    window.addEventListener("keydown", onKey);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (vfs.dirtyPaths().length) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [ws]);

  return (
    <div className="ide" data-theme={theme}>
      <TitleBar />
      <main className="ide-main">
        <Workspace
          theme={theme}
          navigation="focus"
          floating="overlay"
          storageKey={STORAGE_KEY}
          version={LAYOUT_VERSION}
          label="Pulse IDE"
          className="ide-workspace"
        >
          <ViewType<EditorParams>
            id="editor"
            title={(v) => basename(v.params.path)}
            icon={<EditorTabIcon />}
            placement="stage"
            allow={{ side: false }}
            accessory={<EditorAccessory />}
            menu={(v) => [
              { label: "Save", shortcut: `${mod}S`, disabled: !vfs.isDirty(v.params.path), run: () => vfs.save(v.params.path) },
              { label: "Revert File", disabled: !vfs.isDirty(v.params.path), run: () => vfs.revert(v.params.path) },
              { label: "Copy Path", run: () => void navigator.clipboard?.writeText(v.params.path) },
            ]}
          >
            <Editor />
          </ViewType>
          <ViewType id="explorer" title="Explorer" icon={<FilesIcon />} singleton placement={LEFT_OF_STAGE} allow={{ stage: false, floating: false }}>
            <Explorer />
          </ViewType>
          <ViewType id="search" title="Search" icon={<SearchIcon />} singleton placement={LEFT_OF_STAGE} allow={{ stage: false }}>
            <Search />
          </ViewType>
          <ViewType id="terminal" title="Terminal" icon={<TerminalIcon />} placement={BELOW_STAGE}>
            <Terminal />
          </ViewType>
          <ViewType id="problems" title="Problems" icon={<ProblemsIcon />} singleton placement={BELOW_STAGE} allow={{ stage: false }}>
            <Problems />
          </ViewType>
          <ViewType id="preview" title="Preview" icon={<PreviewIcon />} singleton placement={RIGHT_OF_STAGE} iframe={PREVIEW_URL} accessory={<PreviewAccessory />} />
          <ViewType id="outline" title="Outline" icon={<OutlineIcon />} singleton placement={RIGHT_OF_STAGE} allow={{ stage: false }}>
            <Outline />
          </ViewType>

          <Split weights={[1.42, 4.1, 1.8]}>
            <Panel id="left">
              <View id="explorer" type="explorer" />
              <View id="search" type="search" />
            </Panel>
            <Split axis="y" weights={[2.6, 1]}>
              <Stage id="stage" empty={<StageEmpty />}>
                <Panel>
                  {INITIAL_EDITORS.map((path) => (
                    <View key={path} id={`editor:${path}`} type="editor" params={{ path }} />
                  ))}
                </Panel>
              </Stage>
              <Panel id="bottom">
                <View id="terminal" type="terminal" />
                <View id="problems" type="problems" />
              </Panel>
            </Split>
            <Split axis="y" weights={[1.35, 1]}>
              <View id="preview" type="preview" />
              <View id="outline" type="outline" />
            </Split>
          </Split>

          <Workspace.Chrome>
            <Palette />
            <ConfirmDialog />
            <Toast />
          </Workspace.Chrome>
        </Workspace>
      </main>
      <StatusBar />
    </div>
  );
}
