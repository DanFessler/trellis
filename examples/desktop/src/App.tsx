import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Stage, ViewType, Workspace, useWorkspace, type ViewHandle } from "@danfessler/trellis-react";
import type { MenuEntry, WorkspaceHandle } from "@danfessler/trellis";
import { APPS, DEFAULT_FOLDER, STAGE_ID, pageFor, type AppDefinition, type AppParams } from "./apps";
import { AppFrame, AppIcon, WindowControls } from "./AppWindow";
import { Bar } from "./Bar";
import { floatOnDesktop, isZoomed, launch, minimize, zoom } from "./desktop";
import { Minimap } from "./Minimap";
import { Wallpaper } from "./Wallpaper";

const WALLPAPER = `${import.meta.env.BASE_URL}wallpapers/sierra-dusk.jpg`;

/** Right-click a title bar. Replaces the built-in panel menu so "Minimize" can fly into the dock. */
function windowMenu(view: ViewHandle<AppParams>): MenuEntry[] {
  const ws = view.workspace;
  const floating = view.placement === "floating";
  const zoomed = isZoomed(ws, view.id);
  return [
    { label: "Minimize to Dock", run: () => minimize(ws, view.id) },
    { label: zoomed ? "Restore Size" : floating ? "Fill Desktop" : "Maximize", run: () => zoom(ws, view.id) },
    floating
      ? { label: "Dock Beside Desktop", run: () => ws.dock(view.id, { beside: STAGE_ID, edge: "left", share: 0.3 }) }
      : { label: "Float on Desktop", run: () => floatOnDesktop(ws, view.id) },
    "separator",
    { label: `Close ${view.title}`, run: () => void view.close() },
  ];
}

/** First run: a couple of windows so the desktop isn't empty. One boot per workspace instance. */
const booted = new WeakSet<WorkspaceHandle>();
function boot(ws: WorkspaceHandle) {
  const [finder, notes] = [APPS[0], APPS[1]];
  launch(ws, finder, { folder: DEFAULT_FOLDER }, { x: 88, y: 56 });
  launch(ws, notes, undefined, { x: 548, y: 214 });
}
function Boot() {
  const ws = useWorkspace();
  useEffect(() => {
    if (booted.has(ws)) return;
    booted.add(ws);
    if (!ws.getSnapshot().views.length) boot(ws);
  }, [ws]);
  return null;
}

function appType(app: AppDefinition) {
  return (
    <ViewType<AppParams>
      key={app.id}
      id={app.id}
      title={(v) => pageFor(app, v.params).heading}
      placement="float"
      singleton={app.singleton}
      minSize={{ width: 340, height: 260 }}
      icon={<AppIcon app={app} className="tab-app-icon" />}
      accessory={<WindowControls app={app} />}
      menu={windowMenu}
      className={`app-surface app-surface-${app.id}`}
      render={() => <AppFrame app={app} />}
    />
  );
}

export function App() {
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const [map, setMap] = useState(true);
  const [ws, setWs] = useState<WorkspaceHandle | null>(null);
  return (
    <div className="shell" style={{ "--wallpaper": `url("${WALLPAPER}")` } as React.CSSProperties}>
      <main className="shell-workspace">
        <Workspace
          ref={setWs}
          theme="dark"
          floating="stage"
          navigation="free"
          panelMenu={false}
          label="Desktop"
        >
          {APPS.map(appType)}
          <Stage id={STAGE_ID} backdrop={<Wallpaper />} />
          <Workspace.Chrome>
            <Boot />
            {map && <Minimap wallpaper={WALLPAPER} />}
            {bar &&
              createPortal(
                <Bar
                  map={map}
                  onToggleMap={() => setMap((m) => !m)}
                  onReset={() => {
                    if (!ws) return;
                    ws.reset();
                    boot(ws);
                  }}
                />,
                bar,
              )}
          </Workspace.Chrome>
        </Workspace>
      </main>
      <footer className="shell-bar" ref={setBar} />
    </div>
  );
}
