export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === "class") el.className = String(value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  el.append(...children);
  return el;
}

export const icons = {
  close:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>',
  more:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.25" fill="currentColor"/><circle cx="8" cy="8" r="1.25" fill="currentColor"/><circle cx="12.5" cy="8" r="1.25" fill="currentColor"/></svg>',
  chevron:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  check:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
};

/** Write a style property only when it changed. Rendering runs every frame. */
export function setStyle(el: HTMLElement, key: string, value: string) {
  const cache = ((el as any).__trellis ??= {}) as Record<string, string>;
  if (cache[key] === value) return;
  cache[key] = value;
  if (key.startsWith("--")) el.style.setProperty(key, value);
  else (el.style as any)[key] = value;
}

export function setAttr(el: Element, key: string, value: string | null) {
  if (value === null) {
    if (el.hasAttribute(key)) el.removeAttribute(key);
  } else if (el.getAttribute(key) !== value) el.setAttribute(key, value);
}

export function place(
  el: HTMLElement,
  r: { x: number; y: number; w: number; h: number },
  round: boolean,
) {
  let { x, y, w, h } = r;
  if (round) {
    const x2 = Math.round(x + w);
    const y2 = Math.round(y + h);
    x = Math.round(x);
    y = Math.round(y);
    w = x2 - x;
    h = y2 - y;
  }
  setStyle(el, "transform", `translate(${x}px, ${y}px)`);
  setStyle(el, "width", `${Math.max(0, w)}px`);
  setStyle(el, "height", `${Math.max(0, h)}px`);
}
