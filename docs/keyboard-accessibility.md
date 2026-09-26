---
title: Keyboard & accessibility
description: Default shortcuts, remapping the keymap, ARIA roles, focus behaviour and reduced motion.
section: Guides
order: 18
nav: Keyboard & a11y
---

# Keyboard & accessibility

Everything users can do with a pointer has a keyboard path, and the chrome uses standard ARIA patterns so assistive technology understands it.

## Shortcuts

Workspace shortcuts are active while focus is inside the workspace, and act on the focused panel or view.

| Command               | Default                                          | Action                                        |
| --------------------- | ------------------------------------------------ | --------------------------------------------- |
| `frame.toggle`        | <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> | Maximize / restore the focused panel.         |
| `navigation.back`     | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd>       | Previous framing.                             |
| `navigation.forward`  | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>→</kbd>       | Next framing.                                 |
| `navigation.overview` | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd>       | Zoom out to everything.                       |
| `panel.next`          | <kbd>F6</kbd>                                    | Focus the next panel (docked, then floating). |
| `panel.previous`      | <kbd>Shift</kbd>+<kbd>F6</kbd>                   | Focus the previous panel.                     |
| `tab.next`            | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>]</kbd>       | Next tab in the focused panel.                |
| `tab.previous`        | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>[</kbd>       | Previous tab in the focused panel.            |
| `view.close`          | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>W</kbd>       | Close the focused view (if closable).         |
| `panel.float`         | —                                                | Float the focused panel.                      |
| `panel.hide`          | —                                                | Hide the focused panel.                       |

`Mod` is <kbd>⌘</kbd> on macOS and <kbd>Ctrl</kbd> on other platforms. <kbd>Esc</kbd> also steps back out of a maximized panel, unless focus is inside view content (so your content can use <kbd>Esc</kbd> itself). During a drag, <kbd>Esc</kbd> cancels it.

### Remapping

Pass a partial `keymap`. Set a command to `null` to disable it.

```ts
createWorkspace(el, {
  types,
  keymap: {
    "panel.float": "Mod+Alt+F",
    "panel.hide": "Mod+Alt+H",
    "view.close": null,
  },
});
```

```tsx
<Workspace keymap={{ "frame.toggle": "Mod+." }} />
```

Combos are modifiers and a key joined by `+`. Modifiers: `Mod`, `Ctrl` (or `Control`), `Meta` (or `Cmd`), `Alt` (or `Option`), `Shift`. The key is a `KeyboardEvent.key` name (`Enter`, `ArrowLeft`, `F6`, `Escape`) or a single character. Letters, digits and punctuation match by physical key, so `Mod+Alt+]` works regardless of what <kbd>Alt</kbd> types on the user's layout.

The panel menu shows the current shortcuts. To show them in your own UI, use `formatCombo()`:

```ts
import { DEFAULT_KEYMAP, formatCombo } from "@danfessler/trellis";

formatCombo(DEFAULT_KEYMAP["frame.toggle"]!); // "⇧⌘↩" on macOS, "Ctrl+Shift+Enter" elsewhere
```

### Running commands from code

```ts
ws.run("panel.next");
ws.run("frame.toggle");
```

Use it to wire commands into your app's own menus or command palette.

## Tabs

Each tab strip is a `tablist` with roving focus — only the selected tab is in the page's tab order.

| Key                                                | Action                                  |
| -------------------------------------------------- | --------------------------------------- |
| <kbd>←</kbd> / <kbd>→</kbd>                        | Select the previous / next tab (wraps). |
| <kbd>Home</kbd> / <kbd>End</kbd>                   | Select the first / last tab.            |
| <kbd>Enter</kbd> / <kbd>Space</kbd>                | Move focus into the view's content.     |
| <kbd>Delete</kbd>                                  | Close the selected view (if closable).  |
| <kbd>Shift</kbd>+<kbd>F10</kbd> or <kbd>Menu</kbd> | Open the panel menu.                    |

With a pointer: middle-click a tab to close it; right-click a tab bar for the panel menu.

Clicking a tab selects it and makes its view the focused view, but leaves DOM focus on the tab, so keyboard navigation of the tab strip keeps working. Content that wants keyboard focus when its view becomes focused can react to `view.focused` or the view's `focus` event.

When focus moves into content (<kbd>Enter</kbd> on a tab, `open()`, `focus()`), Trellis focuses the first element marked `autofocus`, else the first iframe, input or other focusable element, else the tab. It does so one frame later, so content an adapter renders (React components, for example) has mounted by then and its focusable elements can be found.

### Moving tabs without a pointer

The panel menu includes **Move _tab_ to ▸**, a submenu listing every other panel the selected view may go into, plus **New split right** and **New split below** when the panel has more than one tab. Together with **Float**/**Dock**, **Maximize** and **Hide**, everything drag and drop can do is reachable from the keyboard: focus a tab, press <kbd>Shift</kbd>+<kbd>F10</kbd>, and pick a destination.

## Dividers

Dividers are focusable `separator`s. <kbd>←</kbd>/<kbd>→</kbd> (or <kbd>↑</kbd>/<kbd>↓</kbd> for columns) move them by a small step; hold <kbd>Shift</kbd> for larger steps. Double-click evens out the two neighbours. Panels never shrink below a minimum usable size.

## Menus

Panel menus are ARIA `menu`s: <kbd>↑</kbd>/<kbd>↓</kbd>, <kbd>Home</kbd>/<kbd>End</kbd> to move, <kbd>Enter</kbd> to activate, <kbd>→</kbd> to open a submenu, <kbd>←</kbd> or <kbd>Esc</kbd> to close it, and <kbd>Tab</kbd> to dismiss. Focus returns to where it was when the menu closes.

## ARIA and announcements

- The workspace root is a `region` labelled by the `label` option (default "Workspace"). Give each workspace on a page a distinct label.
- Tabs use `tab`/`tabpanel` roles with `aria-selected` and `aria-controls`; surfaces are labelled by their tab.
- Close buttons have labels like "Close Layers".
- A polite live region announces moves, e.g. "Moved Layers" after a drop.
- Unselected surfaces and hidden panels are made `inert`, so their content is skipped by focus and assistive technology — while staying mounted.

## Focus tracking

Pointer or keyboard focus anywhere in a view's content focuses that view (including clicks into iframes). Focusing a view in a floating panel — by clicking into its content, `focus()` or `open()` — raises the panel to the front. The focused panel shows an accent indicator on its selected tab and gets `data-focused`. Listen with `ws.on("focus", …)`, `onFocus` in React, or read `focusedView`/`focusedPanel` from the snapshot.

## Reduced motion

The `motion` option controls animation:

| Value                  | Behaviour                                             |
| ---------------------- | ----------------------------------------------------- |
| `"system"` _(default)_ | Animate unless the user's OS asks for reduced motion. |
| `"reduced"`            | Never animate layout or camera moves.                 |
| `"full"`               | Always animate.                                       |

With reduced motion, panels and the camera jump to their destination, and the appear animation and menu transitions are skipped.
