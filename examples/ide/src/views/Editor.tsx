import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useCloseGuard, useView, useViewBadge, useViewTitle } from "@danfessler/trellis-react";
import { tokenize, type Token } from "../highlight";
import { basename, languageOf, useFile, vfs, LANGUAGE_NAMES } from "../vfs";
import { diagnosticsFor, symbolsOf, type Diagnostic } from "../analysis";
import { editorRegistry, ide, useIde, type Cursor } from "../ide";
import { ChevronRight, ErrorIcon, InfoIcon, WarningIcon } from "../icons";

const LH = 20; // line height, px
const PAD_Y = 10;
const PAD_X = 14;

export type EditorParams = { path: string };

function cursorAt(text: string, index: number): { line: number; col: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++)
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  return { line, col: index - last };
}
function lineStart(text: string, index: number) {
  return text.lastIndexOf("\n", index - 1) + 1;
}
function lineEnd(text: string, index: number) {
  const e = text.indexOf("\n", index);
  return e === -1 ? text.length : e;
}
function offsetOf(text: string, line: number, col: number) {
  let offset = 0;
  for (let i = 0; i < line; i++) {
    const next = text.indexOf("\n", offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return Math.min(offset + col, lineEnd(text, offset));
}

/** Lines of `next` that are not part of the longest common subsequence with `base`. */
function changedLines(base: string, next: string): Set<number> {
  if (base === next) return new Set();
  const a = base.split("\n");
  const b = next.split("\n");
  if (a.length * b.length > 400_000) return new Set();
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = new Set<number>();
  let i = 0;
  let j = 0;
  while (j < m) {
    if (i < n && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else out.add(j++);
  }
  return out;
}

const Line = memo(function Line({ tokens }: { tokens: Token[] }) {
  const out: ReactNode[] = [];
  tokens.forEach((tok, i) => {
    if (i === 0 && tok.t === "plain") {
      const lead = tok.v.match(/^ +/)?.[0] ?? "";
      const guides = Math.floor(lead.length / 2);
      for (let g = 0; g < guides; g++)
        out.push(
          <span key={`g${g}`} className="indent">
            {"  "}
          </span>,
        );
      const rest = tok.v.slice(guides * 2);
      if (rest) out.push(<span key={i}>{rest}</span>);
      return;
    }
    out.push(
      <span key={i} className={tok.t === "plain" ? undefined : `tk-${tok.t}`}>
        {tok.v}
      </span>,
    );
  });
  return <div className="line">{out}</div>;
});

export function Editor() {
  const view = useView<EditorParams>();
  const path = view.params.path;
  const file = useFile(path);
  const lang = languageOf(path);
  const text = file?.content ?? "";
  const dirty = !!file && file.content !== file.saved;

  useViewTitle(basename(path));
  useViewBadge(dirty || null); // a dot that swaps with the close button on hover
  useCloseGuard(async () => {
    if (!vfs.isDirty(path)) return true;
    view.focus();
    const choice = await ide.confirm({
      title: `Do you want to save the changes you made to ${basename(path)}?`,
      message: "Your changes will be lost if you don't save them.",
      buttons: [
        { label: "Don't Save", value: "discard", danger: true },
        { label: "Cancel", value: "cancel" },
        { label: "Save", value: "save", primary: true },
      ],
    });
    if (choice === "save") vfs.save(path);
    else if (choice === "discard") vfs.revert(path);
    return choice !== "cancel";
  });

  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const charWidth = useRef(7.8);
  const [cursor, setCursor] = useState<Cursor>({ line: 1, col: 1, selected: 0 });
  const [hover, setHover] = useState<{ diag: Diagnostic; x: number; y: number } | null>(null);

  const lines = useMemo(() => tokenize(text, lang), [text, lang]);
  const changes = useMemo(() => changedLines(file?.saved ?? "", text), [file?.saved, text]);
  const diagnostics = useMemo(() => (file ? diagnosticsFor(path) : []), [file, path, text]); // eslint-disable-line react-hooks/exhaustive-deps
  const symbols = useMemo(() => symbolsOf(text, lang), [text, lang]);
  const maxLen = useMemo(() => text.split("\n").reduce((m, l) => Math.max(m, l.length), 0), [text]);
  const digits = Math.max(3, String(lines.length).length);
  const gutter = `calc(${digits}ch + 30px)`;

  useLayoutEffect(() => {
    const measureNow = () => {
      if (measure.current) charWidth.current = measure.current.getBoundingClientRect().width / 10 || charWidth.current;
    };
    measureNow();
    document.fonts?.ready.then(measureNow);
  }, []);

  const ensureVisible = useCallback((line: number, col: number, center = false) => {
    const el = scroller.current;
    if (!el) return;
    const top = PAD_Y + (line - 1) * LH;
    const gutterPx = el.querySelector<HTMLElement>(".gutter")?.offsetWidth ?? 50;
    if (center) el.scrollTop = Math.max(0, top - el.clientHeight / 2 + LH);
    else if (top < el.scrollTop + LH) el.scrollTop = Math.max(0, top - LH);
    else if (top + LH * 2 > el.scrollTop + el.clientHeight) el.scrollTop = top + LH * 2 - el.clientHeight;
    const x = gutterPx + PAD_X + (col - 1) * charWidth.current;
    const visibleW = el.clientWidth;
    if (x < el.scrollLeft + gutterPx + 20) el.scrollLeft = Math.max(0, x - gutterPx - 40);
    else if (x > el.scrollLeft + visibleW - 30) el.scrollLeft = x - visibleW + 60;
  }, []);

  const syncCursor = useCallback(() => {
    const ta = area.current;
    if (!ta) return;
    const at = cursorAt(ta.value, ta.selectionEnd);
    const next = { ...at, selected: Math.abs(ta.selectionEnd - ta.selectionStart) };
    setCursor((prev) => (prev.line === next.line && prev.col === next.col && prev.selected === next.selected ? prev : next));
    ide.setCursor(view.id, next);
    if (document.activeElement === ta) ensureVisible(at.line, at.col);
  }, [view.id, ensureVisible]);

  // Selection changes from the keyboard, mouse and programmatic edits all land here.
  useEffect(() => {
    const onSelection = () => {
      if (document.activeElement === area.current) syncCursor();
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [syncCursor]);

  // Register for reveal() calls from the outline, search and problems views.
  useEffect(
    () =>
      editorRegistry.register(view.id, {
        reveal(line, col = 0, length = 0) {
          const ta = area.current;
          if (!ta) return;
          view.focus();
          const start = offsetOf(ta.value, line, col);
          ta.focus({ preventScroll: true });
          ta.setSelectionRange(start, start + length);
          ensureVisible(line + 1, col + 1, true);
          syncCursor();
        },
        focus() {
          area.current?.focus({ preventScroll: true });
        },
      }),
    [view, ensureVisible, syncCursor],
  );
  // Focusing the view (tab click, F6, palette) puts the caret back in the text.
  useEffect(() => {
    if (view.focused && area.current && document.activeElement !== area.current) {
      const active = document.activeElement as HTMLElement | null;
      // Don't steal focus from the tab bar during keyboard navigation of tabs.
      if (!active || active === document.body || active.closest?.(`[data-trellis-content="${CSS.escape(view.id)}"]`))
        area.current.focus({ preventScroll: true });
    }
  }, [view.focused, view.id]);

  const insert = (value: string, selectFrom?: number, selectTo?: number) => {
    const ta = area.current!;
    ta.focus();
    // execCommand keeps the edit on the browser's native undo stack.
    if (!document.execCommand("insertText", false, value)) {
      ta.setRangeText(value, ta.selectionStart, ta.selectionEnd, "end");
      vfs.write(path, ta.value);
    }
    if (selectFrom !== undefined) ta.setSelectionRange(selectFrom, selectTo ?? selectFrom);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;
    const { selectionStart: s, selectionEnd: end, value } = ta;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (vfs.isDirty(path)) {
        vfs.save(path);
        ide.toast(`Saved ${basename(path)}`);
      }
      return;
    }
    if (mod && e.key === "/" && (lang === "ts" || lang === "js")) {
      e.preventDefault();
      const from = lineStart(value, s);
      const to = lineEnd(value, end > s && value[end - 1] === "\n" ? end - 1 : end);
      const block = value.slice(from, to).split("\n");
      const allCommented = block.every((l) => !l.trim() || /^\s*\/\//.test(l));
      const indent = Math.min(...block.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
      const next = block
        .map((l) => (!l.trim() ? l : allCommented ? l.replace(/^(\s*)\/\/ ?/, "$1") : l.slice(0, indent) + "// " + l.slice(indent)))
        .join("\n");
      ta.setSelectionRange(from, to);
      insert(next, from, from + next.length);
      return;
    }
    if (e.key === "Tab" && !mod && !e.altKey) {
      e.preventDefault();
      const multi = value.slice(s, end).includes("\n");
      if (!multi && !e.shiftKey) {
        insert("  ");
        return;
      }
      const from = lineStart(value, s);
      const to = lineEnd(value, end);
      const block = value.slice(from, to).split("\n");
      const next = block.map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, "") : l ? "  " + l : l)).join("\n");
      ta.setSelectionRange(from, to);
      insert(next);
      if (multi) ta.setSelectionRange(from, from + next.length);
      else {
        const caret = Math.max(from, s + (next.length - (to - from)));
        ta.setSelectionRange(caret, caret);
      }
      return;
    }
    if (e.key === "Enter" && !mod && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      const from = lineStart(value, s);
      const indent = value.slice(from).match(/^[ \t]*/)![0].slice(0, Math.max(0, s - from));
      const before = value[s - 1];
      const after = value[end];
      const opens = before === "{" || before === "(" || before === "[" || (lang === "html" && before === ">" && value.slice(from, s).match(/<([a-z][\w-]*)[^>]*>$/i) && after === "<");
      if (opens) {
        const inner = "\n" + indent + "  ";
        const closes = after === "}" || after === ")" || after === "]" || after === "<";
        insert(inner + (closes ? "\n" + indent : ""));
        const caret = s + inner.length;
        ta.setSelectionRange(caret, caret);
      } else insert("\n" + indent);
      return;
    }
    if (e.key === "}" && !mod && s === end) {
      // Typing a closing brace on a whitespace-only line outdents it one step.
      const from = lineStart(value, s);
      const lead = value.slice(from, s);
      if (lead.length >= 2 && /^ +$/.test(lead)) {
        e.preventDefault();
        ta.setSelectionRange(s - 2, s);
        insert("}");
        return;
      }
    }
    if (e.key === "Backspace" && !mod && s === end && s > 0) {
      // Delete a whole indent step when the caret sits in leading whitespace.
      const from = lineStart(value, s);
      const lead = value.slice(from, s);
      if (lead.length >= 2 && /^ +$/.test(lead) && lead.length % 2 === 0) {
        e.preventDefault();
        ta.setSelectionRange(s - 2, s);
        insert("");
      }
    }
  };

  const onMouseMove = (e: MouseEvent<HTMLTextAreaElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const line = Math.floor((e.clientY - rect.top - PAD_Y) / LH);
    const col = Math.floor((e.clientX - rect.left - PAD_X) / charWidth.current);
    const diag = diagnostics.find((d) => d.line === line && col >= d.col && col < d.col + Math.max(1, d.len));
    if (!diag) {
      if (hover) setHover(null);
      return;
    }
    if (hover?.diag !== diag)
      setHover({ diag, x: PAD_X + diag.col * charWidth.current, y: PAD_Y + (line + 1) * LH + 4 });
  };

  if (!file)
    return (
      <div className="editor-missing">
        <p>
          <strong>{path}</strong> no longer exists.
        </p>
        <button className="btn" onClick={() => view.close({ force: true })}>
          Close editor
        </button>
      </div>
    );

  const currentSymbol = [...symbols].reverse().find((sym) => sym.line <= cursor.line - 1);
  const crumbs = path.split("/");
  return (
    <div className="editor" data-lang={lang}>
      <div className="breadcrumbs">
        {crumbs.map((c, i) => (
          <span key={i} className="crumb">
            {i > 0 && <ChevronRight size={12} />}
            <span className={i === crumbs.length - 1 ? "crumb-file" : undefined}>{c}</span>
          </span>
        ))}
        {currentSymbol && (
          <span className="crumb">
            <ChevronRight size={12} />
            <span className={`crumb-symbol sym-${currentSymbol.kind}`}>{currentSymbol.name}</span>
          </span>
        )}
      </div>
      <div className="editor-scroll" ref={scroller} onScroll={() => hover && setHover(null)}>
        <div className="editor-inner" style={{ height: lines.length * LH + PAD_Y * 2 + 120 }}>
          <div className="gutter" style={{ width: gutter }} aria-hidden="true">
            {lines.map((_, i) => (
              <div key={i} className={"gutter-line" + (i === cursor.line - 1 ? " active" : "")}>
                {changes.has(i) && <span className={"change-bar" + (i >= (file.saved.split("\n").length) ? " added" : "")} />}
                {i + 1}
              </div>
            ))}
          </div>
          <div className="code" style={{ minWidth: `calc(${maxLen}ch + ${PAD_X * 2 + 40}px)` }}>
            {cursor.selected === 0 && <div className="active-line" style={{ top: PAD_Y + (cursor.line - 1) * LH }} />}
            <pre className="hl" aria-hidden="true">
              {lines.map((tokens, i) => (
                <Line key={i} tokens={tokens} />
              ))}
            </pre>
            <div className="squiggles" aria-hidden="true">
              {diagnostics.map((d, i) => (
                <div
                  key={i}
                  className={`squiggle ${d.severity}`}
                  style={{ top: PAD_Y + d.line * LH + LH - 3, left: `calc(${d.col}ch + ${PAD_X}px)`, width: `${Math.max(1, d.len)}ch` }}
                />
              ))}
            </div>
            <textarea
              ref={area}
              className="input"
              value={text}
              onChange={(e) => vfs.write(path, e.target.value)}
              onKeyDown={onKeyDown}
              onMouseMove={onMouseMove}
              onMouseLeave={() => setHover(null)}
              onFocus={syncCursor}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              wrap="off"
              aria-label={`Editor: ${path}`}
              data-path={path}
            />
            {hover && (
              <div className={`diag-hover ${hover.diag.severity}`} style={{ left: hover.x, top: hover.y }}>
                <SeverityIcon severity={hover.diag.severity} />
                <span>{hover.diag.message}</span>
                <span className="diag-code">
                  {hover.diag.source}({hover.diag.code})
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <span className="measure" ref={measure} aria-hidden="true">
        0000000000
      </span>
    </div>
  );
}

export function SeverityIcon({ severity, size = 14 }: { severity: Diagnostic["severity"]; size?: number }) {
  if (severity === "error") return <ErrorIcon size={size} className="sev error" />;
  if (severity === "warning") return <WarningIcon size={size} className="sev warning" />;
  return <InfoIcon size={size} className="sev info" />;
}

/** Tab bar accessory: caret position and language, like an editor's status segment. */
export function EditorAccessory() {
  const view = useView<EditorParams>();
  const cursor = useIde((s) => s.cursors[view.id]);
  return (
    <span className="accessory-text" title="Go to line">
      <span>
        Ln {cursor?.line ?? 1}, Col {cursor?.col ?? 1}
        {cursor?.selected ? ` (${cursor.selected} selected)` : ""}
      </span>
      <span className="accessory-sep collapsible" />
      <span className="collapsible">{LANGUAGE_NAMES[languageOf(view.params.path)]}</span>
    </span>
  );
}
