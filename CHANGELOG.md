# Changelog

## 0.2.0 — 2026-09-27

### Changed

- Content scaled below its type's `minSize` now takes input at its drawn size. It used to ignore input until it was back
  at full size. Set `scaling: "inert"` on a type to keep that behaviour.
- Panels keep their minimum size as the window or their group changes size. A group whose panels can't all fit is laid
  out at the size they need and drawn scaled down. Zooming to it shows it at full size.
- With navigation on, a nested group whose parts are all smaller than 48 × 48 on screen becomes one tile, with lines
  showing how it's divided. Double-click a part to zoom to it. The `detail` option sets the threshold, or turns this off.

### Added

- `scaling` on view types: `"interactive"` (default), `"inert"`, or `false` to never scale content. The web component
  reads it from `data-scaling`.
- `detail` workspace option: `{ size, outline }` or `false`.
- `ws.getLayoutRects()`: every docked node's rect as it's drawn, with minimums and group scales applied. For minimaps.
- The `LayoutMetrics` type.
- Double-clicking an icon-only panel zooms to it.

### Fixed

- Zooming into a tiny panel dropped to a few frames per second. Content no longer reflows on each frame of a camera
  move. Views that end the move in view are laid out once, at their final size. Views that end out of view aren't laid
  out again. Pinch and wheel zoom only scale content until released. Content is never laid out larger than twice the
  window.
- Icon-only panels showed a broken tab bar.

## 0.1.0 — 2026-09-26

First release of Trellis.

- `@danfessler/trellis`: framework-agnostic core. Split/panel/tab layout with a primary stage, drag-to-dock with
  live previews, floating panels (in the stage or as an overlay), hide/restore with animated hand-off, focus and free
  navigation with spring-driven framing, saved framings, allow/singleton/closable rules, close guards, keyboard
  support, persistence and a serializable layout document, four themes and CSS-token theming.
- `@danfessler/trellis-react`: `Workspace`, `ViewType`, JSX layout (`Split`, `Panel`, `View`, `Stage`) and hooks.
- `@danfessler/trellis-element`: `<trellis-workspace>` custom element and a standalone build.
