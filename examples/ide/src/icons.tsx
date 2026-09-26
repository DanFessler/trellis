import type { ReactNode, SVGProps } from "react";
import { basename, extname } from "./vfs";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
function make(children: ReactNode, displayName: string) {
  const Icon = ({ size = 16, ...rest }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

export const FilesIcon = make(
  <>
    <path d="M9.5 1.75H5.25a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5V5l-3.25-3.25Z" />
    <path d="M9.5 1.75V5h3.25" />
    <path d="M1.75 5.5v7.25a1.5 1.5 0 0 0 1.5 1.5H9" />
  </>,
  "FilesIcon",
);
export const SearchIcon = make(
  <>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.25 10.25 3.5 3.5" />
  </>,
  "SearchIcon",
);
export const TerminalIcon = make(
  <>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
    <path d="m4.5 6.25 2 1.75-2 1.75M8 10h3.25" />
  </>,
  "TerminalIcon",
);
export const PreviewIcon = make(
  <>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
    <path d="M1.75 5.75h12.5" />
    <circle cx="3.9" cy="4.25" r=".3" fill="currentColor" />
    <circle cx="5.3" cy="4.25" r=".3" fill="currentColor" />
  </>,
  "PreviewIcon",
);
export const OutlineIcon = make(
  <>
    <path d="M2.5 3.5h2M2.5 8h2M2.5 12.5h2" />
    <path d="M7 3.5h6.5M8.75 8h4.75M8.75 12.5h4.75" />
    <path d="M7 3.5v9h1.25M7 8h1.25" />
  </>,
  "OutlineIcon",
);
export const ProblemsIcon = make(
  <>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.75v3.75M8 10.9v.1" strokeWidth={1.6} />
  </>,
  "ProblemsIcon",
);
export const ChevronRight = make(<path d="m6 3.75 4.25 4.25L6 12.25" />, "ChevronRight");
export const ChevronDown = make(<path d="m3.75 6 4.25 4.25L12.25 6" />, "ChevronDown");
export const FolderIcon = make(
  <path d="M1.75 4.25a1.5 1.5 0 0 1 1.5-1.5h2.6l1.5 1.5h5.4a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-7.5Z" />,
  "FolderIcon",
);
export const FolderOpenIcon = make(
  <>
    <path d="M1.75 11.5V4.25a1.5 1.5 0 0 1 1.5-1.5h2.6l1.5 1.5h4.4a1.5 1.5 0 0 1 1.5 1.5v1" />
    <path d="M1.9 12.1 3.6 7.6a1.25 1.25 0 0 1 1.17-.85h8.73a.9.9 0 0 1 .85 1.2l-1.5 4.2a1.25 1.25 0 0 1-1.18.85H3.1a1.25 1.25 0 0 1-1.2-.9Z" />
  </>,
  "FolderOpenIcon",
);
export const CloseIcon = make(<path d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5" />, "CloseIcon");
export const CommandIcon = make(
  <path d="M6 6V4.25A1.75 1.75 0 1 0 4.25 6H6Zm0 0v4m0-4h4m-4 4H4.25A1.75 1.75 0 1 0 6 11.75V10Zm0 0h4m0 0v1.75A1.75 1.75 0 1 0 11.75 10H10Zm0 0V6m0 0h1.75A1.75 1.75 0 1 0 10 4.25V6Z" />,
  "CommandIcon",
);
export const LayoutIcon = make(
  <>
    <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" />
    <path d="M6 2.25v11.5M6 9.5h8.25" />
  </>,
  "LayoutIcon",
);
export const BranchIcon = make(
  <>
    <circle cx="4.5" cy="3.75" r="1.5" />
    <circle cx="4.5" cy="12.25" r="1.5" />
    <circle cx="11.5" cy="5.25" r="1.5" />
    <path d="M4.5 5.25v5.5M11.5 6.75c0 2.5-2.5 3-5.6 4.4" />
  </>,
  "BranchIcon",
);
export const RefreshIcon = make(
  <>
    <path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71L13.25 5.8" />
    <path d="M13.25 2.5v3.3H9.95" />
  </>,
  "RefreshIcon",
);
export const CheckIcon = make(<path d="m3.25 8.5 3 3 6.5-7" />, "CheckIcon");
export const ErrorIcon = make(
  <>
    <circle cx="8" cy="8" r="6.25" />
    <path d="m5.75 5.75 4.5 4.5M10.25 5.75l-4.5 4.5" />
  </>,
  "ErrorIcon",
);
export const WarningIcon = make(
  <>
    <path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.5 9.6a1 1 0 0 1-.87 1.5H2.5a1 1 0 0 1-.87-1.5l5.5-9.6Z" />
    <path d="M8 6v3M8 11.1v.1" strokeWidth={1.6} />
  </>,
  "WarningIcon",
);
export const InfoIcon = make(
  <>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.25v3.75M8 5v.1" strokeWidth={1.6} />
  </>,
  "InfoIcon",
);
export const MaximizeIcon = make(
  <path d="M9.75 2.25h4v4M6.25 13.75h-4v-4M13.75 2.25 9.5 6.5M2.25 13.75 6.5 9.5" />,
  "MaximizeIcon",
);
export const CollapseIcon = make(
  <>
    <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" />
    <path d="M5.5 8h5" />
  </>,
  "CollapseIcon",
);
export const PaletteIcon = make(
  <>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 1.75v12.5" />
    <path d="M8 1.75a6.25 6.25 0 0 0 0 12.5" fill="currentColor" stroke="none" />
  </>,
  "PaletteIcon",
);
export const SaveIcon = make(
  <>
    <path d="M3.25 1.75h7.5l3.5 3.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-9.5a1.5 1.5 0 0 1 1.5-1.5Z" />
    <path d="M5 1.75v3h5v-3M4.75 14.25v-4.5h6.5v4.5" />
  </>,
  "SaveIcon",
);
export const FloatIcon = make(
  <>
    <rect x="1.75" y="4.75" width="9.5" height="9.5" rx="1.75" />
    <path d="M5 4.75v-1.5a1.5 1.5 0 0 1 1.5-1.5h6.25a1.5 1.5 0 0 1 1.5 1.5v6.25a1.5 1.5 0 0 1-1.5 1.5h-1.5" />
  </>,
  "FloatIcon",
);
export const PlayIcon = make(
  <path d="M4.75 2.9v10.2a.6.6 0 0 0 .9.52l8.4-5.1a.6.6 0 0 0 0-1.04l-8.4-5.1a.6.6 0 0 0-.9.52Z" />,
  "PlayIcon",
);
export const SymbolIcon = make(
  <path d="M5 2.5c-1.5 0-2 .75-2 2v1.5c0 .9-.5 1.5-1.25 2 .75.5 1.25 1.1 1.25 2v1.5c0 1.25.5 2 2 2M11 2.5c1.5 0 2 .75 2 2v1.5c0 .9.5 1.5 1.25 2-.75.5-1.25 1.1-1.25 2v1.5c0 1.25-.5 2-2 2" />,
  "SymbolIcon",
);
export const CaseIcon = ({ active }: { active?: boolean }) => (
  <span style={{ fontWeight: 600, fontSize: 11, letterSpacing: "-0.02em", opacity: active ? 1 : 0.8 }}>
    Aa
  </span>
);

export function TrellisMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="1.5" y="1.5" width="7" height="17" rx="2.2" fill="var(--ide-accent)" />
      <rect x="10.5" y="1.5" width="8" height="8" rx="2.2" fill="var(--ide-accent)" opacity=".55" />
      <rect x="10.5" y="11.5" width="8" height="7" rx="2.2" fill="var(--ide-accent)" opacity=".3" />
    </svg>
  );
}

// ------------------------------------------------------------------ file type badges
const FILE_KINDS: Record<string, { label: string; color: string }> = {
  ts: { label: "TS", color: "#4f8ff7" },
  tsx: { label: "TS", color: "#4f8ff7" },
  js: { label: "JS", color: "#e9c46a" },
  css: { label: "#", color: "#b48cf2" },
  html: { label: "<>", color: "#f08a5d" },
  md: { label: "M", color: "#7fb3c8" },
  json: { label: "{}", color: "#d9b44a" },
};
export function fileColor(path: string) {
  return FILE_KINDS[extname(path)]?.color ?? "var(--ide-muted)";
}
export function FileIcon({ path }: { path: string }) {
  const name = basename(path);
  const isTest = /\.test\.[jt]sx?$/.test(name);
  const kind = isTest ? { label: "✓", color: "#6cc788" } : FILE_KINDS[extname(path)];
  if (!kind)
    return (
      <span className="file-icon" style={{ color: "var(--ide-muted)" }}>
        <FilesIcon size={14} />
      </span>
    );
  return (
    <span className="file-icon" data-kind={extname(path)} style={{ color: kind.color }}>
      {kind.label}
    </span>
  );
}
