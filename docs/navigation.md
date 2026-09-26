---
title: Navigation & maximize
description: Focus and free navigation, gestures and who owns them, framing, maximize, history, saved framings and keyboard shortcuts.
section: Guides
order: 14
nav: Navigation & maximize
---

# Navigation & maximize

Navigation moves an animated camera over the docked layout and the stage. "Maximizing" a panel is just framing it: the camera zooms until that panel fills the workspace, and everything else slides out of view — still mounted, still running.

## Modes

Set `navigation` on the workspace:

| Mode                  | What users can do                                                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"focus"` _(default)_ | Maximize and restore panels: double-click a tab bar, choose **Maximize** in the panel menu, or press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>↩</kbd> (<kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Enter</kbd>). <kbd>Esc</kbd> steps out one level. History and the overview work. No gestures. |
| `"free"`              | Everything in focus mode, plus [gestures](#free-navigation-gestures): wheel and pinch zoom, hierarchy steps and marquee framing. Content gets a default [minimum size](#content-minimum) of 480 × 320.                                                                       |
| `false`               | No navigation. Double-click does nothing and _Maximize_ is not in the menu.                                                                                                                                                                                                  |

```tsx
<Workspace navigation="free">{/* … */}</Workspace>
```

The mode can change at any time (`ws.update({ navigation })` or the React prop). Turning navigation off returns to the overview.

## What the camera frames

The camera frames a **node** — a panel, a split, an empty stage — or a **contiguous range of siblings**, such as two of a split's three children. A stage never forms a level of its own: framing the stage frames its content. Splits nested along the same axis don't add a level either.

**Floating panels are never camera targets.** They belong to their desktop: double-clicking a floating panel's tab bar (or pressing the maximize shortcut while it's focused) frames the stage, and `navigation.toggle()` returns `false` for it. To give a floating window a framing of its own, dock it first with [`toggleDock()`](./floating.md#dock-beside-the-stage).

## Maximize

Double-click a tab bar, choose **Maximize** in the panel menu, press the `frame.toggle` shortcut or call `navigation.toggle(id)`. Toggling the maximized panel again restores the **exact** framing you had before — even if that was several levels away — or, if that framing is gone, its nearest surviving ancestor. Navigating anywhere else ends the maximize; toggling a framed panel that wasn't maximized steps out to its parent.

When a view is opened or focused while the camera frames something that doesn't contain it, the framing widens to include it. Opening or focusing a window floating in the stage frames the stage. Overlay floats sit above the camera, so they never change the framing.

## Free navigation gestures

In `"free"` mode:

| Gesture                                     | Does                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Wheel over chrome, gaps or the stage        | Zooms around the pointer.                                                                                                    |
| Pinch on a trackpad (<kbd>Ctrl</kbd>+wheel) | Zooms around the pointer, three times faster.                                                                                |
| <kbd>Shift</kbd>+wheel                      | Steps the hierarchy one level at a time: scrolling up steps in, toward the node under the pointer; scrolling down steps out. |
| <kbd>Shift</kbd>+drag                       | Draws a marquee, in either direction. Release frames the node or sibling range that best fits it.                            |
| <kbd>Alt</kbd>+drag                         | Zooms around the press point as the pointer moves up or down — a pinch for mice.                                             |
| Two-finger touch pinch                      | Zooms and pans. Safari's trackpad `gesture*` events are supported too.                                                       |

Zooming is **rubber-banded**: the camera can zoom out to 1.35× the layout and overshoot its edges by 30%. 180 ms after the gesture stops, it springs to the node or sibling range that best fits what you were looking at, and that becomes the framing. There is no wheel panning; zoom out, then back in toward the pointer.

While marquee-selecting, the root has `data-marquee`, and two elements show the selection: `[data-trellis-part="marquee"]` and `[data-trellis-part="marquee-target"]` — the target that release would frame, with a text label, carrying `data-visible` while there is one. Alt-dragging sets `data-drag-zoom` on the root. Trellis sets only their transform and size — the stylesheet doesn't style them — so give them a look in your own CSS:

```css
.trellis [data-trellis-part="marquee"],
.trellis [data-trellis-part="marquee-target"] {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 4000;
  pointer-events: none;
}
.trellis:not([data-marquee]) [data-trellis-part="marquee"],
.trellis [data-trellis-part="marquee-target"]:not([data-visible]) {
  display: none;
}
.trellis [data-trellis-part="marquee"] {
  border: 1px dashed var(--trellis-accent);
}
.trellis [data-trellis-part="marquee-target"] {
  border-radius: var(--trellis-radius);
  box-shadow: inset 0 0 0 2px var(--trellis-accent);
}
```

> **Note** <kbd>Shift</kbd> and <kbd>Alt</kbd> are reserved for navigation in `"free"` mode. A <kbd>Shift</kbd>- or <kbd>Alt</kbd>-press anywhere in the workspace — content included — starts a marquee or a zoom, <kbd>Shift</kbd>+wheel always steps the hierarchy, and <kbd>Alt</kbd>-clicks are swallowed. In every mode, a press with a modifier held never starts a drag.

### Gesture ownership

A plain wheel over a view's **content** belongs to the content, so scrolling a document or zooming a canvas works as usual. Two ways to change that:

- Hold <kbd>Ctrl</kbd> (which is how trackpad pinches arrive) or <kbd>Alt</kbd> while scrolling over content to zoom the workspace instead.
- Give the type `gestures: "workspace"` to let every wheel over its content zoom the workspace. Use it for content that doesn't scroll or zoom itself — a static preview, a thumbnail.

```tsx
<ViewType id="thumbnail" title="Thumbnail" gestures="workspace" />
```

A tab strip whose tabs overflow keeps a plain wheel for scrolling its tabs sideways. Wheel events inside an iframe never reach the workspace — see [Zoom gestures over iframes](./recipes.md#zoom-gestures-over-iframes).

### Content minimum

With `navigation: "free"`, content lays out at no less than **480 × 320** and is scaled down uniformly below that, so zooming out shows a miniature of the real layout instead of reflowing it. A type's own `minSize` overrides the default. In the other modes there is no default minimum.

Panels smaller than 160 × 64 on screen become **frame-only**: the content and tab bar are hidden, the selected view's tab icon — or the first letter of its title — is centred (`[data-trellis-part="frame-icon"]`), the panel gets `data-frame-only`, and the whole frame is a drag handle.

## Framing from code

```ts
ws.navigation.toggle("doc-1"); // maximize the panel holding doc-1, or restore the prior framing
ws.navigation.toggle(); // the focused panel

