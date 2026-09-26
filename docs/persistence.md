---
title: Persistence & controlled layouts
description: Save layouts to localStorage, version them, control the document yourself, and build undo or server sync.
section: Guides
order: 16
nav: Persistence
---

# Persistence & controlled layouts

The whole workspace is one serializable [`LayoutDocument`](./layout.md#the-layoutdocument-format). You can let Trellis save it to `localStorage`, or hold it yourself.

## Built-in persistence

```ts
createWorkspace(el, { types, defaultLayout, persist: { key: "my-app", version: 1 } });
```

```tsx
<Workspace storageKey="my-app" version={1}>{/* … */}</Workspace>
```

- The document is written to `localStorage[key]` shortly after each committed change (a short debounce, never mid-drag).
- On creation, a saved document is used instead of the default layout — as long as its `version` matches.
- It includes floating and hidden panels, every view's params and title, the current framing and saved framings.

### Versioning

`version` is *your* layout version. When you change the default layout or rename view types in a way that makes old saved layouts wrong, bump it. A saved document with a different version is ignored and the default layout is used (and saved over it on the next change).

### Resetting

```ts
ws.reset();
```

`reset()` removes the saved document, clears navigation history and animates to the default layout. Views whose ids appear in the default layout keep their mounted content; every other view closes (firing `close`) **without** running close guards — so check for unsaved work before offering it. Give users a "Reset layout" command.

> **Tip** Views in a default layout get deterministic ids (`editor-1`, `layers-1`, …) unless you set one, so `reset()` keeps them alive — the same editor, iframe or canvas simply animates back to its default spot. Views the user opened later are the ones that close.

## What is — and isn't — saved

The document stores *layout*: where views are and what their `params` are. It doesn't store what's inside your content. If a view needs a little state to come back — a file path, a scroll position, a selected tab — put it in params:

```ts
view.setParams({ scrollTop: el.scrollTop });
```

Keep params small and serializable. For large or frequently-changing state, save it in your own store keyed by view id.

## Reading and writing the document

```ts
const doc = ws.getDocument(); // a snapshot of the current LayoutDocument
ws.setDocument(doc); // animates to it
ws.setDocument(doc, { animate: false });
```

`setDocument()` sanitizes the input, keeps views that exist in both documents mounted (matched by view id), mounts new ones and unmounts removed ones. Panels animate from where they were to where they now are.

### The `change` event

```ts
ws.on("change", (doc) => save(doc));
```

`change` fires for committed layout changes only — a drop, a divider release, opening or closing a view, selecting a tab, a title or params change, a framing change. It never fires mid-drag or mid-animation, so it's safe to do real work in it.

## Controlled layouts (React)

Pass `document` and `onDocumentChange` to own the document in React state:

```tsx
import { useState } from "react";
import { createDocument, layout as L, Workspace, ViewType, type LayoutDocument } from "@danfessler/trellis-react";

const initial = createDocument(L.row([L.view("files"), L.stage(L.view("doc"))], [1, 4]));

export function App() {
  const [doc, setDoc] = useState<LayoutDocument>(initial);
  return (
    <Workspace document={doc} onDocumentChange={setDoc}>
      <ViewType id="files" title="Files" />
      <ViewType id="doc" title="Document" placement="stage" />
    </Workspace>
  );
}
```

Echoing a document the workspace just emitted back in is a no-op, so the loop is cheap. Setting a different document animates to it. A `document` prop overrides both persistence and the default layout.

In the core, pass `document` in the options for the initial state, and call `setDocument()` for later changes.

## Recipe: undo for layout changes

```ts
const past: LayoutDocument[] = [];
let current = ws.getDocument();
let restoring = false;

ws.on("change", (doc) => {
  if (!restoring) past.push(current);
  current = doc;
});

function undoLayout() {
  const previous = past.pop();
  if (!previous) return;
  restoring = true;
  ws.setDocument(previous);
  restoring = false;
}
```

## Recipe: sync to a server

```ts
const saved = await fetch("/api/layout").then((r) => (r.ok ? r.json() : null));
const ws = createWorkspace(el, { types, defaultLayout, document: saved ?? undefined });

let timer: ReturnType<typeof setTimeout>;
ws.on("change", (doc) => {
  clearTimeout(timer);
  timer = setTimeout(() => fetch("/api/layout", { method: "PUT", body: JSON.stringify(doc) }), 1000);
});
```

## Unknown types in saved documents

Saved layouts can outlive your view types. `onMissingType(type, id)` decides what happens to a view whose type isn't registered: return `"placeholder"` (default) to show an "Unavailable" placeholder in its place, or `"drop"` to remove it.

```ts
createWorkspace(el, { types, persist: { key: "app" }, onMissingType: () => "drop" });
```
