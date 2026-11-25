/** Owns every listener, frame, timer and observer a workspace creates. */
export class Lifetime {
  private controller = new AbortController();
  private frames = new Set<number>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private cleanups: (() => void)[] = [];
  get signal() {
    return this.controller.signal;
  }
  get disposed() {
    return this.controller.signal.aborted;
  }
  listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K | string,
    handler: (event: any) => void,
    options: AddEventListenerOptions = {},
  ) {
    target.addEventListener(type, handler, { ...options, signal: this.signal });
  }
  frame(callback: FrameRequestCallback): number {
    if (this.disposed) return 0;
    const id = requestAnimationFrame((time) => {
      this.frames.delete(id);
      callback(time);
    });
    this.frames.add(id);
    return id;
  }
  cancelFrame(id: number) {
    if (!id) return;
    cancelAnimationFrame(id);
    this.frames.delete(id);
  }
  timeout(callback: () => void, ms: number) {
    if (this.disposed) return undefined;
    const id = setTimeout(() => {
      this.timers.delete(id);
      callback();
    }, ms);
    this.timers.add(id);
    return id;
  }
  clearTimeout(id: ReturnType<typeof setTimeout> | undefined) {
    if (id === undefined) return;
    clearTimeout(id);
    this.timers.delete(id);
  }
  add(cleanup: () => void) {
    this.cleanups.push(cleanup);
  }
  dispose() {
    if (this.disposed) return;
    this.controller.abort();
    for (const id of this.frames) cancelAnimationFrame(id);
    for (const id of this.timers) clearTimeout(id);
    this.frames.clear();
    this.timers.clear();
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.error(error);
      }
    }
  }
}

type Handler = (...args: any[]) => unknown;
export class Emitter<Events extends { [K in keyof Events]: Handler }> {
  private handlers = new Map<keyof Events, Set<Handler>>();
  /** Where errors thrown by handlers go. One handler throwing never stops the others. */
  constructor(private onError: (error: unknown) => void = (error) => console.error(error)) {}
  on<E extends keyof Events>(event: E, handler: Events[E]): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler);
    return () => set!.delete(handler);
  }
  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>) {
    const set = this.handlers.get(event);
    if (!set) return undefined;
    let result: unknown;
    for (const handler of [...set]) {
      try {
        const value = handler(...args);
        if (value !== undefined) result = value;
      } catch (error) {
        this.onError(error);
      }
    }
    return result;
  }
  has(event: keyof Events) {
    return !!this.handlers.get(event)?.size;
  }
  clear() {
    this.handlers.clear();
  }
}
