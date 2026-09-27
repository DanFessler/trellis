---
title: Zoomable layouts
description: Nest panels to any depth and let people zoom to the part they need. Why it helps, how levels work, and what happens to small panels.
section: Guides
order: 13.5
---

# Zoomable layouts

A Trellis layout is a space people move through. Panels can nest inside panels to any depth, and the view zooms to whichever part someone needs right now. Everything outside the view keeps running.

Try it on the [home page](/). Each panel in the demo sits one level deeper than the last, and its **Zoom tour** reads them in order.

## Why nest deeply

Every docking layout has the same limit: each panel you show takes space from the others. So people close tools they'll need again, or squeeze everything until nothing is comfortable.

Zooming removes that trade-off. Keep every tool in the layout, even ones that are far too small to use in the overview, and zoom to the group you're working in. Step back out and the whole workspace is there, exactly as you left it.

This layout keeps a column of references and a nest of utilities beside the main document:

```tsx
import { layout as L } from "@danfessler/trellis-react";

const initial = L.row(
  [
    L.stage(L.view("document")),
    L.column([
      L.view("outline"),
      L.row([
        L.view("references"),
        L.column([L.view("history"), L.row([L.view("swatches"), L.view("notes")])]),
      ]),
    ]),
  ],
  [3, 1],
);
```

In the overview, the utilities at the bottom of the second column are small. Zooming to that group makes each one a usable panel.

## Levels

Each split in the layout is a level. The whole layout is the outermost level, and a single panel is the innermost. A view can also frame a run of neighbours inside a split, such as two of its three children.

Two splits in the same direction count as one level. A column inside a column adds nothing new to step through, so Trellis flattens it.

People move between levels in a few ways:

| To                       | Do this                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Zoom to a panel          | Double-click its tab bar, or press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>↩</kbd>.                       |
| Step out one level       | Press <kbd>Esc</kbd>.                                                                          |
| Step in or out one level | <kbd>Shift</kbd>+scroll over the layout. Needs free navigation.                                |
| Zoom to any region       | <kbd>Shift</kbd>+drag a rectangle around it. Needs free navigation.                            |
| Zoom continuously        | Scroll over panel chrome, or pinch. Releasing snaps to the closest fit. Needs free navigation. |
| See everything           | Press <kbd>⌘</kbd><kbd>⌥</kbd><kbd>↑</kbd>. Press it again to go back.                         |

On Windows and Linux, <kbd>⌘</kbd> is <kbd>Ctrl</kbd> and <kbd>⌥</kbd> is <kbd>Alt</kbd>. All shortcuts can be remapped with the [keymap](./keyboard-accessibility.md).

## Small panels

A panel doesn't have to be usable at every zoom level. Trellis handles small panels in three steps:

- Below a view type's `minSize`, content keeps laying out at that size and is scaled down to fit. A text editor stays readable at a glance and doesn't reflow into a narrow column. With free navigation, views without a `minSize` use 480 × 320.
- Below 160 × 64 pixels on screen, a panel shows only its icon. The whole tile becomes a drag handle, so it can still be moved.
- When every part of a nested group is that small, the whole group becomes one tile, with lines showing how it's divided two levels deep. Double-click the tile to zoom to the group. Its panels stay mounted the whole time, and focusing one of their views from code or the keyboard zooms to it. Views can dock beside a collapsed group, not into it. A flat row or column of small panels keeps its individual icons.

To use a small panel, zoom in until it's large enough, or drag it somewhere with more room. Scaled content ignores pointer input until it's back at full size.

The `detail` option sets when groups collapse. `width` and `height` are the on-screen size below which a part counts as too small, and `outline` is how many levels of lines a collapsed tile shows. `detail: false` keeps every panel, however small. Groups only collapse while navigation is on, because without zooming there'd be no way to open them:

```tsx
<Workspace navigation="free" detail={{ width: 200, height: 120, outline: 3 }}>
  {/* … */}
</Workspace>
```

Set `minSize` on each view type to the smallest size its content works at:

```tsx
<ViewType id="history" title="History" minSize={{ width: 220, height: 160 }}>
  <History />
</ViewType>
```

## Places to come back to

People can return to where they were without retracing their steps. Back and forward move through recent framings, with <kbd>⌘</kbd><kbd>⌥</kbd><kbd>←</kbd> and <kbd>⌘</kbd><kbd>⌥</kbd><kbd>→</kbd>, or `ws.navigation.back()` and `forward()`.

Saved framings give a place a name, such as "Code and terminal", so people can jump back to it later. They follow their panels as the layout changes. See [saved framings](./navigation.md#saved-framings).

Maximize remembers the level it zoomed from. Toggling it again returns there, even several levels up.

## Turn it on

Zooming to panels, stepping out and history work in the default `"focus"` mode. Scroll, pinch and marquee gestures need `"free"`:

```tsx
<Workspace navigation="free">{/* … */}</Workspace>
```

```ts
createWorkspace(el, { types, navigation: "free" });
```

With free navigation, a plain scroll over panel chrome zooms the layout, and scrolling over content scrolls the content. If the workspace sits inside a scrolling page, consider starting in `"focus"` and offering free navigation as a setting, as the home page demo does.

[Navigation and maximize](./navigation.md) is the full reference: what the camera frames, gesture ownership over iframes, saved framings and the API.
