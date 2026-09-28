---
title: Navigation and maximize
description: Focus and free navigation, gestures and who owns them, framing, maximize, history, saved framings and keyboard shortcuts.
section: Guides
order: 14
nav: Navigation and maximize
---

# Navigation and maximize

Navigation moves an animated camera over the docked layout and the stage. Maximizing a panel means framing it: the camera zooms until that panel fills the workspace. Everything else slides out of view but stays mounted and running.

This page is the reference. For why deep nesting and zooming help, and how to design a layout for it, start with [Zoomable layouts](./zoomable-layouts.md).

## Modes

Set `navigation` on the workspace:

| Mode                  | What users can do                                                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"focus"` _(default)_ | Maximize and restore panels: double-click a tab bar, choose **Maximize** in the panel menu, or press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>↩</kbd> (<kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Enter</kbd>). <kbd>Esc</kbd> steps out one level. History and the overview work. No gestures. |
| `"free"`              | Everything in focus mode, plus [gestures](#free-navigation-gestures): pinch to zoom, and pan, scale and step with the gesture keys. Content gets a default [minimum size](#content-minimum) of 480 × 320.                                                                    |
| `false`               | No navigation. Double-click does nothing and _Maximize_ isn't in the menu.                                                                                                                                                                                                   |

```tsx
<Workspace navigation="free">{/* … */}</Workspace>
```

The mode can change at any time (`ws.update({ navigation })` or the React prop). Turning navigation off returns to the overview.

## What the camera frames

The camera frames a node or a contiguous range of siblings. A node is a panel, a split or an empty stage. A sibling range is something like two of a split's three children. The stage doesn't form a level of its own, so framing the stage frames its content. Splits nested along the same axis don't add a level either.

Floating panels aren't camera targets, because they belong to their desktop. Double-clicking a floating panel's tab bar frames the stage, and so does pressing the maximize shortcut while it's focused. `navigation.toggle()` returns `false` for it. To give a floating window a framing of its own, dock it first with [`toggleDock()`](./floating.md#dock-beside-the-stage).

## Maximize

To maximize a panel, double-click its tab bar, choose **Maximize** in the panel menu, press the `frame.toggle` shortcut or call `navigation.toggle(id)`. Toggling the maximized panel again restores the exact framing you had before, even if that was several levels away. If that framing is gone, it restores its nearest surviving ancestor.

Navigating anywhere else ends the maximize. Toggling a framed panel that wasn't maximized steps out to its parent.

When a view is opened or focused while the camera frames something that doesn't contain it, the framing widens to include it. Opening or focusing a window floating in the stage frames the stage. Overlay floats sit above the camera, so they don't change the framing.

## Free navigation gestures

In `"free"` mode, a pinch zooms from anywhere, and holding the _gesture keys_ turns the whole workspace into a handle. Everything else over a view's content belongs to the content, so text fields, lists and editors work as usual.

| Gesture                                                                                        | Does                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Pinch on a trackpad                                                                            | Zooms around the pointer, from anywhere, content included.                                                                   |
| Hold <kbd>⌘</kbd><kbd>⌥</kbd> (<kbd>Ctrl</kbd><kbd>Alt</kbd>) and drag                         | Pans.                                                                                                                        |
| Hold <kbd>⌘</kbd><kbd>⌥</kbd><kbd>Z</kbd> (<kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>Z</kbd>) and drag | Scales around the press point. Dragging up or right zooms in.                                                                |
| Hold <kbd>⌘</kbd><kbd>⌥</kbd> (<kbd>Ctrl</kbd><kbd>Alt</kbd>) and scroll                       | Steps the hierarchy one level at a time. Scrolling up steps in, toward the node under the pointer. Scrolling down steps out. |
| <kbd>Ctrl</kbd>+scroll with a mouse wheel                                                      | Steps too. Browsers report a trackpad pinch as <kbd>Ctrl</kbd>+scroll, so Trellis tells them apart by their deltas.          |
| Two-finger touch pinch                                                                         | Zooms and pans. Safari's trackpad `gesture*` events are supported too.                                                       |

The gesture keys work over content too. While they're held, content ignores the pointer, the root has `data-gesture-key` (`pan` or `scale`) and the cursor shows what a drag will do. During the drag, the root has `data-gesture`. <kbd>Esc</kbd> cancels a drag and returns to the previous framing.

A plain scroll never moves the camera, over content or chrome, so a tab strip whose tabs overflow always scrolls its tabs. Double-clicking a tab bar still zooms to its panel.

Zooming is rubber-banded. The camera can zoom out to 1.35× the layout and overshoot its edges by 30%. When the gesture stops, the camera springs to the node or sibling range that best fits your view. That becomes the framing. [Interaction model](./interaction.md#navigation) has the exact timing.

### Gesture keys

`gestureKeys` sets the keys for each gesture. Each is a set of modifiers and, optionally, keys held with them. `null` turns a gesture off:

```ts
createWorkspace(el, {
  types,
  navigation: "free",
  gestureKeys: { pan: "Mod+Alt", scale: "Mod+Alt+Z", step: "Mod+Alt" }, // the defaults
});
```

`Mod` is <kbd>⌘</kbd> on macOS and <kbd>Ctrl</kbd> elsewhere. Pick combinations your content doesn't use with the pointer. <kbd>Shift</kbd>, <kbd>Alt</kbd>, <kbd>⌘</kbd> and <kbd>Ctrl</kbd> on their own all have meanings in text and lists. Some combinations never reach the page: on macOS, <kbd>⌘</kbd><kbd>Space</kbd> and <kbd>⌘</kbd><kbd>⌥</kbd><kbd>Space</kbd> open Spotlight and Finder search unless you turn those shortcuts off.

### Gesture ownership

A view type's `gestures` option decides what reaches its content:

| Value                   | Over the content                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `"content"` _(default)_ | Everything goes to the content except a pinch, which zooms the workspace.                                                 |
| `"exclusive"`           | The content keeps its pinch too. Use it for maps, canvases and image viewers that zoom themselves.                        |
| `"workspace"`           | A plain scroll steps the workspace. Use it for content that doesn't scroll itself, such as a static preview or thumbnail. |

The gesture keys navigate over every kind of content.

```tsx
<ViewType id="map" title="Map" gestures="exclusive" />
```

Events inside an iframe don't reach the workspace, so a pinch over one goes to the iframe. While the gesture keys are held, iframes ignore the pointer like any other content, so drags and scrolls reach the workspace, as long as keyboard focus isn't inside the iframe. See [Zoom gestures over iframes](./recipes.md#zoom-gestures-over-iframes).

### Content minimum

With `navigation: "free"`, content lays out at no less than 480 × 320. Below that, Trellis scales it down uniformly, so zooming out shows a miniature of the real layout instead of reflowing it. A type's own `minSize` overrides the default. The other modes have no default minimum.

Panels smaller than 160 × 64 on screen become frame-only. Their content and tab bar are hidden, and the panel gets `data-frame-only`. The centre shows the selected view's tab icon, or the first letter of its title (`[data-trellis-part="frame-icon"]`). The whole frame is a drag handle.

## Framing from code

```ts
ws.navigation.toggle("doc-1"); // maximize the panel holding doc-1, or restore the prior framing
ws.navigation.toggle(); // the focused panel

