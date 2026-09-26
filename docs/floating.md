---
title: Floating panels
description: Floating layers, how users float and dock panels, docking beside the stage, and doing it from code.
section: Guides
order: 13
---

# Floating panels

Floating panels hover above the docked layout. Users move them by their tab bar and resize them from any edge or corner. To dock one again, they drag it onto a tab bar, a gap between panels or the edge of the workspace.

## Choosing a layer

The `floating` option (core) or prop (React) decides where floats live:

| Value                   | Floats are…                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"overlay"` _(default)_ | Positioned relative to the whole workspace and drawn above everything. Navigation doesn't move them, like tool windows.                                                                   |
| `"stage"`               | Positioned inside the stage and clipped to it. They move and scale with the stage when navigating, like windows on a desktop. An empty stage is the desktop, and dropping onto it floats. |
| `false`                 | Disabled. Users can't float panels and `float()` does nothing.                                                                                                                            |

```tsx
<Workspace floating="stage">{/* … */}</Workspace>
```

```ts
createWorkspace(el, { types, floating: "stage" });
```

Each floating panel remembers its own layer in the document, so changing the option later affects only new floats.

## How users float and dock

With `floating: "stage"`, dropping a view in the interior of an empty stage floats it where you release it. It keeps its size from before the drag, capped at ⅔ of the desktop and no smaller than the [content minimum](./navigation.md#content-minimum). Near the empty stage's edges (within 64 px, or 28% of its size if that's smaller), the drop docks beside the stage instead.

The panel menu can also float and dock. With `floating: "stage"`, a docked panel's **Float** and a floating panel's **Dock beside stage** [toggle between the two](#dock-beside-the-stage). With `floating: "overlay"`, **Float** floats a docked panel. **Dock** docks a floating one into the stage, or beside the layout if the view isn't allowed there.

Users drag a floating panel by its tab bar. A float moved on the desktop keeps its size. Over the side regions, a stage float docks like any dragged view (see [Drag and drop](./interaction.md#drag-and-drop)).

When the stage has content, a stage float moved over it behaves like an overlay float. Tab bars, the gaps between panels, the outer frame band and a narrow band (14%) along each panel's edges dock it. Anywhere else, it stays floating where you release it.

Overlay floats pass over panels freely. They dock only on another panel's tab bar, the gaps between panels, the outer frame band, or a narrow band (14%) along a panel's edges. Anywhere else, they stay floating where you release them. Releasing over the middle of another overlay float adds the view to it as a tab.

Users resize a float from its edges and corners, down to 160 px wide. Clicking a float's tab bar or content brings it to the front, and so does focusing it from code (`focus()`, `open()`).

Dragging floats a docked view only over the desktop, which is an empty stage with `floating: "stage"`. With `floating: "overlay"`, or a stage that holds panels, float from the menu, `float()` or `toggleDock()`. Holding <kbd>Alt</kbd> doesn't float a drag. <kbd>Alt</kbd> and <kbd>Shift</kbd> are reserved for navigation, and a press with a modifier held doesn't start a drag at all.

### Dock beside the stage

`ws.toggleDock(panelOrViewId)` works like the desktop's window-zoom button:

- On a floating panel, it docks the panel beside the stage and widens the framing to show both. The panel goes to the right when the stage is wider than tall, and below otherwise.
- On a docked panel, it floats the panel back at the rect it had before it was docked. If it never floated, it gets a cascaded default size. The remembered rect lasts for the session and isn't stored in the document.

The panel menu uses `toggleDock()` when `floating: "stage"` ("Dock beside stage" / "Float"). It respects `allow`. A view that may not dock at the side, or may not float, stays where it is.

### Maximizing floats

Floating panels aren't camera targets. Double-clicking a floating panel's tab bar frames the stage it lives on, and `ws.navigation.toggle(id)` returns `false`. To give a window a framing of its own, dock it with `toggleDock()` and then maximize it. See [Navigation](./navigation.md#what-the-camera-frames).

## Preventing floating

A view type with `allow: { floating: false }` can't float. Dragging it offers no floating target, `float()` and `toggleDock()` ignore it, and the menu omits _Float_.

```tsx
<ViewType id="timeline" title="Timeline" allow={{ floating: false }} />
```

## From code

```ts
// Float an existing panel (or tear one view out of its panel and float it).
ws.float("color");

// Float at a specific rect, in fractions (0 to 1) of the floating layer.
ws.float("color", { x: 0.7, y: 0.05, w: 0.28, h: 0.45 });

// Open a new view as a float, growing out of the button that launched it.
ws.open("picker", { placement: "float", from: launcherButton });
ws.open("picker", { placement: { float: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, layer: "overlay" } });

// Dock it again.
ws.dock("color", "stage");
ws.dock("color", { beside: "stage", edge: "left", share: 0.2 });

// Dock beside the stage, or float back at the remembered size.
ws.toggleDock("color");
```

`float()` without a rect keeps the panel roughly where it was, at up to 560 × 400 px. `placement: "float"` cascades new floats near the middle of the layer so they don't stack exactly.

## In the document

Floating panels are stored in `document.floating`:

```ts
interface FloatingPanel {
  panel: PanelNode;
  rect: { x: number; y: number; w: number; h: number }; // fractions of the layer
  z: number; // stacking order; higher is in front
  layer: "stage" | "overlay";
}
```

Because rects are fractions, floats keep their relative position when the workspace resizes. To declare floats in an initial layout, use [`<Floating>`](./layout.md#floating-panels-in-jsx) in React or [`createDocument()`](./layout.md#createdocument-and-initial-floats).

## Styling

Floating panels carry `data-floating` and `data-region="floating"`, and use the `--trellis-shadow-float` token. While being dragged, a panel has `data-lifted` and uses `--trellis-shadow-lifted`.

```css
.trellis [data-trellis-part="panel"][data-floating] {
  backdrop-filter: blur(12px);
}
```
