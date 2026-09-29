import type { GestureKeys } from "./gestures";
import type { Command, Keymap } from "./keymap";
import type {
  Edge,
  Framing,
  FloatingLayer,
  LayoutDocument,
  Params,
  Placement,
  Rect,
  ViewRules,
} from "../model/types";
import type { LayoutSpec } from "../model/builder";
import type { Entry } from "../model/tree";

export type Cleanup = void | (() => void);

export interface MenuItem {
  /** Identifies the item, e.g. to find or remove it in a `panelMenu` function. Built-in items
   * use the ids in `BuiltInMenuId`. */
  id?: string;
  label: string;
  /** A hint shown right-aligned, e.g. "⌘S". Display only: it doesn't bind the key. */
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  run?(): void;
  items?: MenuItem[];
}
export type MenuEntry = MenuItem | "separator";

/** Ids of the built-in panel menu items. `move` is the "Move to" submenu; its entries are
 * `move:<panelId>`, then `split-right` and `split-below`. */
export type BuiltInMenuId =
  "maximize" | "float" | "dock" | "move" | "split-right" | "split-below" | "hide" | "close" | "close-others";

/** What a `panelMenu` function knows about the menu being opened. */
export interface PanelMenuContext {
  panelId: string;
  /** The panel's selected view, whose `menu` items lead the menu. */
  view: ViewHandle;
  region: "stage" | "side" | "floating";
}

/** A menu for `renderMenu` to show in place of the built-in one. */
export interface MenuRequest {
  /** The final entries, with leading, trailing and repeated separators removed. */
  entries: MenuEntry[];
  /** Where to show it, in viewport (client) pixels. */
  x: number;
  y: number;
  /** "end" when opened from the panel menu button: align the menu's right edge to `x`. */
  align: "start" | "end";
  /** The panel menu button, when the menu was opened from it. */
  anchor: HTMLElement | null;
  panelId: string;
  /** Call when your menu closes, so Trellis can reset the button's expanded state. */
  close(): void;
}

export interface ViewTypeDefinition<P extends object = Params> extends ViewRules {
  /** Tab label. A view can override it with `setTitle()`. */
  title?: string | ((view: ViewHandle<P>) => string);
  /** Trusted SVG/HTML markup for the tab icon. Adapters can render richer icons. */
  icon?: string;
  /** Mount vanilla content. Called once per view; never again for moves.
   * `parts` holds the view's tab icon and tab-bar accessory containers. */
  mount?(
    element: HTMLElement,
    view: ViewHandle<P>,
    parts: { icon: HTMLElement; accessory: HTMLElement },
  ): Cleanup;
  /** Render an iframe: a URL, or attributes such as `srcdoc` and `sandbox`. Its state survives
   * docking and tabbing; changing what this returns (e.g. via params) reloads it. */
  iframe?: string | IframeOptions | ((view: ViewHandle<P>) => string | IframeOptions);
  /** Items at the top of the panel menu while this view is selected. */
  menu?: MenuEntry[] | ((view: ViewHandle<P>) => MenuEntry[]);
  /** Who gets gestures over this view's content under free navigation. "content" (default): the
   * content, except a pinch, which zooms the workspace. "exclusive": the content keeps its pinch
   * too, for maps and canvases. "workspace": a plain scroll over it steps the workspace, for
   * content that doesn't scroll itself. The gesture keys navigate over any content. */
  gestures?: "content" | "workspace" | "exclusive";
  /** Extra CSS class for the view's surface, e.g. for per-type theming. */
  className?: string;
}
export type ViewTypes = Record<string, ViewTypeDefinition<any>>;
export interface IframeOptions {
  src?: string;
  srcdoc?: string;
  sandbox?: string;
  allow?: string;
  referrerPolicy?: string;
  title?: string;
}

export type ViewPlacement = "docked" | "stage" | "floating" | "hidden";

export interface ViewState {
  visible: boolean;
  focused: boolean;
  selected: boolean;
  placement: ViewPlacement;
  interactive: boolean;
  /** The size content is laid out at, in CSS pixels. */
  size: { width: number; height: number };
  /** Visual scale applied below `minSize` (1 otherwise). */
  scale: number;
  title: string;
  badge: string | number | boolean | null;
  panelId: string;
  params: Params;
}

