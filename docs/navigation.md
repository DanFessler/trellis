---
title: Navigation & maximize
description: Focus and free navigation, gestures and who owns them, framing, history, saved framings and keyboard shortcuts.
section: Guides
order: 14
nav: Navigation & maximize
---

# Navigation & maximize

Navigation moves an animated camera over the docked layout. "Maximizing" a panel is just framing it: the camera zooms until that panel fills the workspace, and everything else slides out of view — still mounted, still running.

## Modes

Set `navigation` on the workspace:

| Mode | What users can do |
| --- | --- |
| `"focus"` *(default)* | Maximize and restore panels: double-click a tab bar, choose **Maximize** in the panel menu, or press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>↩</kbd> (<kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Enter</kbd>). <kbd>Esc</kbd> goes back. |
| `"free"` | Everything in focus mode, plus zooming and panning the workspace like a canvas. |
| `false` | No navigation. Double-click does nothing and *Maximize* is not in the menu. |

```tsx
<Workspace navigation="free">{/* … */}</Workspace>
```

The mode can change at any time (`ws.update({ navigation })` or the React prop). Turning navigation off returns to the overview.

## Free navigation gestures

In `"free"` mode:

- **Pinch** on a trackpad, or **<kbd>Ctrl</kbd>/<kbd>⌘</kbd> + scroll**, zooms around the pointer.
- **Scroll** pans — but only while zoomed in. At the overview, scrolling is left alone so the page (or your content) scrolls normally.
- When the gesture stops, the camera **snaps** to the panel, split or stage that best fits what you were looking at, and that becomes the framed node.

### Gesture ownership

Wheel gestures over the workspace's own chrome — tab bars, gaps, the stage backdrop — belong to navigation. Wheel gestures over a view's **content** belong to the content, so scrolling a document or zooming a canvas works as usual. Two ways to change that:

- Hold <kbd>Alt</kbd> while scrolling or pinching over content to navigate instead.
- Give the type `gestures: "workspace"` to let navigation gestures start anywhere over its content. Use it for content that doesn't scroll or zoom itself — a static preview, a thumbnail.

```tsx
<ViewType id="thumbnail" title="Thumbnail" gestures="workspace" />
```

Over a tab strip, plain scrolling is left to the strip; only zoom gestures navigate.

## Framing from code

```ts
ws.navigation.toggle("doc-1"); // maximize the panel holding doc-1, or restore it if already framed
ws.navigation.toggle(); // the focused panel

ws.navigation.frame("panel-tools"); // a panel, split or stage by id — or a view id
ws.navigation.frame(["layers", "color"]); // the smallest node that contains all of them
ws.navigation.frame("stage"); // the stage
ws.navigation.frame("all"); // the overview

ws.navigation.overview(); // same as frame("all")
ws.navigation.back();
ws.navigation.forward();

ws.navigation.framed; // id of the framed node, or null at the overview
ws.navigation.camera; // the visible world rect; the whole layout is { x: 0, y: 0, w: 1, h: 1 }
```

`toggle()` returns `false` when there was nothing to maximize — the panel is floating or hidden, or navigation is off — so you can fall back to something else (the desktop example re-floats a window to fill the screen instead).

Framing records history, so `back()` and `forward()` step through previous framings. Framing only applies to the docked layout; floating panels can't be framed. Overlay floats stay where they are; stage floats move with the stage.

When a view is opened or focused while the camera is framing something that doesn't contain it, Trellis zooms back out so the view is visible.

## Saved framings

A **framing** is a named camera position — "Canvas only", "Code + terminal". Save the current one, list them, jump to one:

```ts
const framing = ws.navigation.framings.save("Canvas only"); // { id, name, frame }
ws.navigation.framings.list(); // Framing[]
ws.navigation.framings.go(framing.id);
ws.navigation.framings.remove(framing.id);
```

Framings are stored in the document (`document.navigation.framings`), so they persist with the layout. The current frame is stored too (`document.navigation.frame`) and restored on load.

A tiny switcher in React:

```tsx
function Framings() {
  const ws = useWorkspace();
  const framings = useWorkspaceSelector((s) => s.framings);
  return (
    <nav>
      {framings.map((f) => (
        <button key={f.id} onClick={() => ws.navigation.framings.go(f.id)}>{f.name}</button>
      ))}
      <button onClick={() => ws.navigation.framings.save(prompt("Name") ?? "Untitled")}>Save view</button>
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

## Reacting to navigation

```ts
ws.on("navigate", (framed) => console.log(framed ?? "overview"));
```

The snapshot has `framed`, `canGoBack` and `canGoForward`, and the root element gets a `data-framed` attribute while zoomed in (the framed panel gets `data-framed` as well). In React, use `onNavigate` or `useWorkspaceSelector((s) => s.framed)`.

## Keyboard

| Command | Default | Action |
| --- | --- | --- |
| `frame.toggle` | <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> | Maximize / restore the focused panel. |
| `navigation.back` | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd> | Previous framing. |
| `navigation.forward` | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>→</kbd> | Next framing. |
| `navigation.overview` | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd> | Zoom out to everything. |
| — | <kbd>Esc</kbd> | Go back, when framed and focus isn't inside view content. |

`Mod` is <kbd>⌘</kbd> on macOS and <kbd>Ctrl</kbd> elsewhere. See [Keyboard & accessibility](./keyboard-accessibility.md) to remap them.

## Motion

Camera moves are spring-animated. Views are resized (and receive `resize`) once the camera settles, and are non-interactive while a gesture is in progress. With `motion: "reduced"` — or `"system"` (the default) when the user prefers reduced motion — the camera jumps without animating. Use `motion: "full"` to always animate.
