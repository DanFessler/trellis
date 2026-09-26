---
title: Quick start (vanilla)
description: Build a workspace with the framework-agnostic core and plain DOM.
section: Getting started
order: 4
nav: Quick start — Vanilla
---

# Quick start (vanilla)

The core package works with plain DOM, or with any framework that can render into an element. This guide builds a small editor with `createWorkspace()`.

## 1. A host element

```html title="index.html"
<body style="margin: 0">
  <div id="app" style="height: 100vh"></div>
  <script type="module" src="/main.ts"></script>
</body>
```

## 2. Create the workspace

```ts title="main.ts"
import { createWorkspace, layout as L } from "@danfessler/trellis";
import "@danfessler/trellis/style.css";

const ws = createWorkspace(document.getElementById("app")!, {
  theme: "dark",
  types: {
    files: {
      title: "Files",
      singleton: true,
      allow: { stage: false },
      mount(element) {
        element.innerHTML = `<ul class="files"><li>README.md</li><li>main.ts</li></ul>`;
      },
    },
    doc: {
      title: (view) => String(view.params.path),
      placement: "stage",
      mount(element, view) {
        const textarea = document.createElement("textarea");
        textarea.value = `// ${view.params.path}`;
        textarea.style.cssText = "width:100%;height:100%;border:0;resize:none";
        element.append(textarea);
        return () => textarea.remove(); // cleanup when the view closes
      },
    },
    preview: { title: "Preview", iframe: (view) => String(view.params.url) },
  },
  defaultLayout: L.row(
    [L.view("files"), L.stage(L.panel(L.view("doc", { params: { path: "README.md" } })))],
    [1, 4],
  ),
});
```

### How `mount` works

`mount(element, view)` is called **once per view**, when the view is created. `element` is the view's content container; it never moves in the DOM, so whatever you put in it survives docking, tabbing, floating and hiding. Return a function to clean up when the view closes.

Use the `view` handle to react to presentation changes:

```ts
mount(element, view) {
  const chart = createChart(element);
  const offResize = view.on("resize", ({ width, height }) => chart.resize(width, height));
  const offVisible = view.on("visibility", (visible) => (visible ? chart.resume() : chart.pause()));
  return () => {
    offResize();
    offVisible();
    chart.destroy();
  };
}
```

`resize` fires once motion settles, not on every animation frame. See [ViewHandle](./core-api.md#viewhandle).

## 3. Describe the layout with the builder

`layout` (imported here as `L`) builds the initial layout:

| Call | Result |
| --- | --- |
| `L.view(type, { id?, params?, title? })` | One view. On its own, it gets its own panel. |
| `L.panel(...views)` / `L.panel({ id?, selected? }, ...views)` | A tab group. |
| `L.row(children, weights?)` / `L.column(children, weights?)` | A split along x or y. |
| `L.split(axis, children, { weights?, id? })` | The general form of row/column. |
| `L.stage(child?, { id? })` | The primary region. At most one per layout. |

See [Layout](./layout.md) for details.

## 4. Open, close and listen

```ts
// Open a document in the stage, or focus it if the same file is already open.
document.querySelector(".files")!.addEventListener("dblclick", (e) => {
  const path = (e.target as HTMLElement).textContent!;
  ws.open("doc", { params: { path }, reuse: "params" });
});

// Open a floating preview.
ws.open("preview", { params: { url: "https://example.com" }, placement: "float" });

// React to changes.
ws.on("open", (view) => console.log("opened", view.title));
ws.on("focus", (viewId) => console.log("focused", viewId));
ws.on("change", (doc) => console.log("layout changed", doc));
```

## 5. Persist the layout

```ts
createWorkspace(el, {
  // …
  persist: { key: "my-editor", version: 1 },
});
```

The document is saved to `localStorage` whenever the layout changes and restored on the next load. A different `version` discards the saved layout and uses `defaultLayout`.

## 6. Tear down

```ts
ws.destroy();
```

`destroy()` runs every view's cleanup, removes the DOM and detaches all listeners.

## Using another framework

Any framework that can render into an element works with `mount`. For example, with Vue:

```ts
import { createApp } from "vue";

types: {
  doc: {
    mount(element, view) {
      const app = createApp(Editor, { path: view.params.path });
      app.mount(element);
      return () => app.unmount();
    },
  },
}
```

## Next

- [Concepts](./concepts.md)
- [Core API](./core-api.md)
