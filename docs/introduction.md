---
title: Introduction
description: What Trellis is, what it is for, and how it is put together.
section: Getting started
order: 1
---

# Introduction

Trellis gives web-based tools — art programs, IDEs, editors, dashboards — a dockable, zoomable workspace. Users drag tabs between panels, dock them against any edge, float them, hide them to a tray, and zoom into a single panel. Your content renders once and never remounts.

It is the successor in spirit to react-dockable, rebuilt from scratch as a framework-agnostic engine with thin adapters, and with the animated motion from the prototype.

## What makes it different

**Content mounts once.** Each view renders into a container that never moves in the DOM. Docking, tabbing, floating, hiding and zooming only reposition that container. An `<iframe>` keeps its session, a `<canvas>` keeps its pixels, a WebGL context is never lost, and React components keep their state.

**Motion is part of the model.** Picking up a panel, dropping it, maximizing and hiding are animated. Views are told their new size once motion settles instead of on every frame, so expensive content does not re-layout sixty times a second.

**It has opinions about pro tools.** A workspace can have a _stage_ — the primary region where documents open. Panels can float over the stage or over the whole app. Any docked panel — or a window floating in the stage — can be maximized with an animated zoom, and in _free_ navigation users can pinch or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>-scroll around the workspace like a canvas.

**Rules instead of callbacks.** View types declare where they may be docked (`allow`), where they open (`placement`), whether only one may exist (`singleton`), whether they can be closed, and a minimum layout size. Trellis enforces the rules during drags and in `open()`.

**Everything is one JSON document.** The whole layout — splits, panels, floating and hidden panels, view params — is a serializable `LayoutDocument`. Persist it with one option or control it yourself.

## Packages

| Package                       | What it is                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@danfessler/trellis`         | The framework-agnostic core: `createWorkspace()`, the `layout` builder and the stylesheet. No runtime dependencies. |
| `@danfessler/trellis-react`   | React bindings: `<Workspace>`, `<ViewType>`, declarative layout components and hooks.                               |
| `@danfessler/trellis-element` | A `<trellis-workspace>` custom element for any framework, or none. _In development._                                |

## A first look

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

That is a complete workspace: users can drag the Layers tab to any edge, float it, maximize the canvas, and open more canvases into the stage.

## Where to next

- [Installation](./installation.md) — packages, the stylesheet and sizing the host element.
- [Quick start (React)](./quick-start-react.md) or [Quick start (vanilla)](./quick-start-vanilla.md) — a working workspace in a few minutes.
- [Concepts](./concepts.md) — view types, views, panels, splits, the stage, floating and navigation.
