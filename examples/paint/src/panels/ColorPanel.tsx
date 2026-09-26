import { useEffect, useRef, useState, type PointerEvent } from "react";
import { hexToHsv, hsvToHex, hsvToRgb, luminance, type HSV } from "../paint/color";
import { app, useApp } from "../store";

const SWATCHES = [
  "#16161a",
  "#3d3d45",
  "#7b7d88",
  "#c5c7cf",
  "#ffffff",
  "#e5484d",
  "#f76b15",
  "#ffb224",
  "#ffe066",
  "#8bd450",
  "#30a46c",
  "#12a594",
  "#0ea5c6",
  "#3e63dd",
  "#6e56cf",
  "#ab4aba",
  "#e93d82",
  "#8e4e3a",
  "#d8a47f",
  "#26344d",
];

function useDrag(onPoint: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const apply = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onPoint(
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    );
  };
  return {
    ref,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      apply(e);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) apply(e);
    },
  };
}

export function ColorPanel() {
  const color = useApp((s) => s.color);
  const recent = useApp((s) => s.recent);
  const set = (patch: Partial<HSV>) => app.setColor({ ...app.get().color, ...patch });
  const sv = useDrag((x, y) => set({ s: x, v: 1 - y }));
  const hue = useDrag((x) => set({ h: Math.min(359.9, x * 360) }));
  const hex = hsvToHex(color);
  const rgb = hsvToRgb(color);
  const [draft, setDraft] = useState(hex);
  useEffect(() => setDraft(hex), [hex]);
  const commit = () => {
    const next = hexToHsv(draft, color.h);
    if (next) app.setColor(next);
    else setDraft(hex);
  };
  const pure = hsvToHex({ h: color.h, s: 1, v: 1 });

  return (
    <div className="panel color-panel">
      <div
        className="sv-box"
        {...sv}
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})`,
        }}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuetext={`saturation ${Math.round(color.s * 100)}%, brightness ${Math.round(color.v * 100)}%`}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.1 : 0.02;
          const m: Record<string, Partial<HSV>> = {
            ArrowLeft: { s: Math.max(0, color.s - d) },
            ArrowRight: { s: Math.min(1, color.s + d) },
            ArrowUp: { v: Math.min(1, color.v + d) },
            ArrowDown: { v: Math.max(0, color.v - d) },
          };
          if (m[e.key]) {
            e.preventDefault();
            set(m[e.key]);
          }
        }}
      >
        <div
          className="sv-thumb"
          style={{
            left: `${color.s * 100}%`,
            top: `${(1 - color.v) * 100}%`,
            background: hex,
            borderColor: luminance(rgb) > 0.5 ? "#111" : "#fff",
          }}
        />
      </div>
      <div
        className="hue-strip"
        {...hue}
        role="slider"
        aria-label="Hue"
        aria-valuenow={Math.round(color.h)}
        aria-valuemin={0}
        aria-valuemax={360}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = e.key === "ArrowRight" ? 2 : e.key === "ArrowLeft" ? -2 : 0;
          if (d) {
            e.preventDefault();
            set({ h: (color.h + d * (e.shiftKey ? 5 : 1) + 360) % 360 });
          }
        }}
      >
        <div className="hue-thumb" style={{ left: `${(color.h / 360) * 100}%`, background: pure }} />
      </div>
      <div className="color-fields">
        <div className="color-preview" style={{ background: hex }} />
        <label className="field field-hex">
          <span>HEX</span>
          <input
            value={draft.replace("#", "").toUpperCase()}
            spellCheck={false}
            maxLength={7}
            onChange={(e) => setDraft("#" + e.target.value.replace("#", ""))}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          />
        </label>
        <div className="rgb-read mono">
          <span>
            <i>R</i>
            {rgb.r}
          </span>
          <span>
            <i>G</i>
            {rgb.g}
          </span>
          <span>
            <i>B</i>
            {rgb.b}
          </span>
        </div>
      </div>
      <div className="section-label">Swatches</div>
      <div className="swatches">
        {SWATCHES.map((s) => (
          <button
            key={s}
            type="button"
            className="swatch"
            style={{ background: s }}
            aria-pressed={s === hex}
            title={s.toUpperCase()}
            onClick={() => app.setColor(hexToHsv(s, color.h)!)}
          />
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <div className="section-label">Recent</div>
          <div className="swatches">
            {recent.map((s) => (
              <button
                key={s}
                type="button"
                className="swatch"
                style={{ background: s }}
                aria-pressed={s === hex}
                title={s.toUpperCase()}
                onClick={() => app.setColor(hexToHsv(s, color.h)!)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
