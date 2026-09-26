---
title: React API
description: Every component, prop and hook in @danfessler/trellis-react.
section: Reference
order: 30
---

# React API

```ts
import {
  Workspace, WorkspaceProvider, ViewType, Split, Panel, View, Stage,
  useWorkspace, useOptionalWorkspace, useWorkspaceState, useWorkspaceSelector,
  useView, useOptionalView, useViewTitle, useViewBadge, useCloseGuard,
  layout, createDocument, formatCombo,
} from "@danfessler/trellis-react";
```

The package also re-exports every type from the core (`WorkspaceHandle`, `LayoutDocument`, `ViewHandle`, `Placement`, …). Remember to import the stylesheet once: `import "@danfessler/trellis/style.css"`.

## `<Workspace>`

Creates a workspace in a `div` that fills its parent (`width: 100%; height: 100%`).

```tsx
<Workspace theme="dark" navigation="free" storageKey="app" version={1} ref={wsRef}>
  {/* <ViewType>s, layout components, <Workspace.Empty>, <Workspace.Chrome> */}
</Workspace>
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | | View types, layout, `Workspace.Empty` and `Workspace.Chrome`. |
| `theme` | `"light" \| "medium" \| "dark" \| "darker" \| "system"` | `"system"` | Built-in theme. |
| `tokens` | `Record<string, string>` | | CSS custom properties set on the root. An empty string clears one. |
| `floating` | `false \| "overlay" \| "stage"` | `"overlay"` | Layer for floating panels. |
| `navigation` | `false \| "focus" \| "free"` | `"focus"` | Maximize / zoom behaviour. |
| `motion` | `"system" \| "full" \| "reduced"` | `"system"` | Animation policy. |
| `keymap` | `Keymap` | | Partial command → combo map; `null` disables a command. |
| `panelMenu` | `boolean` | `true` | Include the built-in panel menu items. |
| `label` | `string` | `"Workspace"` | Accessible name of the workspace region. |
| `storageKey` | `string` | | Persist to `localStorage` under this key. |
| `version` | `string \| number` | | Your layout version; a mismatch discards the saved layout. |
| `defaultLayout` | `LayoutDocument \| LayoutSpec \| null` | | Initial layout as data. JSX layout children take precedence. |
| `document` | `LayoutDocument` | | Controlled layout. Pair with `onDocumentChange`. |
| `onDocumentChange` | `(doc: LayoutDocument) => void` | | Committed layout changes. |
| `onOpen` | `(view: ViewInfo) => void` | | A view was added. |
| `onClose` | `(view: ViewInfo) => void` | | A view was removed. |
| `onFocus` | `(viewId: string \| null) => void` | | Focus moved. |
| `onNavigate` | `(framed: string \| null) => void` | | The camera framed a node, or returned to the overview. |
| `onMissingType` | `(type, id) => "drop" \| "placeholder"` | `"placeholder"` | A document references an unregistered type. |
| `className`, `style` | | | Applied to the host `div`. |
| `ref` | `Ref<WorkspaceHandle>` | | The [imperative handle](./core-api.md#workspacehandle). `null` until mounted. |

`theme`, `tokens`, `floating`, `navigation`, `motion`, `keymap` and `panelMenu` can change at any time. `label`, `storageKey`, `version` and the initial layout are read when the workspace mounts. Event props always call the latest function.

### `<Workspace.Empty>`

Rendered when the workspace has no panels at all.

```tsx
<Workspace.Empty>
  <button onClick={openDefault}>Open a document</button>
</Workspace.Empty>
```

### `<Workspace.Chrome>`

A full-size layer above the workspace for your own overlays — a dock, minimap, HUD or toolbar. The layer itself ignores the pointer; its direct children receive pointer events. Content here can use the workspace hooks.

The chrome layer lives inside the workspace and is clipped to it. For app-wide overlays — menus that extend past the workspace, a toolbar above it — render outside `<Workspace>` and use [`<WorkspaceProvider>`](#workspaceprovider).

```tsx
<Workspace.Chrome>
  <Dock />
