---
title: Layout
description: Describe initial layouts with JSX or the layout builder, and understand the LayoutDocument format.
section: Guides
order: 11
---

# Layout

There are three ways to describe a layout, and they all end up as the same `LayoutDocument`:

1. **JSX** layout components (React).
2. The **`layout` builder**, compiled with `createDocument()` (any framework).
3. A **`LayoutDocument`** object written or stored directly.

A layout you provide is the *initial* layout. After the workspace mounts, users own it; to change it programmatically, use the imperative API or [`setDocument()`](./persistence.md#controlled-layouts).

## JSX layouts (React)

Place `<Split>`, `<Panel>`, `<View>` and `<Stage>` as children of `<Workspace>`, next to your `<ViewType>` registrations.

```tsx
<Workspace>
  <ViewType id="layers" title="Layers" />
  <ViewType id="doc" title="Document" placement="stage" />
  <ViewType id="color" title="Color" />

  <Split weights={[1, 4, 1]}>
    <View type="layers" />
    <Stage>
      <Panel selected={1}>
        <View type="doc" params={{ name: "a.png" }} />
        <View type="doc" params={{ name: "b.png" }} />
      </Panel>
    </Stage>
    <Split axis="y">
      <View type="color" />
      <View type="layers" id="layers-2" />
    </Split>
  </Split>
</Workspace>
```

| Component | Props | Notes |
| --- | --- | --- |
| `<Split>` | `axis?: "x" \| "y"`, `weights?: number[]`, `id?` | Default axis is `"x"` (a row). Weights are relative. |
| `<Panel>` | `selected?: number`, `id?` | Children must be `<View>`s. `selected` is the index of the initially selected tab. |
| `<View>` | `type`, `params?`, `id?`, `title?` | A bare `<View>` outside a `<Panel>` gets its own panel. |
| `<Stage>` | `backdrop?`, `empty?`, `id?` | At most one. Multiple children are arranged in a row. |

Rules worth knowing:

- Layout components are read **once**, when the workspace mounts. Changing them later has no effect.
- They must be direct children of `<Workspace>` (or of each other). Fragments are fine, but wrapping layout in your own component is not — `<Workspace>` reads its children's element types and won't render your component to find them.
- If there are several top-level layout children, they are placed in a row.
- JSX layout takes precedence over the `defaultLayout` prop, and a persisted or controlled document takes precedence over both.
- JSX cannot declare floating panels. Use a data layout (below) for an initial float.

## The `layout` builder

The builder produces plain `LayoutSpec` objects. It is exported from both packages.

```ts
import { layout as L } from "@danfessler/trellis"; // or "@danfessler/trellis-react"

const spec = L.row(
  [
    L.column([L.view("layers"), L.view("history")], [2, 1]),
    L.stage(L.panel({ selected: 0 }, L.view("doc", { params: { name: "a.png" } }), L.view("doc", { params: { name: "b.png" } }))),
    L.view("color"),
  ],
  [1, 4, 1],
);
```

| Function | Returns |
| --- | --- |
| `L.view(type, { id?, params?, title? })` | `ViewSpec` |
| `L.panel(...views)` or `L.panel({ id?, selected? }, ...views)` | `PanelSpec` |
| `L.row(children, weights?)` | `SplitSpec` on the x axis |
| `L.column(children, weights?)` | `SplitSpec` on the y axis |
| `L.split(axis, children, { weights?, id? })` | `SplitSpec` |
| `L.stage(child?, { id? })` | `StageSpec` |

Pass a spec as `defaultLayout` (core option or React prop). The workspace compiles it when it needs the default.

### `createDocument()` and initial floats

`createDocument(spec, options)` compiles a spec into a `LayoutDocument` yourself. Its options let you add floating panels and a version:

```ts
import { createDocument, layout as L } from "@danfessler/trellis";

const doc = createDocument(
  L.row([L.view("tools"), L.stage(L.view("doc"))], [1, 5]),
  {
    floating: [
      {
        panel: L.view("color"),
        rect: { x: 0.65, y: 0.55, w: 0.3, h: 0.4 }, // fractions of the layer
        layer: "stage", // defaults to "overlay"
      },
    ],
  },
);

createWorkspace(el, { types, floating: "stage", defaultLayout: doc });
```

Float rects are fractions (0–1) of their layer: the stage for `layer: "stage"`, the whole workspace for `"overlay"`.

`createDocument()` throws if a layout contains more than one stage, a stage inside a stage, or two views with the same explicit `id`.

## View ids

Views in a layout get deterministic ids unless you pass `id`: the type name and a counter — `editor-1`, `editor-2`, `layers-1`. Because the default layout always produces the same ids, [`reset()`](./persistence.md#resetting) can keep those views mounted. Give ids to views you want to refer to later — for example to `focus("inspector")` or to target them in a placement — and to singletons you may want to reopen by id.

Panel and split ids work the same way; set them when you want stable targets such as `{ into: "tools" }`.

## The `LayoutDocument` format

```ts
interface LayoutDocument {
  schema: 1;
  version?: string | number; // your layout version
  root: LayoutNode | null; // the docked tree
  floating: FloatingPanel[];
  hidden: HiddenPanel[];
  views: Record<string, ViewRecord>; // every view, by id
  navigation?: { frame?: string[]; framings?: Framing[] };
}

type LayoutNode = SplitNode | PanelNode | StageNode;

interface SplitNode { kind: "split"; id: string; axis: "x" | "y"; weights: number[]; children: LayoutNode[] }
interface PanelNode { kind: "panel"; id: string; views: string[]; selected: string }
interface StageNode { kind: "stage"; id: string; child?: SplitNode | PanelNode }

interface FloatingPanel { panel: PanelNode; rect: Rect; z: number; layer: "stage" | "overlay" }
interface HiddenPanel { panel: PanelNode; restore: RestoreTarget }
interface ViewRecord { type: string; params?: Params; title?: string }
```

A small example:

```json
{
  "schema": 1,
  "root": {
    "kind": "split",
    "id": "split-main",
    "axis": "x",
    "weights": [0.2, 0.8],
    "children": [
      { "kind": "panel", "id": "panel-tools", "views": ["layers"], "selected": "layers" },
      {
        "kind": "stage",
        "id": "stage",
        "child": { "kind": "panel", "id": "panel-docs", "views": ["doc-1"], "selected": "doc-1" }
      }
    ]
  },
  "floating": [],
  "hidden": [],
  "views": {
    "layers": { "type": "layers" },
    "doc-1": { "type": "doc", "params": { "name": "a.png" } }
  }
}
```

Documents that come from storage or from you are **sanitized** before use: unknown fields are ignored, views referenced twice or missing records are dropped, empty panels and splits are removed, and invalid weights are repaired. The core also exports `sanitize(doc)` and `emptyDocument()` if you want to do this yourself.

### Unknown view types

If a document references a type that isn't registered, `onMissingType(type, id)` decides what happens: return `"placeholder"` (the default) to keep the view with an "Unavailable" placeholder, or `"drop"` to remove it.
