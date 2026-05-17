// LandingNav — sticky top nav shared by the landing and the /normativa subpage.
// Section links use the `/#anchor` form so they work from any route; ScrollToHash
// (mounted on the landing) does the scrolling. "Normativa" is a real route.

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { APP_ROUTE } from './constants';

interface NavLink {
  label: string;
  to: string;
}

const NAV_LINKS: NavLink[] = [
  { label: 'Módulos', to: '/#modulos' },
  { label: 'Filosofía', to: '/#filosofia' },
  { label: 'Normativa', to: '/normativa' },
  { label: 'Precio', to: '/#pricing' },
  { label: 'Blog', to: '/#blog' },
  { label: 'About', to: '/#about-teaser' },
];

export function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu on any navigation (route or hash change).
  useEffect(() => { setMenuOpen(false); }, [location.key]);

  // Only "Normativa" is a real route; section links never show as active.
  const active = (to: string) => to === '/normativa' && location.pathname === '/normativa';

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
          <Link to={APP_ROUTE} className="btn btn-ghost">Acceder</Link>
          <Link to="/#pricing" className="btn btn-primary">
            Suscribirse <span className="arr">→</span>
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
            <Link to={APP_ROUTE} className="btn btn-ghost">Acceder</Link>
            <Link to="/#pricing" className="btn btn-primary">
              Suscribirse <span className="arr">→</span>
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
