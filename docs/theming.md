---
title: Theming
description: Built-in themes, every CSS token, the parts and state attributes you can style, and examples.
section: Guides
order: 17
---

# Theming

Trellis's look comes from one stylesheet driven by CSS custom properties. Every built-in rule is wrapped in `:where()`, so it has **zero specificity** — any selector you write wins, with no `!important` and no specificity battles.

## Built-in themes

```tsx
<Workspace theme="dark" />
```

```ts
createWorkspace(el, { types, theme: "dark" });
```

| Theme                  | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `"system"` _(default)_ | `light`, or `dark` when the OS prefers a dark color scheme. |
| `"light"`              | Light gray workspace, white panels.                         |
| `"medium"`             | Mid-gray, in the style of classic creative apps.            |
| `"dark"`               | Near-black workspace with dark panels.                      |
| `"darker"`             | Deeper still, for dimly lit rooms and OLED screens.         |

The theme is exposed as `data-theme` on the workspace root and can change at any time (`ws.update({ theme })` or the React prop).

## Tokens

Override tokens with the `tokens` option or prop:

```tsx
<Workspace theme="dark" tokens={{ "--trellis-accent": "#f60", "--trellis-radius": "4px" }} />
```

…or with plain CSS, scoped however you like:

```css
.trellis {
  --trellis-accent: #f60;
  --trellis-radius: 4px;
}
.trellis[data-theme="light"] {
  --trellis-panel: #fdfcf8;
}
```

`tokens` are set as inline styles on the root, so they win over stylesheet values. Each new `tokens` object (a changed prop, or `ws.update({ tokens })`) replaces the previous one: tokens it leaves out are removed, falling back to the stylesheet, and an empty-string value removes that token too.

```ts
ws.update({ tokens: { "--trellis-accent": "#f60", "--trellis-radius": "4px" } });
ws.update({ tokens: { "--trellis-accent": "#f60" } }); // --trellis-radius goes back to the theme's value
```

### Metrics

| Token                     | Default         | Controls                                                           |
| ------------------------- | --------------- | ------------------------------------------------------------------ |
| `--trellis-gap`           | `6px`           | Space between panels and around the edge.                          |
| `--trellis-radius`        | `10px`          | Panel corner radius.                                               |
| `--trellis-tab-radius`    | `7px`           | Tab corner radius.                                                 |
| `--trellis-tabbar-height` | `34px`          | Tab bar height.                                                    |
| `--trellis-tab-max-width` | `220px`         | Maximum width of a tab.                                            |
| `--trellis-tab-inset`     | `4px`           | Space around the tabs in a tab bar. Set it with the `tabs` option. |
| `--trellis-font`          | system UI stack | Font of all chrome.                                                |
| `--trellis-font-size`     | `12.5px`        | Font size of all chrome.                                           |

> **Note** Trellis reads `--trellis-gap` and `--trellis-tabbar-height` in JavaScript to lay panels out. They're re-read when the theme or tokens change and when the workspace resizes. If you change them from your own stylesheet at runtime, prefer the `tokens` option so the layout updates immediately.

### Colors

| Token                       | Used for                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| `--trellis-bg`              | The workspace background, visible in gaps.                                  |
| `--trellis-panel`           | Panel and content background.                                               |
| `--trellis-tabbar`          | Tab bar background.                                                         |
| `--trellis-tab-hover`       | Hovered tab and chrome button background.                                   |
| `--trellis-tab-active`      | Selected tab background.                                                    |
| `--trellis-text`            | Primary text.                                                               |
| `--trellis-text-muted`      | Unselected tabs, shortcuts, secondary text.                                 |
| `--trellis-border`          | Hairlines around panels, tabs and menus.                                    |
| `--trellis-accent`          | Focus indicator, dividers, the tab-drop outline, badges.                    |
| `--trellis-accent-contrast` | Text on the accent (badges).                                                |
| `--trellis-stage`           | Stage background.                                                           |
| `--trellis-slot`            | The slot a drag opens in the layout (`drop-slot`). Tab drops use it at 70%. |
| `--trellis-menu`            | Menu background.                                                            |
| `--trellis-menu-hover`      | Hovered or keyboard-focused menu item.                                      |
| `--trellis-shadow-float`    | Shadow of floating panels.                                                  |
| `--trellis-shadow-lifted`   | Shadow of a panel being dragged.                                            |
| `--trellis-focus-ring`      | Keyboard focus ring (a `box-shadow` value).                                 |
| `--trellis-ease`            | Easing for CSS transitions in the chrome.                                   |

