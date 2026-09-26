import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useWorkspace } from "@danfessler/trellis-react";
import { buildCommands, type Command } from "./commands";
import { FileIcon, CommandIcon, SearchIcon } from "./icons";
import { ide, openFile, useIde } from "./ide";
import { basename, dirname, vfs } from "./vfs";

/** Subsequence fuzzy match. Returns a score (higher is better) and matched indices, or null. */
function fuzzy(query: string, text: string): { score: number; hits: number[] } | null {
  if (!query) return { score: 0, hits: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const hits: number[] = [];
  let score = 0;
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    const prev = hits[hits.length - 1];
    score += found === prev + 1 ? 6 : 1;
    if (found === 0 || /[\s/._\-:]/.test(text[found - 1])) score += 4;
    hits.push(found);
    ti = found + 1;
  }
  return { score: score - text.length * 0.02, hits };
}

function Highlighted({ text, hits, offset = 0 }: { text: string; hits: number[]; offset?: number }) {
  const set = new Set(hits.map((h) => h - offset));
  const out: ReactNode[] = [];
  let run = "";
  let runHit = false;
  const flush = (i: number) => {
    if (!run) return;
    out.push(runHit ? <mark key={i}>{run}</mark> : <span key={i}>{run}</span>);
    run = "";
  };
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    if (hit !== runHit) {
      flush(i);
      runHit = hit;
    }
    run += text[i];
  }
  flush(text.length);
  return <>{out}</>;
}

type Item =
  | { kind: "command"; command: Command; hits: number[]; label: string }
  | { kind: "file"; path: string; hits: number[] };

export function Palette() {
  const ws = useWorkspace();
  const palette = useIde((s) => s.palette);
  const [value, setValue] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const commands = useMemo(buildCommands, []);

  // Layout effects so the input owns focus before the next keystroke arrives.
  useLayoutEffect(() => {
    if (!palette.open) return;
    const active = document.activeElement as HTMLElement | null;
    if (active !== input.current) returnFocus.current = active;
    setValue(palette.mode === "commands" ? ">" : "");
    setIndex(0);
  }, [palette.open, palette.mode, palette.nonce]);
  useLayoutEffect(() => {
    if (palette.open) input.current?.focus();
  }, [palette.open, palette.nonce]);

  const mode = value.startsWith(">") ? "commands" : "files";
  const query = mode === "commands" ? value.slice(1).trim() : value.trim();

  const items: Item[] = useMemo(() => {
    if (!palette.open) return [];
    if (mode === "commands") {
      return commands
        .map((command) => {
          const label = `${command.category}: ${command.title}`;
          const m =
            fuzzy(query, label) ??
            (command.keywords && fuzzy(query, command.keywords) ? { score: -5, hits: [] } : null);
          return m ? { kind: "command" as const, command, hits: m.hits, label, score: m.score } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => (query ? b.score - a.score : 0));
    }
    return vfs
      .paths()
      .map((path) => {
        const m = fuzzy(query, path);
        return m
          ? {
              kind: "file" as const,
              path,
              hits: m.hits,
              score: m.score + (fuzzy(query, basename(path)) ? 5 : 0),
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => (query ? b.score - a.score : a.path.localeCompare(b.path)));
  }, [palette.open, mode, query, commands]);

  useEffect(() => setIndex(0), [query, mode]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!palette.open) return null;

  const close = (restore = true) => {
    ide.closePalette();
    if (restore) returnFocus.current?.focus?.({ preventScroll: true });
  };
  const choose = (item: Item | undefined) => {
    if (!item) return;
    close(false);
    if (item.kind === "file") openFile(ws, item.path);
    else {
      // Commands that act on "the focused panel" need focus back where it was first.
      returnFocus.current?.focus?.({ preventScroll: true });
      item.command.run(ws);
    }
  };

  return (
    <div className="palette-scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-input">
          {mode === "commands" ? <CommandIcon size={15} /> : <SearchIcon size={15} />}
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              mode === "commands" ? "Type a command" : "Search files by name (type > for commands)"
            }
            spellCheck={false}
            aria-label="Palette query"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(items[index]);
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={list} role="listbox">
          {items.length === 0 && (
            <div className="palette-empty">No matching {mode === "commands" ? "commands" : "files"}</div>
          )}
          {items.map((item, i) => (
            <div
              key={item.kind === "file" ? item.path : item.command.id}
              data-index={i}
              role="option"
              aria-selected={i === index}
              className={"palette-item" + (i === index ? " selected" : "")}
              onPointerMove={() => i !== index && setIndex(i)}
              onClick={() => choose(item)}
            >
              {item.kind === "file" ? (
                <>
                  <FileIcon path={item.path} />
                  <span className="palette-label">
                    <Highlighted
                      text={basename(item.path)}
                      hits={item.hits}
                      offset={item.path.length - basename(item.path).length}
                    />
                  </span>
                  <span className="palette-detail">{dirname(item.path)}</span>
                  {vfs.isDirty(item.path) && <span className="tree-dot dirty" />}
                </>
              ) : (
                <>
                  <span className="palette-label">
                    <Highlighted text={item.label} hits={item.hits} />
                  </span>
                  {item.command.shortcut && <kbd className="palette-kbd">{item.command.shortcut}</kbd>}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
