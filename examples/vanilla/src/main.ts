import { createWorkspace, layout as L } from "@danfessler/trellis";
import "@danfessler/trellis/style.css";

const note = (text: string) => (el: HTMLElement) => {
  el.innerHTML = `<div style="padding:16px"><textarea style="width:100%;height:200px">${text}</textarea></div>`;
};

const ws = createWorkspace(document.getElementById("app")!, {
  theme: "dark",
  navigation: "free",
  types: {
    doc: { title: (v) => String(v.params.name ?? "Untitled"), placement: "stage", mount: (el, v) => note(`Document ${v.params.name}`)(el) },
    layers: { title: "Layers", singleton: true, allow: { stage: false }, mount: note("layers") },
    color: { title: "Color", mount: note("color") },
    web: { title: "Web", iframe: "https://example.com" },
  },
  defaultLayout: L.row(
    [
      L.view("color"),
      L.stage(L.panel(L.view("doc", { params: { name: "a.psd" } }), L.view("doc", { params: { name: "b.psd" } }))),
      L.column([L.view("layers"), L.view("color")]),
    ],
    [1, 4, 1.4],
  ),
});
(window as any).ws = ws;
