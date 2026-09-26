import { createDocument, type LayoutSpec } from "../model/builder";
import {
  clampFloat,
  closeView as closeViewInDoc,
  detachView,
  emptyDocument,
  floatPanel,
  hidePanel,
  insertPanel,
  locatePanel,
  panelOfView,
  raiseFloat,
  removePanel,
  restorePanel,
  sanitize,
  selectView,
  uid,
  viewIds,
  type DockTarget,
} from "../model/document";
import { createDragController, DROP_SLOT, SOURCE_SLOT, type DragController, type Region } from "./drag";
import { createNavigator, type Navigator } from "./navigation";
import {
  findNode,
  findStage,
  layoutRects,
  panelsOf,
  replaceNode,
  resizeBoundary,
  UNIT,
  type Entry,
} from "../model/tree";
import type {
  FloatingLayer,
  LayoutDocument,
  LayoutNode,
  PanelNode,
  Params,
  Placement,
  Rect,
  SplitNode,
} from "../model/types";
import { h, icons, place, setAttr, setStyle } from "./dom";
import { DEFAULT_KEYMAP, formatCombo, matches, type Command } from "./keymap";
import { Emitter, Lifetime } from "./lifetime";
import { Menu } from "./menu";
import { DOCK_EASE, DOCK_MS, lerpRect, LayoutTween, MOTION, RectSpring, sameRect } from "./motion";
import type {
  IframeOptions,
  MenuEntry,
  MenuItem,
  OpenOptions,
  Surface,
  ViewInfo,
  ViewPlacement,
  ViewState,
  ViewTypeDefinition,
  WorkspaceEvents,
  WorkspaceHandle,
  WorkspaceOptions,
  WorkspaceSnapshot,
} from "./types";
import { ViewController } from "./view";

interface TabDom {
  el: HTMLElement;
  title: HTMLElement;
  badge: HTMLElement;
  close: HTMLElement;
}
interface PanelDom {
  id: string;
  el: HTMLElement;
  tabbar: HTMLElement;
  tablist: HTMLElement;
  accessories: HTMLElement;
  menuButton: HTMLButtonElement;
  tabs: Map<string, TabDom>;
  handles: HTMLElement | null;
  /** Shown instead of content when the panel is too small to use ("frame only"). */
  frameIcon: HTMLElement;
  /** Width the accessories and menu take at the end of an overlaid title bar. */
  endInset: number;
}
interface SurfaceRecord {
  controller: ViewController;
  shell: HTMLElement;
  content: HTMLElement;
  icon: HTMLElement;
  accessory: HTMLElement;
  cleanup: (() => void) | null;
  mountedWith: ViewTypeDefinition | null;
  mountKey: unknown;
  iconHtml: string | null;
  surface: Surface;
}
interface Leaving {
  panel: PanelNode;
  from: Rect;
  to: Rect;
  start: number;
  duration: number;
}

const TYPE_PLACEHOLDER = (type: string): ViewTypeDefinition => ({
  title: type,
  mount(el) {
    el.append(
      h(
        "div",
        { class: "trellis-placeholder" },
        h("strong", {}, "Unavailable"),
        h("span", {}, `No view type named “${type}” is registered.`),
      ),
    );
  },
});

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const DEFAULT_FLOAT_SIZE = { w: 560, h: 400 };
/** Below this size a panel shows only its icon (the prototype's "frame only" tiles). */
const FRAME_ONLY = { w: 160, h: 64 };

