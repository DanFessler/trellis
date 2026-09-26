---
title: FAQ
description: Common questions about Trellis — remounting, frameworks, sizing, performance, SSR and licensing.
section: More
order: 41
---

# FAQ

### Does my content really never remount?

Yes. Each view's content element is created once, appended to the workspace once, and never moved in the DOM. Docking, tabbing, floating, hiding, maximizing and resizing reposition it with CSS. React content is rendered into it through a portal whose container never changes, so React never unmounts it. Content is only torn down when the view closes (or when you change an iframe URL or switch how a type renders).

### Why is my workspace blank?

Almost always the host has no height. A workspace fills its host and never sizes itself to content. Give the parent an explicit height (`100vh`, a flex child with `min-height: 0`, a grid area…). See [Installation](./installation.md#give-the-workspace-a-size).

### Why doesn't changing my JSX layout do anything?

Layout components describe the *initial* layout and are read once. After that, users own the layout. Use `open()`, `dock()`, `float()` or `setDocument()` to change it from code, and bump `version` if a persisted layout is getting in the way.

### Can I wrap `<View>`s or `<ViewType>`s in my own components?

Not in the layout. `<Workspace>` inspects its children's element types directly and doesn't render your components to find what's inside them. Use fragments, arrays (`types.map(…)`) or data layouts with the `layout` builder instead.

### How do I declare a floating panel in the initial layout?

Use a data layout: `createDocument(spec, { floating: [{ panel, rect, layer }] })`, passed as `defaultLayout`. See [Layout](./layout.md#createdocument-and-initial-floats).

### My canvas/editor re-renders during animations. How do I avoid that?

It shouldn't need to. The content element is resized during motion, but `view.size` and the `resize` event update only once motion settles. Size expensive content from `view.size` (or `resize`) rather than a `ResizeObserver` on the element, and it'll lay out once per change.

### Can I use Trellis with Vue, Svelte, Solid or Angular?

Yes. The core is framework-agnostic: render into `mount(element, view)` with any framework, and return a cleanup. There's also a [custom element](./web-component.md) for HTML-first apps.

### Does it work with server-side rendering?

The React adapter renders an empty host on the server and creates the workspace on the client after hydration. Importing the packages on the server is safe.

### My iframe reloads when I change its params

If the type's `iframe` URL is computed from params, a params change produces a new URL, and a new URL means a reload — by design. Keep the URL fixed for live previews and push updates with `postMessage` to `view.element.querySelector("iframe")`.

### Iframes swallow mouse events — does dragging over them break?

No. While a drag, resize or navigation gesture is in progress, content is made non-interactive, so iframes can't capture the pointer. Clicking into an iframe still focuses its view.

### Can users zoom with a trackpad?

In `navigation="free"`, pinching (which browsers report as <kbd>Ctrl</kbd>+wheel) zooms the workspace, and two-finger scrolling pans while zoomed in. Over your content, those gestures stay with the content unless the type sets `gestures: "workspace"` or the user holds <kbd>Alt</kbd>.

### How big is it?

The core has no runtime dependencies and is roughly 25 kB minified and gzipped; the React adapter adds a few more kB; the stylesheet is about 3 kB gzipped.

### Is Trellis open source?

It's source-available under a three-tier license: free for non-commercial use, a GitHub Sponsorship for commercial use by organizations with up to ten developers, and an enterprise license beyond that. See [License](./license.md).

### How does Trellis relate to react-dockable?

It's the successor in spirit, by the same author: rebuilt from scratch around a framework-agnostic core, a serializable document model, a stage, floating layers, navigation and motion. Options like react-dockable's `hideTabsWhenSingle` have equivalents — here, the `tabbar: "auto"` view type rule.
