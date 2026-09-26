import { createWorkspace, layout as L, type Theme, type ViewHandle } from "@danfessler/trellis";
import "@danfessler/trellis/style.css";
import "./style.css";

// ------------------------------------------------------------------ fake telemetry
const series = new Map<string, number[]>();
function seriesFor(metric: string): number[] {
  let values = series.get(metric);
  if (!values) {
    let v = 40 + Math.random() * 30;
    values = Array.from({ length: 90 }, () => (v = Math.max(5, Math.min(95, v + (Math.random() - 0.5) * 9))));
    series.set(metric, values);
  }
  return values;
}
const listeners = new Set<() => void>();
setInterval(() => {
  for (const values of series.values()) {
    const last = values[values.length - 1];
    values.push(Math.max(5, Math.min(95, last + (Math.random() - 0.5) * 9)));
    values.shift();
  }
  listeners.forEach((fn) => fn());
}, 1000);
const tick = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const token = (name: string) =>
  getComputedStyle(document.querySelector(".trellis")!).getPropertyValue(name).trim();

const icon = (path: string) =>
  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const ICONS = {
  kpis: icon(
    '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  ),
  chart: icon('<path d="M2 13l4-5 3 3 5-7"/>'),
  log: icon('<path d="M3 4h10M3 8h10M3 12h6"/>'),
  table: icon('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 7h12M6 7v6"/>'),
  notes: icon('<path d="M4 2h6l3 3v9H4z"/><path d="M6 8h5M6 11h4"/>'),
  docs: icon('<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/>'),
};
/** "#3a6ff7" → "rgba(58, 111, 247, a)"; other formats pass through opaque. */
function alpha(color: string, a: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return a > 0 ? color : "transparent";
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
const METRICS = ["requests", "latency", "errors", "users"];
const capitalize = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

// ------------------------------------------------------------------ views
function kpis(el: HTMLElement) {
  const metrics = [
    ["Requests / s", "requests", ""],
    ["p95 latency", "latency", " ms"],
    ["Error rate", "errors", "%"],
    ["Active users", "users", "k"],
  ] as const;
  el.innerHTML = `<div class="kpis">${metrics
    .map(
      ([label, key]) =>
        `<section class="kpi" data-key="${key}"><h3>${label}</h3><strong></strong><svg viewBox="0 0 100 28" preserveAspectRatio="none"><path/></svg></section>`,
    )
    .join("")}</div>`;
  const draw = () => {
    for (const [, key, unit] of metrics) {
      const values = seriesFor(key).slice(-30);
      const node = el.querySelector<HTMLElement>(`[data-key="${key}"]`)!;
      const last = values[values.length - 1];
      const value =
        key === "errors"
          ? (last / 40).toFixed(2)
          : key === "users"
            ? (last / 3).toFixed(1)
            : Math.round(last * (key === "latency" ? 3 : 12));
      node.querySelector("strong")!.textContent = `${value}${unit}`;
      const d = values
        .map((v, i) => `${i ? "L" : "M"}${(i / (values.length - 1)) * 100} ${28 - (v / 100) * 26}`)
        .join(" ");
      node.querySelector("path")!.setAttribute("d", d);
    }
  };
  draw();
  return tick(draw);
}

function chart(el: HTMLElement, view: ViewHandle, parts: { accessory: HTMLElement }) {
  el.innerHTML = `<div class="chart"><canvas></canvas></div>`;
  parts.accessory.innerHTML = `<span class="live"><i></i>Live</span>`;
  const canvas = el.querySelector("canvas")!;
  const draw = () => {
    const { width, height } = canvas.parentElement!.getBoundingClientRect();
    if (!width || !height) return;
    const dpr = devicePixelRatio;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    // Params are read on every draw, so changing the metric needs no remount.
    const values = seriesFor(String(view.params.metric ?? "requests"));
    const pad = 24;
    ctx.strokeStyle = token("--trellis-border");
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + ((height - pad * 2) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
      ctx.stroke();
    }
    const x = (i: number) => pad + ((width - pad * 2) * i) / (values.length - 1);
    const y = (v: number) => height - pad - ((height - pad * 2) * v) / 100;
    const accent = token("--trellis-accent");
    const gradient = ctx.createLinearGradient(0, pad, 0, height - pad);
    gradient.addColorStop(0, alpha(accent, 0.32));
    gradient.addColorStop(1, alpha(accent, 0));
    const line = () => values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.beginPath();
    line();
    ctx.lineTo(x(values.length - 1), height - pad);
    ctx.lineTo(x(0), height - pad);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    line();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  const ro = new ResizeObserver(draw);
  ro.observe(canvas.parentElement!);
  const offs = [tick(draw), view.on("change", draw)];
  return () => {
    ro.disconnect();
    offs.forEach((off) => off());
  };
}

function log(el: HTMLElement, view: ViewHandle, parts: { accessory: HTMLElement }) {
  el.innerHTML = `<ol class="log"></ol>`;
  const list = el.querySelector("ol")!;
  const pause = document.createElement("button");
  pause.className = "chip";
  pause.textContent = "Pause";
  parts.accessory.append(pause);
  let paused = false;
  let unseen = 0;
  pause.onclick = () => {
    paused = !paused;
    pause.textContent = paused ? "Resume" : "Pause";
  };
  const services = ["api", "auth", "billing", "search", "worker"];
  const kinds = [
    ["info", "request completed"],
    ["info", "cache warmed"],
    ["warn", "slow query"],
    ["info", "job finished"],
    ["error", "upstream timeout"],
  ] as const;
  const add = () => {
    if (paused) return;
    const [level, message] = kinds[Math.floor(Math.random() * kinds.length)];
    const item = document.createElement("li");
    item.className = level;
    item.innerHTML = `<time>${new Date().toLocaleTimeString()}</time><b>${services[Math.floor(Math.random() * services.length)]}</b><span>${message}</span>`;
    list.prepend(item);
    while (list.children.length > 200) list.lastElementChild!.remove();
    // A badge counts events that arrived while the tab wasn't visible.
    if (!view.visible) view.setBadge(++unseen > 99 ? "99+" : unseen);
  };
  const offVisible = view.on("visibility", (visible) => {
    if (!visible) return;
    unseen = 0;
    view.setBadge(null);
  });
  for (let i = 0; i < 12; i++) add();
  const off = tick(add);
  return () => {
    off();
    offVisible();
  };
}

function regions(el: HTMLElement) {
  const rows = [
    ["us-east-1", "Healthy", 42, 118],
    ["us-west-2", "Healthy", 31, 96],
    ["eu-central-1", "Degraded", 77, 240],
    ["ap-south-1", "Healthy", 25, 132],
    ["sa-east-1", "Healthy", 18, 151],
  ] as const;
  el.innerHTML = `<table class="regions"><thead><tr><th>Region</th><th>Status</th><th>CPU</th><th>p95</th></tr></thead><tbody>${rows
    .map(
      ([r, s, cpu, p95]) =>
        `<tr><td>${r}</td><td><span class="status ${s.toLowerCase()}">${s}</span></td><td><span class="bar"><i style="width:${cpu}%"></i></span>${cpu}%</td><td>${p95} ms</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function notes(el: HTMLElement) {
  el.innerHTML = `<div class="notes"><textarea placeholder="Incident notes… this text survives docking, floating and hiding."></textarea></div>`;
}

const runbook = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><style>
body{font:14px/1.6 system-ui,sans-serif;margin:0;padding:18px 22px;color:#2a2c33;background:#fff}
h1{font-size:16px;margin:0 0 6px}code{background:#f0f1f4;padding:1px 5px;border-radius:4px;font-size:12.5px}
li{margin:6px 0}input{margin-right:8px}p{color:#6b6e78;margin:0 0 10px}</style>
<h1>Runbook: elevated latency</h1><p>This panel is an iframe. Tick a box, then move the panel. It won't reload.</p>
<ol><li><label><input type=checkbox>Check <code>eu-central-1</code> dashboards</label></li>
<li><label><input type=checkbox>Scale the <code>search</code> worker pool</label></li>
<li><label><input type=checkbox>Page the on-call database engineer</label></li></ol>`)}`;

// ------------------------------------------------------------------ workspace
const themeSelect = document.querySelector<HTMLSelectElement>("[data-action=theme]")!;
let savedTheme: Theme = "light";
try {
  savedTheme = (localStorage.getItem("ops-theme") as Theme | null) ?? "light";
} catch {
  /* storage unavailable */
}
themeSelect.value = savedTheme;
document.documentElement.dataset.theme = savedTheme;

const ws = createWorkspace(document.getElementById("app")!, {
  theme: savedTheme,
  floating: "overlay",
  navigation: "free",
  persist: { key: "trellis-ops-dashboard", version: 3 },
  types: {
    kpis: { title: "Overview", icon: ICONS.kpis, placement: "stage", closable: false, mount: kpis },
    chart: {
      title: (v) => capitalize(String(v.params.metric ?? "requests")),
      icon: ICONS.chart,
      mount: chart,
      minSize: { width: 320, height: 200 },
      menu: (view) => [
        {
          label: "Metric",
          items: METRICS.map((m) => ({
            label: capitalize(m),
            checked: view.params.metric === m,
            run: () => ws.setParams(view.id, { metric: m }),
          })),
        },
      ],
    },
    log: { title: "Events", icon: ICONS.log, mount: log },
    regions: { title: "Regions", icon: ICONS.table, singleton: true, mount: regions },
    notes: { title: "Notes", icon: ICONS.notes, singleton: true, mount: notes },
    runbook: { title: "Runbook", icon: ICONS.docs, iframe: runbook },
  },
  defaultLayout: L.row(
    [
      L.column([L.view("regions"), L.view("notes")], [3, 2]),
      L.stage(
        L.column(
          [
            L.view("kpis"),
            L.panel(
              L.view("chart", { params: { metric: "requests" } }),
              L.view("chart", { params: { metric: "latency" } }),
            ),
          ],
          [1, 2.2],
        ),
      ),
      L.column([L.view("log"), L.view("runbook")], [3, 2]),
    ],
    [1.25, 3, 1.3],
  ),
});

// ------------------------------------------------------------------ toolbar
const hiddenButton = document.querySelector<HTMLButtonElement>("[data-action=hidden]")!;
const hiddenMenu = document.querySelector<HTMLElement>(".menu")!;
function renderHidden() {
  const hidden = ws.getSnapshot().hidden;
  hiddenButton.querySelector(".count")!.textContent = String(hidden.length);
  hiddenButton.disabled = !hidden.length;
  hiddenMenu.replaceChildren(
    ...hidden.map(({ panelId, views }) => {
      const item = document.createElement("button");
      item.setAttribute("role", "menuitem");
      item.textContent = views.map((v) => v.title).join(", ");
      item.onclick = () => {
        hiddenMenu.hidden = true;
        ws.restore(panelId, { from: hiddenButton });
      };
      return item;
    }),
  );
  if (!hidden.length) hiddenMenu.hidden = true;
}
ws.on("change", renderHidden);
renderHidden();
hiddenButton.onclick = () => (hiddenMenu.hidden = !hiddenMenu.hidden);
document.addEventListener("pointerdown", (e) => {
  if (!(e.target as Element).closest(".menu-wrap")) hiddenMenu.hidden = true;
});

document.querySelector<HTMLButtonElement>("[data-action=add-chart]")!.onclick = () =>
  ws.open("chart", {
    params: { metric: METRICS[Math.floor(Math.random() * METRICS.length)] },
    placement: "float",
  });
document.querySelector<HTMLButtonElement>("[data-action=add-log]")!.onclick = () =>
  ws.open("log", { placement: "side" });
document.querySelector<HTMLButtonElement>("[data-action=reset]")!.onclick = () => ws.reset();
themeSelect.onchange = () => {
  const theme = themeSelect.value as Theme;
  try {
    localStorage.setItem("ops-theme", theme);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.dataset.theme = theme;
  ws.update({ theme });
};
(window as unknown as { ws: typeof ws }).ws = ws;
