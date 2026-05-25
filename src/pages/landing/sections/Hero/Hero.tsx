// Hero.tsx — landing hero with eyebrow, title, sub, CTAs, meta strip, and
// a rotating module preview carousel.

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AppPreview, MODULE_CONFIG } from '../../AppPreview';
import './hero.css';

const HERO_TAGLINE = 'El cálculo estructural que no te frena.';
const HERO_SUB =
  'Concreta es la herramienta de cálculo estructural pensada por arquitectos e ingenieros calculistas españoles: comprobaciones normativas rápidas, trazables y defendibles ante visado y obra.';

const CAROUSEL_ORDER = ['rc-beams', 'rc-punching', 'steel-beams', 'walls', 'timber'];

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
      <Link to="/pricing" className="btn btn-primary btn-lg">
        Suscribirse <span className="arr">→</span>
      </Link>
      <Link to="/#modulos" className="btn btn-lg">Ver módulos</Link>
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

export function HeroCarousel() {
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
