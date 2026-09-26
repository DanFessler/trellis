/** The Trellis mark: a diamond lattice with one budding node. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <clipPath id="trellis-mark-clip">
          <rect x="3" y="3" width="26" height="26" rx="7.5" />
        </clipPath>
      </defs>
      <rect x="3" y="3" width="26" height="26" rx="7.5" fill="currentColor" opacity="0.12" />
      <g clipPath="url(#trellis-mark-clip)" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M-5 11 11 -5M-5 21 21 -5M-5 31 31 -5M5 35 35 5M15 35 35 15" />
        <path d="M-5 21 11 37M-5 11 21 37M-5 1 31 37M5 -5 37 27M15 -5 37 17" opacity="0.55" />
      </g>
      <rect
        x="3"
        y="3"
        width="26"
        height="26"
        rx="7.5"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <circle cx="21" cy="11" r="3.2" fill="currentColor" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <LogoMark className="brand-mark" />
      Trellis
    </span>
  );
}