export interface ViewEvents {
  resize(size: { width: number; height: number }): void;
  visibility(visible: boolean): void;
  focus(focused: boolean): void;
  interactive(interactive: boolean): void;
  scale(scale: number): void;
  change(state: ViewState): void;
}

export interface ViewHandle<P extends object = Params> {
  readonly id: string;
  readonly type: string;
  readonly params: P;
  readonly panelId: string;
  readonly visible: boolean;
  readonly focused: boolean;
  readonly selected: boolean;
  readonly placement: ViewPlacement;
  readonly interactive: boolean;
  readonly size: { width: number; height: number };
  readonly scale: number;
  readonly title: string;
  readonly badge: string | number | boolean | null;
  readonly workspace: WorkspaceHandle;
  /** The content container (for vanilla content or reaching an iframe). Never moves in the DOM. */
  readonly element: HTMLElement;
  setTitle(title: string): void;
  setParams(patch: Partial<P>): void;
  /** A count or label shown in the tab; `true` shows a dot (e.g. unsaved changes); null clears it. */
  setBadge(badge: string | number | boolean | null): void;
  focus(): void;
  close(options?: { force?: boolean }): Promise<boolean>;
  hide(): void;
  /** Return false (or resolve false) to keep the view open. */
  guardClose(guard: () => boolean | Promise<boolean>): () => void;
  on<E extends keyof ViewEvents>(event: E, handler: ViewEvents[E]): () => void;
  subscribe(listener: () => void): () => void;
  getState(): ViewState;
}

export interface ViewInfo {
  id: string;
  type: string;
  params: Params;
  title: string;
  panelId: string;
  placement: ViewPlacement;
  selected: boolean;
}

export interface Surface {
  view: ViewHandle;
  /** Mount point for the view's content. Never moves in the DOM. */
  content: HTMLElement;
  /** Inside the tab, before the title. */
  icon: HTMLElement;
  /** In the tab bar, visible while the view is selected. */
  accessory: HTMLElement;
}

export interface WorkspaceSlots {
  /** Behind the stage's panels and floats. */
  backdrop: HTMLElement;
  /** Shown when the stage has no panels. */
  stageEmpty: HTMLElement;
  /** Shown when the workspace has nothing at all. */
  empty: HTMLElement;
  /** A layer above everything for your own overlays (minimaps, HUDs). */
  chrome: HTMLElement;
}

export type Theme = "light" | "medium" | "dark" | "darker" | "system";

export interface OpenOptions {
  /** Serializable data for the view (any plain object; interfaces are fine). */
  params?: object;
  id?: string;
  title?: string;
  placement?: Placement;
  reuse?: "none" | "type" | "params" | ((view: ViewInfo) => boolean);
  focus?: boolean;
  /** Animate the new panel out of this element or rect (e.g. a launcher icon). Rects are in pixels
   * relative to the workspace element. Ignored when an existing view is revealed. */
  from?: Element | Rect;
}

