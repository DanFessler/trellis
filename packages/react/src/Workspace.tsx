import {
  Children,
  createContext,
  forwardRef,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type ReactElement,
  type RefAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  createDocument,
  createWorkspace,
  type FloatSpec,
  type Edge,
  type FloatingLayer,
  type Keymap,
  type LayoutDocument,
  type LayoutSpec,
  type MenuEntry,
  type MenuRequest,
  type PanelMenuContext,
  type Params,
  type Placement,
  type Surface,
  type Theme,
  type ViewHandle,
  type ViewInfo,
  type ViewRules,
  type ViewState,
  type ViewTypeDefinition,
  type WorkspaceHandle,
  type WorkspaceSnapshot,
} from "@danfessler/trellis";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// ------------------------------------------------------------------ contexts
const WorkspaceContext = createContext<WorkspaceHandle | null>(null);
const ViewContext = createContext<ViewHandle | null>(null);
interface ProviderValue {
  ws: WorkspaceHandle | null;
  set(ws: WorkspaceHandle | null): void;
}
const ProviderContext = createContext<ProviderValue | null>(null);

/** Makes the hooks available to UI outside `<Workspace>` (app bars, menus, status bars).
 * Wrap both the workspace and that UI. */
export function WorkspaceProvider({ children }: { children?: ReactNode }) {
  const [ws, set] = useState<WorkspaceHandle | null>(null);
  const value = useMemo(() => ({ ws, set }), [ws]);
  return <ProviderContext.Provider value={value}>{children}</ProviderContext.Provider>;
}

/** Like useWorkspace, but returns null outside a workspace or before it mounts. */
export function useOptionalWorkspace(): WorkspaceHandle | null {
  const own = useContext(WorkspaceContext);
  const provided = useContext(ProviderContext);
  return own ?? provided?.ws ?? null;
}
/** The workspace's imperative handle. Available inside `<Workspace>`, in view content, and
 * anywhere under a `<WorkspaceProvider>` once the workspace has mounted. */
export function useWorkspace(): WorkspaceHandle {
  const ws = useOptionalWorkspace();
  if (!ws)
    throw Error("Trellis: useWorkspace() must be used inside <Workspace> or <WorkspaceProvider> after mount");
  return ws;
}

const noop = () => () => {};
let emptySnapshot: WorkspaceSnapshot | null = null;
function getEmptySnapshot(): WorkspaceSnapshot {
  return (emptySnapshot ??= {
    document: { schema: 1, root: null, floating: [], hidden: [], views: {} },
    focusedPanel: null,
    focusedView: null,
    views: [],
    hidden: [],
    framed: null,
    canGoBack: false,
    canGoForward: false,
    framings: [],
    dragging: false,
  });
}
function useStore(): { subscribe: (fn: () => void) => () => void; get: () => WorkspaceSnapshot } {
  const ws = useOptionalWorkspace();
  const inProvider = !!useContext(ProviderContext);
  if (!ws && !inProvider)
    throw Error("Trellis: workspace state hooks must be used inside <Workspace> or <WorkspaceProvider>");
  return ws ? { subscribe: ws.subscribe, get: ws.getSnapshot } : { subscribe: noop, get: getEmptySnapshot };
}
/** Subscribe to workspace state (layout, focus, hidden panels, navigation).
 * Under a provider, returns an empty snapshot until the workspace mounts. */
export function useWorkspaceState(): WorkspaceSnapshot {
  const { subscribe, get } = useStore();
  return useSyncExternalStore(subscribe, get, get);
}
/** Select part of the workspace state; re-renders only when the selection changes. */
export function useWorkspaceSelector<T>(
  select: (s: WorkspaceSnapshot) => T,
  equal: (a: T, b: T) => boolean = Object.is,
): T {
  const { subscribe, get: getSnapshot } = useStore();
  const last = useRef<{ value: T } | null>(null);
  const get = () => {
    const next = select(getSnapshot());
    if (last.current && equal(last.current.value, next)) return last.current.value;
    last.current = { value: next };
    return next;
  };
  return useSyncExternalStore(subscribe, get, get);
}

