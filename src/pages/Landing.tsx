// Landing — Concreta marketing page.
// Recreated from the Claude Design handoff bundle (concreta-relanding).
// Single-page landing: hero carousel + module library + export/share +
// philosophy + normativa + resources + pricing + blog + about + closing CTA.

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Helmet } from 'react-helmet-async';
import { AppPreview, MODULE_CONFIG } from './landing/AppPreview';
import {
  ModulesSection,
  OutputSection,
  PhilosophySection,
  NormativaSection,
  DemoDocsSection,
  PricingSection,
  BlogSection,
  AboutSection,
  ClosingCTA,
} from './landing/sections';
import { APP_ROUTE } from './landing/constants';
import './landing.css';

// ── Hero building blocks ───────────────────────────────────────────────────────
const NAV_LINKS: readonly [string, string][] = [
  ['#modulos', 'Módulos'],
  ['#filosofia', 'Filosofía'],
  ['#normativa', 'Normativa'],
  ['#pricing', 'Precio'],
  ['#blog', 'Blog'],
  ['#about-teaser', 'About'],
];

const HERO_TAGLINE = 'El cálculo estructural que no te frena.';
const HERO_SUB =
  'Concreta es la herramienta de cálculo estructural pensada por arquitectos e ingenieros calculistas españoles: comprobaciones normativas rápidas, trazables y defendibles ante visado y obra.';

function HeroEyebrow() {
  return (
    <div className="hero-eyebrow">
      <span className="hero-eyebrow-dot" />
      <span>CÁLCULO ESTRUCTURAL · CE · CTE · EUROCÓDIGOS</span>
    </div>
  );
}

function HeroCTAs() {
  return (
    <div className="hero-cta">
      <a href="#pricing" className="btn btn-primary btn-lg">
        Suscribirse <span className="arr">→</span>
      </a>
      <a href="#modulos" className="btn btn-lg">Ver módulos</a>
    </div>
  );
}

function HeroMeta() {
  return (
    <div className="hero-meta">
      <div className="hero-meta-item">
        <div className="hero-meta-v mono">12+</div>
        <div className="hero-meta-l">módulos</div>
      </div>
      <div className="hero-meta-item">
        <div className="hero-meta-v mono">PDF</div>
        <div className="hero-meta-l">vectorial en 5 s</div>
      </div>
      <div className="hero-meta-item">
        <div className="hero-meta-v mono">PWA</div>
        <div className="hero-meta-l">offline · sin login</div>
      </div>
      <div className="hero-meta-item">
        <div className="hero-meta-v mono">CE · CTE</div>
        <div className="hero-meta-l">art. citado en cada check</div>
      </div>
    </div>
  );
}

// ── Hero — carousel variant (modules rotating) ─────────────────────────────────
const CAROUSEL_ORDER = ['rc-beams', 'rc-punching', 'steel-beams', 'walls', 'timber'];

function HeroCarousel() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    // Respect reduced-motion: no auto-advance. Tabs still work on click/keyboard.
    // matchMedia is absent in some environments (jsdom, SSR) — guard it.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % CAROUSEL_ORDER.length), 4000);
    return () => clearInterval(timer);
  }, [paused]);

  const current = CAROUSEL_ORDER[idx];
  const cfg = MODULE_CONFIG[current];

  return (
    <section className="hero">
      <div className="container hero-inner-split">
        <div className="hero-copy">
          <HeroEyebrow />
          <h1 className="hero-title">{HERO_TAGLINE}</h1>
          <p className="hero-sub">{HERO_SUB}</p>
          <HeroCTAs />
          <div
            className="hero-carousel-tabs"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            {CAROUSEL_ORDER.map((m, i) => (
              <button
                type="button"
                key={m}
                className={`hero-carousel-tab ${i === idx ? 'active' : ''}`}
                onClick={() => { setIdx(i); setPaused(true); }}
              >
                <span className="mono ht-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="ht-name">{MODULE_CONFIG[m].name}</span>
                <span className="ht-group mono dim">{MODULE_CONFIG[m].group}</span>
                {i === idx && !paused && <span key={`p${idx}`} className="ht-progress" />}
              </button>
            ))}
          </div>
          <HeroMeta />
        </div>
        <div
          className="hero-preview hero-preview-carousel"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="hero-preview-frame" key={current}>
            <AppPreview moduleId={current} accent="var(--accent)" />
          </div>
          <div className="hero-preview-caption mono">
            <span>{cfg.group.toLowerCase()} / {cfg.name.toLowerCase()}</span>
            <span className="dim">{idx + 1} / {CAROUSEL_ORDER.length}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-root">
      <Helmet>
        <title>Concreta — Cálculo estructural para el día a día</title>
        <meta
          name="description"
          content="Herramienta web de cálculo estructural para arquitectos e ingenieros. Normativa española (CE, CTE). PWA local, sin backend, sin cuentas."
        />
      </Helmet>

      {/* Top nav */}
      <header className="nav">
        <div className="container nav-inner">
          <a href="#top" className="brand">
            <span className="brand-dot" />
            <span>Concreta</span>
          </a>
          <nav className="nav-links">
            {NAV_LINKS.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
          <div className="nav-right">
            <Link to={APP_ROUTE} className="btn btn-ghost">Acceder</Link>
            <a href="#pricing" className="btn btn-primary">
              Suscribirse <span className="arr">→</span>
            </a>
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
            {NAV_LINKS.map(([href, label]) => (
              <a key={href} href={href} onClick={closeMenu}>{label}</a>
            ))}
            <div className="nav-mobile-actions">
              <Link to={APP_ROUTE} className="btn btn-ghost" onClick={closeMenu}>Acceder</Link>
              <a href="#pricing" className="btn btn-primary" onClick={closeMenu}>
                Suscribirse <span className="arr">→</span>
              </a>
            </div>
          </nav>
        )}
      </header>

      <main id="top">
        <HeroCarousel />
        <ModulesSection />
        <OutputSection />
        <PhilosophySection />
        <NormativaSection />
        <DemoDocsSection />
        <PricingSection />
        <BlogSection />
        <AboutSection />
        <ClosingCTA />
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div>
              <div className="brand" style={{ marginBottom: 12 }}>
                <span className="brand-dot" />
                <span>Concreta</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: '32ch', margin: 0, lineHeight: 1.55 }}>
                Cálculo estructural para el día a día. Sin backend. Sin
                cuentas. Tus datos son tuyos.
              </p>
            </div>
            <div>
              <h6>Producto</h6>
              <ul>
                <li><a href="#modulos">Módulos</a></li>
                <li><a href="#pricing">Precio</a></li>
                <li><a href="#normativa">Normativa</a></li>
                <li><a href="#recursos">Demo</a></li>
              </ul>
            </div>
            <div>
              <h6>Recursos</h6>
              <ul>
                <li><a href="#blog">Blog</a></li>
                <li><a href="#normativa">Documentación</a></li>
                <li><a href="#recursos">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h6>Compañía</h6>
              <ul>
                <li><a href="#about-teaser">Sobre Concreta</a></li>
                <li><a href="#filosofia">Manifiesto</a></li>
                <li><a href="mailto:hola@concreta.tools">Contacto</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Concreta · Javier Ramírez Bandera</span>
            <span>v0.4.2 · concreta.tools</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
