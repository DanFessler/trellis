import { useEffect, useRef } from "react";
import { useWorkspace, useWorkspaceState } from "@danfessler/trellis-react";
import { APPS, appById, pageFor } from "./apps";
import { AppIcon } from "./AppWindow";
import { activateApp } from "./desktop";

const REST = 46;
const GROW = 26;
const SPACING = 55;

/** Magnify icons near the pointer (ported from the prototype's dock). */
function useMagnification(dock: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = dock.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let pointerX: number | null = null;
    let origin = 0;
    let strength = 0;
    let frame = 0;
    let last = 0;
    const buttons = () => [...el.querySelectorAll<HTMLElement>("[data-magnify]")];
    const paint = () => {
      const items = buttons();
      // Fixed resting centers avoid layout feedback from the growing icons.
      const bounds = el.getBoundingClientRect();
      const center = bounds.left + bounds.width / 2;
      const centers = items.map((_, i) => center + (i - (items.length - 1) / 2) * SPACING);
      if (pointerX !== null) origin = pointerX;
      items.forEach((item, i) => {
        const distance = Math.min(1, Math.abs(centers[i] - origin) / 135);
        const influence = (1 + Math.cos(Math.PI * distance)) / 2;
        item.style.setProperty("--dock-size", `${REST + influence * GROW * strength}px`);
      });
    };
    const tick = (time: number) => {
      const target = pointerX !== null ? 1 : 0;
      const amount = reduced.matches ? 1 : 1 - Math.exp(-Math.min(32, time - last) / 65);
      last = time;
      strength += (target - strength) * amount;
      const unsettled = Math.abs(target - strength) > 0.001;
      if (!unsettled) strength = target;
      paint();
      frame = unsettled ? requestAnimationFrame(tick) : 0;
    };
    const animate = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pointerX = e.clientX;
      paint();
      animate();
    };
    const leave = () => {
      pointerX = null;
      animate();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [dock]);
}

/**
 * The dock, derived entirely from workspace state: app launchers with running indicators, and
 * minimized (hidden) windows that restore by flying out of their tile.
 */
export function Dock() {
  const ws = useWorkspace();
  const state = useWorkspaceState();
  const ref = useRef<HTMLDivElement>(null);
  useMagnification(ref);
  const focusedType = state.views.find((v) => v.id === state.focusedView)?.type;
  return (
    <div className="dock" ref={ref} role="toolbar" aria-label="Dock">
      {APPS.map((app) => {
        const running = state.views.some((v) => v.type === app.id);
        return (
          <button
            key={app.id}
            type="button"
            className="dock-item"
            data-magnify=""
            data-dock-app={app.id}
            data-running={running ? "" : undefined}
            data-active={focusedType === app.id ? "" : undefined}
            aria-label={`Open ${app.name}`}
            onClick={(e) => activateApp(ws, app, e.currentTarget.querySelector(".dock-icon"))}
          >
            <span className="dock-label">{app.name}</span>
            <AppIcon app={app} className="dock-icon" />
            <span className="dock-dot" />
          </button>
        );
      })}
      {state.hidden.length > 0 && <span className="dock-separator" aria-hidden="true" />}
      {state.hidden.map(({ panelId, views }) => {
        const selected = views.find((v) => v.selected) ?? views[0];
        const app = selected && appById(selected.type);
        if (!app) return null;
        const title = pageFor(app, selected.params).heading || selected.title;
        return (
          <button
            key={panelId}
            type="button"
            className="dock-item dock-minimized"
            data-magnify=""
            data-hidden-panel={panelId}
            aria-label={`Restore ${title}`}
            onClick={(e) =>
              ws.restore(panelId, { from: e.currentTarget.querySelector(".dock-window") ?? undefined })
            }
          >
            <span className="dock-label">{title}</span>
            <span className="dock-icon dock-window">
              <span className="dock-window-bar" />
              <AppIcon app={app} className="dock-window-badge" />
            </span>
            <span className="dock-dot" />
          </button>
        );
      })}
    </div>
  );
}
