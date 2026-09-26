---
title: Web component
description: The <trellis-workspace> custom element from @danfessler/trellis-element, for Trellis in plain HTML.
section: Reference
order: 32
---

# Web component

> **Warning** `@danfessler/trellis-element` is new and still in development. Its attributes and events may change before 1.0. The core API underneath it is the same as everywhere else.

`<trellis-workspace>` is a custom element that wraps `createWorkspace()`. It renders in the light DOM, so you can declare a workspace in HTML and use it from any framework, or without one.

## Install

```bash
npm install @danfessler/trellis-element @danfessler/trellis
```

```ts
import "@danfessler/trellis-element"; // registers <trellis-workspace>
import "@danfessler/trellis/style.css";
```

Without a bundler, import `@danfessler/trellis-element/standalone`, a single self-contained module, and link `@danfessler/trellis-element/style.css`.

Importing the package registers `<trellis-workspace>`. To use another tag name as well, call `defineTrellisElement()` with it:

```ts
import { defineTrellisElement } from "@danfessler/trellis-element";

defineTrellisElement("app-workspace");
```

The package also re-exports everything from `@danfessler/trellis`, such as `layout` and `formatCombo`, so you don't need a second import for them.

## Declaring a workspace

Declare view types, a layout and slot content as children of the element:

```html
<trellis-workspace theme="dark" storage-key="notes-app" version="1" style="height: 100vh">
  <template data-view-type="notes" data-title="Notes" data-singleton>
    <textarea placeholder="Type, then move this panel…"></textarea>
  </template>
  <template data-view-type="doc" data-title="Document" data-placement="stage">
    <h2 data-param="name"></h2>
  </template>
  <template data-view-type="web" data-title="Web" data-iframe="https://example.com/{page}"></template>

  <trellis-split weights="1 3">
    <trellis-view type="notes"></trellis-view>
    <trellis-stage>
      <trellis-panel>
        <trellis-view type="doc" params='{"name":"index.html"}'></trellis-view>
        <trellis-view type="web" params='{"page":"about"}'></trellis-view>
      </trellis-panel>
    </trellis-stage>
  </trellis-split>

  <div slot="stage-empty">Nothing open.</div>
</trellis-workspace>
```

Each `<template data-view-type>` defines a view type. Each view gets a clone of the template's content, and elements with `data-param="name"` are filled with that param. When a view's content mounts, a `trellis-mount` event bubbles from it with `detail: { view }`, so your scripts can wire it up.

The layout is one root element built from `<trellis-split>`, `<trellis-panel>`, `<trellis-view>` and `<trellis-stage>`.

