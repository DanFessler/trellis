import { folders } from "./demo/folders";
import { webpage } from "./demo/webpages";

export interface AppDefinition {
  /** Trellis view type id. */
  id: string;
  /** Name shown in the dock. */
  name: string;
  /** Index into the prototype's demo pages and icons. */
  index: number;
  /** Preferred window size in CSS pixels. */
  size: { w: number; h: number };
  /** One window at most (every app except Finder). */
  singleton: boolean;
}

export const APPS: AppDefinition[] = [
  { id: "finder", name: "Finder", index: 0, size: { w: 800, h: 520 }, singleton: false },
  { id: "notes", name: "Notes", index: 1, size: { w: 700, h: 540 }, singleton: true },
  { id: "mail", name: "Mail", index: 2, size: { w: 860, h: 600 }, singleton: true },
  { id: "calendar", name: "Calendar", index: 3, size: { w: 900, h: 620 }, singleton: true },
  { id: "photos", name: "Photos", index: 4, size: { w: 840, h: 600 }, singleton: true },
  { id: "spotify", name: "Spotify", index: 5, size: { w: 880, h: 600 }, singleton: true },
];
export const appById = (id: string) => APPS.find((a) => a.id === id);

export const STAGE_ID = "desktop";
export const DEFAULT_FOLDER = "studio";

export interface AppParams extends Record<string, unknown> {
  folder?: string;
}

/** Page markup and title-bar text for a window. Pages are big strings, so cache them. */
const pages = new Map<string, ReturnType<typeof webpage>>();
export function pageFor(app: AppDefinition, params: AppParams = {}) {
  const folder = app.id === "finder" ? (params.folder && folders[params.folder] ? params.folder : DEFAULT_FOLDER) : undefined;
  const key = `${app.index}:${folder ?? ""}`;
  let page = pages.get(key);
  if (!page) pages.set(key, (page = webpage(app.index, folder)));
  return page;
}
