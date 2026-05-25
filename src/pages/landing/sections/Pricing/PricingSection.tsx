// PricingSection.tsx — 3-plan grid teaser on the landing page.
// The full /pricing page lives at pages/Pricing.tsx.

import { Link } from 'react-router';
import './pricing-section.css';

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
