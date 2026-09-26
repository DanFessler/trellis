---
title: Installation
description: Install the packages, include the stylesheet and give the workspace a size.
section: Getting started
order: 2
---

# Installation

Trellis ships as a small core plus adapters. Install the core, then the adapter for your framework.

## React

```bash
npm install @danfessler/trellis @danfessler/trellis-react
```

`@danfessler/trellis-react` requires React 18.3 or newer (React 19 is supported) and lists the core as a peer dependency, so install both.

## Vanilla JavaScript / TypeScript

```bash
npm install @danfessler/trellis
```

The core has no runtime dependencies. It is published as ES modules with TypeScript declarations.

## Include the stylesheet

Trellis's chrome — tab bars, dividers, menus, drop previews — is styled by one stylesheet. Import it once, anywhere in your app:

```ts
import "@danfessler/trellis/style.css";
```

Every rule in it is wrapped in `:where()`, so it has zero specificity and any CSS you write wins. See [Theming](./theming.md).

## Give the workspace a size

A workspace fills its host element (`width: 100%; height: 100%`) and never grows to fit its content. The host must have a height — the most common mistake is mounting into an element whose height is `auto`.

```css
html,
body,
#app {
  height: 100%;
  margin: 0;
}
```

In React, `<Workspace>` renders a `div` with `width: 100%; height: 100%`, so its parent needs a height:

```tsx
<div style={{ height: "100vh" }}>
  <Workspace>{/* … */}</Workspace>
</div>
```

> **Tip** Workspaces can live anywhere, not only full-screen. The live demo on the Trellis homepage is a normal element in a scrolling page.

## Browser support

Trellis targets current evergreen browsers (Chrome, Edge, Firefox, Safari). It uses `ResizeObserver`, pointer events, CSS custom properties and `color-mix()`.

## Next

- [Quick start (React)](./quick-start-react.md)
- [Quick start (vanilla)](./quick-start-vanilla.md)
