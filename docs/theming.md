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

| Theme | Description |
| --- | --- |
| `"system"` *(default)* | `light`, or `dark` when the OS prefers a dark color scheme. |
| `"light"` | Light gray workspace, white panels. |
| `"medium"` | Mid-gray, in the style of classic creative apps. |
| `"dark"` | Near-black workspace with dark panels. |
| `"darker"` | Deeper still, for dimly lit rooms and OLED screens. |

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

`tokens` are set as inline styles on the root, so they win over stylesheet values.

### Metrics

| Token | Default | Controls |
| --- | --- | --- |
| `--trellis-gap` | `6px` | Space between panels and around the edge. |
| `--trellis-radius` | `10px` | Panel corner radius. |
| `--trellis-tab-radius` | `7px` | Tab corner radius. |
| `--trellis-tabbar-height` | `34px` | Tab bar height. |
| `--trellis-tab-max-width` | `220px` | Maximum width of a tab. |
| `--trellis-font` | system UI stack | Font of all chrome. |
| `--trellis-font-size` | `12.5px` | Font size of all chrome. |

> **Note** Trellis reads `--trellis-gap` and `--trellis-tabbar-height` in JavaScript to lay panels out. They're re-read when the theme or tokens change and when the workspace resizes. If you change them from your own stylesheet at runtime, prefer the `tokens` option so the layout updates immediately.

### Colors

| Token | Used for |
| --- | --- |
| `--trellis-bg` | The workspace background, visible in gaps. |
| `--trellis-panel` | Panel and content background. |
| `--trellis-tabbar` | Tab bar background. |
| `--trellis-tab-hover` | Hovered tab and chrome button background. |
| `--trellis-tab-active` | Selected tab background. |
| `--trellis-text` | Primary text. |
| `--trellis-text-muted` | Unselected tabs, shortcuts, secondary text. |
| `--trellis-border` | Hairlines around panels, tabs and menus. |
| `--trellis-accent` | Focus indicator, dividers, drop markers, badges. |
| `--trellis-accent-contrast` | Text on the accent (badges). |
| `--trellis-stage` | Stage background. |
| `--trellis-drop` | Drop preview fill. Defaults to a tint of the accent. |
| `--trellis-menu` | Menu background. |
| `--trellis-menu-hover` | Hovered menu item. |
| `--trellis-shadow-float` | Shadow of floating panels. |
| `--trellis-shadow-lifted` | Shadow of a panel being dragged. |
| `--trellis-focus-ring` | Keyboard focus ring (a `box-shadow` value). |
| `--trellis-ease` | Easing for CSS transitions in the chrome. |

## Parts

Every element Trellis renders has a `data-trellis-part` attribute:

| Part | Element |
| --- | --- |
| `panel` | A panel (tab bar + surfaces). Has `data-panel="<id>"`. |
| `tabbar` | The panel's tab bar. |
| `tabs` | The tab strip (`role="tablist"`). |
| `tab` | One tab. Has `data-view="<id>"`. |
| `tab-icon`, `tab-title`, `tab-badge`, `tab-close` | Pieces of a tab. |
| `accessories` / `accessory` | Tab-bar area for the selected view's accessory. |
| `panel-menu` | The panel's menu button. |
| `surface` | A view's frame. Has `data-view` and `data-type`, plus the type's `className`. |
| `content` | The view's content element — the one your content mounts into. |
| `divider` | A resize handle between split children. |
| `resize` | A floating panel's resize handle (`data-dir="n" \| "se" \| …`). |
| `backdrop`, `stage-empty`, `empty`, `chrome` | Slots. See [Core API](./core-api.md#slots). |
| `drop-preview`, `drop-marker` | Drag feedback. |
| `menu` | A popup menu (also `.trellis-menu`, items `.trellis-menu-item`). |

## State attributes

On the **root** (`.trellis`):

| Attribute | When |
| --- | --- |
| `data-theme` | Always: the active theme name. |
| `data-navigation` | Always: `focus`, `free` or `false`. |
| `data-dragging` | A drag is in progress. |
| `data-drop` | During a drag: `tab`, `split`, `stage`, `float` or `none`. |
| `data-resizing` | Resizing: `x`, `y` (dividers) or `float`. |
| `data-framed` | The camera is zoomed in on something. |
| `data-busy` | A drag or gesture is in progress; content is non-interactive. |
| `data-has-stage`, `data-stage-empty`, `data-empty` | Layout shape. |

On **panels**: `data-focused`, `data-floating`, `data-lifted` (being dragged), `data-framed`, `data-single` (one tab), `data-compact` (too small for tab titles), and `data-region` = `stage` \| `side` \| `floating`.

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

On **surfaces**: `data-scaled` while content is scaled below its `minSize`.

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
