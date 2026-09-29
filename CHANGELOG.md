# Changelog

## Unreleased

### Added

- Error isolation. A view whose content fails to mount or render shows a fallback with **Try again**, and the rest of
  the workspace carries on. In React, each view renders in its own error boundary. Everything that throws goes to a new
  `error` event with its source, view and type; `ws.reportError` sends your own errors the same way, and
  `errorFallback` replaces the fallback. React gets `onError` and `errorFallback` props.
- Right-to-left layouts. `direction: "auto"` (the default) follows the page, and `"rtl"` mirrors the layout, tabs,
  menus, keys and gestures. Documents stay direction-neutral.
- `permissions`, to lock the layout or allow only some changes: `rearrange`, `resize`, `close`, `float` and `hide`.
  Calls from code are never limited.
- `npm run bench`, which measures startup, memory and frame timing for large workspaces.
- Performance and Security pages in the docs.

### Changed

- Large workspaces render much faster: with the CPU slowed 4× and 300 views, slow frames during a tab drag fall from
  98% to 3%, and during a zoom from 84% to 22%.
- `sanitize` and `setDocument` accept any value without throwing, and repair anything inconsistent. A saved layout
  with the wrong shape falls back to the default layout.
- Trellis works under a strict Content Security Policy (`style-src-attr 'none'`) and with Trusted Types enforced, as
  long as icons aren't passed as markup strings.

### Fixed

- **Close other tabs** closed tabs whose type isn't closable.

## 0.3.0 — 2026-09-28

### Changed

- Dragging a divider past a neighbour's minimum now pushes the panels beyond it, nearest first. When a group runs out
  of room, its edge pushes into the panels around it, up to the window's edge. Pushed panels stay pushed if the
  divider is dragged back; `keepPushed: false` makes dragging back undo them. The arrow keys push too.
- Free navigation no longer claims <kbd>Shift</kbd> or <kbd>Alt</kbd> presses, or plain scrolling, anywhere in the
  workspace. Shift-click selections, Alt-click multi-cursors and horizontal scrolling work in content as usual, and a
  crowded tab strip always scrolls its tabs.
- A pinch zooms from anywhere, including over content. A notched <kbd>Ctrl</kbd>+scroll from a mouse steps a level
  instead of zooming continuously.
- Navigation gestures moved onto the gesture keys, <kbd>⌘</kbd><kbd>⌥</kbd> (<kbd>Ctrl</kbd><kbd>Alt</kbd>), which
  work over content too:
  - drag to pan (new);
  - <kbd>V</kbd> + drag to scale (was <kbd>Alt</kbd>+drag), or <kbd>⌘</kbd><kbd>⌃</kbd> + drag on macOS;
  - <kbd>⇧</kbd> + drag to zoom to a rectangle (was <kbd>Shift</kbd>+drag), or <kbd>⌘</kbd><kbd>⇧</kbd> + drag;
  - scroll to step a level (was <kbd>Shift</kbd>+scroll).

  A plain scroll over chrome no longer zooms.

- `gestures: "workspace"` on a view type now lets a plain scroll over its content step the workspace. It used to zoom.
- The root's `data-marquee` and `data-drag-zoom` attributes are now `data-gesture-key` (keys held) and
  `data-gesture` (dragging), each `pan`, `scale` or `rect`.

### Added

- `keepPushed` option.
- `gestureKeys` option, to change the keys for each gesture or turn one off, and `defaultGestureKeys()`.
- `gestures: "exclusive"` on view types, for content that keeps its own pinch, such as maps and canvases.
- `navigation.stepOut` keymap command. <kbd>Esc</kbd> steps out by default, and can now be remapped or turned off.

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
