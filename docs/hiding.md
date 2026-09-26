---
title: Hiding and building a dock
description: Hide and restore panels with animation, and render your own dock, tray or window menu.
section: Guides
order: 15
nav: Hiding and docks
---

# Hiding and building a dock

Hiding takes a panel out of the layout without closing anything. Its views stay mounted and keep their state. Trellis remembers where the panel was, and `restore()` puts it back. With the snapshot's `hidden` list, you can build a dock, a tray of minimized palettes or a _Window_ menu.

## Hide and restore

```ts
ws.hide(panelId); // hide a whole panel
ws.hide("layers"); // hide one view
ws.restore(panelId); // an id from snapshot.hidden
```

What gets hidden depends on the id:

- A panel id hides the whole panel. So does the id of a view that's alone in its panel.
- The id of a view that shares its panel hides only that tab. The rest of the panel stays put, and `restore()` puts the tab back into the same panel. The tab animates out of its panel toward `toward`, like a whole panel does.

Users can also hide a panel with **Hide** in its menu. To animate it into your dock, see [the built-in Hide](#the-built-in-hide). The `panel.hide` keyboard command exists but has no default shortcut.

### Animating toward a button

To animate the panel shrinking into an element, such as your dock icon, pass `toward`. To grow it back out of one, pass `from`:

```ts
ws.hide(panelId, { toward: dockButton });
ws.restore(panelId, { from: dockButton });
```

Both accept an `Element` or a `Rect` in pixels relative to the workspace's top-left corner. The whole window, chrome and content, flies into the target over 300 ms and back out of it over 380 ms. Both use `cubic-bezier(.2, .75, .2, 1)` and fade to 10% opacity at the small end.

Without `toward`, the panel shrinks and fades toward the bottom of where it was. Without `from`, a restored panel fades in where it lands. With reduced motion, both happen instantly.

`open()` takes the same kind of target: `ws.open("notes", { from: launcher })` grows a new panel out of a launcher. See [Opening views](./opening-views.md#launching-from-a-button).

### The built-in Hide

The panel menu's **Hide** item doesn't know where your dock is. Tell it with `hideToward`, a workspace option and `<Workspace>` prop. It receives the panel id and returns an `Element` or a `Rect`. Return nothing to get the default animation:

```tsx
<Workspace hideToward={() => document.querySelector(".dock")}>{/* … */}</Workspace>
```

```ts
createWorkspace(el, {
  types,
  hideToward: (panelId) => (panelId === "panel-tools" ? toolsButton : dock),
});
```

### Where panels come back

A hidden panel remembers how to return:

- A floating panel returns to the same rect and layer.
- A docked panel returns beside the neighbour that absorbed its space, at the same share.
- The stage's only panel returns into the stage.
- A single hidden tab returns into the panel it came from.

If that spot no longer exists, for example because its neighbour was closed, the panel comes back floating near the middle of the workspace. Restoring focuses the panel's selected view.

Revealing a hidden view another way also restores its panel. That includes `open()` with `reuse` and `focus(viewId)`.

## Reading hidden panels

`getSnapshot().hidden` lists hidden panels in the order they were hidden. A single hidden tab gets its own entry:

```ts
interface HiddenEntry {
  panelId: string;
  views: ViewInfo[]; // id, type, params, title, …
}
```

A view inside a hidden panel reports `placement: "hidden"` and `visible: false`.

## A dock in React

Anything rendered inside `<Workspace>` can use the workspace hooks. That includes `<Workspace.Chrome>`, a full-size overlay layer:

```tsx
import { useWorkspace, useWorkspaceSelector, Workspace } from "@danfessler/trellis-react";

function Dock() {
  const ws = useWorkspace();
  const hidden = useWorkspaceSelector((s) => s.hidden);
  return (
    <nav className="dock">
      {hidden.map(({ panelId, views }) => (
        <button key={panelId} onClick={(e) => ws.restore(panelId, { from: e.currentTarget })}>
          {views.map((v) => v.title).join(", ")}
        </button>
      ))}
    </nav>
  );
}

<Workspace>
  {/* …types and layout… */}
  <Workspace.Chrome>
    <Dock />
  </Workspace.Chrome>
</Workspace>;
```

The chrome layer ignores pointer events itself, but its direct children receive them. Position your dock absolutely within it:

```css
.dock {
  position: absolute;
  left: 50%;
  bottom: 12px;
  translate: -50% 0;
  display: flex;
  gap: 6px;
}
```

### Minimize buttons

To let panels minimize themselves into the dock, give the view type an `accessory`. It renders in the tab bar while the view is selected. Hiding by `view.panelId` hides the whole panel, with the animation:

```tsx
function MinimizeButton() {
  const view = useView();
  return (
    <button
      aria-label="Minimize"
      onClick={() =>
        view.workspace.hide(view.panelId, { toward: document.querySelector(".dock") ?? undefined })
      }
    >
      –
    </button>
  );
}

<ViewType id="notes" title="Notes" accessory={<MinimizeButton />}>
  <Notes />
</ViewType>;
```

`view.hide()` hides only that view (or its panel, if it's alone), without a `toward` target.

## A dock in vanilla

This version rebuilds the dock's buttons whenever the workspace changes:

```ts
const dock = document.querySelector<HTMLElement>(".dock")!;
const render = () => {
  dock.replaceChildren(
    ...ws.getSnapshot().hidden.map(({ panelId, views }) => {
      const button = document.createElement("button");
      button.textContent = views.map((v) => v.title).join(", ");
      button.onclick = () => ws.restore(panelId, { from: button });
      return button;
    }),
  );
};
ws.subscribe(render);
render();
```

`subscribe` fires on any state change. `getSnapshot()` is cached between changes, so this is cheap.

## Hidden panels and persistence

Hidden panels are part of the document (`document.hidden`) and persist with it. A palette hidden yesterday is still in the dock today.
