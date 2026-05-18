import { NavLink } from 'react-router';

import { moduleRegistry } from '../../data/moduleRegistry';
import { ModuleIcon } from '../ui/ModuleIcon';

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
      {/* Logo — favicon I-beam mark + brand */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-border-main">
        <img
          src="/favicon.svg"
          alt=""
          width={20}
          height={20}
          className="shrink-0 rounded-sm"
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
      <div className="flex-1 overflow-y-auto scroll-hide py-1.5">
        {groups.map((group, gi) => (
          <div key={group} style={{ marginTop: gi === 0 ? 0 : 12 }}>
            <p className="px-4 py-0.5 text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.11em' }}>
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
                      'relative flex items-center gap-2.5 px-4 py-[5px] text-[13px] transition-colors',
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
        <span className="text-[10px] text-text-disabled font-mono">v0.1.1</span>
        <button title="Búsqueda" className="text-text-disabled hover:text-text-secondary transition-colors" aria-label="Búsqueda">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
            <circle cx="7" cy="7" r="4"/><path d="M10 10l3 3" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </nav>
  );
}
