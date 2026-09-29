import { createDocument, type LayoutSpec } from "../model/builder";
import { dragBoundary } from "../model/resize";
import { leafIds } from "../model/spatial";
import {
  clampFloat,
  closeView as closeViewInDoc,
  detachView,
  emptyDocument,
  floatPanel,
  hidePanel,
  insertPanel,
  locatePanel,
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
  UNIT,
  type Entry,
  type LayoutMetrics,
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
import { errorFallbackElement, h, icons, place, setAttr, setStyle } from "./dom";
import { DEFAULT_KEYMAP, formatCombo, matches, type Command } from "./keymap";
import { defaultGestureKeys } from "./gestures";
import { Emitter, Lifetime } from "./lifetime";
import { Menu, tidyMenu } from "./menu";
import { DOCK_EASE, DOCK_MS, lerpRect, LayoutTween, MOTION, RectSpring, sameRect } from "./motion";
import type {
  ErrorSource,
  Permissions,
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
  /** What the frame icon was last built from. */
  frameIconKey: string;
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
  /** Set while the content failed to mount and shows the error fallback. */
  failure: { error: unknown } | null;
}
interface Leaving {
  panel: PanelNode;
  from: Rect;
  to: Rect;
  start: number;
  duration: number;
}

/** Whether saved data has a layout document's shape. Details inside are repaired later (see
 * sanitize), but a save with the wrong shape is corrupt, and the default layout wins. */
function isDocumentShaped(value: unknown): value is LayoutDocument {
  const doc = value as LayoutDocument | null;
  return (
    !!doc &&
    typeof doc === "object" &&
    doc.schema === 1 &&
    (doc.root === null || (typeof doc.root === "object" && !Array.isArray(doc.root))) &&
    !!doc.views &&
    typeof doc.views === "object" &&
    !Array.isArray(doc.views) &&
    Array.isArray(doc.floating) &&
    Array.isArray(doc.hidden)
  );
}

const TYPE_PLACEHOLDER = (type: string): ViewTypeDefinition => ({
  title: type,
  mount(el) {
    el.append(
      h(
        "div",
        { class: "trellis-placeholder", "data-trellis-part": "view-missing" },
        h("strong", {}, "Unavailable"),
        h("span", {}, `No view type named “${type}” is registered.`),
      ),
    );
  },
});

const DEFAULT_FLOAT_SIZE = { w: 560, h: 400 };
/** Below this size a panel shows only its icon ("frame only"). */
const FRAME_ONLY = { w: 160, h: 64 };
/** Every panel keeps at least this much room (plus the gap), for a tab and its menu button. */
const PANEL_MIN = { w: 80 };
/** Defaults for the `detail` option: a nested group collapses into one tile when all its parts are
 * smaller than `size` × `size` on screen, too small even for an icon tile. */
const DETAIL = { size: 48, outline: 2 };

/** Create a workspace inside `host`. Returns an imperative handle. */
export function createWorkspace(host: HTMLElement, initialOptions: WorkspaceOptions): WorkspaceHandle {
  let options: WorkspaceOptions = { ...initialOptions };
  const lifetime = new Lifetime();
  const events = new Emitter<WorkspaceEvents>((error) => reportError(error, { source: "listener" }));
  // ---------------------------------------------------------------- errors
  let reporting = false;
  /** One channel for everything that throws: the `error` event, or the console without a
   * listener. An error thrown while reporting one goes to the console, so nothing loops. */
  function reportError(error: unknown, context: { source: ErrorSource; viewId?: string }) {
    if (reporting || !events.has("error")) {
      console.error(error);
      return;
    }
    const type = context.viewId ? doc?.views[context.viewId]?.type : undefined;
    reporting = true;
    try {
      events.emit("error", { error, source: context.source, viewId: context.viewId, type });
    } finally {
      reporting = false;
    }
  }
  /** Run a callback from options or a view type; if it throws, report it and use `fallback`. */
  function guarded<T>(run: () => T, fallback: T, context: { source: ErrorSource; viewId?: string }): T {
    try {
      return run();
    } catch (error) {
      reportError(error, context);
      return fallback;
    }
  }
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
  /** A pinch or wheel zoom is driving the camera: its end isn't known until it's released. */
  let zooming = false;
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
          reportError(error, { source: "title", viewId });
        }
    } else if (title) return title;
    return record.type;
  }

  // ---------------------------------------------------------------- theme
  let appliedTokens = new Set<string>();
  // ---------------------------------------------------------------- permissions
  /** What users may do through the interface. Code (ws.close, ws.dock, …) is never limited. */
  function can(action: keyof Permissions): boolean {
    const p = options.permissions;
    if (p === undefined || p === true) return true;
    if (p === false) return false;
    return p[action] !== false;
  }
  /** Whether a user can close this view: its type allows it, and so do the permissions. */
  const userClosable = (viewId: string) => can("close") && typeOf(viewId).closable !== false;

  // ---------------------------------------------------------------- direction
  /** Right to left: the layout is mirrored at the screen boundary (toScreen and fromScreen), so
   * the document stays direction-neutral: a row's first child is its start edge. */
  let rtl = false;
  /** Follow the `direction` option, or the page's own direction with "auto". Returns whether it
   * changed. */
  function readDirection(): boolean {
    const direction = options.direction ?? "auto";
    setAttr(root, "dir", direction === "auto" ? null : direction);
    const next = getComputedStyle(root).direction === "rtl";
    if (next === rtl) return false;
    rtl = next;
    setAttr(root, "data-direction", rtl ? "rtl" : null);
    return true;
  }
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
    readDirection();
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
    const x = p + ((r.x - c.x) / c.w) * W;
    const w = (r.w / c.w) * W;
    return {
      x: rtl ? viewport.w - x - w : x,
      y: p + ((r.y - c.y) / c.h) * H,
      w,
      h: (r.h / c.h) * H,
    };
  }
  function fromScreen(p: { x: number; y: number }) {
    const c = camera.value;
    const q = pad();
    const x = rtl ? viewport.w - p.x : p.x;
    return {
      x: c.x + ((x - q) / (viewport.w - q * 2)) * c.w,
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
  /** Floating rects are fractions of their layer, measured from its start edge. */
  function floatScreen(rect: Rect, layerName: FloatingLayer): Rect {
    const c = floatContainer(layerName);
    const x = rtl ? c.x + c.w - (rect.x + rect.w) * c.w : c.x + rect.x * c.w;
    return { x, y: c.y + rect.y * c.h, w: rect.w * c.w, h: rect.h * c.h };
  }
  function screenToFloat(r: Rect, layerName: FloatingLayer): Rect {
    const c = floatContainer(layerName);
    const x = rtl ? (c.x + c.w - r.x - r.w) / c.w : (r.x - c.x) / c.w;
    return { x, y: (r.y - c.y) / c.h, w: r.w / c.w, h: r.h / c.h };
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
  /** Where a panel will be once the camera settles: its target rect under the camera's target. */
  function restRect(panelId: string): Rect | null {
    const value = camera.value;
    camera.value = camera.target;
    try {
      return targetRect(panelId);
    } finally {
      camera.value = value;
    }
  }
  // Where each view and panel is, rebuilt when the document changes (documents are never edited
  // in place). Rendering asks for every view on every frame, so walking the tree for each would
  // cost views × panels per frame.
  let indexed: LayoutDocument | null = null;
  const viewIndex = new Map<string, { panel: PanelNode; region: Region | "hidden" }>();
  const panelIndex = new Map<string, { panel: PanelNode; region: Region | "hidden" }>();
  function located() {
    if (indexed === doc) return;
    indexed = doc;
    viewIndex.clear();
    panelIndex.clear();
    const add = (panel: PanelNode, region: Region | "hidden") => {
      if (panelIndex.has(panel.id)) return;
      const entry = { panel, region };
      panelIndex.set(panel.id, entry);
      for (const v of panel.views) if (!viewIndex.has(v)) viewIndex.set(v, entry);
    };
    for (const p of panelsOf(findStage(doc.root))) add(p, "stage");
    for (const p of panelsOf(doc.root)) add(p, "side");
    for (const f of doc.floating) add(f.panel, "floating");
    for (const h of doc.hidden) add(h.panel, "hidden");
  }
  /** The panel showing a view in the current document (panelOfView, without the walk). */
  function panelOf(viewId: string): PanelNode | null {
    located();
    return viewIndex.get(viewId)?.panel ?? null;
  }
  function regionOf(panelId: string): Region {
    located();
    const region = panelIndex.get(panelId)?.region;
    return region === "hidden" || region === undefined ? "side" : region;
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
      panelId: panelOf(viewId)?.id ?? "",
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
    reportError: (error: unknown, context: { viewId: string; source: ErrorSource }) =>
      reportError(error, context),
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
      failure: null,
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
    const viewId = record.controller.id;
    record.mountedWith = def;
    setAttr(record.shell, "class", def.className ?? null);
    let iframeError: { error: unknown } | null = null;
    let raw: string | IframeOptions | null = null;
    if (typeof def.iframe === "function")
      try {
        raw = def.iframe(record.controller);
      } catch (error) {
        iframeError = { error };
      }
    else raw = def.iframe ?? null;
    const frame: IframeOptions | null = raw === null ? null : typeof raw === "string" ? { src: raw } : raw;
    const key: unknown = iframeError
      ? iframeError
      : frame
        ? `iframe:${JSON.stringify(frame)}`
        : (def.mount ?? null);
    if (key !== record.mountKey) {
      if (record.mountKey !== null) {
        try {
          record.cleanup?.();
        } catch (error) {
          reportError(error, { source: "cleanup", viewId });
        }
        record.cleanup = null;
        record.content.replaceChildren();
      }
      record.mountKey = key;
      record.failure = null;
      if (iframeError) {
        reportError(iframeError.error, { source: "iframe", viewId });
        showFailure(record, iframeError.error);
      } else if (frame) {
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
          reportError(error, { source: "mount", viewId });
          record.content.replaceChildren();
          showFailure(record, error);
        }
      }
    }
    const icon = def.icon ?? null;
    if (icon !== record.iconHtml) {
      if (icon !== null || record.iconHtml !== null) record.icon.innerHTML = icon ?? "";
      record.iconHtml = icon;
    }
  }
  /** Show a view's error fallback in place of content that failed to mount. */
  function showFailure(record: SurfaceRecord, error: unknown) {
    const viewId = record.controller.id;
    record.failure = { error };
    const retry = () => {
      if (records.get(viewId) !== record) return;
      record.mountKey = null;
      record.failure = null;
      record.content.replaceChildren();
      mountContent(record);
    };
    const custom = options.errorFallback
      ? guarded(() => options.errorFallback!({ error, view: record.controller, retry }), null, {
          source: "callback",
          viewId,
        })
      : null;
    record.content.replaceChildren(
      custom === null ? errorFallbackElement(titleOf(viewId), error, retry) : custom,
    );
  }
  function destroySurface(viewId: string) {
    const record = records.get(viewId);
    if (!record) return;
    try {
      record.cleanup?.();
    } catch (error) {
      reportError(error, { source: "cleanup", viewId });
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
    menuButton.append(icons.more());
    const tabbar = h(
      "div",
      { "data-trellis-part": "tabbar", "data-panel": panelId },
      tablist,
      accessories,
      menuButton,
    );
    el.append(tabbar);
    layer.append(el);
    const frameIcon = h("span", { "data-trellis-part": "frame-icon", "aria-hidden": "true" });
    el.append(frameIcon);
    dom = {
      id: panelId,
      el,
      tabbar,
      tablist,
      accessories,
      menuButton,
      tabs: new Map(),
      handles: null,
      frameIcon,
      frameIconKey: "",
      endInset: 0,
    };
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
      if (!panel || !can("rearrange")) return;
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
    // An icon-only tile has no tab bar; double-clicking anywhere on it zooms to the panel.
    lifetime.listen(el, "dblclick", () => {
      if (el.hasAttribute("data-frame-only") && navigationMode()) toggleFrame(d.id);
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
    dom.handles?.remove();
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
    if (panel.views.length === 1 && modes[0] === "auto")
      return lifted()?.id === panel.id ? "normal" : "hidden";
    if (panel.views.length === 1 && modes[0] === "overlay") return "overlay";
    return "normal";
  }
  /** Space the tab bar takes above the content (0 when hidden or overlaid). */
  function barHeight(panel: PanelNode | null): number {
    return barMode(panel) === "normal" ? tabbarHeight : 0;
  }
  function findPanel(panelId: string): PanelNode | null {
    if (lifted()?.id === panelId) return lifted();
    located();
    return panelIndex.get(panelId)?.panel ?? leaving.get(panelId)?.panel ?? null;
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
        closeButton.append(icons.close());
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
          if (userClosable(viewId)) void close(viewId);
        });
        lifetime.listen(el, "click", (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest("[data-trellis-part=tab-close]")) return;
          selectAndFocus(viewId);
        });
        lifetime.listen(el, "auxclick", (e: MouseEvent) => {
          if (e.button === 1 && userClosable(viewId)) void close(viewId);
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
        const closable = userClosable(viewId);
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
      // The selected view's icon, copied as nodes (never re-parsed), or its title's first letter.
      const source = records.get(panel.selected)?.icon;
      const letter = titleOf(panel.selected).slice(0, 1).toUpperCase();
      const key = source?.childNodes.length ? source.innerHTML : `letter:${letter}`;
      if (dom.frameIconKey !== key) {
        dom.frameIconKey = key;
        dom.frameIcon.replaceChildren(
          ...(source?.childNodes.length
            ? [...source.childNodes].map((n) => n.cloneNode(true))
            : [h("b", {}, letter)]),
        );
      }
      if (barMode(panel) === "overlay")
        dom.endInset = dom.accessories.offsetWidth + dom.menuButton.offsetWidth + 24;
      // The button shows whenever the panel has a menu. The built-ins alone always give one.
      const hasMenu =
        options.panelMenu === true || options.panelMenu === undefined
          ? true
          : panelMenuEntries(panel).length > 0;
      setAttr(dom.menuButton, "hidden", hasMenu ? null : "");
    }
    invalidate();
  }

  // ---------------------------------------------------------------- sync
  /** Reconcile DOM with the document. Cheap; runs after every change. */
  function sync() {
    entries = layoutRects(doc.root, layoutMetrics());
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
        panelOf(lastFocusFallback()) ?? panelsOf(doc.root)[0] ?? doc.floating[0]?.panel ?? null;
      setFocus(fallback?.selected ?? null, false);
    } else if (focusedView) {
      const panel = panelOf(focusedView);
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
      if (!isDocumentShaped(parsed)) return null;
      if ((options.persist.version ?? undefined) !== (parsed.version ?? undefined)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  /** Any document from storage, a server or a caller: repaired first (see sanitize), then views
   * of unregistered types are dropped or kept as placeholders, as onMissingType says. */
  function prepare(input: LayoutDocument): LayoutDocument {
    const doc = sanitize(input, () => true);
    const drop = new Set<string>();
    for (const [id, record] of Object.entries(doc.views)) {
      if (options.types[record.type]) continue;
      const decision =
        guarded(() => options.onMissingType?.(record.type, id), undefined, {
          source: "callback",
          viewId: id,
        }) ?? "placeholder";
      if (decision === "drop") drop.add(id);
    }
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
      if (size && (size.width !== s.size.width || size.height !== s.size.height))
        record.controller.update({ size });
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
          if (panel)
            for (const v of panel.views)
              records.get(v)?.content.style.setProperty("--trellis-titlebar-inset-end", `${inset}px`);
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
      record.controller.update({ interactive: !busy && usableAt(record.controller.id, scale) });
    }
  }
  const moving = () =>
    !freezing &&
    (camera.moving || tween.active || !!dragActive() || gesture || leaving.size > 0 || entering.size > 0);

  // ---------------------------------------------------------------- collapsed groups
  /** Panel id → the collapsed group hiding it. */
  const collapsedOf = new Map<string, string>();
  /** Collapsed groups, and every split inside one (their dividers hide). */
  const collapsedGroups = new Set<string>();
  const hiddenSplits = new Set<string>();
  const groupEls = new Map<string, HTMLElement>();
  /** The outermost nested split groups whose parts are all too small on screen even for an icon.
   * A flat row or column of small panels keeps its icon tiles; only nesting collapses. The group
   * the camera is framing never collapses, so zooming in always reveals something. */
  function computeCollapsed() {
    collapsedOf.clear();
    collapsedGroups.clear();
    hiddenSplits.clear();
    const detail = options.detail;
    if (detail === false || !navigationMode()) return;
    const size = detail?.size ?? DETAIL.size;
    const framedId = nav.framed;
    const hide = (node: LayoutNode) => {
      if (node.kind === "split") {
        hiddenSplits.add(node.id);
        node.children.forEach(hide);
      } else if (node.kind === "stage" && node.child) hide(node.child);
    };
    const visit = (node: LayoutNode | null | undefined) => {
      if (!node) return;
      if (node.kind === "stage") return visit(node.child);
      if (node.kind !== "split") return;
      const small = (id: string) => {
        const e = entries.get(id);
        if (!e) return false;
        const r = toScreen(e.rect);
        return r.w < size || r.h < size;
      };
      const nested = node.children.some(
        (c) => c.kind === "split" || (c.kind === "stage" && c.child?.kind === "split"),
      );
      if (node.id !== framedId && nested && (small(node.id) || node.children.every((c) => small(c.id)))) {
        collapsedGroups.add(node.id);
        hide(node);
        for (const id of leafIds(node)) collapsedOf.set(id, node.id);
        return;
      }
      node.children.forEach(visit);
    };
    visit(doc.root);
  }
  /** Lines for a collapsed group's splits, `outline` levels deep, as percentages of the group. */
  /** A collapsed group's dividing lines, as positions in percent of the tile. */
  interface GroupLine {
    axis: "x" | "y";
    /** Along the tile's width, from its start edge (right when right to left). */
    inline: number;
    /** Down the tile's height. */
    block: number;
    /** The line's length, across its axis. */
    length: number;
  }
  function groupOutline(node: SplitNode, bounds: Rect, depth: number): GroupLine[] {
    const lines: GroupLine[] = [];
    const walk = (n: LayoutNode, level: number): void => {
      if (n.kind === "stage") {
        if (n.child) walk(n.child, level);
        return;
      }
      if (n.kind !== "split" || level >= depth) return;
      const r = entries.get(n.id)?.rect;
      if (!r) return;
      const pct = (v: number, from: number, size: number) => Math.round(((v - from) / size) * 100000) / 1000;
      for (const child of n.children.slice(1)) {
        const c = entries.get(child.id)?.rect;
        if (!c) continue;
        lines.push(
          n.axis === "x"
            ? {
                axis: "x",
                inline: pct(c.x, bounds.x, bounds.w),
                block: pct(r.y, bounds.y, bounds.h),
                length: pct(r.y + r.h, r.y, bounds.h),
              }
            : {
                axis: "y",
                inline: pct(r.x, bounds.x, bounds.w),
                block: pct(c.y, bounds.y, bounds.h),
                length: pct(r.x + r.w, r.x, bounds.w),
              },
        );
      }
      n.children.forEach((c) => walk(c, level + 1));
    };
    walk(node, 0);
    return lines;
  }
  /** The part of a collapsed group under a point, as deep as its outline shows. Zooming there always
   * makes progress, even when the whole group is too small to open at this screen size. */
  function groupSegmentAt(groupId: string, point: { x: number; y: number }): string {
    const p = fromScreen(point);
    const outline = (options.detail || undefined)?.outline ?? DETAIL.outline;
    let node = entries.get(groupId)?.node;
    let target = groupId;
    for (let level = 0; node && level < Math.max(1, outline); level++) {
      if (node.kind === "stage") node = node.child ?? undefined;
      if (!node || node.kind !== "split") break;
      const child: LayoutNode | undefined = node.children.find((c) => {
        const r = entries.get(c.id)?.rect;
        return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      });
      if (!child) break;
      target = child.id;
      node = child;
    }
    return target;
  }
  function renderGroups(round: boolean) {
    for (const [id, el] of groupEls)
      if (!collapsedGroups.has(id)) {
        el.remove();
        groupEls.delete(id);
      }
    const outline = (options.detail || undefined)?.outline ?? DETAIL.outline;
    for (const id of collapsedGroups) {
      const e = entries.get(id);
      if (!e || e.node.kind !== "split") continue;
      let el = groupEls.get(id);
      if (!el) {
        el = h("div", { "data-trellis-part": "group", "data-group": id, role: "img" });
        const groupId = id;
        lifetime.listen(el, "dblclick", (ev: MouseEvent) =>
          nav.focus(groupSegmentAt(groupId, localPoint(ev))),
        );
        layer.append(el);
        groupEls.set(id, el);
      }
      // Built as elements with their positions set through the style object, not markup, so a
      // Content Security Policy that blocks inline style attributes doesn't break them.
      const lines = groupOutline(e.node, e.rect, outline);
      const key = `${rtl}:${JSON.stringify(lines)}`;
      if (el.dataset.lines !== key) {
        el.dataset.lines = key;
        el.replaceChildren(
          ...lines.map((line) => {
            const i = h("i", { "data-axis": line.axis });
            i.style.setProperty(rtl ? "right" : "left", `${line.inline}%`);
            i.style.top = `${line.block}%`;
            i.style.setProperty(line.axis === "x" ? "height" : "width", `${line.length}%`);
            return i;
          }),
        );
      }
      const count = leafIds(e.node).length;
      setAttr(el, "aria-label", `${count} panels. Double-click to zoom in.`);
      setAttr(el, "title", "Double-click to zoom in");
      const r = inset(toScreen(e.rect), pad());
      const onscreen = r.x < viewport.w && r.y < viewport.h && r.x + r.w > 0 && r.y + r.h > 0;
      setStyle(el, "display", onscreen ? "" : "none");
      setStyle(el, "zIndex", "10");
      place(el, r, round);
    }
  }

  // ---------------------------------------------------------------- world transform (experimental)
  /** While the camera moves, the layout is drawn once, for a view that covers the whole move, and
   * each frame only transforms the layer that holds it. Per-frame cost stays flat however many
   * panels there are; the trade-off is that chrome scales like a picture until the camera stops. */
  let world: { laidOut: Rect; target: Rect } | null = null;
  /** Drawing the layout for the world transform: treated as at rest, and views aren't told. */
  let freezing = false;
  let refineTimer: ReturnType<typeof setTimeout> | undefined;
  /** Where overlay windows were drawn, before the layer's transform is undone for them. */
  let worldBases = new Map<HTMLElement, { x: number; y: number }>();
  const worldMotion = () =>
    !!options.worldTransform &&
    (camera.moving || zooming) &&
    !dragActive() &&
    !tween.active &&
    leaving.size === 0 &&
    entering.size === 0;
  const covers = (outer: Rect, inner: Rect) =>
    inner.x >= outer.x - 1e-6 &&
    inner.y >= outer.y - 1e-6 &&
    inner.x + inner.w <= outer.x + outer.w + 1e-6 &&
    inner.y + inner.h <= outer.y + outer.h + 1e-6;
  const grow = (r: Rect, by: number): Rect => ({
    x: r.x - r.w * by,
    y: r.y - r.h * by,
    w: r.w * (1 + 2 * by),
    h: r.h * (1 + 2 * by),
  });
  function render(time = performance.now()) {
    if (lifetime.disposed) return;
    if (worldMotion()) return renderWorld(time);
    if (world) endWorld();
    renderFrame(time);
  }
  function renderWorld(time: number) {
    const c = camera.value;
    const target = camera.moving ? camera.target : c;
    // How far the view has zoomed in past the drawn layout: beyond this it gets too soft.
    const magnified = world ? world.laidOut.w / c.w : 1;
    const stale =
      !world ||
      !covers(world.laidOut, c) ||
      magnified > 3 ||
      (camera.moving && !sameRect(world.target, target));
    if (stale) {
      // An animated move draws the box around where it starts and ends, so every frame in between
      // is covered. A gesture draws a margin around the view and redraws as it leaves it.
      const u = camera.moving
        ? grow(
            {
              x: Math.min(c.x, target.x),
              y: Math.min(c.y, target.y),
              w: Math.max(c.x + c.w, target.x + target.w) - Math.min(c.x, target.x),
              h: Math.max(c.y + c.h, target.y + target.h) - Math.min(c.y, target.y),
            },
            0.01,
          )
        : grow(c, 0.25);
      drawWorld(u, time);
      world = { laidOut: u, target: { ...target } };
    }
    placeWorld();
    // A gesture that pauses gets a sharp redraw for where it is now.
    lifetime.clearTimeout(refineTimer);
    if (zooming && world && Math.abs(world.laidOut.w / c.w - 1) > 0.3)
      refineTimer = lifetime.timeout(() => {
        if (!worldMotion() || !world) return;
        world = null;
        render();
      }, 150);
  }
  /** Draw the whole layout as if the camera were at `view`, with the layer untransformed. */
  function drawWorld(view: Rect, time: number) {
    setStyle(layer, "transform", "");
    const value = camera.value;
    camera.value = view;
    freezing = true;
    try {
      renderFrame(time);
    } finally {
      camera.value = value;
      freezing = false;
    }
    worldBases = new Map();
  }
  /** Map the drawn layout onto the current camera with one transform on the layer. */
  function placeWorld() {
    const value = camera.value;
    camera.value = world!.laidOut;
    const drawn = toScreen(UNIT);
    camera.value = value;
    const now = toScreen(UNIT);
    const kx = now.w / drawn.w;
    const ky = now.h / drawn.h;
    const tx = now.x - kx * drawn.x;
    const ty = now.y - ky * drawn.y;
    setStyle(layer, "transformOrigin", "0 0");
    setStyle(layer, "transform", `matrix(${kx}, 0, 0, ${ky}, ${tx}, ${ty})`);
    // Overlay windows float above the camera: undo the layer's transform for them.
    const undo = (el: HTMLElement | null | undefined) => {
      if (!el) return;
      let at = worldBases.get(el);
      if (!at) {
        const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(el.style.transform);
        if (!m) return;
        at = { x: Number(m[1]), y: Number(m[2]) };
        worldBases.set(el, at);
      }
      setStyle(el, "transformOrigin", "0 0");
      setStyle(
        el,
        "transform",
        `matrix(${1 / kx}, 0, 0, ${1 / ky}, ${(at.x - tx) / kx}, ${(at.y - ty) / ky})`,
      );
    };
    for (const f of doc.floating) {
      if (f.layer !== "overlay") continue;
      const dom = panelDoms.get(f.panel.id);
      undo(dom?.el);
      undo(dom?.handles);
      if (dom && dom.tabbar.parentElement === layer) undo(dom.tabbar);
      for (const v of f.panel.views) undo(records.get(v)?.shell);
    }
    // The backdrop and the empty stage live outside the layer: place them for this frame.
    const s = stageScreen();
    if (s) {
      place(backdrop, s, false);
      place(stageEmpty, s, false);
      setStyle(root, "--trellis-stage-x", `${s.x}px`);
      setStyle(root, "--trellis-stage-y", `${s.y}px`);
      setStyle(root, "--trellis-stage-w", `${s.w}px`);
      setStyle(root, "--trellis-stage-h", `${s.h}px`);
    }
  }
  function endWorld() {
    world = null;
    lifetime.clearTimeout(refineTimer);
    setStyle(layer, "transform", "");
    worldBases = new Map();
  }
  function renderFrame(time: number) {
    computeCollapsed();
    const round = !freezing && !moving();
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
        // Minimize: the whole window flies into its target.
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
      // Inside a collapsed group: the group's tile stands in for it. Its views stay mounted.
      if (collapsedOf.has(panelId) && !leaving.has(panelId)) {
        setStyle(dom.el, "display", "none");
        if (dom.tabbar.parentElement !== dom.el) setStyle(dom.tabbar, "display", "none");
        if (dom.handles) setStyle(dom.handles, "display", "none");
        continue;
      }
      const onscreen = inView(r) && r.w > 2 && r.h > 2;
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
      // Too small to use: show only the app icon; the whole frame is a drag handle.
      const frameOnly =
        lifted()?.id !== panelId &&
        (r.w < FRAME_ONLY.w || r.h < FRAME_ONLY.h + (panel.views.length > 1 ? tabbarHeight : 0));
      setAttr(dom.el, "data-frame-only", frameOnly ? "" : null);
      if (frameOnly)
        setStyle(dom.el, "--trellis-frame-icon-size", `${Math.max(0, Math.min(40, r.w - 12, r.h - 12))}px`);
      setAttr(dom.el, "data-compact", r.w < 140 || r.h < bar + 24 ? "" : null);
      setAttr(dom.el, "data-tabbar", mode === "normal" ? null : mode);
      // An overlaid bar leaves the panel and sits above the content it covers.
      if (mode === "overlay") {
        if (dom.tabbar.parentElement !== layer) layer.append(dom.tabbar);
        setAttr(dom.tabbar, "data-overlay", "");
        setStyle(dom.tabbar, "zIndex", String(z + 2));
        setStyle(dom.tabbar, "display", onscreen ? "" : "none");
        setStyle(dom.tabbar, "opacity", opacity === 1 ? "" : String(opacity));
        setStyle(
          dom.tabbar,
          "clipPath",
          clip ? clipInset({ x: r.x, y: r.y, w: r.w, h: tabbarHeight }, sScreen!) : "",
        );
        place(dom.tabbar, { x: r.x, y: r.y, w: r.w, h: tabbarHeight }, round);
      }
      if (dom.handles) {
        setStyle(dom.handles, "zIndex", String(z + 2));
        setStyle(dom.handles, "display", onscreen && !frameOnly && can("resize") ? "" : "none");
        setStyle(dom.handles, "opacity", opacity === 1 ? "" : String(opacity));
        setStyle(dom.handles, "clipPath", clip);
        place(dom.handles, r, round);
      }
      if (mode !== "overlay" && dom.tabbar.parentElement !== dom.el) {
        dom.el.prepend(dom.tabbar);
        setAttr(dom.tabbar, "data-overlay", null);
        for (const key of ["zIndex", "display", "opacity", "clipPath", "transform", "width", "height"])
          setStyle(dom.tabbar, key, "");
      }
      if (!onscreen) continue;
      const body: Rect = { x: r.x, y: r.y + bar, w: r.w, h: Math.max(0, r.h - bar) };
      const reflow = reflowOf(panelId, !!(l || enter), bar);
      for (const viewId of panel.views) {
        const record = records.get(viewId);
        if (!record) continue;
        shown.add(viewId);
        const selected = panel.selected === viewId;
        // A background tab is hidden: while things move it isn't placed each frame, only once
        // they settle (or when it's selected).
        if (!selected && moving()) {
          setStyle(record.shell, "visibility", "hidden");
          setAttr(record.shell, "inert", "");
          continue;
        }
        placeSurface(
          record,
          body,
          selected,
          z + 1,
          round,
          opacity,
          clip ? clipInset(body, sScreen!) : "",
          frameOnly,
          reflow,
        );
        setAttr(record.shell, "data-tabbar", mode === "normal" ? null : mode);
        const scale = (record as any).__scale || 1;
        setStyle(
          record.content,
          "--trellis-titlebar-height",
          mode === "overlay" ? `${tabbarHeight / scale}px` : "0px",
        );
        setStyle(
          record.content,
          "--trellis-titlebar-inset-end",
          mode === "overlay" ? `${dom.endInset / scale}px` : "0px",
        );
      }
    }
    // Hide surfaces with no visible panel (hidden panels, offscreen).
    for (const [viewId, record] of records) {
      if (shown.has(viewId)) continue;
      setStyle(record.shell, "visibility", "hidden");
      setAttr(record.shell, "inert", "");
      const panel = panelOf(viewId);
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
    renderGroups(round);
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
  /** Content minimum: the type's, or 480×320 under free navigation. */
  const FREE_MIN = { width: 480, height: 320 };
  function minSizeOf(viewId: string): { width: number; height: number } | undefined {
    const type = typeOf(viewId);
    if (type.scaling === false) return undefined;
    return type.minSize ?? (navigationMode() === "free" ? FREE_MIN : undefined);
  }
  /** Whether a view takes input at this scale: always, unless its type makes scaled content inert. */
  function usableAt(viewId: string, scale: number) {
    return scale >= 0.999 || typeOf(viewId).scaling !== "inert";
  }
  function placementOf(viewId: string): ViewPlacement {
    located();
    const entry = viewIndex.get(viewId);
    if (!entry)
      return lifted()?.views.includes(viewId) && lifted() ? placementOfPanel(lifted()!.id) : "docked";
    return entry.region === "hidden"
      ? "hidden"
      : entry.region === "floating"
        ? "floating"
        : entry.region === "stage"
          ? "stage"
          : "docked";
  }
  function placementOfPanel(panelId: string): ViewPlacement {
    const r = regionOf(panelId);
    return r === "floating" ? "floating" : r === "stage" ? "stage" : "docked";
  }
  /** Whether any whole pixel of a screen rect is in view: a rect ending exactly at an edge isn't. */
  function inView(r: Rect) {
    return r.x < viewport.w - 1 && r.y < viewport.h - 1 && r.x + r.w > 1 && r.y + r.h > 1;
  }
  /** How content is laid out this frame (see placeSurface):
   * - "live": at its current size. Whenever the camera is still: at rest, dragging a divider,
   *   resizing a window, and layout animations. Only the panels that change are laid out, and none
   *   beyond twice the window, so it's cheap and nothing is stretched.
   * - a rect: once, at the size it will settle at, while the camera moves, for panels that end in
   *   view. A zoom can change every panel's size by many times, so they aren't laid out per frame.
   * - "keep": at the size it already has. During a pinch or wheel zoom, whose end isn't known
   *   until it's released; panels that end a camera move out of view; and panels flying to or
   *   from the tray. */
  function reflowOf(panelId: string, flying: boolean, bar: number): "live" | "keep" | Rect {
    if (flying || zooming) return "keep";
    if (!camera.moving || gesture) return "live";
    const end = restRect(panelId);
    return end && inView(end) ? { ...end, y: end.y + bar, h: Math.max(0, end.h - bar) } : "keep";
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
    reflow: "live" | "keep" | Rect = "live",
  ) {
    const { shell, content, controller } = record;
    const min = minSizeOf(controller.id);
    const scaleAt = (r: Rect) =>
      Math.max(min ? Math.min(1, r.w / Math.max(1, min.width), r.h / Math.max(1, min.height)) : 1, 0.05);
    const safe = scaleAt(body);
    place(shell, body, round);
    setStyle(shell, "zIndex", String(z));
    setStyle(shell, "visibility", selected && !concealed ? "" : "hidden");
    setStyle(shell, "opacity", opacity === 1 ? "" : String(opacity));
    setStyle(shell, "clipPath", clip);
    // Content never lays out larger than twice the window: a bigger panel lays out at that cap
    // and is scaled up, so a deep zoom doesn't lay out neighbours at many times the screen.
    const layoutAt = (r: Rect) => {
      const s = scaleAt(r);
      const cap = Math.max(1, r.w / s / (2 * viewport.w), r.h / s / (2 * viewport.h));
      return { w: Math.round(r.w / s / cap), h: Math.round(r.h / s / cap) };
    };
    let width: number, height: number, transform: string;
    const frozen = (record as any).__layout as { w: number; h: number } | undefined;
    const settleAt = typeof reflow === "object" && reflow.w > 1 && reflow.h > 1 ? reflow : null;
    if (settleAt || (reflow !== "live" && frozen)) {
      // Moving: laid out once, at the size it will settle at or the size it already has, and
      // scaled to cover the surface each frame. One factor, so nothing is ever stretched: the
      // fixed-height tab bar changes the body's proportions slightly, and the surface crops that.
      const target = settleAt ? layoutAt(settleAt) : frozen!;
      width = target.w;
      height = target.h;
      transform = `scale(${Math.max(body.w / width, body.h / height)})`;
      (record as any).__layout = target;
    } else {
      const s = safe;
      const cap = Math.max(1, body.w / s / (2 * viewport.w), body.h / s / (2 * viewport.h));
      width = round ? Math.round(body.w / s / cap) : body.w / s / cap;
      height = round ? Math.round(body.h / s / cap) : body.h / s / cap;
      transform = s * cap < 0.999 || cap > 1 ? `scale(${s * cap})` : "";
      (record as any).__layout = { w: width, h: height };
    }
    setStyle(content, "width", `${width}px`);
    setStyle(content, "height", `${height}px`);
    setStyle(content, "transform", transform);
    setAttr(shell, "data-scaled", safe < 0.999 ? (usableAt(controller.id, safe) ? "" : "inert") : null);
    setAttr(shell, "inert", selected && !concealed ? null : "");
    (record as any).__size = { width: Math.round(width), height: Math.round(height) };
    (record as any).__scale = Math.round(safe * 1000) / 1000;
    const panel = panelOf(controller.id) ?? (lifted()?.views.includes(controller.id) ? lifted() : null);
    const onscreen = inView(body);
    const busy = !!dragActive() || gesture;
    controller.update({
      visible: selected && !concealed && onscreen && body.w > 1 && body.h > 1,
      selected,
      focused: focusedView === controller.id,
      placement: placementOf(controller.id),
      panelId: panel?.id ?? controller.state.panelId,
      interactive: !busy && usableAt(controller.id, safe),
      // Size and scale settle once motion stops: views never re-render per frame.
      ...(moving() || freezing
        ? {}
        : {
            size: { width: Math.round(width), height: Math.round(height) },
            scale: Math.round(safe * 1000) / 1000,
          }),
    });
  }
  function renderDividers(round: boolean) {
    // Without the resize permission there's nothing to grab or focus.
    // Hidden while anything moves (nothing to grab mid-animation), and without the resize permission.
    const show = !tween.active && !camera.moving && !dragActive() && !gesture && can("resize");
    for (const el of dividerEls.values()) {
      const split = effectiveSplit(el.dataset.split!);
      const e = split && entries.get(split.id);
      if (!split || !e || !show || hiddenSplits.has(split.id)) {
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
    const panel = viewId ? panelOf(viewId) : null;
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
    // A view inside a collapsed group can't be seen: zoom to it.
    const panel = panelOf(viewId);
    if (panel && collapsedOf.has(panel.id) && !dragActive()) nav.focus(panel.id);
    // Adapters render content asynchronously; move DOM focus once it has had a frame to mount.
    if (moveDom) lifetime.frame(() => moveFocusInto(viewId));
  }
  function raiseIfFloating(viewId: string) {
    const panel = panelOf(viewId);
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
        .get(panelOf(viewId)?.id ?? "")
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
    const panel = panelOf(viewId) ?? (lifted()?.views.includes(viewId) ? lifted() : null);
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
      const target = panelOf(id);
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
    const panel = panelOf(viewId);
    if (!panel) return;
    if (doc.hidden.some((x) => x.panel.id === panel.id)) restore(panel.id);
    let next = selectView(doc, viewId);
    if (doc.floating.some((f) => f.panel.id === panel.id)) next = raiseFloat(next, panel.id);
    if (next !== doc) commit(next, { animate: false });
    if (focusIt) focusView(viewId, true);
    ensureFramedVisible(viewId);
  }
  function ensureFramedVisible(viewId: string) {
    const panel = panelOf(viewId);
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
    const panelId = panelOf(viewId)?.id;
    const tabEl = panelId ? panelDoms.get(panelId)?.tabs.get(viewId)?.el : undefined;
    const hadFocus = !!active && (!!record?.shell.contains(active) || !!tabEl?.contains(active));
    commit(closeViewInDoc(doc, viewId));
    if (hadFocus) {
      const next =
        (panelId && locatePanel(doc, panelId)?.panel) || (focusedView ? panelOf(focusedView) : null);
      if (next) panelDoms.get(next.id)?.tabs.get(next.selected)?.el.focus({ preventScroll: true });
      else root.focus({ preventScroll: true });
    }
    return true;
  }
  function resolvePanel(id: string): PanelNode | null {
    return locatePanel(doc, id)?.panel ?? panelOf(id);
  }
  function hide(id: string, o: { toward?: Element | Rect } = {}) {
    // A view that shares its panel is hidden on its own and restored into the same panel.
    const owner = !locatePanel(doc, id) ? panelOf(id) : null;
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
    if (o.from && !reduced())
      entering.set(panelId, {
        from: towardRect(o.from, { x: 0, y: 0, w: 0, h: 0 }),
        start: performance.now(),
      });
    commit(next);
    if (!o.from) {
      const dom = panelDoms.get(panelId);
      if (dom) appear(dom.el, hidden.panel.views);
    }
    focusView(hidden.panel.selected, true);
  }
  /** Where a docked window floats back to (PLACEMENT-01). Not persisted. */
  const rememberedFloats = new Map<string, Rect>();
  /** Dock toggle: a float docks beside the stage (along its longer side) and the
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
      const owner = panelOf(id);
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
    const menuFn = def.menu;
    if (typeof menuFn !== "function") return menuFn ?? [];
    if (!controller) return [];
    return guarded(() => menuFn(controller), [], { source: "menu", viewId: panel.selected });
  }
  /** The built-in items for a panel, each with a stable id. */
  function builtInMenu(panel: PanelNode): MenuEntry[] {
    const panelId = panel.id;
    const region = regionOf(panelId);
    const items: MenuEntry[] = [];
    const keymap = { ...DEFAULT_KEYMAP, ...options.keymap };
    const hint = (c: Command) => (keymap[c] ? formatCombo(keymap[c]!) : undefined);
    if (navigationMode() && region !== "floating")
      items.push({
        id: "maximize",
        label: framed() === panelId ? "Restore size" : "Maximize",
        shortcut: hint("frame.toggle"),
        run: () => toggleFrame(panelId),
      });
    if (!can("float")) {
      // Neither Float nor Dock.
    } else if (region === "floating" && floatingLayer() === "stage") {
      items.push({ id: "dock", label: "Dock beside stage", run: () => toggleDock(panelId) });
    } else if (region === "floating") {
      items.push({
        id: "dock",
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
      items.push({
        id: "float",
        label: "Float",
        run: () => (floatingLayer() === "stage" ? toggleDock(panelId) : float(panelId)),
      });
    }
    // Keyboard-accessible alternative to dragging a tab.
    const viewId = panel.selected;
    const targets = [...panelsOf(doc.root), ...doc.floating.map((f) => f.panel)].filter(
      (p) => p.id !== panelId && allowed([viewId], regionOf(p.id)),
    );
    const moves: MenuItem[] = targets.map((p) => ({
      id: `move:${p.id}`,
      label: p.views.length > 1 ? `${titleOf(p.selected)} +${p.views.length - 1}` : titleOf(p.selected),
      run: () => {
        dock(viewId, { into: p.id });
        focusView(viewId, false);
      },
    }));
    if (panel.views.length > 1 && region !== "floating")
      moves.push(
        {
          // Toward the end edge, which is on the left when the layout is mirrored.
          id: "split-right",
          label: rtl ? "New split left" : "New split right",
          run: () => dock(viewId, { beside: panelId, edge: "right" }),
        },
        {
          id: "split-below",
          label: "New split below",
          run: () => dock(viewId, { beside: panelId, edge: "bottom" }),
        },
      );
    if (moves.length && can("rearrange"))
      items.push({ id: "move", label: `Move ${titleOf(viewId)} to`, items: moves });
    if (can("hide"))
      items.push({
        id: "hide",
        label: "Hide",
        run: () =>
          hide(panelId, {
            toward:
              guarded(() => options.hideToward?.(panelId), undefined, { source: "callback" }) ?? undefined,
          }),
      });
    // Only views a user may close: "Close other tabs" leaves non-closable tabs alone.
    const others = panel.views.filter((v) => v !== panel.selected && userClosable(v));
    if (userClosable(panel.selected) || others.length) {
      items.push("separator");
      if (userClosable(panel.selected))
        items.push({
          id: "close",
          label: `Close ${titleOf(panel.selected)}`,
          shortcut: hint("view.close"),
          run: () => void close(panel.selected),
        });
      if (others.length)
        items.push({
          id: "close-others",
          label: "Close other tabs",
          run: () => others.forEach((v) => void close(v)),
        });
    }
    return items;
  }
  /** The panel's full menu: the view type's items, the built-ins, then the `panelMenu` function. */
  function panelMenuEntries(panel: PanelNode): MenuEntry[] {
    const setting = options.panelMenu ?? true;
    const entries = menuFor(panel);
    if (setting === false) return tidyMenu(entries);
    const builtIns = builtInMenu(panel);
    const all: MenuEntry[] = entries.length ? [...entries, "separator", ...builtIns] : builtIns;
    if (setting === true) return tidyMenu(all);
    const view = records.get(panel.selected)?.controller;
    if (!view) return tidyMenu(all);
    const context = { panelId: panel.id, view, region: regionOf(panel.id) };
    return tidyMenu(
      guarded(() => setting(tidyMenu(all), context), tidyMenu(all), { source: "menu", viewId: view.id }),
    );
  }
  function openPanelMenu(panelId: string, button: HTMLElement | null, at?: { x: number; y: number }) {
    const panel = findPanel(panelId);
    if (!panel) return;
    const entries = panelMenuEntries(panel);
    if (!entries.length) return;
    const b = root.getBoundingClientRect();
    const r = button?.getBoundingClientRect();
    if (button) setAttr(button, "aria-expanded", "true");
    const reset = () => button && setAttr(button, "aria-expanded", null);
    if (options.renderMenu) {
      menu.close();
      const render = options.renderMenu;
      guarded(
        () =>
          render({
            entries,
            x: r ? r.right : b.left + (at?.x ?? 0),
            y: r ? r.bottom + 4 : b.top + (at?.y ?? 0),
            align: r ? "end" : "start",
            anchor: button,
            panelId,
            close: reset,
          }),
        undefined,
        { source: "callback" },
      );
      return;
    }
    menuCloseHook = reset;
    // The menu opens toward the start edge: under the button, lined up with its outer edge.
    if (r)
      menu.show(entries, {
        x: (rtl ? r.left : r.right) - b.left,
        y: r.bottom - b.top + 4,
        alignRight: !rtl,
      });
    else menu.show(entries, { ...(at ?? { x: 0, y: 0 }), alignRight: rtl });
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
    // Next is the tab after this one in reading order: to the left, right to left.
    const [next, previous] = rtl ? ["ArrowLeft", "ArrowRight"] : ["ArrowRight", "ArrowLeft"];
    switch (e.key) {
      case next:
        return go(index + 1);
      case previous:
        return go(index - 1);
      case "Home":
        return go(0);
      case "End":
        return go(panel.views.length - 1);
      case "Delete":
        if (userClosable(panel.selected)) {
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
    // Shortcuts without Ctrl/⌘/Alt never fire while typing.
    const typing = (e.target as HTMLElement).matches?.(
      "input, textarea, select, [contenteditable=''], [contenteditable=true]",
    );
    const inContent = !!(e.target as HTMLElement).closest?.("[data-trellis-part=content]");
    for (const [command, combo] of Object.entries(keymap) as [Command, string | null][]) {
      if (typing && combo && !e.ctrlKey && !e.metaKey && !e.altKey) continue;
      // Stepping out only applies while framed, and leaves content its own Escape.
      if (command === "navigation.stepOut" && (!framed() || inContent)) continue;
      if (combo && matches(e, combo)) {
        e.preventDefault();
        run(command);
        return;
      }
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
      case "navigation.stepOut":
        return nav.stepOut();
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
        if (focusedView && userClosable(focusedView)) void close(focusedView);
        return;
      case "panel.float":
        if (panelId && can("float")) float(panelId);
        return;
      case "panel.hide":
        if (panelId && can("hide")) hide(panelId);
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
  /** Double-clicking a tab bar maximizes; a floating window frames its desktop. */
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
    // Mirrored, the screen's left edge is the world's right edge.
    const x = Math.min(a.x, b.x);
    return { x, y: a.y, w: Math.abs(b.x - a.x), h: b.y - a.y };
  }
  function announce(text: string) {
    live.textContent = text;
  }

  // ---------------------------------------------------------------- dividers
  /** Pixel minimums for the layout: every panel keeps room for a tab and its menu button, in its
   * group's own layout space. A group needs a panel's room too; it scales itself if its own
   * children can't fit. */
  function layoutMetrics(): LayoutMetrics {
    // The layout maps into the viewport inside its outer padding (see toScreen).
    return {
      width: viewport.w - pad() * 2,
      height: viewport.h - pad() * 2,
      min: (node, axis) =>
        (node.kind === "stage" && !node.child ? 120 : axis === "x" ? PANEL_MIN.w : tabbarHeight + 28) + gap,
    };
  }
  /** A split with the proportions it actually has on screen (weights with minimums applied). */
  function effectiveSplit(id: string): SplitNode | null {
    const node = entries.get(id)?.node;
    return node?.kind === "split" ? node : null;
  }
  function beginDivider(e: PointerEvent, el: HTMLElement) {
    if (e.button !== 0 || !can("resize")) return;
    e.preventDefault();
    const origin = doc;
    const splitId = el.dataset.split!;
    const index = Number(el.dataset.index);
    const push = doc.root && dragBoundary(doc.root, layoutMetrics(), splitId, index);
    if (!push) return;
    // Pushed panels stay pushed: each move pushes on from where the last one left the layout.
    // With keepPushed: false, every move works from the layout the drag started with, so dragging
    // back undoes the pushes.
    const from = () =>
      options.keepPushed === false
        ? push
        : (dragBoundary(doc.root!, layoutMetrics(), splitId, index) ?? push);
    const along = (ev: PointerEvent) => fromScreen(localPoint(ev))[push.axis];
    const grab = along(e);
    el.setPointerCapture(e.pointerId);
    setAttr(root, "data-resizing", push.axis);
    setAttr(el, "data-active", "");
    gesture = true;
    updateInteractivity();
    const move = (ev: PointerEvent) => {
      doc = { ...doc, root: from().to(push.start + along(ev) - grab) };
      entries = layoutRects(doc.root, layoutMetrics());
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
    if (!can("resize")) return;
    const split = findNode(doc.root, splitId) as SplitNode | null;
    if (!split) return;
    const weights = [...split.weights];
    const pair = weights[index] + weights[index + 1];
    weights[index] = weights[index + 1] = pair / 2;
    commit({ ...doc, root: replaceNode(doc.root, splitId, { ...split, weights }) });
  }
  function dividerKey(e: KeyboardEvent, el: HTMLElement) {
    if (!can("resize")) return;
    const split = effectiveSplit(el.dataset.split!);
    const entry = entries.get(el.dataset.split!);
    if (!split || !entry || !doc.root) return;
    // The arrow moves the divider that way on screen, which is backwards in a mirrored row.
    const [decrease, increase] =
      split.axis === "y"
        ? ["ArrowUp", "ArrowDown"]
        : rtl
          ? ["ArrowRight", "ArrowLeft"]
          : ["ArrowLeft", "ArrowRight"];
    if (e.key !== decrease && e.key !== increase) return;
    e.preventDefault();
    const push = dragBoundary(doc.root, layoutMetrics(), split.id, Number(el.dataset.index));
    if (!push) return;
    // A step is a share of the split's own size.
    const step = (e.shiftKey ? 0.1 : 0.02) * (split.axis === "x" ? entry.rect.w : entry.rect.h);
    const next = push.to(push.start + (e.key === increase ? step : -step));
    if (next !== doc.root) commit({ ...doc, root: next }, { animate: false });
  }

  // ---------------------------------------------------------------- floating resize
  function addResizeHandles(dom: PanelDom) {
    // The handles live beside the panel in its layer, above the content, so their inner half isn't
    // covered by the content surface (render() keeps them on the panel's rect).
    const wrap = h("div", { class: "trellis-handles", "data-panel": dom.id });
    for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
      const handleEl = h("div", { "data-trellis-part": "resize", "data-dir": dir, "aria-hidden": "true" });
      lifetime.listen(handleEl, "pointerdown", (e: PointerEvent) => beginFloatResize(e, dom.id, dir));
      wrap.append(handleEl);
    }
    layer.append(wrap);
    dom.handles = wrap;
  }
  function beginFloatResize(e: PointerEvent, panelId: string, dir: string) {
    if (e.button !== 0 || !can("resize")) return;
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
    rtl: () => rtl,
    canFloat: () => can("float"),
    panelScreen: (world) => inset(toScreen(world), pad()),
    fromScreenRect,
    floatWorld(panelId) {
      const float = doc.floating.find((f) => f.panel.id === panelId);
      if (!float || float.layer !== "stage") return null;
      const s = stageWorld();
      return {
        x: s.x + float.rect.x * s.w,
        y: s.y + float.rect.y * s.h,
        w: float.rect.w * s.w,
        h: float.rect.h * s.h,
      };
    },
    floatingLayer,
    panelDom: (id) => panelDoms.get(id),
    frameOnly: (id) => !!panelDoms.get(id)?.el.hasAttribute("data-frame-only"),
    layoutMetrics,
    collapsedGroupOf: (id) => collapsedOf.get(id) ?? null,
    collapsedSplit: (id) => hiddenSplits.has(id),
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
      // Keep the moved view in frame: docking a float widens the frame to include it;
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
    layoutMetrics,
    doc: () => doc,
    mode: navigationMode,
    reduced,
    viewport: () => viewport,
    fromScreen,
    toScreen,
    rtl: () => rtl,
    panelScreen: (world) => inset(toScreen(world), pad()),
    setGesture(active) {
      gesture = active;
      zooming = active;
      if (active) {
        tween.stop();
        settledState = false;
      }
      updateInteractivity();
      schedule();
    },
    busy: () => dragActive(),
    gestureOwner(target) {
      const surface = target.closest?.("[data-trellis-part=surface]") as HTMLElement | null;
      if (!surface) return "chrome";
      return typeOf(surface.dataset.view!).gestures ?? "content";
    },
    gestureKeys: () => ({ ...defaultGestureKeys(), ...options.gestureKeys }),
    titleOf: (node) =>
      node.kind === "panel" ? titleOf(node.selected) : node.kind === "stage" ? "the stage" : "this group",
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
    readDirection();
    tween.stop();
    // Minimums are in pixels, so a new size can change the layout's proportions and scales.
    sync();
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
    reportError: (error, context = {}) =>
      reportError(error, {
        source: context.source ?? "content",
        viewId: context.viewId && doc.views[context.viewId] ? context.viewId : undefined,
      }),
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
    getLayoutRects: () => new Map(entries),
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
      // With direction "auto", any update picks up a change to the page's own direction.
      readDirection();
      if (
        "theme" in patch ||
        "tokens" in patch ||
        "navigation" in patch ||
        "label" in patch ||
        "tabs" in patch
      )
        applyTheme();
      // Close buttons follow the permissions.
      if ("permissions" in patch) updateTabs();
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
