---
title: Right to left
description: Mirrored layouts for right-to-left languages, and what changes for users and for your code.
section: Guides
order: 18.5
nav: Right to left
---

# Right to left

For right-to-left languages such as Arabic, Hebrew and Persian, Trellis mirrors the whole workspace. It follows the page's direction automatically:

```html
<html dir="rtl"></html>
```

To set it on the workspace instead, pass `direction`:

```ts
createWorkspace(el, { types, direction: "rtl" });
```

```tsx
<Workspace direction="rtl">{/* … */}</Workspace>
```

`direction` is `"auto"` by default, which follows the `dir` attribute or CSS `direction` around the workspace. `"ltr"` and `"rtl"` override the page. With `"auto"`, Trellis reads the direction when the workspace starts and on every `ws.update()`, so call `ws.update({})` after changing the page's direction.

## What mirrors

| Part          | Right to left                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout        | A row's first child sits on the right. Floating windows are placed from the right edge.                                                                    |
| Tabs          | Tabs run right to left, with the panel menu at the end. <kbd>←</kbd> selects the next tab.                                                                 |
| Menus         | Menus open toward the start edge. Submenus open to the left, <kbd>←</kbd> opens one and <kbd>→</kbd> closes it. Key combinations still read left to right. |
| Dividers      | Arrow keys move a divider the way they point.                                                                                                              |
| Pointer input | Dragging dividers, docking, reordering tabs, resizing floating windows, zooming into collapsed groups and every navigation gesture follow the pointer.     |

The **New split right** menu item becomes **New split left**, because a new split opens toward the end edge.

## Your layouts don't change

Layout documents don't record a direction. A row's first child is at its start edge, whichever side that is, so the same saved layout mirrors when the direction changes. Floating rects measure `x` from the start edge too.

This applies to code as well. Placement edges mirror with the layout, so in a right-to-left workspace `{ beside: "stage", edge: "left" }` puts a panel on the stage's start side, which is on the right. The same code puts a sidebar at the start of the reading direction in every language.

Your content inherits the workspace's direction through normal CSS inheritance, so write its styles with logical properties such as `margin-inline-start`.
