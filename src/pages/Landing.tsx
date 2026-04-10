import { useEffect } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { moduleRegistry } from '../data/moduleRegistry';

// Scroll-reveal: add `.in` when element enters viewport
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.sr');
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); }),
      { threshold: 0.1 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ── Category icons ────────────────────────────────────────────────────────────
// width/height 18, viewBox 0 0 24 24, stroke-based

function BeamIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="18" />
      <rect x="4.5" y="5.5" width="15" height="13" strokeDasharray="2.5 1.5" strokeWidth="0.72" />
      <circle cx="7.5" cy="18.8" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.8" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="18.8" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="6.2" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="6.2" r="1.05" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SteelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="3.5" />
      <rect x="10" y="6.5" width="4" height="11" />
      <rect x="2" y="17.5" width="20" height="3.5" />
    </svg>
  );
}

function FootingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9.5" y="2" width="5" height="10" />
      <rect x="2.5" y="12" width="19" height="6" />
      <line x1="1" y1="20" x2="23" y2="20" />
      <line x1="2" y1="20" x2="4.5" y2="22.5" strokeWidth="0.9" />
      <line x1="6" y1="20" x2="8.5" y2="22.5" strokeWidth="0.9" />
      <line x1="10" y1="20" x2="12.5" y2="22.5" strokeWidth="0.9" />
      <line x1="14" y1="20" x2="16.5" y2="22.5" strokeWidth="0.9" />
      <line x1="18" y1="20" x2="20.5" y2="22.5" strokeWidth="0.9" />
    </svg>
  );
}

function TimberIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Solid timber cross-section — grain lines distinguish from RC beam */}
      <rect x="2" y="2" width="20" height="20" />
      <line x1="8" y1="2" x2="8" y2="22" strokeWidth="0.6" />
      <line x1="14" y1="2" x2="14" y2="22" strokeWidth="0.6" />
      <line x1="2" y1="8" x2="22" y2="8" strokeWidth="0.6" />
      <line x1="2" y1="16" x2="22" y2="16" strokeWidth="0.6" />
    </svg>
  );
}

function RehabIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Battened built-up column — two plates + horizontal lacings */}
      <rect x="2" y="2" width="5" height="20" />
      <rect x="17" y="2" width="5" height="20" />
      <line x1="7" y1="6.5" x2="17" y2="6.5" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="7" y1="17.5" x2="17" y2="17.5" />
    </svg>
  );
}

const GROUP_ICON: Record<string, React.ReactElement> = {
  'Hormigón':       <BeamIcon />,
  'Acero':          <SteelIcon />,
  'Cimentación':    <FootingIcon />,
  'Madera':         <TimberIcon />,
  'Rehabilitación': <RehabIcon />,
};

// ── Module descriptions ───────────────────────────────────────────────────────

const MODULE_DESC: Record<string, string> = {
  '/horm/vigas':               'Flexión, cortante y fisuración. CE art. 22–26',
  '/horm/pilares':             'Compresión + pandeo biaxial. CE art. 35',
  '/horm/punzonamiento':       'Losa maciza, perímetros críticos. CE art. 6.4',
  '/acero/vigas':              'Flexión, LTB y deflexión. EC3 §6.2–6.3',
  '/acero/pilares':            'Pandeo + empresillado batido. EC3 §6.4',
  '/acero/seccion-compuesta':  'Steiner, clase de sección, W_pl por bandas',
  '/ciment/zapatas':           'Zapata aislada. CTE DB-SE-C art. 4.3',
  '/ciment/muros':             'Muro HA con tabla de agua. CE art. 9',
  '/ciment/encepados':         'Encepado bielas-tirantes. CE art. 48',
  '/madera/vigas':             'Flexión, cortante y fuego R30–R120. EC5 §6.1',
  '/madera/pilares':           'Pandeo biaxial y fuego. EC5 §6.3',
  '/rehab/empresillado':       'Pilar compuesto batido. EC3 §6.4.2',
};

// ── Features strip data ───────────────────────────────────────────────────────

