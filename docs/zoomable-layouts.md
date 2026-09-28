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

| To                       | Do this                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Zoom to a panel          | Double-click its tab bar, or its icon when it's too small for one. Or press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>↩</kbd>.        |
| Step out one level       | Press <kbd>Esc</kbd>.                                                                                                    |
| Step in or out one level | Hold <kbd>⌘</kbd><kbd>⌥</kbd> and scroll. Needs free navigation.                                                         |
| Pan                      | Hold <kbd>⌘</kbd><kbd>⌥</kbd> and drag. Needs free navigation.                                                           |
| Zoom continuously        | Pinch, or hold <kbd>⌘</kbd><kbd>⌥</kbd><kbd>Z</kbd> and drag. Releasing snaps to the closest fit. Needs free navigation. |
| See everything           | Press <kbd>⌘</kbd><kbd>⌥</kbd><kbd>↑</kbd>. Press it again to go back.                                                   |

On Windows and Linux, <kbd>⌘</kbd> is <kbd>Ctrl</kbd> and <kbd>⌥</kbd> is <kbd>Alt</kbd>. Shortcuts can be remapped with the [keymap](./keyboard-accessibility.md), and the keys held for gestures with [`gestureKeys`](./navigation.md#gesture-keys).

## Small panels

A panel doesn't have to be usable at every zoom level. Panels never get smaller than their minimum within their own group. When a group's panels can't all fit, Trellis lays the group out at the size they need and draws it scaled down into its space. Zooming to the group shows it at full size. On screen, small panels are handled in three steps:

- Below a view type's `minSize`, content keeps laying out at that size and is scaled down to fit. A text editor stays readable at a glance and doesn't reflow into a narrow column. With free navigation, views without a `minSize` use 480 × 320.
- Below 160 × 64 pixels on screen, a panel shows only its icon. The whole tile becomes a drag handle, so it can still be moved, and double-clicking it zooms to the panel.
- When every part of a nested group is smaller than 48 × 48, too small even for an icon, the group becomes one tile. Lines on the tile show how it's divided, two levels deep. Double-click a part of the tile to zoom to it. Its panels stay mounted the whole time, and focusing one of their views from code or the keyboard zooms to it. Views can dock beside a collapsed group, not into it. A flat row or column of small panels keeps its individual icons, and the group you've zoomed to never collapses.

Scaled content works as usual: people can click, type and scroll in it at its drawn size, or zoom in until it's large enough. A type's `scaling` option changes that. `"inert"` scales content but ignores input until it's back at full size, and `false` never scales it, so content reflows to whatever size its panel has:

```tsx
<ViewType id="preview" title="Preview" minSize={{ width: 480, height: 320 }} scaling="inert">
  <Preview />
</ViewType>
```

Inside a scaled view, pointer positions are in screen pixels, and the view's layout is in its own, larger pixels. Code that turns a pointer into a position, such as a canvas or a custom slider, should convert with the ratio of the two. That also covers the moments while a zoom animates:

```ts
const r = el.getBoundingClientRect();
const x = (e.clientX - r.left) * (el.offsetWidth / r.width);
```

The `detail` option sets when groups collapse. `size` is the on-screen width and height below which a part counts as too small, and `outline` is how many levels of lines a collapsed tile shows. `detail: false` keeps every panel, however small. Groups only collapse while navigation is on, because without zooming there'd be no way to open them:

```tsx
<Workspace navigation="free" detail={{ size: 64, outline: 3 }}>
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

Zooming to panels, stepping out and history work in the default `"focus"` mode. Pinch, pan, scale and step gestures need `"free"`:

```tsx
<Workspace navigation="free">{/* … */}</Workspace>
```

```ts
createWorkspace(el, { types, navigation: "free" });
```

With free navigation, a pinch zooms from anywhere, and holding <kbd>⌘</kbd><kbd>⌥</kbd> turns the whole layout into a handle. Everything else goes to your content, so text fields and lists work as usual. If the workspace sits inside a scrolling page, a pinch over it zooms the workspace, not the page. Consider starting in `"focus"` and offering free navigation as a setting, as the home page demo does.

[Navigation and maximize](./navigation.md) is the full reference: what the camera frames, gesture ownership over iframes, saved framings and the API.