export type ViewApi<P extends object = Params> = ViewHandle<P> & ViewState & { params: P };

/** The view whose content is rendering. Re-renders when its presentation state settles. */
export function useView<P extends object = Params>(): ViewApi<P> {
  const view = useContext(ViewContext) as ViewHandle<P> | null;
  if (!view) throw Error("Trellis: useView() must be used inside view content");
  const state = useSyncExternalStore(view.subscribe, view.getState, view.getState);
  return useMemo(
    () =>
      ({
        ...state,
        id: view.id,
        type: view.type,
        workspace: view.workspace,
        setTitle: (title: string) => view.setTitle(title),
        setParams: (patch: Partial<P>) => view.setParams(patch),
        setBadge: (badge: string | number | boolean | null) => view.setBadge(badge),
        element: view.element,
        focus: () => view.focus(),
        close: (options?: { force?: boolean }) => view.close(options),
        hide: () => view.hide(),
        guardClose: (guard: () => boolean | Promise<boolean>) => view.guardClose(guard),
        on: ((event: any, handler: any) => view.on(event, handler)) as ViewHandle<P>["on"],
        subscribe: view.subscribe,
        getState: view.getState,
      }) as ViewApi<P>,
    [view, state],
  );
}
/** Like useView, but null outside view content (e.g. in shared components). */
export function useOptionalView(): ViewHandle | null {
  return useContext(ViewContext);
}
/** Keep the tab title in sync with a value. */
export function useViewTitle(title: string | null | undefined) {
  const view = useContext(ViewContext);
  useEffect(() => {
    if (view && title) view.setTitle(title);
  }, [view, title]);
}
/** Show a badge on the view's tab. */
export function useViewBadge(badge: string | number | boolean | null | undefined) {
  const view = useContext(ViewContext);
  useEffect(() => {
    if (!view) return;
    view.setBadge(badge ?? null);
    return () => view.setBadge(null);
  }, [view, badge]);
}
/** Veto closing: return false (or resolve false) to keep the view open. */
export function useCloseGuard(guard: () => boolean | Promise<boolean>) {
  const view = useContext(ViewContext);
  const ref = useRef(guard);
  ref.current = guard;
  useEffect(() => view?.guardClose(() => ref.current()), [view]);
}

// ------------------------------------------------------------------ declarative components
type Renderable<P extends object> = ReactNode | ((view: ViewApi<P>) => ReactNode);

export interface ViewTypeProps<P extends object = Params> extends ViewRules {
  /** Unique type name. `<View type>` and `open(type)` refer to it. */
  id: string;
  title?: string | ((view: ViewHandle<P>) => string);
  /** A React node, or trusted SVG/HTML markup as a string. */
  icon?: ReactNode;
  /** Content for each view. Receives nothing; use `useView()` inside. */
  children?: ReactNode;
  /** Alternative to children: render from the view's params and state. */
  render?: (view: ViewApi<P>) => ReactNode;
  /** Shown in the tab bar while this view is selected. */
  accessory?: Renderable<P>;
  iframe?: ViewTypeDefinition<P>["iframe"];
  mount?: ViewTypeDefinition<P>["mount"];
  menu?: MenuEntry[] | ((view: ViewHandle<P>) => MenuEntry[]);
  gestures?: "content" | "workspace";
  className?: string;
}
/** Register a kind of view. Renders nothing itself. */
export function ViewType<P extends object = Params>(_props: ViewTypeProps<P>): null {
  return null;
}

