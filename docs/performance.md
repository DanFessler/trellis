---
title: Performance
description: Measured startup time, memory and frame rates for workspaces of 16 to 300 views, and how to keep your own content fast.
section: More
order: 40.5
---

# Performance

Trellis keeps interaction at 60 frames per second for hundreds of views. These numbers come from `npm run bench` in the repository, which you can run on your own hardware.

## Measurements

Each layout is a grid of panels with three tabs each, or one for the smallest. The benchmark measures startup, then frame times while it drags a divider, drags a tab across the layout, animates a zoom and pinches. It runs each case at full speed and with the CPU slowed 4× to stand in for modest hardware.

| Views | Panels | Startup | Startup, CPU slowed 4× | JS heap |
| ----- | ------ | ------- | ---------------------- | ------- |
| 16    | 16     | 24 ms   | 92 ms                  | 3.4 MB  |
| 108   | 36     | 45 ms   | 180 ms                 | 3.6 MB  |
| 300   | 100    | 108 ms  | 432 ms                 | 4.3 MB  |

At full speed, every interaction runs at 60 frames per second at every size, with no frame over 17 ms. With the CPU slowed 4×, the share of frames that miss 60 frames per second is:

| Views | Divider drag | Tab drag | Animated zoom | Pinch zoom |
| ----- | ------------ | -------- | ------------- | ---------- |
| 16    | 0%           | 0%       | 0%            | 0%         |
| 108   | 0%           | 0%       | 0%            | 1%         |
| 300   | 3%           | 3%       | 18%           | 14%        |

Measured on an Apple M1 Max in headless Chromium at 1600 × 1000, after one unmeasured warm-up of each interaction. The heap is the whole test page's JavaScript heap. Views mount a small form each, so real content adds its own cost.

At 300 views, zooming spends most of its time in the browser's own layout, because 100 panels change size on every frame. Fewer panels with more tabs each costs less than many small panels.

## What Trellis does for you

- Content mounts once and never moves in the DOM, so docking, tabbing, floating and zooming never reload an iframe or re-render a framework tree.
- While a zoom animates, content is laid out once at its final size and scaled, rather than on every frame. Views that end the zoom out of view aren't laid out again.
- Views in background tabs aren't repositioned while anything moves.
- Views aren't told about size or scale changes mid-animation. `resize` and `scale` fire once motion settles.

## Experimental: world transform

`worldTransform: true` (React: `worldTransform`) moves the camera a different way. At the start of a zoom or pan, the whole workspace is laid out once for a view covering the entire move. Each frame then sets a single transform on the layer that holds it, instead of laying out every panel. Pinch and drag gestures work the same way, and are laid out again when they leave that view or zoom in more than 3×. When the camera stops, everything is laid out normally again.

With 300 views and the CPU slowed 4×, slow frames fall from 30–40% to under 10% during an animated zoom, and from 20–25% to about 5% during a pinch. The trade-offs, while the camera moves:

- Chrome, text and the gaps between panels scale like a picture, and stretch unevenly when the view's shape changes.
- Zooming in looks slightly soft until the camera stops.
- Collapsed groups and icon tiles are chosen for the laid-out view, not for each frame.

Nothing changes once the camera is still. The option may become the default, change, or go away.

### Only for moves with many panels

`worldTransform: { minPanels: n }` uses the world transform only for camera moves with at least `n` panels in view where they start or end. Floating panels always count. Each move is decided when the camera starts moving, so a zoom from one panel to its neighbour stays on the normal renderer, even in a large layout.

`worldTransform: "auto"` is `{ minPanels: 40 }`. With the CPU slowed 4×, laying out 36 panels on every frame kept up, and 49 began to stutter. Set your own threshold if your content is especially light or heavy.

`WORLD=1 npm run bench` measures with the world transform on, and `WORLD=auto` with auto. `SIZES=6x6,8x8` measures other grids.

## Keeping your content fast

- Pause work that nobody can see. `view.visible` is `false` for background tabs, hidden panels and views scrolled out of the camera, and the `visibility` event tells you when it changes.
- Don't do heavy work on `resize`. It fires after every committed change, so debounce anything expensive.
- Set `minSize` on dense views. Below it, content scales instead of reflowing, which is cheaper for complex layouts.
- Keep params small. They're saved with the layout and copied on every change.
- Iframes are the most expensive content. Each is a whole document, so prefer in-page content for views that are opened often.

## Bundle size

| Package                       | Minified | Minified and gzipped |
| ----------------------------- | -------- | -------------------- |
| `@danfessler/trellis`         | 104 kB   | 37 kB                |
| `@danfessler/trellis-react`   | 9 kB     | 3.5 kB               |
| `@danfessler/trellis-element` | 6 kB     | 2.2 kB               |
| Stylesheet                    | 22 kB    | 3.9 kB               |

The core has no dependencies. `npm run size` in the repository prints the current figures.
