import { useMemo, useState, type ReactNode } from "react";
import { useWorkspace, useWorkspaceSelector } from "@danfessler/trellis-react";
import { allDiagnostics } from "../analysis";
import { ChevronDown, ChevronRight, CollapseIcon, FileIcon, FolderIcon, FolderOpenIcon } from "../icons";
import { openFile, useIde } from "../ide";
import { PROJECT_NAME } from "../seed";
import { useVfs, vfs } from "../vfs";

interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
}
function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const sub = parts.slice(0, i + 1).join("/");
      if (i === parts.length - 1) node.children!.push({ name: part, path: sub });
      else {
        let dir = node.children!.find((c) => c.children && c.name === part);
        if (!dir) node.children!.push((dir = { name: part, path: sub, children: [] }));
        node = dir;
      }
    });
  }
  return root.children!;
}

export function Explorer() {
  const ws = useWorkspace();
  const version = useVfs();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const activeEditor = useIde((s) => s.activeEditor);
  const activePath = useWorkspaceSelector((s) => (s.views.find((v) => v.id === activeEditor)?.params.path as string) ?? null);
  const tree = useMemo(() => buildTree(vfs.paths()), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const severity = useMemo(() => {
    const map = new Map<string, "error" | "warning">();
    for (const d of allDiagnostics()) {
      if (d.severity === "error") map.set(d.path, "error");
      else if (d.severity === "warning" && !map.has(d.path)) map.set(d.path, "warning");
    }
    return map;
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const render = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      if (node.children) {
        const open = !collapsed.has(node.path);
        const hasProblem = [...severity.keys()].some((p) => p.startsWith(node.path + "/"));
        return (
          <div key={node.path} role="group">
            <button className="tree-row" style={{ paddingLeft: 8 + depth * 12 }} onClick={() => toggle(node.path)} aria-expanded={open}>
              <span className="tree-chevron">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
              <span className="tree-folder">{open ? <FolderOpenIcon size={14} /> : <FolderIcon size={14} />}</span>
              <span className={"tree-name" + (hasProblem ? " has-problem" : "")}>{node.name}</span>
              {hasProblem && <span className="tree-dot problem" />}
            </button>
            {open && render(node.children, depth + 1)}
          </div>
        );
      }
      const dirty = vfs.isDirty(node.path);
      const sev = severity.get(node.path);
      return (
        <button
          key={node.path}
          className={"tree-row file" + (node.path === activePath ? " active" : "")}
          style={{ paddingLeft: 8 + depth * 12 + 14 }}
          onClick={() => openFile(ws, node.path)}
          title={node.path}
          data-path={node.path}
        >
          <FileIcon path={node.path} />
          <span className={"tree-name" + (sev ? ` ${sev}` : "")}>{node.name}</span>
          {dirty ? <span className="tree-dot dirty" title="Unsaved changes" /> : sev ? <span className={`tree-sev ${sev}`}>{sev === "error" ? "!" : "•"}</span> : null}
        </button>
      );
    });

  return (
    <div className="side-view explorer">
      <div className="side-header">
        <span className="side-title">{PROJECT_NAME}</span>
        <div className="side-actions">
          <button className="icon-btn" title="New File…" onClick={() => setCreating(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round">
              <path d="M9.5 1.75H4.75a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5h6.5a1.5 1.5 0 0 0 1.5-1.5V5L9.5 1.75Z" />
              <path d="M8 7v4.5M5.75 9.25h4.5" />
            </svg>
          </button>
          <button
            className="icon-btn"
            title="Collapse Folders"
            onClick={() => setCollapsed(new Set(vfs.paths().filter((p) => p.includes("/")).map((p) => p.split("/")[0])))}
          >
            <CollapseIcon />
          </button>
        </div>
      </div>
      {creating && (
        <form
          className="new-file"
          onSubmit={(e) => {
            e.preventDefault();
            const input = (e.currentTarget.elements.namedItem("name") as HTMLInputElement).value.trim().replace(/^\/+/, "");
            setCreating(false);
            if (!input) return;
            if (!vfs.exists(input)) vfs.create(input, "");
            openFile(ws, input);
          }}
        >
          <input name="name" autoFocus placeholder="src/new-file.ts" onBlur={() => setCreating(false)} onKeyDown={(e) => e.key === "Escape" && setCreating(false)} />
        </form>
      )}
      <div className="tree" role="tree">
        {render(tree, 0)}
      </div>
    </div>
  );
}
