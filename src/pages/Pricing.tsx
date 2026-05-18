// Pricing — dedicated /pricing route. Plans, comparison table and FAQ.
// Ported from the Claude Design handoff (pricing.html).

import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router';
import { LandingNav } from './landing/LandingNav';
import { LandingFooter } from './landing/LandingFooter';
import { APP_ROUTE } from './landing/constants';
import './landing.css';
import './subpage.css';

interface Plan {
  name: string;
  blurb: string;
  price: string;
  unit: string;
  features: string[];
  cta: string;
  ctaTo: string;
  highlight: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Libre',
    blurb: 'Para probar antes de comprar.',
    price: '0',
    unit: '€/mes',
    features: [
      '2 módulos: Vigas HA, Vigas acero',
      'Cálculo ilimitado',
      'Enlaces compartibles',
      'PWA offline',
      'Calculadora global',
    ],
    cta: 'Empezar gratis',
    ctaTo: APP_ROUTE,
    highlight: false,
  },
  {
    name: 'Pro',
    blurb: 'Para el técnico individual.',
    price: '19',
    unit: '€/mes',
    features: [
      'Todos los módulos (12+)',
      'Exportación PDF vectorial',
      'Marca propia en informes',
      'Sin marca de agua',
      'Casos guardados en local',
      'Soporte por email · 48h',
    ],
    cta: 'Suscribirse',
    ctaTo: APP_ROUTE,
    highlight: true,
  },
  {
    name: 'Studio',
    blurb: 'Para estudios pequeños (2–5).',
    price: '49',
    unit: '€/mes · 5 técnicos',
    features: [
      'Todo lo de Pro',
      'Hasta 5 cuentas',
      'Biblioteca de casos del estudio',
      'Plantillas de informe compartidas',
      'SSO Google Workspace',
      'SLA 24h',
    ],
    cta: 'Hablar con nosotros',
    ctaTo: 'mailto:hola@concreta.tools',
    highlight: false,
  },
];

type Cell = boolean | { text: string; ok?: boolean };
interface CompareRow {
  feat: string;
  cells: [Cell, Cell, Cell];
}

const COMPARE: CompareRow[] = [
  { feat: 'Vigas HA · cortante · fisuración', cells: [true, true, true] },
  { feat: 'Pilares HA · flexocompresión', cells: [false, true, true] },
  { feat: 'Punzonamiento · forjados', cells: [false, true, true] },
  { feat: 'Vigas acero · LTB · flecha', cells: [true, true, true] },
  { feat: 'Pilares acero · empresillado', cells: [false, true, true] },
  { feat: 'Placas de anclaje', cells: [false, true, true] },
  { feat: 'Zapatas · muros · encepados', cells: [false, true, true] },
  { feat: 'FEM 1D · envolventes ELU/ELS', cells: [false, true, true] },
  { feat: 'Exportación PDF vectorial', cells: [false, true, true] },
  { feat: 'Marca propia en PDFs', cells: [false, true, true] },
  { feat: 'Casos guardados (local)', cells: [true, true, true] },
  { feat: 'Biblioteca compartida del estudio', cells: [false, false, true] },
  { feat: 'SSO Google Workspace', cells: [false, false, true] },
  {
    feat: 'Soporte',
    cells: [{ text: 'comunidad' }, { text: '48h email' }, { text: 'SLA 24h', ok: true }],
  },
];

const FAQ: [string, string][] = [
  [
    '¿Por qué suscripción y no licencia perpetua?',
    'Porque la normativa se actualiza. Cuando publican una nueva versión del CE o un anejo del CTE, lo implementamos sin que tengas que comprar nada. La suscripción paga ese mantenimiento.',
  ],
  [
    '¿Mis cálculos y datos están en vuestros servidores?',
    'No. Concreta es una PWA: todo el cálculo ocurre en tu navegador y los datos viven en localStorage. Los «enlaces compartibles» son estado serializado en la URL — no pasan por nosotros. Sólo guardamos tu email para la facturación.',
  ],
  [
    '¿Puedo cancelar en cualquier momento?',
    'Sí, desde tu cuenta. Sin llamadas, sin formularios. Mantienes acceso hasta el final del periodo facturado y después la app vuelve al plan Libre con tus datos intactos.',
  ],
  [
    '¿Hay descuento anual?',
    'Sí: 10 meses al precio de 12 si pagas el año por adelantado. Aplica a Pro y Studio.',
  ],
  [
    '¿Estudiantes y educación?',
    'El plan Libre cubre los casos más habituales para uso académico. Si necesitas más para una asignatura o un TFG, escríbenos con tu correo institucional y te lo abrimos sin coste.',
  ],
  [
    '¿Factura con IVA y modelo 130?',
    'Sí. Facturas mensuales o anuales con NIF, IVA correctamente desglosado y compatibles con tu gestoría española. Disponibles en PDF desde el panel de cuenta.',
  ],
];

function Cta({ plan }: { plan: Plan }) {
  const cls = `btn ${plan.highlight ? 'btn-primary ' : ''}plan-cta`;
  const inner = (
    <>
      {plan.cta} <span className="arr">→</span>
    </>
  );
  return plan.ctaTo.startsWith('mailto:') ? (
    <a href={plan.ctaTo} className={cls}>{inner}</a>
  ) : (
    <Link to={plan.ctaTo} className={cls}>{inner}</Link>
  );
}

function CompareCell({ cell }: { cell: Cell }) {
  if (cell === true) return <td className="check">✓</td>;
  if (cell === false) return <td className="dash">—</td>;
  return <td className={cell.ok ? 'check' : 'dash'}>{cell.text}</td>;
}

export function Pricing() {
  return (
    <div className="landing-root">
      <Helmet>
        <title>Precio — Concreta</title>
        <meta
          name="description"
          content="Suscripción mensual a Concreta: plan Libre, Pro (19 €/mes) y Studio. Sin sorpresas, sin «contacta con ventas». Comparativa completa y preguntas frecuentes."
        />
      </Helmet>

      <LandingNav />

      <section className="subpage-hero">
        <div className="container subpage-hero-inner">
          <div className="subpage-eyebrow">05 · Precio</div>
          <h1 className="subpage-title">Suscripción mensual. Sin sorpresas.</h1>
          <p className="subpage-lede">
            Concreta es una herramienta diaria — y como tal cobramos por mes, no
            por proyecto. Sin sobreprecios, sin «contacta con ventas», sin
            activación manual. Pagas, abres, calculas.
          </p>
        </div>
      </section>

      <main className="subpage-body">
        <div className="container">

          <div className="pricing-grid">
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
                  {p.features.map((f) => (
                    <li key={f}><span className="plan-check">✓</span>{f}</li>
                  ))}
                </ul>
                <Cta plan={p} />
              </div>
            ))}
          </div>

          <h2 className="subsec-title">Comparativa completa</h2>
          <p className="subsec-lede">Lo mismo en formato denso para revisar a un golpe.</p>
          <div className="table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>Funcionalidad</th>
                  <th>Libre</th>
                  <th>Pro</th>
                  <th>Studio</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.feat}>
                    <td className="feat">{row.feat}</td>
                    {row.cells.map((c, i) => <CompareCell cell={c} key={i} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="subsec-title subsec-title-spaced">Preguntas frecuentes</h2>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <div className="faq-item" key={q}>
                <h3 className="faq-q">{q}</h3>
                <p className="faq-a">{a}</p>
              </div>
            ))}
          </div>

        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
