import { languageOf, vfs, type Language } from "./vfs";

// ------------------------------------------------------------------ outline symbols
export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "const"
  | "method"
  | "property"
  | "selector"
  | "at-rule"
  | "heading"
  | "element"
  | "key";

export interface DocSymbol {
  name: string;
  kind: SymbolKind;
  line: number; // 0-based
  col: number;
  depth: number;
}

const NOT_METHODS = new Set(["if", "for", "while", "switch", "return", "catch", "function", "super", "else"]);

function scriptSymbols(text: string): DocSymbol[] {
  const out: DocSymbol[] = [];
  const lines = text.split("\n");
  let classIndent: number | null = null;
  lines.forEach((raw, line) => {
    const indent = raw.length - raw.trimStart().length;
    const s = raw.trim();
    if (!s || s.startsWith("//") || s.startsWith("*") || s.startsWith("/*")) return;
    if (classIndent !== null && indent <= classIndent && s.startsWith("}")) {
      classIndent = null;
      return;
    }
    const col = (name: string) => Math.max(0, raw.indexOf(name));
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([\w$]+)/))) {
      out.push({ name: m[1], kind: "class", line, col: col(m[1]), depth: 0 });
      classIndent = indent;
      return;
    }
    if (classIndent !== null && indent > classIndent) {
      if (indent !== classIndent + 2) return;
      if ((m = s.match(/^(?:(?:private|public|protected|static|readonly|async|get|set|override)\s+)*([\w$]+)\s*\(/))) {
        if (NOT_METHODS.has(m[1])) return;
        const getter = /^(?:\w+\s+)*get\s/.test(s);
        out.push({ name: m[1], kind: getter ? "property" : "method", line, col: col(m[1]), depth: 1 });
        return;
      }
      if ((m = s.match(/^(?:(?:private|public|protected|static|readonly|declare|override)\s+)+([\w$]+)\s*[?!]?\s*[:=]/))) {
        out.push({ name: m[1], kind: "property", line, col: col(m[1]), depth: 1 });
      }
      return;
    }
    if (indent > 0) return;
    if ((m = s.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)\s*\(([^)]*)/))) {
      out.push({ name: m[1], kind: "function", line, col: col(m[1]), depth: 0 });
      return;
    }
    if ((m = s.match(/^(?:export\s+)?interface\s+([\w$]+)/))) {
      out.push({ name: m[1], kind: "interface", line, col: col(m[1]), depth: 0 });
      return;
    }
    if ((m = s.match(/^(?:export\s+)?type\s+([\w$]+)/))) {
      out.push({ name: m[1], kind: "type", line, col: col(m[1]), depth: 0 });
      return;
    }
    if ((m = s.match(/^(?:export\s+)?(?:const|let|var)\s+([\w$]+)(.*)$/))) {
      const isFn = /=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=]+)?=>/.test(m[2]) || /=\s*function\b/.test(m[2]);
      out.push({ name: m[1], kind: isFn ? "function" : "const", line, col: col(m[1]), depth: 0 });
    }
  });
  return out;
}

function cssSymbols(text: string): DocSymbol[] {
  const out: DocSymbol[] = [];
  let depth = 0;
  let inComment = false;
  text.split("\n").forEach((raw, line) => {
    const s = raw.trim();
    if (inComment) {
      if (s.includes("*/")) inComment = false;
      return;
    }
    if (s.startsWith("/*")) {
      if (!s.includes("*/")) inComment = true;
      return;
    }
    if (s.includes("{") && depth === 0) {
      const name = s.slice(0, s.indexOf("{")).trim();
      if (name) out.push({ name, kind: name.startsWith("@") ? "at-rule" : "selector", line, col: raw.indexOf(name[0]), depth: 0 });
    }
    for (const ch of s) {
      if (ch === "{") depth++;
      else if (ch === "}") depth = Math.max(0, depth - 1);
    }
  });
  // Merge multi-line selector lists ("a,\nb {") into one symbol name.
  const lines = text.split("\n");
  for (const sym of out) {
    let i = sym.line - 1;
    const parts = [sym.name];
    while (i >= 0 && lines[i].trim().endsWith(",")) {
      parts.unshift(lines[i].trim());
      sym.line = i;
      i--;
    }
    if (parts.length > 1) sym.name = parts.join(" ");
  }
  return out;
}