ws.navigation.frame("panel-tools"); // a panel, split or stage by id, or a view id
ws.navigation.frame(["layers", "color"]); // the smallest node or sibling range containing all of them
ws.navigation.frame("stage"); // the stage's content
ws.navigation.frame("all"); // the overview

ws.navigation.overview(); // same as frame("all")
ws.navigation.toggleOverview(); // the overview, and back to the previous framing
ws.navigation.stepOut(); // the parent of the current framing (what Esc does)
ws.navigation.stepIn(); // the child under the centre of the viewport

ws.navigation.back();
ws.navigation.forward();

ws.navigation.framed; // id of the framed node or sibling range, or null at the overview
ws.navigation.camera; // the visible world rect; the whole layout is { x: 0, y: 0, w: 1, h: 1 }
```

`toggle()` returns `false` when there was nothing to maximize, so you can fall back to something else. That happens for a floating panel, a hidden panel, or when navigation is off. `frame()` ignores the ids of floating panels and their views.

`framed` is a node id. While the camera frames a sibling range, it's a generated id starting with `range:`.

### History

Each framing is recorded as a visit, together with the views it showed. `back()` and `forward()` walk the visits. For each visit, they frame the smallest node or sibling range that holds its surviving panels, or the stage if none survive. Repeating the current framing doesn't add a visit, and a new visit after going back replaces the forward history.

## Saved framings

A framing is a named camera position, such as "Canvas only". You can save the current one, list them and jump to one:

```ts
const framing = ws.navigation.framings.save("Canvas only"); // { id, name, frame }, or null for a blank name
ws.navigation.framings.list(); // Framing[]
ws.navigation.framings.go(framing.id);
ws.navigation.framings.remove(framing.id);
```

A framing stores the views it showed, not a node. Its `frame` is a list of panel ids, or the stage's id when the stage is empty. Going to it frames the smallest node or sibling range that holds the panels still in the layout, so a framing survives rearranging. When none of its panels are left, `go()` shows the overview.

Framings are stored in the document (`document.navigation.framings`), so they persist with the layout. The current framing is stored too (`document.navigation.frame`, the same kind of list) and restored on load.

A small switcher in React:

```tsx
function Framings() {
  const ws = useWorkspace();
  const framings = useWorkspaceSelector((s) => s.framings);
  return (
    <nav>
      {framings.map((f) => (
        <button key={f.id} onClick={() => ws.navigation.framings.go(f.id)}>
          {f.name}
        </button>
      ))}
      <button onClick={() => ws.navigation.framings.save(prompt("Name") ?? "")}>Save view</button>
    </nav>
  );
}
```

## Minimaps

`ws.getLayoutRects()` gives every node's rect in world units (0 to 1), as it's laid out right now. The `camera` event reports the visible world rect on every frame the camera moves. Together they're enough to draw a minimap:

```ts
const map = document.querySelector<HTMLCanvasElement>("#minimap")!;
const ctx = map.getContext("2d")!;