export interface WorkspaceOptions {
  types: ViewTypes;
  /** Where floating panels live. Default "overlay". */
  floating?: false | FloatingLayer;
  /** Animated framing. Default "focus". */
  navigation?: false | "focus" | "free";
  motion?: "system" | "full" | "reduced";
  theme?: Theme;
  /** CSS custom properties applied to the workspace, e.g. { "--trellis-accent": "#f60" }. */
  tokens?: Record<string, string>;
  keymap?: Keymap;
  /** What users may change through the interface: `false` locks the layout, `true` (default)
   * allows everything, or turn off each of these. Calls from code always work, so an admin tool or
   * a server-driven layout can still change it. Can change at any time. */
  permissions?: boolean | Partial<Permissions>;
  /** Layout direction. "auto" (default) follows the page (the `dir` attribute or CSS `direction`
   * around the workspace); "rtl" mirrors the layout, tabs, menus, keys and gestures. Documents are
   * direction-neutral: a row's first child sits at its start edge either way. */
  direction?: "ltr" | "rtl" | "auto";
  /** What a view shows when its content fails to mount: a node or text. The default shows the
   * view's title, the error message and a Try again button. */
  errorFallback?: (info: ErrorFallbackInfo) => Node | string;
  /** Keys held with the pointer for free-navigation gestures: `pan`, `scale` and `rect` (drag), and
   * `step` (scroll). Each is a combo, a list of combos (any works) or `null` (off). See
   * `defaultGestureKeys()` for the defaults. */
  gestureKeys?: Partial<GestureKeys>;
  /** Initial layout when nothing is persisted or controlled. */
  defaultLayout?: LayoutDocument | LayoutSpec | null;
  /** Start from this document (e.g. controlled state). Overrides persistence. */
  document?: LayoutDocument;
  /** Save to and restore from localStorage. */
  persist?: { key: string; version?: string | number };
  /** Tab layout. `fill`: tabs grow to share the tab row. `inset`: space in px between the tabs and
   * the bar's top and sides; 0 makes them meet the edges. Defaults: `{ fill: false, inset: 4 }`.
   * Also available as the `--trellis-tab-inset` token. */
  tabs?: { fill?: boolean; inset?: number };
  /** The panel menu. `true` (default) adds the built-in items after each view type's `menu` items;
   * `false` leaves only the view type's items. A function receives the full menu (view type items,
   * then built-ins) and returns the entries to show: filter, reorder or add items for every panel.
   * Return an empty list for no menu. */
  panelMenu?: boolean | ((entries: MenuEntry[], context: PanelMenuContext) => MenuEntry[]);
  /** How much detail small parts of the layout show while navigating. A nested split group whose
   * parts are all smaller than `size` × `size` pixels on screen (too small even for an icon tile)
   * collapses into one tile, with lines for its first `outline` levels of splits. Double-clicking
   * the tile zooms to the part under the pointer. Its panels stay mounted. Defaults:
   * `{ size: 48, outline: 2 }`. `false` turns collapsing off. Only applies while navigation is on. */
  detail?: false | { size?: number; outline?: number };
  /** Dragging a divider past a neighbour's minimum pushes the panels beyond it. By default they
   * stay pushed if the divider is dragged back. `false` makes each drag work from the layout it
   * started with, so dragging back undoes the pushes. */
  keepPushed?: boolean;
  /** Show panel menus with your own component instead of the built-in one. */
  renderMenu?(request: MenuRequest): void;
  /** Where the built-in "Hide" animates to, e.g. your dock or tray button. */
  hideToward?(panelId: string): Element | Rect | null | undefined;
  /** Unknown view types in a restored document. Default "placeholder". */
  onMissingType?(type: string, id: string): "drop" | "placeholder";
  /** Accessible name for the workspace region. */
  label?: string;
}

export interface WorkspaceSnapshot {
  document: LayoutDocument;
  focusedPanel: string | null;
  focusedView: string | null;
  views: ViewInfo[];
  hidden: { panelId: string; views: ViewInfo[] }[];
  framed: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  framings: Framing[];
  dragging: boolean;
}

export interface Permissions {
  /** Drag tabs and panels: docking, tabbing, reordering, moving floating windows, and the panel
   * menu's Move and New split items. */
  rearrange: boolean;
  /** Resize with dividers (dragging, arrow keys, double-click) and floating windows' edges. */
  resize: boolean;
  /** Close views: close buttons, middle-click, Delete, the Close menu items and shortcut. */
  close: boolean;
  /** Turn panels into floating windows and back: the Float and Dock menu items, the float
   * shortcut, and dragging a whole panel between the layout and the desktop. */
  float: boolean;
  /** Hide panels: the Hide menu item and shortcut. */
  hide: boolean;
}

/** Where an error came from: a view type's `mount`, its cleanup, `title`, `iframe` or `menu`
 * function, a close guard, an event listener, a framework render (adapters), your own code
 * (`reportError`), or another callback option. */
export type ErrorSource =
  | "mount"
  | "cleanup"
  | "title"
  | "iframe"
  | "menu"
  | "guard"
  | "listener"
  | "render"
  | "content"
  | "callback";

