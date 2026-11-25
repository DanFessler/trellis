---
title: Security
description: What Trellis does and doesn't do with data, the network, storage and the DOM, for security reviews.
section: More
order: 40.6
---

# Security

Trellis is a layout library that runs entirely in the page. It has no server component, and it only handles the layout document and the content your app gives it. This page answers the questions security reviews usually ask.

## Data

| Question                    | Answer                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What data does it handle?   | The layout document: where each view is, and each view's type, title and `params`. Your app decides what goes in `params`. Trellis never reads the content inside views.           |
| Does it send data anywhere? | No. It makes no network requests of any kind: no `fetch`, XHR, WebSockets, beacons or dynamic imports.                                                                             |
| Does it collect telemetry?  | No. There's no analytics, telemetry, error reporting or licence check.                                                                                                             |
| Where does it store data?   | Only in `localStorage`, and only when you set `persist` (`storageKey` in React). It writes one entry, under the key you choose. It uses no cookies, `sessionStorage` or IndexedDB. |
| Does it read the clipboard? | No.                                                                                                                                                                                |
| Does it run arbitrary code? | No. It never uses `eval`, `new Function` or string timers.                                                                                                                         |

## Content and the DOM

- Trellis mounts your views' content once and moves it with CSS. It never reads or copies what's inside.
- Iframe views load the URL or `srcdoc` you give them, with the `sandbox`, `allow` and `referrerPolicy` you set. Trellis never reaches into an iframe's document or messages it.
- Titles, labels, error messages and other text are set as text, never parsed as HTML.
- The only markup Trellis parses is icon markup you pass as a string: a view type's `icon`, or a web component's `data-icon`. Treat it as trusted code, and never build it from user input. In React, pass icons as elements instead.

## Content Security Policy and Trusted Types

Trellis works under a strict Content Security Policy. It sets styles through the style object, not inline style attributes, so `style-src-attr 'none'` is fine. It doesn't inject `<style>` or `<script>` elements. Load its stylesheet as a file.

Trellis works where Trusted Types are enforced (`require-trusted-types-for 'script'`), as long as icons aren't passed as markup strings. A string icon is assigned with `innerHTML`, which Trusted Types blocks.

## Dependencies and distribution

| Package                       | Dependencies                                                           |
| ----------------------------- | ---------------------------------------------------------------------- |
| `@danfessler/trellis`         | None                                                                   |
| `@danfessler/trellis-react`   | Peer dependencies only: `@danfessler/trellis`, `react` and `react-dom` |
| `@danfessler/trellis-element` | Peer dependency only: `@danfessler/trellis`                            |

The packages are published to npm and contain only their built files, type declarations and licence. Each release is tagged in the [repository](https://github.com/DanFessler/trellis), and its source is readable there. Nothing is fetched at install time or at runtime, so the packages work offline and in air-gapped networks once installed.

## Reporting a vulnerability

Email security issues to dan@danfessler.com rather than opening a public issue. Include the version and, if you can, a minimal reproduction.