function mdSymbols(text: string): DocSymbol[] {
  const out: DocSymbol[] = [];
  let fence = false;
  text.split("\n").forEach((raw, line) => {
    if (raw.startsWith("```")) fence = !fence;
    if (fence) return;
    const m = raw.match(/^(#{1,6})\s+(.*)$/);
    if (m) out.push({ name: m[2], kind: "heading", line, col: 0, depth: m[1].length - 1 });
  });
  return out;
}

function htmlSymbols(text: string): DocSymbol[] {
  const out: DocSymbol[] = [];
  const skip = new Set(["meta", "link", "title", "script", "circle", "br", "html"]);
  text.split("\n").forEach((raw, line) => {
    const m = raw.match(/^(\s*)<([a-z][\w-]*)([^>]*)>/i);
    if (!m || skip.has(m[2].toLowerCase())) return;
    const id = m[3].match(/\bid="([^"]+)"/)?.[1];
    const cls = m[3].match(/\bclass="([^"]+)"/)?.[1];
    const name = m[2] + (id ? `#${id}` : "") + (cls ? "." + cls.split(/\s+/).join(".") : "");
    out.push({ name, kind: "element", line, col: m[1].length, depth: Math.max(0, Math.floor(m[1].length / 2) - 1) });
  });
  return out;
}

function jsonSymbols(text: string): DocSymbol[] {
  const out: DocSymbol[] = [];
  text.split("\n").forEach((raw, line) => {
    const m = raw.match(/^(\s*)"([^"]+)"\s*:/);
    if (m) out.push({ name: m[2], kind: "key", line, col: m[1].length, depth: Math.max(0, m[1].length / 2 - 1) });
  });
  return out;
}

export function symbolsOf(text: string, lang: Language): DocSymbol[] {
  switch (lang) {
    case "ts":
    case "js":
      return scriptSymbols(text);
    case "css":
      return cssSymbols(text);
    case "md":
      return mdSymbols(text);
    case "html":
      return htmlSymbols(text);
    case "json":
      return jsonSymbols(text);
    default:
      return [];
  }
}

// ------------------------------------------------------------------ diagnostics
export type Severity = "error" | "warning" | "info";
export interface Diagnostic {
  path: string;
  line: number; // 0-based
  col: number;
  len: number;
  severity: Severity;
  message: string;
  code: string;
  source: string;
}