/** Create a workspace inside `host`. Returns an imperative handle. */
export function createWorkspace(host: HTMLElement, initialOptions: WorkspaceOptions): WorkspaceHandle {
  let options: WorkspaceOptions = { ...initialOptions };
  const lifetime = new Lifetime();
  const events = new Emitter<WorkspaceEvents>();
  const listeners = new Set<() => void>();

  // ---------------------------------------------------------------- DOM
  const root = h("div", {
    class: "trellis",
    "data-trellis-root": "",
    role: "region",
    "aria-label": options.label ?? "Workspace",
    tabindex: "-1",
  });
  const backdrop = h("div", { "data-trellis-part": "backdrop" });
  const stageEmpty = h("div", { "data-trellis-part": "stage-empty" });
  const empty = h("div", { "data-trellis-part": "empty" });
  const layer = h("div", { class: "trellis-layer" });
  const dividers = h("div", { class: "trellis-dividers" });
  // Drag slots: where the lifted view came from, and where it will land (the layout reflows around it).
  const sourceSlot = h("div", { "data-trellis-part": "source-slot", "aria-hidden": "true" });
  const dropLabel = h("span", { "data-trellis-part": "drop-label" });
  const dropSlot = h("div", { "data-trellis-part": "drop-slot", "aria-hidden": "true" }, dropLabel);
  const chrome = h("div", { "data-trellis-part": "chrome" });
  const live = h("div", { class: "trellis-sr", "aria-live": "polite" });
  root.append(backdrop, stageEmpty, empty, layer, dividers, sourceSlot, dropSlot, chrome, live);
  host.append(root);
  lifetime.add(() => root.remove());
  const slots = { backdrop, stageEmpty, empty, chrome };
  let menuCloseHook: (() => void) | null = null;
  const menu = new Menu(root, () => {
    menuCloseHook?.();
    menuCloseHook = null;
  });
  lifetime.add(() => menu.close(false));

  // ---------------------------------------------------------------- state
  let doc: LayoutDocument = emptyDocument();
  let entries = new Map<string, Entry>();
  let focusedPanel: string | null = null;
  let focusedView: string | null = null;
  let lastStagePanel: string | null = null;
  const badges = new Map<string, string | number | boolean | null>();
  const panelDoms = new Map<string, PanelDom>();
  const records = new Map<string, SurfaceRecord>();
  const dividerEls = new Map<string, HTMLElement>();
  const lastRects = new Map<string, Rect>();
  const leaving = new Map<string, Leaving>();
  /** Panels restoring out of a dock or button (the reverse of leaving). */
  const entering = new Map<string, { from: Rect; start: number }>();
  const settling = new Set<string>();
  let surfacesList: Surface[] = [];
  let viewport = { w: host.clientWidth, h: host.clientHeight };
  let gap = 6;
  let tabbarHeight = 34;
  const tween = new LayoutTween();
  const camera = new RectSpring(UNIT);
  // Assigned during setup (navigation.ts).
  let nav!: Navigator;
  // Assigned during setup; the drag controller needs the engine's functions.
  let dragger: DragController;
  const lifted = (): PanelNode | null => (dragger?.session?.active ? dragger.session.lifted : null);
  const dragActive = () => !!dragger?.active;
  let gesture = false;
  let frame = 0;
  let lastTime = 0;
  let snapshot: WorkspaceSnapshot | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  let openCounter = 0;
  const reducedQuery =
    typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

  const reduced = () =>
    options.motion === "reduced" || (options.motion !== "full" && !!reducedQuery?.matches);
  const floatingLayer = (): FloatingLayer | false =>
    options.floating === undefined ? "overlay" : options.floating;
  const navigationMode = () => (options.navigation === undefined ? "focus" : options.navigation);

  const placeholders = new Map<string, ViewTypeDefinition>();
  function typeOf(viewId: string): ViewTypeDefinition {
    const type = doc.views[viewId]?.type ?? "unknown";
    const def = options.types[type];
    if (def) return def;
    let placeholder = placeholders.get(type);
    if (!placeholder) placeholders.set(type, (placeholder = TYPE_PLACEHOLDER(type)));
    return placeholder;
  }
  function titleOf(viewId: string): string {
    const record = doc.views[viewId];
    if (!record) return "";
    if (record.title) return record.title;
    const def = options.types[record.type];
    const title = def?.title;
    if (typeof title === "function") {
      const controller = records.get(viewId)?.controller;
      if (controller)
        try {
          return title(controller);
        } catch (error) {
          console.error(error);
        }
    } else if (title) return title;
    return record.type;
  }

  // ---------------------------------------------------------------- theme
  let appliedTokens = new Set<string>();
  function applyTheme() {
    setAttr(root, "data-theme", options.theme ?? "system");
    const tabs = options.tabs ?? {};
    setAttr(root, "data-tab-fill", tabs.fill ? "" : null);
    setAttr(root, "data-tab-bleed", tabs.inset === 0 ? "" : null);
    if (tabs.inset !== undefined) root.style.setProperty("--trellis-tab-inset", `${tabs.inset}px`);
    else if (!options.tokens?.["--trellis-tab-inset"]) root.style.removeProperty("--trellis-tab-inset");
    setAttr(root, "aria-label", options.label ?? "Workspace");
    const tokens = options.tokens ?? {};
    for (const key of appliedTokens) if (!(key in tokens)) root.style.removeProperty(key);
    for (const [key, value] of Object.entries(tokens))
      if (value === "" || value == null) root.style.removeProperty(key);
      else root.style.setProperty(key, value);
    appliedTokens = new Set(Object.keys(tokens));
    setAttr(root, "data-navigation", String(navigationMode()));
    readMetrics();
  }
  function readMetrics() {
    const style = getComputedStyle(root);
    const g = parseFloat(style.getPropertyValue("--trellis-gap"));
    const t = parseFloat(style.getPropertyValue("--trellis-tabbar-height"));
    if (Number.isFinite(g)) gap = g;
    if (Number.isFinite(t)) tabbarHeight = t;
  }

  // ---------------------------------------------------------------- geometry
  const pad = () => gap / 2;
  function toScreen(r: Rect): Rect {
    const c = camera.value;
    const p = pad();
    const W = viewport.w - p * 2;
    const H = viewport.h - p * 2;
    return {
      x: p + ((r.x - c.x) / c.w) * W,
      y: p + ((r.y - c.y) / c.h) * H,
      w: (r.w / c.w) * W,
      h: (r.h / c.h) * H,
    };
  }
  function fromScreen(p: { x: number; y: number }) {
    const c = camera.value;
    const q = pad();
    return {
      x: c.x + ((p.x - q) / (viewport.w - q * 2)) * c.w,
      y: c.y + ((p.y - q) / (viewport.h - q * 2)) * c.h,
    };
  }
  const inset = (r: Rect, d: number): Rect => ({
    x: r.x + d,
    y: r.y + d,
    w: Math.max(0, r.w - d * 2),
    h: Math.max(0, r.h - d * 2),
  });
  function stageWorld(): Rect {
    const stage = findStage(doc.root);
    return (stage && entries.get(stage.id)?.rect) || UNIT;
  }
  function stageScreen(): Rect | null {
    const stage = findStage(doc.root);
    if (!stage) return null;
    const e = entries.get(stage.id);
    return e ? inset(toScreen(e.rect), pad()) : null;
  }
  function floatContainer(layerName: FloatingLayer): Rect {
    if (layerName === "overlay") return { x: 0, y: 0, w: viewport.w, h: viewport.h };
    return toScreen(stageWorld());
  }
  function floatScreen(rect: Rect, layerName: FloatingLayer): Rect {
    const c = floatContainer(layerName);
    return { x: c.x + rect.x * c.w, y: c.y + rect.y * c.h, w: rect.w * c.w, h: rect.h * c.h };
  }
  function screenToFloat(r: Rect, layerName: FloatingLayer): Rect {
    const c = floatContainer(layerName);
    return { x: (r.x - c.x) / c.w, y: (r.y - c.y) / c.h, w: r.w / c.w, h: r.h / c.h };
  }
  /** Where a panel should be, ignoring tweens. */
  function targetRect(panelId: string): Rect | null {
    if (lifted()?.id === panelId) return dragger.liftedRect();
    const preview = dragger?.layoutTargets()?.get(panelId);
    if (preview && !doc.floating.some((f) => f.panel.id === panelId)) return inset(toScreen(preview), pad());
    const float = doc.floating.find((f) => f.panel.id === panelId);
    if (float) return floatScreen(float.rect, float.layer);
    const e = entries.get(panelId);
    return e ? inset(toScreen(e.rect), pad()) : null;
  }
  function regionOf(panelId: string): Region {
    if (doc.floating.some((f) => f.panel.id === panelId)) return "floating";
    const stage = findStage(doc.root);
    if (stage && findNode(stage, panelId)) return "stage";
    return "side";
  }

  // ---------------------------------------------------------------- surfaces
  function viewState(viewId: string): ViewState {
    return {
      visible: false,
      focused: false,
      selected: false,
      placement: "docked",
      interactive: true,
      size: { width: 0, height: 0 },
      scale: 1,
      title: titleOf(viewId),
      badge: badges.get(viewId) ?? null,
      panelId: panelOfView(doc, viewId)?.id ?? "",
      params: doc.views[viewId]?.params ?? {},
    };
  }
  const viewHost = {
    get workspace() {
      return handle;
    },
    params: (id: string) => doc.views[id]?.params ?? {},
    setTitle: (id: string, title: string) => setTitle(id, title),
    setParams: (id: string, patch: object) => setParams(id, patch),
    element: (id: string) => records.get(id)!.content,
    setBadge: (id: string, badge: string | number | boolean | null) => {
      badges.set(id, badge);
      records.get(id)?.controller.update({ badge });
      updateTabs();
    },
    focus: (id: string) => handle.focus(id),
    close: (id: string, o?: { force?: boolean }) => close(id, o),
    hide: (id: string) => hide(id),
  };
  function ensureSurface(viewId: string): SurfaceRecord {
    let record = records.get(viewId);
    if (record) return record;
    const type = doc.views[viewId].type;
    const shell = h("div", {
      "data-trellis-part": "surface",
      "data-view": viewId,
      "data-type": type,
      role: "tabpanel",
      id: `${uidBase}-surface-${cssId(viewId)}`,
    });
    const content = h("div", { "data-trellis-part": "content", "data-trellis-content": viewId });
    shell.append(content);
    const icon = h("span", { "data-trellis-part": "tab-icon" });
    const accessory = h("div", { "data-trellis-part": "accessory", "data-view": viewId });
    layer.append(shell);
    const controller = new ViewController(viewId, type, viewHost, viewState(viewId));
    record = {
      controller,
      shell,
      content,
      icon,
      accessory,
      cleanup: null,
      mountedWith: null,
      mountKey: null,
      iconHtml: null,
      surface: { view: controller, content, icon, accessory },
    };
    records.set(viewId, record);
    // Title functions receive the view handle, which only exists now.
    controller.update({ title: titleOf(viewId) });
    lifetime.listen(shell, "pointerdown", () => focusView(viewId, false), { capture: true });
    lifetime.listen(shell, "focusin", () => focusView(viewId, false));
    mountContent(record);
    return record;
  }
  /** Mount vanilla or iframe content. Adapter-rendered types (no mount/iframe) are left alone.
   * Content is only remounted when what it renders actually changes. */
  function mountContent(record: SurfaceRecord) {
    const def = typeOf(record.controller.id);
    record.mountedWith = def;
    setAttr(record.shell, "class", def.className ?? null);
    const raw = def.iframe
      ? typeof def.iframe === "function"
        ? def.iframe(record.controller)
        : def.iframe
      : null;
    const frame: IframeOptions | null = raw === null ? null : typeof raw === "string" ? { src: raw } : raw;
    const key: unknown = frame ? `iframe:${JSON.stringify(frame)}` : (def.mount ?? null);
    if (key !== record.mountKey) {
      if (record.mountKey !== null) {
        try {
          record.cleanup?.();
        } catch (error) {
          console.error(error);
        }
        record.cleanup = null;
        record.content.replaceChildren();
      }
      record.mountKey = key;
      if (frame) {
        const frameEl = h("iframe", {
          src: frame.src,
          srcdoc: frame.srcdoc,
          sandbox: frame.sandbox,
          allow: frame.allow,
          referrerpolicy: frame.referrerPolicy,
          title: frame.title ?? titleOf(record.controller.id),
          "data-trellis-iframe": "",
        });
        record.content.append(frameEl);
        record.cleanup = () => frameEl.remove();
      } else if (def.mount) {
        try {
          const cleanup = def.mount(record.content, record.controller, {
            icon: record.icon,
            accessory: record.accessory,
          });
          record.cleanup = typeof cleanup === "function" ? cleanup : null;
        } catch (error) {
          console.error(error);
        }
      }
    }
    const icon = def.icon ?? null;
    if (icon !== record.iconHtml) {
      if (icon !== null || record.iconHtml !== null) record.icon.innerHTML = icon ?? "";
      record.iconHtml = icon;
    }
  }
  function destroySurface(viewId: string) {
    const record = records.get(viewId);
    if (!record) return;
    try {
      record.cleanup?.();
    } catch (error) {
      console.error(error);
    }
    record.shell.remove();
    record.icon.remove();
    record.accessory.remove();
    record.controller.dispose();
    records.delete(viewId);
    badges.delete(viewId);
  }
  const uidBase = uid("trellis");
  const cssId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_");

  // ---------------------------------------------------------------- panels
  function ensurePanelDom(panelId: string): PanelDom {
    let dom = panelDoms.get(panelId);
    if (dom) return dom;
    const el = h("div", { "data-trellis-part": "panel", "data-panel": panelId });
    const tablist = h("div", {
      "data-trellis-part": "tabs",
      role: "tablist",
      "aria-orientation": "horizontal",
    });
    const accessories = h("div", { "data-trellis-part": "accessories" });
    const menuButton = h("button", {
      "data-trellis-part": "panel-menu",
      type: "button",
      "aria-label": "Panel menu",
      "aria-haspopup": "menu",
      tabindex: "-1",
    });
    menuButton.innerHTML = icons.more;
    const tabbar = h("div", { "data-trellis-part": "tabbar", "data-panel": panelId }, tablist, accessories, menuButton);
    el.append(tabbar);
    layer.append(el);
    const frameIcon = h("span", { "data-trellis-part": "frame-icon", "aria-hidden": "true" });
    el.append(frameIcon);
    dom = { id: panelId, el, tabbar, tablist, accessories, menuButton, tabs: new Map(), handles: null, frameIcon, endInset: 0 };
    panelDoms.set(panelId, dom);
    const d = dom;
    const onPointerDown = (e: PointerEvent) => {
      const panel = findPanel(d.id);
      if (panel) focusView(panel.selected, false);
      if (doc.floating.some((f) => f.panel.id === d.id)) {
        const raised = raiseFloat(doc, d.id);
        if (raised !== doc) commit(raised, { animate: false, silent: true });
      }
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, [data-trellis-part=accessory], [data-trellis-part=resize]")) {
        if (!target.closest("[data-trellis-part=tab]")) return;
      }
      const tab = target.closest<HTMLElement>("[data-trellis-part=tab]");
      if (tab && target.closest("[data-trellis-part=tab-close]")) return;
      if (!panel) return;
      if (tab) dragger.begin(e, panel, tab.dataset.view!);
      else if (target.closest("[data-trellis-part=tabbar]") || d.el.hasAttribute("data-frame-only"))
        dragger.begin(e, panel, null);
    };
    lifetime.listen(el, "pointerdown", onPointerDown);
    // An overlaid tab bar lives outside the panel element.
    lifetime.listen(tabbar, "pointerdown", (e: PointerEvent) => {
      if (tabbar.parentElement !== el) onPointerDown(e);
    });
    lifetime.listen(tabbar, "dblclick", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button:not([data-trellis-part=tab]), [data-trellis-part=accessory]")) return;
      if (navigationMode()) toggleFrame(d.id);
    });
    lifetime.listen(menuButton, "click", (e: MouseEvent) => {
      e.stopPropagation();
      openPanelMenu(d.id, menuButton);
    });
    lifetime.listen(tabbar, "contextmenu", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-trellis-part=accessory]")) return;
      e.preventDefault();
      const tab = target.closest<HTMLElement>("[data-trellis-part=tab]");
      if (tab) selectAndFocus(tab.dataset.view!);
      const b = root.getBoundingClientRect();
      openPanelMenu(d.id, null, { x: e.clientX - b.left, y: e.clientY - b.top });
    });
    lifetime.listen(tablist, "keydown", (e: KeyboardEvent) => tabKeydown(e, d.id));
    // Vertical wheel scrolls overflowing tabs sideways.
    lifetime.listen(
      tablist,
      "wheel",
      (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey || tablist.scrollWidth <= tablist.clientWidth) return;
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          tablist.scrollLeft += e.deltaY;
          e.preventDefault();
          e.stopPropagation();
        }
      },
      { passive: false },
    );
    return dom;
  }
  function destroyPanelDom(panelId: string) {
    const dom = panelDoms.get(panelId);
    if (!dom) return;
    dom.el.remove();
    dom.tabbar.remove();
    panelDoms.delete(panelId);
    lastRects.delete(panelId);
  }
  /** Tab bar height for a panel; 0 when its views ask for no tab bar. */
  /** How a panel shows its tab bar: above the content, over it (the content draws its own title
   * bar underneath), or not at all. A tab group always gets a normal bar. */
  function barMode(panel: PanelNode | null): "normal" | "overlay" | "hidden" {
    if (!panel) return "normal";
    const modes = panel.views.map((v) => typeOf(v).tabbar ?? "always");
    if (modes.every((m) => m === "never")) return "hidden";
    if (panel.views.length === 1 && modes[0] === "auto") return lifted()?.id === panel.id ? "normal" : "hidden";
    if (panel.views.length === 1 && modes[0] === "overlay") return "overlay";
    return "normal";
  }
  /** Space the tab bar takes above the content (0 when hidden or overlaid). */
  function barHeight(panel: PanelNode | null): number {
    return barMode(panel) === "normal" ? tabbarHeight : 0;
  }
  function findPanel(panelId: string): PanelNode | null {
    if (lifted()?.id === panelId) return lifted();
    return locatePanel(doc, panelId)?.panel ?? leaving.get(panelId)?.panel ?? null;
  }
  function syncTabs(panel: PanelNode) {
    const dom = ensurePanelDom(panel.id);
    const wanted = new Set(panel.views);
    for (const [viewId, tab] of dom.tabs)
      if (!wanted.has(viewId)) {
        tab.el.remove();
        dom.tabs.delete(viewId);
      }
    panel.views.forEach((viewId, index) => {
      let tab = dom.tabs.get(viewId);
      const record = ensureSurface(viewId);
      if (!tab) {
        const title = h("span", { "data-trellis-part": "tab-title" });
        const badge = h("span", { "data-trellis-part": "tab-badge" });
        // Mouse affordance only: keyboard and screen-reader users close with Delete or the panel menu,
        // which keeps the tab free of nested interactive content.
        const closeButton = h("span", { "data-trellis-part": "tab-close", "aria-hidden": "true" });
        closeButton.innerHTML = icons.close;
        const el = h("div", {
          "data-trellis-part": "tab",
          "data-view": viewId,
          role: "tab",
          id: `${uidBase}-tab-${cssId(viewId)}`,
          "aria-controls": record.shell.id,
        });
        el.append(record.icon, title, badge, closeButton);
        lifetime.listen(closeButton, "click", (e: MouseEvent) => {
          e.stopPropagation();
          void close(viewId);
        });
        lifetime.listen(el, "click", (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest("[data-trellis-part=tab-close]")) return;
          selectAndFocus(viewId);
        });
        lifetime.listen(el, "auxclick", (e: MouseEvent) => {
          if (e.button === 1 && typeOf(viewId).closable !== false) void close(viewId);
        });
        tab = { el, title, badge, close: closeButton };
        dom.tabs.set(viewId, tab);
      } else if (tab.el.firstChild !== record.icon) tab.el.prepend(record.icon);
      if (dom.tablist.children[index] !== tab.el)
        dom.tablist.insertBefore(tab.el, dom.tablist.children[index] ?? null);
      if (record.accessory.parentElement !== dom.accessories) dom.accessories.append(record.accessory);
      setAttr(record.shell, "aria-labelledby", tab.el.id);
    });
  }
  /** Scroll an overflowing tab strip so a tab is visible, without scrolling the page. */
  function revealTab(list: HTMLElement, tab: HTMLElement) {
    if (list.scrollWidth <= list.clientWidth) return;
    const left = tab.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft) list.scrollLeft = left - 8;
    else if (left + tab.offsetWidth > list.scrollLeft + list.clientWidth)
      list.scrollLeft = left + tab.offsetWidth - list.clientWidth + 8;
  }
  function updateTabs() {
    for (const [panelId, dom] of panelDoms) {
      const panel = findPanel(panelId);
      if (!panel) continue;
      for (const [viewId, tab] of dom.tabs) {
        const selected = panel.selected === viewId;
        const title = titleOf(viewId);
        if (tab.title.textContent !== title) tab.title.textContent = title;
        const badge = badges.get(viewId);
        const dot = badge === true;
        const text =
          badge === null || badge === undefined || badge === "" || typeof badge === "boolean"
            ? ""
            : String(badge);
        if (tab.badge.textContent !== text) tab.badge.textContent = text;
        setAttr(tab.badge, "hidden", text || dot ? null : "");
        setAttr(tab.badge, "data-dot", dot ? "" : null);
        setAttr(tab.el, "data-badge", dot ? "dot" : text ? "" : null);
        setAttr(tab.el, "data-type", doc.views[viewId]?.type ?? null);
        setAttr(tab.el, "aria-selected", String(selected));
        setAttr(tab.el, "tabindex", selected ? "0" : "-1");
        if (selected && !tab.el.hasAttribute("data-selected")) revealTab(dom.tablist, tab.el);
        setAttr(tab.el, "data-selected", selected ? "" : null);
        setAttr(tab.el, "data-focused", focusedView === viewId ? "" : null);
        const closable = typeOf(viewId).closable !== false;
        setAttr(tab.close, "hidden", closable ? null : "");
        setAttr(tab.close, "title", `Close ${title}`);
        setAttr(tab.el, "aria-keyshortcuts", closable ? "Delete Shift+F10" : "Shift+F10");
        const record = records.get(viewId);
        if (record) {
          setAttr(record.accessory, "hidden", selected ? null : "");
          if (record.controller.state.title !== title) record.controller.update({ title });
        }
      }
      setAttr(dom.el, "data-focused", focusedPanel === panelId ? "" : null);
      setAttr(dom.el, "data-single", panel.views.length === 1 ? "" : null);
      // Mirrored on the bar, which may be detached from the panel (overlay bars).
      setAttr(dom.tabbar, "data-focused", focusedPanel === panelId ? "" : null);
      setAttr(dom.tabbar, "data-single", panel.views.length === 1 ? "" : null);
      const iconSource = records.get(panel.selected)?.icon.innerHTML ?? "";
      const icon = iconSource || `<b>${escapeHtml(titleOf(panel.selected).slice(0, 1).toUpperCase())}</b>`;
      if (dom.frameIcon.innerHTML !== icon) dom.frameIcon.innerHTML = icon;
      if (barMode(panel) === "overlay") dom.endInset = dom.accessories.offsetWidth + dom.menuButton.offsetWidth + 24;
      setAttr(dom.menuButton, "hidden", options.panelMenu === false && !menuFor(panel).length ? "" : null);
    }
    invalidate();
  }

  // ---------------------------------------------------------------- sync
  /** Reconcile DOM with the document. Cheap; runs after every change. */
  function sync() {
    entries = layoutRects(doc.root);
    const live = new Set<string>(viewIds(doc));
    for (const v of lifted()?.views ?? []) live.add(v);
    for (const l of leaving.values()) for (const v of l.panel.views) live.add(v);
    for (const viewId of [...records.keys()]) if (!live.has(viewId)) destroySurface(viewId);
    const panelIds = new Set<string>();
    const visiblePanels = [
      ...panelsOf(doc.root),
      ...doc.floating.map((f) => f.panel),
      ...(lifted() ? [lifted()!] : []),
      ...[...leaving.values()].map((l) => l.panel),
    ];
    for (const panel of visiblePanels) {
      panelIds.add(panel.id);
      syncTabs(panel);
    }
    for (const hidden of doc.hidden) for (const v of hidden.panel.views) ensureSurface(v);
    for (const id of [...panelDoms.keys()]) if (!panelIds.has(id)) destroyPanelDom(id);
    for (const record of records.values()) mountContent(record);
    // Floating resize handles
    for (const [id, dom] of panelDoms) {
      const floating = doc.floating.some((f) => f.panel.id === id) || lifted()?.id === id;
      setAttr(dom.el, "data-floating", floating ? "" : null);
      setAttr(dom.el, "data-region", floating ? "floating" : regionOf(id));
      if (floating && !dom.handles && lifted()?.id !== id) addResizeHandles(dom);
      if ((!floating || lifted()?.id === id) && dom.handles) {
        dom.handles.remove();
        dom.handles = null;
      }
    }
    syncDividers();
    const list = [...records.values()].map((r) => r.surface);
    if (list.length !== surfacesList.length || list.some((s, i) => s !== surfacesList[i])) {
      surfacesList = list;
      events.emit("surfaces", surfacesList);
    }
    const stage = findStage(doc.root);
    setAttr(root, "data-has-stage", stage ? "" : null);
    setAttr(root, "data-empty", !doc.root && !doc.floating.length ? "" : null);
    setAttr(root, "data-stage-empty", stage && !stage.child ? "" : null);
    updateTabs();
    nav?.sync();
    invalidate();
    schedule();
  }

  function syncDividers() {
    const wanted = new Set<string>();
    const visit = (node: LayoutNode | undefined | null) => {
      if (!node) return;
      if (node.kind === "stage") return visit(node.child);
      if (node.kind !== "split") return;
      for (let i = 0; i < node.children.length - 1; i++) {
        const key = `${node.id}:${i}`;
        wanted.add(key);
        if (!dividerEls.has(key)) {
          const el = h("div", {
            "data-trellis-part": "divider",
            role: "separator",
            tabindex: "0",
            "aria-orientation": node.axis === "x" ? "vertical" : "horizontal",
            "aria-label": "Resize panels",
          });
          el.dataset.split = node.id;
          el.dataset.index = String(i);
          lifetime.listen(el, "pointerdown", (e: PointerEvent) => beginDivider(e, el));
          lifetime.listen(el, "dblclick", () => equalize(el.dataset.split!, Number(el.dataset.index)));
          lifetime.listen(el, "keydown", (e: KeyboardEvent) => dividerKey(e, el));
          dividers.append(el);
          dividerEls.set(key, el);
        }
        const el = dividerEls.get(key)!;
        setAttr(el, "data-axis", node.axis);
      }
      node.children.forEach(visit);
    };
    visit(doc.root);
    for (const [key, el] of dividerEls)
      if (!wanted.has(key)) {
        el.remove();
        dividerEls.delete(key);
      }
  }

  // ---------------------------------------------------------------- commit
  interface CommitOptions {
    animate?: boolean;
    silent?: boolean;
    from?: Map<string, Rect>;
  }
  function commit(next: LayoutDocument, o: CommitOptions = {}) {
    const previous = doc;
    if (next === previous) return;
    const animate = o.animate !== false && !reduced();
    if (animate) {
      const from = new Map(lastRects);
      if (o.from) for (const [k, v] of o.from) from.set(k, v);
      tween.begin(from, performance.now());
    }
    doc = next;
    const before = new Set(viewIds(previous));
    const after = new Set(viewIds(doc));
    // Views keep their surface if still present anywhere.
    sync();
    for (const id of after)
      if (!before.has(id)) {
        const info = infoOf(id);
        if (info) events.emit("open", info);
      }
    for (const id of before)
      if (!after.has(id) && !lifted()?.views.includes(id)) {
        const record = previous.views[id];
        if (record)
          events.emit("close", {
            id,
            type: record.type,
            params: record.params ?? {},
            title: record.title ?? record.type,
            panelId: "",
            placement: "docked",
            selected: false,
          });
      }
    if (focusedView && !after.has(focusedView) && !lifted()?.views.includes(focusedView)) {
      const fallback =
        panelOfView(doc, lastFocusFallback()) ?? panelsOf(doc.root)[0] ?? doc.floating[0]?.panel ?? null;
      setFocus(fallback?.selected ?? null, false);
    } else if (focusedView) {
      const panel = panelOfView(doc, focusedView);
      focusedPanel = panel?.id ?? focusedPanel;
    }
    // Render now so the DOM matches the document synchronously after every change.
    render();
    if (!o.silent) emitChange();
  }
  function lastFocusFallback(): string {
    return lastStagePanel ? (locatePanel(doc, lastStagePanel)?.panel.selected ?? "") : "";
  }
  function emitChange() {
    const snapshotDoc = getDocument();
    events.emit("change", snapshotDoc);
    persist();
  }
  function getDocument(): LayoutDocument {
    return {
      ...doc,
      navigation: nav.serialize(),
    };
  }

  // ---------------------------------------------------------------- persistence
  function persist() {
    if (!options.persist) return;
    lifetime.clearTimeout(persistTimer);
    persistTimer = lifetime.timeout(() => {
      try {
        localStorage.setItem(
          options.persist!.key,
          JSON.stringify({ ...getDocument(), version: options.persist!.version ?? doc.version }),
        );
      } catch {
        /* storage may be unavailable */
      }
    }, 120);
  }
  function loadPersisted(): LayoutDocument | null {
    if (!options.persist) return null;
    try {
      const raw = localStorage.getItem(options.persist.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LayoutDocument;
      if (parsed?.schema !== 1) return null;
      if ((options.persist.version ?? undefined) !== (parsed.version ?? undefined)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  function prepare(input: LayoutDocument): LayoutDocument {
    const drop = new Set<string>();
    for (const [id, record] of Object.entries(input.views ?? {})) {
      if (!record || options.types[record.type]) continue;
      const decision = options.onMissingType?.(record.type, id) ?? "placeholder";
      if (decision === "drop") drop.add(id);
    }
    const doc = sanitize(input, () => true);
    let result = doc;
    for (const id of drop) result = closeViewInDoc(result, id);
    return result;
  }
  function defaultDocument(): LayoutDocument {
    const spec = options.defaultLayout;
    if (!spec) return emptyDocument();
    if ((spec as LayoutDocument).schema === 1) return structuredClone(spec as LayoutDocument);
    return createDocument(spec as LayoutSpec);
  }

  // ---------------------------------------------------------------- render loop
  function schedule() {
    if (frame || lifetime.disposed) return;
    frame = lifetime.frame(tick);
  }
  function tick(time: number) {
    frame = 0;
    const dt = lastTime ? (time - lastTime) / 1000 : 0.016;
    lastTime = time;
    let moving = false;
    if (camera.moving && !gesture) {
      if (reduced()) camera.finish();
      else moving = camera.step(dt) || moving;
    }
    cameraChanged();
    if (tween.active) moving = tween.step(time) || moving;
    if (!tween.active) settling.clear();
    if (dragActive()) moving = true;
    for (const [id, l] of leaving)
      if (time - l.start >= l.duration) {
        leaving.delete(id);
        destroyPanelDom(id);
        syncSilently();
      } else moving = true;
    if (entering.size) moving = true;
    render(time);
    if (moving) schedule();
    else {
      lastTime = 0;
      settle();
    }
  }
  function syncSilently() {
    const list = [...records.values()].map((r) => r.surface);
    surfacesList = list;
  }
  let settledState = true;
  function settle() {
    // Report settled sizes once motion stops; views never re-render per frame.
    for (const record of records.values()) {
      const s = record.controller.state;
      const size = (record as any).__size as { width: number; height: number } | undefined;
      if (size && (size.width !== s.size.width || size.height !== s.size.height)) record.controller.update({ size });
      const scale = (record as any).__scale as number | undefined;
      if (scale !== undefined && scale !== s.scale) record.controller.update({ scale });
    }
    // Adapter-rendered accessories appear after the first sync; measure overlaid bars at rest.
    for (const [id, dom] of panelDoms)
      if (dom.tabbar.hasAttribute("data-overlay")) {
        const inset = dom.accessories.offsetWidth + dom.menuButton.offsetWidth + 24;
        if (inset !== dom.endInset) {
          dom.endInset = inset;
          const panel = findPanel(id);
          if (panel) for (const v of panel.views) records.get(v)?.content.style.setProperty("--trellis-titlebar-inset-end", `${inset}px`);
        }
      }
    if (!settledState) {
      settledState = true;
      updateInteractivity();
    }
  }
  function updateInteractivity() {
    const busy = !!dragActive() || gesture;
    setAttr(root, "data-busy", busy ? "" : null);
    for (const record of records.values()) {
      const scale = record.controller.state.scale;
      record.controller.update({ interactive: !busy && scale >= 0.999 });
    }
  }
  const moving = () =>
    camera.moving || tween.active || !!dragActive() || gesture || leaving.size > 0 || entering.size > 0;

  function render(time = performance.now()) {
    if (lifetime.disposed) return;
    const round = !moving();
    if (moving()) settledState = false;
    const stage = findStage(doc.root);
    // While dragging, the stage follows the preview like any docked node (it makes room too).
    const stagePreview = stage ? dragger?.layoutTargets()?.get(stage.id) : undefined;
    const sScreen = stagePreview ? inset(toScreen(stagePreview), pad()) : stageScreen();
    // Stage slots
    if (sScreen) {
      const r = tween.apply(stage!.id, sScreen);
      // The stage's on-screen rect, for styling around it (e.g. a sharp wallpaper inside, blurred outside).
      setStyle(root, "--trellis-stage-x", `${r.x}px`);
      setStyle(root, "--trellis-stage-y", `${r.y}px`);
      setStyle(root, "--trellis-stage-w", `${r.w}px`);
      setStyle(root, "--trellis-stage-h", `${r.h}px`);
      place(backdrop, r, round);
      place(stageEmpty, r, round);
      lastRects.set(stage!.id, r);
      setStyle(backdrop, "display", "");
      setStyle(stageEmpty, "display", stage!.child ? "none" : "");
    } else {
      place(backdrop, { x: 0, y: 0, w: viewport.w, h: viewport.h }, true);
      setStyle(stageEmpty, "display", "none");
    }
    setStyle(empty, "display", !doc.root && !doc.floating.length && !lifted() ? "" : "none");

    // z ordering
    const stageFloats = doc.floating.filter((f) => f.layer === "stage").sort((a, b) => a.z - b.z);
    const overlayFloats = doc.floating.filter((f) => f.layer === "overlay").sort((a, b) => a.z - b.z);
    const zOf = new Map<string, number>();
    for (const p of panelsOf(doc.root)) zOf.set(p.id, settling.has(p.id) ? 2900 : 10);
    stageFloats.forEach((f, i) => zOf.set(f.panel.id, settling.has(f.panel.id) ? 2900 : 30 + i * 3));
    overlayFloats.forEach((f, i) => zOf.set(f.panel.id, settling.has(f.panel.id) ? 2900 : 1000 + i * 3));
    if (lifted()) zOf.set(lifted()!.id, 3100);
    for (const id of leaving.keys()) zOf.set(id, 2950);

    const shown = new Set<string>();
    for (const [panelId, dom] of panelDoms) {
      const panel = findPanel(panelId);
      if (!panel) continue;
      let r: Rect | null;
      let opacity = 1;
      const l = leaving.get(panelId);
      const enter = entering.get(panelId);
      if (l) {
        // Minimize: the whole window flies into its target (prototype timing and curve).
        const e = DOCK_EASE(Math.min(1, (time - l.start) / l.duration));
        r = lerpRect(l.from, l.to, e);
        opacity = 1 - 0.9 * e;
      } else if (enter) {
        const target = targetRect(panelId);
        if (!target) continue;
        const t = Math.min(1, (time - enter.start) / DOCK_MS.restore);
        const e = DOCK_EASE(t);
        r = lerpRect(enter.from, target, e);
        opacity = 0.1 + 0.9 * e;
        if (t >= 1) entering.delete(panelId);
      } else {
        const target = targetRect(panelId);
        if (!target) continue;
        r = lifted()?.id === panelId ? dragger.liftedRect() : tween.apply(panelId, target);
      }
      lastRects.set(panelId, r);
      const onscreen =
        r.x < viewport.w && r.y < viewport.h && r.x + r.w > 0 && r.y + r.h > 0 && r.w > 2 && r.h > 2;
      setStyle(dom.el, "display", onscreen ? "" : "none");
      setStyle(dom.el, "opacity", opacity === 1 ? "" : String(opacity));
      const z = zOf.get(panelId) ?? 10;
      setStyle(dom.el, "zIndex", String(z));
      setAttr(dom.el, "data-lifted", lifted()?.id === panelId ? "" : null);
      place(dom.el, r, round);
      const float = doc.floating.find((f) => f.panel.id === panelId);
      const clip =
        float?.layer === "stage" && sScreen && lifted()?.id !== panelId ? clipInset(r, sScreen) : "";
      setStyle(dom.el, "clipPath", clip);
      const mode = barMode(panel);
      const bar = mode === "normal" ? tabbarHeight : 0;
      // Too small to use: show only the app icon; the whole frame is a drag handle (prototype).
      const frameOnly =
        lifted()?.id !== panelId && (r.w < FRAME_ONLY.w || r.h < FRAME_ONLY.h + (panel.views.length > 1 ? tabbarHeight : 0));
      setAttr(dom.el, "data-frame-only", frameOnly ? "" : null);
      if (frameOnly) setStyle(dom.el, "--trellis-frame-icon-size", `${Math.max(0, Math.min(40, r.w - 12, r.h - 12))}px`);
      setAttr(dom.el, "data-compact", r.w < 140 || r.h < bar + 24 ? "" : null);
      setAttr(dom.el, "data-tabbar", mode === "normal" ? null : mode);
      // An overlaid bar leaves the panel and sits above the content it covers.
      if (mode === "overlay") {
        if (dom.tabbar.parentElement !== layer) layer.append(dom.tabbar);
        setAttr(dom.tabbar, "data-overlay", "");
        setStyle(dom.tabbar, "zIndex", String(z + 2));
        setStyle(dom.tabbar, "display", onscreen ? "" : "none");
        setStyle(dom.tabbar, "opacity", opacity === 1 ? "" : String(opacity));
        setStyle(dom.tabbar, "clipPath", clip ? clipInset({ x: r.x, y: r.y, w: r.w, h: tabbarHeight }, sScreen!) : "");
        place(dom.tabbar, { x: r.x, y: r.y, w: r.w, h: tabbarHeight }, round);
      } else if (dom.tabbar.parentElement !== dom.el) {
        dom.el.prepend(dom.tabbar);
        setAttr(dom.tabbar, "data-overlay", null);
        for (const key of ["zIndex", "display", "opacity", "clipPath", "transform", "width", "height"])
          setStyle(dom.tabbar, key, "");
      }
      if (!onscreen) continue;
      const body: Rect = { x: r.x, y: r.y + bar, w: r.w, h: Math.max(0, r.h - bar) };
      for (const viewId of panel.views) {
        const record = records.get(viewId);
        if (!record) continue;
        shown.add(viewId);
        const selected = panel.selected === viewId;
        placeSurface(record, body, selected, z + 1, round, opacity, clip ? clipInset(body, sScreen!) : "", frameOnly);
        setAttr(record.shell, "data-tabbar", mode === "normal" ? null : mode);
        const scale = (record as any).__scale || 1;
        setStyle(record.content, "--trellis-titlebar-height", mode === "overlay" ? `${tabbarHeight / scale}px` : "0px");
        setStyle(record.content, "--trellis-titlebar-inset-end", mode === "overlay" ? `${dom.endInset / scale}px` : "0px");
      }
    }
    // Hide surfaces with no visible panel (hidden panels, offscreen).
    for (const [viewId, record] of records) {
      if (shown.has(viewId)) continue;
      setStyle(record.shell, "visibility", "hidden");
      setAttr(record.shell, "inert", "");
      const panel = panelOfView(doc, viewId);
      const hidden = panel ? doc.hidden.some((x) => x.panel.id === panel.id) : false;
      record.controller.update({
        visible: false,
        selected: panel?.selected === viewId,
        placement: hidden ? "hidden" : placementOf(viewId),
        panelId: panel?.id ?? record.controller.state.panelId,
        focused: focusedView === viewId,
      });
    }
    renderDividers(round);
    renderSlots(round);
  }
  function clipInset(r: Rect, bounds: Rect): string {
    const top = Math.max(0, bounds.y - r.y);
    const left = Math.max(0, bounds.x - r.x);
    const right = Math.max(0, r.x + r.w - (bounds.x + bounds.w));
    const bottom = Math.max(0, r.y + r.h - (bounds.y + bounds.h));
    if (!top && !left && !right && !bottom) return "";
    return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
  }
  /** Content minimum: the type's, or the prototype's 480×320 app minimum under free navigation. */
  const FREE_MIN = { width: 480, height: 320 };
  function minSizeOf(viewId: string): { width: number; height: number } | undefined {
    return typeOf(viewId).minSize ?? (navigationMode() === "free" ? FREE_MIN : undefined);
  }
  function placementOf(viewId: string): ViewPlacement {
    const panel = panelOfView(doc, viewId) ?? (lifted()?.views.includes(viewId) ? lifted() : null);
    if (!panel) return "docked";
    if (doc.hidden.some((x) => x.panel.id === panel.id)) return "hidden";
    const r = regionOf(panel.id);
    return r === "floating" ? "floating" : r === "stage" ? "stage" : "docked";
  }
  function placeSurface(
    record: SurfaceRecord,
    body: Rect,
    selected: boolean,
    z: number,
    round: boolean,
    opacity: number,
    clip: string,
    concealed = false,
  ) {
    const { shell, content, controller } = record;
    const min = minSizeOf(controller.id);
    const scale = min ? Math.min(1, body.w / Math.max(1, min.width), body.h / Math.max(1, min.height)) : 1;
    const safe = Math.max(scale, 0.05);
    place(shell, body, round);
    setStyle(shell, "zIndex", String(z));
    setStyle(shell, "visibility", selected && !concealed ? "" : "hidden");
    setStyle(shell, "opacity", opacity === 1 ? "" : String(opacity));
    setStyle(shell, "clipPath", clip);
    const width = round ? Math.round(body.w / safe) : body.w / safe;
    const height = round ? Math.round(body.h / safe) : body.h / safe;
    setStyle(content, "width", `${width}px`);
    setStyle(content, "height", `${height}px`);
    setStyle(content, "transform", safe < 0.999 ? `scale(${safe})` : "");
    setAttr(shell, "data-scaled", safe < 0.999 ? "" : null);
    setAttr(shell, "inert", selected && !concealed ? null : "");
    (record as any).__size = { width: Math.round(width), height: Math.round(height) };
    (record as any).__scale = Math.round(safe * 1000) / 1000;
    const panel =
      panelOfView(doc, controller.id) ?? (lifted()?.views.includes(controller.id) ? lifted() : null);
    const onscreen = body.x < viewport.w && body.y < viewport.h && body.x + body.w > 0 && body.y + body.h > 0;
    const busy = !!dragActive() || gesture;
    controller.update({
      visible: selected && !concealed && onscreen && body.w > 1 && body.h > 1,
      selected,
      focused: focusedView === controller.id,
      placement: placementOf(controller.id),
      panelId: panel?.id ?? controller.state.panelId,
      interactive: !busy && safe >= 0.999,
      // Size and scale settle once motion stops: views never re-render per frame.
      ...(moving() ? {} : { size: { width: Math.round(width), height: Math.round(height) }, scale: Math.round(safe * 1000) / 1000 }),
    });
  }
  function renderDividers(round: boolean) {
    const show = !tween.active && !dragActive() && !gesture;
    for (const el of dividerEls.values()) {
      const split = findNode(doc.root, el.dataset.split!) as SplitNode | null;
      const e = split && entries.get(split.id);
      if (!split || !e || !show) {
        setStyle(el, "display", "none");
        continue;
      }
      const index = Number(el.dataset.index);
      const r = toScreen(e.rect);
      const total = split.weights.reduce((a, b) => a + b, 0);
      const boundary = split.weights.slice(0, index + 1).reduce((a, b) => a + b, 0) / total;
      const size = Math.max(8, gap + 4);
      const rect =
        split.axis === "x"
          ? { x: r.x + r.w * boundary - size / 2, y: r.y + pad(), w: size, h: r.h - gap }
          : { x: r.x + pad(), y: r.y + r.h * boundary - size / 2, w: r.w - gap, h: size };
      const visible =
        rect.x < viewport.w && rect.y < viewport.h && rect.x + rect.w > 0 && rect.y + rect.h > 0;
      setStyle(el, "display", visible ? "" : "none");
      place(el, rect, round);
      setAttr(el, "aria-valuenow", String(Math.round(boundary * 100)));
    }
  }
  /** The drag's source and destination slots, animated with the layout. */
  function renderSlots(round: boolean) {
    const targets = dragger?.layoutTargets();
    for (const [el, id] of [
      [sourceSlot, SOURCE_SLOT],
      [dropSlot, DROP_SLOT],
    ] as const) {
      const world = targets?.get(id);
      if (!world) {
        setAttr(el, "data-visible", null);
        lastRects.delete(id);
        continue;
      }
      const r = tween.apply(id, inset(toScreen(world), pad()));
      lastRects.set(id, r);
      const visible = r.w > 8 && r.h > 8;
      setAttr(el, "data-visible", visible ? "" : null);
      if (visible) place(el, r, round);
    }
    const label = dragger?.dropLabel() ?? "";
    if (dropLabel.textContent !== label) dropLabel.textContent = label;
    setAttr(dropSlot, "data-kind", label ? "tab" : null);
  }

  // ---------------------------------------------------------------- focus
  function setFocus(viewId: string | null, emit = true) {
    const panel = viewId ? panelOfView(doc, viewId) : null;
    const nextPanel = panel?.id ?? null;
    if (focusedView === viewId && focusedPanel === nextPanel) return;
    focusedView = viewId;
    focusedPanel = nextPanel;
    if (nextPanel && regionOf(nextPanel) === "stage") lastStagePanel = nextPanel;
    updateTabs();
    for (const record of records.values())
      record.controller.update({ focused: record.controller.id === viewId });
    if (emit) events.emit("focus", viewId);
  }
  function focusView(viewId: string, moveDom: boolean) {
    if (!doc.views[viewId]) return;
    setFocus(viewId);
    raiseIfFloating(viewId);
    // Adapters render content asynchronously; move DOM focus once it has had a frame to mount.
    if (moveDom) lifetime.frame(() => moveFocusInto(viewId));
  }
  function raiseIfFloating(viewId: string) {
    const panel = panelOfView(doc, viewId);
    if (!panel || dragActive()) return;
    const raised = raiseFloat(doc, panel.id);
    if (raised !== doc) commit(raised, { animate: false, silent: true });
  }
  function moveFocusInto(viewId: string) {
    if (focusedView !== viewId) return;
    const record = records.get(viewId);
    const target = record?.content.querySelector<HTMLElement>(
      "[autofocus], iframe, input, textarea, select, button, [tabindex]:not([tabindex='-1'])",
    );
    if (target) target.focus({ preventScroll: true });
    else
      panelDoms
        .get(panelOfView(doc, viewId)?.id ?? "")
        ?.tabs.get(viewId)
        ?.el.focus({ preventScroll: true });
  }
  function selectAndFocus(viewId: string) {
    const next = selectView(doc, viewId);
    if (next !== doc) commit(next, { animate: false });
    focusView(viewId, false);
  }
  // Iframes swallow pointer events; detect focus moving into one.
  lifetime.listen(window, "blur", () => {
    lifetime.timeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLIFrameElement && root.contains(active)) {
        const viewId = active.closest<HTMLElement>("[data-trellis-content]")?.dataset.trellisContent;
        if (viewId) focusView(viewId, false);
      }
    }, 0);
  });

  // ---------------------------------------------------------------- open & place
  function infoOf(viewId: string): ViewInfo | null {
    const record = doc.views[viewId];
    if (!record) return null;
    const panel = panelOfView(doc, viewId) ?? (lifted()?.views.includes(viewId) ? lifted() : null);
    return {
      id: viewId,
      type: record.type,
      params: record.params ?? {},
      title: titleOf(viewId),
      panelId: panel?.id ?? "",
      placement: placementOf(viewId),
      selected: panel?.selected === viewId,
    };
  }
  function allowed(viewIdsList: string[], region: Region): boolean {
    return viewIdsList.every((id) => {
      const allow = typeOf(id).allow;
      if (!allow) return true;
      if (region === "stage") return allow.stage !== false;
      if (region === "side") return allow.side !== false;
      return allow.floating !== false && !!floatingLayer();
    });
  }
  function cascadeRect(layerName: FloatingLayer): Rect {
    const c = floatContainer(layerName);
    const w = Math.min(DEFAULT_FLOAT_SIZE.w, c.w * 0.6);
    const hgt = Math.min(DEFAULT_FLOAT_SIZE.h, c.h * 0.6);
    const step = (openCounter++ % 6) * 28;
    return clampFloat({
      x: (c.w * 0.5 - w / 2 + step - 70) / c.w,
      y: (c.h * 0.45 - hgt / 2 + step - 50) / c.h,
      w: w / c.w,
      h: hgt / c.h,
    });
  }
  function placePanel(d: LayoutDocument, panel: PanelNode, placement: Placement): LayoutDocument {
    const views = panel.views;
    const stage = findStage(d.root);
    const fl = floatingLayer();
    const focused = focusedPanel && locatePanel(d, focusedPanel) ? focusedPanel : null;
    const regionOfIn = (id: string): Region => {
      if (d.floating.some((f) => f.panel.id === id)) return "floating";
      return stage && findNode(stage, id) ? "stage" : "side";
    };
    const tryPlacements: Placement[] = [placement];
    if (placement !== "side") tryPlacements.push("side");
    for (const p of tryPlacements) {
      if (p === "float" || (typeof p === "object" && "float" in p)) {
        if (!fl || !allowed(views, "floating")) continue;
        const layerName = typeof p === "object" && "float" in p ? (p.layer ?? fl) : fl;
        const rect = typeof p === "object" && "float" in p ? p.float : cascadeRect(layerName);
        return floatPanel(d, panel, rect, layerName);
      }
      if (typeof p === "object" && "beside" in p) {
        const target = findNode(d.root, p.beside) ? p.beside : null;
        const region = target && stage && findNode(stage, target) && target !== stage.id ? "stage" : "side";
        if (!allowed(views, region)) continue;
        if (!target) return insertPanel(d, panel, { beside: d.root?.id ?? "", edge: p.edge, share: p.share });
        return insertPanel(d, panel, { beside: target, edge: p.edge, share: p.share });
      }
      if (typeof p === "object" && "into" in p) {
        const loc = locatePanel(d, p.into);
        const node = findNode(d.root, p.into);
        const region: Region = node?.kind === "stage" ? "stage" : loc ? regionOfIn(p.into) : "side";
        if (!allowed(views, region) || (!loc && node?.kind !== "stage")) continue;
        return insertPanel(d, panel, { into: p.into, index: p.index });
      }
      if (p === "stage") {
        if (!stage) {
          if (focused && allowed(views, regionOfIn(focused))) return insertPanel(d, panel, { into: focused });
          continue;
        }
        if (!allowed(views, "stage")) continue;
        if (!stage.child) return insertPanel(d, panel, { into: stage.id });
        const inStage = panelsOf(stage);
        const target =
          (focused && inStage.some((x) => x.id === focused) && focused) ||
          (lastStagePanel && inStage.some((x) => x.id === lastStagePanel) && lastStagePanel) ||
          inStage[0].id;
        return insertPanel(d, panel, { into: target });
      }
      if (p === "tab") {
        if (focused && allowed(views, regionOfIn(focused))) return insertPanel(d, panel, { into: focused });
        if (stage) return placePanel(d, panel, "stage");
        continue;
      }
      if (p === "side") {
        if (!d.root) {
          if (allowed(views, "side")) return { ...d, root: panel };
          continue;
        }
        if (!allowed(views, "side")) break;
        if (stage && d.root.id !== stage.id) {
          // Join the side area: dock beside the outermost side panel next to the stage.
          return insertPanel(d, panel, { beside: stage.id, edge: "right", share: 0.25 });
        }
        return insertPanel(d, panel, {
          beside: d.root.id,
          edge: "right",
          share: stage ? 0.25 : 0.35,
        });
      }
    }
    // Nothing allowed: float if possible, else append beside root.
    if (fl && d.root) return floatPanel(d, panel, cascadeRect(fl), fl);
    return d.root ? insertPanel(d, panel, { beside: d.root.id, edge: "right" }) : { ...d, root: panel };
  }
  function defaultPlacement(type: string): Placement {
    const def = options.types[type];
    if (def?.placement) return def.placement;
    if (findStage(doc.root)) return "stage";
    if (focusedPanel) return "tab";
    return "side";
  }
  function open(type: string, o: OpenOptions = {}): ViewInfo {
    const def = options.types[type];
    if (!def) throw Error(`Trellis: unknown view type "${type}"`);
    const reuse = o.reuse ?? (def.singleton ? "type" : "none");
    const existing = findExisting(type, o, reuse);
    if (existing) {
      reveal(existing, o.focus !== false);
      return infoOf(existing)!;
    }
    if (o.id && doc.views[o.id]) {
      reveal(o.id, o.focus !== false);
      return infoOf(o.id)!;
    }
    const id = o.id ?? uid(type);
    const withRecord: LayoutDocument = {
      ...doc,
      views: {
        ...doc.views,
        [id]: {
          type,
          ...(o.params ? { params: o.params as Params } : {}),
          ...(o.title ? { title: o.title } : {}),
        },
      },
    };
    const panel: PanelNode = { kind: "panel", id: uid("panel"), views: [id], selected: id };
    const next = placePanel(withRecord, panel, o.placement ?? defaultPlacement(type));
    const from = o.from ? new Map([[panel.id, towardRect(o.from, { x: 0, y: 0, w: 0, h: 0 })]]) : undefined;
    commit(next, { from });
    const appeared = panelDoms.get(panel.id);
    if (appeared && !from) appear(appeared.el, panel.views);
    if (o.focus !== false) {
      const target = panelOfView(doc, id);
      if (target && doc.floating.some((f) => f.panel.id === target.id))
        commit(raiseFloat(doc, target.id), { silent: true, animate: false });
      focusView(id, true);
      ensureFramedVisible(id);
    }
    return infoOf(id)!;
  }
  function appear(el: HTMLElement, views: string[]) {
    if (reduced()) return;
    for (const node of [el, ...views.map((v) => records.get(v)?.shell).filter(Boolean)] as HTMLElement[]) {
      node.removeAttribute("data-appearing");
      void node.offsetWidth;
      node.setAttribute("data-appearing", "");
      lifetime.timeout(() => node.removeAttribute("data-appearing"), MOTION.appearMs + 40);
    }
  }
  function findExisting(type: string, o: OpenOptions, reuse: OpenOptions["reuse"]): string | null {
    if (!reuse || reuse === "none") return null;
    for (const id of viewIds(doc)) {
      const record = doc.views[id];
      if (record.type !== type) continue;
      if (reuse === "type") return id;
      if (reuse === "params" && stableJson(record.params ?? {}) === stableJson(o.params ?? {})) return id;
      if (typeof reuse === "function" && reuse(infoOf(id)!)) return id;
    }
    return null;
  }
  function reveal(viewId: string, focusIt: boolean) {
    const panel = panelOfView(doc, viewId);
    if (!panel) return;
    if (doc.hidden.some((x) => x.panel.id === panel.id)) restore(panel.id);
    let next = selectView(doc, viewId);
    if (doc.floating.some((f) => f.panel.id === panel.id)) next = raiseFloat(next, panel.id);
    if (next !== doc) commit(next, { animate: false });
    if (focusIt) focusView(viewId, true);
    ensureFramedVisible(viewId);
  }
  function ensureFramedVisible(viewId: string) {
    const panel = panelOfView(doc, viewId);
    if (panel) nav.ensureVisible(panel.id);
  }

  // ---------------------------------------------------------------- close / hide / float
  async function close(viewId: string, o: { force?: boolean } = {}): Promise<boolean> {
    if (!doc.views[viewId]) return false;
    const record = records.get(viewId);
    if (!o.force && record && !(await record.controller.canClose())) return false;
    if (!doc.views[viewId]) return false;
    // If keyboard focus was on this view or its tab, hand it to whatever gets selected next.
    const active = document.activeElement;
    const panelId = panelOfView(doc, viewId)?.id;
    const tabEl = panelId ? panelDoms.get(panelId)?.tabs.get(viewId)?.el : undefined;
    const hadFocus = !!active && (!!record?.shell.contains(active) || !!tabEl?.contains(active));
    commit(closeViewInDoc(doc, viewId));
    if (hadFocus) {
      const next =
        (panelId && locatePanel(doc, panelId)?.panel) || (focusedView ? panelOfView(doc, focusedView) : null);
      if (next) panelDoms.get(next.id)?.tabs.get(next.selected)?.el.focus({ preventScroll: true });
      else root.focus({ preventScroll: true });
    }
    return true;
  }
  function resolvePanel(id: string): PanelNode | null {
    return locatePanel(doc, id)?.panel ?? panelOfView(doc, id);
  }
  function hide(id: string, o: { toward?: Element | Rect } = {}) {
    // A view that shares its panel is hidden on its own and restored into the same panel.
    const owner = !locatePanel(doc, id) ? panelOfView(doc, id) : null;
    if (owner && owner.views.length > 1 && !doc.hidden.some((x) => x.panel.id === owner.id)) {
      const alone: PanelNode = { kind: "panel", id: uid("panel"), views: [id], selected: id };
      const detached = detachView(doc, id);
      const from = lastRects.get(owner.id);
      if (from && !reduced())
        leaving.set(alone.id, {
          panel: alone,
          from,
          to: towardRect(o.toward, from),
          start: performance.now(),
          duration: DOCK_MS.hide,
        });
      commit({
        ...detached,
        hidden: [...detached.hidden, { panel: alone, restore: { kind: "tab", panel: owner.id } }],
      });
      return;
    }
    const panel = resolvePanel(id);
    if (!panel || doc.hidden.some((x) => x.panel.id === panel.id)) return;
    const from = lastRects.get(panel.id) ?? targetRect(panel.id);
    const next = hidePanel(doc, panel.id);
    if (from && !reduced()) {
      const to = towardRect(o.toward, from);
      leaving.set(panel.id, { panel, from, to, start: performance.now(), duration: DOCK_MS.hide });
    }
    commit(next);
  }
  function towardRect(toward: Element | Rect | undefined, from: Rect): Rect {
    if (toward && "getBoundingClientRect" in toward) {
      const b = root.getBoundingClientRect();
      const r = toward.getBoundingClientRect();
      return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
    }
    if (toward) return toward as Rect;
    return { x: from.x + from.w * 0.25, y: from.y + from.h, w: from.w * 0.5, h: from.h * 0.1 };
  }
  function restore(panelId: string, o: { from?: Element | Rect } = {}) {
    const hidden = doc.hidden.find((x) => x.panel.id === panelId);
    if (!hidden) return;
    leaving.delete(panelId);
    const fl = floatingLayer() || "overlay";
    const next = restorePanel(doc, panelId, fl);
    lastRects.delete(panelId);
    if (o.from && !reduced()) entering.set(panelId, { from: towardRect(o.from, { x: 0, y: 0, w: 0, h: 0 }), start: performance.now() });
    commit(next);
    if (!o.from) {
      const dom = panelDoms.get(panelId);
      if (dom) appear(dom.el, hidden.panel.views);
    }
    focusView(hidden.panel.selected, true);
  }
  /** Where a docked window floats back to (PLACEMENT-01). Not persisted. */
  const rememberedFloats = new Map<string, Rect>();
  /** The prototype's dock toggle: a float docks beside the stage (along its longer side) and the
   * frame widens to show both; a docked window floats back at its remembered size. */
  function toggleDock(id: string) {
    const panel = resolvePanel(id);
    if (!panel || doc.hidden.some((x) => x.panel.id === panel.id)) return;
    const stage = findStage(doc.root);
    const float = doc.floating.find((f) => f.panel.id === panel.id);
    const from = new Map<string, Rect>();
    const current = lastRects.get(panel.id);
    if (current) from.set(panel.id, current);
    const without = removePanel(doc, panel.id);
    if (float) {
      if (!allowed(panel.views, "side")) return;
      settling.add(panel.id);
      rememberedFloats.set(panel.id, float.rect);
      const s = stageScreen();
      const next =
        stage && without.root && findNode(without.root, stage.id)
          ? insertPanel(without, panel, { beside: stage.id, edge: !s || s.w >= s.h ? "right" : "bottom" })
          : placePanel(without, panel, "side");
      commit(next, { from });
      nav.include(stage ? [stage.id, panel.id] : [panel.id]);
    } else {
      const layer = floatingLayer();
      if (!layer || !allowed(panel.views, "floating")) return;
      settling.add(panel.id);
      const rect = rememberedFloats.get(panel.id) ?? cascadeRect(layer);
      commit(floatPanel(without, panel, rect, layer), { from });
      if (stage) nav.include([stage.id]);
    }
    focusView(panel.selected, false);
  }
  function float(id: string, rect?: Rect) {
    const fl = floatingLayer();
    if (!fl) return;
    const loc = locatePanel(doc, id);
    let d = doc;
    let panel: PanelNode | null = loc?.panel ?? null;
    if (!loc) {
      const owner = panelOfView(doc, id);
      if (!owner) return;
      if (owner.views.length > 1) {
        d = detachView(doc, id);
        panel = { kind: "panel", id: uid("panel"), views: [id], selected: id };
      } else panel = owner;
    }
    if (!panel || !allowed(panel.views, "floating")) return;
    if (locatePanel(d, panel.id)?.where === "floating" && !rect) return;
    const current = lastRects.get(panel.id) ?? lastRects.get(loc?.panel.id ?? "") ?? null;
    let target = rect;
    if (!target) {
      const base = current ?? floatScreen(cascadeRect(fl), fl);
      const w = Math.min(base.w, DEFAULT_FLOAT_SIZE.w);
      const hh = Math.min(base.h, DEFAULT_FLOAT_SIZE.h);
      target = screenToFloat(
        { x: base.x + (base.w - w) / 2 + 24, y: base.y + (base.h - hh) / 2 + 24, w, h: hh },
        fl,
      );
    }
    const from = new Map<string, Rect>();
    if (current) from.set(panel.id, current);
    if (locatePanel(d, panel.id)) d = removePanel(d, panel.id);
    commit(floatPanel(d, panel, target, fl), { from });
  }
  function dock(id: string, target: DockTarget | "stage") {
    let panel = resolvePanel(id);
    if (!panel) return;
    let d = doc;
    if (!locatePanel(doc, id) && panel.views.length > 1) {
      d = detachView(doc, id);
      panel = { kind: "panel", id: uid("panel"), views: [id], selected: id };
    } else d = removePanel(doc, panel.id);
    const t: DockTarget = target === "stage" ? { into: findStage(d.root)?.id ?? d.root?.id ?? "" } : target;
    const from = new Map<string, Rect>();
    const current = lastRects.get(panel.id);
    if (current) from.set(panel.id, current);
    if ("into" in t && !findNode(d.root, t.into) && !locatePanel(d, t.into)) {
      commit(placePanel(d, panel, "side"), { from });
      return;
    }
    commit(d.root ? insertPanel(d, panel, t) : { ...d, root: panel }, { from });
  }
  function setTitle(viewId: string, title: string) {
    const record = doc.views[viewId];
    if (!record || record.title === title) return;
    doc = { ...doc, views: { ...doc.views, [viewId]: { ...record, title } } };
    records.get(viewId)?.controller.update({ title });
    updateTabs();
    emitChange();
  }
  function setParams(viewId: string, patch: object) {
    const record = doc.views[viewId];
    if (!record) return;
    doc = {
      ...doc,
      views: { ...doc.views, [viewId]: { ...record, params: { ...(record.params ?? {}), ...patch } } },
    };
    records
      .get(viewId)
      ?.controller.update({ params: doc.views[viewId].params ?? {}, title: titleOf(viewId) });
    updateTabs();
    emitChange();
  }

  // ---------------------------------------------------------------- menus
  function menuFor(panel: PanelNode): MenuEntry[] {
    const def = typeOf(panel.selected);
    const controller = records.get(panel.selected)?.controller;
    const custom =
      typeof def.menu === "function" ? (controller ? def.menu(controller) : []) : (def.menu ?? []);
    return custom;
  }
  function openPanelMenu(panelId: string, button: HTMLElement | null, at?: { x: number; y: number }) {
    const panel = findPanel(panelId);
    if (!panel) return;
    const entries: MenuEntry[] = [...menuFor(panel)];
    if (options.panelMenu !== false) {
      const region = regionOf(panelId);
      const builtIns: MenuEntry[] = [];
      const keymap = { ...DEFAULT_KEYMAP, ...options.keymap };
      const hint = (c: Command) => (keymap[c] ? formatCombo(keymap[c]!) : undefined);
      if (navigationMode() && region !== "floating")
        builtIns.push({
          label: framed() === panelId ? "Restore size" : "Maximize",
          shortcut: hint("frame.toggle"),
          run: () => toggleFrame(panelId),
        });
      if (region === "floating" && floatingLayer() === "stage") {
        builtIns.push({ label: "Dock beside stage", run: () => toggleDock(panelId) });
      } else if (region === "floating") {
        builtIns.push({
          label: "Dock",
          run: () =>
            dock(
              panelId,
              findStage(doc.root) && allowed(panel.views, "stage")
                ? "stage"
                : { beside: doc.root?.id ?? "", edge: "right", share: 0.3 },
            ),
        });
      } else if (floatingLayer() && allowed(panel.views, "floating")) {
        builtIns.push({ label: "Float", run: () => (floatingLayer() === "stage" ? toggleDock(panelId) : float(panelId)) });
      }
      // Keyboard-accessible alternative to dragging a tab.
      const viewId = panel.selected;
      const targets = [...panelsOf(doc.root), ...doc.floating.map((f) => f.panel)].filter(
        (p) => p.id !== panelId && allowed([viewId], regionOf(p.id)),
      );
      const moves: MenuEntry[] = targets.map((p) => ({
        label: p.views.length > 1 ? `${titleOf(p.selected)} +${p.views.length - 1}` : titleOf(p.selected),
        run: () => {
          dock(viewId, { into: p.id });
          focusView(viewId, false);
        },
      }));
      if (panel.views.length > 1 && region !== "floating")
        moves.push(
          { label: "New split right", run: () => dock(viewId, { beside: panelId, edge: "right" }) },
          { label: "New split below", run: () => dock(viewId, { beside: panelId, edge: "bottom" }) },
        );
      if (moves.length) builtIns.push({ label: `Move ${titleOf(viewId)} to`, items: moves as MenuItem[] });
      builtIns.push({
        label: "Hide",
        run: () => hide(panelId, { toward: options.hideToward?.(panelId) ?? undefined }),
      });
      if (entries.length && builtIns.length) entries.push("separator");
      entries.push(...builtIns);
      const closable = panel.views.filter((v) => typeOf(v).closable !== false);
      if (closable.length) {
        entries.push("separator");
        if (typeOf(panel.selected).closable !== false)
          entries.push({
            label: `Close ${titleOf(panel.selected)}`,
            shortcut: hint("view.close"),
            run: () => void close(panel.selected),
          });
        if (panel.views.length > 1)
          entries.push({
            label: "Close other tabs",
            run: () => panel.views.filter((v) => v !== panel.selected).forEach((v) => void close(v)),
          });
      }
    }
    if (!entries.length) return;
    if (button) {
      const b = root.getBoundingClientRect();
      const r = button.getBoundingClientRect();
      setAttr(button, "aria-expanded", "true");
      menuCloseHook = () => setAttr(button, "aria-expanded", null);
      menu.show(entries, { x: r.right - b.left, y: r.bottom - b.top + 4, alignRight: true });
    } else menu.show(entries, at ?? { x: 0, y: 0 });
  }

  // ---------------------------------------------------------------- keyboard
  function tabKeydown(e: KeyboardEvent, panelId: string) {
    const panel = findPanel(panelId);
    if (!panel) return;
    const index = panel.views.indexOf(panel.selected);
    const go = (i: number) => {
      e.preventDefault();
      const viewId = panel.views[(i + panel.views.length) % panel.views.length];
      const next = selectView(doc, viewId);
      if (next !== doc) commit(next, { animate: false });
      setFocus(viewId);
      panelDoms.get(panelId)?.tabs.get(viewId)?.el.focus();
    };
    switch (e.key) {
      case "ArrowRight":
        return go(index + 1);
      case "ArrowLeft":
        return go(index - 1);
      case "Home":
        return go(0);
      case "End":
        return go(panel.views.length - 1);
      case "Delete":
        if (typeOf(panel.selected).closable !== false) {
          e.preventDefault();
          void close(panel.selected);
        }
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        focusView(panel.selected, true);
        return;
      case "ContextMenu":
      case "F10":
        if (e.key === "F10" && !e.shiftKey) return;
        e.preventDefault();
        openPanelMenu(panelId, panelDoms.get(panelId)!.menuButton);
        return;
    }
  }
  lifetime.listen(root, "keydown", (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (dragActive()) return;
    const keymap = { ...DEFAULT_KEYMAP, ...options.keymap };
    // Shortcuts without Ctrl/⌘/Alt never fire while typing (prototype rule).
    const typing = (e.target as HTMLElement).matches?.("input, textarea, select, [contenteditable=''], [contenteditable=true]");
    for (const [command, combo] of Object.entries(keymap) as [Command, string | null][]) {
      if (typing && combo && !e.ctrlKey && !e.metaKey && !e.altKey) continue;
      if (combo && matches(e, combo)) {
        e.preventDefault();
        run(command);
        return;
      }
    }
    // Escape outside content steps out one level (prototype).
    if (e.key === "Escape" && framed() && !(e.target as HTMLElement).closest?.("[data-trellis-part=content]")) {
      e.preventDefault();
      nav.stepOut();
    }
  });
  function run(command: Command) {
    const panelId = focusedPanel;
    const panel = panelId ? findPanel(panelId) : null;
    switch (command) {
      case "frame.toggle":
        if (panelId) toggleFrame(panelId);
        return;
      case "navigation.back":
        return nav.back();
      case "navigation.forward":
        return nav.forward();
      case "navigation.overview":
        return nav.toggleOverview();
      case "panel.next":
      case "panel.previous": {
        const order = [...panelsOf(doc.root), ...doc.floating.map((f) => f.panel)];
        if (!order.length) return;
        const i = order.findIndex((p) => p.id === panelId);
        const next = order[(i + (command === "panel.next" ? 1 : -1) + order.length) % order.length];
        focusView(next.selected, false);
        panelDoms.get(next.id)?.tabs.get(next.selected)?.el.focus();
        ensureFramedVisible(next.selected);
        return;
      }
      case "tab.next":
      case "tab.previous": {
        if (!panel) return;
        const i = panel.views.indexOf(panel.selected);
        const viewId =
          panel.views[(i + (command === "tab.next" ? 1 : -1) + panel.views.length) % panel.views.length];
        selectAndFocus(viewId);
        return;
      }
      case "view.close":
        if (focusedView && typeOf(focusedView).closable !== false) void close(focusedView);
        return;
      case "panel.float":
        if (panelId) float(panelId);
        return;
      case "panel.hide":
        if (panelId) hide(panelId);
        return;
    }
  }

  // ---------------------------------------------------------------- navigation (see navigation.ts)
  let lastCamera: Rect = { ...UNIT };
  function cameraChanged() {
    if (sameRect(lastCamera, camera.value)) return;
    lastCamera = { ...camera.value };
    if (events.has("camera")) events.emit("camera", { ...camera.value });
  }
  /** Double-clicking a tab bar maximizes; a floating window frames its desktop (prototype). */
  function toggleFrame(panelId: string): boolean {
    const float = doc.floating.find((f) => f.panel.id === panelId);
    if (float) {
      // A window floating on the desktop frames its desktop; overlay floats have none.
      if (float.layer !== "stage") return false;
      nav.frame("stage");
      return true;
    }
    return nav.toggle(panelId);
  }
  const framed = () => nav?.framed ?? null;

  // ---------------------------------------------------------------- drag & drop (see drag.ts)
  function localPoint(ev: { clientX: number; clientY: number }) {
    const b = root.getBoundingClientRect();
    return { x: ev.clientX - b.left, y: ev.clientY - b.top };
  }
  function fromScreenRect(screen: Rect | undefined | null): Rect | null {
    if (!screen) return null;
    const p = pad();
    const a = fromScreen({ x: screen.x - p, y: screen.y - p });
    const b = fromScreen({ x: screen.x + screen.w + p, y: screen.y + screen.h + p });
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }
  function announce(text: string) {
    live.textContent = text;
  }

  // ---------------------------------------------------------------- dividers
  function minExtent(node: LayoutNode, axis: "x" | "y"): number {
    if (node.kind === "stage") return node.child ? minExtent(node.child, axis) : 120;
    if (node.kind === "panel") {
      const floor = axis === "x" ? 80 : tabbarHeight + 28;
      return floor;
    }
    const mins = node.children.map((c) => minExtent(c, axis));
    const inner =
      node.axis === axis ? mins.reduce((a, b) => a + b, 0) + gap * (mins.length - 1) : Math.max(...mins);
    return inner;
  }
  function beginDivider(e: PointerEvent, el: HTMLElement) {
    if (e.button !== 0) return;
    e.preventDefault();
    const splitId = el.dataset.split!;
    const index = Number(el.dataset.index);
    const split = findNode(doc.root, splitId) as SplitNode | null;
    const entry = entries.get(splitId);
    if (!split || !entry) return;
    const origin = doc;
    el.setPointerCapture(e.pointerId);
    setAttr(root, "data-resizing", split.axis);
    setAttr(el, "data-active", "");
    gesture = true;
    updateInteractivity();
    const move = (ev: PointerEvent) => {
      const p = localPoint(ev);
      const r = toScreen(entry.rect);
      const size = split.axis === "x" ? r.w : r.h;
      const position = split.axis === "x" ? (p.x - r.x) / r.w : (p.y - r.y) / r.h;
      const current = findNode(doc.root, splitId) as SplitNode | null;
      if (!current) return;
      const resized = resizeBoundary(
        current,
        index,
        position,
        (i) => minExtent(current.children[i], split.axis) / size,
      );
      doc = { ...doc, root: replaceNode(doc.root, splitId, resized) };
      entries = layoutRects(doc.root);
      render();
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setAttr(root, "data-resizing", null);
      setAttr(el, "data-active", null);
      gesture = false;
      const next = doc;
      doc = origin;
      commit(next, { animate: false });
      updateInteractivity();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
  function equalize(splitId: string, index: number) {
    const split = findNode(doc.root, splitId) as SplitNode | null;
    if (!split) return;
    const weights = [...split.weights];
    const pair = weights[index] + weights[index + 1];
    weights[index] = weights[index + 1] = pair / 2;
    commit({ ...doc, root: replaceNode(doc.root, splitId, { ...split, weights }) });
  }
  function dividerKey(e: KeyboardEvent, el: HTMLElement) {
    const split = findNode(doc.root, el.dataset.split!) as SplitNode | null;
    if (!split) return;
    const index = Number(el.dataset.index);
    const decrease = split.axis === "x" ? "ArrowLeft" : "ArrowUp";
    const increase = split.axis === "x" ? "ArrowRight" : "ArrowDown";
    if (e.key !== decrease && e.key !== increase) return;
    e.preventDefault();
    const total = split.weights.reduce((a, b) => a + b, 0);
    const boundary = split.weights.slice(0, index + 1).reduce((a, b) => a + b, 0) / total;
    const step = e.shiftKey ? 0.1 : 0.02;
    const entry = entries.get(split.id)!;
    const size = split.axis === "x" ? toScreen(entry.rect).w : toScreen(entry.rect).h;
    const resized = resizeBoundary(
      split,
      index,
      boundary + (e.key === increase ? step : -step),
      (i) => minExtent(split.children[i], split.axis) / size,
    );
    commit({ ...doc, root: replaceNode(doc.root, split.id, resized) }, { animate: false });
  }

  // ---------------------------------------------------------------- floating resize
  function addResizeHandles(dom: PanelDom) {
    const wrap = h("div", { class: "trellis-handles" });
    for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
      const handleEl = h("div", { "data-trellis-part": "resize", "data-dir": dir, "aria-hidden": "true" });
      lifetime.listen(handleEl, "pointerdown", (e: PointerEvent) => beginFloatResize(e, dom.id, dir));
      wrap.append(handleEl);
    }
    dom.el.append(wrap);
    dom.handles = wrap;
  }
  function beginFloatResize(e: PointerEvent, panelId: string, dir: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const float = doc.floating.find((f) => f.panel.id === panelId);
    if (!float) return;
    const start = floatScreen(float.rect, float.layer);
    const origin = doc;
    const startPoint = localPoint(e);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    gesture = true;
    updateInteractivity();
    setAttr(root, "data-resizing", "float");
    const minW = 160;
    const minH = tabbarHeight + 60;
    const move = (ev: PointerEvent) => {
      const p = localPoint(ev);
      const dx = p.x - startPoint.x;
      const dy = p.y - startPoint.y;
      let { x, y, w, h: hh } = start;
      if (dir.includes("e")) w = Math.max(minW, start.w + dx);
      if (dir.includes("s")) hh = Math.max(minH, start.h + dy);
      if (dir.includes("w")) {
        w = Math.max(minW, start.w - dx);
        x = start.x + start.w - w;
      }
      if (dir.includes("n")) {
        hh = Math.max(minH, start.h - dy);
        y = start.y + start.h - hh;
      }
      const rect = screenToFloat({ x, y, w, h: hh }, float.layer);
      doc = { ...doc, floating: doc.floating.map((f) => (f.panel.id === panelId ? { ...f, rect } : f)) };
      render();
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      gesture = false;
      setAttr(root, "data-resizing", null);
      const next = doc;
      doc = origin;
      commit(next, { animate: false });
      updateInteractivity();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  // ---------------------------------------------------------------- snapshot
  function invalidate() {
    snapshot = null;
    for (const listener of [...listeners]) listener();
  }
  function getSnapshot(): WorkspaceSnapshot {
    if (snapshot) return snapshot;
    // Views being dragged are still open; list them where they were.
    const ids = viewIds(doc);
    for (const id of lifted()?.views ?? []) if (!ids.includes(id)) ids.push(id);
    const views = ids.map((id) => infoOf(id)!).filter(Boolean);
    snapshot = {
      document: doc,
      focusedPanel,
      focusedView,
      views,
      hidden: doc.hidden.map((x) => ({
        panelId: x.panel.id,
        views: x.panel.views.map((v) => infoOf(v)!).filter(Boolean),
      })),
      framed: nav.framed,
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
      framings: nav.framings.list(),
      dragging: !!dragActive(),
    };
    return snapshot;
  }

  // ---------------------------------------------------------------- setup
  dragger = createDragController({
    root,
    lifetime,
    tween,
    lastRects,
    reduced,
    doc: () => doc,
    setDoc(next) {
      doc = next;
      sync();
      render();
    },
    commit(next, from, settle) {
      if (settle) settling.add(settle);
      if (next === doc) {
        // Nothing changed (a cancelled drag): animate everything back into place.
        if (!reduced()) tween.begin(from, performance.now());
        sync();
        render();
        return;
      }
      commit(next, { from });
    },
    render: () => render(),
    schedule,
    busy(active) {
      updateInteractivity();
      if (active) settledState = false;
      invalidate();
    },
    closeMenus: () => menu.close(false),
    camera: () => camera.value,
    viewport: () => viewport,
    inset: pad,
    tabbarHeight: (panel) => barHeight(panel),
    toScreen,
    fromScreen,
    panelScreen: (world) => inset(toScreen(world), pad()),
    fromScreenRect,
    floatWorld(panelId) {
      const float = doc.floating.find((f) => f.panel.id === panelId);
      if (!float || float.layer !== "stage") return null;
      const s = stageWorld();
      return { x: s.x + float.rect.x * s.w, y: s.y + float.rect.y * s.h, w: float.rect.w * s.w, h: float.rect.h * s.h };
    },
    floatingLayer,
    panelDom: (id) => panelDoms.get(id),
    frameOnly: (id) => !!panelDoms.get(id)?.el.hasAttribute("data-frame-only"),
    allowed,
    framedNode: () => nav.framedNode,
    minSize(viewIds) {
      let w = 0;
      let h = 0;
      for (const id of viewIds) {
        const min = minSizeOf(id);
        w = Math.max(w, min?.width ?? 0);
        h = Math.max(h, min?.height ?? 0);
      }
      return { w, h };
    },
    moved(panel, from, to) {
      // Keep the moved view in frame (prototype): docking a float widens the frame to include it;
      // floating a docked view frames its desktop.
      const stage = findStage(doc.root);
      if (to === "float" && from === "docked" && stage) nav.include([stage.id]);
      else if (to !== "float" && to !== "tab" && from === "floating") nav.include([panel.id]);
      else ensureFramedVisible(panel.selected);
      focusView(panel.selected, false);
    },
    announce,
  });
  nav = createNavigator({
    root,
    lifetime,
    camera,
    doc: () => doc,
    mode: navigationMode,
    reduced,
    viewport: () => viewport,
    fromScreen,
    toScreen,
    panelScreen: (world) => inset(toScreen(world), pad()),
    setGesture(active) {
      gesture = active;
      if (active) {
        tween.stop();
        settledState = false;
      }
      updateInteractivity();
      schedule();
    },
    busy: () => dragActive(),
    contentOwnsWheel(target) {
      const surface = target.closest?.("[data-trellis-part=surface]") as HTMLElement | null;
      if (!surface) return false;
      return typeOf(surface.dataset.view!).gestures !== "workspace";
    },
    titleOf: (node) => (node.kind === "panel" ? titleOf(node.selected) : node.kind === "stage" ? "the stage" : "this group"),
    schedule,
    render: () => render(),
    changed() {
      for (const [id, dom] of panelDoms) setAttr(dom.el, "data-framed", nav.framed === id ? "" : null);
      events.emit("navigate", nav.framed);
      invalidate();
      emitChange();
    },
  });
  function setDocument(next: LayoutDocument, o: { animate?: boolean } = {}) {
    const prepared = prepare(next);
    commit(prepared, { animate: o.animate ?? true });
    nav.restore(prepared.navigation);
  }
  applyTheme();
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth;
    const hh = host.clientHeight;
    if (w === viewport.w && hh === viewport.h) return;
    viewport = { w, h: hh };
    readMetrics();
    tween.stop();
    render();
    schedule();
  });
  ro.observe(host);
  lifetime.add(() => ro.disconnect());
  if (reducedQuery) lifetime.listen(reducedQuery, "change", () => schedule());
  lifetime.listen(root, "pointerdown", (e: PointerEvent) => {
    if (menu.open && !(e.target as HTMLElement).closest(".trellis-menu")) menu.close(false);
  });

  {
    const initial = options.document ?? loadPersisted() ?? defaultDocument();
    doc = prepare(initial);
    sync();
    nav.restore(doc.navigation);
    camera.finish();
    const first = panelsOf(doc.root)[0] ?? doc.floating[0]?.panel;
    if (first) setFocus(first.selected, false);
    render();
  }

  const handle: WorkspaceHandle = {
    element: root,
    slots,
    open,
    close,
    focus: (id: string) => {
      const panel = locatePanel(doc, id)?.panel;
      const viewId = panel ? panel.selected : id;
      if (!doc.views[viewId]) return;
      reveal(viewId, true);
    },
    select: (viewId: string) => {
      const next = selectView(doc, viewId);
      if (next !== doc) commit(next, { animate: false });
    },
    hide,
    restore,
    float,
    dock,
    toggleDock,
    setTitle,
    setParams,
    navigation: {
      frame: (target) => nav.frame(target),
      toggle: (id) => {
        const target = id ?? focusedPanel;
        // Floating windows are not camera targets (NAV-12); dock them first (toggleDock).
        return target ? nav.toggle(resolvePanel(target)?.id ?? target) : false;
      },
      back: () => nav.back(),
      forward: () => nav.forward(),
      overview: () => nav.overview(),
      toggleOverview: () => nav.toggleOverview(),
      stepOut: () => nav.stepOut(),
      stepIn: () => nav.stepIn(),
      get framed() {
        return nav.framed;
      },
      get camera() {
        return { ...camera.value };
      },
      framings: nav.framings,
    },
    run,
    getDocument,
    setDocument,
    reset() {
      if (options.persist)
        try {
          localStorage.removeItem(options.persist.key);
        } catch {
          /* ignore */
        }
      setDocument(defaultDocument());
    },
    views: (filter) =>
      viewIds(doc)
        .map((id) => infoOf(id)!)
        .filter((v) => !filter?.type || v.type === filter.type),
    view: (id) => records.get(id)?.controller ?? null,
    surfaces: () => surfacesList,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    on: (event, handler) => events.on(event, handler),
    update(patch) {
      const typesChanged = patch.types && patch.types !== options.types;
      options = { ...options, ...patch };
      if ("theme" in patch || "tokens" in patch || "navigation" in patch || "label" in patch || "tabs" in patch)
        applyTheme();
      if ("navigation" in patch && !navigationMode()) nav.focus(null, false);
      if (typesChanged) {
        for (const record of records.values()) mountContent(record);
        for (const record of records.values())
          record.controller.update({ title: titleOf(record.controller.id) });
      }
      sync();
      render();
    },
    destroy() {
      if (lifetime.disposed) return;
      dragger.cancel();
      for (const id of [...records.keys()]) destroySurface(id);
      lifetime.dispose();
      events.emit("surfaces", []);
      events.clear();
      listeners.clear();
    },
  };
  return handle;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson((value as any)[k])}`)
    .join(",")}}`;
}
