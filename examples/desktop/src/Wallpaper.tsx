import { useState } from "react";
import { useWorkspace } from "@danfessler/trellis-react";
import { desktopFolders, folders } from "./demo/folders";
import { appById } from "./apps";
import { launch } from "./desktop";

const FolderGlyph = () => (
  <svg viewBox="0 0 72 60" aria-hidden="true">
    <path fill="#77bfe9" d="M4 10a4 4 0 0 1 4-4h21l8 8h27a4 4 0 0 1 4 4v32H4z" />
    <path fill="#55ace0" stroke="#a4dcf9" strokeWidth=".7" d="M4 19h64v32a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
  </svg>
);

/**
 * The stage backdrop: desktop folders on a transparent layer (the wallpaper itself is painted by
 * the workspace so it stays put while the camera moves, like the prototype). Double-click a
 * folder to open Finder there.
 */
export function Wallpaper() {
  const ws = useWorkspace();
  const [chosen, setChosen] = useState<string | null>(null);
  const open = (folder: string) => launch(ws, appById("finder")!, { folder });
  return (
    <div className="desktop" onPointerDown={() => setChosen(null)}>
      <div className="desktop-folders" role="list" aria-label="Desktop">
        {desktopFolders.map((id) => (
          <button
            key={id}
            type="button"
            role="listitem"
            className="desktop-folder"
            data-folder={id}
            data-chosen={chosen === id ? "" : undefined}
            aria-label={`Open ${folders[id].name} folder`}
            onPointerDown={(e) => {
              e.stopPropagation();
              setChosen(id);
            }}
            onDoubleClick={() => open(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open(id);
              }
            }}
          >
            <FolderGlyph />
            <span>{folders[id].name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
