/** A pointer's position inside an element, in the element's own CSS pixels. Workspace views can be
 * drawn scaled (below their minimum size, or mid-zoom), where on-screen pixels and layout pixels
 * differ: the ratio of the two converts between them. */
export function localPoint(el: HTMLElement, e: { clientX: number; clientY: number }) {
  const r = el.getBoundingClientRect();
  const kx = r.width / (el.offsetWidth || 1) || 1;
  const ky = r.height / (el.offsetHeight || 1) || 1;
  return { x: (e.clientX - r.left) / kx, y: (e.clientY - r.top) / ky };
}
