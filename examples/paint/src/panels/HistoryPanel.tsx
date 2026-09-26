import { useEffect, useRef } from "react";
import type { HistoryKind } from "../paint/PaintDoc";
import { useActiveDoc } from "../store";
import {
  BrushIcon,
  BucketIcon,
  EraserIcon,
  EyeIcon,
  ImageIcon,
  LayersIcon,
  MergeIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from "../ui/icons";
import { NoDocument } from "./LayersPanel";

const ICONS: Record<HistoryKind, typeof BrushIcon> = {
  open: ImageIcon,
  brush: BrushIcon,
  eraser: EraserIcon,
  fill: BucketIcon,
  layer: LayersIcon,
  clear: TrashIcon,
  props: EyeIcon,
  merge: MergeIcon,
};

export function HistoryPanel() {
  const doc = useActiveDoc();
  const list = useRef<HTMLDivElement>(null);
  const index = doc?.index ?? 0;
  useEffect(() => {
    list.current?.querySelector("[aria-current=step]")?.scrollIntoView({ block: "nearest" });
  }, [index, doc]);
  if (!doc) return <NoDocument what="history" />;
  const rows = [{ label: "Open", kind: "open" as HistoryKind }, ...doc.history];
  return (
    <div className="panel history-panel">
      <div className="history-list" ref={list}>
        {rows.map((entry, i) => (
          <button
            key={i}
            type="button"
            className="history-row"
            aria-current={i === doc.index ? "step" : undefined}
            data-future={i > doc.index || undefined}
            onClick={() => doc.goTo(i)}
          >
            {(() => {
              const Icon = ICONS[entry.kind];
              return <Icon size={14} />;
            })()}
            <span>{entry.label}</span>
            {i === doc.savedIndex && i > 0 && <span className="history-saved">Exported</span>}
          </button>
        ))}
      </div>
      <div className="panel-footer">
        <button
          type="button"
          className="icon-btn"
          title="Undo (⌘Z)"
          disabled={doc.index === 0}
          onClick={() => doc.undo()}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Redo (⇧⌘Z)"
          disabled={doc.index >= doc.history.length}
          onClick={() => doc.redo()}
        >
          <RedoIcon />
        </button>
        <span className="spacer" />
        <span className="muted small">
          {doc.index} / {doc.history.length} steps
        </span>
      </div>
    </div>
  );
}
