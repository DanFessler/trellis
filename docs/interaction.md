---
title: Interaction model
description: How dragging, docking and navigation behave — ported from the prototype — with every drop target, its precedence, and the requirements Trellis verifies.
section: Guides
order: 14.5
nav: Interaction model
---

# Interaction model

Trellis's drag and drop and its navigation are a port of the prototype's drag controller and camera: the same thresholds, timings, drop targets and precedence, extended for tabs, the stage and `allow` rules. The design record, [`design/prototype-parity.md`](https://github.com/DanFessler/trellis/blob/main/design/prototype-parity.md), lists every prototype behaviour and whether Trellis ports, adapts or drops it.

## Drag and drop

### Picking up

A drag starts once the pointer has moved **6 px** from a press on a tab, a tab bar or a [frame-only](./navigation.md#content-minimum) panel. A press with <kbd>Alt</kbd>, <kbd>Shift</kbd>, <kbd>Ctrl</kbd> or <kbd>⌘</kbd> held never starts a drag — those are reserved for navigation.

- **Nothing reflows at pickup.** The source stays in place until the first drop target settles.
- **The lifted window keeps its size** while the pointer is over its original slot. As it leaves, it eases (280 ms) to a compact card of at most 380 × 260, keeping the point you grabbed; it eases back if you return. Over the desktop it grows to the content minimum.
- **Dragging a tab** out of a group with more than one tab starts as a reorder: within the strip, the tab moves with the pointer and the others slide aside when it crosses a neighbour's resting centre. Leaving the strip tears the view out into its own window. Cancelling restores the group, the tab order and the selection.
- Dragging a lone tab, or the empty part of a tab bar, moves the whole panel.

### Previews

Drop targets **settle for 150 ms** before the preview changes, so sweeping across the layout doesn't make it flicker. The preview is the real layout: neighbours animate aside to open a slot where the view will land, `[data-trellis-part="drop-slot"]` (labelled "Add as tab", with `data-kind="tab"`, for tab drops). The source's panel collapses on the first target, its neighbours reflow into the gap, and it never reopens during that drag; `[data-trellis-part="source-slot"]` marks where the view came from.

**Release commits the current candidate** immediately, even if it hasn't settled yet. <kbd>Esc</kbd>, a pointer cancel or the window losing focus cancels the drag, and the window flies back. Releasing with no target — outside the workspace, say — cancels too.

### Targets

| Where the pointer is                                               | What the drop does                                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A panel's tab bar                                                  | Inserts the view as a tab at that index.                                                                                                                 |
| A panel's edge (the outer 28% on that side)                        | Splits the panel and takes half. If the panel's parent runs along the same axis, it inserts at that seam instead, and every sibling gets an equal share. |
| A panel's centre                                                   | Adds the view as a tab.                                                                                                                                  |
| A gap (seam) between panels                                        | Inserts there, spanning the whole group on either side. The nearest seam wins, and seams beat panel edges.                                               |
| The outer frame band — within max(gap, 8) px of the workspace edge | Inserts around the framed group: beside everything the camera currently shows. Beats every other target except an overlay float under the pointer.       |
| An empty stage's edges (within 64 px, or 28% if smaller)           | Docks beside the stage.                                                                                                                                  |
| An empty stage's interior                                          | With `floating: "stage"`, floats the view there — the stage is the desktop. Otherwise the view fills the stage.                                          |
| A window floating on the desktop                                   | Its tab bar or middle adds the view to that window as a tab; near its edges the drop floats beside it.                                                   |
| An overlay float                                                   | Its tab bar or middle adds the view as a tab; its edges are not a target. Overlay floats sit above everything, so they take precedence.                  |

Dropping a view onto itself changes nothing.

**Overlay floats**, and stage floats moved over a stage that has content, pass over panels freely: only tab bars, seams, the frame band and a narrow 14% band along a panel's edges dock them. Everywhere else inside the workspace they stay floating, at the same size.

**`allow` rules remove targets; they never reroute a drop.** A tool with `allow: { stage: false }` simply has no targets inside the stage — the drop doesn't turn into something else.

### Landing

- A window dropped on the desktop floats at the drop point. Its size is its original size, capped at ⅔ of the desktop and never below the content minimum. A float moved on the desktop keeps its size.
- The moved window stays above other panels until its settle animation ends.
- A tab reorder that stays within its strip commits on release, and the tabs slide into place (180 ms).

While dragging, the root has `data-dragging` and `data-drop` — `dock`, `tab`, `stage`, `float` or `none` — and the lifted panel has `data-lifted`.

## Navigation

The camera frames nodes and contiguous sibling ranges, never floating windows. Maximize restores the exact prior framing, the overview toggles back to where you were, history records visits by their views, and saved framings follow their views through rearranging. In `navigation: "free"`, a plain wheel over chrome zooms, zoom is rubber-banded and snaps to the best fit, <kbd>Shift</kbd>+wheel steps the hierarchy, <kbd>Shift</kbd>+drag draws a marquee and <kbd>Alt</kbd>+drag zooms. See [Navigation & maximize](./navigation.md).

## What Trellis verifies

Trellis runs the prototype's requirement tests against its own model, with the prototype's requirement IDs in the test names:

| IDs                   | Covers                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAYOUT-01 – LAYOUT-04 | Splitting halves a view's space; resizing a seam changes only its neighbours; closing gives space to the next neighbour; the last view stays open.                                 |
| DOCK-01 – DOCK-06     | Docking on each side; equal-space previews; seams and shared edges agree; seams between nested groups; the outer frame band; self-drops.                                           |
| NAV-01 – NAV-12       | Hierarchy steps; aligned splits add no level; snap targets; sibling ranges; the marquee; maximize and its restore; saved framings; history; floating windows are not snap targets. |

Pointer feel — trackpad and touch gestures, pickup and settle timing — is checked by hand against the prototype, as the prototype itself was.
