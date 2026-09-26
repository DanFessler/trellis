// Release check: pack every package, install the tarballs into a fresh project, and typecheck + build it
// against React 18 and React 19 with skipLibCheck off.
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "pipe", encoding: "utf8" });
const root = resolve(".");
const out = mkdtempSync(join(tmpdir(), "trellis-pack-"));
for (const pkg of ["core", "react", "element"]) run(`npm pack --pack-destination ${out}`, join(root, "packages", pkg));
const tarballs = readdirSync(out).filter((f) => f.endsWith(".tgz")).map((f) => join(out, f));
console.log("packed", tarballs.map((t) => t.split("/").pop()).join(", "));

for (const react of ["18", "19"]) {
  const app = join(out, `app-react${react}`);
  mkdirSync(join(app, "src"), { recursive: true });
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app", private: true, type: "module" }));
  writeFileSync(
    join(app, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx", strict: true, lib: ["ES2023", "DOM"], noEmit: true },
      include: ["src"],
    }),
  );
  writeFileSync(join(app, "index.html"), `<div id="root"></div><script type="module" src="/src/main.tsx"></script>`);
  writeFileSync(
    join(app, "src/main.tsx"),
    `import { createRoot } from "react-dom/client";
import { Workspace, WorkspaceProvider, ViewType, Split, Stage, View, useView, useWorkspaceState } from "@danfessler/trellis-react";
import { createWorkspace, layout } from "@danfessler/trellis";
import "@danfessler/trellis-element";
import "@danfessler/trellis/style.css";
interface Doc { name: string }
function Content() { const v = useView<Doc>(); return <p>{v.params.name}</p>; }
function Status() { return <p>{useWorkspaceState().views.length}</p>; }
createRoot(document.getElementById("root")!).render(
  <WorkspaceProvider><Status />
    <Workspace theme="dark"><ViewType<Doc> id="doc" title={(v) => v.params.name} placement="stage"><Content /></ViewType>
      <Split><Stage><View type="doc" params={{ name: "hi" }} /></Stage></Split></Workspace>
  </WorkspaceProvider>,
);
createWorkspace(document.body, { types: {}, defaultLayout: layout.stage() });
`,
  );
  run(
    `npm i --no-audit --no-fund ${tarballs.join(" ")} react@${react} react-dom@${react} @types/react@${react} @types/react-dom@${react} typescript@5.9 vite@latest`,
    app,
  );
  run("npx tsc -p .", app);
  run("npx vite build", app);
  console.log(`✓ React ${react}: installs, typechecks and builds from tarballs`);
}
