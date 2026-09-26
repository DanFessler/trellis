import { useEffect, useRef, useState } from "react";
import { BLEND_MODES, type Blend, type Layer, type PaintDoc } from "../paint/PaintDoc";
import { useActiveDoc } from "../store";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  MergeIcon,
  PlusIcon,
  TrashIcon,
} from "../ui/icons";
import { Slider } from "../ui/Slider";

export function NoDocument({ what }: { what: string }) {
  return (
    <div className="panel-empty">
      <ImageIcon size={22} />
      <p>Open a document to see its {what}.</p>
    </div>
  );
}

function LayerThumb({ layer, doc }: { layer: Layer; doc: PaintDoc }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const h = 28;
    const w = Math.round(Math.min(48, (h * doc.width) / doc.height));
    c.style.width = `${w}px`;
    c.style.height = `${Math.round((w * doc.height) / doc.width)}px`;
    c.width = w * dpr;
    c.height = Math.round((w * doc.height) / doc.width) * dpr;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(layer.canvas, 0, 0, c.width, c.height);
  }, [layer, layer.rev, doc]);
  return <canvas ref={ref} className="layer-thumb" />;
}

function LayerRow({ doc, layer, index }: { doc: PaintDoc; layer: Layer; index: number }) {
  const [editing, setEditing] = useState(false);
  const active = doc.activeLayerId === layer.id;
  return (
    <div
      className="layer-row"
      role="option"
      aria-selected={active}
      data-hidden={!layer.visible || undefined}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-layer", layer.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/x-layer")) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.dataset.drop = e.clientY < r.top + r.height / 2 ? "above" : "below";
      }}
      onDragLeave={(e) => delete e.currentTarget.dataset.drop}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("text/x-layer");
        const where = e.currentTarget.dataset.drop;
        delete e.currentTarget.dataset.drop;
        if (!id) return;
        e.preventDefault();
        const from = doc.layers.findIndex((l) => l.id === id);
        // Rows are drawn top-first; "above" means a higher stacking index.
        let to = where === "above" ? index + 1 : index;
        if (from < to) to--;
        doc.moveLayer(id, to);
      }}
      onClick={() => doc.selectLayer(layer.id)}
    >
      <button
        type="button"
        className="icon-btn layer-eye"
        aria-label={layer.visible ? "Hide layer" : "Show layer"}
        onClick={(e) => {
          e.stopPropagation();
          doc.setLayer(layer.id, { visible: !layer.visible });
        }}
      >
        {layer.visible ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
      </button>
      <LayerThumb layer={layer} doc={doc} />
      {editing ? (
        <input
          className="layer-name-input"
          autoFocus
          defaultValue={layer.name}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== layer.name) doc.setLayer(layer.id, { name: v });
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <span className="layer-name" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
          {layer.name}
        </span>
      )}
      <span className="layer-meta">
        {layer.blend !== "source-over" && (
          <span className="layer-blend">{BLEND_MODES.find((b) => b.value === layer.blend)?.label}</span>
        )}
        {layer.opacity < 1 && <span>{Math.round(layer.opacity * 100)}%</span>}
      </span>
    </div>
  );
}

export function LayersPanel() {
  const doc = useActiveDoc();
  if (!doc) return <NoDocument what="layers" />;
  const active = doc.activeLayer;
  const index = doc.layers.indexOf(active);
  return (
    <div className="panel layers-panel">
      <div className="layer-props">
        <select
          className="select"
          aria-label="Blend mode"
          value={active.blend}
          onChange={(e) => doc.setLayer(active.id, { blend: e.target.value as Blend })}
        >
          {BLEND_MODES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <div className="layer-opacity">
          <Slider
            label="Opacity"
            value={active.opacity}
            min={0}
            max={1}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => doc.setLayer(active.id, { opacity: v })}
          />
        </div>
      </div>
      <div className="layer-list" role="listbox" aria-label="Layers">
        {[...doc.layers].reverse().map((layer) => (
          <LayerRow key={layer.id} doc={doc} layer={layer} index={doc.layers.indexOf(layer)} />
        ))}
      </div>
      <div className="panel-footer">
        <button type="button" className="icon-btn" title="New layer (⇧⌘N)" onClick={() => doc.addLayer()}>
          <PlusIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Duplicate layer"
          onClick={() => doc.duplicateLayer()}
        >
          <CopyIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Merge down"
          disabled={index <= 0}
          onClick={() => doc.mergeDown()}
        >
          <MergeIcon />
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="icon-btn"
          title="Move up"
          disabled={index >= doc.layers.length - 1}
          onClick={() => doc.moveLayer(active.id, index + 1)}
        >
          <ArrowUpIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Move down"
          disabled={index <= 0}
          onClick={() => doc.moveLayer(active.id, index - 1)}
        >
          <ArrowDownIcon />
        </button>
        <button
          type="button"
          className="icon-btn danger"
          title="Delete layer"
          disabled={doc.layers.length <= 1}
          onClick={() => doc.deleteLayer()}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
