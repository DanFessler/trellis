import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
const make = (paths: ReactNode, fill = false) =>
  function Icon({ size = 16, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill ? "currentColor" : "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {paths}
      </svg>
    );
  };

export const BrushIcon = make(
  <>
    <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-3-3 9.4-9.4Z" />
    <path d="M9 12c-2.3 0-4 1.6-4 3.8 0 1.4-.8 2.6-2.5 3.2 1.1 1.3 3 2 5 2 3 0 5-2.2 5-5L9 12Z" />
  </>,
);
export const EraserIcon = make(
  <>
    <path d="m7 21-4.3-4.3a1.5 1.5 0 0 1 0-2.1l10-10a1.5 1.5 0 0 1 2.1 0l5.6 5.6a1.5 1.5 0 0 1 0 2.1L12 21" />
    <path d="M7 21h14" />
    <path d="m5.5 11.5 7 7" />
  </>,
);
export const BucketIcon = make(
  <>
    <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0L19 11Z" />
    <path d="m5 2 5 5" />
    <path d="M2 13h15" />
    <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
  </>,
);
export const PipetteIcon = make(
  <>
    <path d="m2 22 1-1h3l9-9" />
    <path d="M3 21v-3l9-9" />
    <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
  </>,
);
export const HandIcon = make(
  <>
    <path d="M18 11V6a2 2 0 0 0-4 0v0" />
    <path d="M14 10V4a2 2 0 0 0-4 0v2" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16.9a2 2 0 0 1 2.8-2.9L8 15.8" />
  </>,
);
export const LayersIcon = make(
  <>
    <path d="m12.8 2.2a2 2 0 0 0-1.6 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9a1 1 0 0 0 0-1.8Z" />
    <path d="m2 12 9.2 4.2a2 2 0 0 0 1.6 0L22 12" />
    <path d="m2 17 9.2 4.2a2 2 0 0 0 1.6 0L22 17" />
  </>,
);
export const PaletteIcon = make(
  <>
    <path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2.2a1.8 1.8 0 0 0-1.3 3.1A1.7 1.7 0 0 1 12 22Z" />
    <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" />
    <circle cx="11" cy="6.5" r="1.2" fill="currentColor" />
    <circle cx="16" cy="8" r="1.2" fill="currentColor" />
  </>,
);
export const SlidersIcon = make(
  <>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </>,
);
export const HistoryIcon = make(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3.5 2" />
  </>,
);
export const CompassIcon = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <rect x="8" y="8" width="8" height="7" rx="1" />
  </>,
);
export const ToolsIcon = make(
  <>
    <path d="M12 20h9" />
    <path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
);
export const ImageIcon = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </>,
);
export const EyeIcon = make(
  <>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const EyeOffIcon = make(
  <>
    <path d="M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 7 10 7a17 17 0 0 1-2.2 3.2" />
    <path d="M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="m2 2 20 20" />
    <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" />
  </>,
);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = make(<path d="M5 12h14" />);
export const TrashIcon = make(
  <>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </>,
);
export const CopyIcon = make(
  <>
    <rect x="8" y="8" width="13" height="13" rx="2" />
    <path d="M4 16a2 2 0 0 1-1-1.7V5a2 2 0 0 1 2-2h9.3A2 2 0 0 1 16 4" />
  </>,
);
export const ArrowUpIcon = make(<path d="m6 15 6-6 6 6" />);
export const ArrowDownIcon = make(<path d="m6 9 6 6 6-6" />);
export const ChevronRightIcon = make(<path d="m9 6 6 6-6 6" />);
export const MergeIcon = make(
  <>
    <rect x="4" y="3" width="16" height="6" rx="1.5" />
    <path d="M12 9v7M8.5 12.5 12 16l3.5-3.5" />
    <path d="M4 20h16" />
  </>,
);
export const UndoIcon = make(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </>,
);
export const RedoIcon = make(
  <>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </>,
);
export const FitIcon = make(
  <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />,
);
export const DownloadIcon = make(
  <>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </>,
);
export const FilePlusIcon = make(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M12 12v6M9 15h6" />
  </>,
);
export const SwapIcon = make(
  <>
    <path d="M4 9h13l-3-3M20 15H7l3 3" />
  </>,
);
export const CheckIcon = make(<path d="M5 12.5 10 17.5 19 7" />);
export const MaximizeIcon = make(<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />);
export const DotIcon = make(<circle cx="12" cy="12" r="4" />, true);

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb86b" />
          <stop offset="0.5" stopColor="#f0617a" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#logo-g)" />
      <path
        d="M7 16.5c1.8-.2 2.6-1.3 3-2.6.5-1.6 1.6-2.4 3-2.1l4.5-4.4"
        stroke="#fff"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="7.2" cy="16.4" r="1.6" fill="#fff" />
    </svg>
  );
}