function braceBalance(path: string, text: string, source: string): Diagnostic[] {
  const stack: { ch: string; line: number; col: number }[] = [];
  const pairs: Record<string, string> = { "}": "{", ")": "(", "]": "[" };
  const lines = text.split("\n");
  let inBlock = false;
  for (let line = 0; line < lines.length; line++) {
    const raw = lines[line];
    let quote: string | null = null;
    for (let col = 0; col < raw.length; col++) {
      const ch = raw[col];
      if (inBlock) {
        if (ch === "*" && raw[col + 1] === "/") {
          inBlock = false;
          col++;
        }
        continue;
      }
      if (quote) {
        if (ch === "\\") col++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "/" && raw[col + 1] === "*") {
        inBlock = true;
        continue;
      }
      if (ch === "/" && raw[col + 1] === "/" && source !== "css") break;
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{" || ch === "(" || ch === "[") stack.push({ ch, line, col });
      else if (ch in pairs) {
        const open = stack.pop();
        if (!open || open.ch !== pairs[ch])
          return [
            {
              path,
              line,
              col,
              len: 1,
              severity: "error",
              message: `Unexpected '${ch}'.`,
              code: source === "css" ? "css(1005)" : "ts(1128)",
              source,
            },
          ];
      }
    }
  }
  const open = stack.pop();
  if (open) {
    const close = { "{": "}", "(": ")", "[": "]" }[open.ch]!;
    return [
      { path, line: open.line, col: open.col, len: 1, severity: "error", message: `'${close}' expected.`, code: "ts(1005)", source },
    ];
  }
  return [];
}

function scriptDiagnostics(path: string, text: string, ts: boolean): Diagnostic[] {
  const out: Diagnostic[] = [];
  const source = ts ? "ts" : "eslint";
  text.split("\n").forEach((raw, line) => {
    const code = raw.replace(/\/\/.*$/, "");
    let m: RegExpExecArray | null;
    const re = /console\.(log|debug)\b/g;
    while ((m = re.exec(code)))
      out.push({ path, line, col: m.index, len: m[0].length, severity: "warning", message: "Unexpected console statement.", code: "no-console", source: "eslint" });
    if (ts) {
      const anyRe = /:\s*(any)\b/g;
      while ((m = anyRe.exec(code)))
        out.push({
          path,
          line,
          col: m.index + m[0].length - 3,
          len: 3,
          severity: "warning",
          message: "Unexpected any. Specify a different type.",
          code: "no-explicit-any",
          source: "eslint",
        });
    }
    const eqRe = /[^=!<>]==(?!=)/g;
    while ((m = eqRe.exec(code)))
      out.push({ path, line, col: m.index + 1, len: 2, severity: "warning", message: "Expected '===' and instead saw '=='.", code: "eqeqeq", source: "eslint" });
    const todo = raw.match(/\/\/\s*(TODO|FIXME)\b:?\s*(.*)$/);
    if (todo)
      out.push({ path, line, col: raw.indexOf(todo[1]), len: todo[1].length, severity: "info", message: `${todo[1]}: ${todo[2]}`, code: "todo", source: "todo" });
  });
  return [...braceBalance(path, text, source), ...out];
}

function cssDiagnostics(path: string, text: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  text.split("\n").forEach((raw, line) => {
    const i = raw.indexOf("!important");
    if (i >= 0)
      out.push({ path, line, col: i, len: 10, severity: "warning", message: "Avoid using !important.", code: "declaration-no-important", source: "stylelint" });
    const empty = raw.match(/^\s*([^{}]+)\{\s*\}\s*$/);
    if (empty) out.push({ path, line, col: raw.indexOf(empty[1].trim()), len: empty[1].trim().length, severity: "warning", message: "Do not use empty rulesets.", code: "emptyRules", source: "css" });
  });
  return [...braceBalance(path, text, "css"), ...out];
}

function jsonDiagnostics(path: string, text: string): Diagnostic[] {
  try {
    JSON.parse(text);
    return [];
  } catch (error) {
    const msg = String((error as Error).message);
    const pos = Number(msg.match(/position (\d+)/)?.[1] ?? 0);
    const before = text.slice(0, pos);
    const line = before.split("\n").length - 1;
    const col = pos - (before.lastIndexOf("\n") + 1);
    return [{ path, line, col, len: 1, severity: "error", message: msg.replace(/^JSON\.parse: /, ""), code: "json", source: "json" }];
  }
}

export function diagnose(path: string, text: string): Diagnostic[] {
  switch (languageOf(path)) {
    case "ts":
      return scriptDiagnostics(path, text, true);
    case "js":
      return scriptDiagnostics(path, text, false);
    case "css":
      return cssDiagnostics(path, text);
    case "json":
      return jsonDiagnostics(path, text);
    default:
      return [];
  }
}

// Cached per buffer contents so every consumer shares one pass.
const cache = new Map<string, { text: string; result: Diagnostic[] }>();
export function diagnosticsFor(path: string): Diagnostic[] {
  const text = vfs.read(path) ?? "";
  const hit = cache.get(path);
  if (hit && hit.text === text) return hit.result;
  const result = diagnose(path, text);
  cache.set(path, { text, result });
  return result;
}
export function allDiagnostics(): Diagnostic[] {
  return vfs.paths().flatMap(diagnosticsFor);
}
