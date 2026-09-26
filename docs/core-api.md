---
title: Core API
description: createWorkspace options, WorkspaceHandle, ViewHandle, events, snapshots, slots and helpers in @danfessler/trellis.
section: Reference
order: 31
---

# Core API

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

All types (`WorkspaceOptions`, `WorkspaceHandle`, `ViewHandle`, `LayoutDocument`, `IframeOptions`, …) are exported as well.

## `createWorkspace(host, options)`

```ts
function createWorkspace(host: HTMLElement, options: WorkspaceOptions): WorkspaceHandle;
```

Creates a workspace inside `host` (appending a root element with class `trellis`). The workspace fills `host`, so give it a size.

### `WorkspaceOptions`

| Option          | Type                                                    | Default         | Description                                                                                                                                                                   |
| --------------- | ------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types`         | `Record<string, ViewTypeDefinition>`                    |                 | **Required.** Registered view types.                                                                                                                                          |
| `theme`         | `"light" \| "medium" \| "dark" \| "darker" \| "system"` | `"system"`      | Built-in theme.                                                                                                                                                               |
| `tokens`        | `Record<string, string>`                                |                 | CSS custom properties applied to the root. Each update replaces the previous set: tokens missing from a new object are removed, and an empty-string value removes that token. |
| `floating`      | `false \| "overlay" \| "stage"`                         | `"overlay"`     | Floating layer.                                                                                                                                                               |
| `navigation`    | `false \| "focus" \| "free"`                            | `"focus"`       | Navigation mode. `"free"` adds gestures and a default 480 × 320 content minimum. See [Navigation](./navigation.md).                                                           |
| `motion`        | `"system" \| "full" \| "reduced"`                       | `"system"`      | Animation policy.                                                                                                                                                             |
| `keymap`        | `Keymap`                                                |                 | Partial map of command → combo, or `null` to disable.                                                                                                                         |
| `defaultLayout` | `LayoutDocument \| LayoutSpec \| null`                  |                 | Initial layout when nothing is persisted or passed as `document`.                                                                                                             |
| `document`      | `LayoutDocument`                                        |                 | Start from this document. Overrides persistence.                                                                                                                              |
| `persist`       | `{ key: string; version?: string \| number }`           |                 | Save to and restore from `localStorage`.                                                                                                                                      |
| `panelMenu`     | `boolean`                                               | `true`          | Include built-in panel menu items (Maximize, Float / Dock / Dock beside stage, Hide, Close…).                                                                                 |
| `tabs`          | `{ fill?: boolean; inset?: number }`                    |                 | Tab style. `fill` stretches tabs across the bar; `inset` is the space around them in pixels (`0` is full-bleed). See [Theming](./theming.md#tab-styles).                      |
| `hideToward`    | `(panelId) => Element \| Rect \| null \| undefined`     |                 | Where the built-in menu's **Hide** animates to — your dock or tray button. See [Hiding](./hiding.md#animating-toward-a-button).                                               |
| `onMissingType` | `(type, id) => "drop" \| "placeholder"`                 | `"placeholder"` | Handle unregistered types in a document.                                                                                                                                      |
| `label`         | `string`                                                | `"Workspace"`   | Accessible name of the workspace region.                                                                                                                                      |

The initial document is the first of: `document`, the persisted document (matching `version`), `defaultLayout`, an empty workspace.

### `ViewTypeDefinition`

| Field       | Type                                                                       | Description                                                                                                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`     | `string \| (view: ViewHandle) => string`                                   | Tab label. Defaults to the type name.                                                                                                                                                                                                                                           |
| `icon`      | `string`                                                                   | Trusted SVG/HTML markup for the tab icon.                                                                                                                                                                                                                                       |
| `mount`     | `(element, view, parts) => void \| (() => void)`                           | Render content once per view; return a cleanup. `parts` is `{ icon, accessory }` — the view's tab-icon and tab-bar accessory containers.                                                                                                                                        |
| `iframe`    | `string \| IframeOptions \| (view: ViewHandle) => string \| IframeOptions` | Render an iframe instead: a URL, or [`IframeOptions`](#iframeoptions).                                                                                                                                                                                                          |
| `menu`      | `MenuEntry[] \| (view: ViewHandle) => MenuEntry[]`                         | Items at the top of the panel menu while selected.                                                                                                                                                                                                                              |
| `placement` | `Placement`                                                                | Default placement for `open()`.                                                                                                                                                                                                                                                 |
| `allow`     | `{ stage?: boolean; side?: boolean; floating?: boolean }`                  | Where users may drop it.                                                                                                                                                                                                                                                        |
| `singleton` | `boolean`                                                                  | At most one instance; `open()` focuses the existing one.                                                                                                                                                                                                                        |
| `closable`  | `boolean`                                                                  | `false` hides the close button.                                                                                                                                                                                                                                                 |
| `minSize`   | `{ width: number; height: number }`                                        | Minimum layout size; content scales down below it. Defaults to 480 × 320 with `navigation: "free"`, none otherwise.                                                                                                                                                             |
| `tabbar`    | `"always" \| "auto" \| "never" \| "overlay"`                               | Tab bar visibility. `"auto"` hides it while the view is alone in its panel; `"overlay"` floats it over a lone view's content, which draws its own title bar using `--trellis-titlebar-height` and `--trellis-titlebar-inset-end`. See [Theming](./theming.md#overlay-tab-bars). |
| `gestures`  | `"content" \| "workspace"`                                                 | `"workspace"` lets a plain wheel over the content zoom the workspace (`navigation: "free"`).                                                                                                                                                                                    |
| `className` | `string`                                                                   | Extra class on the view's surface.                                                                                                                                                                                                                                              |

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

A string is shorthand for `{ src }`. The iframe is recreated — and so reloads — only when the computed options change; returning equal options (for example after an unrelated params change) keeps it. See [Live preview iframes](./recipes.md#a-live-preview-iframe).

```ts
const types = {
  docs: { title: "Docs", iframe: { src: "https://example.com", sandbox: "allow-scripts allow-same-origin" } },
  preview: {
    title: "Preview",
    iframe: (view) => ({ srcdoc: String(view.params.html), sandbox: "allow-scripts" }),
  },
};
```

A type with neither `mount` nor `iframe` renders nothing itself — that's how adapters render framework content into [`surfaces`](#surfaces).

## `WorkspaceHandle`

### Views

| Member                                         | Description                                                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open(type, options?): ViewInfo`               | Open a view, or reveal an existing one. `from` (an `Element` or `Rect`) animates the new panel out of a launcher. See [Opening views](./opening-views.md). |
| `close(viewId, { force? }?): Promise<boolean>` | Close a view. Resolves `false` if a close guard vetoed it.                                                                                                 |
| `focus(id)`                                    | Reveal and focus a view, or a panel's selected view. Raises a floating panel and zooms out if the current frame doesn't show it.                           |
| `select(viewId)`                               | Select a view's tab without moving focus.                                                                                                                  |
| `setTitle(viewId, title)`                      | Store an explicit title.                                                                                                                                   |
| `setParams(viewId, patch)`                     | Shallow-merge into a view's params.                                                                                                                        |
| `views({ type? }?): ViewInfo[]`                | Every view, optionally filtered by type.                                                                                                                   |
| `view(id): ViewHandle \| null`                 | A view's handle.                                                                                                                                           |

### Panels

| Member                              | Description                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `float(panelOrViewId, rect?)`       | Float a panel, or tear a view out and float it. `rect` is in fractions of the layer.                                                                                                                      |
| `dock(panelOrViewId, target)`       | Dock into `"stage"`, `{ beside, edge, share? }` or `{ into, index? }`.                                                                                                                                    |
| `toggleDock(panelOrViewId)`         | Dock a floating panel beside the stage (along its longer side) and widen the framing to show both; float a docked panel back at its remembered size. See [Floating](./floating.md#dock-beside-the-stage). |
| `hide(panelOrViewId, { toward? }?)` | Hide a panel, or a single tab if the view shares its panel, animating toward an `Element` or `Rect`.                                                                                                      |
| `restore(panelId, { from? }?)`      | Restore a hidden panel, animating from an `Element` or `Rect`.                                                                                                                                            |

Animation targets (`open({ from })`, `hide({ toward })`, `restore({ from })`, `hideToward`) take an `Element` or a `Rect` in pixels relative to the workspace's top-left corner.

### Navigation

| Member                                                   | Description                                                                                                                                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation.frame(target)`                               | Frame a node id, view id, list of ids (the smallest node or sibling range containing them), `"stage"` or `"all"`. Floating panels are ignored.                                                              |
| `navigation.toggle(id?)`                                 | Maximize a panel (default: the focused panel), or restore the exact prior framing if it's maximized. Returns `false` when nothing could be maximized — a floating panel, a hidden panel, or navigation off. |
| `navigation.back()` / `navigation.forward()`             | Walk the history of visits.                                                                                                                                                                                 |
| `navigation.overview()`                                  | Zoom out to everything.                                                                                                                                                                                     |
| `navigation.toggleOverview()`                            | Zoom out to everything, or back to the previous framing from the overview.                                                                                                                                  |
| `navigation.stepOut()`                                   | Frame the parent of the current framing (what <kbd>Esc</kbd> does).                                                                                                                                         |
| `navigation.stepIn()`                                    | Frame the child under the centre of the viewport.                                                                                                                                                           |
| `navigation.framed`                                      | The framed node id — or a `range:` id for a sibling range — or `null`.                                                                                                                                      |
| `navigation.camera`                                      | The visible part of the layout as a `Rect` in world units (the whole layout is 0–1).                                                                                                                        |
| `navigation.framings.save(name)`                         | Save the current framing; returns a `Framing` (`{ id, name, frame }`, where `frame` lists panel ids), or `null` for a blank name.                                                                           |
| `navigation.framings.go(id)` / `.remove(id)` / `.list()` | Use saved framings. `go()` frames whatever holds the framing's surviving panels.                                                                                                                            |

### Document & state

| Member                             | Description                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getDocument(): LayoutDocument`    | The current document, including navigation state.                                                                                                              |
| `setDocument(doc, { animate? }?)`  | Replace the document (animated by default). Views present in both stay mounted.                                                                                |
| `reset()`                          | Clear persisted state and apply the default layout. Views whose ids appear in the default layout stay mounted; other views close without running close guards. |
| `getSnapshot(): WorkspaceSnapshot` | Current state. Cached until something changes.                                                                                                                 |
| `subscribe(listener): () => void`  | Called on any state change. Pairs with `getSnapshot` (e.g. `useSyncExternalStore`).                                                                            |
| `on(event, handler): () => void`   | Subscribe to an [event](#events). Returns an unsubscribe function.                                                                                             |

### Everything else

| Member                           | Description                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `element`                        | The workspace root element (`.trellis`).                                                                                                                      |
| `slots`                          | Elements you can render into. See [Slots](#slots).                                                                                                            |
| `surfaces(): readonly Surface[]` | Mount points for every view. See [Surfaces](#surfaces).                                                                                                       |
| `run(command)`                   | Run a keymap command, e.g. `"panel.next"`.                                                                                                                    |
| `update(options)`                | Change options after creation: `types`, `theme`, `tokens`, `floating`, `navigation`, `motion`, `keymap`, `panelMenu`, `hideToward`, `onMissingType`, `label`. |
| `destroy()`                      | Unmount everything and remove listeners.                                                                                                                      |

```ts
ws.update({ theme: "light", tokens: { "--trellis-accent": "#e5484d" } }); // replaces the previous tokens
ws.update({ types: { ...types, chart: chartType } }); // register a type later
```

## `WorkspaceSnapshot`

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

`views` includes views that are mid-drag, so a view never disappears from the list while the user carries it.

## Events

```ts
ws.on("change", (doc: LayoutDocument) => {}); // committed layout changes; never mid-drag or mid-animation
ws.on("open", (view: ViewInfo) => {}); // a view was added
ws.on("close", (view: ViewInfo) => {}); // a view was removed
ws.on("focus", (viewId: string | null) => {});
ws.on("navigate", (framed: string | null) => {});
ws.on("surfaces", (surfaces: readonly Surface[]) => {}); // the set of mount points changed
ws.on("camera", (rect: Rect) => {}); // every frame the camera moves — for imperative minimaps
```

`camera` fires per animation frame while the camera moves. Use it to draw directly (a canvas, a transformed element); don't re-render a framework tree from it.

## `ViewHandle`

Passed to `mount`, `title`, `iframe` and `menu` functions, and returned by `ws.view(id)`.

| Member                                                   | Description                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`, `type`                                             | Identity.                                                                                                           |
| `params`                                                 | The view's params.                                                                                                  |
| `panelId`                                                | The panel holding it.                                                                                               |
| `visible`                                                | Selected, in a visible panel and on screen.                                                                         |
| `focused`                                                | The workspace's focused view.                                                                                       |
| `selected`                                               | The selected tab of its panel.                                                                                      |
| `placement`                                              | `"docked" \| "stage" \| "floating" \| "hidden"`.                                                                    |
| `interactive`                                            | `false` during drags, gestures and while scaled below its minimum size.                                             |
| `size`                                                   | `{ width, height }` the content is laid out at. Updates once motion settles.                                        |
| `scale`                                                  | Visual scale below the minimum size (`1` otherwise). Updates once motion settles.                                   |
| `title`, `badge`                                         | Current tab title and badge.                                                                                        |
| `workspace`                                              | The `WorkspaceHandle`.                                                                                              |
| `element`                                                | The view's content element (the one `mount` receives). Reach an iframe with `view.element.querySelector("iframe")`. |
| `setTitle(title)`, `setParams(patch)`, `setBadge(badge)` | Update the view. A badge is text, a number, `true` for a dot (e.g. unsaved changes), or `null`.                     |
| `focus()`, `hide()`                                      | Focus the view; hide it (just its tab, or its panel if it's alone).                                                 |
| `close({ force? }?)`                                     | Close it; resolves `false` if vetoed.                                                                               |
| `guardClose(guard)`                                      | Add a close guard. Return `false` to veto. Returns a remover.                                                       |
| `on(event, handler)`                                     | Listen to a view event (below). Returns an unsubscribe function.                                                    |
| `subscribe(listener)` / `getState()`                     | Store-style subscription to `ViewState`.                                                                            |

### View events

| Event         | Payload             | When                                                   |
| ------------- | ------------------- | ------------------------------------------------------ |
| `resize`      | `{ width, height }` | The settled content size changed.                      |
| `visibility`  | `boolean`           | Became visible or hidden.                              |
| `focus`       | `boolean`           | Gained or lost workspace focus.                        |
| `interactive` | `boolean`           | Interactivity changed (drag/gesture started or ended). |
| `scale`       | `number`            | Scale below `minSize` changed.                         |
| `change`      | `ViewState`         | Any of the above, or title, badge, params, placement.  |

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

`ws.slots` holds elements you may render into:

| Slot         | Shown                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| `backdrop`   | Behind the stage's panels and floats (the whole workspace, if there is no stage).          |
| `stageEmpty` | Over the stage when it has no panels.                                                      |
| `empty`      | When the workspace has nothing in it.                                                      |
| `chrome`     | A full-size layer above everything for your overlays. Its children receive pointer events. |

```ts
ws.slots.stageEmpty.innerHTML = `<button id="new">New document</button>`;
```

## Surfaces

A surface is a view's mount point. Adapters use surfaces to render framework content; you can too.

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

See [Opening views & placement](./opening-views.md#placements).

## Helpers

| Export                                           | Description                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `layout`                                         | The [layout builder](./layout.md#the-layout-builder).                                                            |
| `createDocument(spec, { floating?, version? }?)` | Compile a spec into a `LayoutDocument`.                                                                          |
| `layoutRects(root)`                              | World rects (0–1) of every node in a layout tree: `Map<id, { node, rect, parent }>`. For minimaps and overviews. |
| `emptyDocument()`                                | A document with nothing in it.                                                                                   |
| `sanitize(doc, isKnownType?)`                    | Repair an untrusted document.                                                                                    |
| `formatCombo(combo)`                             | Display a key combo for the current platform.                                                                    |
| `DEFAULT_KEYMAP`                                 | The default `Record<Command, string \| null>`.                                                                   |
