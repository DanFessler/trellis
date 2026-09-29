---
title: Handling errors
description: How a failing view is contained, the error event, and replacing the fallback a failed view shows.
section: Guides
order: 16.4
nav: Errors
---

# Handling errors

When something in a view throws, Trellis contains it to that view. The view shows a fallback, the rest of the workspace carries on, and the error reaches you through one event:

```ts
ws.on("error", ({ error, source, viewId, type }) => {
  reportToMonitoring(error, { source, viewId, type });
});
```

```tsx
<Workspace onError={({ error, source, viewId }) => reportToMonitoring(error, { source, viewId })}>
  {/* … */}
</Workspace>
```

Without a listener or an `onError` prop, errors go to the console, so none are lost.

## What's contained

| `source`   | Where it threw                                                           | What users see                                           |
| ---------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| `mount`    | A view type's `mount`                                                    | The view's fallback                                      |
| `iframe`   | A view type's `iframe` function                                          | The view's fallback                                      |
| `render`   | A React view's content, icon or accessory while rendering                | The view's fallback. Icons and accessories show nothing. |
| `cleanup`  | The function `mount` returned, when the view unmounts                    | Nothing                                                  |
| `title`    | A `title` function                                                       | The type's name as the tab title                         |
| `menu`     | A type's `menu` function or the `panelMenu` option                       | The menu without those items                             |
| `guard`    | A close guard                                                            | The view stays open                                      |
| `listener` | A listener on the workspace or a view, or a view state subscription      | Nothing. Other listeners still run.                      |
| `callback` | Another option, such as `onMissingType`, `hideToward` or `errorFallback` | The option's default behaviour                           |
| `content`  | Your own code, through `ws.reportError`                                  | Nothing                                                  |

Each view renders in isolation. In React, every view's content sits in its own error boundary, so one component throwing doesn't unmount the workspace, and other views keep their state.

## The fallback

A view whose content fails shows its title, the error message and a **Try again** button, which mounts or renders the content again. It's `[data-trellis-part="view-error"]`, with `role="alert"`, for styling.

To show your own, pass `errorFallback`. In the core, it returns a DOM node or text:

```ts
createWorkspace(el, {
  types,
  errorFallback: ({ error, view, retry }) => {
    const box = document.createElement("div");
    box.textContent = `${view.title} is unavailable.`;
    const again = document.createElement("button");
    again.textContent = "Reload";
    again.onclick = retry;
    box.append(again);
    return box;
  },
});
```

In React, it's a function returning React content, on the workspace or on a single type:

```tsx
<Workspace errorFallback={({ view, retry }) => <ViewUnavailable title={view.title} onRetry={retry} />}>
  <ViewType id="map" title="Map" errorFallback={({ retry }) => <MapOffline onRetry={retry} />}>
    <IncidentMap />
  </ViewType>
</Workspace>
```

A type's own `errorFallback` wins over the workspace's. In React, the workspace's `errorFallback` covers React content. Views that use `mount` or `iframe` show the core fallback.

## Reporting your own errors

`ws.reportError` sends an error through the same event, so errors from your content land in one place:

```ts
socket.addEventListener("error", (e) => ws.reportError(e, { viewId: view.id, source: "content" }));
```

`source` defaults to `"content"`. The event adds the view's type when you pass a `viewId`.

## Iframes

A view's iframe runs its own document, so errors inside it don't reach Trellis. A page that fails to load shows the browser's own error inside the frame. To report errors from a same-origin frame, listen in the frame and call `ws.reportError` from the parent.
