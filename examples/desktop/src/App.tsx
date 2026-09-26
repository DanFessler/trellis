import { useEffect, useState } from "react";
import {
  Stage,
  ViewType,
  Workspace,
  WorkspaceProvider,
  useOptionalWorkspace,
  useWorkspace,
  type ViewHandle,
} from "@danfessler/trellis-react";
import type { MenuEntry, WorkspaceHandle } from "@danfessler/trellis";
import { APPS, DEFAULT_FOLDER, STAGE_ID, pageFor, type AppDefinition, type AppParams } from "./apps";
import { AppFrame, AppIcon, WindowControls } from "./AppWindow";
import { Bar } from "./Bar";
import { desktopSize, floatOnDesktop, isZoomed, launch, minimize, zoom } from "./desktop";
import { Minimap } from "./Minimap";
import { Wallpaper } from "./Wallpaper";

// Absolute, so the url() in the --wallpaper custom property doesn't resolve against the CSS file.
const WALLPAPER = new URL(`${import.meta.env.BASE_URL}wallpapers/sierra-dusk.jpg`, document.baseURI).href;

/** Right-click a title bar. Replaces the built-in panel menu so "Minimize" can fly into the dock. */
function windowMenu(view: ViewHandle<AppParams>): MenuEntry[] {
  const ws = view.workspace;
  const app = APPS.find((a) => a.id === view.type);
  const name = app ? pageFor(app, view.params).heading : view.title;
  const floating = view.placement === "floating";
  const zoomed = isZoomed(ws, view.id);
  return [
    { label: "Minimize to Dock", run: () => minimize(ws, view.id) },
    { label: zoomed ? "Restore Size" : floating ? "Fill Desktop" : "Maximize", run: () => zoom(ws, view.id) },
    floating
      ? {
          label: "Dock Beside Desktop",
          run: () => ws.dock(view.id, { beside: STAGE_ID, edge: "left", share: 0.3 }),
        }
      : { label: "Float on Desktop", run: () => floatOnDesktop(ws, view.id) },
    "separator",
    { label: `Close ${name}`, run: () => void view.close() },
  ];
}

/** First run: a couple of windows so the desktop isn't empty. One boot per workspace instance. */
const booted = new WeakSet<WorkspaceHandle>();
function boot(ws: WorkspaceHandle) {
  const [finder, notes] = [APPS[0], APPS[1]];
  const desk = desktopSize(ws);
  // Leave the desktop folders (top right) uncovered and overlap the two windows a little.
  const notesW = Math.min(notes.size.w, desk.w * 0.86);
  launch(ws, finder, { folder: DEFAULT_FOLDER }, { x: desk.w * 0.06, y: desk.h * 0.07 });
  launch(ws, notes, undefined, { x: Math.max(desk.w * 0.2, desk.w - notesW - 140), y: desk.h * 0.26 });
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

/** The bottom bar lives outside the workspace; <WorkspaceProvider> lets it use Trellis's hooks. */
function BottomBar({ map, onToggleMap }: { map: boolean; onToggleMap(): void }) {
  const ws = useOptionalWorkspace();
  if (!ws) return null;
  return (
    <Bar
      map={map}
      onToggleMap={onToggleMap}
      onReset={() => {
        ws.reset();
        boot(ws);
      }}
    />
  );
}

export function App() {
  const [map, setMap] = useState(true);
  return (
    <WorkspaceProvider>
      <div className="shell" style={{ "--wallpaper": `url("${WALLPAPER}")` } as React.CSSProperties}>
        <main className="shell-workspace">
          <Workspace theme="dark" floating="stage" navigation="free" panelMenu={false} label="Desktop">
            {APPS.map(appType)}
            <Stage id={STAGE_ID} backdrop={<Wallpaper />} />
            <Workspace.Chrome>
              <Boot />
              {map && <Minimap wallpaper={WALLPAPER} />}
            </Workspace.Chrome>
          </Workspace>
        </main>
        <footer className="shell-bar">
          <BottomBar map={map} onToggleMap={() => setMap((m) => !m)} />
        </footer>
      </div>
    </WorkspaceProvider>
  );
}