</Workspace.Chrome>
```

## `<WorkspaceProvider>`

Makes the workspace hooks available to UI **outside** `<Workspace>` — app bars, menus, status bars, a dock. Wrap both the workspace and that UI:

```tsx
import { WorkspaceProvider, Workspace, useOptionalWorkspace, useWorkspaceSelector } from "@danfessler/trellis-react";

function StatusBar() {
  const views = useWorkspaceSelector((s) => s.views.length);
  return <footer>{views} open</footer>;
}

function NewButton() {
  const ws = useOptionalWorkspace(); // null until the workspace mounts
  return <button disabled={!ws} onClick={() => ws?.open("doc")}>New</button>;
}

<WorkspaceProvider>
  <NewButton />
  <Workspace>{/* … */}</Workspace>
  <StatusBar />
</WorkspaceProvider>;
```

Under a provider, `useWorkspaceState()` and `useWorkspaceSelector()` return an empty snapshot until the workspace mounts, and `useWorkspace()` throws until then — use `useOptionalWorkspace()` in UI that can render first. A provider serves one workspace.

## `<ViewType>`

Registers a kind of view. Renders nothing itself; must be a direct child of `<Workspace>` (fragments are fine).

```tsx
<ViewType id="doc" title={(v) => String(v.params.path)} placement="stage" icon={<FileIcon />}>
  <Editor />
</ViewType>
```

| Prop | Type | Description |
| --- | --- | --- |
| `id` | `string` | **Required.** The type name used by `<View type>` and `open(type)`. |
| `title` | `string \| (view: ViewHandle) => string` | Tab label. Defaults to the type id. |
| `icon` | `ReactNode \| string` | Tab icon: a React node, or trusted SVG/HTML markup. |
| `children` | `ReactNode` | Content, rendered once per view. Use `useView()` inside. |
| `render` | `(view: ViewApi) => ReactNode` | Alternative to children: render from the view's state. |
| `accessory` | `ReactNode \| (view: ViewApi) => ReactNode` | Rendered in the tab bar while this view is selected. |
| `iframe` | `string \| (view: ViewHandle) => string` | Render an iframe with this URL instead of React content. Changing the URL reloads it. |
| `mount` | `(element, view) => void \| (() => void)` | Render vanilla content instead of React content. |
| `menu` | `MenuEntry[] \| (view: ViewHandle) => MenuEntry[]` | Items at the top of the panel menu while this view is selected. |
| `placement` | `Placement` | Default placement for `open()`. |
| `allow` | `{ stage?, side?, floating? }` | Regions users may drop it into. All `true` by default. |
| `singleton` | `boolean` | At most one instance. |
| `closable` | `boolean` | `false` removes the close button and ignores close commands. |
| `minSize` | `{ width, height }` | Content lays out at no less than this size and scales down below it. |
| `tabbar` | `"always" \| "auto" \| "never"` | Tab bar visibility. `"auto"` hides it while the view is alone in its panel; `"never"` always hides it. |
| `gestures` | `"content" \| "workspace"` | Who owns wheel/pinch gestures over the content. Default `"content"`. |
| `className` | `string` | Extra class on the view's surface. |

Content precedence: `iframe`, then `mount`, then `render`, then `children`.

**Content keeps its context.** Children render through portals, so they see React context from above `<Workspace>` — your stores, routers and themes work as usual.

**Changing props never remounts content.** Function props (`title`, `iframe`, `mount`, `menu`) are called through stable wrappers that read the latest render, so inline arrow functions are fine. Content only remounts if an iframe URL actually changes, or you switch a type between `iframe`, `mount` and React content.

### `MenuEntry`

```ts
type MenuEntry = MenuItem | "separator";
interface MenuItem {
  label: string;
  shortcut?: string; // display only, e.g. "⌘S"
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  run?(): void;
  items?: MenuItem[]; // a submenu
}
```

```tsx
<ViewType
  id="doc"
  menu={(view) => [
    { label: "Save", shortcut: "⌘S", run: () => save(view.params.path) },
    { label: "Word wrap", checked: wrap, run: toggleWrap },
  ]}
