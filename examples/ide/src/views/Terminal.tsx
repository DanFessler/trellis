import { useEffect, useRef, useState, type ReactNode } from "react";
import { useView, useWorkspace } from "@danfessler/trellis-react";
import { allDiagnostics } from "../analysis";
import { openFile } from "../ide";
import { PROJECT_NAME } from "../seed";
import { basename, comparePaths, vfs } from "../vfs";
import { fileColor } from "../icons";

type Entry = { id: number; kind: "in" | "out"; node: ReactNode; cwd?: string };

const HELP: [string, string][] = [
  ["help", "show this help"],
  ["ls [dir]", "list files"],
  ["tree", "show the project tree"],
  ["cat <file>", "print a file"],
  ["open <file>", "open a file in the editor"],
  ["echo <text> [> file]", "print text, or write it to a file"],
  ["git status", "show unsaved changes"],
  ["npm test", "run the test suite"],
  ["npm run build", "type-check and build"],
  ["clear", "clear the terminal"],
];

let nextId = 1;
const Prompt = ({ cwd = "~" }: { cwd?: string }) => (
  <span className="prompt">
    <span className="prompt-user">dev</span>
    <span className="prompt-at">@</span>
    <span className="prompt-host">{PROJECT_NAME}</span> <span className="prompt-cwd">{cwd}</span>
    <span className="prompt-sigil"> ❯ </span>
  </span>
);

function listDir(dir: string): string[] {
  const prefix = dir ? dir.replace(/\/$/, "") + "/" : "";
  const names = new Set<string>();
  for (const p of vfs.paths()) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    names.add(rest.includes("/") ? rest.slice(0, rest.indexOf("/") + 1) : rest);
  }
  return [...names].sort((a, b) => comparePaths(a.endsWith("/") ? a + "x" : a, b.endsWith("/") ? b + "x" : b));
}

function Ls({ names }: { names: string[] }) {
  return (
    <div className="ls">
      {names.map((n) => (
        <span key={n} style={{ color: n.endsWith("/") ? "var(--ide-accent)" : fileColor(n) }} className={n.endsWith("/") ? "ls-dir" : undefined}>
          {n}
        </span>
      ))}
    </div>
  );
}