ws.navigation.frame("panel-tools"); // a panel, split or stage by id — or a view id
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

`toggle()` returns `false` when there was nothing to maximize — a floating panel, a hidden panel, or navigation off — so you can fall back to something else. `frame()` ignores the ids of floating panels and their views.

`framed` is a node id, or a generated id starting with `range:` while the camera frames a sibling range.

### History

Each framing is recorded as a visit, together with the views it showed. `back()` and `forward()` walk the visits, framing the smallest node or sibling range that holds each visit's surviving panels — or the stage, if none survive. Repeating the current framing doesn't add a visit, and a new visit after going back replaces the forward history.

## Saved framings

A **framing** is a named camera position — "Canvas only", "Code + terminal". Save the current one, list them, jump to one:

```ts
const framing = ws.navigation.framings.save("Canvas only"); // { id, name, frame }, or null for a blank name
ws.navigation.framings.list(); // Framing[]
ws.navigation.framings.go(framing.id);
ws.navigation.framings.remove(framing.id);
```

A framing stores the **views** it showed, not a node: `frame` is a list of panel ids (or the stage's id, when the stage is empty). Going to it frames the smallest node or sibling range that holds the panels still in the layout, so a framing survives rearranging. When none of its panels are left, `go()` shows the overview.

Framings are stored in the document (`document.navigation.framings`), so they persist with the layout. The current framing is stored too (`document.navigation.frame`, the same kind of list) and restored on load.

A tiny switcher in React:

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

`layoutRects(document.root)` gives every node's rect in world units (0–1), and the `camera` event reports the visible world rect on every frame the camera moves. Together they're enough to draw a minimap:

```ts
import { layoutRects } from "@danfessler/trellis";

const map = document.querySelector<HTMLCanvasElement>("#minimap")!;
const ctx = map.getContext("2d")!;

function draw(camera = ws.navigation.camera) {
  const { width: w, height: h } = map;
  ctx.clearRect(0, 0, w, h);
  for (const { node, rect } of layoutRects(ws.getDocument().root).values()) {
    if (node.kind !== "panel") continue;
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fillRect(rect.x * w + 1, rect.y * h + 1, rect.w * w - 2, rect.h * h - 2);
  }
  ctx.strokeStyle = "#5b8cff";
  ctx.strokeRect(camera.x * w, camera.y * h, camera.w * w, camera.h * h);
}

ws.on("camera", draw); // per frame while moving — draw imperatively
ws.on("change", () => draw()); // layout changed
draw();
```

While a zoom gesture overshoots, the camera briefly leaves the 0–1 range.

## Reacting to navigation

```ts
ws.on("navigate", (framed) => console.log(framed ?? "overview"));
```

The snapshot has `framed`, `canGoBack` and `canGoForward`, and the root element gets a `data-framed` attribute while zoomed in (a framed panel gets `data-framed` as well). In React, use `onNavigate` or `useWorkspaceSelector((s) => s.framed)`.

## Keyboard

| Command               | Default                                          | Action                                                               |
| --------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `frame.toggle`        | <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> | Maximize / restore the focused panel.                                |
| `navigation.back`     | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd>       | Previous framing.                                                    |
| `navigation.forward`  | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>→</kbd>       | Next framing.                                                        |
| `navigation.overview` | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd>       | Toggle between the overview and the previous framing.                |
| —                     | <kbd>Esc</kbd>                                   | Step out one level, when framed and focus isn't inside view content. |

`Mod` is <kbd>⌘</kbd> on macOS and <kbd>Ctrl</kbd> elsewhere. To toggle the overview with a bare <kbd>0</kbd>, as in the prototype, opt in:

```ts
createWorkspace(el, { types, keymap: { "navigation.overview": "0" } });
```

Workspace shortcuts also fire while focus is inside view content, so only bind a bare key when your content doesn't take text input. See [Keyboard & accessibility](./keyboard-accessibility.md) to remap shortcuts.

## Motion

Camera moves are spring-animated. Views are resized — `view.size`, `view.scale` and the `resize` event update — once the camera settles, and content is non-interactive while a gesture is in progress. With `motion: "reduced"` — or `"system"` (the default) when the user prefers reduced motion — the camera jumps without animating. Use `motion: "full"` to always animate.
