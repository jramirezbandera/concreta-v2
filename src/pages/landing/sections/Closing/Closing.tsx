// Closing.tsx — final CTA card at the bottom of the landing page.

import { Link } from 'react-router';
import { APP_ROUTE } from '../../constants';
import './closing.css';

export function ClosingCTA() {
  return (
    <section className="section closing">
      <div className="container">
        <div className="closing-card dot-grid">
          <div className="closing-eyebrow mono">/ EMPIEZA AHORA</div>
          <h2 className="closing-title">
            Tu próxima viga, pilar o zapata, en cinco minutos.
          </h2>
          <p className="closing-sub">
            El plan Libre trae vigas de hormigón, vigas de acero, pórticos 2D y
            el asistente, sin tarjeta de crédito. El PDF del anejo va en Pro,
            a 19 €/mes.
          </p>
          <div className="closing-cta">
            <Link to={APP_ROUTE} className="btn btn-primary btn-lg">
              Abrir Concreta <span className="arr">→</span>
            </Link>
            <Link to="/pricing" className="btn btn-lg">Ver precios</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