export interface WorkspaceError {
  error: unknown;
  source: ErrorSource;
  /** The view it happened in, when there is one. */
  viewId?: string;
  /** That view's type. */
  type?: string;
}

export interface ErrorFallbackInfo {
  error: unknown;
  view: ViewHandle;
  /** Mount the view's content again. */
  retry(): void;
}

export interface WorkspaceEvents {
  /** Something in a view or a callback threw. The workspace carries on; with no listener, the
   * error goes to the console. */
  error(error: WorkspaceError): void;
  /** Committed layout changes only; never fires mid-drag or mid-animation. */
  change(document: LayoutDocument): void;
  open(view: ViewInfo): void;
  close(view: ViewInfo): void;
  focus(viewId: string | null): void;
  navigate(framed: string | null): void;
  /** Every frame the camera moves (world rect, 0–1). For minimaps; don't re-render a framework tree from it. */
  camera(rect: Rect): void;
  surfaces(surfaces: readonly Surface[]): void;
}

export interface WorkspaceHandle {
  readonly element: HTMLElement;
  readonly slots: WorkspaceSlots;
  open(type: string, options?: OpenOptions): ViewInfo;
  close(viewId: string, options?: { force?: boolean }): Promise<boolean>;
  focus(id: string): void;
  select(viewId: string): void;
  hide(panelOrViewId: string, options?: { toward?: Element | Rect }): void;
  restore(panelId: string, options?: { from?: Element | Rect }): void;
  float(panelOrViewId: string, rect?: Rect): void;
  dock(
    panelOrViewId: string,
    target: { beside: string; edge: Edge; share?: number } | { into: string; index?: number } | "stage",
  ): void;
  /** Dock a floating window beside the stage, or float a docked one back at its previous size. */
  toggleDock(panelOrViewId: string): void;
  setTitle(viewId: string, title: string): void;
  setParams(viewId: string, patch: object): void;
  /** Send an error through the workspace's `error` event, as if the workspace had caught it. */
  reportError(error: unknown, context?: { viewId?: string; source?: ErrorSource }): void;
  navigation: {
    frame(target: string | string[] | "all" | "stage"): void;
    /** Maximize a docked panel, or restore it if it is maximized. Returns false for floating or hidden panels, or when navigation is off. (Double-clicking a stage float's tab bar frames the stage instead.) */
    toggle(panelOrViewId?: string): boolean;
    back(): void;
    forward(): void;
    overview(): void;
    readonly framed: string | null;
    /** The visible region of the layout right now, in world units (the whole layout is 0–1). */
    readonly camera: Rect;
    /** Toggle between everything and the previous framing. */
    toggleOverview(): void;
    /** Escape: frame the parent of the current framing. */
    stepOut(): void;
    /** Frame the child under the centre of the viewport. */
    stepIn(): void;
    framings: {
      /** Save the current framing. Blank names are rejected (returns null). */
      save(name: string): Framing | null;
      go(id: string): void;
      remove(id: string): void;
      list(): Framing[];
    };
  };
  run(command: Command): void;
  getDocument(): LayoutDocument;
  /** Every docked node's rect as it's laid out right now, in world units (0 to 1), with minimum
   * sizes and scaled groups applied. `scale` is how much a node is scaled down by cramped groups
   * around it. Use this for minimaps; `layoutRects(root)` alone ignores minimums. */
  getLayoutRects(): Map<string, Entry>;
  setDocument(document: LayoutDocument, options?: { animate?: boolean }): void;
  reset(): void;
  views(filter?: { type?: string }): ViewInfo[];
  view(id: string): ViewHandle | null;
  surfaces(): readonly Surface[];
  subscribe(listener: () => void): () => void;
  getSnapshot(): WorkspaceSnapshot;
  on<E extends keyof WorkspaceEvents>(event: E, handler: WorkspaceEvents[E]): () => void;
  update(options: Partial<Omit<WorkspaceOptions, "defaultLayout" | "document" | "persist">>): void;
  destroy(): void;
}
