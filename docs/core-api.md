---
title: Core API
description: createWorkspace options, WorkspaceHandle, ViewHandle, events, snapshots, slots and helpers in @danfessler/trellis.
section: Reference
order: 31
---

# Core API

`@danfessler/trellis` is the framework-free core. Import the functions you need and the stylesheet:

```ts
import {
  createWorkspace,
  layout,
  createDocument,
  layoutRects,
  emptyDocument,
  sanitize,
  formatCombo,
  DEFAULT_KEYMAP,
} from "@danfessler/trellis";
import "@danfessler/trellis/style.css";
```

The package also exports every type, such as `WorkspaceOptions`, `WorkspaceHandle`, `ViewHandle`, `LayoutDocument` and `IframeOptions`.

## `createWorkspace(host, options)`

```ts
function createWorkspace(host: HTMLElement, options: WorkspaceOptions): WorkspaceHandle;
```

Creates a workspace inside `host` and returns its [handle](#workspacehandle). Trellis appends a root element with the class `trellis`. The workspace fills `host`, so give `host` a size.

### `WorkspaceOptions`

| Option          | Type                                                        | Default                                                   | Description                                                                                                                                                               |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types`         | `Record<string, ViewTypeDefinition>`                        |                                                           | **Required.** The registered [view types](#viewtypedefinition), keyed by type id.                                                                                         |
| `theme`         | `"light" \| "medium" \| "dark" \| "darker" \| "system"`     | `"system"`                                                | The built-in theme.                                                                                                                                                       |
| `tokens`        | `Record<string, string>`                                    |                                                           | CSS custom properties set on the workspace root. A new object replaces the previous set, so omitted tokens are removed, and an empty string removes a token.              |
| `floating`      | `false \| "overlay" \| "stage"`                             | `"overlay"`                                               | The layer floating panels live in.                                                                                                                                        |
| `navigation`    | `false \| "focus" \| "free"`                                | `"focus"`                                                 | The navigation mode. `"free"` adds gestures and a default 480 × 320 content minimum. See [Navigation](./navigation.md).                                                   |
| `motion`        | `"system" \| "full" \| "reduced"`                           | `"system"`                                                | The animation policy.                                                                                                                                                     |
| `keymap`        | `Keymap`                                                    |                                                           | Changes key bindings with a partial map of command to combo. `null` disables a command.                                                                                   |
| `panelMenu`     | `boolean \| (entries, context) => MenuEntry[]`              | `true`                                                    | Turns the [built-in menu items](./menus.md#the-built-in-items) on or off, or edits every panel's menu with a function. See [Panel menus](./menus.md).                     |
| `detail`        | `false \| { size?, outline? }`                              | `{ size: 48, outline: 2 }`                                | Collapses a nested group into one tile when all its parts are smaller than `size` × `size` on screen. See [Zoomable layouts](./zoomable-layouts.md#small-panels).         |
| `keepPushed`    | `boolean`                                                   | `true`                                                    | Whether panels pushed by a divider stay pushed when it's dragged back. `false` makes each drag work from the layout it started with, so dragging back undoes the pushes.  |
| `gestureKeys`   | `{ pan?, scale?, step? }`                                   | `{ pan: "Mod+Alt", scale: "Mod+Alt+Z", step: "Mod+Alt" }` | Keys held to pan (drag), scale (drag) and step (scroll) under free navigation. `null` turns one off. See [Gesture keys](./navigation.md#gesture-keys).                    |
| `renderMenu`    | `(request: MenuRequest) => void`                            |                                                           | Shows panel menus with your own component instead of the built-in one. See [Panel menus](./menus.md#render-menus-yourself).                                               |
| `tabs`          | `{ fill?: boolean; inset?: number }`                        | `{ fill: false, inset: 4 }`                               | Sets the tab style. `fill` stretches tabs across the tab row, and `inset` is the space around them in pixels (`0` is full-bleed). See [Theming](./theming.md#tab-styles). |
| `hideToward`    | `(panelId: string) => Element \| Rect \| null \| undefined` |                                                           | Picks where the built-in menu's **Hide** animates to, such as your dock or tray button. See [Hiding](./hiding.md#the-built-in-hide).                                      |
| `label`         | `string`                                                    | `"Workspace"`                                             | The accessible name of the workspace region.                                                                                                                              |
| `onMissingType` | `(type, id) => "drop" \| "placeholder"`                     | `"placeholder"`                                           | Decides what happens to a view whose type isn't registered. See [Unknown view types](./layout.md#unknown-view-types).                                                     |
| `defaultLayout` | `LayoutDocument \| LayoutSpec \| null`                      |                                                           | The initial layout when nothing is persisted or passed as `document`. Read once, when the workspace mounts.                                                               |
| `document`      | `LayoutDocument`                                            |                                                           | The document to start from. It overrides persistence. Read once, when the workspace mounts.                                                                               |
| `persist`       | `{ key: string; version?: string \| number }`               |                                                           | Saves the layout to `localStorage` under `key` and restores it from there. A saved layout with a different `version` is discarded. Read once, when the workspace mounts.  |

To change other options later, call [`update()`](#everything-else).

Trellis starts from the first document that exists in this order: `document`, the persisted document with a matching `version`, `defaultLayout`, and then an empty workspace.

### `ViewTypeDefinition`

| Field       | Type                                                                       | Default                                             | Description                                                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`     | `string \| (view: ViewHandle) => string`                                   | The type id                                         | The tab label.                                                                                                                                                                                                         |
| `icon`      | `string`                                                                   |                                                     | The tab icon, as trusted SVG/HTML markup.                                                                                                                                                                              |
| `mount`     | `(element, view, parts) => void \| (() => void)`                           |                                                     | Renders vanilla content once per view. Return a cleanup function. `parts` is `{ icon, accessory }`, the containers for the tab icon and tab bar accessory.                                                             |
| `iframe`    | `string \| IframeOptions \| (view: ViewHandle) => string \| IframeOptions` |                                                     | Renders an iframe instead: a URL, or [`IframeOptions`](#iframeoptions). It reloads only when the computed options change.                                                                                              |
| `menu`      | `MenuEntry[] \| (view: ViewHandle) => MenuEntry[]`                         |                                                     | Items at the top of the panel menu while this view is selected.                                                                                                                                                        |
| `placement` | `Placement`                                                                |                                                     | The default [placement](#placement) for `open()`.                                                                                                                                                                      |
| `allow`     | `{ stage?: boolean; side?: boolean; floating?: boolean }`                  | All `true`                                          | The regions users may drop this view into.                                                                                                                                                                             |
| `singleton` | `boolean`                                                                  |                                                     | Allows at most one instance. `open()` focuses the existing one.                                                                                                                                                        |
| `closable`  | `boolean`                                                                  |                                                     | `false` removes the close button and ignores close commands.                                                                                                                                                           |
| `minSize`   | `{ width: number; height: number }`                                        | 480 × 320 with `navigation: "free"`, none otherwise | The smallest size content lays out at. Below it, content scales down.                                                                                                                                                  |
| `scaling`   | `"interactive" \| "inert" \| false`                                        | `"interactive"`                                     | Below `minSize`: scaled content takes input, ignores it (`"inert"`), or isn't scaled at all (`false`). See [Small panels](./zoomable-layouts.md#small-panels).                                                         |
| `tabbar`    | `"always" \| "auto" \| "never" \| "overlay"`                               | `"always"`                                          | When the tab bar shows. See [Tab bar modes](#tab-bar-modes).                                                                                                                                                           |
| `gestures`  | `"content" \| "exclusive" \| "workspace"`                                  | `"content"`                                         | Who gets gestures over the content under free navigation. `"exclusive"` keeps pinch for the content; `"workspace"` lets a plain scroll step the workspace. See [Gesture ownership](./navigation.md#gesture-ownership). |
| `className` | `string`                                                                   |                                                     | An extra class on the view's surface.                                                                                                                                                                                  |

A type with neither `mount` nor `iframe` renders nothing itself. Adapters use this to render framework content into [surfaces](#surfaces).

### Tab bar modes

| Value       | Tab bar                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"always"`  | Sits above the content.                                                                                                                                             |
| `"auto"`    | Hides while the view is alone in its panel.                                                                                                                         |
| `"never"`   | Always hidden. Users rearrange the view from the menu, and you can from the API.                                                                                    |
| `"overlay"` | Floats over a lone view's content. The content extends underneath and draws its own title bar using `--trellis-titlebar-height` and `--trellis-titlebar-inset-end`. |

See [Overlay tab bars](./theming.md#overlay-tab-bars).

### `IframeOptions`

```ts
interface IframeOptions {
  src?: string;
  srcdoc?: string;
  sandbox?: string;
  allow?: string;
  referrerPolicy?: string;
  title?: string; // defaults to the view's title
}
```

A string is shorthand for `{ src }`. Trellis recreates the iframe, which reloads it, only when the computed options change. Returning equal options keeps it, for example after an unrelated params change. See [Live preview iframes](./recipes.md#a-live-preview-iframe).

```ts
const types = {
  docs: { title: "Docs", iframe: { src: "https://example.com", sandbox: "allow-scripts allow-same-origin" } },
  preview: {
    title: "Preview",
    iframe: (view) => ({ srcdoc: String(view.params.html), sandbox: "allow-scripts" }),
  },
};
```

## `WorkspaceHandle`

`createWorkspace()` returns this handle.

### Views

| Member                                         | Description                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `open(type, options?): ViewInfo`               | Opens a view, or reveals an existing one. `from` (an `Element` or `Rect`) animates the new panel out of a launcher. See [Opening views](./opening-views.md). |
| `close(viewId, { force? }?): Promise<boolean>` | Closes a view. Resolves `false` if a close guard vetoed it.                                                                                                  |
| `focus(id)`                                    | Reveals and focuses a view, or a panel's selected view. Raises a floating panel, and zooms out if the current frame doesn't show it.                         |
| `select(viewId)`                               | Selects a view's tab without moving focus.                                                                                                                   |
| `setTitle(viewId, title)`                      | Stores an explicit title.                                                                                                                                    |
| `setParams(viewId, patch)`                     | Shallow-merges `patch` into a view's params.                                                                                                                 |
| `views({ type? }?): ViewInfo[]`                | Returns every view, optionally filtered by type.                                                                                                             |
| `view(id): ViewHandle \| null`                 | Returns a view's [handle](#viewhandle).                                                                                                                      |

### Panels

| Member                              | Description                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `float(panelOrViewId, rect?)`       | Floats a panel, or tears a view out and floats it. `rect` is in fractions of the layer.                                                                                                                      |
| `dock(panelOrViewId, target)`       | Docks into `"stage"`, `{ beside, edge, share? }` or `{ into, index? }`.                                                                                                                                      |
| `toggleDock(panelOrViewId)`         | Docks a floating panel beside the stage, along its longer side, and widens the framing to show both. Floats a docked panel back at its remembered size. See [Floating](./floating.md#dock-beside-the-stage). |
| `hide(panelOrViewId, { toward? }?)` | Hides a panel, or a single tab if the view shares its panel. Animates toward an `Element` or `Rect`.                                                                                                         |
| `restore(panelId, { from? }?)`      | Restores a hidden panel. Animates from an `Element` or `Rect`.                                                                                                                                               |

Animation targets (`open({ from })`, `hide({ toward })`, `restore({ from })` and `hideToward`) take an `Element`, or a `Rect` in pixels relative to the workspace's top-left corner.

### Navigation

| Member                                                   | Description                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation.frame(target)`                               | Frames a node id, a view id, a list of ids, `"stage"` or `"all"`. A list frames the smallest node or sibling range that contains them. Floating panels are ignored.             |
| `navigation.toggle(id?)`                                 | Maximizes a panel (default: the focused panel), or restores the exact prior framing if it's maximized. Returns `false` for a floating panel, a hidden panel, or navigation off. |
| `navigation.back()` / `navigation.forward()`             | Walks the history of visits.                                                                                                                                                    |
| `navigation.overview()`                                  | Zooms out to everything.                                                                                                                                                        |
| `navigation.toggleOverview()`                            | Zooms out to everything, or from the overview back to the previous framing.                                                                                                     |
| `navigation.stepOut()`                                   | Frames the parent of the current framing. This is what <kbd>Esc</kbd> does.                                                                                                     |
| `navigation.stepIn()`                                    | Frames the child under the centre of the viewport.                                                                                                                              |
| `navigation.framed`                                      | The framed node id, a `range:` id for a sibling range, or `null`.                                                                                                               |
| `navigation.camera`                                      | The visible part of the layout, as a `Rect` in world units. The whole layout is 0 to 1.                                                                                         |
| `navigation.framings.save(name)`                         | Saves the current framing and returns a `Framing` (`{ id, name, frame }`, where `frame` lists panel ids). Returns `null` for a blank name.                                      |
| `navigation.framings.go(id)` / `.remove(id)` / `.list()` | Uses saved framings. `go()` frames whatever holds the framing's surviving panels.                                                                                               |

### Document and state

| Member                             | Description                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getDocument(): LayoutDocument`    | Returns the current document, including navigation state.                                                                                                                                           |
| `getLayoutRects()`                 | Returns every docked node's rect as it's drawn right now, in world units (0 to 1), with minimum sizes and scaled groups applied. Each entry has `node`, `rect`, `parent` and `scale`. For minimaps. |
| `setDocument(doc, { animate? }?)`  | Replaces the document, animated by default. Views present in both documents stay mounted.                                                                                                           |
| `reset()`                          | Clears persisted state and applies the default layout. Views whose ids appear in the default layout stay mounted. Other views close without running close guards.                                   |
| `getSnapshot(): WorkspaceSnapshot` | Returns the current [state](#workspacesnapshot). The snapshot is cached until something changes.                                                                                                    |
| `subscribe(listener): () => void`  | Calls `listener` on any state change. Pairs with `getSnapshot`, for example in `useSyncExternalStore`.                                                                                              |
| `on(event, handler): () => void`   | Subscribes to an [event](#events). Returns an unsubscribe function.                                                                                                                                 |

### Everything else

| Member                           | Description                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `element`                        | The workspace root element (`.trellis`).                                                                                                                                                          |
| `slots`                          | Elements you can render into. See [Slots](#slots).                                                                                                                                                |
| `surfaces(): readonly Surface[]` | Returns the mount points for every view. See [Surfaces](#surfaces).                                                                                                                               |
| `run(command)`                   | Runs a keymap command, such as `"panel.next"`.                                                                                                                                                    |
| `update(options)`                | Changes options after creation: `types`, `theme`, `tokens`, `floating`, `navigation`, `motion`, `keymap`, `panelMenu`, `renderMenu`, `tabs`, `detail`, `hideToward`, `onMissingType` and `label`. |
| `destroy()`                      | Unmounts everything and removes listeners.                                                                                                                                                        |

```ts
ws.update({ theme: "light", tokens: { "--trellis-accent": "#e5484d" } }); // replaces the previous tokens
ws.update({ types: { ...types, chart: chartType } }); // register a type later
```

## `WorkspaceSnapshot`

The workspace's state, returned by `getSnapshot()`:

```ts
interface WorkspaceSnapshot {
  document: LayoutDocument;
  focusedPanel: string | null;
  focusedView: string | null;
  views: ViewInfo[];
  hidden: { panelId: string; views: ViewInfo[] }[];
  framed: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  framings: Framing[];
  dragging: boolean;
}

interface ViewInfo {
  id: string;
  type: string;
  params: Params;
  title: string;
  panelId: string;
  placement: "docked" | "stage" | "floating" | "hidden";
  selected: boolean;
}
```

`views` includes views that are mid-drag, so a view stays in the list while the user carries it.

## Events

Subscribe with `ws.on()`:

```ts
ws.on("change", (doc: LayoutDocument) => {}); // committed changes only, never mid-drag or mid-animation
ws.on("open", (view: ViewInfo) => {}); // a view was added
ws.on("close", (view: ViewInfo) => {}); // a view was removed
ws.on("focus", (viewId: string | null) => {});
ws.on("navigate", (framed: string | null) => {});
ws.on("surfaces", (surfaces: readonly Surface[]) => {}); // the set of mount points changed
ws.on("camera", (rect: Rect) => {}); // every frame the camera moves, for imperative minimaps
```

`camera` fires on each animation frame while the camera moves. Use it to draw directly, for example on a canvas or a transformed element. Don't re-render a framework tree from it.

## `ViewHandle`

A single view's handle. Trellis passes it to `mount`, `title`, `iframe` and `menu` functions, and `ws.view(id)` returns it.

| Member                                                   | Description                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`, `type`                                             | The view's id and type.                                                                                                      |
| `params`                                                 | The view's params.                                                                                                           |
| `panelId`                                                | The id of the panel holding the view.                                                                                        |
| `visible`                                                | `true` when the view is selected, in a visible panel and on screen.                                                          |
| `focused`                                                | `true` when it's the workspace's focused view.                                                                               |
| `selected`                                               | `true` when it's the selected tab of its panel.                                                                              |
| `placement`                                              | `"docked" \| "stage" \| "floating" \| "hidden"`.                                                                             |
| `interactive`                                            | `false` during drags and gestures, and while the view is scaled below its minimum size if its type's `scaling` is `"inert"`. |
| `size`                                                   | The `{ width, height }` the content is laid out at. Updates when motion settles.                                             |
| `scale`                                                  | The visual scale below the minimum size, and `1` otherwise. Updates when motion settles.                                     |
| `title`, `badge`                                         | The current tab title and badge.                                                                                             |
| `workspace`                                              | The [`WorkspaceHandle`](#workspacehandle).                                                                                   |
| `element`                                                | The view's content element, the one `mount` receives. Reach an iframe with `view.element.querySelector("iframe")`.           |
| `setTitle(title)`, `setParams(patch)`, `setBadge(badge)` | Updates the view. A badge is text, a number, `true` for a dot (for example for unsaved changes), or `null`.                  |
| `focus()`                                                | Focuses the view.                                                                                                            |
| `hide()`                                                 | Hides the view's tab, or its whole panel if the view is alone in it.                                                         |
| `close({ force? }?)`                                     | Closes the view. Resolves `false` if a close guard vetoed it.                                                                |
| `guardClose(guard)`                                      | Adds a close guard. Return `false` to veto. Returns a function that removes the guard.                                       |
| `on(event, handler)`                                     | Listens to a [view event](#view-events). Returns an unsubscribe function.                                                    |
| `subscribe(listener)` / `getState()`                     | Store-style subscription to `ViewState`.                                                                                     |

### View events

| Event         | Payload             | When                                                                        |
| ------------- | ------------------- | --------------------------------------------------------------------------- |
| `resize`      | `{ width, height }` | The settled content size changed.                                           |
| `visibility`  | `boolean`           | The view became visible or hidden.                                          |
| `focus`       | `boolean`           | The view gained or lost workspace focus.                                    |
| `interactive` | `boolean`           | Interactivity changed, for example when a drag or gesture started or ended. |
| `scale`       | `number`            | The scale below `minSize` changed.                                          |
| `change`      | `ViewState`         | Any of the above changed, or the title, badge, params or placement.         |

This `mount` function sizes a renderer and pauses it while the view is hidden:

```ts
mount(element, view) {
  const renderer = createRenderer(element);
  const offs = [
    view.on("resize", ({ width, height }) => renderer.setSize(width, height)),
    view.on("visibility", (visible) => renderer.setPaused(!visible)),
  ];
  return () => {
    offs.forEach((off) => off());
    renderer.dispose();
  };
}
```

## Slots

`ws.slots` holds elements you can render into:

| Slot         | Shown                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `backdrop`   | Behind the stage's panels and floats, or behind the whole workspace if there's no stage.       |
| `stageEmpty` | Over the stage when it has no panels.                                                          |
| `empty`      | When the workspace has nothing in it.                                                          |
| `chrome`     | In a full-size layer above everything, for your overlays. Its children receive pointer events. |

```ts
ws.slots.stageEmpty.innerHTML = `<button id="new">New document</button>`;
```

## Surfaces

A surface is a view's mount point. Adapters use surfaces to render framework content, and you can too:

```ts
interface Surface {
  view: ViewHandle;
  content: HTMLElement; // never moves in the DOM
  icon: HTMLElement; // inside the tab, before the title
  accessory: HTMLElement; // in the tab bar, visible while the view is selected
}
```

```ts
ws.on("surfaces", (surfaces) => {
  for (const { view, content } of surfaces) if (!content.hasChildNodes()) renderInto(content, view);
});
```

## Placement

Where `open()` puts a view:

```ts
type Placement =
  | "stage"
  | "float"
  | "side"
  | "tab"
  | { beside: string; edge: "left" | "right" | "top" | "bottom"; share?: number }
  | { into: string; index?: number }
  | { float: Rect; layer?: "stage" | "overlay" };
```

See [Opening views](./opening-views.md#placements).

## Helpers

| Export                                           | Description                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`                                         | The [layout builder](./layout.md#the-layout-builder).                                                                                                                                                                                                                                                                                                   |
| `createDocument(spec, { floating?, version? }?)` | Compiles a spec into a `LayoutDocument`.                                                                                                                                                                                                                                                                                                                |
| `layoutRects(root, metrics?)`                    | Returns the world rects (0 to 1) of every node in a layout tree, as `Map<id, { node, rect, parent, scale? }>`. Without `metrics` it follows the weights only; with `LayoutMetrics` (a pixel size and a `min(node, axis)` function) it applies minimum sizes and scales cramped groups. For the rects a workspace is drawing, use `ws.getLayoutRects()`. |
| `emptyDocument()`                                | Returns a document with nothing in it.                                                                                                                                                                                                                                                                                                                  |
| `sanitize(doc, isKnownType?)`                    | Repairs an untrusted document.                                                                                                                                                                                                                                                                                                                          |
| `formatCombo(combo)`                             | Formats a key combo for display on the current platform.                                                                                                                                                                                                                                                                                                |
| `DEFAULT_KEYMAP`                                 | The default `Record<Command, string \| null>`.                                                                                                                                                                                                                                                                                                          |
