---
title: Opening views and placement
description: How open() places a view, every placement option, reuse and singletons, and how allow rules affect where views land.
section: Guides
order: 12
nav: Opening views
---

# Opening views and placement

`open()` creates a view and places it in the layout. If a matching view already exists, it reveals that one instead.

```ts
const info = ws.open("doc", {
  params: { path: "src/main.ts" },
  placement: "stage",
  reuse: "params",
});
```

In React, get `ws` from `useWorkspace()` inside the workspace or from a `ref` outside it.

## Options

| Option      | Type                                                | Default                                | Meaning                                                                                                                                   |
| ----------- | --------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `params`    | `object`                                            | `{}`                                   | Serializable data for the view. Any plain object works, and interface types are fine.                                                     |
| `id`        | `string`                                            | generated                              | A specific view id. If a view with this id already exists, `open()` reveals it.                                                           |
| `title`     | `string`                                            | from the type                          | A title override stored in the document.                                                                                                  |
| `placement` | `Placement`                                         | see below                              | Where the new view goes.                                                                                                                  |
| `reuse`     | `"none" \| "type" \| "params" \| (view) => boolean` | `"type"` for singletons, else `"none"` | Reveal a matching existing view instead of opening a new one.                                                                             |
| `focus`     | `boolean`                                           | `true`                                 | Focus the view (and move keyboard focus into it).                                                                                         |
| `from`      | `Element \| Rect`                                   |                                        | Animate the new panel out of this element or rect, such as a launcher or toolbar button. A `Rect` is in pixels relative to the workspace. |

Focusing raises a floating panel to the front. Keyboard focus moves into the content one frame after `open()` returns, so content rendered by an adapter (React) has mounted first. See [Keyboard and accessibility](./keyboard-accessibility.md#tabs).

`open()` returns a `ViewInfo` for the new or revealed view: `{ id, type, params, title, panelId, placement, selected }`. It throws if the type isn't registered.

## Placements

| Placement                      | Behaviour                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"stage"`                      | Into the stage. In an empty stage, the view fills it. Otherwise it becomes a tab in the focused stage panel (or the last focused one, or the first). Without a stage, it becomes a tab in the focused panel. |
| `"tab"`                        | A new tab in the focused panel. Without a focused panel, it falls back to the stage.                                                                                                                         |
| `"side"`                       | Docked beside the stage on the right. Without a stage, it docks beside the whole layout. If the workspace is empty, it becomes the whole layout.                                                             |
| `"float"`                      | A new floating panel on the workspace's floating layer, cascaded so successive floats don't stack exactly.                                                                                                   |
| `{ float: rect, layer? }`      | A floating panel at `rect` (fractions 0 to 1 of the layer). `layer` defaults to the workspace's `floating` option.                                                                                           |
| `{ beside: id, edge, share? }` | Docked against a panel, split or the stage, on `edge` (`"left" \| "right" \| "top" \| "bottom"`). `share` is the fraction of that node's space the new panel takes.                                          |
| `{ into: id, index? }`         | A tab in a specific panel, at `index`. If `id` is the stage's id, the view goes into the stage.                                                                                                              |

```ts
ws.open("terminal", { placement: { beside: "stage", edge: "bottom", share: 0.3 } });
ws.open("inspector", { placement: { into: "panel-tools", index: 0 } });
ws.open("picker", { placement: { float: { x: 0.6, y: 0.1, w: 0.3, h: 0.4 } } });
```

### Launching from a button

Pass `from` to make the new panel grow out of whatever launched it:

```tsx
<button onClick={(e) => ws.open("notes", { placement: "float", from: e.currentTarget })}>Notes</button>
```

`from` only animates a newly created panel. It's ignored when `open()` reveals an existing view through `reuse`, a singleton or an existing `id`.

> **Note** The stage's id is `"stage"` unless you gave it another one (`<Stage id>` / `L.stage(child, { id })`). A `{ beside }` target that doesn't exist falls back to docking beside the whole layout.

### The default placement

When you don't pass `placement`, Trellis uses the first of these that applies:

1. The type's own `placement` rule, if it has one.
2. `"stage"`, if the layout has a stage.
3. `"tab"`, if a panel is focused.
4. `"side"`.

### When a placement isn't allowed

A type's `allow` rules apply to `open()` too. If the requested placement would put the view somewhere it isn't allowed, Trellis tries `"side"` next. If that isn't allowed either, the view floats (when floating is enabled). As a last resort, Trellis docks it beside the layout.

```tsx
// Tools can't enter the stage. Opening one "into the stage" docks it at the side.
<ViewType id="tools" title="Tools" allow={{ stage: false }} />
```

## Reuse and singletons

`reuse` finds an existing view of the same type and reveals it instead of opening another. It takes one of these values:

- `"type"` matches any existing view of this type.
- `"params"` matches a view of this type with deep-equal params. Key order doesn't matter.
- A function receives each candidate's `ViewInfo` and returns `true` to reuse it.

```ts
ws.open("doc", { params: { path }, reuse: "params" });
ws.open("doc", { params: { path }, reuse: (v) => v.params.path === path });
```

A type with `singleton: true` defaults to `reuse: "type"`, so there is at most one. Revealing a view restores its panel if it was hidden, selects its tab and raises it if it's floating. If the camera frames something that doesn't contain the view, the framing widens to show it. For a window floating in the stage, that brings the stage into frame.

## Moving existing views

| Method                                | Does                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ws.focus(id)`                        | Reveal and focus a view, or the selected view of a panel.                                                                                       |
| `ws.select(viewId)`                   | Select a view's tab without moving focus.                                                                                                       |
| `ws.float(panelOrViewId, rect?)`      | Float a panel, or tear a single view out of its panel and float it.                                                                             |
| `ws.dock(panelOrViewId, target)`      | Dock a panel or view: `"stage"`, `{ beside, edge, share? }` or `{ into, index? }`.                                                              |
| `ws.toggleDock(panelOrViewId)`        | Dock a floating panel beside the stage, or float a docked one back at its remembered size. See [Floating](./floating.md#dock-beside-the-stage). |
| `ws.hide(panelOrViewId, { toward? })` | Hide a panel, or a single tab. See [Hiding](./hiding.md).                                                                                       |
| `ws.close(viewId, { force? })`        | Close a view. Resolves `false` if a close guard vetoed it.                                                                                      |

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

> **Note** For iframe views, options derived from params (`iframe: (v) => v.params.url`) reload the iframe when they change. This is by design. A params change that leaves the computed `src`, `srcdoc` and other options the same doesn't reload it. For a live preview that should keep its state, keep the URL fixed and send updates with `postMessage`. See [A live preview iframe](./recipes.md#a-live-preview-iframe).

A type's `title` can be a function of the view, such as `title: (view) => String(view.params.path)`. Trellis re-evaluates it when params change. `setTitle()` stores an explicit title in the document, which takes precedence.

## Events

```ts
ws.on("open", (view) => {}); // a view was added
ws.on("close", (view) => {}); // a view was removed
ws.on("focus", (viewId) => {}); // focus moved (null when nothing is focused)
```

In React, use the `onOpen`, `onClose` and `onFocus` props on `<Workspace>`.
