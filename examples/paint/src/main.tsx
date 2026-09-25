import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Workspace, ViewType, Split, Stage, Panel, View, useView, useWorkspace } from "@danfessler/trellis-react";
import "@danfessler/trellis/style.css";

function Counter() {
  const view = useView<{ name: string }>();
  const [n, setN] = useState(0);
  return (
    <div style={{ padding: 16 }}>
      <h3>{view.params.name}</h3>
      <button onClick={() => setN(n + 1)}>clicked {n}</button>
      <p>{view.size.width}×{view.size.height} {view.focused ? "focused" : ""}</p>
    </div>
  );
}
function Opener() {
  const ws = useWorkspace();
  return <div style={{ padding: 16 }}><button onClick={() => ws.open("doc", { params: { name: "new" } })}>Open</button></div>;
}
function App() {
  return (
    <div style={{ height: "100vh" }}>
      <Workspace theme="dark" navigation="free">
        <ViewType id="doc" title={(v) => String(v.params.name)} placement="stage" render={() => <Counter />} />
        <ViewType id="tools" title="Tools" allow={{ stage: false }}><Opener /></ViewType>
        <Split weights={[1, 4]}>
          <View type="tools" />
          <Stage empty={<p>Nothing open</p>}>
            <Panel>
              <View type="doc" params={{ name: "a" }} />
              <View type="doc" params={{ name: "b" }} />
            </Panel>
          </Stage>
        </Split>
      </Workspace>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
