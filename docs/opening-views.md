---
title: Opening views & placement
description: open(), every placement option, reuse and singletons, and how allow rules shape where views land.
section: Guides
order: 12
nav: Opening views
---

# Opening views & placement

`open()` creates a view — or reveals an existing one — and places it in the layout.

```ts
const info = ws.open("doc", {
  params: { path: "src/main.ts" },
  placement: "stage",
  reuse: "params",
});
```

In React, get `ws` from `useWorkspace()` inside the workspace or from a `ref` outside it.

## Options

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `params` | `object` | `{}` | Serializable data for the view. Any plain object; interface types are fine. |
| `id` | `string` | generated | A specific view id. If a view with this id already exists, it is revealed instead. |
| `title` | `string` | from the type | A title override stored in the document. |
| `placement` | `Placement` | see below | Where the new view goes. |
| `reuse` | `"none" \| "type" \| "params" \| (view) => boolean` | `"type"` for singletons, else `"none"` | Reveal a matching existing view instead of opening a new one. |
| `focus` | `boolean` | `true` | Focus the view (and move keyboard focus into it). |

`open()` returns a `ViewInfo` — `{ id, type, params, title, panelId, placement, selected }` — for the new or revealed view. It throws if the type isn't registered.

## Placements

| Placement | Behaviour |
| --- | --- |
| `"stage"` | Into the stage. If the stage is empty the view fills it; otherwise it becomes a tab in the focused stage panel (or the last focused one, or the first). Without a stage, it becomes a tab in the focused panel. |
| `"tab"` | A new tab in the focused panel. Without a focused panel, falls back to the stage. |
| `"side"` | Docked outside the stage — beside the stage on the right, or beside the whole layout if there is no stage. If the workspace is empty, it becomes the whole layout. |
| `"float"` | A new floating panel on the workspace's floating layer, cascaded so successive floats don't stack exactly. |
| `{ float: rect, layer? }` | A floating panel at `rect` (fractions 0–1 of the layer). `layer` defaults to the workspace's `floating` option. |
| `{ beside: id, edge, share? }` | Docked against a panel, split or the stage, on `edge` (`"left" \| "right" \| "top" \| "bottom"`). `share` is the fraction of that node's space the new panel takes. |
| `{ into: id, index? }` | A tab in a specific panel, at `index` — or into the stage, if `id` is the stage's id. |

```ts
ws.open("terminal", { placement: { beside: "stage", edge: "bottom", share: 0.3 } });
ws.open("inspector", { placement: { into: "panel-tools", index: 0 } });
ws.open("picker", { placement: { float: { x: 0.6, y: 0.1, w: 0.3, h: 0.4 } } });
```

> **Note** The stage's id is `"stage"` unless you gave it another one (`<Stage id>` / `L.stage(child, { id })`). A `{ beside }` target that doesn't exist falls back to docking beside the whole layout.

### The default placement

When you don't pass `placement`, Trellis uses:

1. the type's own `placement` rule, if it has one;
2. otherwise `"stage"` if the layout has a stage;
3. otherwise `"tab"` if a panel is focused;
4. otherwise `"side"`.

### When a placement isn't allowed

A type's `allow` rules apply to `open()` too. If the requested placement would put the view somewhere it isn't allowed, Trellis tries `"side"` next. If that isn't allowed either, the view floats (when floating is enabled), and as a last resort it is docked beside the layout.

```tsx
// Tools may never enter the stage; opening one "into the stage" docks it at the side.
<ViewType id="tools" title="Tools" allow={{ stage: false }} />
```

## Reuse and singletons

`reuse` finds an existing view of the same type and reveals it instead of opening another:

- `"type"` — any existing view of this type.
- `"params"` — a view of this type with deep-equal params (key order doesn't matter).
- a function — receives each candidate's `ViewInfo`; return `true` to reuse it.

```ts
ws.open("doc", { params: { path }, reuse: "params" });
ws.open("doc", { params: { path }, reuse: (v) => v.params.path === path });
```

A type with `singleton: true` defaults to `reuse: "type"`, so there is at most one. Revealing a view restores its panel if it was hidden, selects its tab, raises it if floating, and — if the workspace is maximized on something else — zooms back out so it is visible.

## Moving existing views

| Method | Does |
| --- | --- |
| `ws.focus(id)` | Reveal and focus a view, or the selected view of a panel. |
| `ws.select(viewId)` | Select a view's tab without moving focus. |
| `ws.float(panelOrViewId, rect?)` | Float a panel, or tear a single view out of its panel and float it. |
| `ws.dock(panelOrViewId, target)` | Dock a panel or view: `"stage"`, `{ beside, edge, share? }` or `{ into, index? }`. |
| `ws.hide(panelOrViewId, { toward? })` | Hide a panel, or a single tab. See [Hiding](./hiding.md). |
| `ws.close(viewId, { force? })` | Close a view. Resolves `false` if a close guard vetoed it. |

```ts
ws.float("color");
ws.dock("color", { beside: "stage", edge: "right", share: 0.25 });
await ws.close("doc-1"); // runs close guards
await ws.close("doc-1", { force: true }); // skips them
```

## Titles, params and badges

```ts
ws.setTitle("doc-1", "notes.md");
ws.setParams("doc-1", { path: "notes.md" }); // shallow merge
ws.view("doc-1")?.setBadge(3);
```

> **Note** For iframe views, a URL derived from params (`iframe: (v) => v.params.url`) reloads the iframe when those params change — by design. For a live preview that should keep its state, keep the URL fixed and send updates with `postMessage` (reach the frame with `view.element.querySelector("iframe")`).

A type's `title` can be a function of the view — `title: (view) => String(view.params.path)` — and is re-evaluated when params change. `setTitle()` stores an explicit title in the document, which takes precedence.

## Events

```ts
ws.on("open", (view) => {}); // a view was added
ws.on("close", (view) => {}); // a view was removed
ws.on("focus", (viewId) => {}); // focus moved (null when nothing is focused)
```

In React, use the `onOpen`, `onClose` and `onFocus` props on `<Workspace>`.
