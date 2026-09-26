---
title: Panel menus
description: Add items per view type, filter or extend the built-ins for every panel, or render menus with your own components.
section: Guides
order: 15.5
---

# Panel menus

Every panel has one menu. It opens from the **⋯** button at the end of the tab bar, from right-clicking the tab bar, and from <kbd>Shift</kbd>+<kbd>F10</kbd> or <kbd>Menu</kbd> on a focused tab. Right-clicking a tab selects that tab first, so the menu always belongs to the tab you clicked. Right-clicking a view's [accessory](./react-api.md) doesn't open it: accessories handle their own clicks.

The menu is built in three steps:

1. The selected view type's `menu` items.
2. The built-in items, unless `panelMenu` is `false`.
3. Your `panelMenu` function, if you pass one, which gets the result of 1 and 2 and returns what to show.

Menus are data, not components, so they work the same in React, vanilla JavaScript and the web component.

## Items for a view type

```ts
type MenuEntry = MenuItem | "separator";
interface MenuItem {
  id?: string;
  label: string;
  shortcut?: string; // a hint such as "⌘S"; it doesn't bind the key
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  run?(): void;
  items?: MenuItem[]; // a submenu
}
```

`menu` is an array, or a function called each time the menu opens, so items can reflect live state:

```tsx
<ViewType
  id="doc"
  menu={(view) => [
    { label: "Save", shortcut: "⌘S", run: () => save(view.params.path) },
    { label: "Word wrap", checked: wrap, run: toggleWrap },
  ]}
/>
```

Separators at the start or end of a menu, and repeated separators, are removed, so every step can add them freely.

`shortcut` only labels the item. To make the key work, handle it in your app, or use the workspace [keymap](./keyboard-accessibility.md) for built-in commands.

## The built-in items

The built-ins give every panel what drag and drop can do, so it's all reachable from the keyboard. Which ones appear depends on where the panel is and what it's allowed to do.

| Id                           | Item                                        | Shown                                                          |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `maximize`                   | Maximize / Restore size                     | With navigation on, for docked panels.                         |
| `float`                      | Float                                       | For docked panels, when floating is on and the view allows it. |
| `dock`                       | Dock, or Dock beside stage                  | For floating panels.                                           |
| `move`                       | Move _tab_ to ▸                             | When the view can go into another panel.                       |
| `move:<panelId>`             | _(each destination in that submenu)_        |                                                                |
| `split-right`, `split-below` | New split right / below _(in that submenu)_ | For docked panels with more than one tab.                      |
| `hide`                       | Hide                                        | Always.                                                        |
| `close`                      | Close _tab_                                 | When the view can be closed.                                   |
| `close-others`               | Close other tabs                            | When the panel has more than one tab.                          |

Because **Hide** always applies, the ⋯ button shows on every panel unless you change the menu.

## Change the menu for every panel

Pass a function as `panelMenu`. It receives the full menu, with the view type's items first and then the built-ins, plus the panel it's for. Return the entries to show.

```tsx
<Workspace
  panelMenu={(entries, { view }) => [
    { id: "copy-link", label: "Copy link", run: () => copyLink(view.id) },
    "separator",
    ...entries.filter((entry) => entry === "separator" || entry.id !== "hide"),
  ]}
/>
```

```ts
createWorkspace(el, {
  types,
  panelMenu: (entries, { view, panelId, region }) =>
    entries.filter((e) => e === "separator" || e.id !== "hide"),
});
```

The context has `panelId`, the selected `view` (a `ViewHandle`) and the panel's `region`: `"stage"`, `"side"` or `"floating"`. Return an empty list and the panel has no menu: its ⋯ button hides.

`panelMenu: false` is a shortcut for keeping only the view types' own items.

## Render menus yourself

To show panel menus with your own component, for example your design system's dropdown or a native menu in Electron, pass `renderMenu`. Trellis then never shows its own menu; it calls your function with a request instead:

```ts
interface MenuRequest {
  entries: MenuEntry[]; // final, with separators tidied
  x: number; // viewport pixels
  y: number;
  align: "start" | "end"; // "end": align the menu's right edge to x (opened from the ⋯ button)
  anchor: HTMLElement | null; // the ⋯ button, when opened from it
  panelId: string;
  close(): void; // call when your menu closes
}
```

```tsx
const [request, setRequest] = useState<MenuRequest | null>(null);

<Workspace renderMenu={setRequest} />;
{
  request && (
    <MyMenu
      items={request.entries}
      position={{ x: request.x, y: request.y, align: request.align }}
      onSelect={(item) => item.run?.()}
      onClose={() => {
        request.close();
        setRequest(null);
      }}
    />
  );
}
```

Run an item by calling its `run()`. Call `close()` when your menu closes, so the ⋯ button's expanded state resets. Your menu is responsible for keyboard support and focus, which the built-in menu otherwise provides: an ARIA `menu`, arrow keys, submenus and returning focus when it closes.

In the web component, set both through the `options` property: `el.options = { panelMenu, renderMenu }`.
