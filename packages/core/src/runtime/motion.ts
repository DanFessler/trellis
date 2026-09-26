import type { Rect } from "../model/types";

/** Spring and tween constants for the camera and layout motion. */
export const MOTION = {
  spring: { stiffness: 210, damping: 29, maxStep: 0.032, epsilon: 0.0001 },
  layoutMs: 460,
  pickupMs: 280,
  appearMs: 220,
};

export const easeOutQuint = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 5;

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  };
}

/** A critically-damped-ish spring over a rect. Deterministic: step(dt). */
export class RectSpring {
  value: Rect;
  target: Rect;
  velocity: Rect = { x: 0, y: 0, w: 0, h: 0 };
  constructor(initial: Rect) {
    this.value = { ...initial };
    this.target = { ...initial };
  }
  get moving() {
    return !sameRect(this.value, this.target) || !isZero(this.velocity);
  }
  /** Returns true while still moving. */
  step(dt: number): boolean {
    const { stiffness, damping, maxStep, epsilon } = MOTION.spring;
    dt = Math.min(dt || 0.016, maxStep);
    let error = 0;
    for (const key of ["x", "y", "w", "h"] as const) {
      this.velocity[key] +=
        ((this.target[key] - this.value[key]) * stiffness - this.velocity[key] * damping) * dt;
      this.value[key] += this.velocity[key] * dt;
      error += Math.abs(this.target[key] - this.value[key]) + Math.abs(this.velocity[key]) * 0.1;
    }
    if (error <= epsilon) {
      this.finish();
      return false;
    }
    return true;
  }
  finish() {
    this.value = { ...this.target };
    this.velocity = { x: 0, y: 0, w: 0, h: 0 };
  }
  jump(rect: Rect) {
    this.target = { ...rect };
    this.finish();
  }
}

export function sameRect(a: Rect, b: Rect, epsilon = 1e-9) {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.w - b.w) < epsilon &&
    Math.abs(a.h - b.h) < epsilon
  );
}
function isZero(r: Rect) {
  return sameRect(r, { x: 0, y: 0, w: 0, h: 0 });
}

/** Per-element transitions from a captured screen rect to a live target. */
export class LayoutTween {
  from = new Map<string, Rect>();
  start = 0;
  progress = 1;
  begin(from: Map<string, Rect>, now: number) {
    this.from = from;
    this.start = now;
    this.progress = from.size ? 0 : 1;
  }
  step(now: number, duration = MOTION.layoutMs) {
    const elapsed = duration > 0 ? (now - this.start) / duration : 1;
    this.progress = easeOutQuint(elapsed);
    if (elapsed >= 1) this.stop();
    return this.progress < 1;
  }
  stop() {
    this.progress = 1;
    this.from.clear();
  }
  get active() {
    return this.progress < 1;
  }
  apply(id: string, target: Rect): Rect {
    const from = this.from.get(id);
    return from && this.progress < 1 ? lerpRect(from, target, this.progress) : target;
  }
}

/** A CSS cubic-bezier timing function, for animations driven per frame. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const sample = (a: number, b: number, t: number) =>
    ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      const v = sample(x1, x2, t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sample(y1, y2, t);
  };
}
/** The minimize/restore curve and durations. */
export const DOCK_EASE = cubicBezier(0.2, 0.75, 0.2, 1);
export const DOCK_MS = { hide: 300, restore: 380 };
