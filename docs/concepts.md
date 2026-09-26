---
title: Concepts
description: View types, views, panels, splits, the stage, floating, navigation and hiding.
section: Guides
order: 10
---

# Concepts

A Trellis workspace is built from a handful of pieces. Once these click, the rest of the API follows.

## View types

A **view type** is a registered kind of content — `"layers"`, `"document"`, `"terminal"`. You register types when you create the workspace (`types` in the core, `<ViewType>` in React). A type says how to render its content and carries **rules**:

| Rule | Meaning |
| --- | --- |
| `placement` | Where `open()` puts a new view of this type unless the caller says otherwise. |
| `allow` | `{ stage?, side?, floating? }` — regions users may drop it into. Everything is allowed by default. |
| `singleton` | At most one instance. `open()` focuses the existing one. |
| `closable` | `false` hides the close button and ignores close shortcuts. |
| `minSize` | `{ width, height }` — content lays out at no less than this size and is visually scaled down below it. |
| `tabbar` | `"always"` (default), `"auto"` — hide the tab bar while the view is alone in its panel — or `"never"`. |
| `gestures` | `"workspace"` lets navigation gestures start over this view's content. See [Navigation](./navigation.md#gesture-ownership). |

A type renders content in one of three ways: a `mount(element, view)` function (core), an `iframe` URL, or — with an adapter — framework components (`children` or `render` in React).

## Views

A **view** is one instance of a type, shown as a tab. Each view has:

- a stable `id` (generated, or chosen by you),
- serializable `params` — the data it needs, such as `{ path: "src/index.ts" }`,
- an optional `title` override.

Content for a view is mounted **once**, into a container that never moves in the DOM. Docking, tabbing, floating, hiding and zooming reposition that container; they never remount it. This is why iframes, canvases and React state survive every move.

## Panels

A **panel** is a tab group of one or more views, with a tab bar and a menu. Panels are what users drag, dock, float and maximize. Dragging a tab out of a panel creates a new panel for that view; dragging a panel's empty tab bar area moves the whole group.

## Splits

A **split** arranges children in a weighted row (`axis: "x"`) or column (`axis: "y"`). Weights are relative: `[1, 3]` gives the second child three times the space. Users resize with the dividers between children; double-clicking a divider evens out the two neighbours.

Splits are normalized automatically — a split with one child collapses into that child, and a split nested directly inside a split on the same axis is flattened.

## The stage

The **stage** is an optional primary region — the place documents live in an art program or IDE. A layout has at most one.

- It is the default destination for `open()` when a stage exists and the type has no `placement`.
- It never collapses. When its last panel closes, it stays and shows its **empty** slot.
- It has a **backdrop** slot rendered behind its panels, for a canvas, wallpaper or grid.
- With `floating: "stage"`, floating panels live inside the stage and are clipped to it.
- A thin band just inside its edge docks a panel beside the whole stage.

Views whose type sets `allow: { stage: false }` can never be dropped into the stage — tool palettes, for example.

Without a stage, the workspace is a plain docking layout; everything works the same.

## Regions

Every panel is in one of three regions, and `allow` rules refer to them:

| Region | Where |
| --- | --- |
| `stage` | Inside the stage. |
| `side` | Docked anywhere outside the stage. |
| `floating` | A floating panel. |

A view's `placement` state (`view.placement`) reports `"stage"`, `"docked"` (side), `"floating"` or `"hidden"`.

## Floating

**Floating** panels hover above the docked layout and can be moved and resized freely. The workspace's `floating` option picks their layer:

- `"overlay"` (default) — floats sit above everything and are positioned relative to the whole workspace. They stay put during navigation.
- `"stage"` — floats live inside the stage, are clipped to it and move with it.
- `false` — floating is disabled.

See [Floating panels](./floating.md).

## Navigation

**Navigation** animates the workspace's camera to frame part of the layout. The `navigation` option:

- `"focus"` (default) — double-click a tab bar, use the panel menu's *Maximize*, or press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>↩</kbd> to zoom one panel to fill the workspace. <kbd>Esc</kbd> goes back.
- `"free"` — everything in focus mode, plus pinch or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+scroll to zoom, and scroll to pan while zoomed. When the gesture ends, the camera snaps to the best-fitting panel or split.
- `false` — no navigation.

Navigation has history (back/forward) and saved **framings**. See [Navigation & maximize](./navigation.md).

## Hiding

Any panel — or a single tab — can be **hidden**: it leaves the layout but its views stay alive (still mounted, still in the document), and Trellis remembers where it was. `restore()` puts it back. The snapshot's `hidden` list lets you render your own dock, tray or menu of hidden panels. See [Hiding & building a dock](./hiding.md).

## The document

The complete workspace state is a serializable **`LayoutDocument`**: the docked tree (`root`), `floating` panels, `hidden` panels, a `views` record of every view's type, params and title, and navigation state. It is plain JSON — persist it, send it to a server, diff it. See [Persistence & controlled layouts](./persistence.md).

## Presentation state and motion

While panels animate, content is repositioned every frame but **views are not told**. `view.size` and the `resize` event update once motion settles. During drags, resizes and navigation gestures, content is made non-interactive (`view.interactive` is `false`) so that iframes and canvases don't swallow the pointer.

When a panel is smaller than its type's `minSize`, the content is laid out at `minSize` and scaled down; `view.scale` reports the factor, and content is non-interactive while scaled.