/>
```

## Layout components

Describe the **initial** layout. Read once, when the workspace mounts. See [Layout](./layout.md).

| Component | Props |
| --- | --- |
| `<Split>` | `axis?: "x" \| "y"` (default `"x"`), `weights?: number[]`, `id?: string` |
| `<Panel>` | `selected?: number`, `id?: string`. Children: `<View>`s. |
| `<View>` | `type: string`, `params?: object`, `id?: string`, `title?: string` |
| `<Stage>` | `backdrop?: ReactNode`, `empty?: ReactNode`, `id?: string` |

`<Stage backdrop>` renders behind the stage's panels (a canvas, wallpaper or grid); `<Stage empty>` renders when the stage has no panels. Both can use the workspace hooks.

## Hooks

### `useView`

```ts
function useView<P extends object = Params>(): ViewApi<P>;
```

The view whose content is rendering. Returns the [`ViewHandle`](./core-api.md#viewhandle) methods merged with its current state, and re-renders when that state changes. Presentation state (size, visibility) settles after motion, so this never re-renders per animation frame. Throws outside view content.

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

Params can be declared as an interface; the generics accept any object type.

```tsx
interface DocParams {
  path: string;
  readOnly?: boolean;
}

<ViewType<DocParams> id="doc" title={(v) => v.params.path} render={(view) => <Editor path={view.params.path} />} />;

function Toolbar() {
  const view = useView<DocParams>();
  return <span>{view.params.readOnly ? "Read only" : view.params.path}</span>;
}
```

### `useOptionalView`

```ts
function useOptionalView(): ViewHandle | null;
```

The raw view handle, or `null` outside view content. Doesn't subscribe to state. Useful in shared components that may or may not render inside a view.

### `useViewTitle`

```ts
function useViewTitle(title: string | null | undefined): void;
```

Keeps the tab title in sync with a value. Empty values are ignored. The title is stored in the document like `setTitle()`.

```tsx
useViewTitle(dirty ? `${name} •` : name);
```

### `useViewBadge`

```ts
function useViewBadge(badge: string | number | null | undefined): void;
```

Shows a badge on the view's tab, and clears it on unmount. Pass `true` for a dot — the conventional "unsaved changes" marker, which swaps with the close button on hover.

```tsx
useViewBadge(dirty); // a dot while dirty
useViewBadge(errors || null); // a count, or nothing
```

### `useCloseGuard`

```ts
function useCloseGuard(guard: () => boolean | Promise<boolean>): void;
```

Veto closing: return `false` (or resolve `false`) to keep the view open. Runs for the close button, menus, shortcuts and `close()` — not for `close({ force: true })`. Always calls the latest guard.

```tsx
useCloseGuard(async () => !dirty || (await confirmDialog("Discard changes?")));
```

### `useWorkspace`

```ts
function useWorkspace(): WorkspaceHandle;
```

The imperative handle — inside view content, stage slots and `Workspace.Chrome`/`Workspace.Empty`, and anywhere under a [`<WorkspaceProvider>`](#workspaceprovider) once the workspace has mounted. Throws otherwise; elsewhere, use the `ref` prop.

### `useOptionalWorkspace`

```ts
function useOptionalWorkspace(): WorkspaceHandle | null;
```

Like `useWorkspace`, but returns `null` instead of throwing.

### `useWorkspaceState`

```ts
function useWorkspaceState(): WorkspaceSnapshot;
```

Subscribes to the whole [snapshot](./core-api.md#workspacesnapshot) — layout, focus, hidden panels, navigation. Re-renders on every change; prefer `useWorkspaceSelector` for narrow reads.

### `useWorkspaceSelector`

```ts
function useWorkspaceSelector<T>(select: (s: WorkspaceSnapshot) => T, equal?: (a: T, b: T) => boolean): T;
```

Re-renders only when the selected value changes (by `Object.is`, or your `equal`).

```tsx
const framed = useWorkspaceSelector((s) => s.framed);
const docCount = useWorkspaceSelector((s) => s.views.filter((v) => v.type === "doc").length);
const hiddenIds = useWorkspaceSelector(
  (s) => s.hidden.map((h) => h.panelId),
  (a, b) => a.join() === b.join(),
);
```

## Re-exports

`layout`, `createDocument` and `formatCombo` are re-exported from the core so React apps need only one import. See [Core API](./core-api.md).

## Server rendering

`<Workspace>` renders an empty host `div` on the server and creates the workspace after hydration. View content renders on the client only.
