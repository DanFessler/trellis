import type { LayoutNode, WorkspaceHandle } from "@danfessler/trellis-react";
import { ide, mod, openFile, shift, type IdeTheme } from "./ide";
import { basename, vfs } from "./vfs";

export interface Command {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  keywords?: string;
  run(ws: WorkspaceHandle): void;
}

export const PANEL_TYPES: { type: string; title: string; shortcut?: string }[] = [
  { type: "explorer", title: "Explorer", shortcut: `${mod}B` },
  { type: "search", title: "Search", shortcut: `${mod}${shift}F` },
  { type: "terminal", title: "Terminal", shortcut: `${mod}J` },
  { type: "problems", title: "Problems", shortcut: `${mod}${shift}M` },
  { type: "preview", title: "Preview" },
  { type: "outline", title: "Outline" },
];

/**
 * Toggle a tool panel the way editors do: open it if missing, restore it if hidden,
 * select it if it's a background tab, otherwise hide its whole panel (animated toward `anchor`).
 */
export function togglePanel(ws: WorkspaceHandle, type: string, anchor?: Element | null) {
  const snap = ws.getSnapshot();
  const hidden = snap.hidden.find((h) => h.views.some((v) => v.type === type));
  if (hidden) {
    const view = hidden.views.find((v) => v.type === type)!;
    ws.restore(hidden.panelId, anchor ? { from: anchor } : undefined);
    ws.focus(view.id);
    return;
  }
  const info = snap.views.find((v) => v.type === type);
  if (!info) {
    ws.open(type, { focus: true });
    return;
  }
  const handle = ws.view(info.id);
  if (handle && handle.selected && handle.visible)
    ws.hide(info.panelId, anchor ? { toward: anchor } : undefined);
  else ws.focus(info.id);
}

/** Is this panel type currently on screen? (Used for toggle-button states.) */
export function isShown(ws: WorkspaceHandle, type: string) {
  const snap = ws.getSnapshot();
  const info = snap.views.find((v) => v.type === type);
  return !!info && !snap.hidden.some((h) => h.panelId === info.panelId);
}

export function activeEditorPath(ws: WorkspaceHandle): string | null {
  const id = ide.get().activeEditor;
  const info = id ? ws.getSnapshot().views.find((v) => v.id === id) : null;
  return (info?.params.path as string) ?? null;
}

export function saveActive(ws: WorkspaceHandle) {
  const path = activeEditorPath(ws);
  if (path && vfs.isDirty(path)) {
    vfs.save(path);
    ide.toast(`Saved ${basename(path)}`);
  }
}

export function countPanels(node: LayoutNode | null | undefined): number {
  if (!node) return 0;
  if (node.kind === "panel") return 1;
  if (node.kind === "stage") return countPanels(node.child);
  return node.children.reduce((n, c) => n + countPanels(c), 0);
}

const THEMES: { id: IdeTheme; title: string }[] = [
  { id: "light", title: "Light" },
  { id: "medium", title: "Medium" },
  { id: "dark", title: "Dark" },
  { id: "darker", title: "Darker" },
];

export function buildCommands(): Command[] {
  const commands: Command[] = [
    {
      id: "file.quickOpen",
      title: "Go to File…",
      category: "File",
      shortcut: `${mod}P`,
      run: () => ide.openPalette("files"),
    },
    { id: "file.save", title: "Save", category: "File", shortcut: `${mod}S`, run: saveActive },
    {
      id: "file.saveAll",
      title: "Save All",
      category: "File",
      run: () => {
        const n = vfs.dirtyPaths().length;
        vfs.saveAll();
        if (n) ide.toast(`Saved ${n} file${n === 1 ? "" : "s"}`);
      },
    },
    {
      id: "file.revert",
      title: "Revert File",
      category: "File",
      run: (ws) => {
        const path = activeEditorPath(ws);
        if (path) vfs.revert(path);
      },
    },
    {
      id: "file.open.readme",
      title: "Open README",
      category: "File",
      keywords: "markdown docs",
      run: (ws) => openFile(ws, "README.md"),
    },
    ...PANEL_TYPES.map((p) => ({
      id: `view.toggle.${p.type}`,
      title: `Toggle ${p.title}`,
      category: "View",
      shortcut: p.shortcut,
      keywords: "panel show hide",
      run: (ws: WorkspaceHandle) => togglePanel(ws, p.type),
    })),
    {
      id: "view.newTerminal",
      title: "New Terminal",
      category: "Terminal",
      keywords: "shell console",
      run: (ws) => {
        // Open next to the existing terminal, as another tab in its panel.
        const snap = ws.getSnapshot();
        const existing = snap.views.find(
          (v) => v.type === "terminal" && !snap.hidden.some((h) => h.panelId === v.panelId),
        );
        ws.open("terminal", { placement: existing ? { into: existing.panelId } : undefined, focus: true });
      },
    },
    {
      id: "view.maximize",
      title: "Maximize Focused Panel",
      category: "View",
      shortcut: `${mod}${shift}↵`,
      keywords: "zoom focus frame fullscreen toggle",
      run: (ws) => ws.navigation.toggle(),
    },
    {
      id: "view.float",
      title: "Float Focused Panel",
      category: "View",
      keywords: "detach window pop out",
      run: (ws) => {
        const panel = ws.getSnapshot().focusedPanel;
        if (panel) ws.float(panel);
      },
    },
    {
      id: "view.dockEditorsSplit",
      title: "Split Editor Right",
      category: "View",
      keywords: "side by side",
      run: (ws) => {
        const snap = ws.getSnapshot();
        const id = ide.get().activeEditor;
        const info = snap.views.find((v) => v.id === id);
        if (info) ws.dock(info.id, { beside: info.panelId, edge: "right" });
      },
    },
    {
      id: "view.toggleNavigation",
      title: "Toggle Free Navigation",
      category: "View",
      keywords: "zoom pinch pan scale scroll focus navigation mode",
      run: () => ide.setNavigation(ide.get().navigation === "free" ? "focus" : "free"),
    },
    {
      id: "view.reset",
      title: "Reset Layout",
      category: "View",
      keywords: "default restore arrangement",
      run: (ws) => {
        ws.reset();
        ide.toast("Layout reset");
      },
    },
    {
      id: "project.reset",
      title: "Reset Project Files",
      category: "Developer",
      keywords: "seed restore",
      run: () => {
        vfs.resetProject();
        ide.toast("Project restored");
      },
    },
    ...THEMES.map((t) => ({
      id: `theme.${t.id}`,
      title: `Color Theme: ${t.title}`,
      category: "Preferences",
      keywords: "appearance switch",
      run: () => ide.setTheme(t.id),
    })),
  ];
  return commands;
}
