---
title: Interaction model
description: Exactly how dragging, docking and navigation behave, with every drop target, its precedence, timings and the requirements Trellis tests.
section: Guides
order: 14.5
nav: Interaction model
---

# Interaction model

This page gives the exact behaviour of drag and drop and of navigation: thresholds, timings, drop targets and which target wins. The guides link here when you need the precise values.

## Drag and drop

### Picking up

A drag starts after the pointer moves 6 px from a press on a tab, a tab bar or a [frame-only](./navigation.md#content-minimum) panel. A press with <kbd>Alt</kbd>, <kbd>Shift</kbd>, <kbd>Ctrl</kbd> or <kbd>⌘</kbd> held doesn't start a drag, because those keys are reserved for navigation.

Nothing reflows at pickup. The source stays in place until the first drop target settles.

The lifted window keeps its size while the pointer is over its original slot. As it leaves, it eases to a compact card of at most 380 × 260, keeping the point you grabbed. It eases back if you return. Over the desktop, it grows to the content minimum.

| Motion                       | Duration |
| ---------------------------- | -------- |
| Lifted window resizing       | 280 ms   |
| Drop target settling         | 150 ms   |
| Tabs sliding after a reorder | 180 ms   |

Dragging a tab out of a group with more than one tab starts as a reorder. Within the strip, the tab moves with the pointer. The other tabs slide aside when it crosses a neighbour's resting centre. Leaving the strip tears the view out into its own window. Cancelling restores the group, the tab order and the selection.

Dragging a lone tab, or the empty part of a tab bar, moves the whole panel.

### Previews

Drop targets settle for 150 ms before the preview changes, so sweeping across the layout doesn't make it flicker. The preview is the real layout. Neighbours animate aside to open a slot where the view will land, marked by `[data-trellis-part="drop-slot"]`. For tab drops, the slot is labelled "Add as tab" and has `data-kind="tab"`.

The source's panel collapses on the first target, and its neighbours reflow into the gap. It stays collapsed for the rest of that drag. `[data-trellis-part="source-slot"]` marks where the view came from.

Release commits the current candidate immediately, even if it hasn't settled yet. <kbd>Esc</kbd>, a pointer cancel or the window losing focus cancels the drag, and the window flies back. Releasing with no target, such as outside the workspace, cancels too.

### Targets

| Where the pointer is                                              | What the drop does                                                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A panel's tab bar                                                 | Inserts the view as a tab at that index.                                                                                                             |
| A panel's edge (the outer 28% on that side)                       | Splits the panel and takes half. If the panel's parent runs along the same axis, it inserts at that seam instead, and all siblings get equal shares. |
| A panel's centre                                                  | Adds the view as a tab.                                                                                                                              |
| A gap (seam) between panels                                       | Inserts there, spanning the whole group on either side. The nearest seam wins, and seams beat panel edges.                                           |
| The outer frame band, within max(gap, 8) px of the workspace edge | Inserts around the framed group, beside everything the camera currently shows. Beats all other targets except an overlay float under the pointer.    |
| An empty stage's edges (within 64 px, or 28% if smaller)          | Docks beside the stage.                                                                                                                              |
| An empty stage's interior                                         | With `floating: "stage"`, floats the view there, because the stage is the desktop. Otherwise the view fills the stage.                               |
| A window floating on the desktop                                  | Its tab bar or middle adds the view to that window as a tab. Near its edges, the drop floats beside it.                                              |
| An overlay float                                                  | Its tab bar or middle adds the view as a tab. Its edges aren't a target. Overlay floats sit above everything, so they take precedence.               |

Dropping a view onto itself changes nothing.

Overlay floats pass over panels freely. So do stage floats moved over a stage that has content. They dock only on tab bars, seams, the frame band and a narrow 14% band along a panel's edges. Everywhere else inside the workspace, they stay floating at the same size.

`allow` rules remove targets. They don't reroute a drop. A tool with `allow: { stage: false }` has no targets inside the stage, and a drop there doesn't turn into something else.

### Landing

A window dropped on the desktop floats at the drop point. It keeps its original size, capped at ⅔ of the desktop and no smaller than the content minimum. A float moved on the desktop keeps its size.

The moved window stays above other panels until its settle animation ends. A tab reorder that stays within its strip commits on release, and the tabs slide into place.

While dragging, the root has `data-dragging` and `data-drop`, and the lifted panel has `data-lifted`. `data-drop` is one of `dock`, `tab`, `stage`, `float` or `none`.

## Navigation

The camera frames nodes and contiguous sibling ranges. It doesn't frame floating windows. Maximize restores the exact prior framing, and the overview toggles back to where you were. History records visits by their views, and saved framings follow their views through rearranging.

In `navigation: "free"`:

- A pinch zooms from anywhere except content that keeps its own (`gestures: "exclusive"`).
- Holding the gesture keys (<kbd>⌘</kbd><kbd>⌥</kbd>, or <kbd>Ctrl</kbd><kbd>Alt</kbd>) and dragging pans. Adding <kbd>Z</kbd> scales. Scrolling steps the hierarchy.
- A plain scroll never moves the camera.
- Zoom is rubber-banded, up to 1.35× the layout with a 30% edge overshoot.
- 180 ms after a pinch stops, or when a drag is released, the camera springs to the best fit.

See [Navigation and maximize](./navigation.md).

## What Trellis verifies

Trellis's tests check these requirements against its layout model. Each test name includes the requirement's ID:

| IDs                    | Covers                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LAYOUT-01 to LAYOUT-04 | Splitting halves a view's space. Resizing a seam changes only its neighbours. Closing a view gives its space to the next neighbour.                                            |
| DOCK-01 to DOCK-06     | Docking on each side, equal-space previews, agreement between seams and shared edges, seams between nested groups, the outer frame band, and self-drops.                       |
| NAV-01 to NAV-12       | Hierarchy steps, aligned splits adding no level, snap targets, sibling ranges, maximize and its restore, saved framings, history, and floating windows not being snap targets. |
| NAV-13                 | The overview toggles back to the previous framing. This one is a browser test.                                                                                                 |

Pointer feel is checked by hand. That covers trackpad and touch gestures, and pickup and settle timing.
