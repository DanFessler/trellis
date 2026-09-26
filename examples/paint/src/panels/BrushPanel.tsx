import { useEffect, useRef } from "react";
import { PRESETS, StrokeEngine, type BrushSettings, type Point } from "../paint/brush";
import { hsvToRgb, type RGB } from "../paint/color";
import { app, useApp } from "../store";
import { Slider } from "../ui/Slider";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function StrokePreview({
  settings,
  rgb,
  maxSize,
  height,
}: {
  settings: BrushSettings;
  rgb: RGB;
  maxSize: number;
  height: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      if (!w) return;
      c.width = w * dpr;
      c.height = height * dpr;
      const buf = document.createElement("canvas");
      buf.width = c.width;
      buf.height = c.height;
      const bctx = buf.getContext("2d")!;
      const size = Math.min(settings.size, maxSize) * dpr;
      const engine = new StrokeEngine(bctx, { ...settings, size, smoothing: 0 }, rgb);
      const pad = size / 2 + 6 * dpr;
      const n = 90;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p: Point = {
          x: pad + (c.width - pad * 2) * t,
          y: c.height / 2 + Math.sin(t * Math.PI * 2) * (c.height / 2 - pad * 0.9) * 0.55,
          p: Math.sin(Math.PI * t) ** 0.8,
        };
        engine.add(p);
      }
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalAlpha = settings.opacity;
      ctx.drawImage(buf, 0, 0);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [settings, rgb.r, rgb.g, rgb.b, maxSize, height]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="stroke-preview" style={{ height }} />;
}

export function BrushPanel() {
  const brush = useApp((s) => s.brush);
  const preset = useApp((s) => s.preset);
  const color = useApp((s) => s.color);
  const rgb = hsvToRgb(color);
  const set = (patch: Partial<BrushSettings>) => app.setBrush(patch);
  return (
    <div className="panel brush-panel">
      <div className="preset-list" role="listbox" aria-label="Brush presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={preset === p.id}
            className="preset"
            onClick={() => app.set({ brush: { ...p.settings }, preset: p.id })}
          >
            <span className="preset-name">{p.name}</span>
            <StrokePreview settings={p.settings} rgb={rgb} maxSize={14} height={26} />
          </button>
        ))}
      </div>
      <div className="brush-live">
        <StrokePreview settings={brush} rgb={rgb} maxSize={40} height={56} />
      </div>
      <div className="sliders">
        <Slider
          label="Size"
          value={brush.size}
          min={1}
          max={400}
          curve={2.6}
          format={(v) => `${Math.round(v)} px`}
          onChange={(v) => set({ size: Math.max(1, Math.round(v)) })}
        />
        <Slider
          label="Opacity"
          value={brush.opacity}
          min={0.01}
          max={1}
          format={pct}
          onChange={(v) => set({ opacity: v })}
        />
        <Slider
          label="Flow"
          value={brush.flow}
          min={0.01}
          max={1}
          format={pct}
          onChange={(v) => set({ flow: v })}
        />
        <Slider
          label="Hardness"
          value={brush.hardness}
          min={0}
          max={1}
          format={pct}
          onChange={(v) => set({ hardness: v })}
        />
        <Slider
          label="Spacing"
          value={brush.spacing}
          min={0.02}
          max={1}
          curve={1.8}
          format={pct}
          onChange={(v) => set({ spacing: v })}
        />
        <Slider
          label="Smoothing"
          value={brush.smoothing}
          min={0}
          max={1}
          format={pct}
          onChange={(v) => set({ smoothing: v })}
        />
      </div>
      <div className="section-label">Pen pressure</div>
      <div className="toggles">
        <label className="toggle">
          <input
            type="checkbox"
            checked={brush.pressureSize}
            onChange={(e) => set({ pressureSize: e.target.checked })}
          />
          <span className="toggle-track" />
          Size
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={brush.pressureOpacity}
            onChange={(e) => set({ pressureOpacity: e.target.checked })}
          />
          <span className="toggle-track" />
          Opacity
        </label>
      </div>
    </div>
  );
}
