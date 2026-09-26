---
title: Recipes
description: Complete patterns — a desktop built from primitives, a live preview iframe, an art program, an IDE and a dashboard.
section: More
order: 40
---

# Recipes

Very different tools, each built from the same handful of primitives. Every recipe is a sketch you can grow; the [examples](/#examples) are full versions.

## A desktop, built from primitives

A desktop environment is a stage with nothing docked in it: the stage _is_ the desktop, windows are floats that live in the stage, and the dock is a row of launchers plus a tray of hidden panels.

```tsx title="Desktop.tsx"
import {
  Workspace,
  ViewType,
  Stage,
  useView,
  useWorkspace,
  useWorkspaceSelector,
} from "@danfessler/trellis-react";

const dock = () => document.querySelector<HTMLElement>(".dock");

function TitleButtons() {
  const view = useView();
  const ws = view.workspace;
  return (
    <div className="traffic">
      <button aria-label="Close" onClick={() => void view.close()} />
      <button aria-label="Minimize" onClick={() => ws.hide(view.panelId, { toward: dock() ?? undefined })} />
      {/* Dock beside the desktop and frame both; click again to float back. */}
      <button aria-label="Zoom" onClick={() => ws.toggleDock(view.panelId)} />
    </div>
  );
}

function Dock() {
  const ws = useWorkspace();
  const hidden = useWorkspaceSelector((s) => s.hidden);
  return (
    <nav className="dock">
      <button onClick={(e) => ws.open("notes", { from: e.currentTarget })}>Notes</button>
      <button
        onClick={(e) => ws.open("browser", { params: { url: "https://example.com" }, from: e.currentTarget })}
      >
        Browser
      </button>
      {hidden.map(({ panelId, views }) => (
        <button
          key={panelId}
          className="minimized"
          onClick={(e) => ws.restore(panelId, { from: e.currentTarget })}
        >
          {views[0].title}
        </button>
      ))}
    </nav>
  );
}

export function Desktop() {
  return (
    <Workspace
      theme="dark"
      floating="stage"
      navigation="free"
      hideToward={() => dock()}
      storageKey="desktop"
      version={1}
    >
      <ViewType
        id="notes"
        title="Notes"
        placement="float"
        minSize={{ width: 320, height: 240 }}
        accessory={<TitleButtons />}
      >
        <NotesApp />
      </ViewType>
      <ViewType
        id="browser"
        title="Browser"
        placement="float"
        iframe={(v) => String(v.params.url)}
        accessory={<TitleButtons />}
      />

      <Stage backdrop={<Wallpaper />} />

      <Workspace.Chrome>
        <Dock />
      </Workspace.Chrome>
    </Workspace>
  );
}
```

Why it works:

- `floating="stage"` puts windows inside the stage, clipped to it. The empty stage is the desktop: dropping in its interior floats a window, and dropping near its edges docks the window beside it.
- `placement="float"` makes every `open()` a new window, cascaded so they don't stack exactly. `from: e.currentTarget` grows each new window out of its dock icon.
- Clicking into a window — or opening or focusing it — raises it to the front.
- The green _Zoom_ button calls `toggleDock(panelId)`: the window docks beside the desktop, along its longer side, and the camera widens to show both. A second click floats it back at the size it had. The panel menu's **Dock beside stage** / **Float** items do the same, and a docked window can then be maximized like any panel.
- `hide(view.panelId, { toward })` animates a window into the dock; `restore(panelId, { from })` grows it back out. `hideToward` sends the panel menu's built-in **Hide** to the dock too.
- `navigation="free"` lets users wheel or pinch to zoom around the desktop; when the gesture ends, the camera snaps to whatever fits best — the desktop, or a window docked beside it. Floating windows belong to the desktop and are never framed on their own: double-clicking a title bar frames the desktop. Content lays out at no less than 480 × 320 unless a type sets `minSize`, like Notes here.
- Windows can still be docked side by side against the desktop's edges. To forbid that, add `allow={{ side: false }}`.
- For windows that draw their own title bar, set `tabbar="overlay"`: the tab bar becomes a transparent drag strip over the content, which gets `--trellis-titlebar-height` and `--trellis-titlebar-inset-end` to lay out around it. The desktop example does this.

Want custom window menus? Each type's `menu` adds its own items, a `panelMenu` function can drop built-ins such as `hide` for every window, and `renderMenu` lets you draw the menu yourself. See [Panel menus](./menus.md).

## A live preview iframe

Previews — a dev server, rendered Markdown, a component playground — are iframes that change often. Changing an iframe view's options reloads it, so pick how updates reach it.

**Keep the URL fixed and send updates with `postMessage`.** The frame loads once and keeps its scroll position and state:

```tsx title="Preview.tsx"
<ViewType
  id="preview"
  title="Preview"
  iframe={{ src: "/preview.html", sandbox: "allow-scripts allow-same-origin" }}
/>
```

```ts
function sendToPreviews(ws: WorkspaceHandle, html: string) {
  for (const { id } of ws.views({ type: "preview" })) {
    const frame = ws.view(id)?.element.querySelector("iframe");
    frame?.contentWindow?.postMessage({ type: "render", html }, location.origin);
  }
}
```

```html title="preview.html"
<script>
  addEventListener("message", (e) => {
    if (e.origin === location.origin && e.data?.type === "render") document.body.innerHTML = e.data.html;
  });
</script>
```

**Or render with `srcdoc`** when a reload per update is fine — occasional updates, or content with no state to keep. Changing `srcdoc` (for example through params) reloads the frame each time, so debounce frequent updates:

```tsx
<ViewType<{ html: string }>
  id="snippet"
  title="Snippet"
  iframe={(v) => ({ srcdoc: v.params.html, sandbox: "allow-scripts" })}
/>
```

```ts
ws.setParams("snippet-1", { html }); // reloads the frame with the new document
```

The iframe is only recreated when the computed options change, so other params can change freely.

### Zoom gestures over iframes

Wheel and pinch events inside an iframe go to the iframe's document and never reach the workspace, so in `navigation="free"` users can't zoom while the pointer is over one — not even with <kbd>Alt</kbd> or `gestures: "workspace"`. To support it, forward the events yourself by re-dispatching a `WheelEvent` on `ws.element`. For a same-origin frame:

```ts
function forwardZoomGestures(ws: WorkspaceHandle, frame: HTMLIFrameElement) {
  frame.addEventListener("load", () => {
    frame.contentWindow?.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return; // plain scrolling stays with the page
        e.preventDefault();
        const box = frame.getBoundingClientRect();
        const scale = box.width / frame.offsetWidth; // the frame may be scaled by navigation or minSize
        ws.element.dispatchEvent(
          new WheelEvent("wheel", {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaMode: e.deltaMode,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            clientX: box.left + e.clientX * scale,
            clientY: box.top + e.clientY * scale,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { passive: false },
    );
  });
}
```

Pinches arrive as wheel events with `ctrlKey` set, so this forwards them too. For a cross-origin frame, have the page `postMessage` its wheel deltas and dispatch the `WheelEvent` from the parent.

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
  <ViewType id="layers" title="Layers" singleton allow={{ stage: false }}>
    <Layers />
  </ViewType>
  <ViewType id="color" title="Color" singleton allow={{ stage: false }}>
    <ColorPicker />
  </ViewType>
  <ViewType
    id="brushes"
    title="Brushes"
    singleton
    allow={{ stage: false }}
    minSize={{ width: 260, height: 200 }}
  >
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

- Keep app state (the image, the selected tool, the current color) in a store _above_ `<Workspace>`. View content keeps React context, so every palette reads the same store no matter where it's docked.
- `tabbar="auto"` hides the tool strip's tab bar while it's alone in its panel, like classic tool palettes.
- The canvas uses its own wheel/pinch for zooming the image. `navigation="focus"` has no workspace gestures, so they all go to the canvas. Under `navigation="free"`, the default `gestures="content"` still leaves plain wheels over content alone, but <kbd>Ctrl</kbd>+wheel (pinch) and <kbd>Alt</kbd>+wheel zoom the workspace.
- `minSize` on dense palettes keeps them legible — below it they scale down instead of reflowing.
- Explicit ids on palettes mean `reset()` animates them back rather than recreating them.

## An IDE

```tsx title="IDE.tsx"
import { useState } from "react";
import {
  Workspace,
  WorkspaceProvider,
  ViewType,
  Split,
  Stage,
  Panel,
  View,
  useView,
  useViewBadge,
  useCloseGuard,
  useOptionalWorkspace,
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
        <ViewType id="explorer" title="Explorer" singleton allow={{ stage: false }}>
          <Explorer />
        </ViewType>
        <ViewType id="search" title="Search" singleton allow={{ stage: false }}>
          <Search />
        </ViewType>
        <ViewType<{ path: string }>
          id="file"
          title={(v) => v.params.path.split("/").pop()!}
          placement="stage"
        >
          <Editor />
        </ViewType>
        <ViewType
          id="terminal"
          title="Terminal"
          allow={{ stage: false }}
          placement={{ beside: "stage", edge: "bottom", share: 0.3 }}
        >
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
      <button
        onClick={() =>
          ws?.open("preview", { params: { url: "http://localhost:5173" }, placement: "float", reuse: "type" })
        }
      >
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
    [
      L.row([chart("requests"), chart("latency"), chart("errors")]),
      L.row([L.view("logs"), chart("saturation")], [2, 1]),
    ],
    [1, 1.2],
  ),
});
```

- `floating: false` keeps the grid tidy; users can still rearrange by dragging.
- Double-clicking a chart's tab bar maximizes it for a closer look; double-clicking again restores the previous framing, and <kbd>Esc</kbd> steps out one level.
- `visibility` pauses charts hidden behind another tab or scrolled out of a maximized view.
- `resize` fires once after motion settles — charts re-render once per layout change, not per frame.
