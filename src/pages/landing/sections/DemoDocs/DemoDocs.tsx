// DemoDocs.tsx — "Recursos" section: the latest release notes + docs/blog stack.
//
// It used to lead with a «DEMO · 4 MIN» video card and a «Changelog v0.4» card,
// both linking to this same section: there was no video and no v0.4. The big
// card is now the newest CHANGELOG post, read from the blog itself, so it moves
// on its own when the next one is published.

import { Link } from 'react-router';
import { sectionEyebrow } from '../../constants';
import { ALL_POSTS } from '../../../blog/posts';
import './demo-docs.css';

const NOVEDADES = ALL_POSTS.find((p) => p.category === 'CHANGELOG');

function fecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function DemoDocsSection() {
  return (
    <section className="section" id="recursos">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">{sectionEyebrow('recursos')}</div>
            <h2 className="section-title">Novedades y documentación.</h2>
          </div>
          <p className="section-lede">
            Cada tanda de cambios se cuenta en el blog, con lo que conviene
            recalcular. La documentación técnica explica cada módulo con su
            origen normativo, sus usos y sus limitaciones.
          </p>
        </div>

        <div className="demo-docs-grid">
          {NOVEDADES ? (
            <Link className="demo-card news-card" to={`/blog/${NOVEDADES.slug}`}>
              <div className="news-body dot-grid">
                <div className="demo-thumb-label mono">NOVEDADES · {fecha(NOVEDADES.date)}</div>
                <div className="demo-thumb-title news-title">{NOVEDADES.title}</div>
                <p className="news-excerpt">{NOVEDADES.excerpt}</p>
              </div>
              <div className="demo-foot">
                <span className="mono dim">{NOVEDADES.read} de lectura</span>
                <span className="link-arrow">Leer las novedades →</span>
              </div>
            </Link>
          ) : (
            <span />
          )}

          <div className="docs-stack">
            <Link className="resource-card" to="/normativa">
              <div className="resource-mark mono">DOCS</div>
              <div className="resource-body">
                <h3 className="resource-title">Documentación técnica</h3>
                <p className="resource-desc">Cada módulo, su formulación, sus usos y sus limitaciones. Integrada en la página de normativa por norma y por módulo.</p>
              </div>
              <span className="resource-arr mono">→</span>
            </Link>
            <Link className="resource-card" to="/blog">
              <div className="resource-mark mono">BLOG</div>
              <div className="resource-body">
                <h3 className="resource-title">Interpretación normativa</h3>
                <p className="resource-desc">Artículos cortos sobre el Código Estructural y el CTE escritos por gente que calcula a diario.</p>
              </div>
              <span className="resource-arr mono">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
