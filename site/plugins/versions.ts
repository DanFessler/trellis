/**
 * Which versions of the docs the site serves, and where their Markdown comes from.
 *
 * - Each released minor version (the newest patch of it) is read from its git tag, so old docs
 *   never need maintaining by hand.
 * - "next" is `main`: the working tree in dev (so edits preview live), and `origin/main` when
 *   building from somewhere else, such as the release branch the site deploys from.
 * - The newest release is "latest", served at /docs/<page>; every version is also at
 *   /docs/<version>/<page>.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface DocSet {
  /** URL segment: "0.2", or "next". */
  key: string;
  /** Full version for releases ("0.2.0"); null for next. */
  version: string | null;
  kind: "release" | "next";
  /** The tag or ref the docs came from, for links to GitHub. */
  ref: string;
  dir: string;
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const tryGit = (cwd: string, ...args: string[]) => {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
};

/** Release tags, newest patch of each minor, newest first. */
function releaseTags(repo: string): { tag: string; version: string; key: string }[] {
  let tags = tryGit(repo, "tag", "-l", "v*") ?? "";
  // CI and hosting checkouts are often shallow and tagless: fetch the tags before giving up.
  if (!tags) {
    tryGit(repo, "fetch", "--tags", "--quiet", "origin");
    tags = tryGit(repo, "tag", "-l", "v*") ?? "";
  }
  const parsed = tags
    .split("\n")
    .map((tag) => ({ tag, m: /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim()) }))
    .filter((t): t is { tag: string; m: RegExpExecArray } => !!t.m)
    .map(({ tag, m }) => ({ tag: tag.trim(), parts: m.slice(1, 4).map(Number) }))
    .sort((a, b) => b.parts[0] - a.parts[0] || b.parts[1] - a.parts[1] || b.parts[2] - a.parts[2]);
  const seen = new Set<string>();
  const out: { tag: string; version: string; key: string }[] = [];
  for (const { tag, parts } of parsed) {
    const key = `${parts[0]}.${parts[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tag, version: parts.join("."), key });
  }
  return out;
}

/** Write a ref's docs/*.md into a directory, unless it's already there for that commit. */
function extract(repo: string, ref: string, dir: string) {
  const commit = git(repo, "rev-parse", `${ref}^{commit}`);
  const stamp = path.join(dir, ".ref");
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === commit) return;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const files = git(repo, "ls-tree", "--name-only", commit, "docs/")
    .split("\n")
    .filter((f) => f.endsWith(".md"));
  for (const file of files)
    fs.writeFileSync(path.join(dir, path.basename(file)), git(repo, "show", `${commit}:${file}`) + "\n");
  fs.writeFileSync(stamp, commit);
}

export function collectDocSets(options: { repo: string; cacheDir: string; dev: boolean }): {
  sets: DocSet[];
  latest: string;
} {
  const { repo, cacheDir, dev } = options;
  const workingDocs = path.join(repo, "docs");
  const sets: DocSet[] = [];

  for (const release of releaseTags(repo)) {
    const dir = path.join(cacheDir, release.key);
    try {
      extract(repo, release.tag, dir);
      sets.push({ key: release.key, version: release.version, kind: "release", ref: release.tag, dir });
    } catch (error) {
      console.warn(`docs: skipping ${release.tag}: ${(error as Error).message}`);
    }
  }

  // next: main. In dev, or when building main itself, that's the working tree.
  let next: DocSet = { key: "next", version: null, kind: "next", ref: "main", dir: workingDocs };
  if (!dev) {
    tryGit(repo, "fetch", "--quiet", "origin", "main");
    const main = tryGit(repo, "rev-parse", "origin/main");
    const head = tryGit(repo, "rev-parse", "HEAD");
    if (main && main !== head) {
      const dir = path.join(cacheDir, "next");
      extract(repo, "origin/main", dir);
      next = { ...next, dir };
    }
  }
  sets.push(next);

  const latest = sets.find((s) => s.kind === "release")?.key ?? "next";
  return { sets, latest };
}
