import type { Language } from "./vfs";

/** A deliberately tiny, regex-driven tokenizer. Good enough for a demo, fast enough for small files. */
export interface Token {
  t: string;
  v: string;
}

interface State {
  depth: number;
  inTag: boolean;
  prev: string;
  prevType: string;
  text: string;
}
type Classify = string | ((match: string, state: State, end: number) => string);
interface Rule {
  re: RegExp;
  t: Classify;
  bol?: boolean;
  when?: (s: State) => boolean;
}
const rule = (re: RegExp, t: Classify, extra: Partial<Rule> = {}): Rule => ({
  re: new RegExp(re.source, re.flags.includes("y") ? re.flags : re.flags + "y"),
  t,
  ...extra,
});

const JS_KEYWORDS = new Set(
  (
    "abstract as async await break case catch class const constructor continue debugger declare default delete do " +
    "else enum export extends finally for from function get if implements import in instanceof interface keyof let " +
    "new of private protected public readonly return satisfies set static super switch throw try type typeof var " +
    "void while with yield"
  ).split(" "),
);
const JS_CONSTANTS = new Set("true false null undefined this NaN Infinity".split(" "));
const TS_PRIMITIVES = new Set("string number boolean unknown any never object symbol bigint".split(" "));
const TYPE_INTRODUCERS = new Set(["class", "interface", "type", "extends", "implements", "new", "enum"]);

function nextNonSpace(text: string, from: number) {
  for (let i = from; i < text.length; i++) if (text[i] !== " " && text[i] !== "\t") return text[i];
  return "";
}

