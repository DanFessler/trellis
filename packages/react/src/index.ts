export {
  Workspace,
  WorkspaceProvider,
  ViewType,
  Split,
  Panel,
  View,
  Stage,
  useWorkspace,
  useOptionalWorkspace,
  useWorkspaceState,
  useWorkspaceSelector,
  useView,
  useOptionalView,
  useViewTitle,
  useViewBadge,
  useCloseGuard,
} from "./Workspace";
export type {
  WorkspaceProps,
  ViewTypeProps,
  SplitProps,
  PanelProps,
  ViewProps,
  StageProps,
  ViewApi,
} from "./Workspace";
export { layout, createDocument, formatCombo } from "@danfessler/trellis";
export type * from "@danfessler/trellis";
