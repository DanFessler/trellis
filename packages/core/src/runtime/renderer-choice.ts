/**
 * Chooses, per camera move, between the normal renderer (every panel laid out on every frame) and
 * the world transform (laid out once, then one transform per frame), for `worldTransform: "auto"`.
 *
 * It predicts what a normal moving frame would cost from how long layouts take on this machine:
 * - Full layouts (at rest, or the one a world-mode move draws) give a cost per panel laid out.
 * - A moving frame costs less than that, because content isn't reflowed mid-move. How much less is
 *   learned from the normal moving frames measured here.
 * - The prediction is that, times the panels on screen during the move.
 *
 * Paint and other work on the page aren't in those measurements, so late frames are a backstop:
 * two in the last four switch the move to world mode, and the next moves start in it. That
 * penalty wears off over a few moves, so the normal renderer is tried again.
 */

/** Below this many panels on screen, moves always use the normal renderer. Frames and layouts with
 * fewer aren't learned from either: a frame's fixed cost would pass for a cost per panel. */
const MIN_PANELS = 12;
/** Switch to world mode when a moving frame is predicted to take this share of a frame... */
const UP = 0.7;
/** ...and back only once it's predicted below this share, so it doesn't flip on every move. */
const DOWN = 0.35;
/** A frame is late when it arrives this many display frames after the last one... */
const LATE = 1.5;
/** ...and this long after it: visible stutter, not a variable-rate display settling at 60 Hz. */
const LATE_MS = 25;
/** A moving frame's cost per panel, as a share of a full layout's, until measured. */
const DEFAULT_RATIO = 0.5;
/** How quickly measurements replace older ones. */
const WEIGHT = 0.3;
/** How much the late-frame penalty wears off each move. */
const RECOVERY = 0.8;
/** The slowest display assumed: a page busy from its first frame shouldn't pass for a slow display. */
const SLOWEST = 1000 / 60;
/** Frame intervals kept for finding the display's frame rate. */
const INTERVALS = 240;

const ewma = (previous: number | null, sample: number) =>
  previous === null ? sample : previous + (sample - previous) * WEIGHT;
const valid = (ms: number) => Number.isFinite(ms) && ms >= 0;

export class RendererChoice {
  /** Whether moves currently use world mode. */
  world = false;
  /** Full layout cost per panel laid out, in ms. */
  private fullPerPanel: number | null = null;
  /** A normal moving frame's cost per panel, in ms, when nothing else is known. */
  private framePerPanel: number | null = null;
  /** A moving frame's cost per panel, as a share of a full layout's, as measured here. */
  private ratio = DEFAULT_RATIO;
  /** Multiplies the prediction after late frames, wearing off move by move. */
  private penalty = 1;
  private intervals: number[] = [];
  private refresh = SLOWEST;
  private panels = 0;
  private recent: boolean[] = [];

  /** The time between two animation frames, to learn the display's frame rate. */
  frameInterval(ms: number) {
    // Two renders in one frame aren't a display faster than 250 Hz.
    if (!valid(ms) || ms < 4) return;
    this.intervals.push(ms);
    if (this.intervals.length > INTERVALS) this.intervals.shift();
    // The fastest recent frames show a faster display (120 Hz, 144 Hz).
    this.refresh = Math.min(SLOWEST, ...this.intervals);
  }

  /** A layout that placed `panels` panels at new sizes took `ms`, including the browser's layout. */
  fullLayout(ms: number, panels: number) {
    if (!valid(ms) || !(panels >= MIN_PANELS)) return;
    this.fullPerPanel = ewma(this.fullPerPanel, ms / panels);
  }

  /** A frame of a move on the normal renderer, showing `panels` panels, took `ms`. */
  plainFrame(ms: number, panels: number) {
    if (!valid(ms) || !(panels >= MIN_PANELS)) return;
    const perPanel = ms / panels;
    this.framePerPanel = ewma(this.framePerPanel, perPanel);
    if (this.fullPerPanel)
      this.ratio = Math.min(4, Math.max(0.01, ewma(this.ratio, perPanel / this.fullPerPanel)));
  }

  /** What a normal moving frame is predicted to cost per panel, if anything's known. */
  private perPanel(): number | null {
    if (this.fullPerPanel !== null) return this.fullPerPanel * this.ratio;
    return this.framePerPanel;
  }

  /** A move is starting with `panels` panels on screen. Returns whether it uses world mode. */
  startMove(panels: number): boolean {
    this.panels = panels;
    this.recent = [];
    const perPanel = this.perPanel();
    if (panels < MIN_PANELS) this.world = false;
    else if (perPanel !== null) {
      const predicted = perPanel * panels * this.penalty;
      if (!this.world && predicted > UP * this.refresh) this.world = true;
      else if (this.world && predicted < DOWN * this.refresh) this.world = false;
    }
    this.penalty = Math.max(1, this.penalty * RECOVERY);
    return this.world;
  }

  /** A frame of a move on the normal renderer arrived `interval` ms after the last. Returns true
   * when the move should switch to world mode now. */
  frame(interval: number): boolean {
    if (this.world || !valid(interval) || this.panels < MIN_PANELS) return false;
    this.recent.push(interval > Math.max(LATE * this.refresh, LATE_MS));
    if (this.recent.length > 4) this.recent.shift();
    if (this.recent.filter(Boolean).length < 2) return false;
    this.world = true;
    // Make the next moves start in world mode, until the penalty wears off.
    const perPanel = this.perPanel();
    const needed = perPanel ? (UP * this.refresh * 1.5) / (perPanel * this.panels) : 1;
    this.penalty = Math.max(this.penalty * 1.5, needed);
    return true;
  }
}
