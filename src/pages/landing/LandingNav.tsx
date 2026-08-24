// LandingNav — sticky top nav shared by the landing and the /normativa subpage.
// Section links use the `/#anchor` form so they work from any route; ScrollToHash
// (mounted on the landing) does the scrolling. "Normativa" is a real route.

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { APP_ROUTE, BETA, BETA_CTA } from './constants';
import { ThemeToggle } from '../../components/theme/ThemeToggle';

interface NavLink {
  label: string;
  to: string;
}

// Order mirrors SECTION_ORDER on the landing — Módulos, then Asistente.
const NAV_LINKS: NavLink[] = [
  { label: 'Módulos', to: '/#modulos' },
  { label: 'Asistente', to: '/#asistente' },
  { label: 'Filosofía', to: '/#filosofia' },
  { label: 'Normativa', to: '/normativa' },
  { label: 'Precio', to: '/pricing' },
  { label: 'Blog', to: '/blog' },
  { label: 'About', to: '/about' },
];

export function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu on any navigation (route or hash change).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the menu in response to a route/hash change
  useEffect(() => { setMenuOpen(false); }, [location.key]);

  // Route links (no hash) show as active on their page (and child routes,
  // e.g. Blog stays active on /blog/:slug); section links never do.
  const active = (to: string) =>
    !to.includes('#') &&
    (location.pathname === to || location.pathname.startsWith(`${to}/`));

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link to="/" className="brand">
          <span className="brand-dot" />
          <span>Concreta</span>
        </Link>
        <nav className="nav-links">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={active(l.to) ? 'active' : undefined}
              aria-current={active(l.to) ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <ThemeToggle />
          {/* Nothing is purchasable during the beta, so the loud button is the
              one that actually delivers something: it opens the app. "Ver
              precios" keeps its slot but steps down to the quiet style — it
              opens a price table, and no button on this site should promise
              more than its destination does. */}
          <Link to="/pricing" className="btn btn-ghost">Ver precios</Link>
          <Link to={APP_ROUTE} className="btn btn-primary">
            {BETA ? BETA_CTA : 'Acceder'} <span className="arr">→</span>
          </Link>
        </div>
        <button
          type="button"
          className="nav-burger"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            {menuOpen ? (
              <>
                <line x1="5" y1="5" x2="19" y2="19" />
                <line x1="19" y1="5" x2="5" y2="19" />
              </>
            ) : (
              <>
                <line x1="3" y1="7" x2="21" y2="7" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </>
            )}
          </svg>
        </button>
      </div>
      {menuOpen && (
        <nav className="nav-mobile-menu">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={active(l.to) ? 'active' : undefined}
              aria-current={active(l.to) ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
          <div className="nav-mobile-actions">
            <ThemeToggle />
            <Link to="/pricing" className="btn btn-ghost">Ver precios</Link>
            <Link to={APP_ROUTE} className="btn btn-primary">
              {BETA ? BETA_CTA : 'Acceder'} <span className="arr">→</span>
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
