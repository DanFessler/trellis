import { useState } from "react";
import { hexToRgb } from "../paint/color";
import { openDialog } from "./Dialog";
import { FilePlusIcon } from "./icons";

export interface NewDocOptions {
  name: string;
  width: number;
  height: number;
  background: string;
}

const SIZES = [
  { label: "Landscape", w: 1600, h: 1000 },
  { label: "Square", w: 1080, h: 1080 },
  { label: "HD", w: 1920, h: 1080 },
  { label: "Portrait", w: 1000, h: 1400 },
];
const BACKGROUNDS = [
  { label: "White", value: "#ffffff" },
  { label: "Paper", value: "#f4efe6" },
  { label: "Ink", value: "#17171c" },
  { label: "Transparent", value: "transparent" },
];

function NewDocForm({ initialName, close }: { initialName: string; close(v: NewDocOptions | null): void }) {
  const [name, setName] = useState(initialName);
  const [w, setW] = useState(1600);
  const [h, setH] = useState(1000);
  const [bg, setBg] = useState("#ffffff");
  const valid = w >= 16 && h >= 16 && w <= 4096 && h <= 4096;
  const submit = () =>
    valid &&
    close({ name: name.trim() || initialName, width: Math.round(w), height: Math.round(h), background: bg });
  const ratio = w / h;
  const pw = ratio >= 1 ? 44 : 44 * ratio;
  const ph = ratio >= 1 ? 44 / ratio : 44;
  return (
    <form
      className="dialog-body new-doc"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="dialog-icon">
        <FilePlusIcon size={22} />
      </div>
      <div className="dialog-text">
        <h2 className="dialog-title">New Document</h2>
        <label className="field field-block">
          <span>Name</span>
          <input
            value={name}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="field-label">Size</div>
        <div className="size-presets">
          {SIZES.map((s) => (
            <button
              key={s.label}
              type="button"
              className="size-preset"
              aria-pressed={s.w === w && s.h === h}
              onClick={() => (setW(s.w), setH(s.h))}
            >
              <span className="size-shape" style={{ aspectRatio: `${s.w} / ${s.h}` }} />
              <span>{s.label}</span>
              <span className="muted small">
                {s.w}×{s.h}
              </span>
            </button>
          ))}
        </div>
        <div className="size-row">
          <label className="field">
            <span>W</span>
            <input
              type="number"
              min={16}
              max={4096}
              value={w}
              onChange={(e) => setW(Number(e.target.value))}
            />
          </label>
          <span className="muted">×</span>
          <label className="field">
            <span>H</span>
            <input
              type="number"
              min={16}
              max={4096}
              value={h}
              onChange={(e) => setH(Number(e.target.value))}
            />
          </label>
          <span className="muted small">px</span>
          <span
            className="size-glyph"
            style={{ width: pw, height: ph, background: bg === "transparent" ? undefined : bg }}
            data-transparent={bg === "transparent" || undefined}
          />
        </div>
        <div className="field-label">Background</div>
        <div className="bg-options">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.value}
              type="button"
              className="bg-option"
              aria-pressed={bg === b.value}
              onClick={() => setBg(b.value)}
            >
              <span
                className="bg-dot"
                data-transparent={b.value === "transparent" || undefined}
                style={{
                  background: b.value === "transparent" ? undefined : b.value,
                  borderColor: hexToRgb(b.value) ? undefined : "transparent",
                }}
              />
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={() => close(null)}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!valid}>
          Create
        </button>
      </div>
    </form>
  );
}

export function newDocumentDialog(initialName: string) {
  return openDialog<NewDocOptions | null>(
    (close) => <NewDocForm initialName={initialName} close={close} />,
    null,
  );
}