const COMMENT_BLOCK = rule(/\/\*[\s\S]*?(?:\*\/|$)/, "comment");
const STRING = rule(/"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/, "string");

const JS: Rule[] = [
  COMMENT_BLOCK,
  rule(/\/\/[^\n]*/, "comment"),
  rule(/`(?:\\[\s\S]|[^`\\])*`?/, "string"),
  STRING,
  rule(/(?:0x[\da-fA-F]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)n?\b/, "number"),
  rule(/[A-Za-z_$][\w$]*/, (m, s, end) => {
    if (s.prev === "." || s.prev === "?.") return "property";
    if (JS_CONSTANTS.has(m)) return "constant";
    if (JS_KEYWORDS.has(m)) {
      // `type`, `get`, `set`, `from`, `as`, `of` are contextual; treat them as identifiers when used as values.
      if ((m === "type" || m === "get" || m === "set") && nextNonSpace(s.text, end) === "(")
        return "function";
      return "keyword";
    }
    if (TS_PRIMITIVES.has(m)) return "type";
    if (s.prevType === "keyword" && TYPE_INTRODUCERS.has(s.prev)) return "type";
    if (nextNonSpace(s.text, end) === "(") return "function";
    if (/^[A-Z]/.test(m)) return "type";
    if (nextNonSpace(s.text, end) === ":" && s.depth > 0 && s.prev !== "?") return "property";
    return "variable";
  }),
  rule(/=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\.\.\.|[+\-*/%=<>!&|^~?:]/, "operator"),
  rule(/[{}()[\];,.]/, "punct"),
];

const CSS: Rule[] = [
  COMMENT_BLOCK,
  STRING,
  rule(/@[\w-]+/, "keyword"),
  rule(/!important\b/, "keyword"),
  rule(/--[\w-]+/, "variable"),
  rule(/[\w-]+(?=\s*:)/, "property", { when: (s) => s.depth > 0 }),
  rule(/#[\da-fA-F]{3,8}\b/, "number", { when: (s) => s.depth > 0 }),
  rule(/-?(?:\d*\.\d+|\d+)(?:px|em|rem|%|s|ms|deg|vh|vw|fr|ch|turn)?\b/, "number"),
  rule(/[\w-]+(?=\()/, "function"),
  rule(/[\w-]+/, "constant", { when: (s) => s.depth > 0 }),
  rule(/[.#][\w-]+/, "selector"),
  rule(/::?[\w-]+/, "keyword"),
  rule(/[\w-]+|\*/, "tag"),
  rule(/[{}()[\];,:>+~=]/, "punct"),
];

const HTML: Rule[] = [
  rule(/<!--[\s\S]*?(?:-->|$)/, "comment"),
  rule(/<!doctype[^>]*>/i, "keyword"),
  rule(/<\/?[\w-]+/, "tag"),
  rule(/\/?>/, "tag", { when: (s) => s.inTag }),
  rule(/[\w:@.-]+/, "attr", { when: (s) => s.inTag }),
  rule(/=/, "operator", { when: (s) => s.inTag }),
  rule(/"[^"]*"?|'[^']*'?/, "string", { when: (s) => s.inTag }),
  rule(/&\w+;/, "constant"),
  rule(/[^<&\s]+/, "plain"),
];

const MD: Rule[] = [
  rule(/```[^\n]*(?:\n[\s\S]*?(?:```|$))?/, "code", { bol: true }),
  rule(/#{1,6} [^\n]*/, "heading", { bol: true }),
  rule(/[ \t]*(?:[-*+]|\d+\.)(?= )/, "keyword", { bol: true }),
  rule(/`[^`\n]*`/, "string"),
  rule(/\*\*[^*\n]+\*\*/, "bold"),
  rule(/\[[^\]\n]*\]\([^)\n]*\)/, "link"),
  rule(/[^`*[\n]+/, "plain"),
];

const JSON_RULES: Rule[] = [
  rule(/"(?:\\.|[^"\\\n])*"(?=\s*:)/, "property"),
  rule(/"(?:\\.|[^"\\\n])*"?/, "string"),
  rule(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"),
  rule(/\b(?:true|false|null)\b/, "constant"),
  rule(/[{}[\],:]/, "punct"),
];

const RULES: Record<Language, Rule[]> = {
  ts: JS,
  js: JS,
  css: CSS,
  html: HTML,
  md: MD,
  json: JSON_RULES,
  text: [],
};

export function tokenize(text: string, lang: Language): Token[][] {
  const rules = RULES[lang];
  const lines: Token[][] = [[]];
  const push = (t: string, v: string) => {
    const parts = v.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (!part) return;
      const line = lines[lines.length - 1];
      const last = line[line.length - 1];
      if (last && last.t === t) last.v += part;
      else line.push({ t, v: part });
    });
  };
  const state: State = { depth: 0, inTag: false, prev: "", prevType: "", text };
  let pos = 0;
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === " " || ch === "\t" || ch === "\n") {
      let end = pos + 1;
      while (end < text.length && (text[end] === " " || text[end] === "\t" || text[end] === "\n")) end++;
      push("plain", text.slice(pos, end));
      pos = end;
      continue;
    }
    const bol = pos === 0 || text[pos - 1] === "\n";
    let matched = false;
    for (const r of rules) {
      if (r.bol && !bol) continue;
      if (r.when && !r.when(state)) continue;
      r.re.lastIndex = pos;
      const m = r.re.exec(text);
      if (!m || !m[0]) continue;
      const end = pos + m[0].length;
      const t = typeof r.t === "function" ? r.t(m[0], state, end) : r.t;
      push(t, m[0]);
      if (lang === "html") {
        if (t === "tag") state.inTag = !m[0].endsWith(">");
      }
      if (m[0] === "{") state.depth++;
      else if (m[0] === "}") state.depth = Math.max(0, state.depth - 1);
      state.prev = m[0];
      state.prevType = t;
      pos = end;
      matched = true;
      break;
    }
    if (!matched) {
      if (ch === "{") state.depth++;
      else if (ch === "}") state.depth = Math.max(0, state.depth - 1);
      push("plain", ch);
      state.prev = ch;
      state.prevType = "plain";
      pos++;
    }
  }
  return lines;
}
