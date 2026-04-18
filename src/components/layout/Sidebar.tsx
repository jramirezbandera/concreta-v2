import { NavLink } from 'react-router';

import { moduleRegistry } from '../../data/moduleRegistry';

// Small structural icons per module key — material-specific designs
function ModuleIcon({ moduleKey, size = 14 }: { moduleKey: string; size?: number }) {
  const s = size;
  switch (moduleKey) {
    // RC beam: solid rectangle + rebar dots (visible longitudinal reinforcement)
    case 'concreta-rc-beams':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" className="shrink-0">
          <rect x="2" y="5" width="12" height="6" rx="0.5"/>
          <circle cx="4.2" cy="6.8" r="0.7" fill="currentColor" stroke="none"/>
          <circle cx="11.8" cy="6.8" r="0.7" fill="currentColor" stroke="none"/>
          <circle cx="4.2" cy="9.2" r="0.7" fill="currentColor" stroke="none"/>
          <circle cx="11.8" cy="9.2" r="0.7" fill="currentColor" stroke="none"/>
        </svg>
      );
    // RC column: square cross-section with corner rebar dots
    case 'concreta-rc-columns':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" className="shrink-0">
          <rect x="5" y="2" width="6" height="12" rx="0.5"/>
          <circle cx="6.8" cy="4.2" r="0.7" fill="currentColor" stroke="none"/>
          <circle cx="9.2" cy="4.2" r="0.7" fill="currentColor" stroke="none"/>
          <circle cx="6.8" cy="11.8" r="0.7" fill="currentColor" stroke="none"/>
          <circle cx="9.2" cy="11.8" r="0.7" fill="currentColor" stroke="none"/>
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
    // Retaining wall: wall elevation with coursing
    case 'concreta-retaining-wall':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" className="shrink-0">
          <rect x="2" y="3" width="12" height="10"/>
          <path d="M2 6h12M2 9h12M5 3v3M9 3v3M3 6v3M7 6v3M11 6v3M5 9v4M9 9v4" strokeWidth="0.75" strokeOpacity="0.7"/>
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
    // Empresillado: two parallel chords with horizontal battens
    case 'concreta-empresillado':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" aria-hidden="true" className="shrink-0">
          <path d="M4 2v12M12 2v12"/>
          <path d="M4 4.5h8M4 8h8M4 11.5h8" strokeWidth="1.4"/>
        </svg>
      );
    default:
      return <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: 'currentColor' }} aria-hidden="true" />;
  }
}

const groups = Array.from(new Set(moduleRegistry.map((m) => m.group)));

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  return (
    <nav
      className={[
        'w-[204px] shrink-0 h-full bg-bg-surface border-r border-border-main flex flex-col',
        // Mobile: fixed overlay drawer with slide transition
        'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50',
        'max-md:transition-transform max-md:duration-200 max-md:ease-in-out',
        isOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
      ].join(' ')}
      aria-label="Navegación de módulos"
    >
      {/* Logo — glowing accent dot + brand */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-border-main">
        <span
          className="w-[7px] h-[7px] rounded-full bg-accent shrink-0"
          style={{ boxShadow: '0 0 8px rgba(56,189,248,0.6)' }}
          aria-hidden="true"
        />
        <span className="text-[15px] font-semibold text-text-primary" style={{ letterSpacing: '-0.01em' }}>Concreta</span>
        {/* Close button — mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto md:hidden p-3 -mr-2 text-text-disabled hover:text-text-secondary transition-colors"
            aria-label="Cerrar menú"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Module groups */}
      <div className="flex-1 overflow-y-auto scroll-hide py-2.5">
        {groups.map((group, gi) => (
          <div key={group} style={{ marginTop: gi === 0 ? 0 : 14 }}>
            <p className="px-4 py-1 pb-1.5 text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.11em' }}>
              {group}
            </p>
            {moduleRegistry
              .filter((m) => m.group === group)
              .map((mod) => (
                <NavLink
                  key={mod.key}
                  to={mod.route}
                  aria-disabled={!mod.shipped}
                  tabIndex={mod.shipped ? undefined : -1}
                  className={({ isActive }) =>
                    [
                      'relative flex items-center gap-2.5 px-4 py-[7px] text-[13px] transition-colors',
                      mod.shipped
                        ? isActive
                          ? 'text-accent'
                          : 'text-text-secondary hover:text-text-primary cursor-pointer'
                        : 'text-text-disabled cursor-default pointer-events-none',
                    ].join(' ')
                  }
                  style={({ isActive }) => isActive ? { background: 'rgba(56,189,248,0.06)' } : undefined}
                  title={!mod.shipped ? 'Próximamente' : undefined}
                  onClick={(e) => {
                    if (!mod.shipped) { e.preventDefault(); return; }
                    onClose?.();
                  }}
                >
                  {({ isActive }) => (
                    <>
                      {/* Active rail — 2px accent bar on left edge */}
                      {isActive && (
                        <span
                          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-accent"
                          aria-hidden="true"
                        />
                      )}
                      <span style={{ opacity: isActive ? 1 : 0.75 }}>
                        <ModuleIcon moduleKey={mod.key} />
                      </span>
                      <span>{mod.label}</span>
                      {!mod.shipped && (
                        <span className="ml-auto text-[10px] text-text-disabled">pronto</span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
          </div>
        ))}
      </div>

      {/* Footer: version + search */}
      <div className="px-4 py-2 border-t border-border-main flex items-center justify-between">
        <span className="text-[10px] text-text-disabled font-mono">v0.2.0</span>
        <button title="Búsqueda" className="text-text-disabled hover:text-text-secondary transition-colors" aria-label="Búsqueda">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
            <circle cx="7" cy="7" r="4"/><path d="M10 10l3 3" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </nav>
  );
}
