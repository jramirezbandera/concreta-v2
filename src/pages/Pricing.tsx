// Pricing — dedicated /pricing route. Plans, comparison table and FAQ.
// Ported from the Claude Design handoff (pricing.html).

import { Link } from 'react-router';
import { LandingNav } from './landing/LandingNav';
import { LandingFooter } from './landing/LandingFooter';
import {
  APP_ROUTE,
  BETA,
  BETA_CTA,
  BETA_LINE,
  BETA_TAG,
  PLANS,
  type Plan,
  planBadge,
  sectionEyebrow,
} from './landing/constants';
import { rutaDeEntrada } from '../lib/obra/entrada';
import './marketing.css';
import './subpage.css';

type Cell = boolean | { text: string; ok?: boolean };
interface CompareRow {
  feat: string;
  cells: [Cell, Cell, Cell];
}

// One row per group of the sidebar, plus what a project delivers. The free
// tier keeps its three modules; everything added since (Acciones, Memorias,
// the obra, the anejo and the Word/Excel/DXF exports) goes with Pro, like the
// rest of the modules and the PDF (decision 2026-09-25).
const COMPARE: CompareRow[] = [
  { feat: 'Vigas HA · cortante · fisuración', cells: [true, true, true] },
  { feat: 'Vigas acero · LTB · flecha', cells: [true, true, true] },
  { feat: 'FEM 2D · pórticos y cerchas', cells: [true, true, true] },
  { feat: 'Hormigón · pilares, punzonamiento, forjados', cells: [false, true, true] },
  { feat: 'Acero · pilares, sección compuesta, placas de anclaje', cells: [false, true, true] },
  { feat: 'Cimentación · zapatas, muros, encepados, micropilotes', cells: [false, true, true] },
  { feat: 'Rehabilitación · empresillado, muros de fábrica', cells: [false, true, true] },
  { feat: 'Madera · vigas y pilares', cells: [false, true, true] },
  { feat: 'FEM 1D · envolventes ELU/ELS', cells: [false, true, true] },
  { feat: 'Geotecnia · taludes, escollera y gaviones', cells: [false, true, true] },
  { feat: 'Acciones · cargas por planta, viento y nieve, sismo, incendio', cells: [false, true, true] },
  { feat: 'Memorias · cuadro de materiales, cumplimiento del DB SE', cells: [false, true, true] },
  { feat: 'La obra y su anejo de cálculo', cells: [false, true, true] },
  {
    feat: 'Asistente IA · con la clave incluida',
    cells: [
      { text: 'rellena y explica' },
      { text: 'rellena y explica' },
      { text: 'diagnostica y propone', ok: true },
    ],
  },
  // Each provider runs one fixed model (lib/ai/models.ts): the visitor picks
  // the provider, never the model.
  {
    feat: 'Asistente IA · con tu propia clave',
    cells: [
      { text: 'el modelo de tu proveedor', ok: true },
      { text: 'el modelo de tu proveedor', ok: true },
      { text: 'el modelo de tu proveedor', ok: true },
    ],
  },
  { feat: 'Exportación PDF', cells: [false, true, true] },
  { feat: 'Word, Excel y DXF · memoria, cuadros del plano y planos tipo', cells: [false, true, true] },
  { feat: 'Marca propia en PDFs', cells: [false, true, true] },
  { feat: 'Casos guardados (local)', cells: [true, true, true] },
  {
    feat: 'Soporte',
    cells: [{ text: 'comunidad' }, { text: '48 h email', ok: true }, { text: '48 h email', ok: true }],
  },
];

// Asked first because it is the question a beta tester actually has: they are
// looking at three price cards while paying nothing, and deserve to know what
// happens the day that stops being true.
const BETA_FAQ: [string, string, string?][] = [
  [
    '¿Qué pasa cuando termine la beta?',
    'Te avisamos por email antes, con fecha. Nadie se va a encontrar un cobro sorpresa: no tenemos tu tarjeta y no hay pasarela de pago conectada. Cuando la haya, decides si te suscribes; si no, la app se queda en el plan Libre con tus casos intactos, porque viven en tu navegador y no en un servidor nuestro.',
  ],
  [
    '¿Y qué me cuesta ahora mismo?',
    'Nada, y no hay letra pequeña: durante la beta están abiertos los módulos de todos los planes, la obra con su anejo, todas las exportaciones y el asistente. Lo que te pedimos a cambio es que nos cuentes lo que falla — a eso responde el correo de soporte.',
  ],
];

