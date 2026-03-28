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
    // Steel beam: I-profile
    case 'concreta-steel-beams':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <rect x="2" y="3"    width="20" height="3.5" />
          <rect x="10" y="6.5" width="4"  height="11"  />
          <rect x="2" y="17.5" width="20" height="3.5" />
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
    default:
      return <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: 'currentColor' }} aria-hidden="true" />;
  }
}

const groups = Array.from(new Set(moduleRegistry.map((m) => m.group)));

export function Sidebar() {
  return (
    <nav
      className="w-[190px] shrink-0 h-full bg-bg-surface border-r border-border-main flex flex-col"
      aria-label="Navegación de módulos"
    >
      {/* Logo */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <span className="w-[7px] h-[7px] rounded-full bg-accent shrink-0" aria-hidden="true" />
        <span className="text-[15px] font-semibold text-text-primary tracking-tight">Concreta</span>
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
                  onClick={(e) => { if (!mod.shipped) e.preventDefault(); }}
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
