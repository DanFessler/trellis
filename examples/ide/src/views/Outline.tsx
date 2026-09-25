import { useMemo } from "react";
import { useWorkspace, useWorkspaceState } from "@danfessler/trellis-react";
import { symbolsOf, type SymbolKind } from "../analysis";
import { OutlineIcon } from "../icons";
import { openFile, useIde } from "../ide";
import { basename, languageOf, useVfs, vfs } from "../vfs";

const KIND_GLYPH: Record<SymbolKind, string> = {
  function: "ƒ",
  method: "ƒ",
  class: "C",
  interface: "I",
  type: "T",
  const: "v",
  property: "p",
  selector: "#",
  "at-rule": "@",
  heading: "H",
  element: "<>",
  key: "k",
};

/** Symbols of the focused editor — or the last focused one while you click around the outline. */
export function Outline() {
  const ws = useWorkspace();
  const { focusedView, views } = useWorkspaceState();
  const lastEditor = useIde((s) => s.activeEditor);
  useVfs();
  const focused = views.find((v) => v.id === focusedView);
  const editor = focused?.type === "editor" ? focused : views.find((v) => v.id === lastEditor);
  const path = editor?.params.path as string | undefined;
  const text = path ? vfs.read(path) : undefined;
  const symbols = useMemo(() => (path && text !== undefined ? symbolsOf(text, languageOf(path)) : []), [path, text]);
  const cursor = useIde((s) => (editor ? s.cursors[editor.id] : undefined));
  const current = cursor ? [...symbols].reverse().find((s) => s.line <= cursor.line - 1) : undefined;

  if (!path)
    return (
      <div className="side-view outline">
        <div className="placeholder">
          <OutlineIcon size={22} />
          <p>Focus an editor to see its symbols.</p>
        </div>
      </div>
    );
  return (
    <div className="side-view outline">
      <div className="outline-file">
        <span>{basename(path)}</span>
        <span className="muted">{symbols.length} symbols</span>
      </div>
      {symbols.length === 0 && <div className="placeholder small">No symbols found in this file.</div>}
      <div className="outline-list">
        {symbols.map((s, i) => (
          <button
            key={i}
            className={"tree-row symbol" + (s === current ? " active" : "")}
            style={{ paddingLeft: 10 + s.depth * 14 }}
            onClick={() => openFile(ws, path, { line: s.line, col: s.col, length: s.kind === "heading" ? 0 : s.name.length })}
            title={`${s.name} — line ${s.line + 1}`}
          >
            <span className={`sym-glyph sym-${s.kind}`}>{KIND_GLYPH[s.kind]}</span>
            <span className="tree-name">{s.name}</span>
            <span className="result-ln">{s.line + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