const FEATURES = [
  { title: 'Rápido', text: 'Resultados instantáneos. Sin esperas ni instalación.' },
  { title: 'Legible', text: 'Salida con unidades y nomenclatura técnica estándar.' },
  { title: 'Normativa española', text: 'Basado en el Código Estructural y CTE.' },
];

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({ group, index }: { group: string; index: number }) {
  const mods = moduleRegistry.filter((m) => m.group === group);
  const icon = GROUP_ICON[group];

  return (
    <div className={`sr sr-d${Math.min(index + 1, 5)} mb-10`}>
      {/* Group header */}
      <div className="flex items-center gap-3 mb-3">
        {icon && <span className="text-accent/50">{icon}</span>}
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-disabled whitespace-nowrap">
          {group}
        </p>
        <div className="flex-1 h-px bg-border-main" />
        <span className="text-[10px] font-mono text-text-disabled">
          {mods.length} {mods.length === 1 ? 'módulo' : 'módulos'}
        </span>
      </div>

      {/* Module cards */}
      <div
        className="grid gap-px bg-border-main border border-border-main rounded-md overflow-hidden"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
      >
        {mods.map((mod) => {
          const route = mod.route.replace(/^\//, '');
          return (
            <Link
              key={mod.route}
              to={`/${route}`}
              className="p-5 bg-bg-surface hover:bg-bg-elevated transition-colors no-underline group"
            >
              <p className="m-0 mb-1 font-semibold text-[0.88rem] text-text-primary">{mod.label}</p>
              <p className="m-0 mb-4 text-[0.75rem] text-text-secondary leading-[1.55]">
                {MODULE_DESC[mod.route] ?? ''}
              </p>
              <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-accent group-hover:opacity-80 transition-opacity">
                Abrir <ArrowRight size={11} strokeWidth={2} />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Landing() {
  useScrollReveal();

  const groups = Array.from(new Set(moduleRegistry.map((m) => m.group)));
  const totalModules = moduleRegistry.length;

  return (
    <div className="bg-bg-primary min-h-screen overflow-x-hidden">
      <Helmet>
        <title>Concreta — Cálculo estructural online</title>
        <meta name="description" content="Hormigón, acero, cimentaciones y madera según normativa española. Código Estructural y CTE. Sin instalación, directo al navegador." />
      </Helmet>

      {/* ── Nav (fixed, blurred) ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-8"
        style={{
          background: 'rgba(15,23,42,0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(51,65,85,0.45)',
        }}
      >
        <a
          href="/"
          className="text-[0.95rem] font-semibold text-text-primary no-underline tracking-[-0.01em]"
        >
          Concreta
        </a>
        <div className="flex items-center gap-8">
          <a
            href="#modulos"
            className="text-[0.82rem] text-text-secondary hover:text-text-primary transition-colors no-underline"
          >
            Módulos
          </a>
          <Link
            to="/horm/vigas"
            className="inline-flex items-center gap-1.5 px-3.5 py-[0.4rem] bg-text-primary text-bg-primary text-[0.8rem] font-semibold rounded-md hover:opacity-90 transition-opacity no-underline"
          >
            Abrir app <ArrowRight size={13} strokeWidth={2} />
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        className="relative text-center overflow-hidden"
        style={{ padding: 'calc(56px + 7rem) 1.5rem 7rem' }}
      >
        {/* Dot grid with radial mask */}
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(37,49,71,1) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(70% 60% at 50% 0%, black 30%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(70% 60% at 50% 0%, black 30%, transparent 100%)',
          }}
        />
        {/* Accent radial glow */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none z-0"
          style={{
            width: '800px',
            height: '400px',
            background: 'radial-gradient(70% 50% at 50% 0%, rgba(56,189,248,0.07), transparent)',
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-180 mx-auto">

          {/* Badge */}
          <div className="anim-in d1 mb-6">
            <span
              className="inline-flex items-center px-2 py-[0.18rem] text-[0.6rem] font-semibold tracking-[0.07em] uppercase rounded-[3px]"
              style={{
                background: 'rgba(56,189,248,0.08)',
                color: '#38bdf8',
                border: '1px solid rgba(56,189,248,0.2)',
              }}
            >
              v0.1 · {totalModules} módulos · Cálculo estructural
            </span>
          </div>

          {/* Headline */}
          <h1
            className="anim-up d2 m-0 mb-5 font-bold leading-[1.04] text-text-primary"
            style={{ fontSize: 'clamp(3rem, 8vw, 5.5rem)', letterSpacing: '-0.035em' }}
          >
            El cálculo estructural
            <br />
            <span className="text-text-secondary">que no te frena.</span>
          </h1>

          {/* Subtext */}
          <p
            className="anim-up d3 mx-auto mb-10 text-[1.05rem] leading-[1.65] text-text-secondary"
            style={{ maxWidth: '480px' }}
          >
            Hormigón, acero, cimentaciones y madera según normativa española. Directo al navegador, sin instalación.
          </p>

          {/* CTAs */}
          <div className="anim-up d4 flex gap-3 justify-center flex-wrap">
            <Link
              to="/horm/vigas"
              className="inline-flex items-center gap-1.5 px-6 py-[0.65rem] bg-text-primary text-bg-primary text-[0.88rem] font-semibold rounded-md hover:opacity-90 transition-opacity no-underline"
            >
              Empezar a calcular <ArrowRight size={15} strokeWidth={2} />
            </Link>
            <a
              href="#modulos"
              className="inline-flex items-center px-6 py-[0.65rem] bg-transparent text-text-secondary text-[0.88rem] font-medium rounded-md border border-border-main hover:text-text-primary hover:border-text-disabled transition-colors no-underline"
            >
              Ver módulos
            </a>
          </div>

        </div>
      </section>

      {/* ── Divider ── */}
      <div className="h-px bg-border-main" />

      {/* ── Features strip ── */}
      <section className="py-16 px-6">
        <div
          className="max-w-215 mx-auto grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          {FEATURES.map(({ title, text }, i) => (
            <div
              key={title}
              className={`sr sr-d${i + 1} px-10 py-8 ${i < FEATURES.length - 1 ? 'border-r border-border-main' : ''}`}
            >
              <p className="m-0 mb-1.5 font-semibold text-[0.9rem] text-text-primary">{title}</p>
              <p className="m-0 text-[0.82rem] text-text-secondary leading-[1.6]">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="h-px bg-border-main" />

      {/* ── Modules section ── */}
      <section id="modulos" className="px-6 py-20 pb-28">
        <div className="max-w-230 mx-auto">

          {/* Heading */}
          <div className="sr mb-10">
            <p className="m-0 mb-2 text-[0.65rem] font-semibold tracking-[0.14em] uppercase text-text-disabled">
              Módulos disponibles
            </p>
            <h2
              className="m-0 font-bold tracking-[-0.025em] text-text-primary"
              style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}
            >
              Todo lo esencial, cubierto.
            </h2>
          </div>

          {/* Category sections */}
          {groups.map((group, i) => (
            <CategorySection key={group} group={group} index={i} />
          ))}

        </div>
      </section>

      {/* ── Footer divider (gradient) ── */}
      <div style={{ height: '1px', background: 'linear-gradient(to right, transparent, var(--color-border-main), transparent)' }} />

      {/* ── Footer ── */}
      <footer className="px-6 py-10 text-center">
        <p className="m-0 text-[0.72rem] text-text-disabled tracking-[0.04em]">Concreta © 2025</p>
      </footer>

    </div>
  );
}
