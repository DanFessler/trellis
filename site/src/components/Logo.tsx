import { MARK, TILE_OPACITY } from "./logo-paths";

/**
 * The Trellis mark: a layout of three panels and a leaf. The leaf takes `color`
 * (the accent); the panels are a tint of the text colour.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${MARK.size} ${MARK.size}`} aria-hidden="true">
      <path d={MARK.tiles} fill="var(--text, currentColor)" fillOpacity={TILE_OPACITY} />
      <path d={MARK.leaf} fill="currentColor" />
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
