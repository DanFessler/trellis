---
title: Introduction
description: What Trellis is, what it's for, and how the packages fit together.
section: Getting started
order: 1
---

# Introduction

Trellis is a layout engine for web apps where people arrange their own workspace, such as an art program or an IDE. Panels nest inside panels as deep as people like, and the view zooms to whichever part they need. Users drag tabs between panels, dock them against any edge, float them and hide them to a tray.

Trellis succeeds react-dockable. It's a rewrite from scratch: a framework-agnostic engine with thin adapters, and animated motion throughout.

## What makes it different

The layout is a space people move through. Nesting has no depth limit, so a workspace can hold far more tools than fit at once. People zoom to a panel, a group or a run of neighbours, step out a level with <kbd>Esc</kbd>, and come back to saved places. Panels too small to use show as icons until someone zooms in. See [Zoomable layouts](./zoomable-layouts.md).

Each view renders once, into a container that stays put in the DOM. Docking, tabbing, floating, hiding and zooming move the container, not the content. An `<iframe>` keeps its session, a `<canvas>` keeps its pixels and WebGL context, and React components keep their state. Content remounts only when what it renders changes, such as an iframe's URL.

Picking up a panel, dropping it, maximizing and hiding are all animated. While you drag, the layout opens a slot where the panel will land. Views learn their new size after motion settles, not on every frame, so expensive content doesn't re-layout sixty times a second.

A workspace can have a _stage_, the primary region where documents open. Panels can float over the stage or over the whole app. In _free_ navigation, users move around the workspace like a canvas by pinching, panning and stepping through levels, and the camera snaps to whatever fits best.

View types declare rules in place of callbacks. A type says where it may be docked (`allow`), where it opens (`placement`), whether only one may exist (`singleton`), whether it can be closed, and its minimum layout size. Trellis enforces these rules during drags and in `open()`.

The whole layout is a serializable `LayoutDocument`. It holds the splits, panels, floating and hidden panels, and view params. You can persist it with one option or control it yourself.

## Packages

| Package                       | What it is                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@danfessler/trellis`         | The framework-agnostic core: `createWorkspace()`, the `layout` builder and the stylesheet. No runtime dependencies. |
| `@danfessler/trellis-react`   | React bindings: `<Workspace>`, `<ViewType>`, declarative layout components and hooks.                               |
| `@danfessler/trellis-element` | A `<trellis-workspace>` custom element for any framework, or none. _In development._                                |

## A first look

Here's a complete workspace in React:

```tsx title="App.tsx"
import { Workspace, ViewType, Split, Stage, View } from "@danfessler/trellis-react";
import "@danfessler/trellis/style.css";

export function App() {
  return (
    <div style={{ height: "100vh" }}>
      <Workspace theme="dark">
        <ViewType id="layers" title="Layers" singleton allow={{ stage: false }}>
          <LayersPanel />
        </ViewType>
        <ViewType id="canvas" title={(v) => String(v.params.name)} placement="stage">
          <Canvas />
        </ViewType>

        <Split weights={[1, 4]}>
          <View type="layers" />
          <Stage>
            <View type="canvas" params={{ name: "Untitled.png" }} />
          </Stage>
        </Split>
      </Workspace>
    </div>
  );
}
```

Users can drag the Layers tab to any edge of the workspace, float it from its menu, maximize the canvas, and open more canvases into the stage.

## Where to next

- [Installation](./installation.md) covers the packages, the stylesheet and sizing the host element.
- [Quick start (React)](./quick-start-react.md) and [Quick start (vanilla)](./quick-start-vanilla.md) build a working workspace in a few minutes.
- [Zoomable layouts](./zoomable-layouts.md) explains nesting and zooming, and why they help.
- [Concepts](./concepts.md) explains view types, views, panels, splits, the stage, floating and navigation.
- [Interaction model](./interaction.md) describes how dragging, docking and navigation behave.
