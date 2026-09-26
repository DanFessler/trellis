---
title: FAQ
description: Common questions about Trellis, covering remounting, frameworks, sizing, performance, SSR and licensing.
section: More
order: 41
---

# FAQ

### Does my content remount when users move views?

No. Each view's content element is created once, appended to the workspace once, and isn't moved in the DOM after that. Docking, tabbing, floating, hiding, maximizing and resizing reposition it with CSS. React renders content into it through a portal whose container doesn't change, so React doesn't unmount it.

Content is torn down when the view closes. It's also recreated when an iframe's computed options change, or when you switch how a type renders.

### Why is my workspace blank?

Usually the host has no height. A workspace fills its host and doesn't size itself to its content. Give the parent an explicit height, such as `100vh`, a flex child with `min-height: 0`, or a grid area. See [Installation](./installation.md#give-the-workspace-a-size).

### Why doesn't changing my JSX layout do anything?

Layout components describe the _initial_ layout and are read once. After that, users own the layout. Use `open()`, `dock()`, `float()` or `setDocument()` to change it from code, and bump `version` if a persisted layout is getting in the way.

### Can I wrap `<View>`s or `<ViewType>`s in my own components?

Not in the layout. `<Workspace>` inspects its children's element types directly and doesn't render your components to find what's inside them. Use fragments, arrays (`types.map(…)`) or data layouts with the `layout` builder instead.

### How do I declare a floating panel in the initial layout?

In React, wrap a `<Panel>` or `<View>` in `<Floating rect={{ x, y, w, h }} layer="stage">` among the workspace's children. With data, pass `createDocument(spec, { floating: [{ panel, rect, layer }] })` as `defaultLayout`. See [Layout](./layout.md#floating-panels-in-jsx).

### How do I stop my canvas or editor re-rendering during animations?

The content element is resized during motion, but `view.size` and the `resize` event update only once motion settles. Size expensive content from `view.size` (or `resize`) rather than a `ResizeObserver` on the element. It then lays out once per change.

### Can I use Trellis with Vue, Svelte, Solid or Angular?

Yes. The core is framework-agnostic. Render into `mount(element, view)` with any framework, and return a cleanup function. For HTML-first apps there's also a [custom element](./web-component.md).

### Does it work with server-side rendering?

The React adapter renders an empty host on the server and creates the workspace on the client after hydration. Importing the packages on the server is safe.

### Why does my iframe reload when I change its params?

If the type computes its `iframe` URL (or `srcdoc`) from params, a params change produces new options, and new options reload the frame. That's by design. A params change that leaves the computed options equal doesn't reload it.

For live previews, keep the URL fixed and push updates with `postMessage` to `view.element.querySelector("iframe")`. See [A live preview iframe](./recipes.md#a-live-preview-iframe).

### Can I maximize a floating window?

Not directly. Floating windows belong to their desktop and aren't camera targets. `ws.navigation.toggle(id)` returns `false` for them, and double-clicking a floating window's tab bar frames the stage it lives on.

Dock it first. `ws.toggleDock(id)`, or **Dock beside stage** in its menu, docks it beside the stage and frames both. You can then maximize it like any docked panel. Calling `toggleDock()` again floats it back at its previous size.

### Does dragging over an iframe work?

Yes. While a drag, resize or navigation gesture is in progress, content is made non-interactive, so iframes can't capture the pointer. Clicking into an iframe still focuses its view.

### Can users zoom with a trackpad?

Yes. In `navigation="free"`, scrolling over the workspace's chrome, gaps or stage zooms it. Pinching, which browsers report as <kbd>Ctrl</kbd>+wheel, zooms faster. When the gesture ends, the camera springs to the best fit. There's no wheel panning.

Over your content, a plain scroll stays with the content unless the type sets `gestures: "workspace"`. Holding <kbd>Ctrl</kbd> (a pinch) or <kbd>Alt</kbd> zooms the workspace from anywhere. Touch pinches work too.

Wheel and pinch events inside an iframe don't reach the workspace at all. See [Zoom gestures over iframes](./recipes.md#zoom-gestures-over-iframes).

### How big is it?

The core has no runtime dependencies and is about 33 kB minified and gzipped. The React adapter adds about 3 kB, and the stylesheet about 4 kB.

### Is Trellis open source?

It's source-available under a three-tier license. Non-commercial use is free. Commercial use by organizations with up to ten developers needs a GitHub Sponsorship, and beyond that you need an enterprise license. See [License](./license.md).

### How does Trellis relate to react-dockable?

Trellis is the successor in spirit, by the same author. It was rebuilt from scratch around a framework-agnostic core and a serializable document model, and it adds a stage, floating layers, navigation and motion. Options like react-dockable's `hideTabsWhenSingle` have equivalents. For that one, it's the `tabbar: "auto"` view type rule. See [Migrating from react-dockable](./migrating-from-react-dockable.md).