function draw(camera = ws.navigation.camera) {
  const { width: w, height: h } = map;
  ctx.clearRect(0, 0, w, h);
  for (const { node, rect } of ws.getLayoutRects().values()) {
    if (node.kind !== "panel") continue;
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fillRect(rect.x * w + 1, rect.y * h + 1, rect.w * w - 2, rect.h * h - 2);
  }
  ctx.strokeStyle = "#5b8cff";
  ctx.strokeRect(camera.x * w, camera.y * h, camera.w * w, camera.h * h);
}

ws.on("camera", draw); // per frame while moving, so draw imperatively
ws.on("change", () => draw()); // layout changed
draw();
```

While a zoom gesture overshoots, the camera briefly leaves the 0 to 1 range.

## Reacting to navigation

```ts
ws.on("navigate", (framed) => console.log(framed ?? "overview"));
```

The snapshot has `framed`, `canGoBack` and `canGoForward`. While zoomed in, the root element and the framed panel both get a `data-framed` attribute. In React, use `onNavigate` or `useWorkspaceSelector((s) => s.framed)`.

## Keyboard

| Command               | Default                                          | Action                                                               |
| --------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `frame.toggle`        | <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> | Maximize or restore the focused panel.                               |
| `navigation.back`     | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd>       | Previous framing.                                                    |
| `navigation.forward`  | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>→</kbd>       | Next framing.                                                        |
| `navigation.overview` | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd>       | Toggle between the overview and the previous framing.                |
| `navigation.stepOut`  | <kbd>Esc</kbd>                                   | Step out one level, when framed and focus isn't inside view content. |

`Mod` is <kbd>⌘</kbd> on macOS and <kbd>Ctrl</kbd> elsewhere. To toggle the overview with a bare <kbd>0</kbd>, opt in:

```ts
createWorkspace(el, { types, keymap: { "navigation.overview": "0" } });
```

Workspace shortcuts also fire while focus is inside view content. Only bind a bare key when your content doesn't take text input. See [Keyboard and accessibility](./keyboard-accessibility.md) to remap shortcuts.

## Motion

Camera moves are spring-animated. Content is non-interactive while a gesture is in progress. Views are resized after the camera settles, which is when `view.size`, `view.scale` and the `resize` event update.

With `motion: "reduced"`, the camera jumps without animating. The default, `"system"`, does the same when the user prefers reduced motion. Use `motion: "full"` to always animate.
