---
title: Web component
description: The <trellis-workspace> custom element from @danfessler/trellis-element — Trellis in plain HTML.
section: Reference
order: 32
---

# Web component

> **Warning** `@danfessler/trellis-element` is new and still in development. Its attributes and events may change before 1.0. The core API underneath it is the same as everywhere else.

`<trellis-workspace>` wraps `createWorkspace()` in a light-DOM custom element, so you can declare a workspace in HTML and use it from any framework — or none.

## Install

```bash
npm install @danfessler/trellis-element @danfessler/trellis
```

```ts
import "@danfessler/trellis-element"; // registers <trellis-workspace>
import "@danfessler/trellis/style.css";
```

Without a bundler, import `@danfessler/trellis-element/standalone` — a single self-contained module — and link `@danfessler/trellis-element/style.css`.

## Declaring a workspace

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

- **View types** are `<template data-view-type>` elements. Each view gets a clone of the template's content. Elements with `data-param="name"` are filled with that param. A `trellis-mount` event (`detail: { view }`) bubbles from each view's content when it mounts, for wiring up scripts.
- **The layout** is one root of `<trellis-split>`, `<trellis-panel>`, `<trellis-view>` and `<trellis-stage>`.
- **Slots**: children with `slot="backdrop"`, `"stage-empty"`, `"empty"` or `"chrome"` are moved into the matching workspace slot.

### Template attributes

| Attribute                                                    | Maps to                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `data-view-type`                                             | Type name.                                                                  |
| `data-title`, `data-icon`                                    | `title`, `icon` (markup).                                                   |
| `data-placement`                                             | `placement` (`stage`, `side`, `tab`, `float`).                              |
| `data-singleton`, `data-closable`                            | `singleton`, `closable` (present = true, `"false"` = false).                |
| `data-allow-stage`, `data-allow-side`, `data-allow-floating` | `allow` (`"false"` disallows).                                              |
| `data-min-width`, `data-min-height`                          | `minSize`.                                                                  |
| `data-gestures="workspace"`                                  | `gestures`.                                                                 |
| `data-tabbar`                                                | `tabbar` (`auto` or `never`).                                               |
| `data-class`                                                 | `className`.                                                                |
| `data-iframe`                                                | An iframe URL. `{param}` placeholders are replaced with URL-encoded params. |

### Layout elements

| Element           | Attributes                                            |
| ----------------- | ----------------------------------------------------- |
| `<trellis-split>` | `axis="x"` (default) or `"y"`; `weights="1 3"`        |
| `<trellis-panel>` | `selected` (index), `panel-id`                        |
| `<trellis-view>`  | `type`, `params` (JSON), `title`, `view-id` (or `id`) |
| `<trellis-stage>` | `stage-id`                                            |

## Element attributes

| Attribute                | Option                                         |
| ------------------------ | ---------------------------------------------- |
| `theme`                  | `theme`                                        |
| `floating`               | `floating` (`"false"`, `"stage"`, `"overlay"`) |
| `navigation`             | `navigation` (`"false"`, `"focus"`, `"free"`)  |
| `motion`                 | `motion`                                       |
| `panel-menu`             | `panelMenu`                                    |
| `storage-key`, `version` | `persist`                                      |
| `label`                  | `label`                                        |

`theme`, `floating`, `navigation`, `motion` and `panel-menu` can change at any time.

## Properties

| Property        | Description                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `workspace`     | The [`WorkspaceHandle`](./core-api.md#workspacehandle), or `null` before the element connects. |
| `types`         | Extra `ViewTypeDefinition`s, merged over template types — for types with a `mount` function.   |
| `options`       | Any other workspace options (`tokens`, `keymap`, …).                                           |
| `defaultLayout` | A layout spec or document, instead of layout markup. Set before the element connects.          |
| `document`      | Read the current document, or set one (animated).                                              |

```ts
const el = document.querySelector("trellis-workspace")!;
el.types = {
  chart: { title: "Chart", mount: (element, view) => renderChart(element, view.params) },
};
el.addEventListener("trellis-ready", () => el.workspace!.open("chart", { placement: "float" }));
```

## Events

All bubble; `detail` carries the core event's payload.

| Event                           | `detail`                        |
| ------------------------------- | ------------------------------- |
| `trellis-ready`                 | The `WorkspaceHandle`.          |
| `trellis-change`                | The `LayoutDocument`.           |
| `trellis-open`, `trellis-close` | A `ViewInfo`.                   |
| `trellis-focus`                 | The focused view id, or `null`. |
| `trellis-navigate`              | The framed node id, or `null`.  |

The element initializes once its children have been parsed, and destroys its workspace when it's removed from the document.
