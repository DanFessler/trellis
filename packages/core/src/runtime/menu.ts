import { h, icons } from "./dom";
import type { MenuEntry, MenuItem } from "./types";

/** Drop leading, trailing and repeated separators. */
export function tidyMenu(entries: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const entry of entries) {
    if (entry === "separator" && (!out.length || out[out.length - 1] === "separator")) continue;
    out.push(entry);
  }
  while (out[out.length - 1] === "separator") out.pop();
  return out;
}

/** A small accessible popup menu, positioned in the workspace's own coordinates. */
export class Menu {
  private el: HTMLElement | null = null;
  private submenu: Menu | null = null;
  private restoreFocus: HTMLElement | null = null;
  constructor(
    private host: HTMLElement,
    private onClose: () => void = () => {},
  ) {}
  get open() {
    return !!this.el;
  }
  /** Right to left, submenus open to the left and the arrow keys swap. */
  private get rtl() {
    return getComputedStyle(this.host).direction === "rtl";
  }
  show(entries: MenuEntry[], anchor: { x: number; y: number; alignRight?: boolean }, focusFirst = true) {
    this.close(false);
    this.restoreFocus = document.activeElement as HTMLElement | null;
    const el = h("div", { class: "trellis-menu", role: "menu", "data-trellis-part": "menu" });
    entries = tidyMenu(entries);
    for (const entry of entries) {
      if (entry === "separator") {
        el.append(h("div", { class: "trellis-menu-separator", role: "separator" }));
        continue;
      }
      el.append(this.item(entry));
    }
    this.host.append(el);
    this.el = el;
    const bounds = this.host.getBoundingClientRect();
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    let x = anchor.alignRight ? anchor.x - width : anchor.x;
    let y = anchor.y;
    x = Math.max(4, Math.min(bounds.width - width - 4, x));
    if (y + height > bounds.height - 4) y = Math.max(4, bounds.height - height - 4);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.addEventListener("keydown", (e) => this.keydown(e));
    const outside = (e: PointerEvent) => {
      if (!this.el) return document.removeEventListener("pointerdown", outside, true);
      if (!(e.target instanceof Node) || !this.contains(e.target)) this.close();
    };
    document.addEventListener("pointerdown", outside, true);
    const cleanup = () => document.removeEventListener("pointerdown", outside, true);
    (el as any).__cleanup = cleanup;
    if (focusFirst) this.items()[0]?.focus();
    else el.focus();
  }
  contains(node: Node): boolean {
    return !!this.el?.contains(node) || !!this.submenu?.contains(node);
  }
  private items(): HTMLElement[] {
    return [
      ...(this.el?.querySelectorAll<HTMLElement>(
        ":scope > [role=menuitem]:not([aria-disabled=true]), :scope > [role=menuitemcheckbox]:not([aria-disabled=true])",
      ) ?? []),
    ];
  }
  private item(entry: MenuItem) {
    const role = entry.checked !== undefined ? "menuitemcheckbox" : "menuitem";
    const button = h("button", {
      class: `trellis-menu-item${entry.danger ? " trellis-danger" : ""}`,
      role,
      tabindex: "-1",
      "aria-disabled": entry.disabled ? "true" : undefined,
      "aria-checked": entry.checked === undefined ? undefined : String(entry.checked),
      "aria-haspopup": entry.items ? "menu" : undefined,
    });
    const check = h("span", { class: "trellis-menu-check" });
    if (entry.checked) check.innerHTML = icons.check;
    button.append(check, h("span", { class: "trellis-menu-label" }, entry.label));
    if (entry.shortcut) button.append(h("span", { class: "trellis-menu-shortcut" }, entry.shortcut));
    if (entry.items) {
      const chevron = h("span", { class: "trellis-menu-chevron" });
      chevron.innerHTML = icons.chevron;
      button.append(chevron);
    }
    const openSub = () => {
      if (!entry.items || entry.disabled) return;
      this.submenu?.close(false);
      this.submenu = new Menu(this.host);
      const r = button.getBoundingClientRect();
      const b = this.host.getBoundingClientRect();
      this.submenu.show(
        entry.items,
        this.rtl
          ? { x: r.left - b.left + 4, y: r.top - b.top - 5, alignRight: true }
          : { x: r.right - b.left - 4, y: r.top - b.top - 5 },
      );
      this.submenu.parent = this;
    };
    button.addEventListener("pointerenter", () => {
      if (entry.items) openSub();
      else if (this.submenu) {
        this.submenu.close(false);
        this.submenu = null;
      }
    });
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      if (entry.disabled) return;
      if (entry.items) return openSub();
      this.root().close();
      entry.run?.();
    });
    return button;
  }
  parent: Menu | null = null;
  private root(): Menu {
    let menu: Menu = this;
    while (menu.parent) menu = menu.parent;
    return menu;
  }
  private keydown(e: KeyboardEvent) {
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    const [open, back] = this.rtl ? ["ArrowLeft", "ArrowRight"] : ["ArrowRight", "ArrowLeft"];
    switch (e.key) {
      case "ArrowDown":
        return move(index + 1);
      case "ArrowUp":
        return move(index - 1);
      case "Home":
        return move(0);
      case "End":
        return move(items.length - 1);
      case open:
        if (items[index]?.getAttribute("aria-haspopup")) {
          e.preventDefault();
          items[index].click();
        }
        return;
      case back:
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        if (this.parent) {
          const parent = this.parent;
          this.close(false);
          parent.submenu = null;
          parent.el?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
        } else this.close();
        return;
      case "Tab":
        e.preventDefault();
        this.root().close();
        return;
    }
  }
  close(restore = true) {
    this.submenu?.close(false);
    this.submenu = null;
    if (!this.el) return;
    (this.el as any).__cleanup?.();
    this.el.remove();
    this.el = null;
    if (restore && this.restoreFocus?.isConnected) this.restoreFocus.focus();
    if (!this.parent) this.onClose();
  }
}
