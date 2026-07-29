// Hero.tsx — landing hero: eyebrow + title + sub + CTAs + meta strip, and a
// rotating product frame that cycles through four modules (design 2026-07-15).
//
// The frame shows one module at a time — RC beams, steel beams, retaining wall,
// FEM — to communicate the breadth of disciplines Concreta covers. Honest links:
// FEM opens its preloaded case (deep-link); the other three open their real
// module via its route. Each slide draws a real schematic (canvases.tsx), never
// the hand-drawn full-UI replica (AppPreview) that drifted from the app.

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { MODULE_LIBRARY } from '../../modules';
import { HERO_SLIDES } from '../../heroCase';
import { HERO_CANVASES } from './canvases';
import './hero.css';

// Derived from the module library so the headline count never drifts from the
// grid (design-review T5). Never hardcode the number here — it is wrong within
// a fortnight; the previous comment said "Today: 18" while 19 shipped.
const MODULE_COUNT = MODULE_LIBRARY.length;

const ROTATE_MS = 4500;

// The headline leads with the product, not with the assistant (decision
// 2026-07-27): Concreta's value is 19 audited modules with Spanish code cited
// per check, and the AI is a feature inside that — not the identity. A draft
// that led with "Enséñale el croquis" was reverted for exactly that reason.
// Keep it short too: at ~50 chars this wraps to five lines and pushes the
// hero-meta strip below the fold at 1440×900 and 1366×768.
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

// "Ver precios", not "Suscribirse": the button opens a price table, and nothing
// on the site is purchasable yet (no licence gate, so the paid CTAs are mailto).
// Same reason the nav button and Pricing.tsx:52 were changed.
function HeroCTAs() {
  return (
    <div className="hero-cta">
      <Link to="/pricing" className="btn btn-primary btn-lg">
        Ver precios <span className="arr">→</span>
      </Link>
      <Link to="/#modulos" className="btn btn-lg">Ver módulos</Link>
    </div>
  );
}

function HeroMeta() {
  return (
    <div className="hero-meta">
      <div className="hero-meta-item">
        <div className="hero-meta-v mono">{MODULE_COUNT}</div>
        <div className="hero-meta-l">módulos</div>
      </div>
      <div className="hero-meta-item">
        <div className="hero-meta-v mono">PDF</div>
        <div className="hero-meta-l">vectorial en 5&nbsp;s</div>
      </div>
      {/* The assistant takes this slot rather than the PDF one: the PDF is the
          wedge (it is what Pro charges for) and PWA is still argued in
          Filosofía and in the CYPE comparison table. */}
      <div className="hero-meta-item">
        <div className="hero-meta-v mono">IA</div>
        <div className="hero-meta-l">asistente en cada módulo</div>
      </div>
      <div className="hero-meta-item">
        <div className="hero-meta-v mono">CE · CTE</div>
        <div className="hero-meta-l">art. citado en cada check</div>
      </div>
    </div>
  );
}

export function Hero() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // Auto-advance the carousel; pause on hover/focus. Reduced-motion is handled
    // in CSS (the slide-in + progress-bar animations are dropped), but the slides
    // still cycle — showing all four is the point.
    if (paused) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % HERO_SLIDES.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused]);

  const slide = HERO_SLIDES[idx];
  const Canvas = HERO_CANVASES[slide.canvas];

  const pause = { onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false) };

  return (
    <section className="hero">
      <div className="container hero-inner-split">
        <div className="hero-copy">
          <HeroEyebrow />
          <h1 className="hero-title">{HERO_TAGLINE}</h1>
          <p className="hero-sub">{HERO_SUB}</p>
          <HeroCTAs />
          <HeroMeta />
        </div>

        <div className="hero-preview hero-preview-carousel" {...pause}>
          <Link
            key={slide.id}
            to={slide.href}
            className="hero-preview-frame hero-slide"
            aria-label={`Abrir en la app: ${slide.module} — ${slide.name}`}
          >
            <div className="hero-slide-bar">
              <div className="hero-slide-bread mono">
                <span>{slide.group}</span>
                <span className="dim">/</span>
                <span>{slide.module}</span>
                <span className="dim">/</span>
                <span className="hero-slide-sub">{slide.name}</span>
              </div>
              <span className="hero-slide-tag mono dim">{slide.tag}</span>
            </div>
            <div className="hero-slide-canvas dot-grid">
              <Canvas />
            </div>
            <div className="hero-slide-foot mono">
              <span className="hero-slide-facts">{slide.facts}</span>
              <span className="hero-slide-open">
                {slide.cta} <span className="arr">→</span>
              </span>
            </div>
          </Link>

          <div
            className="hero-slide-tabs"
            role="tablist"
            aria-label="Módulos de ejemplo"
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            {HERO_SLIDES.map((s, i) => (
              <button
                type="button"
                key={s.id}
                role="tab"
                aria-selected={i === idx}
                className={`hero-slide-tab ${i === idx ? 'active' : ''}`}
                onClick={() => { setIdx(i); setPaused(true); }}
              >
                <span className="st-name">{s.tabLabel}</span>
                {i === idx && !paused && <span key={`p${idx}`} className="st-progress" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
