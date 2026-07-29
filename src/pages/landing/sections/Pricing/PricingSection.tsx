// PricingSection.tsx — 3-plan teaser on the landing page.
// The full /pricing page lives at pages/Pricing.tsx; both read PLANS from
// landing/constants.ts so the two can no longer contradict each other.
//
// Every card here links to /pricing — the teaser is the hook, /pricing is where
// the decision (and the mailto) happens. That keeps the paid CTAs in one place
// so they can be counted, and avoids a `mailto:` inside a React Router <Link>,
// which does not navigate.

import { Link } from 'react-router';
import { PLANS, sectionEyebrow } from '../../constants';
import './pricing-section.css';

export function PricingSection() {
  return (
    <section className="section" id="pricing">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">{sectionEyebrow('precio')}</div>
            <h2 className="section-title">Una suscripción honesta.</h2>
          </div>
          <p className="section-lede">
            Sin trials que caducan en mal momento. Sin «contacta con ventas».
            Cancelas escribiéndonos un correo.{' '}
            <Link to="/pricing" className="link-arrow">Comparativa y FAQ →</Link>
          </p>
        </div>

        <div className="plans">
          {PLANS.map((p) => (
            <div className={`plan ${p.highlight ? 'plan-hi' : ''}`} key={p.id}>
              {p.highlight && <div className="plan-badge mono">RECOMENDADO</div>}
              {p.soon && <div className="plan-badge plan-badge-soon mono">PRÓXIMAMENTE</div>}
              <div className="plan-name">{p.name}</div>
              <div className="plan-blurb">{p.blurb}</div>
              <div className="plan-price">
                <span className="plan-price-v mono">{p.price}</span>
                <span className="plan-price-u">{p.unit}</span>
              </div>
              <ul className="plan-features">
                {p.teaserFeatures.map((f) => (
                  <li key={f}>
                    <span className="plan-check">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {/* A boundary, not a feature — never rendered with a check mark. */}
              {p.note && <div className="plan-note">{p.note}</div>}
              <Link to="/pricing" className={`btn ${p.highlight ? 'btn-primary' : ''} plan-cta`}>
                {p.teaserCta} <span className="arr">→</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