export interface SplitProps {
  axis?: "x" | "y";
  weights?: number[];
  id?: string;
  children?: ReactNode;
}
/** Initial layout: a weighted row (`axis="x"`, default) or column. */
export function Split(_props: SplitProps): null {
  return null;
}
export interface PanelProps {
  id?: string;
  /** Index of the initially selected view. */
  selected?: number;
  children?: ReactNode;
}
/** Initial layout: a tab group. */
export function Panel(_props: PanelProps): null {
  return null;
}
export interface ViewProps {
  type: string;
  id?: string;
  params?: object;
  title?: string;
}
/** Initial layout: one view. A bare view is wrapped in its own panel. */
export function View(_props: ViewProps): null {
  return null;
}
export interface StageProps {
  id?: string;
  /** Rendered behind the stage's panels (e.g. a single-document canvas or wallpaper). */
  backdrop?: ReactNode;
  /** Rendered when the stage has no panels. */
  empty?: ReactNode;
  children?: ReactNode;
}
/** The primary region. At most one per workspace. */
export function Stage(_props: StageProps): null {
  return null;
}
export interface FloatingProps {
  /** Position and size as fractions (0–1) of the layer. */
  rect: { x: number; y: number; w: number; h: number };
  /** Defaults to "overlay". */
  layer?: "stage" | "overlay";
  /** A `<Panel>` or a `<View>`. */
  children?: ReactNode;
}
/** Initial layout: a floating panel. Place it anywhere among the workspace's children. */
export function Floating(_props: FloatingProps): null {
  return null;
}
/** Rendered when the workspace has nothing in it. */
function Empty(_props: { children?: ReactNode }): null {
  return null;
}
/** Behind the stage's panels; same as `<Stage backdrop>`, usable with data layouts. */
function Backdrop(_props: { children?: ReactNode }): null {
  return null;
}
/** Shown while the stage is empty; same as `<Stage empty>`, usable with data layouts. */
function StageEmpty(_props: { children?: ReactNode }): null {
  return null;
}
/** A full-size layer above the workspace for your own overlays. */
function Chrome(_props: { children?: ReactNode }): null {
  return null;
}

// ------------------------------------------------------------------ parsing
interface Parsed {
  types: ViewTypeProps<any>[];
  layout: LayoutSpec | null;
  floating: FloatSpec[];
  stage: StageProps | null;
  empty: ReactNode;
  chrome: ReactNode;
  backdrop: ReactNode;
  stageEmpty: ReactNode;
}
function flatten(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) out.push(...flatten((child.props as { children?: ReactNode }).children));
    else out.push(child);
  });
  return out;
}
function parse(children: ReactNode): Parsed {
  const parsed: Parsed = {
    types: [],
    layout: null,
    floating: [],
    stage: null,
    empty: null,
    chrome: null,
    backdrop: null,
    stageEmpty: null,
  };
  const layouts: LayoutSpec[] = [];
  const toSpec = (el: ReactElement): LayoutSpec | null => {
    const props = el.props as any;
    if (el.type === View)
      return { kind: "view", type: props.type, id: props.id, params: props.params, title: props.title };
    if (el.type === Panel)
      return {
        kind: "panel",
        id: props.id,
        selected: props.selected,
        views: flatten(props.children)
          .filter((c) => c.type === View)
          .map((c) => toSpec(c) as Extract<LayoutSpec, { kind: "view" }>),
      };
    if (el.type === Split) {
      const kids = flatten(props.children)
        .map(toSpec)
        .filter((x): x is LayoutSpec => !!x);
      return { kind: "split", axis: props.axis ?? "x", weights: props.weights, id: props.id, children: kids };
    }
    if (el.type === Stage) {
      parsed.stage = props;
      const kids = flatten(props.children)
        .map(toSpec)
        .filter((x): x is LayoutSpec => !!x);
      const child = kids.length > 1 ? ({ kind: "split", axis: "x", children: kids } as LayoutSpec) : kids[0];
      return { kind: "stage", id: props.id, child };
    }
    return null;
  };
  for (const el of flatten(children)) {
    if (el.type === ViewType) parsed.types.push(el.props as ViewTypeProps);
    else if (el.type === Empty) parsed.empty = (el.props as any).children;
    else if (el.type === Chrome) parsed.chrome = (el.props as any).children;
    else if (el.type === Backdrop) parsed.backdrop = (el.props as any).children;
    else if (el.type === StageEmpty) parsed.stageEmpty = (el.props as any).children;
    else if (el.type === Floating) {
      const props = el.props as FloatingProps;
      const inner = flatten(props.children).map(toSpec)[0];
      if (inner && (inner.kind === "panel" || inner.kind === "view"))
        parsed.floating.push({ panel: inner, rect: props.rect, layer: props.layer });
    } else {
      const spec = toSpec(el);
      if (spec) layouts.push(spec);
    }
  }
  parsed.layout = layouts.length > 1 ? { kind: "split", axis: "x", children: layouts } : (layouts[0] ?? null);
  return parsed;
}

