```tsx title="Sprout.tsx"
import { Workspace, ViewType, Split, Stage, Panel, View } from "@danfessler/trellis-react";
import "@danfessler/trellis/style.css";

export function Sprout() {
  return (
    <Workspace theme="dark" floating="stage">
      <ViewType id="sketch" title="Sketch" placement="stage" render={() => <Sketch />} />
      <ViewType id="layers" title="Layers" singleton allow={{ stage: false }}>
        <Layers />
      </ViewType>
      <ViewType id="color" title="Color" singleton>
        <ColorPicker />
      </ViewType>
      <ViewType id="preview" title="Preview" iframe={(v) => String(v.params.url)} />

      <Split weights={[1, 3.4, 1.25]}>
        <Split axis="y">
          <View type="layers" />
          <View type="color" />
        </Split>
        <Stage backdrop={<DotGrid />}>
          <Panel>
            <View type="sketch" />
          </Panel>
        </Stage>
        <View type="preview" params={{ url: "/preview.html" }} />
      </Split>
    </Workspace>
  );
}
```
