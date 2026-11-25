---
title: Locking and permissions
description: Lock the layout, or let each user change only some of it, such as resizing but not closing.
section: Guides
order: 16.2
nav: Permissions
---

# Locking and permissions

`permissions` sets what users can change through the interface. Lock the whole layout, or turn off individual kinds of change, for example so an operator can resize panels but not close or rearrange them.

```ts
createWorkspace(el, { types, permissions: false }); // nothing can be rearranged, resized, closed, floated or hidden
```

```tsx
<Workspace permissions={{ close: false, rearrange: false }}>{/* … */}</Workspace>
```

Everything is allowed by default. Content is never affected: users can still select tabs, focus views, use menus you add and work inside your content.

## What each permission covers

| Permission  | Turns off                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rearrange` | Dragging tabs and panels: docking, tabbing, reordering and moving floating windows. The panel menu's **Move** and **New split** items.                                             |
| `resize`    | Dividers, by dragging, arrow keys or double-click. Resizing floating windows by their edges. Locked dividers and edges aren't shown.                                               |
| `close`     | Close buttons, middle-click, <kbd>Delete</kbd> on a tab, the **Close** menu items and the `view.close` shortcut.                                                                   |
| `float`     | Turning a panel into a floating window and back: the **Float** and **Dock** menu items, the `panel.float` shortcut, and dragging a whole panel between the layout and the desktop. |
| `hide`      | The **Hide** menu item and the `panel.hide` shortcut.                                                                                                                              |

`permissions: false` turns off all of them, and `true` allows them all. An object turns off the permissions set to `false` and allows the rest.

Permissions add to each view type's own rules. A view of a type with `closable: false` can't be closed however the permissions are set, and `allow` still limits where a type can go.

## Code isn't limited

Permissions only apply to people using the interface. Calls from your code always work, so an administrator's tools or a layout pushed from your server can still change a locked workspace:

```ts
ws.update({ permissions: false });
ws.open("incident", { params: { id: 4211 } }); // still opens
ws.setDocument(centerLayout); // still applies
```

## Permissions per user

Permissions can change at any time. Set them from each user's role, and update them when the role changes:

```ts
const byRole = {
  admin: true,
  supervisor: { close: false },
  dispatcher: { rearrange: false, close: false, float: false },
} satisfies Record<string, WorkspaceOptions["permissions"]>;

ws.update({ permissions: byRole[user.role] });
```

To give everyone at a dispatch center the same starting layout, pass it as `defaultLayout` and use `ws.reset()` to return to it. See [several layouts per user or team](./persistence.md#recipe-several-layouts-per-user-or-team).
