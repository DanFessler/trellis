import type { Params } from "../model/types";
import { Emitter } from "./lifetime";
import type { ViewEvents, ViewHandle, ViewState, WorkspaceHandle } from "./types";

export interface ViewHost {
  workspace: WorkspaceHandle;
  params(id: string): Params;
  setTitle(id: string, title: string): void;
  setParams(id: string, patch: object): void;
  setBadge(id: string, badge: string | number | boolean | null): void;
  element(id: string): HTMLElement;
  focus(id: string): void;
  close(id: string, options?: { force?: boolean }): Promise<boolean>;
  hide(id: string): void;
}

/** One per view. Presentation state changes arrive from the engine's render. */
export class ViewController implements ViewHandle {
  readonly events = new Emitter<ViewEvents>();
  readonly guards = new Set<() => boolean | Promise<boolean>>();
  private listeners = new Set<() => void>();
  state: ViewState;
  constructor(
    readonly id: string,
    readonly type: string,
    private host: ViewHost,
    initial: ViewState,
  ) {
    this.state = initial;
  }
  get params() {
    return this.state.params as any;
  }
  get workspace() {
    return this.host.workspace;
  }
  get panelId() {
    return this.state.panelId;
  }
  get visible() {
    return this.state.visible;
  }
  get focused() {
    return this.state.focused;
  }
  get selected() {
    return this.state.selected;
  }
  get placement() {
    return this.state.placement;
  }
  get interactive() {
    return this.state.interactive;
  }
  get size() {
    return this.state.size;
  }
  get scale() {
    return this.state.scale;
  }
  get title() {
    return this.state.title;
  }
  get badge() {
    return this.state.badge;
  }
  setTitle(title: string) {
    this.host.setTitle(this.id, title);
  }
  setParams(patch: object) {
    this.host.setParams(this.id, patch);
  }
  get element() {
    return this.host.element(this.id);
  }
  setBadge(badge: string | number | boolean | null) {
    this.host.setBadge(this.id, badge);
  }
  focus() {
    this.host.focus(this.id);
  }
  close(options?: { force?: boolean }) {
    return this.host.close(this.id, options);
  }
  hide() {
    this.host.hide(this.id);
  }
  guardClose(guard: () => boolean | Promise<boolean>) {
    this.guards.add(guard);
    return () => this.guards.delete(guard);
  }
  on<E extends keyof ViewEvents>(event: E, handler: ViewEvents[E]) {
    return this.events.on(event, handler);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = () => this.state;

  /** Apply new presentation state; notify only what changed. */
  update(patch: Partial<ViewState>) {
    const prev = this.state;
    let changed = false;
    for (const key of Object.keys(patch) as (keyof ViewState)[]) {
      const value = patch[key];
      const old = prev[key];
      if (key === "size") {
        const a = old as ViewState["size"];
        const b = value as ViewState["size"];
        if (a.width === b.width && a.height === b.height) continue;
      } else if (old === value) continue;
      changed = true;
      break;
    }
    if (!changed) return;
    const next = { ...prev, ...patch };
    this.state = next;
    if (next.size.width !== prev.size.width || next.size.height !== prev.size.height)
      this.events.emit("resize", next.size);
    if (next.visible !== prev.visible) this.events.emit("visibility", next.visible);
    if (next.focused !== prev.focused) this.events.emit("focus", next.focused);
    if (next.interactive !== prev.interactive) this.events.emit("interactive", next.interactive);
    if (next.scale !== prev.scale) this.events.emit("scale", next.scale);
    this.events.emit("change", next);
    for (const listener of [...this.listeners]) listener();
  }
  /** Run close guards. Any false vetoes. */
  async canClose(): Promise<boolean> {
    for (const guard of [...this.guards]) {
      try {
        if ((await guard()) === false) return false;
      } catch (error) {
        console.error(error);
        return false;
      }
    }
    return true;
  }
  dispose() {
    this.events.clear();
    this.listeners.clear();
    this.guards.clear();
  }
}