## Parts

Every element Trellis renders has a `data-trellis-part` attribute:

| Part                                              | Element                                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `panel`                                           | A panel (tab bar + surfaces). Has `data-panel="<id>"`.                                                                                                  |
| `tabbar`                                          | The panel's tab bar. Has `data-panel="<id>"`. With `tabbar: "overlay"` it is moved out of the panel to float over the content, and gets `data-overlay`. |
| `tabs`                                            | The tab strip (`role="tablist"`).                                                                                                                       |
| `tab`                                             | One tab. Has `data-view="<id>"`.                                                                                                                        |
| `tab-icon`, `tab-title`, `tab-badge`, `tab-close` | Pieces of a tab. An empty `tab-icon` is hidden with `:empty`, so it takes no space for types without an icon.                                           |
| `accessories` / `accessory`                       | Tab-bar area for the selected view's accessory.                                                                                                         |
| `panel-menu`                                      | The panel's menu button.                                                                                                                                |
| `surface`                                         | A view's frame. Has `data-view` and `data-type`, plus the type's `className`.                                                                           |
| `content`                                         | The view's content element — the one your content mounts into.                                                                                          |
| `divider`                                         | A resize handle between split children.                                                                                                                 |
| `resize`                                          | A floating panel's resize handle (`data-dir="n" \| "se" \| …`).                                                                                         |
| `backdrop`, `stage-empty`, `empty`, `chrome`      | Slots. See [Core API](./core-api.md#slots).                                                                                                             |
| `drop-slot`                                       | While dragging, the slot the layout opens where the view will land. `data-visible` while shown; `data-kind="tab"` for tab drops.                        |
| `drop-label`                                      | The drop slot's label ("Add as tab").                                                                                                                   |
| `source-slot`                                     | While dragging, where the view came from.                                                                                                               |
| `frame-icon`                                      | The centred icon of a frame-only panel. Sized by `--trellis-frame-icon-size`.                                                                           |
| `marquee`, `marquee-target`                       | The <kbd>Shift</kbd>+drag marquee and the target it would frame. Unstyled; see [Navigation](./navigation.md#free-navigation-gestures).                  |
| `menu`                                            | A popup menu — the panel menu and its submenus. See [Menus](#menus).                                                                                    |

### Menus

Menus are rendered by Trellis and styled through classes as well as the `menu` part. They live inside the workspace root, so the `--trellis-*` tokens apply.

| Selector                                      | Element                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.trellis-menu`, `[data-trellis-part="menu"]` | The menu (`role="menu"`). Background `--trellis-menu`.                                                                                                                                                  |
| `.trellis-menu-item`                          | An item (`role="menuitem"`, or `"menuitemcheckbox"` with `aria-checked`). Hover and focus use `--trellis-menu-hover`; disabled items have `aria-disabled="true"`; `danger` items add `.trellis-danger`. |
| `.trellis-menu-shortcut`                      | An item's right-aligned shortcut.                                                                                                                                                                       |
| `.trellis-menu-separator`                     | A separator.                                                                                                                                                                                            |

```css
.trellis .trellis-menu {
  --trellis-menu: #1b1c20;
  --trellis-menu-hover: #5b8cff33;
  border-radius: 6px;
}
.trellis .trellis-menu-item {
  height: 32px;
}
.trellis .trellis-menu-shortcut {
  font-family: ui-monospace, monospace;
}
```

## State attributes

On the **root** (`.trellis`):

| Attribute                                          | When                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `data-theme`                                       | Always: the active theme name.                                              |
| `data-navigation`                                  | Always: `focus`, `free` or `false`.                                         |
| `data-dragging`                                    | A drag is in progress.                                                      |
| `data-drop`                                        | During a drag: `dock`, `tab`, `stage`, `float` or `none`.                   |
| `data-marquee`, `data-drag-zoom`                   | A <kbd>Shift</kbd>+drag marquee or <kbd>Alt</kbd>+drag zoom is in progress. |
| `data-resizing`                                    | Resizing: `x`, `y` (dividers) or `float`.                                   |
| `data-framed`                                      | The camera is zoomed in on something.                                       |
| `data-busy`                                        | A drag or gesture is in progress; content is non-interactive.               |
| `data-has-stage`, `data-stage-empty`, `data-empty` | Layout shape.                                                               |

On **panels**: `data-focused`, `data-floating`, `data-lifted` (being dragged), `data-framed`, `data-single` (one tab), `data-compact` (too small for tab titles), `data-frame-only` (smaller than 160 × 64: only the icon shows), `data-tabbar` = `hidden` \| `overlay` when the tab bar isn't above the content, and `data-region` = `stage` \| `side` \| `floating`.

On **tabs**: `data-selected`, `data-focused`, `aria-selected`, `data-type` (the view's type) and `data-badge` — `"dot"` when the badge is `true`, `""` for a text or number badge.

A `true` badge renders as a dot that swaps with the close button on hover — the familiar "unsaved changes" indicator. Style it with `[data-badge="dot"]`:

```css
.trellis [data-trellis-part="tab"][data-badge="dot"] [data-trellis-part="tab-badge"] {
  background: #f5a524;
}
.trellis [data-trellis-part="tab"][data-type="terminal"] {
  font-family: ui-monospace, monospace;
}
```

On **surfaces**: `data-scaled` while content is scaled below its minimum size, and `data-tabbar` = `hidden` \| `overlay`.

### Overlay tab bars

With `tabbar: "overlay"`, a lone view's content extends under its tab bar and draws its own title bar. The overlaid bar is a transparent drag strip — its tabs are invisible, while accessories and the menu button stay visible — and the content receives two custom properties to lay out around it:

| Property                       | Value                                                                   |
| ------------------------------ | ----------------------------------------------------------------------- |
| `--trellis-titlebar-height`    | The tab bar's height, so the content can draw a title bar of that size. |
| `--trellis-titlebar-inset-end` | Space the bar's accessories and menu button take at the end of the bar. |

Both are `0px` for views without an overlaid bar. In a tab group, the bar sits above the content as usual.

```css
.my-app-titlebar {
  height: var(--trellis-titlebar-height);
  padding-inline-end: var(--trellis-titlebar-inset-end);
}
```

## Tab styles

The `tabs` option has two independent settings. The defaults give tabs that fit their titles, with 4px of space around them.

| Setting | Default | Effect                                                                                                    |
| ------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `fill`  | `false` | Tabs grow to share the tab row's width. Nothing else about them changes, whether there's one tab or many. |
| `inset` | `4`     | Space in pixels between the tabs and the bar's top and sides. At `0` the tabs meet the bar's edges.       |

```tsx
<Workspace tabs={{ fill: true }} />
<Workspace tabs={{ inset: 0 }} />
<Workspace tabs={{ fill: true, inset: 0 }} />
```

```ts
createWorkspace(el, { types, tabs: { fill: true, inset: 0 } });
ws.update({ tabs: { fill: false } }); // back to tabs that fit their titles
```

Neither setting touches the rest of the bar: view accessories and the panel menu button keep their place and the bar's own background. The menu button shows unless you pass `panelMenu: false` and the view type has no `menu` items, because the built-in actions (Maximize, Float or Dock, Move to, Hide and Close) always apply.

The close button always sits at the tab's right edge.

The root reflects the settings as `data-tab-fill` and `data-tab-bleed` (when `inset` is `0`), and as the `--trellis-tab-inset` token, so your own CSS can follow them.

## Examples

### A flatter look

```css
.trellis {
  --trellis-gap: 1px;
  --trellis-radius: 0px;
  --trellis-tab-radius: 0px;
  --trellis-bg: #2b2c31;
}
```

### Accent per region

```css
.trellis [data-trellis-part="panel"][data-region="stage"] {
  --trellis-accent: #f5a524;
}
```

### Per-type styling

```tsx
<ViewType id="terminal" title="Terminal" className="is-terminal" />
```

```css
.trellis .is-terminal {
  --trellis-panel: #000;
  font-family: ui-monospace, monospace;
}
```

### Uppercase, spaced tabs

```css
.trellis [data-trellis-part="tab-title"] {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
}
```

### Hide close buttons until hover

```css
.trellis [data-trellis-part="tab"]:not(:hover) [data-trellis-part="tab-close"] {
  visibility: hidden;
}
```

## Using tokens in your content

View content lives inside the workspace root, so it can use the same tokens:

```css
.my-panel {
  color: var(--trellis-text);
  background: var(--trellis-panel);
  border-bottom: 1px solid var(--trellis-border);
}
```

Your content then follows theme changes for free.
