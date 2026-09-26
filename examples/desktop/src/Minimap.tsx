import { useEffect, useRef, useState } from "react";
import { useWorkspace, useWorkspaceState } from "@danfessler/trellis-react";
import type { LayoutNode, PanelNode, Rect } from "@danfessler/trellis";
import { STAGE_ID, appById, pageFor } from "./apps";
import { worldRects } from "./desktop";

const WIDTH = 232;
const TINT: Record<string, string> = {
  finder: "#3f8fd6",
  notes: "#d8ab35",
  mail: "#2f8fe6",
  calendar: "#d65b56",
  photos: "#b9a7d8",
  spotify: "#2bb45f",
};

function panelsOf(node: LayoutNode | null | undefined): PanelNode[] {
  if (!node) return [];
  if (node.kind === "panel") return [node];
  if (node.kind === "stage") return panelsOf(node.child);
  return node.children.flatMap(panelsOf);
}

/**
 * Layout from the workspace snapshot (React), plus the live camera drawn imperatively from
 * `ws.on("camera")` so zoom/pan gestures are tracked every frame without re-rendering.
 */
export function Minimap({ wallpaper }: { wallpaper: string }) {
  const ws = useWorkspace();
  const state = useWorkspaceState();
  const [aspect, setAspect] = useState(0.6);
  useEffect(() => {
    const el = ws.element;
    const measure = () => el.clientWidth && setAspect(el.clientHeight / el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ws]);

  const H = Math.round(WIDTH * aspect);
  const cameraEl = useRef<SVGRectElement>(null);
  useEffect(() => {
    const draw = (r: Rect) => {
      const el = cameraEl.current;
      if (!el) return;
      el.setAttribute("x", String(r.x * WIDTH + 0.75));
      el.setAttribute("y", String(r.y * H + 0.75));
      el.setAttribute("width", String(Math.max(1, r.w * WIDTH - 1.5)));
      el.setAttribute("height", String(Math.max(1, r.h * H - 1.5)));
    };
    draw(ws.navigation.camera);
    return ws.on("camera", draw);
  }, [ws, H]);
  const doc = state.document;
  const rects = worldRects(doc.root);
  const toMap = (r: Rect, pad = 1.5) => ({
    x: r.x * WIDTH + pad,
    y: r.y * H + pad,
    width: Math.max(1, r.w * WIDTH - pad * 2),
    height: Math.max(1, r.h * H - pad * 2),
  });
  const stage = rects.get(STAGE_ID) ?? { x: 0, y: 0, w: 1, h: 1 };
  const stageMap = toMap(stage, 1);
  const focusedPanel = state.focusedPanel;

  const label = (panel: PanelNode) => {
    const record = doc.views[panel.selected];
    const app = record && appById(record.type);
    return app ? pageFor(app, record.params).heading : (record?.title ?? "");
  };
  const tile = (panel: PanelNode, r: Rect, floating: boolean) => {
    const type = doc.views[panel.selected]?.type ?? "";
    const m = toMap(r, floating ? 0.75 : 1.5);
    return (
      <g
        key={panel.id}
        className="minimap-tile"
        data-focused={focusedPanel === panel.id ? "" : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (floating) ws.focus(panel.selected);
          else ws.navigation.frame(panel.id);
        }}
      >
        <title>{label(panel)}</title>
        <rect {...m} rx={2.5} fill={TINT[type] ?? "#77777f"} />
        <rect {...m} height={Math.min(m.height, 3.5)} rx={1.5} className="minimap-tile-bar" />
      </g>
    );
  };

  const floats = [...doc.floating].sort((a, b) => a.z - b.z);
  return (
    <aside className="minimap" aria-label="Workspace minimap">
      <div className="minimap-label">
        <span>Workspace</span>
        <span>{state.framed ? (state.framed === STAGE_ID ? "Desktop" : "Framed") : "Overview"}</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${H}`}
        width={WIDTH}
        height={H}
        onClick={() => ws.navigation.overview()}
        role="img"
      >
        <defs>
          <clipPath id="minimap-stage">
            <rect {...stageMap} rx={3} />
          </clipPath>
        </defs>
        <rect x={0} y={0} width={WIDTH} height={H} rx={4} className="minimap-bg" />
        <image
          href={wallpaper}
          {...stageMap}
          preserveAspectRatio="xMidYMid slice"
          clipPath="url(#minimap-stage)"
          className="minimap-wallpaper"
          onClick={(e) => {
            e.stopPropagation();
            ws.navigation.frame("stage");
          }}
        />
        {panelsOf(doc.root).map((p) => tile(p, rects.get(p.id)!, false))}
        <g clipPath="url(#minimap-stage)">
          {floats.map((f) => {
            const c = f.layer === "stage" ? stage : { x: 0, y: 0, w: 1, h: 1 };
            return tile(
              f.panel,
              { x: c.x + f.rect.x * c.w, y: c.y + f.rect.y * c.h, w: f.rect.w * c.w, h: f.rect.h * c.h },
              true,
            );
          })}
        </g>
        <rect ref={cameraEl} className="minimap-frame" rx={3.5} />
      </svg>
    </aside>
  );
}
