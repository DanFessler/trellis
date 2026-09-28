---
title: Concepts
description: How view types, views, panels, splits and the stage fit together, plus floating, navigation and hiding.
section: Guides
order: 10
---

# Concepts

A Trellis workspace is built from view types, views, panels and splits, with an optional stage. This page explains each piece and how they relate.

## View types

A view type is a registered kind of content, such as `"layers"` or `"terminal"`. You register types when you create the workspace (`types` in the core, `<ViewType>` in React). A type says how to render its content and carries these rules:

| Rule        | Meaning                                                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `placement` | Where `open()` puts a new view of this type unless the caller says otherwise.                                                                                                                                                                            |
| `allow`     | `{ stage?, side?, floating? }`: the regions users may drop it into. All are allowed by default. A disallowed region offers no drop targets.                                                                                                              |
| `singleton` | At most one instance. `open()` focuses the existing one.                                                                                                                                                                                                 |
| `closable`  | `false` hides the close button and ignores close shortcuts.                                                                                                                                                                                              |
| `minSize`   | `{ width, height }`. Content lays out at no less than this size and is scaled down below it. Defaults to 480 × 320 under `navigation: "free"`, and to none otherwise.                                                                                    |
| `scaling`   | Below `minSize`: `"interactive"` (default) keeps scaled content usable, `"inert"` ignores input until it's full size, and `false` never scales it, so content reflows to fit.                                                                            |
| `tabbar`    | `"always"` (default), `"auto"`, `"never"` or `"overlay"`. `"auto"` hides the tab bar while the view is alone in its panel. `"overlay"` floats it over a lone view whose content draws its own title bar.                                                 |
| `gestures`  | Who gets gestures over this view's content under free navigation: `"content"` (default: everything but a pinch), `"exclusive"` (a pinch too) or `"workspace"` (a plain scroll steps the workspace). See [Navigation](./navigation.md#gesture-ownership). |

A type renders content in one of three ways. The core takes a `mount(element, view)` function or an `iframe`, which is a URL or options such as `srcdoc` and `sandbox`. An adapter adds framework components, such as `children` or `render` in React.

## Views

A view is one instance of a type, shown as a tab. Each view has:

- A stable `id`, generated or chosen by you.
- Serializable `params`, the data it needs, such as `{ path: "src/index.ts" }`.
- An optional `title` override.

Trellis mounts a view's content once, into a container that stays put in the DOM. Docking, tabbing, floating, hiding and zooming reposition that container without remounting it. That's why iframes, canvases and React state survive when users move a view.

## Panels

A panel is a tab group of one or more views, with a tab bar and a menu. Users drag, dock, float and maximize panels.

Dragging a tab within its strip reorders it. Dragging it out of the strip creates a new panel for that view, and dragging the empty part of a tab bar moves the whole group. A panel under 160 × 64 on screen is too small to use, so it shows only its icon and the whole frame drags.

## Splits

A split arranges children in a weighted row (`axis: "x"`) or column (`axis: "y"`). Weights are relative: `[1, 3]` gives the second child three times the space. Users resize with the dividers between children. Dragging a divider past a neighbour's minimum size pushes the next divider along, and so on to the edge of the group. From there it pushes the group's own edge into the panels around it, up to the window's edge. Everything that doesn't have to move stays put. Pushed panels stay pushed when the divider is dragged back, unless `keepPushed` is `false`, which makes dragging back undo them. Double-clicking a divider evens out the two neighbours.

