import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

type Render = (close: (value: unknown) => void) => ReactNode;
let current: { render: Render; resolve: (v: unknown) => void; key: number } | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Show a modal rendered by the app (outside the workspace) and resolve with the chosen value. */
export function openDialog<T>(render: (close: (value: T) => void) => ReactNode, dismissValue?: T): Promise<T> {
  current?.resolve(undefined);
  return new Promise<T>((resolve) => {
    const key = ++seq;
    const done = (v: unknown) => {
      if (current?.key === key) {
        current = null;
        notify();
      }
      resolve((v === undefined ? dismissValue : v) as T);
    };
    current = { render: render as Render, resolve: done, key };
    notify();
  });
}

export interface ConfirmOptions<T extends string> {
  title: string;
  message: ReactNode;
  icon?: ReactNode;
  actions: { value: T; label: string; kind?: "primary" | "danger" | "ghost" }[];
  cancel: T;
}
export function confirmDialog<T extends string>(o: ConfirmOptions<T>): Promise<T> {
  return openDialog<T>(
    (close) => (
      <div className="dialog-body">
        {o.icon && <div className="dialog-icon">{o.icon}</div>}
        <div className="dialog-text">
          <h2 className="dialog-title">{o.title}</h2>
          <div className="dialog-message">{o.message}</div>
        </div>
        <div className="dialog-actions">
          {o.actions.map((a, i) => (
            <button key={a.value} className={`btn btn-${a.kind ?? "ghost"}`} onClick={() => close(a.value)} autoFocus={i === o.actions.length - 1}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    ),
    o.cancel,
  );
}

export function DialogHost() {
  const d = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => current,
  );
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!d) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        d.resolve(undefined);
      }
    };
    window.addEventListener("keydown", onKey, true);
    requestAnimationFrame(() => {
      if (!box.current?.contains(document.activeElement)) box.current?.querySelector<HTMLElement>("[autofocus], input, button")?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [d]);
  if (!d) return null;
  return (
    <div className="dialog-scrim" onPointerDown={(e) => e.target === e.currentTarget && d.resolve(undefined)}>
      <div ref={box} className="dialog" role="dialog" aria-modal="true" key={d.key}>
        {d.render(d.resolve)}
      </div>
    </div>
  );
}
