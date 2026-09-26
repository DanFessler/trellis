---
title: Quick start (React)
description: Build a small editor workspace with @danfessler/trellis-react.
section: Getting started
order: 3
nav: Quick start — React
---

# Quick start (React)

This guide builds a small editor: a file list on the left, documents in a stage, and a preview. It takes about five minutes.

## 1. Render a workspace

`<Workspace>` fills its parent, so give the parent a height.

```tsx title="App.tsx"
import { Workspace } from "@danfessler/trellis-react";
import "@danfessler/trellis/style.css";

export function App() {
  return (
    <div style={{ height: "100vh" }}>
      <Workspace theme="dark">{/* view types and layout go here */}</Workspace>
    </div>
  );
}
```

## 2. Register view types

A **view type** is a kind of content. Declare one with `<ViewType>`; its children render once for every view of that type.

```tsx
<Workspace theme="dark">
  <ViewType id="files" title="Files" singleton allow={{ stage: false }}>
    <FileList />
  </ViewType>

  <ViewType id="doc" title={(view) => String(view.params.path)} placement="stage">
    <Editor />
  </ViewType>

  <ViewType id="preview" title="Preview" iframe={(view) => String(view.params.url)} />
</Workspace>
```

- `singleton` — at most one Files view exists; opening it again focuses the existing one.
- `allow={{ stage: false }}` — users cannot drop Files into the stage.
- `placement="stage"` — new documents open in the stage.
- `iframe` — Trellis renders the iframe itself. It keeps its state across every move.

`<ViewType>` renders nothing by itself. See the [React API](./react-api.md#viewtype) for every prop.

## 3. Describe the initial layout

Layout components describe the **initial** layout. They are compiled once when the workspace mounts; after that, the user owns the layout.

```tsx
<Workspace theme="dark">
  {/* …view types… */}
  <Split weights={[1, 4]}>
    <View type="files" />
    <Stage empty={<p>Open a file from the list</p>}>
      <Panel>
        <View type="doc" params={{ path: "README.md" }} />
        <View type="doc" params={{ path: "src/index.ts" }} />
      </Panel>
    </Stage>
  </Split>
</Workspace>
```

- `<Split>` is a weighted row (`axis="x"`, the default) or column (`axis="y"`).
- `<Panel>` is a tab group. A bare `<View>` gets a panel of its own.
- `<Stage>` is the primary region. `empty` renders when it has no panels.

## 4. Read view state in content

Inside view content, `useView()` returns the view's handle and its current state. It re-renders when presentation state settles — never on every animation frame.

```tsx title="Editor.tsx"
import { useState } from "react";
import { useView, useViewBadge, useCloseGuard } from "@danfessler/trellis-react";

export function Editor() {
  const view = useView<{ path: string }>();
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);

  useViewBadge(dirty ? "●" : null);
  useCloseGuard(() => !dirty || confirm(`Discard changes to ${view.params.path}?`));

  return (
    <textarea
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        setDirty(true);
      }}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
```

`view.size`, `view.visible`, `view.focused`, `view.placement` and more are available — see [`useView`](./react-api.md#useview).

## 5. Open views

Anything rendered inside the workspace (view content, `Workspace.Chrome`) can call `useWorkspace()` to get the imperative handle.

```tsx title="FileList.tsx"
import { useWorkspace } from "@danfessler/trellis-react";

export function FileList() {
  const ws = useWorkspace();
  return (
    <ul>
      {files.map((path) => (
        <li key={path} onDoubleClick={() => ws.open("doc", { params: { path }, reuse: "params" })}>
          {path}
        </li>
      ))}
    </ul>
  );
}
```

`reuse: "params"` focuses an already-open view with the same params instead of opening a duplicate. See [Opening views](./opening-views.md).

For UI outside the workspace — a toolbar, a menu bar — wrap both in `<WorkspaceProvider>`, or use a ref:

```tsx
import { useRef } from "react";
import { Workspace, type WorkspaceHandle } from "@danfessler/trellis-react";

function Shell() {
  const ws = useRef<WorkspaceHandle>(null);
  return (
    <>
      <button onClick={() => ws.current?.open("preview", { params: { url: "/" }, placement: "float" })}>Preview</button>
      <Workspace ref={ws}>{/* … */}</Workspace>
    </>
  );
}
```

## 6. Remember the layout

Add `storageKey` and the layout is saved to `localStorage` and restored on reload. Bump `version` whenever you change the default layout in a way that should reset saved ones.

```tsx
<Workspace theme="dark" storageKey="my-editor" version={1}>
```

## The whole thing

```tsx title="App.tsx"
import { Workspace, ViewType, Split, Stage, Panel, View } from "@danfessler/trellis-react";
import "@danfessler/trellis/style.css";
import { Editor } from "./Editor";
import { FileList } from "./FileList";

export function App() {
  return (
    <div style={{ height: "100vh" }}>
      <Workspace theme="dark" navigation="free" storageKey="my-editor" version={1}>
        <ViewType id="files" title="Files" singleton allow={{ stage: false }}>
          <FileList />
        </ViewType>
        <ViewType id="doc" title={(view) => String(view.params.path)} placement="stage">
          <Editor />
        </ViewType>
        <ViewType id="preview" title="Preview" iframe={(view) => String(view.params.url)} />

        <Split weights={[1, 4]}>
          <View type="files" />
          <Stage empty={<p>Open a file from the list</p>}>
            <Panel>
              <View type="doc" params={{ path: "README.md" }} />
            </Panel>
          </Stage>
        </Split>
      </Workspace>
    </div>
  );
}
```

## Next

- [Concepts](./concepts.md) explains each building block.
- [Layout](./layout.md) covers JSX layouts, the `layout` builder and the document format.
- [Theming](./theming.md) makes it look like your product.
