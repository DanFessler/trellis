/** The demo project: "Pulse", a tiny focus timer. Everything lives in memory. */
export const PROJECT_NAME = "pulse";

export const SEED: Record<string, string> = {
  "README.md": `# Pulse

A tiny, dependency-free focus timer. Work in short, deliberate sprints
and let Pulse keep count.

## Getting started

\`\`\`sh
npm install
npm run dev
\`\`\`

Open **index.html** in the preview panel — edits to \`styles.css\`
apply instantly, without reloading the page.

## Project layout

- \`index.html\` — the page shell
- \`src/app.js\` — wires the timer to the DOM
- \`src/timer.ts\` — the timer state machine
- \`src/format.ts\` — duration formatting helpers
- \`src/styles.css\` — all of the styling

## Roadmap

1. Custom session lengths
2. Keyboard shortcuts
3. A gentle chime when a sprint ends
`,

  "package.json": `{
  "name": "pulse",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vite": "^7.3.0",
    "vitest": "^3.2.0"
  }
}
`,

  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
`,

  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Pulse</title>
    <link rel="stylesheet" href="src/styles.css" />
  </head>
  <body>
    <main class="card">
      <header>
        <span class="dot"></span>
        <h1>Pulse</h1>
        <span class="round" id="round">Sprint 1</span>
      </header>

      <div class="ring">
        <svg viewBox="0 0 120 120">
          <circle class="track" cx="60" cy="60" r="52" />
          <circle class="progress" id="progress" cx="60" cy="60" r="52" />
        </svg>
        <output id="clock">25:00</output>
      </div>

      <div class="controls">
        <button id="toggle" class="primary">Start</button>
        <button id="reset">Reset</button>
      </div>

      <p class="tally">Completed today: <strong id="done">0</strong></p>
    </main>
    <script src="src/app.js"></script>
  </body>
</html>
`,

  "src/styles.css": `:root {
  --bg: #0f1117;
  --card: #171a23;
  --text: #e8eaf0;
  --muted: #8a90a2;
  --accent: #7c9cff;
  --ring: #252a38;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 30% 20%, #1b2030, var(--bg));
  color: var(--text);
  font: 14px/1.5 Inter, system-ui, sans-serif;
}

.card {
  width: 260px;
  padding: 20px 22px 18px;
  border-radius: 18px;
  background: var(--card);
  box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.6);
}

header {
  display: flex;
  align-items: center;
  gap: 8px;
}

h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent);
}

.round {
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
}

.ring {
  position: relative;
  margin: 18px auto 14px;
  width: 150px;
}

.ring svg {
  display: block;
  transform: rotate(-90deg);
}

.track,
.progress {
  fill: none;
  stroke-width: 7;
}

.track {
  stroke: var(--ring);
}

.progress {
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-dasharray: 327;
  transition: stroke-dashoffset 0.4s ease;
}

output {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font: 600 28px/1 "JetBrains Mono", monospace;
  letter-spacing: -0.02em;
}

.controls {
  display: flex;
  gap: 8px;
}

button {
  flex: 1;
  padding: 8px 0;
  border: 1px solid var(--ring);
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}

button.primary {
  border-color: transparent;
  background: var(--accent) !important;
  color: #0b0d14;
  font-weight: 600;
}

.tally {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
`,

  "src/app.js": `// Pulse — wires the timer to the page.
const SPRINT = 25 * 60;
const CIRCUMFERENCE = 327;

let remaining = SPRINT;
let running = false;
let done = 0;

const clock = document.getElementById("clock");
const progress = document.getElementById("progress");
const toggle = document.getElementById("toggle");
const round = document.getElementById("round");

function format(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return m + ":" + s;
}

function render() {
  clock.textContent = format(remaining);
  progress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - remaining / SPRINT));
  toggle.textContent = running ? "Pause" : "Start";
  round.textContent = "Sprint " + (done + 1);
  document.getElementById("done").textContent = String(done);
}

setInterval(() => {
  if (!running) return;
  // Demo speed: one tick is ten seconds.
  remaining = Math.max(0, remaining - 10);
  if (remaining === 0) {
    running = false;
    done += 1;
    remaining = SPRINT;
  }
  render();
}, 1000);

toggle.addEventListener("click", () => {
  running = !running;
  render();
});

document.getElementById("reset").addEventListener("click", () => {
  running = false;
  remaining = SPRINT;
  render();
});

render();
`,

  "src/timer.ts": `import { formatDuration } from "./format";
import type { TimerState, TimerEvent, Listener } from "./types";

/** A small, deterministic timer state machine. */
export class Timer {
  private state: TimerState;
  private listeners = new Set<Listener>();
  private handle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly length: number) {
    this.state = { status: "idle", remaining: length, rounds: 0 };
  }

  get snapshot(): TimerState {
    return this.state;
  }

  get label(): string {
    return formatDuration(this.state.remaining);
  }

  start() {
    if (this.state.status == "running") return;
    this.dispatch({ type: "start" });
    this.handle = setInterval(() => this.dispatch({ type: "tick" }), 1000);
  }

  pause() {
    this.stop();
    this.dispatch({ type: "pause" });
  }

  reset() {
    this.stop();
    this.dispatch({ type: "reset" });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private stop() {
    if (this.handle !== null) clearInterval(this.handle);
    this.handle = null;
  }

  private dispatch(event: TimerEvent) {
    this.state = reduce(this.state, event, this.length);
    console.log("timer", event.type, this.state);
    for (const listener of this.listeners) listener(this.state);
  }
}

export function reduce(state: TimerState, event: TimerEvent, length: number): TimerState {
  switch (event.type) {
    case "start":
      return { ...state, status: "running" };
    case "pause":
      return { ...state, status: "paused" };
    case "reset":
      return { status: "idle", remaining: length, rounds: state.rounds };
    case "tick": {
      const remaining = Math.max(0, state.remaining - 1);
      if (remaining > 0) return { ...state, remaining };
      // TODO: play a chime when a round completes
      return { status: "idle", remaining: length, rounds: state.rounds + 1 };
    }
  }
}
`,

  "src/format.ts": `const MINUTE = 60;
const HOUR = 60 * MINUTE;

/** 1500 → "25:00", 3725 → "1:02:05" */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / HOUR);
  const m = Math.floor((seconds % HOUR) / MINUTE);
  const s = seconds % MINUTE;
  const mm = String(m).padStart(h ? 2 : 2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? \`\${h}:\${mm}:\${ss}\` : \`\${mm}:\${ss}\`;
}

/** A friendly relative label, e.g. "in 5 min". */
export function describe(seconds: number): string {
  if (seconds < MINUTE) return "less than a minute";
  const minutes = Math.round(seconds / MINUTE);
  return \`in \${minutes} min\`;
}

export const parseDuration = (input: any): number => {
  const [m, s = "0"] = String(input).split(":");
  return Number(m) * MINUTE + Number(s);
};
`,

  "src/types.ts": `export type TimerStatus = "idle" | "running" | "paused";

export interface TimerState {
  status: TimerStatus;
  /** Seconds left in the current round. */
  remaining: number;
  /** Completed rounds. */
  rounds: number;
}

export type TimerEvent =
  | { type: "start" }
  | { type: "pause" }
  | { type: "reset" }
  | { type: "tick" };

export type Listener = (state: TimerState) => void;
`,

  "src/timer.test.ts": `import { describe, expect, it } from "vitest";
import { reduce } from "./timer";

const idle = { status: "idle" as const, remaining: 3, rounds: 0 };

describe("reduce", () => {
  it("counts down on tick", () => {
    expect(reduce(idle, { type: "tick" }, 3).remaining).toBe(2);
  });

  it("completes a round at zero", () => {
    const last = { ...idle, remaining: 1 };
    expect(reduce(last, { type: "tick" }, 3)).toEqual({ status: "idle", remaining: 3, rounds: 1 });
  });
});
`,
};

/** Files open in the stage on first run. */
export const INITIAL_EDITORS = ["src/timer.ts", "src/styles.css"];
