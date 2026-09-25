```ts title="main.ts"
import { createWorkspace, layout as L } from "@danfessler/trellis";
import "@danfessler/trellis/style.css";

const ws = createWorkspace(document.getElementById("app")!, {
  theme: "dark",
  navigation: "free",
  persist: { key: "my-ide", version: 1 },
  types: {
    files: { title: "Files", singleton: true, allow: { stage: false }, mount: mountFileTree },
    file: {
      title: (view) => String(view.params.path),
      placement: "stage",
      mount(element, view) {
        const editor = createEditor(element, view.params.path);
        view.on("resize", () => editor.layout()); // fires once motion settles
        return () => editor.dispose();
      },
    },
    preview: { title: "Preview", iframe: "http://localhost:3000" },
  },
  defaultLayout: L.row(
    [L.view("files"), L.stage(L.panel(L.view("file", { params: { path: "src/index.ts" } })))],
    [1, 4],
  ),
});

ws.open("file", { params: { path: "README.md" }, reuse: "params" });
```
