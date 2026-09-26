import { hsvToHex } from "../paint/color";
import { app, useApp, type Tool } from "../store";
import { BrushIcon, BucketIcon, EraserIcon, HandIcon, PipetteIcon, SwapIcon } from "../ui/icons";

export const TOOLS: { id: Tool; label: string; key: string; Icon: typeof BrushIcon }[] = [
  { id: "brush", label: "Brush", key: "B", Icon: BrushIcon },
  { id: "eraser", label: "Eraser", key: "E", Icon: EraserIcon },
  { id: "fill", label: "Paint Bucket", key: "G", Icon: BucketIcon },
  { id: "eyedropper", label: "Eyedropper", key: "I", Icon: PipetteIcon },
  { id: "hand", label: "Hand", key: "H", Icon: HandIcon },
];

export function ToolsPanel() {
  const tool = useApp((s) => s.tool);
  const color = useApp((s) => s.color);
  const secondary = useApp((s) => s.secondary);
  return (
    <div className="panel tools-panel">
      <div className="tool-grid" role="toolbar" aria-label="Tools">
        {TOOLS.map(({ id, label, key, Icon }) => (
          <button
            key={id}
            type="button"
            className="tool-btn"
            aria-pressed={tool === id}
            title={`${label} (${key})`}
            onClick={() => app.set({ tool: id })}
          >
            <Icon size={18} />
            <span className="tool-key">{key}</span>
          </button>
        ))}
      </div>
      <div className="tool-colors">
        <div className="chips">
          <button
            type="button"
            className="chip chip-secondary"
            style={{ background: hsvToHex(secondary) }}
            title="Secondary color — click to swap (X)"
            onClick={() => app.swapColors()}
          />
          <button
            type="button"
            className="chip chip-primary"
            style={{ background: hsvToHex(color) }}
            title="Primary color"
          />
          <button
            type="button"
            className="chip-swap"
            title="Swap colors (X)"
            onClick={() => app.swapColors()}
          >
            <SwapIcon size={12} />
          </button>
        </div>
        <div className="tool-colors-meta">
          <span className="mono">{hsvToHex(color).toUpperCase()}</span>
          <span className="muted">Primary</span>
        </div>
      </div>
    </div>
  );
}
