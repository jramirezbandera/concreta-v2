// Normativa — dedicated /normativa route. Norm-by-norm map of the Spanish
// structural codes Concreta implements, plus per-module coverage docs.
// Ported from the Claude Design handoff (normativa.html).

import { LandingNav } from './landing/LandingNav';
import { LandingFooter } from './landing/LandingFooter';
import { NORM_BLOCKS, MODULE_DOCS, NORM_LEGEND } from './landing/normativaData';
import './landing.css';
import './subpage.css';

const TOC = [
  { id: 'doc-modulos', label: 'Documentación por módulo' },
  ...NORM_BLOCKS.map((b) => ({ id: b.id, label: b.tocLabel })),
];

export function Normativa() {
  return (
    <div className="landing-root">

      <LandingNav />

      <section className="subpage-hero">
        <div className="container subpage-hero-inner">
          <div className="subpage-eyebrow">04 · Normativa</div>
          <h1 className="subpage-title">Norma española, artículo a artículo.</h1>
          <p className="subpage-lede">
            Cada comprobación de Concreta cita el artículo del Código Estructural
            o el apartado del CTE en el que se basa. Aquí está el mapa completo:
            qué norma cubre cada módulo, qué artículos están vivos, y qué queda
            en roadmap.
          </p>
        </div>
      </section>

      <main className="subpage-body">
        <div className="container">
          <div className="norm-layout">
            {/* Sticky table of contents */}
            <aside className="norm-toc">
              <div className="norm-toc-h">En esta página</div>
              {TOC.map((t) => (
                <a key={t.id} href={`#${t.id}`}>{t.label}</a>
              ))}
            </aside>

            <div className="norm-content">
              {/* Legend */}
              <div className="norm-legend">
                {NORM_LEGEND.map((l) => (
                  <div className="norm-legend-item" key={l.cls}>
                    <span className={`tag ${l.cls}`}>{l.tag}</span>
                    <span className="dim">{l.desc}</span>
                  </div>
                ))}
              </div>

              {/* Per-module technical docs — first, per design review */}
              <section className="norm-section" id="doc-modulos">
                <div className="section-eyebrow" style={{ marginBottom: 14 }}>Documentación técnica</div>
                <h2 className="subsec-title">Por módulo · usos y limitaciones.</h2>
                <p className="subsec-lede">
                  Lo que cada módulo cubre, lo que no cubre, y el detalle de la
                  formulación con su origen normativo. Léelo antes de defender el
                  cálculo ante visado.
                </p>
                <div className="mod-docs">
                  {MODULE_DOCS.map((m) => (
                    <article className="mod-doc" key={m.id}>
                      <div className="mod-doc-head">
                        <h3 className="mod-doc-title">{m.title}</h3>
                        <span className="mono dim mod-doc-ref">{m.ref}</span>
                      </div>
                      <div className="mod-doc-grid">
                        <div>
                          <div className="mod-doc-h mono">USOS CUBIERTOS</div>
                          <ul className="mod-doc-list">
                            {m.usos.map((u, i) => <li key={i}>{u}</li>)}
                          </ul>
                        </div>
                        <div>
                          <div className="mod-doc-h mono">LIMITACIONES</div>
                          <ul className="mod-doc-list">
                            {m.limitaciones.map((l, i) => <li key={i}>{l}</li>)}
                          </ul>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {/* Norm blocks */}
              <div style={{ marginTop: 64 }}>
                {NORM_BLOCKS.map((b) => (
                  <section className="norm-block" id={b.id} key={b.id}>
                    <div className="norm-block-head">
                      <h2 className="norm-block-title">
                        {b.title} <span className="norm-block-code">{b.code}</span>
                      </h2>
                      <span className="norm-block-meta">
                        <span className="norm-block-status">
                          <span className={`tag ${b.status}`}>{b.statusLabel}</span>
                        </span>
                        {b.reviewed && (
                          <span className="norm-block-reviewed">revisado · {b.reviewed}</span>
                        )}
                      </span>
                    </div>
                    {b.queEs ? (
                      <p className="norm-intro">
                        <strong>Qué es:</strong> {b.queEs}{' '}
                        <strong>Para qué te sirve:</strong> {b.paraQue}
                      </p>
                    ) : (
                      <p className="norm-intro">{b.note}</p>
                    )}
                    <div className="norm-articles">
                      {b.articles.map((a) => (
                        <div className="norm-article" key={a.code}>
                          <span className="norm-art-code">{a.code}</span>
                          <span className="norm-art-desc">{a.desc}</span>
                          <span className="norm-art-mod">{a.mod}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              {/* Professional disclaimer */}
              <div className="norm-disclaimer">
                <div className="norm-disclaimer-h mono">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  AVISO PROFESIONAL
                </div>
                <p>
                  Concreta es una herramienta de cálculo. La responsabilidad
                  técnica del proyecto, del modelo estructural escogido y de la
                  idoneidad de las hipótesis adoptadas corresponde siempre al
                  técnico firmante. Concreta cita la norma; el ingeniero decide
                  si su caso encaja en ella.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
