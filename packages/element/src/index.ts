import {
  createWorkspace,
  type LayoutDocument,
  type LayoutSpec,
  type ViewTypeDefinition,
  type ViewTypes,
  type WorkspaceHandle,
  type WorkspaceOptions,
} from "@danfessler/trellis";

type Options = Omit<WorkspaceOptions, "types">;

const bool = (el: Element, name: string): boolean | undefined => {
  if (!el.hasAttribute(name)) return undefined;
  const value = el.getAttribute(name);
  return value !== "false";
};

/** `<template data-view-type="notes" data-title="Notes">…</template>` → a view type that clones the template. */
function typeFromTemplate(template: HTMLTemplateElement): [string, ViewTypeDefinition] {
  const d = template.dataset;
  const id = d.viewType!;
  const allow: ViewTypeDefinition["allow"] = {};
  if (d.allowStage !== undefined) allow.stage = d.allowStage !== "false";
  if (d.allowSide !== undefined) allow.side = d.allowSide !== "false";
  if (d.allowFloating !== undefined) allow.floating = d.allowFloating !== "false";
  const def: ViewTypeDefinition = {
    title: d.title ?? id,
    icon: d.icon,
    placement: (d.placement as ViewTypeDefinition["placement"]) ?? undefined,
    allow: Object.keys(allow).length ? allow : undefined,
    singleton: d.singleton !== undefined ? d.singleton !== "false" : undefined,
    closable: d.closable !== undefined ? d.closable !== "false" : undefined,
    gestures: d.gestures === "workspace" ? "workspace" : undefined,
    tabbar: d.tabbar === "auto" || d.tabbar === "never" ? d.tabbar : undefined,
    className: d.class,
  };
  if (d.minWidth || d.minHeight)
    def.minSize = { width: Number(d.minWidth ?? 0), height: Number(d.minHeight ?? 0) };
  if (d.iframe) {
    const src = d.iframe;
    def.iframe = (view) => src.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(String(view.params[key] ?? "")));
  } else
    def.mount = (el, view) => {
      el.append(template.content.cloneNode(true));
      // Fill [data-param="name"] with params and let scripts find their view.
      for (const node of el.querySelectorAll<HTMLElement>("[data-param]"))
        node.textContent = String(view.params[node.dataset.param!] ?? "");
      el.dispatchEvent(new CustomEvent("trellis-mount", { bubbles: true, detail: { view } }));
    };
  return [id, def];
}

/** Parse `<trellis-split>`, `<trellis-panel>`, `<trellis-view>`, `<trellis-stage>` children. */
function specFrom(el: Element): LayoutSpec | null {
  const tag = el.tagName.toLowerCase();
  const kids = () => [...el.children].map(specFrom).filter((x): x is LayoutSpec => !!x);
  const params = (): Record<string, unknown> | undefined => {
    const raw = el.getAttribute("params");
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      console.warn("Trellis: invalid params JSON", raw);
      return undefined;
    }
  };
  switch (tag) {
    case "trellis-view":
      return {
        kind: "view",
        type: el.getAttribute("type") ?? "",
        id: el.getAttribute("view-id") ?? el.id ?? undefined,
        title: el.getAttribute("title") ?? undefined,
        params: params(),
      };
    case "trellis-panel":
      return {
        kind: "panel",
        id: el.getAttribute("panel-id") ?? undefined,
        selected: el.hasAttribute("selected") ? Number(el.getAttribute("selected")) : undefined,
        views: kids().filter((k): k is Extract<LayoutSpec, { kind: "view" }> => k.kind === "view"),
      };
    case "trellis-split":
      return {
        kind: "split",
        axis: el.getAttribute("axis") === "y" ? "y" : "x",
        weights: el.getAttribute("weights")?.split(/[\s,]+/).filter(Boolean).map(Number),
        children: kids(),
      };
    case "trellis-stage": {
      const children = kids();
      return {
        kind: "stage",
        id: el.getAttribute("stage-id") ?? undefined,
        child: children.length > 1 ? { kind: "split", axis: "x", children } : children[0],
      };
    }
  }
  return null;
}

/**
 * `<trellis-workspace>`: a light-DOM custom element around `createWorkspace`.
 *
 * Attributes: theme, floating ("false" | "stage" | "overlay"), navigation ("false" | "focus" | "free"),
 * motion, storage-key, version, label, panel-menu.
 * Children: `<template data-view-type>` definitions, one layout root (`<trellis-split>` etc.),
 * and optional `<div slot="backdrop|stage-empty|empty|chrome">` content.
 * Properties: `types` (merged over template types), `defaultLayout`, `document`, `options`, and `workspace` (the handle).
 * Events: trellis-ready, trellis-change, trellis-open, trellis-close, trellis-focus, trellis-navigate.
 */
// Importing on a server (SSR) must not throw; the element is only defined in browsers.
const ElementBase = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;

export class TrellisWorkspaceElement extends ElementBase {
  static observedAttributes = ["theme", "floating", "navigation", "motion", "panel-menu"];
  private handle: WorkspaceHandle | null = null;
  private pending = false;
  private _types: ViewTypes = {};
  private _options: Partial<Options> = {};
  private _defaultLayout: LayoutDocument | LayoutSpec | null = null;
  private _document: LayoutDocument | undefined;
  private templateTypes: ViewTypes = {};

