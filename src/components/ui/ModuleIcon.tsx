// ModuleIcon — small structural icon per module, material-specific.
// Single source of truth: used by the app sidebar AND the landing module grid.
// 16×16 viewBox, stroke-only, currentColor.

export function ModuleIcon({ moduleKey, size = 14 }: { moduleKey: string; size?: number }) {
  const s = size;
  switch (moduleKey) {
    // RC beam: section rectangle with 2 top (compression) + 3 bottom (tension)
    // bars — the bottom-heavy layout is the beam signature
    case 'concreta-rc-beams':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" className="shrink-0">
          <rect x="2" y="4" width="12" height="8" rx="0.5"/>
          <circle cx="6" cy="6.2" r="0.62" fill="currentColor" stroke="none"/>
          <circle cx="10" cy="6.2" r="0.62" fill="currentColor" stroke="none"/>
          <circle cx="4.6" cy="9.9" r="0.8" fill="currentColor" stroke="none"/>
          <circle cx="8" cy="9.9" r="0.8" fill="currentColor" stroke="none"/>
          <circle cx="11.4" cy="9.9" r="0.8" fill="currentColor" stroke="none"/>
        </svg>
      );
    // RC column: square cross-section with one rebar bar at each corner
    case 'concreta-rc-columns':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" className="shrink-0">
          <rect x="3.5" y="3.5" width="9" height="9" rx="0.5"/>
          <circle cx="5.7" cy="5.7" r="0.85" fill="currentColor" stroke="none"/>
          <circle cx="10.3" cy="5.7" r="0.85" fill="currentColor" stroke="none"/>
          <circle cx="5.7" cy="10.3" r="0.85" fill="currentColor" stroke="none"/>
          <circle cx="10.3" cy="10.3" r="0.85" fill="currentColor" stroke="none"/>
        </svg>
      );
    // Steel beam: clean I-section (two flanges + web) horizontal
    case 'concreta-steel-beams':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true" className="shrink-0">
          <path d="M3 4h10M3 12h10M8 4v8"/>
        </svg>
      );
    // Steel column: I-section vertical
    case 'concreta-steel-columns':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true" className="shrink-0">
          <path d="M4 3v10M12 3v10M4 8h8"/>
        </svg>
      );
    // Anchor plate: rectangular base plate (plan view) with 4 anchor bolts at corners
    case 'concreta-anchor-plate':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" className="shrink-0">
          <rect x="2" y="3" width="12" height="10" rx="0.5"/>
          <circle cx="4.5" cy="5.5" r="0.9" fill="currentColor" stroke="none"/>
          <circle cx="11.5" cy="5.5" r="0.9" fill="currentColor" stroke="none"/>
          <circle cx="4.5" cy="10.5" r="0.9" fill="currentColor" stroke="none"/>
          <circle cx="11.5" cy="10.5" r="0.9" fill="currentColor" stroke="none"/>
        </svg>
      );
    // Timber beam: rectangle with curved grain lines
    case 'concreta-timber-beams':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden="true" className="shrink-0">
          <rect x="2" y="5" width="12" height="6" rx="0.5"/>
          <path d="M2 7.2c2 -0.8 4 -0.8 6 0s4 0.8 6 0" strokeOpacity="0.8"/>
          <path d="M2 9.2c2 -0.8 4 -0.8 6 0s4 0.8 6 0" strokeOpacity="0.5"/>
        </svg>
      );
    // Timber column: vertical rectangle with grain
    case 'concreta-timber-columns':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden="true" className="shrink-0">
          <rect x="5" y="2" width="6" height="12" rx="0.5"/>
          <path d="M6.8 2c-0.8 2 -0.8 4 0 6s0.8 4 0 6" strokeOpacity="0.8"/>
          <path d="M9.2 2c-0.8 2 -0.8 4 0 6s0.8 4 0 6" strokeOpacity="0.5"/>
        </svg>
      );
    // Punching: slab + column + perimeter
    case 'concreta-punching':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" className="shrink-0">
          <rect x="5" y="5" width="6" height="6"/>
          <circle cx="8" cy="8" r="6" strokeDasharray="2 1.5"/>
        </svg>
      );
    // Composite section: I-section with cover plate
    case 'concreta-composite-section':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" className="shrink-0">
          <path d="M3 3h10v2H3zM3 11h10v2H3zM7 5v6h2V5z"/>
        </svg>
      );
    // Retaining wall: L-shaped cantilever section (monolithic concrete — no
    // coursing, so it never reads as masonry) + backfill hatch behind the stem
    case 'concreta-retaining-wall':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <path d="M3 2.5H5.5V11H13.5V13.5H3Z"/>
          <path d="M7 10l2.2 -2.2M7 7.4l3 -3M8.4 5.6l2.4 -2.4" strokeWidth="0.75" strokeOpacity="0.6"/>
        </svg>
      );
    // Pile cap: cap + piles
    case 'concreta-pile-cap':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" className="shrink-0">
          <path d="M2 10h12M3 14l2-4M13 14l-2-4M8 2v8"/>
        </svg>
      );
    // Footing: T-shape
    case 'concreta-footings':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" className="shrink-0">
          <path d="M2 11h12M4 11V7h8v4M7 7V2h2v5"/>
        </svg>
      );
    // Forjado: plan view of a waffle/coffered slab (3×3 grid of cassettes)
    case 'concreta-forjados':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" className="shrink-0">
          <rect x="2" y="2" width="12" height="12"/>
          <path d="M6 2v12M10 2v12M2 6h12M2 10h12"/>
        </svg>
      );
    // FEM 1D: 4-node frame with diagonal — wire-frame model schematic
    case 'concreta-fem-2d':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden="true" className="shrink-0">
          <path d="M3 13V4M13 13V4M3 4h10M3 13l10-9"/>
          <circle cx="3" cy="4" r="1.1" fill="currentColor" stroke="none"/>
          <circle cx="13" cy="4" r="1.1" fill="currentColor" stroke="none"/>
          <circle cx="3" cy="13" r="1.1" fill="currentColor" stroke="none"/>
          <circle cx="13" cy="13" r="1.1" fill="currentColor" stroke="none"/>
        </svg>
      );
    // Empresillado: two parallel chords with horizontal battens
    case 'concreta-empresillado':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" aria-hidden="true" className="shrink-0">
          <path d="M4 2v12M12 2v12"/>
          <path d="M4 4.5h8M4 8h8M4 11.5h8" strokeWidth="1.4"/>
        </svg>
      );
    // Micropiles: small cap (encepado) + slender deep shaft going into ground
    // with lateral hatch — the "deep + slender" identity differentiates it
    // from pile-cap (which shows multiple piles flaring out from a cap).
    case 'concreta-micropiles':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" aria-hidden="true" className="shrink-0">
          {/* Encepado (cap) */}
          <rect x="3.5" y="2" width="9" height="2.5" rx="0.3"/>
          {/* Tube + grout: twin slender vertical lines */}
          <path d="M7.3 4.5v9 M8.7 4.5v9" strokeWidth="0.9"/>
          {/* Tip / bulb of injection at the base */}
          <path d="M6 13.5h4"/>
          {/* Ground hatching on both sides */}
          <path d="M2 6.5l1.4 -1.4 M2 9l1.4 -1.4 M2 11.5l1.4 -1.4" strokeWidth="0.6" strokeOpacity="0.55"/>
          <path d="M14 6.5l-1.4 -1.4 M14 9l-1.4 -1.4 M14 11.5l-1.4 -1.4" strokeWidth="0.6" strokeOpacity="0.55"/>
        </svg>
      );
    // Masonry walls: brick coursing with running bond + an opening
    case 'concreta-masonry-walls':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="0.9" aria-hidden="true" className="shrink-0">
          <rect x="2" y="2" width="12" height="12"/>
          <path d="M2 5h12M2 8h12M2 11h12"/>
          <path d="M5 2v3M9 2v3M5 8v3M9 8v3M7 5v3M11 5v3M7 11v3M11 11v3"/>
          <rect x="9.5" y="9" width="3" height="2.5" fill="currentColor" stroke="none" opacity="0.55"/>
        </svg>
      );
    default:
      return <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: 'currentColor' }} aria-hidden="true" />;
  }
}
