// DemoDocs.tsx — "Recursos" section: video demo card + docs/blog/changelog stack.

import { AppPreview } from '../../AppPreview';
import './demo-docs.css';

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
