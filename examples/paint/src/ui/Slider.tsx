import { useRef, type KeyboardEvent, type PointerEvent } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** >1 gives finer control at the low end (e.g. brush size). */
  curve?: number;
  step?: number;
  format?: (v: number) => string;
  onChange(value: number): void;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  min,
  max,
  curve = 1,
  step = 0,
  format = (v) => String(Math.round(v)),
  onChange,
  disabled,
}: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const toT = (v: number) => ((v - min) / (max - min)) ** (1 / curve);
  const fromT = (t: number) => {
    const v = min + (max - min) * Math.max(0, Math.min(1, t)) ** curve;
    return step ? Math.round(v / step) * step : v;
  };
  const t = Math.max(0, Math.min(1, toT(value)));
  const set = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    onChange(fromT((e.clientX - r.left) / r.width));
  };
  const onKey = (e: KeyboardEvent) => {
    const d =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (!d) return;
    e.preventDefault();
    onChange(fromT(t + d * (e.shiftKey ? 0.1 : 0.02)));
  };
  return (
    <div className="slider" data-disabled={disabled || undefined}>
      <div className="slider-head">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{format(value)}</span>
      </div>
      <div
        ref={track}
        className="slider-track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuetext={format(value)}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          set(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e);
        }}
      >
        <div className="slider-rail" />
        <div className="slider-fill" style={{ width: `${t * 100}%` }} />
        <div className="slider-thumb" style={{ left: `${t * 100}%` }} />
      </div>
    </div>
  );
}