// A third string is the answer DURING the beta. Cancelling, invoices and the
// annual price describe a subscription that does not exist yet; in the beta
// they say so instead of describing it in the present tense.
const FAQ: [string, string, string?][] = [
  [
    '¿Por qué suscripción y no licencia perpetua?',
    'Porque la normativa se actualiza. Cuando publican una nueva versión del CE o un anejo del CTE, lo implementamos sin que tengas que comprar nada. La suscripción paga ese mantenimiento.',
  ],
  [
    '¿Qué diferencia hay entre la IA de Pro y la de Estudio?',
    'La capacidad, no un contador de mensajes. Con la clave incluida el asistente rellena el formulario y te resuelve dudas del módulo. El plan Estudio le pone un modelo que además razona: lee el veredicto del cálculo, te dice qué comprobación gobierna y por qué, y te propone qué cambiar. Nunca vas a ver «te quedan 12 mensajes».',
  ],
  [
    '¿Puedo usar mi propia clave de IA?',
    'Sí, y no te cobramos nada por ello, en cualquier plan, también en el Libre. Eliges el proveedor —Anthropic, OpenAI o Google— y el asistente usa su modelo: con Anthropic u OpenAI es uno mayor que el de la clave incluida; con Google, el mismo, con tu propia cuota. Tu consulta va directa al proveedor: no pasa por ningún servidor nuestro, porque no tenemos ninguno. El plan Estudio existe para quien prefiere no tener que traerla.',
  ],
  [
    '¿Mis cálculos y datos están en vuestros servidores?',
    'No. Concreta es una PWA: todo el cálculo ocurre en tu navegador y los datos viven en localStorage. Los «enlaces compartibles» son estado serializado en la URL — no pasan por nosotros.',
  ],
  [
    '¿Puedo cancelar en cualquier momento?',
    'Sí. Nos escribes un correo y lo cancelamos: sin llamadas, sin formularios y sin retenerte. Mantienes acceso hasta el final del periodo pagado y después la app vuelve al plan Libre con tus datos intactos.',
    'Cuando haya planes de pago, sí: nos escribes un correo y lo cancelamos, sin llamadas, sin formularios y sin retenerte. Mantendrás el acceso hasta el final del periodo pagado y después la app volverá al plan Libre con tus datos intactos. Hoy no hay nada que cancelar.',
  ],
  [
    '¿Hay descuento anual?',
    'Sí: pagando el año por adelantado, 12 meses al precio de 10. Aplica al plan Pro.',
    'Lo habrá: pagando el año por adelantado, 12 meses al precio de 10. Aplicará al plan Pro.',
  ],
  [
    '¿Estudiantes y educación?',
    'El plan Libre cubre los casos más habituales para uso académico. Si necesitas más para una asignatura o un TFG, escríbenos con tu correo institucional y te lo abrimos sin coste.',
  ],
  [
    '¿Factura con IVA y modelo 130?',
    'Sí. Facturas mensuales o anuales con NIF, IVA correctamente desglosado y compatibles con tu gestoría española. Te las enviamos por email en PDF.',
    'Cuando se cobre, sí: facturas mensuales o anuales con NIF, IVA correctamente desglosado y compatibles con tu gestoría española, por email en PDF. Durante la beta no se emite ninguna, porque no se cobra nada.',
  ],
];

function Cta({ plan }: { plan: Plan }) {
  const cls = `btn ${plan.highlight ? 'btn-primary ' : ''}plan-cta`;
  const inner = (
    <>
      {plan.cta} <span className="arr">→</span>
    </>
  );
  if (plan.ctaTo.startsWith('mailto:')) return <a href={plan.ctaTo} className={cls}>{inner}</a>;
  // The app route goes through rutaDeEntrada(), like every other «Acceder gratis».
  const to = plan.ctaTo === APP_ROUTE ? rutaDeEntrada() : plan.ctaTo;
  return <Link to={to} className={cls}>{inner}</Link>;
}

function PlanBadge({ plan }: { plan: Plan }) {
  const badge = planBadge(plan);
  if (!badge) return null;
  return (
    <div className={`plan-badge mono ${badge.soon ? 'plan-badge-soon' : ''}`}>{badge.text}</div>
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

      <LandingNav />

      <section className="subpage-hero">
        <div className="container subpage-hero-inner">
          <div className="subpage-eyebrow">{sectionEyebrow('precio')}</div>
          <h1 className="subpage-title">
            {BETA ? 'Gratis mientras dure la beta.' : 'Suscripción mensual. Sin sorpresas.'}
          </h1>
          <p className="subpage-lede">
            {BETA
              ? 'Concreta está en beta pública: no hay pasarela de pago y no hay nada bloqueado, así que estos planes son lo que costará, no lo que cuesta hoy. Cuando llegue el momento lo diremos con antelación — nunca vas a encontrarte un cobro que no hayas aceptado.'
              : 'Concreta es una herramienta diaria — y como tal cobramos por mes, no por proyecto. Sin sobreprecios y sin «contacta con ventas». El asistente escala por lo que sabe hacer, nunca por un contador de mensajes.'}
          </p>
        </div>
      </section>

      <main className="subpage-body">
        <div className="container">

          {BETA && (
            <div className="beta-banner">
              <span className="beta-tag mono">{BETA_TAG}</span>
              <p className="beta-banner-text">
                <strong>Ahora mismo no se cobra nada.</strong> {BETA_LINE}
              </p>
              <Link to={rutaDeEntrada()} className="btn btn-primary">
                {BETA_CTA} <span className="arr">→</span>
              </Link>
            </div>
          )}

          <div className="pricing-grid">
            {PLANS.map((p) => (
              <div className={`plan ${p.highlight ? 'plan-hi' : ''}`} key={p.id}>
                <PlanBadge plan={p} />
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
                {/* A boundary, not a feature — deliberately without a check mark. */}
                {p.note && <div className="plan-note">{p.note}</div>}
                <Cta plan={p} />
              </div>
            ))}
          </div>

          <h2 className="subsec-title">Comparativa completa</h2>
          <p className="subsec-lede">
            Lo mismo en formato denso para revisar a un golpe.
            {BETA && ' Es el reparto que habrá cuando haya planes: durante la beta las tres columnas están abiertas.'}
          </p>
          <div className="table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>Funcionalidad</th>
                  <th>Libre</th>
                  <th>Pro</th>
                  <th>Estudio</th>
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
            {[...(BETA ? BETA_FAQ : []), ...FAQ].map(([q, a, aBeta]) => (
              <div className="faq-item" key={q}>
                <h3 className="faq-q">{q}</h3>
                <p className="faq-a">{BETA && aBeta ? aBeta : a}</p>
              </div>
            ))}
          </div>

        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
