---
title: Installation
description: Install the packages, include the stylesheet and give the workspace a size.
section: Getting started
order: 2
---

# Installation

Trellis ships as a small core plus adapters. Install the core, then the adapter for your framework.

## React

To use Trellis with React, install the core and the React adapter:

```bash
npm install @danfessler/trellis @danfessler/trellis-react
```

`@danfessler/trellis-react` requires React 18.3 or newer, and supports React 19. It lists the core as a peer dependency, so install both.

## Vanilla JavaScript / TypeScript

Without a framework, you only need the core:

```bash
npm install @danfessler/trellis
```

The core has no runtime dependencies. It's published as ES modules with TypeScript declarations.

## Include the stylesheet

One stylesheet styles the tab bars, dividers, menus and drop slots. Import it once, anywhere in your app:

```ts
import "@danfessler/trellis/style.css";
```

Each rule in it is wrapped in `:where()`, so it has zero specificity and your own CSS wins. See [Theming](./theming.md).

## Give the workspace a size

A workspace fills its host element (`width: 100%; height: 100%`) and doesn't grow to fit its content. The host must have a height, and the most common mistake is mounting into an element whose height is `auto`. For a full-page app, give each ancestor a height:

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

> **Tip** A workspace doesn't have to be full-screen. The live demo on the Trellis homepage is a normal element in a scrolling page.

## Browser support

Trellis targets current evergreen browsers: Chrome, Edge, Firefox and Safari. It uses `ResizeObserver`, pointer events, CSS custom properties, `color-mix()` and the `:has()` selector.

## Next

- [Quick start (React)](./quick-start-react.md)
- [Quick start (vanilla)](./quick-start-vanilla.md)
