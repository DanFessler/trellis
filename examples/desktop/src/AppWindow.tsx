import { useEffect, useRef } from "react";
import { useView, useWorkspace } from "@danfessler/trellis-react";
import { appIcon } from "./demo/icons";
import { appById, pageFor, type AppDefinition, type AppParams } from "./apps";
import { isDocked, launch, minimize, raise, toggleDock } from "./desktop";

/** An app's artwork on its colored squircle. */
export function AppIcon({ app, className = "app-icon" }: { app: AppDefinition; className?: string }) {
  return (
    <span
      className={`${className} dock-app-${app.index}`}
      data-app={app.id}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: appIcon(app.index) }}
    />
  );
}

/**
 * A demo app page in a same-origin, script-less iframe Trellis mounts view
 * content once and never moves it, so typed text survives docking, tabbing, framing and hiding.
 * The host wires the document for things Trellis cannot see inside iframes: raising the window
 * on click, opening folders, and forwarding pinch/Ctrl+wheel zoom to the workspace.
 */
export function AppFrame({ app }: { app: AppDefinition }) {
  const view = useView<AppParams>();
  const ws = useWorkspace();
  const page = pageFor(app, view.params);
  const bridge = useRef<AbortController | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => () => bridge.current?.abort(), []);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The page draws its own title bar under Trellis's overlaid bar.
  const applyChrome = () => {
    const doc = frameRef.current?.contentDocument?.documentElement;
    const content = viewRef.current.element;
    if (!doc || !content) return;
    const style = getComputedStyle(content);
    doc.style.setProperty(
      "--window-titlebar-height",
      style.getPropertyValue("--trellis-titlebar-height") || "48px",
    );
    doc.style.setProperty(
      "--window-controls-inset",
      style.getPropertyValue("--trellis-titlebar-inset-end") || "88px",
    );
    doc.setAttribute("data-window-active", String(viewRef.current.focused));
  };
  useEffect(applyChrome);
  // Title-bar metrics arrive as CSS variables on the content element; mirror them into the page.
  useEffect(() => {
    const observer = new MutationObserver(applyChrome);
    observer.observe(view.element, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.element]);

  const connect = (frame: HTMLIFrameElement) => {
    bridge.current?.abort();
    const doc = frame.contentDocument;
    if (!doc) return;
    const controller = new AbortController();
    bridge.current = controller;
    applyChrome();
    const { signal } = controller;
    const id = viewRef.current.id;
    // open() moves focus into the view before React has portaled the iframe in, so focus lands
    // on the tab. Hand it to the document once it exists.
    if (viewRef.current.focused && document.activeElement?.closest("[data-trellis-part=tab]")) frame.focus();

    doc.addEventListener("pointerdown", () => raise(ws, id), { capture: true, signal });

    const openResource = (target: HTMLElement) => {
      const folder = target.dataset.openResource!;
      if (app.id === "finder") viewRef.current.setParams({ folder });
      else launch(ws, appById("finder")!, { folder });
    };
    doc.addEventListener(
      "dblclick",
      (e) => {
        const target = (e.target as Element).closest<HTMLElement>("[data-open-resource]");
        if (target) openResource(target);
      },
      { signal },
    );
    // Sidebar entries navigate on a single click, like a Finder sidebar.
    doc.addEventListener(
      "click",
      (e) => {
        const target = (e.target as Element).closest<HTMLElement>("aside [data-open-resource]");
        if (target) openResource(target);
      },
      { signal },
    );
    doc.addEventListener(
      "keydown",
      (e) => {
        const target = (e.target as Element).closest<HTMLElement>("[data-open-resource]");
        if (e.key === "Enter" && target) openResource(target);
        if (e.key === "Escape" && ws.navigation.framed) ws.navigation.back();
      },
      { signal },
    );
    // Wheel events never leave an iframe. Re-dispatch zoom gestures on the workspace element so
    // Trellis's free navigation sees them (it treats the root element as "not over content").
    doc.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        const r = frame.getBoundingClientRect();
        const scale = frame.offsetWidth ? r.width / frame.offsetWidth : 1;
        const forwarded = new WheelEvent("wheel", {
          clientX: r.left + e.clientX * scale,
          clientY: r.top + e.clientY * scale,
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaMode: e.deltaMode,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          bubbles: true,
          cancelable: true,
        });
        ws.element.dispatchEvent(forwarded);
        if (forwarded.defaultPrevented) e.preventDefault();
      },
      { passive: false, signal },
    );
  };

  return (
    <iframe
      ref={frameRef}
      className="app-frame"
      title={page.title}
      sandbox="allow-same-origin"
      srcDoc={page.html}
      onLoad={(e) => connect(e.currentTarget)}
    />
  );
}

/** Title-bar accessory over the page's own title bar: dock toggle, minimize and close. */
export function WindowControls({ app }: { app: AppDefinition }) {
  const view = useView<AppParams>();
  const ws = useWorkspace();
  const page = pageFor(app, view.params);
  const docked = isDocked(ws, view.id);
  // view.title can still be the type id for function titles (see notes/desktop-agent.md), so name
  // the window from the page itself.
  const name = page.heading;
  return (
    <div className="window-accessory">
      <div className="traffic-lights" data-focused={view.focused ? "" : undefined}>
        <button
          type="button"
          className="light light-zoom"
          aria-label={docked ? `Float ${name} on the desktop` : `Dock ${name} beside the desktop`}
          title={docked ? "Float on Desktop" : "Dock Beside Desktop"}
          onClick={() => toggleDock(ws, view.id)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.5 5.2V3.5h1.7M8.5 6.8v1.7H6.8" />
          </svg>
        </button>
        <button
          type="button"
          className="light light-minimize"
          aria-label={`Minimize ${name}`}
          title="Minimize to Dock"
          onClick={() => minimize(ws, view.id)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.3 6h5.4" />
          </svg>
        </button>
        <button
          type="button"
          className="light light-close"
          aria-label={`Close ${name}`}
          title="Close"
          onClick={() => void view.close()}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="m3.8 3.8 4.4 4.4m0-4.4L3.8 8.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
