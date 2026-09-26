# @danfessler/trellis

The framework-agnostic core of Trellis: dockable, zoomable workspaces for web tools.

Install it:

```sh
npm install @danfessler/trellis
```

Create a workspace in an element:

```ts
import { createWorkspace, layout as L } from "@danfessler/trellis";
import "@danfessler/trellis/style.css";

const ws = createWorkspace(element, {
  types: { notes: { title: "Notes", mount: (el) => void (el.innerHTML = "<textarea></textarea>") } },
  defaultLayout: L.row([L.view("notes"), L.stage()], [1, 3]),
});
```

Documentation, guides and examples are in the [Trellis repository](https://github.com/DanFessler/trellis).

## License

Free for non-commercial use. Commercial use requires an active GitHub Sponsorship at the applicable tier or an enterprise license. See [LICENSE.md](LICENSE.md).
