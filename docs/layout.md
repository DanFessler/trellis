---
title: Layout
description: Describe initial layouts with JSX or the layout builder, and understand the LayoutDocument format.
section: Guides
order: 11
---

# Layout

You can describe a layout in three ways, and each one ends up as the same `LayoutDocument`:

- JSX layout components, in React.
- The `layout` builder, compiled with `createDocument()`, in any framework.
- A `LayoutDocument` object that you write or store directly.

A layout you provide is the _initial_ layout. After the workspace mounts, users own it. To change it from code, use the imperative API or [`setDocument()`](./persistence.md#controlled-layouts-react).

## JSX layouts (React)

Place `<Split>`, `<Panel>`, `<View>`, `<Stage>` and `<Floating>` as children of `<Workspace>`, next to your `<ViewType>` registrations:

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

| Component    | Props                                            | Notes                                                                                                 |
| ------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `<Split>`    | `axis?: "x" \| "y"`, `weights?: number[]`, `id?` | Default axis is `"x"` (a row). Weights are relative.                                                  |
| `<Panel>`    | `selected?: number`, `id?`                       | Children must be `<View>`s. `selected` is the index of the initially selected tab.                    |
| `<View>`     | `type`, `params?`, `id?`, `title?`               | A bare `<View>` outside a `<Panel>` gets its own panel.                                               |
| `<Stage>`    | `backdrop?`, `empty?`, `id?`                     | At most one. Multiple children are arranged in a row.                                                 |
| `<Floating>` | `rect`, `layer?`                                 | An initial floating panel. Children: one `<Panel>` or `<View>`. See [below](#floating-panels-in-jsx). |

JSX layout follows these rules:

- Layout components are read once, when the workspace mounts. Changing them later has no effect.
- They must be direct children of `<Workspace>` or of each other. Fragments work. Your own wrapper components don't, because `<Workspace>` reads its children's element types and won't render your component to find them.
- If there are several top-level layout children, they are placed in a row.
- JSX layout takes precedence over the `defaultLayout` prop, and a persisted or controlled document takes precedence over both.
- `<Workspace.Backdrop>` and `<Workspace.StageEmpty>` fill the stage's slots when the stage comes from a data layout rather than a JSX `<Stage>`.

### Floating panels in JSX

`<Floating>` wraps a `<Panel>` or a bare `<View>` and floats it in the initial layout. `rect` is in fractions of the layer, from 0 to 1. `layer` is `"stage"` or `"overlay"` (the default):

```tsx
<Workspace floating="stage">
  <ViewType id="doc" title="Document" />
  <ViewType id="color" title="Color" />
  <ViewType id="swatches" title="Swatches" />

  <Stage>
    <View type="doc" />
  </Stage>
  <Floating rect={{ x: 0.65, y: 0.55, w: 0.3, h: 0.4 }} layer="stage">
    <Panel>
      <View type="color" id="color" />
      <View type="swatches" id="swatches" />
    </Panel>
  </Floating>
</Workspace>
```

`<Floating>` counts as JSX layout. A workspace whose only layout children are `<Floating>` starts with those floats and no docked layout, and ignores `defaultLayout`.

## The `layout` builder

The builder produces plain `LayoutSpec` objects. Both packages export it:

```ts
import { layout as L } from "@danfessler/trellis"; // or "@danfessler/trellis-react"

const spec = L.row(
  [
    L.column([L.view("layers"), L.view("history")], [2, 1]),
    L.stage(
      L.panel(
        { selected: 0 },
        L.view("doc", { params: { name: "a.png" } }),
        L.view("doc", { params: { name: "b.png" } }),
      ),
    ),
    L.view("color"),
  ],
  [1, 4, 1],
);
```

| Function                                                       | Returns                   |
| -------------------------------------------------------------- | ------------------------- |
| `L.view(type, { id?, params?, title? })`                       | `ViewSpec`                |
| `L.panel(...views)` or `L.panel({ id?, selected? }, ...views)` | `PanelSpec`               |
| `L.row(children, weights?)`                                    | `SplitSpec` on the x axis |
| `L.column(children, weights?)`                                 | `SplitSpec` on the y axis |
| `L.split(axis, children, { weights?, id? })`                   | `SplitSpec`               |
| `L.stage(child?, { id? })`                                     | `StageSpec`               |

Pass a spec as `defaultLayout` (core option or React prop). The workspace compiles it when it needs the default.

### `createDocument()` and initial floats

To compile a spec into a `LayoutDocument` yourself, call `createDocument(spec, options)`. Its options let you add floating panels and a version:

```ts
import { createDocument, layout as L } from "@danfessler/trellis";

const doc = createDocument(L.row([L.view("tools"), L.stage(L.view("doc"))], [1, 5]), {
  floating: [
    {
      panel: L.view("color"),
      rect: { x: 0.65, y: 0.55, w: 0.3, h: 0.4 }, // fractions of the layer
      layer: "stage", // defaults to "overlay"
    },
  ],
});

createWorkspace(el, { types, floating: "stage", defaultLayout: doc });
```

Float rects are fractions of their layer, from 0 to 1. The layer is the stage for `layer: "stage"` and the whole workspace for `"overlay"`.

`createDocument()` throws if a layout contains more than one stage, a stage inside a stage, or two views with the same explicit `id`.

## View ids

Unless you pass `id`, views in a layout get deterministic ids made of the type name and a counter, such as `editor-1` and `editor-2`. The default layout produces the same ids each time, so [`reset()`](./persistence.md#resetting) can keep those views mounted.

Give ids to views you want to refer to later, for example to call `focus("inspector")` or to target them in a placement. Singletons you may want to reopen by id need one too.

Panel and split ids work the same way. Set them when you want stable targets such as `{ into: "tools" }`.

## The `LayoutDocument` format

This is the full shape of a document:

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

interface SplitNode {
  kind: "split";
  id: string;
  axis: "x" | "y";
  weights: number[];
  children: LayoutNode[];
}
interface PanelNode {
  kind: "panel";
  id: string;
  views: string[];
  selected: string;
}
interface StageNode {
  kind: "stage";
  id: string;
  child?: SplitNode | PanelNode;
}

interface FloatingPanel {
  panel: PanelNode;
  rect: Rect;
  z: number;
  layer: "stage" | "overlay";
}
interface HiddenPanel {
  panel: PanelNode;
  restore: RestoreTarget;
}
interface ViewRecord {
  type: string;
  params?: Params;
  title?: string;
}
interface Framing {
  id: string;
  name: string;
  frame: string[]; // the panel ids it showed (or the empty stage's id)
}
```

`navigation.frame` and each framing's `frame` store the views a framing showed, as panel ids, and not a node. On load, the camera frames the smallest node or sibling range that holds the ones that still exist. See [Navigation](./navigation.md#saved-framings).

Here's a small document:

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

Trellis sanitizes documents from storage or from you before using them. It ignores unknown fields and drops views that are referenced twice or have no record. It also removes empty panels and splits, and repairs invalid weights. To do this yourself, the core exports `sanitize(doc)` and `emptyDocument()`.

### Unknown view types

If a document references a type that isn't registered, `onMissingType(type, id)` decides what happens. Return `"placeholder"` (the default) to keep the view with an "Unavailable" placeholder, or `"drop"` to remove it.
