export { createWorkspace } from "./runtime/workspace";
export { createDocument, layout } from "./model/builder";
export type { LayoutSpec, ViewSpec, PanelSpec, SplitSpec, StageSpec, FloatSpec } from "./model/builder";
export { emptyDocument, sanitize } from "./model/document";
/** World geometry (0–1) of every node in a layout tree; useful for minimaps and overviews. */
export { layoutRects } from "./model/tree";
export type { Entry as LayoutEntry } from "./model/tree";
export { formatCombo, DEFAULT_KEYMAP } from "./runtime/keymap";
export type { Command, Keymap } from "./runtime/keymap";
export type * from "./model/types";
export type * from "./runtime/types";