Every panel keeps at least 80 pixels of width, and room for its tab bar plus a little content, so it can always show a tab and its menu. When the workspace or a group shrinks, panels with room to spare give it up first. If a group's panels can't all fit, the whole group is drawn smaller, like a zoomed-out copy of itself. Zooming to it brings them back to full size. See [Zoomable layouts](./zoomable-layouts.md#small-panels).

Trellis normalizes splits automatically. A split with one child collapses into that child, and a split nested directly inside a split on the same axis is flattened.

## The stage

The stage is an optional primary region, where documents live in an art program or IDE. A layout has at most one. The stage behaves differently from the rest of the layout:

- It's the default destination for `open()` when a stage exists and the type has no `placement`.
- It doesn't collapse. When its last panel closes, the stage stays and shows its `empty` slot.
- Its `backdrop` slot renders behind its panels, for a canvas, wallpaper or grid.
- With `floating: "stage"`, floating panels live inside the stage and are clipped to it.
- While it's empty, dropping near its edges docks beside the stage. Dropping in its interior fills it. With `floating: "stage"`, an empty stage acts as a desktop, so the drop floats the view there instead.
- It doesn't form a navigation level of its own. Framing the stage frames its content.

Views whose type sets `allow: { stage: false }` can't be dropped into the stage. Tool palettes are a typical example.

Without a stage, the workspace is a plain docking layout and everything else works the same.

## Regions

Each panel is in one of three regions, and `allow` rules refer to them:

| Region     | Where                              |
| ---------- | ---------------------------------- |
| `stage`    | Inside the stage.                  |
| `side`     | Docked anywhere outside the stage. |
| `floating` | A floating panel.                  |

A view's `placement` state (`view.placement`) reports `"stage"`, `"docked"` (side), `"floating"` or `"hidden"`.

## Floating

Floating panels hover above the docked layout, and users can move and resize them freely. The workspace's `floating` option picks their layer:

- `"overlay"` (default): floats sit above everything and are positioned relative to the whole workspace. They stay put during navigation.
- `"stage"`: floats live inside the stage, are clipped to it and move with it, like windows on a desktop. `toggleDock()` docks one beside the stage and floats it back.
- `false`: floating is disabled.

Floating panels aren't camera targets. See [Floating panels](./floating.md).

## Navigation

Navigation animates the workspace's camera to frame part of the layout. The `navigation` option has three modes:

- `"focus"` (default): double-click a tab bar, choose _Maximize_ from the panel's menu, or press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>↩</kbd> to zoom one panel to fill the workspace. Doing it again restores the previous framing, and <kbd>Esc</kbd> steps out one level.
- `"free"`: focus mode plus gestures. A pinch zooms from anywhere. Holding <kbd>⌘</kbd><kbd>⌥</kbd> (<kbd>Ctrl</kbd><kbd>Alt</kbd>), a drag pans, a drag with <kbd>Z</kbd> also held scales, and a scroll steps through the hierarchy. When a gesture ends, the camera snaps to the best-fitting panel, split or range of siblings.
- `false`: no navigation.

The camera frames nodes and contiguous sibling ranges. Navigation has back and forward history, an overview that toggles back, and saved framings, which remember views rather than nodes. See [Navigation and maximize](./navigation.md).

## Hiding

You can hide a panel or a single tab. It leaves the layout, but its views stay mounted and stay in the document, and Trellis remembers where it was. `restore()` puts it back. The snapshot's `hidden` list lets you render your own dock, tray or menu of hidden panels. See [Hiding and building a dock](./hiding.md).

## The document

The complete workspace state is a serializable `LayoutDocument`. It holds the docked tree (`root`), `floating` panels, `hidden` panels, a `views` record of each view's type, params and title, and navigation state. It's plain JSON, so you can persist it, send it to a server or diff it. See [Persistence and controlled layouts](./persistence.md).

## Presentation state and motion

While panels animate, Trellis repositions content every frame but doesn't notify views. `view.size`, `view.scale` and the `resize` and `scale` events update after motion settles. During drags, resizes and navigation gestures, content is non-interactive (`view.interactive` is `false`), so iframes and canvases don't swallow the pointer.

When a panel is smaller than its type's `minSize`, Trellis lays the content out at the minimum and scales it down. Under `navigation: "free"` that minimum is 480 × 320 by default. `view.scale` reports the factor. Scaled content still takes input, unless the type sets `scaling: "inert"`. Code that turns pointer positions into pixels should allow for the scale: see [Small panels](./zoomable-layouts.md#small-panels).

## Interaction model

A drag starts after the pointer moves 6 px, and picking a panel up doesn't reflow anything. Trellis previews a drop by opening a real slot in the layout. You can dock at tab bars, panel edges and centres, the gaps between panels, and the workspace's outer edge. See [Interaction model](./interaction.md) for each target and the behaviour Trellis verifies.
