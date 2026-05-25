// Closing.tsx — final CTA card at the bottom of the landing page.

import { Link } from 'react-router';
import { APP_ROUTE } from '../../constants';
import './closing.css';

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
