# @danfessler/trellis-react

React components and hooks for Trellis. Requires React 18.3+ and `@danfessler/trellis`.

```sh
npm install @danfessler/trellis-react @danfessler/trellis
```

```tsx
import { Workspace, ViewType, Split, Stage, View } from "@danfessler/trellis-react";
import "@danfessler/trellis/style.css";

<Workspace theme="dark">
  <ViewType id="notes" title="Notes"><Notes /></ViewType>
  <Split weights={[1, 3]}>
    <View type="notes" />
    <Stage />
  </Split>
</Workspace>;
```

Documentation, guides and examples: https://github.com/DanFessler/trellis

## License

Free for non-commercial use; commercial use requires an active GitHub Sponsorship at the applicable tier or an enterprise license. See LICENSE.md.
