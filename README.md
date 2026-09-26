# Trellis

**Dockable, zoomable workspaces for web tools.**

Trellis gives your app the layout system of a professional tool — tabbed panels that users drag, split, float, hide and maximize — with motion that feels physical and content that never loses its state. It is built for tool builders: art programs, IDEs, editors, dashboards and anything else where users arrange their own workspace.

- **State-preserving by design.** Each view's content is mounted once, into a container that never moves in the DOM. Docking, tabbing, floating, hiding and maximizing never remount it, so iframes don't reload and React state, canvases and editors stay exactly as they were.
- **A stage, not a desktop.** An optional primary region for your documents or canvas, with its own backdrop and empty state. Tool panels live around it; rules keep documents in the stage and tools out of it.
- **Motion that carries its weight.** Spring-driven framing, eased layout transitions and a lifted-drag feel, carried over from the prototype.
- **Framework-agnostic.** A small DOM core with thin adapters: React, a `<trellis-workspace>` custom element, or plain JavaScript.
- **Themeable.** Four built-in themes and a documented set of CSS custom properties, part attributes and state attributes. Every built-in rule has zero specificity, so your CSS wins.
- **Persistent.** One serializable layout document; save it, restore it, control it.

## Packages

| Package                                           |                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| [`@danfessler/trellis`](packages/core)            | The framework-agnostic core: model, runtime and styles.                    |
| [`@danfessler/trellis-react`](packages/react)     | React components and hooks.                                                |
| [`@danfessler/trellis-element`](packages/element) | `<trellis-workspace>` custom element, including a standalone script build. |

## Quick start (React)

```sh
npm install @danfessler/trellis @danfessler/trellis-react
```

```tsx
import { Workspace, ViewType, Split, Stage, Panel, View, useView } from "@danfessler/trellis-react";
import "@danfessler/trellis/style.css";

function Document() {
  const view = useView<{ file: string }>();
  return <Canvas file={view.params.file} />;
}

export function App() {
  return (
    <Workspace theme="dark" storageKey="my-app" version={1}>
      <ViewType id="document" title={(v) => String(v.params.file)} placement="stage" allow={{ side: false }}>
        <Document />
      </ViewType>
      <ViewType id="layers" title="Layers" singleton allow={{ stage: false }}>
        <Layers />
      </ViewType>

      <Split weights={[4, 1]}>
        <Stage empty={<OpenFilePrompt />}>
          <Panel>
            <View type="document" params={{ file: "cover.psd" }} />
          </Panel>
        </Stage>
        <View type="layers" />
      </Split>
    </Workspace>
  );
}
```

## Quick start (vanilla)

```ts
import { createWorkspace, layout as L } from "@danfessler/trellis";
import "@danfessler/trellis/style.css";

const ws = createWorkspace(document.getElementById("app")!, {
  types: {
    notes: { title: "Notes", mount: (el) => void (el.innerHTML = "<textarea></textarea>") },
    docs: { title: "Docs", iframe: "https://example.com" },
  },
  defaultLayout: L.row([L.view("notes"), L.stage(L.panel(L.view("docs")))], [1, 3]),
});

ws.open("notes", { placement: "float" });
```

## Development

```sh
npm install
npm run dev          # website and docs at http://localhost:5320
npm test             # unit tests (Vitest)
npm run test:e2e     # browser tests (Playwright: Chromium and Firefox; WebKit in CI)
npm run typecheck
npm run build        # the three packages
npm run build:all    # packages + website with examples (site/dist)
npm run verify:pack  # pack tarballs and build a fresh app against React 18 and 19
```

Examples live in [`examples/`](examples):

| Example                       | Shows                                                                                                | Run                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [`paint`](examples/paint)     | An art program: documents on the stage, tool palettes, floating navigator, close guards, persistence | `npm run dev -w trellis-example-paint`   |
| [`ide`](examples/ide)         | An editor with explorer, terminal, live-preview iframe, command palette and status bar               | `npm run dev -w trellis-example-ide`     |
| [`desktop`](examples/desktop) | The desktop rebuilt from public primitives: stage floats, free zoom, dock, minimap          | `npm run dev -w trellis-example-desktop` |
| [`vanilla`](examples/vanilla) | A framework-free ops dashboard, plus a `<trellis-workspace>` page declared in HTML                   | `npm run dev -w trellis-example-vanilla` |

## License

Trellis is free for non-commercial use. Commercial use requires an active [GitHub Sponsorship](https://github.com/sponsors/danfessler) at the applicable tier (organizations of 10 or fewer developers), and larger organizations need an enterprise license. See [LICENSE.md](LICENSE.md).
