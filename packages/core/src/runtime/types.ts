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

export type Cleanup = void | (() => void);

export interface MenuItem {
  label: string;
  /** Shown right-aligned, e.g. "⌘S". */
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  run?(): void;
  items?: MenuItem[];
}
export type MenuEntry = MenuItem | "separator";

export interface ViewTypeDefinition<P extends object = Params> extends ViewRules {
  /** Tab label. A view can override it with `setTitle()`. */
  title?: string | ((view: ViewHandle<P>) => string);
  /** Trusted SVG/HTML markup for the tab icon. Adapters can render richer icons. */
  icon?: string;
  /** Mount vanilla content. Called once per view; never again for moves.
   * `parts` holds the view's tab icon and tab-bar accessory containers. */
  mount?(element: HTMLElement, view: ViewHandle<P>, parts: { icon: HTMLElement; accessory: HTMLElement }): Cleanup;
  /** Render an iframe: a URL, or attributes such as `srcdoc` and `sandbox`. Its state survives
   * docking and tabbing; changing what this returns (e.g. via params) reloads it. */
  iframe?: string | IframeOptions | ((view: ViewHandle<P>) => string | IframeOptions);
  /** Items at the top of the panel menu while this view is selected. */
  menu?: MenuEntry[] | ((view: ViewHandle<P>) => MenuEntry[]);
  /** "workspace" lets navigation gestures start over this view's content. */
  gestures?: "content" | "workspace";
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
  /** Animate the new panel out of this element or rect (e.g. a launcher icon). */
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
  /** Initial layout when nothing is persisted or controlled. */
  defaultLayout?: LayoutDocument | LayoutSpec | null;
  /** Start from this document (e.g. controlled state). Overrides persistence. */
  document?: LayoutDocument;
  /** Save to and restore from localStorage. */
  persist?: { key: string; version?: string | number };
  /** Built-in panel menu items. Default true. */
  panelMenu?: boolean;
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

export interface WorkspaceEvents {
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
  setTitle(viewId: string, title: string): void;
  setParams(viewId: string, patch: object): void;
  navigation: {
    frame(target: string | string[] | "all" | "stage"): void;
    /** Maximize a docked panel, or restore it if it is maximized. Returns false for floating or hidden panels. */
    toggle(panelOrViewId?: string): boolean;
    back(): void;
    forward(): void;
    overview(): void;
    readonly framed: string | null;
    /** The visible region of the layout right now, in world units (the whole layout is 0–1). */
    readonly camera: Rect;
    framings: {
      save(name: string): Framing;
      go(id: string): void;
      remove(id: string): void;
      list(): Framing[];
    };
  };
  run(command: Command): void;
  getDocument(): LayoutDocument;
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
