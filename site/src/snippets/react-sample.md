```tsx title="App.tsx"
import { Workspace, ViewType, Split, Stage, Panel, View, useView } from "@danfessler/trellis-react";
import "@danfessler/trellis/style.css";

function Editor() {
  const view = useView<{ path: string }>();
  return <CodeEditor path={view.params.path} />; // mounted once, never remounted
}

export function App() {
  return (
    <Workspace theme="dark" navigation="free" storageKey="my-ide" version={1}>
      <ViewType id="files" title="Files" singleton allow={{ stage: false }}>
        <FileTree />
      </ViewType>
      <ViewType id="file" title={(v) => String(v.params.path)} placement="stage">
        <Editor />
      </ViewType>
      <ViewType id="preview" title="Preview" iframe="http://localhost:3000" />

      <Split weights={[1, 4]}>
        <View type="files" />
        <Stage empty={<p>Open a file to get started</p>}>
          <Panel>
            <View type="file" params={{ path: "src/index.ts" }} />
          </Panel>
        </Stage>
      </Split>
    </Workspace>
  );
}
```
