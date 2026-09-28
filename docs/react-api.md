---
title: React API
description: Every component, prop and hook in @danfessler/trellis-react.
section: Reference
order: 30
---

# React API

`@danfessler/trellis-react` wraps the core in React components and hooks. Import what you need:

```ts
import {
  Workspace,
  WorkspaceProvider,
  ViewType,
  Split,
  Panel,
  View,
  Stage,
  Floating,
  useWorkspace,
  useOptionalWorkspace,
  useWorkspaceState,
  useWorkspaceSelector,
  useView,
  useOptionalView,
  useViewTitle,
  useViewBadge,
  useCloseGuard,
  layout,
  createDocument,
  formatCombo,
} from "@danfessler/trellis-react";
```

The package also re-exports every type from the core, such as `WorkspaceHandle`, `LayoutDocument`, `ViewHandle` and `Placement`. Import the stylesheet once with `import "@danfessler/trellis/style.css"`.

## `<Workspace>`

Creates a workspace in a `div` that fills its parent (`width: 100%; height: 100%`).

```tsx
<Workspace theme="dark" navigation="free" storageKey="app" version={1} ref={wsRef}>
  {/* <ViewType>s, layout components, <Workspace.Empty>, <Workspace.Chrome>, … */}
</Workspace>
```

| Prop                 | Type                                                        | Default                                                                          | Description                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `children`           | `ReactNode`                                                 |                                                                                  | View types, [layout components](#layout-components), and the slots `Workspace.Empty`, `Workspace.Backdrop`, `Workspace.StageEmpty` and `Workspace.Chrome`.                         |
| `theme`              | `"light" \| "medium" \| "dark" \| "darker" \| "system"`     | `"system"`                                                                       | The built-in theme.                                                                                                                                                                |
| `tokens`             | `Record<string, string>`                                    |                                                                                  | CSS custom properties set on the workspace root. A new object replaces the previous set, so omitted tokens are removed, and an empty string removes a token.                       |
| `floating`           | `false \| "overlay" \| "stage"`                             | `"overlay"`                                                                      | The layer floating panels live in.                                                                                                                                                 |
| `navigation`         | `false \| "focus" \| "free"`                                | `"focus"`                                                                        | The navigation mode. `"free"` adds gestures and a default 480 × 320 content minimum. See [Navigation](./navigation.md).                                                            |
| `motion`             | `"system" \| "full" \| "reduced"`                           | `"system"`                                                                       | The animation policy.                                                                                                                                                              |
| `keymap`             | `Keymap`                                                    |                                                                                  | Changes key bindings with a partial map of command to combo. `null` disables a command.                                                                                            |
| `panelMenu`          | `boolean \| (entries, context) => MenuEntry[]`              | `true`                                                                           | Turns the [built-in menu items](./menus.md#the-built-in-items) on or off, or edits every panel's menu with a function. See [Panel menus](./menus.md).                              |
| `detail`             | `false \| { size?, outline? }`                              | `{ size: 48, outline: 2 }`                                                       | Collapses a nested group into one tile when all its parts are smaller than `size` × `size` on screen. See [Zoomable layouts](./zoomable-layouts.md#small-panels).                  |
| `keepPushed`         | `boolean`                                                   | `true`                                                                           | Whether panels pushed by a divider stay pushed when it's dragged back. `false` makes each drag work from the layout it started with, so dragging back undoes the pushes.           |
| `gestureKeys`        | `{ pan?, scale?, rect?, step? }`                            | `{ pan: "Mod+Alt", scale: "Mod+Alt+Z", rect: "Mod+Alt+Shift", step: "Mod+Alt" }` | Keys held to pan (drag), scale (drag), zoom to a rectangle (drag) and step (scroll) under free navigation. `null` turns one off. See [Gesture keys](./navigation.md#gesture-keys). |
| `renderMenu`         | `(request: MenuRequest) => void`                            |                                                                                  | Shows panel menus with your own component instead of the built-in one. See [Panel menus](./menus.md#render-menus-yourself).                                                        |
| `tabs`               | `{ fill?: boolean; inset?: number }`                        | `{ fill: false, inset: 4 }`                                                      | Sets the tab style. `fill` stretches tabs across the tab row, and `inset` is the space around them in pixels (`0` is full-bleed). See [Theming](./theming.md#tab-styles).          |
| `hideToward`         | `(panelId: string) => Element \| Rect \| null \| undefined` |                                                                                  | Picks where the built-in menu's **Hide** animates to, such as your dock or tray button. See [Hiding](./hiding.md#the-built-in-hide).                                               |
| `label`              | `string`                                                    | `"Workspace"`                                                                    | The accessible name of the workspace region.                                                                                                                                       |
| `onMissingType`      | `(type, id) => "drop" \| "placeholder"`                     | `"placeholder"`                                                                  | Decides what happens to a view whose type isn't registered. See [Unknown view types](./layout.md#unknown-view-types).                                                              |
| `storageKey`         | `string`                                                    |                                                                                  | Saves the layout to `localStorage` under this key and restores it from there. Read once, when the workspace mounts.                                                                |
| `version`            | `string \| number`                                          |                                                                                  | Your layout version. A saved layout with a different `version` is discarded. Read once, when the workspace mounts.                                                                 |
| `defaultLayout`      | `LayoutDocument \| LayoutSpec \| null`                      |                                                                                  | The initial layout when nothing is persisted or passed as `document`. JSX layout children take precedence. Read once, when the workspace mounts.                                   |
| `document`           | `LayoutDocument`                                            |                                                                                  | The controlled layout. It overrides persistence. Pair it with `onDocumentChange`.                                                                                                  |
| `onDocumentChange`   | `(doc: LayoutDocument) => void`                             |                                                                                  | Called with each committed layout change.                                                                                                                                          |
| `onOpen`             | `(view: ViewInfo) => void`                                  |                                                                                  | Called when a view is added.                                                                                                                                                       |
| `onClose`            | `(view: ViewInfo) => void`                                  |                                                                                  | Called when a view is removed.                                                                                                                                                     |
| `onFocus`            | `(viewId: string \| null) => void`                          |                                                                                  | Called when focus moves.                                                                                                                                                           |
| `onNavigate`         | `(framed: string \| null) => void`                          |                                                                                  | Called when the camera frames a node or returns to the overview.                                                                                                                   |
| `className`, `style` |                                                             |                                                                                  | Applied to the host `div`.                                                                                                                                                         |
| `ref`                | `Ref<WorkspaceHandle>`                                      |                                                                                  | The [imperative handle](./core-api.md#workspacehandle). `null` until the workspace mounts.                                                                                         |

`theme`, `tokens`, `tabs`, `detail`, `floating`, `navigation`, `motion`, `keymap`, `panelMenu`, `renderMenu` and `label` can change at any time. Event props, `onMissingType`, `hideToward`, a `panelMenu` function and `renderMenu` always call the latest function.

### `<Workspace.Empty>`

Renders its children when the workspace has nothing in it:

```tsx
<Workspace.Empty>
  <button onClick={openDefault}>Open a document</button>
</Workspace.Empty>
```

### `<Workspace.Backdrop>` and `<Workspace.StageEmpty>`

Render into the stage's slots. `<Workspace.Backdrop>` renders behind the stage's panels and floats, and `<Workspace.StageEmpty>` renders over the stage while it has no panels.

They do the same as `<Stage backdrop>` and `<Stage empty>`, and they also work when the layout comes from `defaultLayout` data or persistence. If both are given, the `<Stage>` props win.

```tsx
<Workspace defaultLayout={L.stage()}>
  <Workspace.Backdrop>
    <Wallpaper />
  </Workspace.Backdrop>
  <Workspace.StageEmpty>
    <button onClick={openDefault}>New document</button>
  </Workspace.StageEmpty>
</Workspace>
```

### `<Workspace.Chrome>`

Renders a full-size layer above the workspace for your own overlays, such as a dock, minimap, HUD or toolbar. The layer itself ignores the pointer, but its direct children receive pointer events. Content here can use the workspace hooks.

The chrome layer lives inside the workspace and is clipped to it. For app-wide overlays, such as menus that extend past the workspace or a toolbar above it, render outside `<Workspace>` and use [`<WorkspaceProvider>`](#workspaceprovider).

```tsx
<Workspace.Chrome>
  <Dock />
</Workspace.Chrome>
```

## `<WorkspaceProvider>`

Makes the workspace hooks available to UI outside `<Workspace>`, such as app bars, menus, status bars and a dock. Wrap both the workspace and that UI:

```tsx
import {
  WorkspaceProvider,
  Workspace,
  useOptionalWorkspace,
  useWorkspaceSelector,
} from "@danfessler/trellis-react";

function StatusBar() {
  const views = useWorkspaceSelector((s) => s.views.length);
  return <footer>{views} open</footer>;
}

function NewButton() {
  const ws = useOptionalWorkspace(); // null until the workspace mounts
  return (
    <button disabled={!ws} onClick={() => ws?.open("doc")}>
      New
    </button>
  );
}

<WorkspaceProvider>
  <NewButton />
  <Workspace>{/* … */}</Workspace>
  <StatusBar />
</WorkspaceProvider>;
```

Under a provider, `useWorkspaceState()` and `useWorkspaceSelector()` return an empty snapshot until the workspace mounts. `useWorkspace()` throws until then, so use `useOptionalWorkspace()` in UI that can render first. A provider serves one workspace.

## `<ViewType>`

Registers a kind of view. It renders nothing itself and must be a direct child of `<Workspace>`. Fragments are fine.

```tsx
<ViewType id="doc" title={(v) => String(v.params.path)} placement="stage" icon={<FileIcon />}>
  <Editor />
</ViewType>
```

| Prop        | Type                                                                       | Default                                            | Description                                                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | `string`                                                                   |                                                    | **Required.** The type id that `<View type>` and `open(type)` refer to.                                                                                                                                                |
| `title`     | `string \| (view: ViewHandle) => string`                                   | The type id                                        | The tab label.                                                                                                                                                                                                         |
| `icon`      | `ReactNode \| string`                                                      |                                                    | The tab icon: a React node, or trusted SVG/HTML markup. Without one, the empty icon slot takes no space.                                                                                                               |
| `children`  | `ReactNode`                                                                |                                                    | The content, rendered once per view. Use [`useView()`](#useview) inside.                                                                                                                                               |
| `render`    | `(view: ViewApi) => ReactNode`                                             |                                                    | Renders content from the view's state, as an alternative to `children`.                                                                                                                                                |
| `accessory` | `ReactNode \| (view: ViewApi) => ReactNode`                                |                                                    | Content for the tab bar while this view is selected.                                                                                                                                                                   |
| `iframe`    | `string \| IframeOptions \| (view: ViewHandle) => string \| IframeOptions` |                                                    | Renders an iframe instead: a URL, or [`IframeOptions`](./core-api.md#iframeoptions). It reloads only when the computed options change.                                                                                 |
| `mount`     | `(element, view, parts) => void \| (() => void)`                           |                                                    | Renders vanilla content instead of React content. See [`ViewTypeDefinition`](./core-api.md#viewtypedefinition).                                                                                                        |
| `menu`      | `MenuEntry[] \| (view: ViewHandle) => MenuEntry[]`                         |                                                    | Items at the top of the panel menu while this view is selected.                                                                                                                                                        |
| `placement` | `Placement`                                                                |                                                    | The default [placement](./core-api.md#placement) for `open()`.                                                                                                                                                         |
| `allow`     | `{ stage?, side?, floating? }`                                             | All `true`                                         | The regions users may drop this view into.                                                                                                                                                                             |
| `singleton` | `boolean`                                                                  |                                                    | Allows at most one instance. `open()` focuses the existing one.                                                                                                                                                        |
| `closable`  | `boolean`                                                                  |                                                    | `false` removes the close button and ignores close commands.                                                                                                                                                           |
| `minSize`   | `{ width, height }`                                                        | 480 × 320 with `navigation="free"`, none otherwise | The smallest size content lays out at. Below it, content scales down.                                                                                                                                                  |
| `scaling`   | `"interactive" \| "inert" \| false`                                        | `"interactive"`                                    | Below `minSize`: scaled content takes input, ignores it (`"inert"`), or isn't scaled at all (`false`). See [Small panels](./zoomable-layouts.md#small-panels).                                                         |
| `tabbar`    | `"always" \| "auto" \| "never" \| "overlay"`                               | `"always"`                                         | When the tab bar shows. See [Tab bar modes](./core-api.md#tab-bar-modes).                                                                                                                                              |
| `gestures`  | `"content" \| "exclusive" \| "workspace"`                                  | `"content"`                                        | Who gets gestures over the content under free navigation. `"exclusive"` keeps pinch for the content; `"workspace"` lets a plain scroll step the workspace. See [Gesture ownership](./navigation.md#gesture-ownership). |
| `className` | `string`                                                                   |                                                    | An extra class on the view's surface.                                                                                                                                                                                  |

When a type has more than one kind of content, `iframe` wins, then `mount`, then `render`, then `children`.

Children render through portals, so they see React context from above `<Workspace>`. Your stores, routers and themes work as usual.

Changing props doesn't remount content. Function props (`title`, `iframe`, `mount` and `menu`) go through stable wrappers that read the latest render, so inline arrow functions are fine. Content remounts only when an iframe's computed options change, or when you switch a type between `iframe`, `mount` and React content.

### `MenuEntry`

An item in a panel menu, used by `menu`, `panelMenu` and `renderMenu`:

```ts
type MenuEntry = MenuItem | "separator";
interface MenuItem {
  id?: string;
  label: string;
  shortcut?: string; // a hint such as "⌘S", which doesn't bind the key
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  run?(): void;
  items?: MenuItem[]; // a submenu
}
```

See [Panel menus](./menus.md) for how view type items, the built-ins, `panelMenu` and `renderMenu` fit together.

## Layout components

Layout components describe the initial layout. Read once, when the workspace mounts. See [Layout](./layout.md).

| Component    | Props                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Split>`    | `axis?: "x" \| "y"` (default `"x"`), `weights?: number[]`, `id?: string`. Children: layout components.                                             |
| `<Panel>`    | `selected?: number`, `id?: string`. Children: `<View>`s.                                                                                           |
| `<View>`     | `type: string`, `params?: object`, `id?: string`, `title?: string`. A `<View>` outside a `<Panel>` gets its own panel.                             |
| `<Stage>`    | `backdrop?: ReactNode`, `empty?: ReactNode`, `id?: string`. Children: layout components. At most one per workspace.                                |
| `<Floating>` | `rect: { x, y, w, h }` (fractions 0 to 1 of the layer), `layer?: "stage" \| "overlay"` (default `"overlay"`). Children: one `<Panel>` or `<View>`. |

`<Stage backdrop>` renders behind the stage's panels, such as a canvas, wallpaper or grid. `<Stage empty>` renders when the stage has no panels. Both can use the workspace hooks.

`<Floating>` declares an initial floating panel. Place it anywhere among the workspace's children:

```tsx
<Workspace floating="stage">
  <ViewType id="color" title="Color" />
  <Stage />
  <Floating rect={{ x: 0.65, y: 0.55, w: 0.3, h: 0.4 }} layer="stage">
    <View type="color" />
  </Floating>
</Workspace>
```

## Hooks

### `useView`

```ts
function useView<P extends object = Params>(): ViewApi<P>;
```

Returns the view whose content is rendering. The result merges the [`ViewHandle`](./core-api.md#viewhandle) methods with the view's current state, and re-renders when that state changes. Presentation state, such as size and visibility, settles after motion, so the hook doesn't re-render on every animation frame. Throws outside view content.

```tsx
function Canvas() {
  const view = useView<{ file: string }>();
  // view.id, view.type, view.params.file
  // view.size.width, view.size.height, view.scale
  // view.visible, view.focused, view.selected, view.interactive
  // view.placement: "docked" | "stage" | "floating" | "hidden"
  // view.title, view.badge, view.panelId, view.workspace
  // view.setTitle(), view.setParams(), view.setBadge(), view.focus(), view.close(), view.hide()
  // view.guardClose(), view.on("resize", …), view.subscribe(), view.getState()
  return <canvas width={view.size.width} height={view.size.height} />;
}
```

#### Typed params

You can declare params as an interface. The generics accept any object type:

```tsx
interface DocParams {
  path: string;
  readOnly?: boolean;
}

<ViewType<DocParams>
  id="doc"
  title={(v) => v.params.path}
  render={(view) => <Editor path={view.params.path} />}
/>;

function Toolbar() {
  const view = useView<DocParams>();
  return <span>{view.params.readOnly ? "Read only" : view.params.path}</span>;
}
```

### `useOptionalView`

```ts
function useOptionalView(): ViewHandle | null;
```

Returns the raw view handle, or `null` outside view content. It doesn't subscribe to state. Use it in shared components that may or may not render inside a view.

### `useViewTitle`

```ts
function useViewTitle(title: string | null | undefined): void;
```

Keeps the tab title in sync with a value. Empty values are ignored. Trellis stores the title in the document, like `setTitle()`.

```tsx
useViewTitle(dirty ? `${name} •` : name);
```

### `useViewBadge`

```ts
function useViewBadge(badge: string | number | boolean | null | undefined): void;
```

Shows a badge on the view's tab, and clears it on unmount. Pass `true` for a dot, the usual marker for unsaved changes. The dot swaps with the close button on hover.

```tsx
useViewBadge(dirty); // a dot while dirty
useViewBadge(errors || null); // a count, or nothing
```

### `useCloseGuard`

```ts
function useCloseGuard(guard: () => boolean | Promise<boolean>): void;
```

Adds a close guard. Return or resolve `false` to keep the view open. The guard runs for the close button, menus, shortcuts and `close()`, but not for `close({ force: true })`. The hook always calls the latest guard.

```tsx
useCloseGuard(async () => !dirty || (await confirmDialog("Discard changes?")));
```

### `useWorkspace`

```ts
function useWorkspace(): WorkspaceHandle;
```

Returns the workspace's [imperative handle](./core-api.md#workspacehandle). It works inside view content, stage slots, `Workspace.Chrome` and `Workspace.Empty`. It also works anywhere under a [`<WorkspaceProvider>`](#workspaceprovider) after the workspace mounts. Elsewhere it throws, so use the `ref` prop instead.

### `useOptionalWorkspace`

```ts
function useOptionalWorkspace(): WorkspaceHandle | null;
```

Returns the workspace's handle, or `null` where `useWorkspace` would throw.

### `useWorkspaceState`

```ts
function useWorkspaceState(): WorkspaceSnapshot;
```

Returns the whole [snapshot](./core-api.md#workspacesnapshot), which covers layout, focus, hidden panels and navigation. It re-renders on every change. For narrow reads, use `useWorkspaceSelector`.

### `useWorkspaceSelector`

```ts
function useWorkspaceSelector<T>(select: (s: WorkspaceSnapshot) => T, equal?: (a: T, b: T) => boolean): T;
```

Returns part of the snapshot, and re-renders only when that part changes. Values are compared with `Object.is`, or with your `equal` function.

```tsx
const framed = useWorkspaceSelector((s) => s.framed);
const docCount = useWorkspaceSelector((s) => s.views.filter((v) => v.type === "doc").length);
const hiddenIds = useWorkspaceSelector(
  (s) => s.hidden.map((h) => h.panelId),
  (a, b) => a.join() === b.join(),
);
```

## Re-exports

`layout`, `createDocument` and `formatCombo` are re-exported from the core, so React apps need only one import. See [Core API](./core-api.md).

## Server rendering

`<Workspace>` renders an empty host `div` on the server and creates the workspace after hydration. View content renders on the client only.
