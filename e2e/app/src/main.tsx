import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { createWorkspace, layout as L, type WorkspaceOptions } from "@danfessler/trellis";
import {
  Panel,
  Split,
  Stage,
  View,
  ViewType,
  Workspace,
  WorkspaceProvider,
  Floating,
  useCloseGuard,
  useView,
  useWorkspace,
  useWorkspaceState,
} from "@danfessler/trellis-react";
import "@danfessler/trellis-element";
import "@danfessler/trellis/style.css";

const params = new URLSearchParams(location.search);
const scenario = params.get("scenario") ?? "vanilla";
const app = document.getElementById("app")!;
const w = window as any;
// ?dir=rtl lays the page out right to left; the workspace follows it.
if (params.get("dir")) document.documentElement.dir = params.get("dir")!;
w.mounts = {} as Record<string, number>;
w.unmounts = {} as Record<string, number>;
w.events = [] as string[];

function input(label: string) {
  return (el: HTMLElement, view: any) => {
    w.mounts[view.id] = (w.mounts[view.id] ?? 0) + 1;
    el.innerHTML = `<div style="padding:12px"><label>${label} <input data-test="input" /></label></div>`;
    return () => (w.unmounts[view.id] = (w.unmounts[view.id] ?? 0) + 1);
  };
}

if (scenario === "vanilla") {
  const floating = (params.get("floating") ?? "overlay") as "overlay";
  const navigation = (params.get("navigation") ?? "focus") as "focus";
  const scalingParam = params.get("scaling");
  const scaling = scalingParam === "false" ? false : ((scalingParam as "inert" | null) ?? undefined);
  const options: WorkspaceOptions = {
    motion: "reduced",
    floating: floating === ("false" as string) ? false : floating,
    navigation: navigation === ("false" as string) ? false : navigation,
    types: {
      files: { title: "Files", mount: input("files"), allow: { stage: false } },
      search: { title: "Search", mount: input("search"), allow: { stage: false } },
      editor: {
        title: (v) => String(v.params.name ?? "Editor"),
        placement: "stage",
        allow: { side: false },
        mount: input("editor"),
      },
      outline: { title: "Outline", mount: input("outline"), singleton: true },
      locked: { title: "Locked", closable: false, mount: input("locked") },
    },
    persist: params.has("persist") ? { key: "e2e", version: 1 } : undefined,
    defaultLayout: L.row(
      [
        L.panel({ id: "left" }, L.view("files", { id: "files" }), L.view("search", { id: "search" })),
        L.stage(
          L.panel(
            { id: "docs" },
            L.view("editor", { id: "a", params: { name: "a.ts" } }),
            L.view("editor", { id: "b", params: { name: "b.ts" } }),
          ),
        ),
        L.panel({ id: "right" }, L.view("outline", { id: "outline" })),
      ],
      [1, 3, 1],
    ),
  };
  if (scaling !== undefined) for (const t of Object.values(options.types)) t.scaling = scaling;
  // ?gestures=outline:exclusive sets a type's gesture ownership.
  const [gestureType, gestureValue] = (params.get("gestures") ?? "").split(":");
  if (gestureType && options.types[gestureType])
    options.types[gestureType].gestures = gestureValue as "content" | "workspace";
  // Tests add types with ws.update({ types: { ...w.types, … } }).
  w.types = options.types;
  const ws = createWorkspace(app, options);
  for (const e of ["open", "close", "focus", "navigate", "change"] as const)
    ws.on(e, (d: any) => w.events.push(`${e}:${typeof d === "object" && d ? (d.id ?? "doc") : d}`));
  w.ws = ws;
}

