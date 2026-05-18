// sections.tsx — content sections of the Concreta landing, after the hero.

import { useState } from 'react';
import { Link } from 'react-router';
import { AppPreview } from './AppPreview';
import { MODULE_LIBRARY, type ModuleEntry } from './modules';
import { NORM_SUMMARY } from './normativaData';
import { ALL_POSTS } from '../blog/posts';
import { PostCard } from '../blog/PostCard';
import { APP_ROUTE } from './constants';

// ── MÓDULOS — full library grid ────────────────────────────────────────────────
function ModuleCard({ m }: { m: ModuleEntry }) {
  return (
    <Link className="mod-card" to={m.route}>
      <div className="mod-card-icon">{m.icon}</div>
      <div className="mod-card-body">
        <div className="mod-card-head">
          <span className="mod-card-name">{m.name}</span>
          <span className="mod-card-ref mono">{m.ref}</span>
        </div>
        <p className="mod-card-desc">{m.short}</p>
      </div>
    </Link>
  );
}

export function ModulesSection() {
  const groups: { label: string; items: ModuleEntry[] }[] = [];
  MODULE_LIBRARY.forEach((m) => {
    const last = groups[groups.length - 1];
    if (last && last.label === m.group) last.items.push(m);
    else groups.push({ label: m.group, items: [m] });
  });

  return (
    <section className="section" id="modulos">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">02 · Módulos</div>
            <h2 className="section-title">Todos los módulos implementados.</h2>
          </div>
          <p className="section-lede">
            Cada módulo resuelve un caso concreto del día a día con su norma
            correspondiente. Hormigón, acero, cimentación, madera y un motor
            FEM para vigas continuas. Sigue creciendo cada mes.
          </p>
        </div>

        <div className="mod-groups">
          {groups.map((g) => (
            <div className="mod-group" key={g.label}>
              <div className="mod-group-h mono">
                <span className="mod-group-label">{g.label}</span>
                <span className="mod-group-count dim">{g.items.length} módulos</span>
              </div>
              <div className="mod-grid">
                {g.items.map((m) => <ModuleCard m={m} key={m.id} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── EXPORTAR Y COMPARTIR ───────────────────────────────────────────────────────
function ShareLinkPreview() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="link-stage">
      <div className="link-browser">
        <div className="link-browser-chrome">
          <span className="link-browser-dot dot-r" />
          <span className="link-browser-dot dot-y" />
          <span className="link-browser-dot dot-g" />
          <span className="link-browser-tabs mono">vigas-ha</span>
        </div>
        <div className="link-browser-bar">
          <svg
            className="link-lock"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="mono link-bar-host">concreta.tools</span>
          <span className="mono link-bar-path">/rc-beams?s=</span>
          <span className="mono link-bar-hash">eJxLs7E1MdGzMjAwLDcyNzC1MNS0MdSxBQAo3wKw</span>
          <button
            type="button"
            className="link-copy-btn"
            onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }}
          >
            {copied ? '✓ copiado' : 'copiar'}
          </button>
        </div>
      </div>

      <div className="link-flow">
        <div className="link-flow-node">
          <div className="link-avatar dot-grid"><span className="mono">JR</span></div>
          <div className="link-flow-name">Javier</div>
          <div className="link-flow-role mono dim">CALCULISTA</div>
        </div>
        <div className="link-flow-pipe">
          <span className="link-flow-tag mono">enlace · ~1.2 KB</span>
          <span className="link-flow-line" />
          <span className="link-flow-arrow">→</span>
        </div>
        <div className="link-flow-node">
          <div className="link-avatar dot-grid"><span className="mono">AB</span></div>
          <div className="link-flow-name">Ana · estudio</div>
          <div className="link-flow-role mono dim">DIRECTORA</div>
        </div>
      </div>
    </div>
  );
}

export function OutputSection() {
  return (
    <section className="section" id="output">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">03 · Exportar y compartir</div>
            <h2 className="section-title">Defendible ante visado. Compartible en un enlace.</h2>
          </div>
          <p className="section-lede">
            Tu cálculo no se queda en la pantalla. Lo exportas en PDF
            vectorial para anexar a la memoria de proyecto, o lo compartes
            con otro técnico copiando un enlace — sin servidor, sin login.
          </p>
        </div>

        <div className="output-grid">
          <article className="output-card">
            <div className="output-card-body">
              <div className="output-eyebrow mono">PDF · A4 VECTORIAL</div>
              <h3 className="output-card-title">Tu cálculo, listo para anexar a la memoria.</h3>
              <p className="output-card-desc">
                Cada exportación incluye inputs, diagrama de sección,
                envolventes M-V y tabla de comprobaciones con artículo
                CE/CTE. Vectorial — sin pixelado al imprimir, sin marca
                de agua en planes Pro.
              </p>
              <ul className="output-bullets">
                <li>Listo en menos de <strong>5 segundos</strong>.</li>
                <li>SVG vectorial, no captura de pantalla.</li>
                <li>Tu logo y nombre de estudio (plan Pro).</li>
                <li>Compatible con cualquier gestor documental.</li>
              </ul>
            </div>
            <div className="pdf-preview">
              <img
                src="/landing/pdf-export.jpg"
                alt="Vista previa de exportación PDF de Concreta"
                className="pdf-img"
              />
            </div>
          </article>

          <article className="output-card">
            <div className="output-card-body">
              <div className="output-eyebrow mono">ENLACE · ESTADO SERIALIZADO</div>
              <h3 className="output-card-title">Comparte el cálculo. No subes nada.</h3>
              <p className="output-card-desc">
                Cada caso se serializa completo en la URL. Lo mandas por
                email o por WhatsApp; el técnico que lo abre ve exactamente
                tus inputs y tus resultados. Para revisión cruzada, segunda
                opinión o devolución de cálculos.
              </p>
              <ul className="output-bullets">
                <li>El estado vive en la URL — no pasa por nuestros servidores.</li>
                <li>Quien lo abre puede modificar y reenviar.</li>
                <li>Funciona offline una vez instalado como PWA.</li>
                <li>Pega en cualquier navegador moderno.</li>
              </ul>
            </div>
            <div className="link-preview"><ShareLinkPreview /></div>
          </article>
        </div>
      </div>
    </section>
  );
}

// ── FILOSOFÍA ──────────────────────────────────────────────────────────────────
const PRINCIPLES = [
  { n: '01', t: 'Velocidad antes que complejidad', d: 'Resolvemos bien lo común. El edge case raro vive en otra herramienta.' },
  { n: '02', t: 'Claridad antes que densidad', d: 'Explicamos sin abrumar. Un valor, su unidad, su artículo.' },
  { n: '03', t: 'Visual antes que textual', d: 'El SVG es el protagonista. La sección, el perfil, la deformada. En vivo.' },
  { n: '04', t: 'Rigor sin opacidad', d: 'Cada comprobación cita el artículo. El detalle siempre está a un clic.' },
  { n: '05', t: 'Sin backend, sin cuentas', d: 'PWA local. Tus cálculos viven en tu navegador. Tus datos son tuyos.' },
];

const COMPARE_ROWS: [string, boolean, boolean, boolean, boolean][] = [
  ['Norma española primero (CE, CTE)', true, false, false, false],
  ['Artículo CE/CTE visible por check', true, false, false, false],
  ['PWA sin cuenta, sin backend', true, false, false, false],
  ['Enlaces compartibles del cálculo', true, false, false, true],
  ['Sin licencia anual cuatro cifras', true, false, true, true],
  ['Curva de aprendizaje en minutos', true, false, true, true],
  ['Modelado global 3D del edificio', false, true, false, false],
];

export function PhilosophySection() {
  return (
    <section className="section" id="filosofia">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">04 · Filosofía</div>
            <h2 className="section-title">
              Un instrumento de precisión.<br />No un SaaS más.
            </h2>
          </div>
          <p className="section-lede">
            Cinco principios que filtran cada decisión de producto. Sirven
            tanto para escoger una funcionalidad como para descartarla.
          </p>
        </div>

        <div className="principles">
          {PRINCIPLES.map((p) => (
            <div className="principle" key={p.n}>
              <div className="principle-n mono">{p.n}</div>
              <div className="principle-t">{p.t}</div>
              <div className="principle-d">{p.d}</div>
            </div>
          ))}
        </div>

        <div className="philo-compare">
          <div className="philo-compare-intro">
            <h3 className="philo-compare-title">No competimos con CYPE. Competimos en tu día a día.</h3>
            <p className="philo-compare-lede">
              Concreta no reemplaza una suite global de modelado. Reemplaza
              la calculadora, el Excel improvisado y la libreta cuando hay
              que justificar una viga, un pilar o una zapata aislada con
              norma española en quince minutos.
            </p>
          </div>

          <div className="table-scroll">
            <table className="vs-table">
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  <th className="vs-mine">
                    <span className="brand-dot" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />
                    Concreta
                  </th>
                  <th>CYPE</th>
                  <th>SkyCiv</th>
                  <th>ClearCalcs</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map(([feat, ...vals], i) => (
                  <tr key={i}>
                    <td className="vs-feat">{feat}</td>
                    {vals.map((v, j) => (
                      <td key={j} className={`vs-cell ${j === 0 ? 'vs-mine' : ''}`}>
                        {v ? <span className="vs-check">✓</span> : <span className="vs-dash">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="vs-note mono dim">
            / honesta: usamos las suites grandes para los proyectos que las requieren. Pero no las usamos para una zapata aislada de un anejo.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── NORMATIVA ──────────────────────────────────────────────────────────────────
export function NormativaSection() {
  return (
    <section className="section" id="normativa">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">05 · Normativa</div>
            <h2 className="section-title">Norma española primero, eurocódigos en su sitio.</h2>
          </div>
          <p className="section-lede">
            CE y CTE como base resolutiva. Cada comprobación cita el artículo
            y enlaza a la documentación técnica del módulo: fórmulas, usos y
            limitaciones.{' '}
            <Link to="/normativa" className="link-arrow">Detalle completo →</Link>
          </p>
        </div>

        <div className="norm-table">
          <div className="norm-row norm-head mono">
            <span>Código</span>
            <span>Descripción</span>
            <span>Año</span>
            <span>Módulos</span>
            <span style={{ textAlign: 'right' }}>Estado</span>
          </div>
          {NORM_SUMMARY.map((n) => (
            <div className="norm-row" key={n.code}>
              <span className="mono norm-code">{n.code}</span>
              <span>{n.full}</span>
              <span className="mono dim">{n.year}</span>
              <span className="dim">{n.mods.join(' · ')}</span>
              <span style={{ textAlign: 'right' }}>
                <span className={`tag ${n.status}`}>
                  {n.status === 'ok' ? '● implementada' : '● auxiliar'}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── RECURSOS — demo + docs ─────────────────────────────────────────────────────
export function DemoDocsSection() {
  return (
    <section className="section" id="recursos">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">06 · Recursos</div>
            <h2 className="section-title">Vídeo y documentación.</h2>
          </div>
          <p className="section-lede">
            Si prefieres ver antes de probar, una demo de 4 minutos cubre los
            casos típicos. La documentación técnica explica cada fórmula con
            su origen normativo y sus limitaciones.
          </p>
        </div>

        <div className="demo-docs-grid">
          <a className="demo-card" href="#recursos">
            <div className="demo-thumb dot-grid">
              <div className="demo-play">
                <svg viewBox="0 0 32 32" width="20" height="20"><polygon points="11,8 11,24 24,16" fill="currentColor" /></svg>
              </div>
              <div className="demo-thumb-overlay">
                <div className="demo-thumb-label mono">DEMO · 4 MIN</div>
                <div className="demo-thumb-title">Calcula una viga HA y exporta el PDF</div>
              </div>
              <div className="demo-thumb-thumb">
                <AppPreview moduleId="rc-beams" accent="var(--accent)" />
              </div>
            </div>
            <div className="demo-foot">
              <span className="mono dim">vídeo · 04:12</span>
              <span className="link-arrow">Ver demo →</span>
            </div>
          </a>

          <div className="docs-stack">
            <a className="resource-card" href="#normativa">
              <div className="resource-mark mono">DOCS</div>
              <div className="resource-body">
                <h3 className="resource-title">Documentación técnica</h3>
                <p className="resource-desc">Cada módulo, su formulación, sus usos y sus limitaciones. Integrada en la página de normativa por norma y por módulo.</p>
              </div>
              <span className="resource-arr mono">→</span>
            </a>
            <a className="resource-card" href="#blog">
              <div className="resource-mark mono">BLOG</div>
              <div className="resource-body">
                <h3 className="resource-title">Interpretación normativa</h3>
                <p className="resource-desc">Artículos cortos sobre el Código Estructural y el CTE escritos por gente que calcula a diario.</p>
              </div>
              <span className="resource-arr mono">→</span>
            </a>
            <a className="resource-card" href="#recursos">
              <div className="resource-mark mono">v0.4</div>
              <div className="resource-body">
                <h3 className="resource-title">Changelog</h3>
                <p className="resource-desc">Cada release lista qué se ha implementado, qué se ha corregido y qué artículos normativos cubre.</p>
              </div>
              <span className="resource-arr mono">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── PRECIO ─────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Libre',
    price: '0',
    unit: '€/mes',
    blurb: 'Para probar antes de comprar.',
    features: ['Vigas HA y vigas acero', 'Cálculo ilimitado', 'Sin exportación PDF', 'Enlaces compartibles', 'PWA offline'],
    cta: 'Empezar',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '19',
    unit: '€/mes',
    blurb: 'El estudio de un técnico.',
    features: ['Todos los módulos', 'Exportación PDF vectorial', 'Marca propia en informes', 'Sin marca de agua', 'Soporte por email · 48h'],
    cta: 'Suscribirse',
    highlight: true,
  },
  {
    name: 'Studio',
    price: '49',
    unit: '€/mes · 5 técnicos',
    blurb: 'Para oficinas con 2–5 técnicos.',
    features: ['Todo lo de Pro', 'Hasta 5 cuentas', 'Biblioteca de casos compartida', 'Plantillas de informe del estudio', 'SLA 24h'],
    cta: 'Hablar',
    highlight: false,
  },
];

export function PricingSection() {
  return (
    <section className="section" id="pricing">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">07 · Precio</div>
            <h2 className="section-title">Una suscripción honesta.</h2>
          </div>
          <p className="section-lede">
            Sin trials que caducan en mal momento. Sin «contacta con ventas».
            Cancela en un clic.{' '}
            <Link to="/pricing" className="link-arrow">Comparativa y FAQ →</Link>
          </p>
        </div>

        <div className="plans">
          {PLANS.map((p) => (
            <div className={`plan ${p.highlight ? 'plan-hi' : ''}`} key={p.name}>
              {p.highlight && <div className="plan-badge mono">RECOMENDADO</div>}
              <div className="plan-name">{p.name}</div>
              <div className="plan-blurb">{p.blurb}</div>
              <div className="plan-price">
                <span className="plan-price-v mono">{p.price}</span>
                <span className="plan-price-u">{p.unit}</span>
              </div>
              <ul className="plan-features">
                {p.features.map((f, i) => (
                  <li key={i}>
                    <span className="plan-check">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/pricing" className={`btn ${p.highlight ? 'btn-primary' : ''} plan-cta`}>
                {p.cta} <span className="arr">→</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── BLOG ───────────────────────────────────────────────────────────────────────
export function BlogSection() {
  const featured = ALL_POSTS.slice(0, 3);
  return (
    <section className="section" id="blog">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">08 · Blog</div>
            <h2 className="section-title">Notas técnicas y de producto.</h2>
          </div>
          <p className="section-lede">
            Interpretaciones normativas, tutoriales con casos reales y registro
            de cambios. Escrito por gente que calcula.{' '}
            <Link to="/blog" className="link-arrow">Todos los artículos →</Link>
          </p>
        </div>

        <div className="posts">
          {featured.map((p) => <PostCard post={p} key={p.slug} />)}
        </div>
      </div>
    </section>
  );
}

// ── QUIÉN — about teaser ───────────────────────────────────────────────────────
export function AboutSection() {
  return (
    <section className="section" id="about-teaser">
      <div className="container">
        <div className="about-wrap">
          <div className="about-copy">
            <div className="section-eyebrow">09 · Quién</div>
            <h2 className="section-title">Hecho por un arquitecto calculista.</h2>
            <p className="about-text">
              Concreta la escribe Javier Ramírez Bandera. Arquitecto,
              fundador de Alte Estudio, consultor de cálculo y docente del
              título propio de hormigón armado en la Universidad de Málaga.
              Concreta nace para resolver el cálculo del día a día que el
              software grande hace lento y el Excel hace inseguro.
            </p>
            <Link to="/about" className="btn">
              Sobre Concreta y Javier <span className="arr">→</span>
            </Link>
          </div>
          <div className="about-card">
            <div className="about-avatar dot-grid">
              <span className="mono dim">JR</span>
            </div>
            <div className="about-info">
              <div className="about-name">Javier Ramírez Bandera</div>
              <div className="about-role mono">FUNDADOR · ARQUITECTO CALCULISTA</div>
              <p className="about-bio">
                Arquitecto especializado en cálculo de estructuras, gestión
                inmobiliaria y peritaje judicial. Alte Estudio · Universidad de
                Málaga · Concreta.
              </p>
              <div className="about-links">
                <a className="dim mono" href="https://linkedin.com/in/javier-ram%C3%ADrez-bandera" target="_blank" rel="noreferrer">linkedin</a>
                <a className="dim mono" href="https://github.com/jramirezbandera" target="_blank" rel="noreferrer">github</a>
                <a className="dim mono" href="https://alteestudio.com" target="_blank" rel="noreferrer">alteestudio.com</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── CIERRE ─────────────────────────────────────────────────────────────────────
export function ClosingCTA() {
  return (
    <section className="section closing">
      <div className="container">
        <div className="closing-card dot-grid">
          <div className="closing-eyebrow mono">/ SUSCRÍBETE AHORA</div>
          <h2 className="closing-title">
            Tu próxima viga, pilar o zapata, en cinco minutos.
          </h2>
          <p className="closing-sub">
            Suscripción Pro a 19 €/mes. Plan Libre con módulos básicos sin
            tarjeta de crédito. Cancela cuando quieras.
          </p>
          <div className="closing-cta">
            <Link to="/pricing" className="btn btn-primary btn-lg">
              Suscribirse <span className="arr">→</span>
            </Link>
            <Link to={APP_ROUTE} className="btn btn-lg">Abrir Concreta</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