function isMarkup(icon: ReactNode): icon is string {
  return typeof icon === "string";
}

// ------------------------------------------------------------------ Workspace
export interface WorkspaceProps {
  children?: ReactNode;
  floating?: false | FloatingLayer;
  navigation?: false | "focus" | "free";
  motion?: "system" | "full" | "reduced";
  theme?: Theme;
  tokens?: Record<string, string>;
  keymap?: Keymap;
  /** `true` adds the built-in items, `false` leaves only each type's `menu`, and a function
   * receives the full menu and returns the entries to show. Always calls the latest function. */
  panelMenu?: boolean | ((entries: MenuEntry[], context: PanelMenuContext) => MenuEntry[]);
  /** Show panel menus with your own component. Always calls the latest function. */
  renderMenu?(request: MenuRequest): void;
  /** Tab layout: `fill` makes tabs share the tab row; `inset` (px) is the space around them. */
  tabs?: { fill?: boolean; inset?: number };
  /** Where the built-in "Hide" animates to, e.g. your dock or tray button. */
  hideToward?(panelId: string): Element | { x: number; y: number; w: number; h: number } | null | undefined;
  label?: string;
  /** Persist to localStorage under this key. Bump `version` when your default layout changes. */
  storageKey?: string;
  version?: string | number;
  /** Initial layout, if you prefer data over JSX. JSX layout children take precedence. */
  defaultLayout?: LayoutDocument | LayoutSpec | null;
  /** Controlled layout. Pair with onDocumentChange. */
  document?: LayoutDocument;
  onDocumentChange?(document: LayoutDocument): void;
  onOpen?(view: ViewInfo): void;
  onClose?(view: ViewInfo): void;
  onFocus?(viewId: string | null): void;
  onNavigate?(framed: string | null): void;
  onMissingType?(type: string, id: string): "drop" | "placeholder";
  className?: string;
  style?: CSSProperties;
  /** Receives the imperative workspace handle once mounted. */
  ref?: Ref<WorkspaceHandle>;
}

