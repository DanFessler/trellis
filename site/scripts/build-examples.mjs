// Build every example that has a build script into dist/examples/<name>/ and write a manifest.
// Examples are built with their own vite config (base "./"), output redirected here so their
// directories are left untouched. Failures are skipped with a warning; the site build still succeeds.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "../..");
const examplesDir = path.join(repo, "examples");
const outRoot = path.join(here, "../dist/examples");
const only = process.argv.slice(2);

fs.mkdirSync(outRoot, { recursive: true });
const built = [];
const names = fs.existsSync(examplesDir) ? fs.readdirSync(examplesDir).sort() : [];
for (const name of names) {
  if (only.length && !only.includes(name)) continue;
  const dir = path.join(examplesDir, name);
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) continue;
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    console.warn(`examples: skipping ${name} (unreadable package.json)`);
    continue;
  }
  const script = pkg.scripts?.build;
  if (!script) {
    console.warn(`examples: skipping ${name} (no build script)`);
    continue;
  }
  const out = path.join(outRoot, name);
  fs.rmSync(out, { recursive: true, force: true });
  console.log(`examples: building ${name}…`);
  let result;
  if (/^vite build\b/.test(script.trim())) {
    // Redirect output so the example's own directory is untouched.
    result = spawnSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"], {
      cwd: dir,
      stdio: "inherit",
      timeout: 5 * 60_000,
    });
  } else {
    result = spawnSync("npm", ["run", "build"], { cwd: dir, stdio: "inherit", timeout: 5 * 60_000 });
    const dist = path.join(dir, "dist");
    if (result.status === 0 && fs.existsSync(dist)) fs.cpSync(dist, out, { recursive: true });
  }
  if (result.status !== 0 || !fs.existsSync(path.join(out, "index.html"))) {
    console.warn(`examples: ⚠ ${name} failed to build — skipped`);
    fs.rmSync(out, { recursive: true, force: true });
    continue;
  }
  const pages = fs.readdirSync(out).filter((f) => f.endsWith(".html"));
  built.push({ name, title: pkg.description ?? name, pages });
  console.log(`examples: ✓ ${name}`);
}
fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify({ examples: built }, null, 2));
console.log(`examples: ${built.length} built (${built.map((b) => b.name).join(", ") || "none"})`);
