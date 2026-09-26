---
title: Recipes
description: Complete patterns — a desktop built from primitives, an art program, an IDE and a dashboard.
section: More
order: 40
---

# Recipes

Four very different tools, each built from the same handful of primitives. Every recipe is a sketch you can grow; the [examples](/#examples) are full versions.

## A desktop, built from primitives

A desktop environment is a stage with nothing docked in it: the stage *is* the desktop, windows are floats that live in the stage, and the dock is a tray of hidden panels.

```tsx title="Desktop.tsx"
import {
  Workspace, ViewType, Stage, useView, useWorkspace, useWorkspaceSelector, type ViewHandle,
} from "@danfessler/trellis-react";

function minimize(view: ViewHandle) {
  view.workspace.hide(view.panelId, { toward: document.querySelector(".dock") ?? undefined });
}

function TitleButtons() {
  const view = useView();
  return (
    <div className="traffic">
      <button aria-label="Close" onClick={() => void view.close()} />
      <button aria-label="Minimize" onClick={() => minimize(view)} />
      <button aria-label="Zoom" onClick={() => view.workspace.float(view.id, { x: 0, y: 0, w: 1, h: 1 })} />
    </div>
  );
}

function Dock() {
  const ws = useWorkspace();
  const hidden = useWorkspaceSelector((s) => s.hidden);
  return (
    <nav className="dock">
      <button onClick={() => ws.open("notes", { placement: "float" })}>Notes</button>
      {hidden.map(({ panelId, views }) => (
        <button key={panelId} className="minimized" onClick={(e) => ws.restore(panelId, { from: e.currentTarget })}>
          {views[0].title}
        </button>
      ))}
    </nav>
  );
}

export function Desktop() {
  return (
    <Workspace theme="dark" floating="stage" navigation="free" storageKey="desktop" version={1}>
      <ViewType id="notes" title="Notes" placement="float" minSize={{ width: 320, height: 240 }} accessory={<TitleButtons />}>
        <NotesApp />
      </ViewType>
      <ViewType id="browser" title="Browser" placement="float" iframe={(v) => String(v.params.url)} accessory={<TitleButtons />} />

      <Stage backdrop={<Wallpaper />} />

      <Workspace.Chrome>
        <Dock />
      </Workspace.Chrome>
    </Workspace>
  );
}
```

Why it works:

- `floating="stage"` puts windows inside the stage, clipped to it, and dropping on the empty stage floats rather than docks.
- `placement="float"` makes every `open()` a new window, cascaded so they don't stack exactly.
- `hide(view.panelId, { toward })` animates a window into the dock; `restore(panelId, { from })` grows it back out.
- `navigation="free"` lets users pinch to zoom around the desktop.
- The *Zoom* button re-floats the window to fill the whole desktop (`float(id, rect)` with fractions of the stage).
- Windows can still be docked side by side against the desktop's edges. To forbid that, add `allow={{ side: false }}`.

Want custom window menus? `panelMenu={false}` removes the built-ins, and each type's `menu` supplies its own.

## An art program

The canvas is the document; tools are palettes. Documents live in the stage and can't leave it; palettes can go anywhere except the stage.

```tsx title="Paint.tsx"
<Workspace theme="medium" floating="stage" navigation="focus" storageKey="paint" version={3}>
  <ViewType<{ file: string }>
    id="canvas"
    title={(v) => v.params.file}
    placement="stage"
    allow={{ side: false, floating: false }}
    gestures="content"
    render={(view) => <CanvasView file={view.params.file} />}
  />
  <ViewType id="tools" title="Tools" singleton allow={{ stage: false }} tabbar="auto" closable={false}>
    <ToolStrip />
  </ViewType>
  <ViewType id="layers" title="Layers" singleton allow={{ stage: false }}><Layers /></ViewType>
  <ViewType id="color" title="Color" singleton allow={{ stage: false }}><ColorPicker /></ViewType>
  <ViewType id="brushes" title="Brushes" singleton allow={{ stage: false }} minSize={{ width: 260, height: 200 }}>
    <Brushes />
  </ViewType>

  <Split weights={[0.35, 5, 1.4]}>
    <View type="tools" id="tools" />
    <Stage backdrop={<Checkerboard />} empty={<NewDocumentPrompt />}>
      <View type="canvas" params={{ file: "Untitled-1.png" }} />
    </Stage>
    <Split axis="y" weights={[1, 1.3]}>
      <Panel>
        <View type="color" id="color" />
        <View type="brushes" id="brushes" />
      </Panel>
      <View type="layers" id="layers" />
    </Split>
  </Split>
</Workspace>
```

Notes:

- Keep app state (the image, the selected tool, the current color) in a store *above* `<Workspace>`. View content keeps React context, so every palette reads the same store no matter where it's docked.
- `tabbar="auto"` hides the tool strip's tab bar while it's alone in its panel, like classic tool palettes.
- The canvas uses its own wheel/pinch for zooming the image. With the default `gestures="content"`, navigation leaves those gestures alone.
- `minSize` on dense palettes keeps them legible — below it they scale down instead of reflowing.
- Explicit ids on palettes mean `reset()` animates them back rather than recreating them.

## An IDE

```tsx title="IDE.tsx"
import { useState } from "react";
import {
  Workspace, WorkspaceProvider, ViewType, Split, Stage, Panel, View,
  useView, useViewBadge, useCloseGuard, useOptionalWorkspace,
} from "@danfessler/trellis-react";

function Editor() {
  const view = useView<{ path: string }>();
  const [dirty, setDirty] = useState(false);
  useViewBadge(dirty ? "●" : null);
  useCloseGuard(() => !dirty || confirm(`Close ${view.params.path} without saving?`));
  return <CodeEditor path={view.params.path} onDirtyChange={setDirty} />;
}

export function IDE() {
  return (
    <WorkspaceProvider>
      <MenuBar />
      <Workspace theme="dark" navigation="free" storageKey="ide" version={2}>
        <ViewType id="explorer" title="Explorer" singleton allow={{ stage: false }}><Explorer /></ViewType>
        <ViewType id="search" title="Search" singleton allow={{ stage: false }}><Search /></ViewType>
        <ViewType<{ path: string }> id="file" title={(v) => v.params.path.split("/").pop()!} placement="stage">
          <Editor />
        </ViewType>
        <ViewType id="terminal" title="Terminal" allow={{ stage: false }} placement={{ beside: "stage", edge: "bottom", share: 0.3 }}>
          <Terminal />
        </ViewType>
        <ViewType<{ url: string }> id="preview" title="Preview" iframe={(v) => v.params.url} />

        <Split weights={[1, 4]}>
          <Panel>
            <View type="explorer" id="explorer" />
            <View type="search" id="search" />
          </Panel>
          <Split axis="y" weights={[3, 1]}>
            <Stage empty={<Welcome />}>
              <View type="file" params={{ path: "src/main.ts" }} />
            </Stage>
            <View type="terminal" id="terminal" />
          </Split>
        </Split>
      </Workspace>
    </WorkspaceProvider>
  );
}

function MenuBar() {
  const ws = useOptionalWorkspace();
  return (
    <header>
      <button onClick={() => ws?.open("file", { params: { path: "untitled.ts" } })}>New file</button>
      <button onClick={() => ws?.open("terminal")}>New terminal</button>
      <button onClick={() => ws?.open("preview", { params: { url: "http://localhost:5173" }, placement: "float", reuse: "type" })}>
        Preview
      </button>
      <button onClick={() => ws?.reset()}>Reset layout</button>
    </header>
  );
}
```

Opening files from the explorer:

```ts
ws.open("file", { params: { path }, reuse: "params" }); // focus it if already open
```

The preview is an iframe: dev servers keep their HMR connection and scroll position through every rearrangement, and `reuse: "type"` keeps it to one.

## A dashboard

Dashboards have no stage — every widget is equal — and usually want a flat look.

```ts title="dashboard.ts"
import { createWorkspace, layout as L } from "@danfessler/trellis";

const chart = (metric: string) => L.view("chart", { id: `chart-${metric}`, params: { metric } });

const ws = createWorkspace(document.getElementById("dashboard")!, {
  theme: "light",
  floating: false,
  navigation: "focus",
  persist: { key: "ops-dashboard", version: 1 },
  tokens: { "--trellis-gap": "12px", "--trellis-radius": "14px" },
  types: {
    chart: {
      title: (v) => String(v.params.metric),
      mount(element, view) {
        const c = new Chart(element, String(view.params.metric));
        const off = view.on("resize", ({ width, height }) => c.resize(width, height));
        const offVis = view.on("visibility", (visible) => c.setLive(visible));
        return () => {
          off();
          offVis();
          c.destroy();
        };
      },
    },
    logs: { title: "Logs", tabbar: "auto", mount: (el) => mountLogs(el) },
  },
  defaultLayout: L.column(
    [L.row([chart("requests"), chart("latency"), chart("errors")]), L.row([L.view("logs"), chart("saturation")], [2, 1])],
    [1, 1.2],
  ),
});
```

- `floating: false` keeps the grid tidy; users can still rearrange by dragging.
- Double-clicking a chart's tab bar maximizes it for a closer look; <kbd>Esc</kbd> returns.
- `visibility` pauses charts hidden behind another tab or scrolled out of a maximized view.
- `resize` fires once after motion settles — charts re-render once per layout change, not per frame.