function WorkspaceImpl(props: WorkspaceProps, forwarded: Ref<WorkspaceHandle>) {
  const host = useRef<HTMLDivElement>(null);
  const [ws, setWs] = useState<WorkspaceHandle | null>(null);
  const parsed = parse(props.children);
  const latest = useRef({ props, parsed });
  latest.current = { props, parsed };

  // Function props (title, menu, iframe, mount) are routed through stable wrappers that
  // read the latest render, so changing their identity never remounts content.
  const wrappers = useRef(new Map<string, (...args: any[]) => any>());
  const wrap = (id: string, field: "title" | "iframe" | "mount" | "menu") => {
    const key = `${id}\u0000${field}`;
    let fn = wrappers.current.get(key);
    if (!fn) {
      fn = (...args: any[]) => {
        const t = latest.current.parsed.types.find((x) => x.id === id) as any;
        const value = t?.[field];
        return typeof value === "function" ? value(...args) : value;
      };
      wrappers.current.set(key, fn);
    }
    return fn;
  };
  const toDefinition = (t: ViewTypeProps<any>): ViewTypeDefinition<any> => ({
    placement: t.placement,
    allow: t.allow,
    singleton: t.singleton,
    closable: t.closable,
    minSize: t.minSize,
    tabbar: t.tabbar,
    gestures: t.gestures,
    className: t.className,
    icon: isMarkup(t.icon) ? t.icon : undefined,
    title: typeof t.title === "function" ? wrap(t.id, "title") : t.title,
    iframe: typeof t.iframe === "function" ? wrap(t.id, "iframe") : t.iframe,
    mount: t.mount ? wrap(t.id, "mount") : undefined,
    menu: t.menu === undefined ? undefined : wrap(t.id, "menu"),
  });
  const typesKey = parsed.types
    .map((t) =>
      JSON.stringify([
        t.id,
        typeof t.title === "function" ? "ƒ" : t.title,
        isMarkup(t.icon) ? t.icon : "",
        typeof t.iframe === "function" ? "ƒ" : JSON.stringify(t.iframe ?? null),
        !!t.mount,
        t.menu === undefined,
        t.placement,
        t.allow,
        t.singleton,
        t.closable,
        t.minSize,
        t.tabbar,
        t.gestures,
        t.className,
      ]),
    )
    .join("\n");
  // Function options go through stable wrappers that call the latest render's function.
  const panelMenuOption = (value: WorkspaceProps["panelMenu"]) =>
    typeof value === "function"
      ? (entries: MenuEntry[], context: PanelMenuContext) => {
          const current = latest.current.props.panelMenu;
          return typeof current === "function" ? current(entries, context) : entries;
        }
      : value;
  const renderMenuOption = (request: MenuRequest) => latest.current.props.renderMenu?.(request);
  const buildTypes = () => {
    const out: Record<string, ViewTypeDefinition> = {};
    for (const t of latest.current.parsed.types) out[t.id] = toDefinition(t);
    return out;
  };

  useIsomorphicLayoutEffect(() => {
    const { props: p, parsed: initial } = latest.current;
    const handle = createWorkspace(host.current!, {
      types: buildTypes(),
      floating: p.floating,
      navigation: p.navigation,
      motion: p.motion,
      theme: p.theme,
      tokens: p.tokens,
      keymap: p.keymap,
      panelMenu: panelMenuOption(p.panelMenu),
      renderMenu: p.renderMenu ? renderMenuOption : undefined,
      tabs: p.tabs,
      label: p.label,
      document: p.document,
      defaultLayout:
        initial.layout || initial.floating.length
          ? createDocument(initial.layout, { floating: initial.floating })
          : (p.defaultLayout ?? null),
      persist: p.storageKey ? { key: p.storageKey, version: p.version } : undefined,
      onMissingType: (type, id) => latest.current.props.onMissingType?.(type, id) ?? "placeholder",
      hideToward: (panelId) => latest.current.props.hideToward?.(panelId),
    });
    const offs = [
      handle.on("change", (doc) => {
        lastEmitted.current = doc;
        latest.current.props.onDocumentChange?.(doc);
      }),
      handle.on("open", (v) => latest.current.props.onOpen?.(v)),
      handle.on("close", (v) => latest.current.props.onClose?.(v)),
      handle.on("focus", (v) => latest.current.props.onFocus?.(v)),
      handle.on("navigate", (v) => latest.current.props.onNavigate?.(v)),
    ];
    setWs(handle);
    return () => {
      offs.forEach((off) => off());
      handle.destroy();
      setWs(null);
    };
  }, []);

  const lastEmitted = useRef<LayoutDocument | undefined>(undefined);
  // Controlled document.
  useIsomorphicLayoutEffect(() => {
    if (!ws || !props.document) return;
    if (props.document === lastEmitted.current) return;
    lastEmitted.current = props.document;
    ws.setDocument(props.document);
  }, [ws, props.document]);

  // Options that may change after mount.
  const tokensKey = JSON.stringify(props.tokens ?? {});
  const keymapKey = JSON.stringify(props.keymap ?? {});
  useIsomorphicLayoutEffect(() => {
    if (!ws) return;
    ws.update({
      floating: props.floating,
      navigation: props.navigation,
      motion: props.motion,
      theme: props.theme,
      tokens: props.tokens,
      keymap: props.keymap,
      panelMenu: panelMenuOption(props.panelMenu),
      renderMenu: props.renderMenu ? renderMenuOption : undefined,
      label: props.label,
      tabs: props.tabs,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ws,
    props.floating,
    props.navigation,
    props.motion,
    props.theme,
    tokensKey,
    keymapKey,
    typeof props.panelMenu === "function" ? "function" : props.panelMenu,
    !!props.renderMenu,
    props.label,
    props.tabs?.fill,
    props.tabs?.inset,
  ]);
  // Type registrations: data changes by key; functions refreshed every render through getters.
  useIsomorphicLayoutEffect(() => {
    if (ws) ws.update({ types: buildTypes() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, typesKey]);

  useImperativeHandle(forwarded ?? props.ref, () => ws as WorkspaceHandle, [ws]);
  const provider = useContext(ProviderContext);
  const setProvided = provider?.set;
  useIsomorphicLayoutEffect(() => {
    if (!setProvided) return;
    setProvided(ws);
    return () => setProvided(null);
  }, [setProvided, ws]);

  const surfaces = useSyncExternalStore(
    (notify) => (ws ? ws.on("surfaces", notify) : () => {}),
    () => (ws ? ws.surfaces() : noSurfaces),
    () => noSurfaces,
  );

  const typeById = new Map(parsed.types.map((t) => [t.id, t]));
  return (
    <WorkspaceContext.Provider value={ws}>
      <div
        ref={host}
        className={props.className}
        style={{ width: "100%", height: "100%", ...props.style }}
        data-trellis-host=""
      />
      {ws &&
        surfaces.map((surface) => (
          <SurfacePortal key={surface.view.id} surface={surface} type={typeById.get(surface.view.type)} />
        ))}
      {ws &&
        (parsed.stage?.backdrop ?? parsed.backdrop) != null &&
        createPortal(parsed.stage?.backdrop ?? parsed.backdrop, ws.slots.backdrop)}
      {ws &&
        (parsed.stage?.empty ?? parsed.stageEmpty) != null &&
        createPortal(parsed.stage?.empty ?? parsed.stageEmpty, ws.slots.stageEmpty)}
      {ws && parsed.empty != null && createPortal(parsed.empty, ws.slots.empty)}
      {ws && parsed.chrome != null && createPortal(parsed.chrome, ws.slots.chrome)}
    </WorkspaceContext.Provider>
  );
}
type WorkspaceComponent = ForwardRefExoticComponent<
  Omit<WorkspaceProps, "ref"> & RefAttributes<WorkspaceHandle>
> & {
  /** Rendered when the workspace has nothing in it. */
  Empty: typeof Empty;
  /** Behind the stage's panels (like `<Stage backdrop>`, but usable with data layouts). */
  Backdrop: typeof Backdrop;
  /** Shown while the stage is empty (like `<Stage empty>`, but usable with data layouts). */
  StageEmpty: typeof StageEmpty;
  /** A full-size layer above the workspace for your own overlays. */
  Chrome: typeof Chrome;
};
/** A dockable workspace. Children declare view types, the initial layout and slots. */
export const Workspace = Object.assign(forwardRef(WorkspaceImpl), {
  Empty,
  Chrome,
  Backdrop,
  StageEmpty,
}) as WorkspaceComponent;
const noSurfaces: readonly Surface[] = [];

function SurfacePortal({ surface, type }: { surface: Surface; type: ViewTypeProps<any> | undefined }) {
  const view = surface.view;
  return (
    <ViewContext.Provider value={view}>
      {type && !type.iframe && !type.mount && createPortal(<Content type={type} />, surface.content, view.id)}
      {type && type.icon != null && !isMarkup(type.icon) && createPortal(type.icon, surface.icon)}
      {type?.accessory != null && createPortal(<Accessory type={type} />, surface.accessory)}
    </ViewContext.Provider>
  );
}
function Content({ type }: { type: ViewTypeProps<any> }) {
  if (type.render) return <RenderWithView render={type.render} />;
  return <>{type.children}</>;
}
function RenderWithView({ render }: { render: (view: ViewApi<any>) => ReactNode }) {
  const view = useView();
  return <>{render(view)}</>;
}
function Accessory({ type }: { type: ViewTypeProps<any> }) {
  if (typeof type.accessory === "function") return <RenderWithView render={type.accessory as any} />;
  return <>{type.accessory}</>;
}

export type { Edge, Placement };
