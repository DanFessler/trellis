---
title: Keyboard and accessibility
description: Default shortcuts, remapping the keymap, ARIA roles, focus behaviour and reduced motion.
section: Guides
order: 18
nav: Keyboard and a11y
---

# Keyboard and accessibility

Trellis gives pointer actions a keyboard path, and its chrome uses standard ARIA patterns so assistive technology can understand it.

## Shortcuts

Workspace shortcuts are active while focus is inside the workspace. They act on the focused panel or view.

| Command               | Default                                          | Action                                        |
| --------------------- | ------------------------------------------------ | --------------------------------------------- |
| `frame.toggle`        | <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> | Maximize or restore the focused panel.        |
| `navigation.back`     | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd>       | Previous framing.                             |
| `navigation.forward`  | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>→</kbd>       | Next framing.                                 |
| `navigation.overview` | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd>       | Toggle the overview and the previous framing. |
| `panel.next`          | <kbd>F6</kbd>                                    | Focus the next panel (docked, then floating). |
| `panel.previous`      | <kbd>Shift</kbd>+<kbd>F6</kbd>                   | Focus the previous panel.                     |
| `tab.next`            | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>]</kbd>       | Next tab in the focused panel.                |
| `tab.previous`        | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>[</kbd>       | Previous tab in the focused panel.            |
| `view.close`          | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>W</kbd>       | Close the focused view (if closable).         |
| `panel.float`         | None                                             | Float the focused panel (`float()`).          |
| `panel.hide`          | None                                             | Hide the focused panel.                       |

`Mod` is <kbd>⌘</kbd> on macOS and <kbd>Ctrl</kbd> on other platforms. While the camera frames something, <kbd>Esc</kbd> steps out one level. It doesn't when focus is inside view content, so your content can use <kbd>Esc</kbd> itself. During a drag, <kbd>Esc</kbd> cancels it.

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

A combo can be a bare key. For example, `keymap: { "navigation.overview": "0" }` toggles the overview with <kbd>0</kbd>. Shortcuts fire wherever focus is inside the workspace, content included. Bind bare keys only when your content doesn't take text input.

Combos are modifiers and a key joined by `+`. The modifiers are `Mod`, `Ctrl` (or `Control`), `Meta` (or `Cmd`), `Alt` (or `Option`) and `Shift`. The key is a `KeyboardEvent.key` name (`Enter`, `ArrowLeft`, `F6`, `Escape`) or a single character. Letters, digits and punctuation match by physical key, so `Mod+Alt+]` works whatever <kbd>Alt</kbd> types on the user's keyboard layout.

The panel menu shows the current shortcuts. To show them in your own UI, use `formatCombo()`:

```ts
import { DEFAULT_KEYMAP, formatCombo } from "@danfessler/trellis";

formatCombo(DEFAULT_KEYMAP["frame.toggle"]!); // "⇧⌘↩" on macOS, "Ctrl+Shift+Enter" elsewhere
```

### Running commands from code

To wire commands into your app's own menus or command palette, call `run()`:

```ts
ws.run("panel.next");
ws.run("frame.toggle");
```

## Tabs

Each tab strip is a `tablist` with roving focus. Only the selected tab is in the page's tab order.

| Key                                                | Action                                   |
| -------------------------------------------------- | ---------------------------------------- |
| <kbd>←</kbd> / <kbd>→</kbd>                        | Select the previous or next tab (wraps). |
| <kbd>Home</kbd> / <kbd>End</kbd>                   | Select the first or last tab.            |
| <kbd>Enter</kbd> / <kbd>Space</kbd>                | Move focus into the view's content.      |
| <kbd>Delete</kbd>                                  | Close the selected view (if closable).   |
| <kbd>Shift</kbd>+<kbd>F10</kbd> or <kbd>Menu</kbd> | Open the panel menu.                     |

With a pointer, middle-click a tab to close it, or right-click a tab bar for the panel menu. If you [render menus yourself](./menus.md#render-menus-yourself), your menu takes over its keyboard support.

Clicking a tab selects it and makes its view the focused view. DOM focus stays on the tab, so keyboard navigation of the tab strip keeps working. If your content wants keyboard focus when its view becomes focused, react to `view.focused` or the view's `focus` event.

When focus moves into content (<kbd>Enter</kbd> on a tab, `open()`, `focus()`), Trellis focuses the first element marked `autofocus`. If there isn't one, it focuses the first iframe, input or other focusable element, and otherwise the tab. It waits one frame, so content an adapter renders (React components, for example) has mounted and its focusable elements can be found.

### Moving tabs without a pointer

The panel menu includes **Move _tab_ to ▸**, a submenu listing the other panels the selected view may go into. When the panel has more than one tab, the submenu also has **New split right** and **New split below**. The menu also has **Float** or **Dock** (**Dock beside stage** with `floating: "stage"`), **Maximize** and **Hide**. Together they cover what drag and drop can do: focus a tab, press <kbd>Shift</kbd>+<kbd>F10</kbd>, and pick a destination.

## Dividers

Dividers are focusable `separator`s. <kbd>←</kbd>/<kbd>→</kbd> (or <kbd>↑</kbd>/<kbd>↓</kbd> for columns) move them by a small step. Hold <kbd>Shift</kbd> for larger steps. Double-click a divider to even out its two neighbours. Panels don't shrink below a minimum usable size: past a neighbour's minimum, a divider pushes the panels beyond it, the same as dragging.

## Menus

Panel menus are ARIA `menu`s. Use <kbd>↑</kbd>/<kbd>↓</kbd> and <kbd>Home</kbd>/<kbd>End</kbd> to move, <kbd>Enter</kbd> to activate, <kbd>→</kbd> to open a submenu, <kbd>←</kbd> or <kbd>Esc</kbd> to close it, and <kbd>Tab</kbd> to dismiss. When the menu closes, focus returns to where it was.

## ARIA and announcements

- The workspace root is a `region` labelled by the `label` option (default "Workspace"). Give each workspace on a page a distinct label.
- Tabs use `tab` and `tabpanel` roles with `aria-selected` and `aria-controls`. Surfaces are labelled by their tab.
- Close buttons have labels like "Close Layers".
- A polite live region announces "Moved" after a drop.
- Unselected surfaces and hidden panels are `inert`, so focus and assistive technology skip their content. The content stays mounted.

## Focus tracking

Pointer or keyboard focus anywhere in a view's content focuses that view, including clicks into iframes. Focusing a view in a floating panel raises the panel to the front, whether by clicking into its content, `focus()` or `open()`. The focused panel shows an accent indicator on its selected tab and gets `data-focused`. Listen with `ws.on("focus", …)` or `onFocus` in React, or read `focusedView` and `focusedPanel` from the snapshot.

## Reduced motion

The `motion` option controls animation:

| Value                  | Behaviour                                             |
| ---------------------- | ----------------------------------------------------- |
| `"system"` _(default)_ | Animate unless the user's OS asks for reduced motion. |
| `"reduced"`            | Don't animate layout or camera moves.                 |
| `"full"`               | Animate regardless of the OS setting.                 |

With reduced motion, panels and the camera jump to their destination, and a lifted window takes its compact size at once. Trellis skips the appear animation, hide and restore flights, and menu transitions. The 150 ms settle before a drop target previews still applies.
