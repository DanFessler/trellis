import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { CheckIcon } from "./icons";

export type MenuDef =
  | {
      label: string;
      shortcut?: string;
      run?(): void;
      checked?: boolean;
      radio?: boolean;
      disabled?: boolean;
      danger?: boolean;
      icon?: ReactNode;
    }
  | { section: string }
  | "separator";

export interface TopMenu {
  label: string;
  items: () => MenuDef[];
  buttonRef?: Ref<HTMLButtonElement>;
}

export function Menubar({ menus }: { menus: TopMenu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const viaKeyboard = useRef(false);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const onDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((o) => (o === null ? o : (o + 1) % menus.length));
      if (e.key === "ArrowLeft") setOpen((o) => (o === null ? o : (o - 1 + menus.length) % menus.length));
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, menus.length]);

  return (
    <div className="menubar" ref={bar} role="menubar">
      {menus.map((m, i) => (
        <div key={m.label} className="menubar-item">
          <button
            ref={m.buttonRef}
            type="button"
            className="menubar-button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              viaKeyboard.current = false;
              setOpen(open === i ? null : i);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                viaKeyboard.current = true;
                setOpen(i);
              }
            }}
            onPointerEnter={() => open !== null && setOpen(i)}
          >
            {m.label}
          </button>
          {open === i && (
            <Dropdown items={m.items()} close={() => setOpen(null)} autoFocus={viaKeyboard.current} />
          )}
        </div>
      ))}
    </div>
  );
}

function Dropdown({ items, close, autoFocus }: { items: MenuDef[]; close(): void; autoFocus: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus)
      ref.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <div
      className="dropdown"
      role="menu"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const buttons = [...ref.current!.querySelectorAll<HTMLElement>("button:not(:disabled)")];
        const i = buttons.indexOf(document.activeElement as HTMLElement);
        buttons[(i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}
    >
      {items.map((item, i) => {
        if (item === "separator") return <div key={i} className="dropdown-sep" role="separator" />;
        if ("section" in item)
          return (
            <div key={i} className="dropdown-section">
              {item.section}
            </div>
          );
        return (
          <button
            key={i}
            type="button"
            role={
              item.checked !== undefined ? (item.radio ? "menuitemradio" : "menuitemcheckbox") : "menuitem"
            }
            aria-checked={item.checked}
            className="dropdown-item"
            data-danger={item.danger || undefined}
            disabled={item.disabled}
            onClick={() => {
              close();
              item.run?.();
            }}
          >
            <span className="dropdown-check">
              {item.checked ? (
                item.radio ? (
                  <span className="radio-dot" />
                ) : (
                  <CheckIcon size={13} />
                )
              ) : (
                item.icon
              )}
            </span>
            <span className="dropdown-label">{item.label}</span>
            {item.shortcut && <span className="dropdown-shortcut">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
