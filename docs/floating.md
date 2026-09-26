---
title: Floating panels
description: Floating layers, how users float and dock panels, and doing it from code.
section: Guides
order: 13
---

# Floating panels

Floating panels hover above the docked layout. Users move them by their tab bar, resize them from any edge or corner, and dock them again by dragging them onto a tab bar or an edge.

## Choosing a layer

The `floating` option (core) or prop (React) decides where floats live:

| Value | Floats are… |
| --- | --- |
| `"overlay"` *(default)* | Positioned relative to the whole workspace and drawn above everything. Navigation doesn't move them — like tool windows. |
| `"stage"` | Positioned inside the stage and clipped to it. They move and scale with the stage when navigating — like palettes inside a document area. |
| `false` | Disabled. Users can't float panels and `float()` does nothing. |

```tsx
<Workspace floating="stage">{/* … */}</Workspace>
```

```ts
createWorkspace(el, { types, floating: "stage" });
```

Each floating panel remembers its own layer in the document, so changing the option later affects only new floats.

## How users float and dock

- **Hold <kbd>Alt</kbd> while dragging** a tab or panel to float it wherever you release it. Holding <kbd>Alt</kbd> works mid-drag.
- **Drag outside the workspace** (or over empty space) to float.
- Use the panel menu's **Float** item on a docked panel, or **Dock** on a floating one.
- **Drag a floating panel** by its tab bar. Its body passes freely over other panels; it only docks when you point at another panel's tab bar (to join it as a tab) or near a panel edge.
- **Resize** a float from its edges and corners. Floats have a minimum size of 160 px wide.
- Clicking a float brings it to the front.

With `floating: "stage"`, dropping onto an empty stage floats the panel there instead of docking it.

Floating panels can't be maximized; navigation applies to the docked layout.

## Preventing floating

A view type with `allow: { floating: false }` can never float — `Alt`-dragging it has no floating target, `float()` ignores it, and the menu omits *Float*.

```tsx
<ViewType id="timeline" title="Timeline" allow={{ floating: false }} />
```

## From code

```ts
// Float an existing panel (or tear one view out of its panel and float it).
ws.float("color");

// Float at a specific rect — fractions (0–1) of the floating layer.
ws.float("color", { x: 0.7, y: 0.05, w: 0.28, h: 0.45 });

// Open a new view as a float.
ws.open("picker", { placement: "float" });
ws.open("picker", { placement: { float: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, layer: "overlay" } });

// Dock it again.
ws.dock("color", "stage");
ws.dock("color", { beside: "stage", edge: "left", share: 0.2 });
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

Because rects are fractions, floats keep their relative position when the workspace resizes. To declare floats in an initial layout, use [`createDocument()`](./layout.md#createdocument-and-initial-floats).

## Styling

Floating panels carry `data-floating` and `data-region="floating"`, and use the `--trellis-shadow-float` token. While being dragged, a panel has `data-lifted` and uses `--trellis-shadow-lifted`.

```css
.trellis [data-trellis-part="panel"][data-floating] {
  backdrop-filter: blur(12px);
}
```
