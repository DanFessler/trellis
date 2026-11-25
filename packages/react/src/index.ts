export {
  Workspace,
  WorkspaceProvider,
  ViewType,
  Split,
  Panel,
  View,
  Stage,
  Floating,
  useWorkspace,
  useOptionalWorkspace,
  useWorkspaceState,
  useWorkspaceSelector,
  useView,
  useOptionalView,
  useViewTitle,
  useViewBadge,
  useCloseGuard,
  ViewMenu,
} from "./Workspace";
export type {
  WorkspaceProps,
  ViewTypeProps,
  SplitProps,
  PanelProps,
  ViewProps,
  StageProps,
  FloatingProps,
  ViewApi,
  ViewMenuItem,
  ViewMenuEntry,
} from "./Workspace";
export { layout, createDocument, formatCombo } from "@danfessler/trellis";
export type * from "@danfessler/trellis";