export function Terminal() {
  const ws = useWorkspace();
  const view = useView();
  const [entries, setEntries] = useState<Entry[]>(() => {
    const out = (node: ReactNode): Entry => ({ id: nextId++, kind: "out", node });
    return [
      { id: nextId++, kind: "in", node: "npm run dev" },
      out(""),
      out(
        <span>
          {"  "}
          <span className="ok">VITE v7.3.0</span> <span className="muted"> ready in </span>212 ms
        </span>,
      ),
      out(""),
      out(
        <span>
          {"  "}
          <span className="ok">➜</span> <span className="muted"> Local:   </span>
          <span className="accent">http://localhost:5173/</span>
        </span>,
      ),
      out(
        <span className="muted">
          {"  "}
          <span className="ok">➜</span> Preview is live in the panel on the right · type <span className="accent">help</span> for commands
        </span>,
      ),
      out(""),
    ];
  });
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [entries, busy]);
  // Keep the prompt focused when the view gains focus or a streamed command finishes.
  useEffect(() => {
    if (!view.focused || busy) return;
    const active = document.activeElement;
    if (!active || active === document.body || scroller.current?.contains(active)) inputRef.current?.focus({ preventScroll: true });
  }, [view.focused, busy]);

  const print = (...nodes: ReactNode[]) =>
    setEntries((prev) => [...prev, ...nodes.map((node) => ({ id: nextId++, kind: "out" as const, node }))]);

  const stream = async (lines: ReactNode[], delay = 70) => {
    setBusy(true);
    for (const line of lines) {
      await new Promise((r) => setTimeout(r, delay));
      print(line);
    }
    setBusy(false);
  };

  const run = (raw: string) => {
    const line = raw.trim();
    setEntries((prev) => [...prev, { id: nextId++, kind: "in", node: raw }]);
    if (!line) return;
    setHistory((h) => [...h.filter((x) => x !== line), line]);
    const [cmd, ...args] = line.split(/\s+/);
    const arg = args.join(" ");
    const err = (msg: string) => print(<span className="err">{msg}</span>);
    switch (cmd) {
      case "help":
        print(
          <div className="help">
            {HELP.map(([c, d]) => (
              <div key={c}>
                <span className="accent">{c.padEnd(22)}</span>
                <span className="muted">{d}</span>
              </div>
            ))}
          </div>,
        );
        return;
      case "clear":
        setEntries([]);
        return;
      case "pwd":
        print(`/home/dev/${PROJECT_NAME}`);
        return;
      case "whoami":
        print("dev");
        return;
      case "date":
        print(new Date().toString());
        return;
      case "ls": {
        const dir = arg.replace(/^\.\/?/, "");
        const names = listDir(dir);
        if (!names.length) return err(`ls: ${arg}: No such file or directory`);
        print(<Ls names={names} />);
        return;
      }
      case "tree": {
        const out: ReactNode[] = [<span className="accent">.</span>];
        const walk = (dir: string, prefix: string) => {
          const names = listDir(dir);
          names.forEach((n, i) => {
            const last = i === names.length - 1;
            out.push(
              <span>
                <span className="muted">{prefix + (last ? "└── " : "├── ")}</span>
                <span style={{ color: n.endsWith("/") ? "var(--ide-accent)" : fileColor(n) }}>{n.replace(/\/$/, "")}</span>
              </span>,
            );
            if (n.endsWith("/")) walk(dir + n, prefix + (last ? "    " : "│   "));
          });
        };
        walk("", "");
        print(...out);
        return;
      }
      case "cat": {
        const path = arg.replace(/^\.\//, "");
        const text = vfs.read(path);
        if (text === undefined) return err(`cat: ${arg || "(missing operand)"}: No such file or directory`);
        print(<pre className="cat">{text.replace(/\n$/, "")}</pre>);
        return;
      }
      case "open": {
        const path = arg.replace(/^\.\//, "");
        if (!vfs.exists(path)) return err(`open: ${arg || "(missing operand)"}: No such file`);
        openFile(ws, path);
        print(<span className="muted">Opened {path}</span>);
        return;
      }
      case "echo": {
        const m = arg.match(/^(.*?)\s*(>>?)\s*(\S+)$/);
        const unquote = (s: string) => s.replace(/^(["'])(.*)\1$/, "$2");
        if (m) {
          const [, text, op, file] = m;
          const path = file.replace(/^\.\//, "");
          const prev = vfs.read(path);
          const next = op === ">>" && prev !== undefined ? prev + unquote(text) + "\n" : unquote(text) + "\n";
          vfs.create(path, next);
          return;
        }
        print(unquote(arg));
        return;
      }
      case "git": {
        if (args[0] !== "status") return err(`git: '${args[0] ?? ""}' is not supported in this demo`);
        const dirty = vfs.dirtyPaths();
        if (!dirty.length) {
          print(<span>On branch <span className="accent">main</span></span>, "nothing to commit, working tree clean");
          return;
        }
        print(
          <span>
            On branch <span className="accent">main</span>
          </span>,
          "Changes not staged for commit:",
          ...dirty.map((p) => <span className="warn">{"        modified:   " + p}</span>),
        );
        return;
      }
      case "npm": {
        const sub = args.join(" ");
        if (sub === "test" || sub === "run test" || sub === "t") {
          const tests = vfs.paths().filter((p) => /\.test\.[jt]s$/.test(p));
          void stream([
            <span className="muted">&gt; pulse@0.4.0 test</span>,
            <span className="muted">&gt; vitest run</span>,
            "",
            ...tests.map((t) => (
              <span>
                <span className="ok"> ✓ </span>
                {t} <span className="muted">(2 tests) 4ms</span>
              </span>
            )),
            "",
            <span>
              <span className="muted"> Test Files </span> <span className="ok">{tests.length} passed</span>
              <span className="muted"> ({tests.length})</span>
            </span>,
            <span>
              <span className="muted">      Tests </span> <span className="ok">{tests.length * 2} passed</span>
              <span className="muted"> ({tests.length * 2})</span>
            </span>,
          ]);
          return;
        }
        if (sub === "run build" || sub === "run dev") {
          const errors = allDiagnostics().filter((d) => d.severity === "error");
          if (errors.length) {
            void stream([
              <span className="muted">&gt; tsc && vite build</span>,
              "",
              ...errors.map((d) => (
                <span>
                  <span className="accent">{d.path}</span>
                  <span className="muted">:{d.line + 1}:{d.col + 1}</span> - <span className="err">error</span>{" "}
                  <span className="muted">{d.code}:</span> {d.message}
                </span>
              )),
              "",
              <span className="err">
                Found {errors.length} error{errors.length === 1 ? "" : "s"}.
              </span>,
            ]);
            return;
          }
          void stream([
            <span className="muted">&gt; tsc && vite build</span>,
            <span>
              <span className="accent">vite v7.3.0</span> <span className="ok">building for production...</span>
            </span>,
            <span className="ok">✓ 6 modules transformed.</span>,
            <span>
              <span className="muted">dist/</span>index.html <span className="muted">        0.71 kB │ gzip: 0.40 kB</span>
            </span>,
            <span>
              <span className="muted">dist/</span>assets/index.css <span className="muted"> 1.52 kB │ gzip: 0.66 kB</span>
            </span>,
            <span>
              <span className="muted">dist/</span>assets/index.js <span className="muted">  2.08 kB │ gzip: 1.02 kB</span>
            </span>,
            <span className="ok">✓ built in 212ms</span>,
          ]);
          return;
        }
        return err(`npm: unknown command "${sub}". Try "npm test" or "npm run build".`);
      }
      default:
        err(`${cmd}: command not found`);
    }
  };

  const complete = () => {
    const m = input.match(/^(.*\s)?(\S*)$/);
    if (!m) return;
    const [, head = "", partial] = m;
    if (!head) {
      const cmds = ["help", "ls", "tree", "cat", "open", "echo", "git status", "npm test", "npm run build", "clear"].filter((c) =>
        c.startsWith(partial),
      );
      if (cmds.length === 1) setInput(cmds[0] + " ");
      return;
    }
    const candidates = vfs.paths().filter((p) => p.startsWith(partial));
    if (candidates.length === 1) setInput(head + candidates[0]);
    else if (candidates.length > 1) {
      let common = candidates[0];
      for (const c of candidates) while (!c.startsWith(common)) common = common.slice(0, -1);
      if (common.length > partial.length) setInput(head + common);
      else print(<Ls names={candidates.map(basename)} />);
    }
  };

  return (
    <div className="terminal" ref={scroller} onMouseUp={() => !window.getSelection()?.toString() && inputRef.current?.focus()}>
      {entries.map((e) =>
        e.kind === "in" ? (
          <div key={e.id} className="term-line">
            <Prompt />
            {e.node}
          </div>
        ) : (
          <div key={e.id} className="term-line out">
            {e.node}
          </div>
        ),
      )}
      {busy ? (
        <div className="term-line">
          <span className="spinner" />
        </div>
      ) : (
        <form
          className="term-line term-input"
          onSubmit={(e) => {
            e.preventDefault();
            run(input);
            setInput("");
            setHistoryIndex(null);
          }}
        >
          <Prompt />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Terminal input"
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                complete();
              } else if (e.key === "ArrowUp" && history.length) {
                e.preventDefault();
                const i = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
                setHistoryIndex(i);
                setInput(history[i]);
              } else if (e.key === "ArrowDown" && historyIndex !== null) {
                e.preventDefault();
                const i = historyIndex + 1;
                if (i >= history.length) {
                  setHistoryIndex(null);
                  setInput("");
                } else {
                  setHistoryIndex(i);
                  setInput(history[i]);
                }
              } else if (e.key === "l" && e.ctrlKey) {
                e.preventDefault();
                setEntries([]);
              }
            }}
          />
        </form>
      )}
    </div>
  );
}
