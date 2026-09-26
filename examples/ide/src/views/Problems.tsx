import { useMemo, useState } from "react";
import { useViewBadge, useWorkspace } from "@danfessler/trellis-react";
import { allDiagnostics, type Diagnostic, type Severity } from "../analysis";
import { CheckIcon, ChevronDown, ChevronRight, FileIcon } from "../icons";
import { openFile } from "../ide";
import { basename, dirname, useVfs } from "../vfs";
import { SeverityIcon } from "./Editor";

export function useDiagnostics(): Diagnostic[] {
  const version = useVfs();
  return useMemo(() => allDiagnostics(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Problems() {
  const ws = useWorkspace();
  const diagnostics = useDiagnostics();
  const [filter, setFilter] = useState<Record<Severity, boolean>>({ error: true, warning: true, info: true });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const counted = diagnostics.filter((d) => d.severity !== "info").length;
  useViewBadge(counted || null);

  const counts = { error: 0, warning: 0, info: 0 };
  for (const d of diagnostics) counts[d.severity]++;
  const visible = diagnostics.filter((d) => filter[d.severity]);
  const byFile = new Map<string, Diagnostic[]>();
  for (const d of visible) byFile.set(d.path, [...(byFile.get(d.path) ?? []), d]);
  const rank = { error: 0, warning: 1, info: 2 };

  return (
    <div className="problems">
      <div className="problems-bar">
        {(["error", "warning", "info"] as Severity[]).map((s) => (
          <button key={s} className={"chip" + (filter[s] ? " on" : "")} onClick={() => setFilter({ ...filter, [s]: !filter[s] })}>
            <SeverityIcon severity={s} size={13} />
            {counts[s]} {s === "info" ? "info" : s + (counts[s] === 1 ? "" : "s")}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="placeholder small">
          <CheckIcon size={18} />
          No problems have been detected in the workspace.
        </div>
      ) : (
        <div className="problems-list">
          {[...byFile].map(([path, items]) => {
            const open = !collapsed.has(path);
            return (
              <div key={path}>
                <button
                  className="tree-row result-file"
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (open) next.add(path);
                      else next.delete(path);
                      return next;
                    })
                  }
                >
                  <span className="tree-chevron">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                  <FileIcon path={path} />
                  <span className="tree-name">{basename(path)}</span>
                  <span className="result-dir">{dirname(path)}</span>
                  <span className="count">{items.length}</span>
                </button>
                {open &&
                  items
                    .sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line)
                    .map((d, i) => (
                      <button
                        key={i}
                        className="tree-row problem-row"
                        onClick={() => openFile(ws, d.path, { line: d.line, col: d.col, length: d.len })}
                      >
                        <SeverityIcon severity={d.severity} size={14} />
                        <span className="problem-msg">{d.message}</span>
                        <span className="problem-src">
                          {d.source}({d.code})
                        </span>
                        <span className="result-ln">
                          [Ln {d.line + 1}, Col {d.col + 1}]
                        </span>
                      </button>
                    ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
