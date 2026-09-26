import { useMemo, useState } from "react";
import { useView, useWorkspace } from "@danfessler/trellis-react";
import { ChevronDown, ChevronRight, FileIcon } from "../icons";
import { openFile } from "../ide";
import { basename, dirname, useVfs, vfs } from "../vfs";

interface Match {
  line: number;
  col: number;
  length: number;
  text: string;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Search() {
  const ws = useWorkspace();
  const view = useView();
  const version = useVfs();
  const [query, setQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { results, error } = useMemo(() => {
    if (!query) return { results: [] as { path: string; matches: Match[] }[], error: null };
    let re: RegExp;
    try {
      const source = useRegex ? query : escapeRegExp(query);
      re = new RegExp(wholeWord ? `\\b(?:${source})\\b` : source, matchCase ? "g" : "gi");
    } catch (e) {
      return { results: [], error: (e as Error).message.replace(/^Invalid regular expression: /, "") };
    }
    const out: { path: string; matches: Match[] }[] = [];
    for (const file of vfs.all()) {
      const matches: Match[] = [];
      file.content.split("\n").forEach((text, line) => {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) && matches.length < 200) {
          if (!m[0]) {
            re.lastIndex++;
            continue;
          }
          matches.push({ line, col: m.index, length: m[0].length, text });
        }
      });
      if (matches.length) out.push({ path: file.path, matches });
    }
    return { results: out, error: null };
  }, [query, matchCase, wholeWord, useRegex, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = results.reduce((n, r) => n + r.matches.length, 0);
  return (
    <div className="side-view search">
      <div className="search-box">
        <div className={"search-input" + (error ? " invalid" : "")}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            spellCheck={false}
            autoFocus={view.focused}
            aria-label="Search in files"
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                const m = results[0].matches[0];
                openFile(ws, results[0].path, { line: m.line, col: m.col, length: m.length });
              }
            }}
          />
          <button
            className={"toggle" + (matchCase ? " on" : "")}
            title="Match Case"
            onClick={() => setMatchCase(!matchCase)}
          >
            Aa
          </button>
          <button
            className={"toggle" + (wholeWord ? " on" : "")}
            title="Match Whole Word"
            onClick={() => setWholeWord(!wholeWord)}
          >
            <u>ab</u>
          </button>
          <button
            className={"toggle" + (useRegex ? " on" : "")}
            title="Use Regular Expression"
            onClick={() => setUseRegex(!useRegex)}
          >
            .*
          </button>
        </div>
        <div className="search-summary">
          {error
            ? error
            : query
              ? total
                ? `${total} result${total === 1 ? "" : "s"} in ${results.length} file${results.length === 1 ? "" : "s"}`
                : "No results found."
              : "Find across every file in the project."}
        </div>
      </div>
      <div className="search-results">
        {results.map((r) => {
          const open = !collapsed.has(r.path);
          return (
            <div key={r.path}>
              <button
                className="tree-row result-file"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (open) next.add(r.path);
                    else next.delete(r.path);
                    return next;
                  })
                }
              >
                <span className="tree-chevron">
                  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <FileIcon path={r.path} />
                <span className="tree-name">{basename(r.path)}</span>
                <span className="result-dir">{dirname(r.path)}</span>
                <span className="count">{r.matches.length}</span>
              </button>
              {open &&
                r.matches.map((m, i) => {
                  const start = Math.max(0, m.col - 10);
                  const pre = m.text.slice(start, m.col).trimStart();
                  return (
                    <button
                      key={i}
                      className="tree-row result-line"
                      onClick={() => openFile(ws, r.path, { line: m.line, col: m.col, length: m.length })}
                      title={`${r.path}:${m.line + 1}`}
                    >
                      <span className="result-text">
                        {start > 0 && "…"}
                        {pre}
                        <mark>{m.text.slice(m.col, m.col + m.length)}</mark>
                        {m.text.slice(m.col + m.length, m.col + m.length + 80)}
                      </span>
                      <span className="result-ln">{m.line + 1}</span>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
