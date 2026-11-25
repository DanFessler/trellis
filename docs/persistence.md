---
title: Persistence and controlled layouts
description: Save layouts to localStorage, version them, control the document yourself, and build undo or server sync.
section: Guides
order: 16
nav: Persistence
---

# Persistence and controlled layouts

The whole workspace is one serializable [`LayoutDocument`](./layout.md#the-layoutdocument-format). You can let Trellis save it to `localStorage`, or hold it yourself.

## Built-in persistence

To save the layout in `localStorage`, give it a key and a version:

```ts
createWorkspace(el, { types, defaultLayout, persist: { key: "my-app", version: 1 } });
```

```tsx
<Workspace storageKey="my-app" version={1}>
  {/* … */}
</Workspace>
```

- Trellis writes the document to `localStorage[key]` shortly after each committed change. It waits for a short debounce and doesn't write mid-drag.
- On creation, Trellis uses a saved document in place of the default layout if its `version` matches.
- The document includes floating and hidden panels, each view's params and title, the current framing and saved framings.

### Versioning

`version` is _your_ layout version. Bump it when you change the default layout or rename view types in a way that makes old saved layouts wrong. Trellis ignores a saved document with a different version and uses the default layout, then saves over it on the next change.

### Resetting

```ts
ws.reset();
```

`reset()` removes the saved document, clears navigation history and animates to the default layout. Views whose ids appear in the default layout keep their mounted content. Every other view closes and fires `close`, **without** running close guards, so check for unsaved work before you offer a "Reset layout" command.

> **Tip** Views in a default layout get deterministic ids (`editor-1`, `layers-1`, …) unless you set one, so `reset()` keeps them alive. The same editor, iframe or canvas animates back to its default spot. Only the views the user opened later close.

## What is and isn't saved

The document stores _layout_: where views are and what their `params` are. It doesn't store what's inside your content. If a view needs a little state to come back, such as a file path or a scroll position, put it in params:

```ts
view.setParams({ scrollTop: el.scrollTop });
```

Keep params small and serializable. For large or frequently changing state, save it in your own store keyed by view id.

## Reading and writing the document

```ts
const doc = ws.getDocument(); // a snapshot of the current LayoutDocument
ws.setDocument(doc); // animates to it
ws.setDocument(doc, { animate: false });
```

`setDocument()` [repairs](#damaged-and-outdated-layouts) the input and matches views by id. Views that exist in both documents stay mounted, new ones mount and removed ones unmount. Panels animate from where they were to where they now are.

### The `change` event

```ts
ws.on("change", (doc) => save(doc));
```

`change` fires for committed layout changes only. These include a drop, a divider release, opening or closing a view, selecting a tab, a title or params change, and a framing change. It doesn't fire mid-drag or mid-animation, so it's safe to do real work in it.

## Controlled layouts (React)

Pass `document` and `onDocumentChange` to own the document in React state:

```tsx
import { useState } from "react";
import {
  createDocument,
  layout as L,
  Workspace,
  ViewType,
  type LayoutDocument,
} from "@danfessler/trellis-react";

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

Passing back the document the workspace last emitted does nothing, so the loop is cheap. Setting a different document animates to it. A `document` prop overrides both persistence and the default layout.

In the core, pass `document` in the options for the initial state, and call `setDocument()` for later changes.

## Recipe: undo for layout changes

This keeps a stack of past documents and skips recording while it restores one:

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

This loads the saved layout on start and saves changes after a second without edits:

```ts
const saved = await fetch("/api/layout").then((r) => (r.ok ? r.json() : null));
const ws = createWorkspace(el, { types, defaultLayout, document: saved ?? undefined });

let timer: ReturnType<typeof setTimeout>;
ws.on("change", (doc) => {
  clearTimeout(timer);
  timer = setTimeout(() => fetch("/api/layout", { method: "PUT", body: JSON.stringify(doc) }), 1000);
});
```

## Recipe: several layouts per user or team

A dispatcher might switch between a call-taking layout and a radio layout, and a center might hand out its own default. Store each layout as a named document on your server:

```ts
type SavedLayout = { name: string; document: LayoutDocument };

async function saveAs(name: string) {
  await fetch(`/api/layouts/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({ name, document: ws.getDocument() }),
  });
}

async function open(name: string) {
  const saved: SavedLayout = await fetch(`/api/layouts/${encodeURIComponent(name)}`).then((r) => r.json());
  ws.setDocument(saved.document);
}
```

Views keep their mounted content across the switch when their ids match, so a map or a call view that's in both layouts doesn't reload.

For a team default set by an administrator, pass it as `defaultLayout`. `ws.reset()` then returns anyone to it. To stop users rearranging an administrator's layout, or only let some of them, set [permissions](./permissions.md).

## Damaged and outdated layouts

Saved layouts come back from servers, `localStorage` and older versions of your app. Trellis repairs any document before using it, so a bad one can't break the workspace:

- `setDocument()` accepts any value without throwing. A document that isn't one at all, such as `null`, gives an empty workspace.
- A saved layout in `localStorage` that isn't a layout document, or isn't valid JSON, is ignored in favour of the default layout.
- Views without a record, or shown twice, are removed, and so are panels left without views.
- Missing or duplicate ids are replaced, so content isn't lost.
- Weights, floating rects, restore targets and saved framings that aren't valid fall back to sensible values.

`sanitize(document)` is exported if you want to repair a document yourself, for example before storing it.

### Unknown view types

Saved layouts can outlive your view types. `onMissingType(type, id)` decides what happens to a view whose type isn't registered. Return `"placeholder"` (the default) to keep it, showing an "Unavailable" placeholder in its place, or `"drop"` to remove it:

```ts
createWorkspace(el, { types, persist: { key: "app" }, onMissingType: () => "drop" });
```

A placeholder keeps the view's record, params included, so saving the layout doesn't lose it. When the type is registered later, for example once a plugin or microfrontend loads, pass the new types to `ws.update({ types })`. The view mounts its real content in place. The placeholder is `[data-trellis-part="view-missing"]` for styling.