Children with `slot="backdrop"`, `"stage-empty"`, `"empty"` or `"chrome"` move into the matching [workspace slot](./core-api.md#slots).

### Template attributes

These attributes on a `<template>` map to [`ViewTypeDefinition`](./core-api.md#viewtypedefinition) fields. Boolean attributes are `true` when present, and `"false"` makes them `false`.

| Attribute                                                    | Field       | Description                                                                                              |
| ------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------- |
| `data-view-type`                                             |             | **Required.** The type id.                                                                               |
| `data-title`                                                 | `title`     | The tab label. Defaults to the type id.                                                                  |
| `data-icon`                                                  | `icon`      | The tab icon, as trusted SVG/HTML markup.                                                                |
| `data-placement`                                             | `placement` | The default placement for `open()`: `stage`, `side`, `tab` or `float`.                                   |
| `data-singleton`                                             | `singleton` | Allows at most one instance. `open()` focuses the existing one.                                          |
| `data-closable`                                              | `closable`  | `false` removes the close button and ignores close commands.                                             |
| `data-allow-stage`, `data-allow-side`, `data-allow-floating` | `allow`     | The regions users may drop this view into. Every region is allowed by default.                           |
| `data-min-width`, `data-min-height`                          | `minSize`   | The smallest size content lays out at. Below it, content scales down.                                    |
| `data-gestures="workspace"`                                  | `gestures`  | Lets a plain wheel over the content zoom the workspace.                                                  |
| `data-tabbar`                                                | `tabbar`    | When the tab bar shows: `auto`, `never` or `overlay`. See [Tab bar modes](./core-api.md#tab-bar-modes).  |
| `data-class`                                                 | `className` | An extra class on the view's surface.                                                                    |
| `data-iframe`                                                | `iframe`    | Renders an iframe of this URL instead of the template. `{param}` placeholders become URL-encoded params. |

### Layout elements

| Element           | Attributes                                                |
| ----------------- | --------------------------------------------------------- |
| `<trellis-split>` | `axis="x"` (default) or `"y"`, and `weights="1 3"`        |
| `<trellis-panel>` | `selected` (index) and `panel-id`                         |
| `<trellis-view>`  | `type`, `params` (JSON), `title`, and `view-id` (or `id`) |
| `<trellis-stage>` | `stage-id`                                                |

## Element attributes

These attributes on `<trellis-workspace>` map to [`WorkspaceOptions`](./core-api.md#workspaceoptions):

| Attribute     | Option            | Default       | Description                                                                                                         |
| ------------- | ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `theme`       | `theme`           | `"system"`    | The built-in theme.                                                                                                 |
| `tab-fill`    | `tabs.fill`       | `false`       | Stretches tabs across the tab row. A boolean attribute.                                                             |
| `tab-inset`   | `tabs.inset`      | `4`           | The space around tabs, in pixels.                                                                                   |
| `floating`    | `floating`        | `"overlay"`   | The layer floating panels live in: `"false"`, `"stage"` or `"overlay"`.                                             |
| `navigation`  | `navigation`      | `"focus"`     | The navigation mode: `"false"`, `"focus"` or `"free"`. See [Navigation](./navigation.md).                           |
| `motion`      | `motion`          | `"system"`    | The animation policy.                                                                                               |
| `panel-menu`  | `panelMenu`       | `true`        | Turns the built-in menu items on or off. To pass a function or `renderMenu`, use the `options` property.            |
| `storage-key` | `persist.key`     |               | Saves the layout to `localStorage` under this key and restores it from there. Read once, when the workspace mounts. |
| `version`     | `persist.version` |               | Your layout version. A saved layout with a different `version` is discarded. Read once, when the workspace mounts.  |
| `label`       | `label`           | `"Workspace"` | The accessible name of the workspace region. Read once, when the workspace mounts.                                  |

`theme`, `floating`, `navigation`, `motion`, `panel-menu`, `tab-fill` and `tab-inset` can change at any time.

## Properties

| Property        | Description                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `workspace`     | The [`WorkspaceHandle`](./core-api.md#workspacehandle), or `null` before the element connects.     |
| `types`         | Extra `ViewTypeDefinition`s, merged over template types. Use it for types with a `mount` function. |
| `options`       | Any other workspace options, such as `tokens` and `keymap`. They override attributes.              |
| `defaultLayout` | A layout spec or document to use instead of layout markup. Read once, when the workspace mounts.   |
| `document`      | The current document. Setting it replaces the layout, animated.                                    |

This script registers a type with a `mount` function, then opens it when the workspace is ready:

```ts
const el = document.querySelector("trellis-workspace")!;
el.types = {
  chart: { title: "Chart", mount: (element, view) => renderChart(element, view.params) },
};
el.addEventListener("trellis-ready", () => el.workspace!.open("chart", { placement: "float" }));
```

## Events

All events bubble, and `detail` carries the core event's payload:

| Event                           | `detail`                        |
| ------------------------------- | ------------------------------- |
| `trellis-ready`                 | The `WorkspaceHandle`.          |
| `trellis-change`                | The `LayoutDocument`.           |
| `trellis-open`, `trellis-close` | A `ViewInfo`.                   |
| `trellis-focus`                 | The focused view id, or `null`. |
| `trellis-navigate`              | The framed node id, or `null`.  |

The element creates its workspace after its children are parsed, and destroys the workspace when the element is removed from the document.
