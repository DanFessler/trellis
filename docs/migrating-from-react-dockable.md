---
title: Migrating from react-dockable
description: How react-dockable's Root, Panel, Window and Tab map onto Trellis, and what changes.
section: More
order: 43
nav: From react-dockable
---

# Migrating from react-dockable

Trellis is the successor to [react-dockable](https://github.com/DanFessler/react-dockable). The ideas carry over: a declarative initial layout, a serializable layout you can persist, and themes. Trellis also separates _what can be opened_ from _where things are_. It adds a stage, floating panels, hiding and animated navigation, and it runs on a framework-agnostic core.

## Names

| react-dockable                      | Trellis                                                           | Notes                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Dockable.Root`                     | `<Workspace>`                                                     |                                                                                       |
| `Dockable.Panel` (a row/column)     | `<Split axis="x" \| "y">`                                         | `size` becomes `weights` on the split.                                                |
| `Dockable.Window` (a tab group)     | `<Panel>`                                                         | `selected` is still an index.                                                         |
| `Dockable.Tab` (content + identity) | `<ViewType>` **and** `<View>`                                     | See below.                                                                            |
| `layout` / `onChange`               | `document` / `onDocumentChange`                                   | A different, versioned format.                                                        |
| `useDockableLocalStorage(version)`  | `storageKey` + `version` props                                    | Built in.                                                                             |
| `theme`                             | `theme`                                                           | Same four presets, plus `"system"`.                                                   |
| `gap`, `radius`                     | `tokens={{ "--trellis-gap": "6px", "--trellis-radius": "10px" }}` | All styling is CSS custom properties.                                                 |
| `hideTabsWhenSingle`                | `tabbar="auto"` on a view type                                    |                                                                                       |
| `hideTabs` / `chromeless`           | `tabbar="never"` on a view type                                   |                                                                                       |
| `actions` (tab menu)                | `menu` on a view type                                             | Items use `run` instead of `onClick`; nest with `items`, separate with `"separator"`. |

## Tabs become view types and views

In react-dockable a `Tab` was both a piece of content and its place in the layout, so each tab existed exactly once. Trellis splits those roles:

- A **view type** says what _can_ be opened (title, icon, rules and content).
- A **view** is one open instance, with an id and params, placed in the layout.

```tsx
// react-dockable
<Dockable.Root>
  <Dockable.Tab id="layers" name="Layers">
    <Layers />
  </Dockable.Tab>
  <Dockable.Panel size={3}>
    <Dockable.Window>
      <Dockable.Tab id="doc-1" name="Sketch">
        <Canvas file="sketch.png" />
      </Dockable.Tab>
    </Dockable.Window>
  </Dockable.Panel>
</Dockable.Root>
```

```tsx
// Trellis
<Workspace>
  <ViewType id="layers" title="Layers" singleton>
    <Layers />
  </ViewType>
  <ViewType
    id="canvas"
    title={(v) => String(v.params.file)}
    render={(v) => <Canvas file={v.params.file} />}
  />

  <Split weights={[1, 3]}>
    <View type="layers" />
    <Panel>
      <View type="canvas" id="doc-1" params={{ file: "sketch.png" }} />
    </Panel>
  </Split>
</Workspace>
```

The same type can now be opened any number of times with `ws.open("canvas", { params: { file } })`. A missing type in a saved layout shows a placeholder instead of throwing.

## Consider a stage

Most tools have a main area for documents, a canvas or an editor. Wrapping it in `<Stage>` makes it the default destination for new views. An empty stage doesn't collapse, and you can show `empty` content in it instead. Rules like `allow={{ stage: false }}` keep tool panels out of it.

## Persisted layouts

react-dockable layouts can't be loaded directly. Bump your storage key or `version` so users start from your new default layout. Trellis ignores a persisted document whose version doesn't match.

## What's new

- Moving, tabbing, floating, hiding and maximizing don't remount content, so iframes, canvases and React state stay intact.
- Floating panels (`floating="overlay"` or `"stage"`), hide/restore, and animated maximize or free zoom (`navigation`).
- Drag and drop that previews in the real layout, where neighbours slide aside to open a slot. Targets include tab bars, panel edges, the gaps between panels and the workspace's outer edge. See [Interaction model](./interaction.md).
- An imperative handle (`ref` or `useWorkspace()`) with `open`, `close`, `float`, `dock`, `toggleDock`, `hide`, `restore` and `navigation`.
- Vanilla JavaScript and a `<trellis-workspace>` custom element, sharing the same core.