  /** The imperative workspace handle, or null before the element connects. */
  get workspace(): WorkspaceHandle | null {
    return this.handle;
  }
  get types(): ViewTypes {
    return this._types;
  }
  set types(value: ViewTypes) {
    this._types = value ?? {};
    this.handle?.update({ types: this.allTypes() });
  }
  get options(): Partial<Options> {
    return this._options;
  }
  set options(value: Partial<Options>) {
    this._options = value ?? {};
    this.handle?.update(this.liveOptions());
  }
  get defaultLayout() {
    return this._defaultLayout;
  }
  set defaultLayout(value: LayoutDocument | LayoutSpec | null) {
    this._defaultLayout = value;
  }
  get document(): LayoutDocument | undefined {
    return this.handle?.getDocument() ?? this._document;
  }
  set document(value: LayoutDocument | undefined) {
    this._document = value;
    if (value && this.handle) this.handle.setDocument(value);
  }

  connectedCallback() {
    if (this.handle || this.pending) return;
    this.pending = true;
    // Let the parser finish our children first.
    const start = () => {
      this.pending = false;
      if (this.isConnected && !this.handle) this.init();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else queueMicrotask(start);
  }
  disconnectedCallback() {
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.handle?.destroy();
      this.handle = null;
    });
  }
  attributeChangedCallback() {
    this.handle?.update(this.liveOptions());
  }

  private allTypes(): ViewTypes {
    return { ...this.templateTypes, ...this._types };
  }
  private attr<T extends string>(name: string): T | undefined {
    return (this.getAttribute(name) ?? undefined) as T | undefined;
  }
  private liveOptions(): Partial<Options> {
    const floating = this.attr("floating");
    const navigation = this.attr("navigation");
    return {
      ...(this.hasAttribute("theme") ? { theme: this.attr("theme") } : {}),
      ...(floating !== undefined ? { floating: floating === "false" ? false : (floating as "stage" | "overlay") } : {}),
      ...(navigation !== undefined ? { navigation: navigation === "false" ? false : (navigation as "focus" | "free") } : {}),
      ...(this.hasAttribute("motion") ? { motion: this.attr("motion") } : {}),
      ...(this.hasAttribute("panel-menu") ? { panelMenu: bool(this, "panel-menu") } : {}),
      ...this._options,
    };
  }
  private init() {
    this.templateTypes = Object.fromEntries(
      [...this.querySelectorAll<HTMLTemplateElement>(":scope > template[data-view-type]")].map(typeFromTemplate),
    );
    const layoutEl = [...this.children].find((c) => c.tagName.toLowerCase().startsWith("trellis-"));
    const spec = layoutEl ? specFrom(layoutEl) : null;
    const slotted = new Map<string, Element>();
    for (const child of [...this.children]) {
      const slot = child.getAttribute("slot");
      if (slot) slotted.set(slot, child);
    }
    // Keep definitions out of the way; the workspace renders its own tree.
    for (const child of [...this.children]) if (!(child instanceof HTMLTemplateElement)) (child as HTMLElement).hidden = true;
    const container = document.createElement("div");
    container.style.cssText = "width:100%;height:100%";
    this.append(container);
    if (!this.style.display) this.style.display = "block";
    const storage = this.getAttribute("storage-key");
    const version = this.getAttribute("version") ?? undefined;
    this.handle = createWorkspace(container, {
      ...this.liveOptions(),
      types: this.allTypes(),
      label: this.getAttribute("label") ?? undefined,
      defaultLayout: this._defaultLayout ?? spec,
      document: this._document,
      persist: storage ? { key: storage, version } : undefined,
    });
    const slots = this.handle.slots;
    const target: Record<string, HTMLElement> = {
      backdrop: slots.backdrop,
      "stage-empty": slots.stageEmpty,
      empty: slots.empty,
      chrome: slots.chrome,
    };
    for (const [name, el] of slotted) {
      if (!target[name]) continue;
      (el as HTMLElement).hidden = false;
      el.removeAttribute("slot");
      target[name].append(el);
    }
    const forward = (name: "change" | "open" | "close" | "focus" | "navigate") =>
      this.handle!.on(name, (detail: unknown) =>
        this.dispatchEvent(new CustomEvent(`trellis-${name}`, { detail, bubbles: true })),
      );
    forward("change");
    forward("open");
    forward("close");
    forward("focus");
    forward("navigate");
    this.dispatchEvent(new CustomEvent("trellis-ready", { detail: this.handle, bubbles: true }));
  }
}

/** Register the element (idempotent). Called automatically on import. */
export function defineTrellisElement(tag = "trellis-workspace") {
  if (typeof customElements === "undefined" || customElements.get(tag)) return;
  customElements.define(tag, class extends TrellisWorkspaceElement {});
}
defineTrellisElement();

declare global {
  interface HTMLElementTagNameMap {
    "trellis-workspace": TrellisWorkspaceElement;
  }
}
export * from "@danfessler/trellis";
