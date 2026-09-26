import { useEffect, useState } from "react";
import { useView } from "@danfessler/trellis-react";
import { RefreshIcon } from "./icons";
import { vfs } from "./vfs";

/**
 * The preview is a real iframe view type. Its URL is a stable blob that boots once; the project is
 * streamed in over postMessage. CSS edits patch a <style> tag, HTML/JS edits re-render the body —
 * the frame itself never reloads, and because Trellis never re-parents view content, docking,
 * tabbing, floating or maximizing the panel doesn't reload it either.
 */
const BOOT = `<!doctype html><html><head><meta charset="utf-8"><style id="__css"></style>
<style>#__err{position:fixed;left:10px;right:10px;bottom:10px;padding:10px 12px;border-radius:8px;background:#3b1219;color:#ffb4bf;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;z-index:99999}</style>
</head><body><script>
(function () {
  window.__bootId = Math.random().toString(36).slice(2);
  window.__bootedAt = Date.now();
  window.__renders = 0;
  var timers = [];
  var si = window.setInterval, st = window.setTimeout;
  window.setInterval = function () { var id = si.apply(window, arguments); timers.push(id); return id; };
  window.setTimeout = function () { var id = st.apply(window, arguments); timers.push(id); return id; };
  var lastKey = null;
  function showError(err) {
    var el = document.createElement("div"); el.id = "__err"; el.textContent = String(err && err.stack || err);
    document.body.appendChild(el);
  }
  addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.type !== "pulse:render") return;
    document.getElementById("__css").textContent = d.css;
    document.title = d.title || "Preview";
    var key = d.body + "\\u0000" + d.js;
    if (key === lastKey) return;
    lastKey = key;
    timers.forEach(function (id) { clearInterval(id); clearTimeout(id); });
    timers = [];
    document.body.innerHTML = d.body;
    try { new Function(d.js)(); } catch (err) { showError(err); }
    window.__renders++;
  });
  window.addEventListener("error", function (e) { showError(e.error || e.message); });
  parent.postMessage({ type: "pulse:ready" }, "*");
})();
</script></body></html>`;

export const PREVIEW_URL = URL.createObjectURL(new Blob([BOOT], { type: "text/html" }));

function resolve(from: string, href: string) {
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  return (base + href).replace(/^\.\//, "").replace(/\/\.\//g, "/");
}

export function composePreview(entry = "index.html") {
  const html =
    vfs.read(entry) ??
    "<p style='font:14px system-ui;color:#888;padding:24px'>No index.html in this project.</p>";
  let css = "";
  let js = "";
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  for (const m of head.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/gi))
    if (/stylesheet/.test(m[0])) css += (vfs.read(resolve(entry, m[1])) ?? "") + "\n";
  for (const m of head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += m[1] + "\n";
  const title = head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "Preview";
  let body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  body = body.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (_, attrs: string, inline: string) => {
    const src = attrs.match(/src="([^"]+)"/)?.[1];
    js +=
      (src ? (vfs.read(resolve(entry, src)) ?? `console.error("Missing script: ${src}")`) : inline) + "\n;\n";
    return "";
  });
  return { type: "pulse:render", css, body, js, title };
}

const frames = new Set<Window>();
function send(target: Window) {
  try {
    target.postMessage(composePreview(), "*");
  } catch {
    frames.delete(target);
  }
}
let timer: ReturnType<typeof setTimeout> | undefined;
if (typeof window !== "undefined") {
  window.addEventListener("message", (e) => {
    if (e.data?.type === "pulse:ready" && e.source) {
      frames.add(e.source as Window);
      send(e.source as Window);
    }
  });
  vfs.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const f of frames) {
        if (f.closed) frames.delete(f);
        else send(f);
      }
    }, 90);
  });
}

function frameOf(viewId: string): HTMLIFrameElement | null {
  return document.querySelector(`[data-trellis-content="${CSS.escape(viewId)}"] iframe`);
}

function uptime(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Tab accessory: "live" indicator with the frame's uptime (proves it never reloads) and a reload button. */
export function PreviewAccessory() {
  const view = useView();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const win = frameOf(view.id)?.contentWindow as (Window & { __bootedAt?: number }) | null | undefined;
  const bootedAt = win?.__bootedAt;
  return (
    <span className="accessory-text">
      <span className="live-dot" />
      <span
        className="collapsible"
        title="Time since this iframe last loaded. Move the panel around — it keeps counting."
      >
        {bootedAt ? `live · up ${uptime(Date.now() - bootedAt)}` : "loading…"}
      </span>
      <button
        className="icon-btn small"
        title="Reload preview"
        onClick={() => {
          frameOf(view.id)?.contentWindow?.location.reload();
        }}
      >
        <RefreshIcon size={14} />
      </button>
    </span>
  );
}
