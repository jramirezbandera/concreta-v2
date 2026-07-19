// FEM 2D — stroke-only tool icons (copied subset of the 1D FemIcons for
// visual consistency across the two modules; the quarantine bans importing
// them from fem-analysis directly).

type IconProps = { s?: number };

export const Fem2DIcons = {
  Cursor: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2 L3 11 L5.5 8.5 L7 12 L8.5 11.3 L7 8 L10.5 8 Z" />
    </svg>
  ),
  Node: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="7" cy="7" r="2.6" fill="currentColor" fillOpacity="0.2" />
      <circle cx="7" cy="7" r="2.6" />
      <path d="M7 1 V3 M7 11 V13 M1 7 H3 M11 7 H13" />
    </svg>
  ),
  Bar: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <line x1="2.5" y1="11" x2="11.5" y2="3" />
      <circle cx="2.5" cy="11" r="1.4" fill="var(--color-bg-primary)" />
      <circle cx="11.5" cy="3" r="1.4" fill="var(--color-bg-primary)" />
    </svg>
  ),
  Support: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="7" cy="5" r="1.4" />
      <path d="M3 9 L7 5 L11 9 Z" />
      <path d="M2 12 H12 M3.5 12 L2.5 13 M6 12 L5 13 M8.5 12 L7.5 13 M11 12 L10 13" />
    </svg>
  ),
  Load: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2 V11" />
      <path d="M4 8 L7 11 L10 8" />
    </svg>
  ),
  // Horizontal point force (wind →).
  LoadH: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7 H11" />
      <path d="M8 4 L11 7 L8 10" />
    </svg>
  ),
  // Distributed load: a top rail feeding a row of short down-arrows onto a bar.
  LoadDist: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 3 H12.5" />
      <path d="M3 3 V8 M3 8 L2 6.5 M3 8 L4 6.5" />
      <path d="M7 3 V8 M7 8 L6 6.5 M7 8 L8 6.5" />
      <path d="M11 3 V8 M11 8 L10 6.5 M11 8 L12 6.5" />
      <path d="M1.5 11 H12.5" />
    </svg>
  ),
  // Horizontal distributed load (wind pressure): a left rail feeding a row of
  // short right-arrows onto a (vertical) bar — LoadDist rotated 90°.
  LoadDistH: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 1.5 V12.5" />
      <path d="M3 3 H8 M8 3 L6.5 2 M8 3 L6.5 4" />
      <path d="M3 7 H8 M8 7 L6.5 6 M8 7 L6.5 8" />
      <path d="M3 11 H8 M8 11 L6.5 10 M8 11 L6.5 12" />
      <path d="M11 1.5 V12.5" />
    </svg>
  ),
  // Property paint ("brocha" — AutoCAD Matchprop): a brush over a target bar.
  CopyProps: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      {/* handle + ferrule, diagonal */}
      <path d="M12.5 1.5 L8.5 5.5" />
      <path d="M8.5 5.5 L9.8 6.8 L6.3 10.3 Q4.9 11.2 3.8 10.2 Q2.8 9.1 3.7 7.7 L7.2 4.2 Z" fill="currentColor" fillOpacity="0.15" />
      {/* target bar receiving the paint */}
      <path d="M1.5 12.5 H9" />
    </svg>
  ),
  Trash: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4 H11.5" />
      <path d="M3.5 4 V11.5 A1 1 0 0 0 4.5 12.5 H9.5 A1 1 0 0 0 10.5 11.5 V4" />
      <path d="M5.5 4 V2.5 A0.5 0.5 0 0 1 6 2 H8 A0.5 0.5 0 0 1 8.5 2.5 V4" />
      <path d="M5.5 6.5 V10 M8.5 6.5 V10" />
    </svg>
  ),
};
