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

/** The built-in fallback for a view whose content failed to mount. Text only: messages are never
 * parsed as markup. */
export function errorFallbackElement(title: string, error: unknown, retry: () => void): HTMLElement {
  const message = error instanceof Error ? error.message : String(error);
  const button = h("button", { type: "button", "data-trellis-part": "view-error-retry" }, "Try again");
  button.addEventListener("click", retry);
  return h(
    "div",
    { "data-trellis-part": "view-error", role: "alert" },
    h("strong", {}, `${title} couldn’t load`),
    h("p", {}, message),
    button,
  );
}

const SVG = "http://www.w3.org/2000/svg";
/** A 16×16 icon built from elements, not markup, so it works where Trusted Types are enforced. */
function icon(...shapes: [tag: "path" | "circle", attrs: Record<string, string>][]): () => SVGSVGElement {
  return () => {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attrs] of shapes) {
      const shape = document.createElementNS(SVG, tag);
      for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
      svg.append(shape);
    }
    return svg;
  };
}
const stroke = (d: string, width = "1.5") => ({
  d,
  stroke: "currentColor",
  "stroke-width": width,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  fill: "none",
});
const dot = (cx: string) => ({ cx, cy: "8", r: "1.25", fill: "currentColor" });
export const icons = {
  close: icon(["path", stroke("M4.5 4.5l7 7m0-7l-7 7")]),
  more: icon(["circle", dot("3.5")], ["circle", dot("8")], ["circle", dot("12.5")]),
  chevron: icon(["path", stroke("M6 4l4 4-4 4")]),
  check: icon(["path", stroke("M3.5 8.5l3 3 6-7", "1.6")]),
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

export function place(el: HTMLElement, r: { x: number; y: number; w: number; h: number }, round: boolean) {
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
