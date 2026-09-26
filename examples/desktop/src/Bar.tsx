import { useEffect, useRef, useState } from "react";
import { useWorkspace, useWorkspaceState } from "@danfessler/trellis-react";
import { Dock } from "./Dock";

const Icon = ({ d, className }: { d: string; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);
const icons = {
  overview: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 3v18M12 12h9",
  framing: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3",
  plus: "M12 5v14M5 12h14",
  back: "m14 6-6 6 6 6",
  forward: "m10 6 6 6-6 6",
  map: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 3v18M12 12h9",
  reset: "M3 10a9 9 0 1 1 2 8M3 4v6h6",
  x: "m7 7 10 10M7 17 17 7",
};

/** Name a new saved framing. */
function SaveFraming({ onDone }: { onDone(): void }) {
  const ws = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  useEffect(() => input.current?.focus(), []);
  return (
    <form
      className="popover save-framing"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) ws.navigation.framings.save(name.trim());
        onDone();
      }}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
    >
      <label htmlFor="framing-name">Save this view</label>
      <input
        id="framing-name"
        ref={input}
        value={name}
        maxLength={40}
        placeholder="e.g. Writing space"
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
      />
      <div className="popover-actions">
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={!name.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}

/**
 * The prototype's bottom bar: navigation on the left, the dock in the middle, map on the right.
 * It lives outside <Workspace>; <WorkspaceProvider> makes Trellis's hooks work here.
 */
export function Bar({ map, onToggleMap, onReset }: { map: boolean; onToggleMap(): void; onReset(): void }) {
  const ws = useWorkspace();
  const state = useWorkspaceState();
  const [saving, setSaving] = useState(false);
  const open = state.views.filter((v) => v.placement !== "hidden").length;
  const hidden = state.views.length - open;
  return (
    <div className="bar">
      <div className="bar-side bar-start">
        <button
          type="button"
          className="bar-button"
          data-current={state.framed === null ? "" : undefined}
          title="Show the whole workspace (⌘⌥↑)"
          onClick={() => ws.navigation.overview()}
        >
          <Icon d={icons.overview} />
          <span>Overview</span>
        </button>
        <div className="framings" aria-label="Saved framings">
          {state.framings.map((f) => (
            <div key={f.id} className="framing" data-current={f.frame.length && f.frame[0] === state.framed ? "" : undefined}>
              <button type="button" className="bar-button" title={`Go to “${f.name}”`} onClick={() => ws.navigation.framings.go(f.id)}>
                <Icon d={icons.framing} />
                <span>{f.name}</span>
              </button>
              <button
                type="button"
                className="framing-remove"
                aria-label={`Remove ${f.name}`}
                onClick={() => ws.navigation.framings.remove(f.id)}
              >
                <Icon d={icons.x} />
              </button>
            </div>
          ))}
        </div>
        <div className="popover-anchor">
          <button
            type="button"
            className="bar-icon"
            aria-label="Save current framing"
            title="Save current framing"
            aria-expanded={saving}
            onClick={() => setSaving((s) => !s)}
          >
            <Icon d={icons.plus} />
          </button>
          {saving && <SaveFraming onDone={() => setSaving(false)} />}
        </div>
        <div className="history" role="group" aria-label="View history">
          <button
            type="button"
            className="bar-icon"
            aria-label="Previous view"
            title="Previous view (⌘⌥←)"
            disabled={!state.canGoBack}
            onClick={() => ws.navigation.back()}
          >
            <Icon d={icons.back} />
          </button>
          <button
            type="button"
            className="bar-icon"
            aria-label="Next view"
            title="Next view (⌘⌥→)"
            disabled={!state.canGoForward}
            onClick={() => ws.navigation.forward()}
          >
            <Icon d={icons.forward} />
          </button>
        </div>
        <span className="bar-count">
          {open} {open === 1 ? "window" : "windows"}
          {hidden ? ` · ${hidden} in Dock` : ""}
        </span>
      </div>
      <Dock />
      <div className="bar-side bar-end">
        <button type="button" className="bar-button" aria-pressed={map} title="Show or hide the minimap" onClick={onToggleMap}>
          <Icon d={icons.map} />
          <span>Map</span>
        </button>
        <button type="button" className="bar-icon" aria-label="Reset desktop" title="Reset desktop" onClick={onReset}>
          <Icon d={icons.reset} />
        </button>
      </div>
    </div>
  );
}
