// NormativaSection.tsx — code/norms summary table on the landing page.
// The full /normativa page lives at pages/Normativa.tsx.

import { Link } from 'react-router';
import { NORM_SUMMARY } from '../../normativaData';
import './normativa-section.css';

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
