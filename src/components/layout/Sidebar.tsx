import { NavLink } from 'react-router';

import { moduleRegistry } from '../../data/moduleRegistry';
import { getRouteLoader } from '../../data/routeLoaders';
import { useRoutePrefetch } from '../../hooks/useRoutePrefetch';
import { ModuleIcon } from '../ui/ModuleIcon';
import { ObraMenu } from './ObraMenu';

const groups = Array.from(new Set(moduleRegistry.map((m) => m.group)));

/**
 * El grupo PROYECTO va antes que los módulos y no sale del registro: no son
 * cálculos con estado propio (los datos de obra escriben `concreta-obra`, del
 * contenedor; el anejo ordena lo guardado desde los módulos y monta el PDF).
 */
const PROYECTO = [
  { key: 'concreta-obra', route: '/obra', label: 'La obra', shipped: true },
  { key: 'concreta-anejo', route: '/proyecto/anejo', label: 'Anejo de cálculo', shipped: true },
] as const;

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  /** Cada incremento despliega el menú de obra (la ficha de obra de la topbar móvil). */
  peticionMenuObra?: number;
}

interface NavItemProps {
  itemKey: string;
  route: string;
  label: string;
  shipped: boolean;
  onPrefetch: (route: string, shipped: boolean) => void;
  onClose?: () => void;
}

function NavItem({ itemKey, route, label, shipped, onPrefetch, onClose }: NavItemProps) {
  return (
    <NavLink
      to={route}
      aria-disabled={!shipped}
      tabIndex={shipped ? undefined : -1}
      className={({ isActive }) =>
        [
          'relative flex items-center gap-2.5 px-4 py-[5px] text-[13px] transition-colors',
          shipped
            ? isActive
              ? 'text-accent'
              : 'text-text-secondary hover:text-text-primary cursor-pointer'
            : 'text-text-disabled cursor-default pointer-events-none',
        ].join(' ')
      }
      style={({ isActive }) => (isActive ? { background: 'var(--color-tint-accent)' } : undefined)}
      title={!shipped ? 'Próximamente' : undefined}
      onMouseEnter={() => onPrefetch(route, shipped)}
      onFocus={() => onPrefetch(route, shipped)}
      onClick={(e) => {
        if (!shipped) {
          e.preventDefault();
          return;
        }
        onClose?.();
      }}
    >
      {({ isActive }) => (
        <>
          {/* Active rail — 2px accent bar on left edge */}
          {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-accent" aria-hidden="true" />}
          <span style={{ opacity: isActive ? 1 : 0.75 }}>
            <ModuleIcon moduleKey={itemKey} />
          </span>
          <span>{label}</span>
          {!shipped && <span className="ml-auto text-[10px] text-text-disabled">pronto</span>}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ isOpen = false, onClose, peticionMenuObra = 0 }: SidebarProps) {
  const { prefetch } = useRoutePrefetch();

  const handlePrefetch = (route: string, shipped: boolean) => {
    if (!shipped) return;
    const loader = getRouteLoader(route);
    if (loader) prefetch(route, loader);
  };

  return (
    <nav
      className={[
        'w-[204px] shrink-0 h-full bg-bg-surface border-r border-border-main flex flex-col',
        // Mobile: fixed overlay drawer with slide transition
        'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50',
        'max-lg:transition-transform max-lg:duration-200 max-lg:ease-in-out',
        isOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
      ].join(' ')}
      aria-label="Navegación de módulos"
    >
      {/* Logo — favicon I-beam mark + lowercase wordmark.
          items-baseline puts the mark's bottom edge on the wordmark's baseline
          (a replaced element's baseline is its bottom margin edge), so the two
          share a bottom line instead of a centre line. h-5 pins the lockup to
          the mark's own height so the descender slack below the baseline does
          not push the pair off the header's centre line. */}
      <div className="flex items-center px-4 h-12 border-b border-border-main">
        <span className="flex items-baseline gap-2 h-5">
          <img src="/favicon.svg" alt="" width={20} height={20} className="shrink-0 rounded-sm" aria-hidden="true" />
          <span className="text-[15px] font-semibold leading-none text-text-primary" style={{ letterSpacing: '-0.02em' }}>
            concreta
            <span className="text-accent" aria-hidden="true">
              .
            </span>
          </span>
        </span>
        {/* Close button — mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto lg:hidden p-3 -mr-2 text-text-disabled hover:text-text-secondary transition-colors"
            aria-label="Cerrar menú"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* La obra abierta y su menú: el único sitio global de la app para ello. */}
      <ObraMenu peticionApertura={peticionMenuObra} />

      {/* Module groups */}
      <div className="flex-1 overflow-y-auto scroll-hide py-1.5">
        <div>
          <p className="px-4 py-0.5 text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.11em' }}>
            Proyecto
          </p>
          {PROYECTO.map((item) => (
            <NavItem key={item.key} itemKey={item.key} route={item.route} label={item.label} shipped={item.shipped} onPrefetch={handlePrefetch} onClose={onClose} />
          ))}
        </div>
        {groups.map((group) => (
          <div key={group} style={{ marginTop: 12 }}>
            <p className="px-4 py-0.5 text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.11em' }}>
              {group}
            </p>
            {moduleRegistry
              .filter((m) => m.group === group)
              .map((mod) => (
                <NavItem key={mod.key} itemKey={mod.key} route={mod.route} label={mod.label} shipped={mod.shipped} onPrefetch={handlePrefetch} onClose={onClose} />
              ))}
          </div>
        ))}
      </div>

      {/* Footer: version + search */}
      <div className="px-4 py-2 border-t border-border-main flex items-center justify-between">
        <span className="text-[10px] text-text-disabled font-mono" title="Versión de Concreta">
          v{__APP_VERSION__}
        </span>
        <button title="Búsqueda" className="text-text-disabled hover:text-text-secondary transition-colors" aria-label="Búsqueda">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3 3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
