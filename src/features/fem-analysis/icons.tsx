// Stroke-only icons for the FEM module.
type IconProps = { s?: number };

export const FemIcons = {
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
  Trash: ({ s = 14 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4 H11.5" />
      <path d="M3.5 4 V11.5 A1 1 0 0 0 4.5 12.5 H9.5 A1 1 0 0 0 10.5 11.5 V4" />
      <path d="M5.5 4 V2.5 A0.5 0.5 0 0 1 6 2 H8 A0.5 0.5 0 0 1 8.5 2.5 V4" />
      <path d="M5.5 6.5 V10 M8.5 6.5 V10" />
    </svg>
  ),
  Chev: ({ s = 10, dir = 'down' }: IconProps & { dir?: 'down' | 'right' | 'up' }) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: dir === 'right' ? 'rotate(-90deg)' : dir === 'up' ? 'rotate(180deg)' : 'none',
        transition: 'transform 150ms',
      }}
    >
      <path d="M2.5 4 L5 6.5 L7.5 4" />
    </svg>
  ),
  X: ({ s = 12 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 3 L9 9 M9 3 L3 9" />
    </svg>
  ),
  Link: ({ s = 12 }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7 L7 5" />
      <path d="M4.5 4 L3.5 5 A1.8 1.8 0 0 0 6 7.5 L7 6.5" />
      <path d="M7.5 8 L8.5 7 A1.8 1.8 0 0 0 6 4.5 L5 5.5" />
    </svg>
  ),
};
