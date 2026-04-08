import { NavLink } from 'react-router';

import { moduleRegistry } from '../../data/moduleRegistry';

// Small structural icons per module key
function ModuleIcon({ moduleKey, size = 12 }: { moduleKey: string; size?: number }) {
  const s = size;
  switch (moduleKey) {
    // RC beam: rectangular cross-section with rebar dots
    case 'concreta-rc-beams':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <rect x="2" y="4" width="20" height="16" />
          <circle cx="6" cy="18" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="18" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    // RC column: square cross-section with corner bars
    case 'concreta-rc-columns':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <rect x="4" y="4" width="16" height="16" />
          <circle cx="7" cy="7"   r="1.5" fill="currentColor" stroke="none" />
          <circle cx="17" cy="7"  r="1.5" fill="currentColor" stroke="none" />
          <circle cx="7" cy="17"  r="1.5" fill="currentColor" stroke="none" />
          <circle cx="17" cy="17" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    // Steel column: I-profile vertical
    case 'concreta-steel-columns':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <rect x="3"  y="2"  width="18" height="3.5" />
          <rect x="10" y="5.5" width="4" height="13" />
          <rect x="3"  y="18.5" width="18" height="3.5" />
        </svg>
      );
    // Steel beam: I-profile
    case 'concreta-steel-beams':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <rect x="2" y="3"    width="20" height="3.5" />
          <rect x="10" y="6.5" width="4"  height="11"  />
          <rect x="2" y="17.5" width="20" height="3.5" />
        </svg>
      );
    // Retaining wall: cantilever L-profile (stem + footing)
    case 'concreta-retaining-wall':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <rect x="8" y="2" width="4" height="15" />
          <rect x="4" y="17" width="16" height="5" />
        </svg>
      );
    // Punching: slab plan view with column square + u1 perimeter circle
    case 'concreta-punching':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <rect x="9" y="9" width="6" height="6" />
          <circle cx="12" cy="12" r="9" strokeDasharray="3 2" />
        </svg>
      );
    // Composite section: I-section with cover plate on top
    case 'concreta-composite-section':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          {/* cover plate */}
          <rect x="3"  y="1"  width="18" height="3" />
          {/* top flange */}
          <rect x="5"  y="4"  width="14" height="3" />
          {/* web */}
          <rect x="10" y="7"  width="4"  height="9" />
          {/* bottom flange */}
          <rect x="5"  y="16" width="14" height="3" />
        </svg>
      );
    // Pile cap: plan view — column square + 4 pile circles
    case 'concreta-pile-cap':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          {/* Pile cap outline */}
          <rect x="2" y="2" width="20" height="20" />
          {/* Column */}
          <rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none" opacity="0.5" />
          {/* Piles — 4 corners */}
          <circle cx="5"  cy="5"  r="1.8" fill="currentColor" stroke="none" />
          <circle cx="19" cy="5"  r="1.8" fill="currentColor" stroke="none" />
          <circle cx="5"  cy="19" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="19" cy="19" r="1.8" fill="currentColor" stroke="none" />
        </svg>
      );
    // Footing: T-shape foundation
    case 'concreta-footings':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <rect x="9.5" y="2"  width="5"  height="9" />
          <rect x="2"   y="11" width="20" height="6" />
          <line x1="2" y1="19" x2="22" y2="19" />
        </svg>
      );
    // Empresillado: column cross-section with 4 corner L-angles
    case 'concreta-empresillado':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          {/* Inner column square */}
          <rect x="7" y="7" width="10" height="10" />
          {/* 4 corner L-angles (two short segments per corner) */}
          {/* Top-left */}
          <polyline points="7,3 3,3 3,7" />
          {/* Top-right */}
          <polyline points="17,3 21,3 21,7" />
          {/* Bottom-left */}
          <polyline points="7,21 3,21 3,17" />
          {/* Bottom-right */}
          <polyline points="17,21 21,21 21,17" />
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
        'w-[190px] shrink-0 h-full bg-bg-surface border-r border-border-main flex flex-col',
        // Mobile: fixed overlay drawer with slide transition
        'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50',
        'max-md:transition-transform max-md:duration-200 max-md:ease-in-out',
        isOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
      ].join(' ')}
      aria-label="Navegación de módulos"
    >
      {/* Logo */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <span className="w-[7px] h-[7px] rounded-full bg-accent shrink-0" aria-hidden="true" />
        <span className="text-[15px] font-semibold text-text-primary tracking-tight">Concreta</span>
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
      <div className="flex-1 overflow-y-auto scroll-hide py-1">
        {groups.map((group) => (
          <div key={group} className="mt-2">
            <p className="px-[14px] py-[9px] pb-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-text-disabled">
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
                      'flex items-center gap-2 px-[14px] py-2 text-[13px] border-b border-border-sub transition-colors',
                      mod.shipped
                        ? isActive
                          ? 'text-accent bg-accent/5'
                          : 'text-text-secondary hover:text-text-primary cursor-pointer'
                        : 'text-text-disabled cursor-default pointer-events-none',
                    ].join(' ')
                  }
                  title={!mod.shipped ? 'Próximamente' : undefined}
                  onClick={(e) => {
                    if (!mod.shipped) { e.preventDefault(); return; }
                    onClose?.();
                  }}
                >
                  {() => (
                    <>
                      <ModuleIcon moduleKey={mod.key} size={12} />
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

      {/* App version */}
      <div className="px-4 py-3 border-t border-border-main">
        <span className="text-[11px] text-text-disabled font-mono">v0.1.0</span>
      </div>
    </nav>
  );
}