function Counter() {
  const view = useView<{ name: string }>();
  const [n, setN] = useState(0);
  const [guard, setGuard] = useState(false);
  useCloseGuard(() => !guard);
  return (
    <div style={{ padding: 12 }}>
      <span data-test="name">{view.params.name}</span>
      <button data-test="inc" onClick={() => setN(n + 1)}>
        count {n}
      </button>
      <label>
        <input
          type="checkbox"
          data-test="guard"
          checked={guard}
          onChange={(e) => setGuard(e.target.checked)}
        />{" "}
        guard
      </label>
      <span data-test="focused">{String(view.focused)}</span>
    </div>
  );
}
/** Throws while rendering whenever window.__boom is set. */
function Boom() {
  const view = useView();
  if ((window as any).__boom) throw new Error(`boom in ${view.id}`);
  return <p data-test="boom-ok">fine</p>;
}
function Opener() {
  const ws = useWorkspace();
  return (
    <button data-test="open" onClick={() => ws.open("counter", { params: { name: "new" } })}>
      open
    </button>
  );
}
function Status() {
  const state = useWorkspaceState();
  return (
    <div data-test="status" style={{ position: "fixed", left: 0, bottom: 0, zIndex: 10 }}>
      {state.views.length}:{state.focusedView ?? "none"}
    </div>
  );
}
if (scenario === "react") {
  createRoot(app).render(
    <StrictMode>
      <WorkspaceProvider>
        <Status />
        <Workspace
          motion="reduced"
          ref={(h) => void (w.ws = h)}
          onError={(e) => (w.errors ??= []).push(`${e.source}:${e.viewId ?? ""}`)}
        >
          <ViewType id="boom" title="Boom" placement="stage">
            <Boom />
          </ViewType>
          <ViewType id="counter" title={(v) => String(v.params.name)} placement="stage">
            <Counter />
          </ViewType>
          <ViewType id="tools" title="Tools" allow={{ stage: false }}>
            <Opener />
          </ViewType>
          <Workspace.Backdrop>
            <span data-test="backdrop">backdrop</span>
          </Workspace.Backdrop>
          <Floating rect={{ x: 0.74, y: 0.72, w: 0.24, h: 0.25 }}>
            <View type="tools" id="floating-tools" />
          </Floating>
          <Split weights={[1, 3]}>
            <View type="tools" id="tools" />
            <Stage empty={<p data-test="stage-empty">empty stage</p>}>
              <Panel id="docs">
                <View type="counter" id="c1" params={{ name: "one" }} />
                <View type="counter" id="c2" params={{ name: "two" }} />
              </Panel>
            </Stage>
          </Split>
        </Workspace>
      </WorkspaceProvider>
    </StrictMode>,
  );
}

if (scenario === "element") {
  app.innerHTML = `
    <trellis-workspace theme="dark" motion="reduced" style="height:100%">
      <template data-view-type="note" data-title="Note"><p class="note">Note <span data-param="name"></span></p></template>
      <template data-view-type="tool" data-title="Tool" data-allow-stage="false"><p class="tool">Tool</p></template>
      <trellis-split weights="1 3">
        <trellis-view type="tool" view-id="t1"></trellis-view>
        <trellis-stage>
          <trellis-panel>
            <trellis-view type="note" view-id="n1" params='{"name":"first"}'></trellis-view>
            <trellis-view type="note" params='{"name":"unnamed one"}'></trellis-view>
            <trellis-view type="note" params='{"name":"unnamed two"}'></trellis-view>
          </trellis-panel>
        </trellis-stage>
      </trellis-split>
      <div slot="chrome"><span data-test="chrome">chrome slot</span></div>
    </trellis-workspace>`;
  document
    .querySelector("trellis-workspace")!
    .addEventListener("trellis-ready", (e: any) => (w.ws = e.detail));
}

if (scenario === "stress") {
  // ?cols=&rows=&tabs= size the grid; scripts/bench.mjs uses it.
  const cols = Number(params.get("cols") ?? 6);
  const rows = Number(params.get("rows") ?? 6);
  const tabs = Number(params.get("tabs") ?? 3);
  const types: WorkspaceOptions["types"] = {
    cell: { title: (v) => `Cell ${v.params.n}`, mount: input("cell") },
  };
  let n = 0;
  const started = performance.now();
  const ws = createWorkspace(app, {
    types,
    navigation: "free",
    defaultLayout: L.row(
      Array.from({ length: cols }, () =>
        L.column(
          Array.from({ length: rows }, () =>
            L.panel(...Array.from({ length: tabs }, () => L.view("cell", { params: { n: n++ } }))),
          ),
        ),
      ),
    ),
  });
  // Until the first frame is on screen.
  requestAnimationFrame(() => requestAnimationFrame(() => (w.startup = performance.now() - started)));
  w.ws = ws;
}
