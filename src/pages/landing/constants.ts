// Shared constants for the landing page and its subpages.
//
// Two things live here because they were duplicated by hand and drifted:
//
//  1. SECTION_ORDER — the numbered eyebrows ("02 · Módulos") used to be 12
//     hardcoded strings across the landing and the subpages, and 4 of them had
//     already drifted (Normativa read 05 on the landing and 04 on its own page).
//     Inserting one section meant editing 12 files by hand. Now the number is
//     derived from position, exactly like MODULE_COUNT derives from
//     MODULE_LIBRARY.length in Hero.tsx.
//
//  2. PLANS — the pricing copy used to live in four files (the teaser, the
//     /pricing page, the closing CTA and the hero button) and contradicted
//     itself: the teaser listed "Sin exportación PDF" and the full page didn't;
//     the full page still said "12+" modules with 19 shipped. One source now.

/** Entry point into the real app — used by every "open the app" CTA. */
export const APP_ROUTE = '/horm/vigas';

/** FEM 2D frames — the sketch→model flow the hero leads with. */
export const FEM2D_ROUTE = '/analisis/fem2d';

// ── Section numbering ───────────────────────────────────────────────────────

/** Landing sections in render order. The eyebrow number is the index (1-based).
 *  `Landing.tsx` must render them in this order; subpages reuse the same number
 *  for the section they expand (Normativa, Precio, Blog, Quién). */
// Módulos before Asistente on purpose (decision 2026-07-27): the visitor should
// understand WHAT Concreta calculates before hearing that it has an assistant.
// The AI is a feature of the product, not the product.
export const SECTION_ORDER = [
  { id: 'hero', label: 'Portada' },
  { id: 'modulos', label: 'Módulos' },
  { id: 'asistente', label: 'Asistente' },
  { id: 'exportar', label: 'Exportar y compartir' },
  { id: 'filosofia', label: 'Filosofía' },
  { id: 'normativa', label: 'Normativa' },
  { id: 'recursos', label: 'Recursos' },
  { id: 'precio', label: 'Precio' },
  { id: 'blog', label: 'Blog' },
  { id: 'quien', label: 'Quién' },
] as const;

export type SectionId = (typeof SECTION_ORDER)[number]['id'];

/** "02 · Asistente" — the eyebrow string, numbered by position.
 *  Pass `label` to override the wording on a subpage ("05 · Sobre Concreta"
 *  expands the landing's "Quién") while keeping the number in sync. */
export function sectionEyebrow(id: SectionId, label?: string): string {
  const i = SECTION_ORDER.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`sectionEyebrow: unknown section '${id}'`);
  const n = String(i + 1).padStart(2, '0');
  return `${n} · ${label ?? SECTION_ORDER[i].label}`;
}

// ── Public beta ─────────────────────────────────────────────────────────────

/** There is no payment gateway and no licence gate: every module, the PDF and
 *  the assistant are open to everyone who opens the app. So the site says that
 *  instead of showing three price cards nobody can buy — the loud CTA opens the
 *  app, "Ver precios" steps down to a quiet button, and the paid tiers are
 *  marked PRÓXIMAMENTE.
 *
 *  Flip this to `false` the day checkout ships. Everything the beta changes is
 *  derived from it, and every `BETA_*` string below is copy to retire. */
// Typed as `boolean`, not inferred as `true`: the literal type would make
// every `!BETA` branch unreachable to TypeScript and flag the post-beta copy
// as dead code before it is ever used.
export const BETA: boolean = true;

/** One wording for every beta surface — nav, hero, pricing and closing used to
 *  drift (the mobile menu still said "Suscribirse" while the desktop nav said
 *  "Ver precios"), and a CTA that promises more than its destination delivers
 *  is exactly what this page is not allowed to do. */
export const BETA_CTA = 'Acceder gratis';
export const BETA_TAG = 'BETA PÚBLICA · GRATIS';
export const BETA_LINE =
  'Todos los módulos abiertos, sin tarjeta y sin límite de cálculo. Los planes de pago llegan cuando termine la beta.';

// ── Pricing ─────────────────────────────────────────────────────────────────

/** Where a plan's CTA goes. No payment link exists yet and no licence gate
 *  exists either, so paid plans open a prefilled email — a waiting list, not a
 *  checkout — instead of pretending to charge for something that is not gated.
 *  Subjects are ASCII on purpose: they are the measurement instrument, and a
 *  `€` survives neither every mail client nor an inbox filter. */
export const MAILTO_PRO = 'mailto:pro@concreta.tools?subject=Aviso%20Pro%2019';
export const MAILTO_ESTUDIO = 'mailto:estudio@concreta.tools?subject=Aviso%20Estudio%2049';

export interface Plan {
  id: 'libre' | 'pro' | 'estudio';
  name: string;
  blurb: string;
  price: string;
  unit: string;
  /** Full feature list — /pricing. */
  features: string[];
  /** Shorter list for the landing teaser. Subset of `features`. */
  teaserFeatures: string[];
  /** Footnote under the teaser card: a boundary, not a feature. Rendered
   *  without a check mark — a "✓ Sin exportación PDF" is a check on a negation. */
  note?: string;
  /** CTA on /pricing, where the decision happens. */
  cta: string;
  ctaTo: string;
  /** CTA on the landing teaser. */
  teaserCta: string;
  /** The one plan the page pushes: accent border and a filled badge. During the
   *  beta that is the free tier, because it is the only one you can act on. */
  highlight: boolean;
  /** Announced but not purchasable — dashed PRÓXIMAMENTE badge. While `BETA`
   *  holds, that is every paid tier. */
  soon: boolean;
}

/** The badge over a card's top border, or none. Derived here so the landing
 *  teaser and /pricing can never label the same plan two different ways. */
export function planBadge(p: Plan): { text: string; soon: boolean } | null {
  if (p.soon) return { text: 'PRÓXIMAMENTE', soon: true };
  if (p.highlight) return { text: BETA ? 'GRATIS EN BETA' : 'RECOMENDADO', soon: false };
  return null;
}

export const PLANS: Plan[] = [
  {
    id: 'libre',
    name: 'Libre',
    // "Para probar antes de comprar" describes a decision nobody can make yet:
    // there is nothing to buy during the beta.
    blurb: BETA ? 'Gratis ahora, y gratis después.' : 'Para probar antes de comprar.',
    price: '0',
    unit: '€/mes',
    features: [
      'Vigas HA, vigas de acero y pórticos 2D',
      'Asistente IA incluido',
      'Cálculo ilimitado',
      'Enlaces compartibles',
      'PWA offline',
      'Casos guardados en local',
    ],
    teaserFeatures: [
      'Vigas HA, acero y pórticos 2D',
      'Asistente IA incluido',
      'Cálculo ilimitado',
      'Enlaces compartibles',
      'PWA offline',
    ],
    // The note is the plan's boundary, and during the beta that boundary is not
    // enforced — saying "el PDF va en Pro" to a beta tester is telling them not
    // to use something they already have.
    note: BETA
      ? 'Durante la beta también tienes el resto de módulos y el PDF, sin coste.'
      : 'El PDF del anejo va en Pro.',
    cta: BETA ? BETA_CTA : 'Empezar gratis',
    ctaTo: APP_ROUTE,
    teaserCta: BETA ? BETA_CTA : 'Empezar',
    highlight: BETA,
    soon: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: 'Para el técnico individual.',
    price: '19',
    unit: '€/mes',
    features: [
      'Todos los módulos',
      'Asistente IA incluido',
      'Exportación PDF vectorial',
      'Marca propia en informes',
      'Sin marca de agua',
      'Casos guardados en local',
      'Soporte por email · 48 h',
    ],
    teaserFeatures: [
      'Todos los módulos',
      'Exportación PDF vectorial',
      'Marca propia en informes',
      'Sin marca de agua',
      'Soporte por email · 48 h',
    ],
    cta: BETA ? 'Avísame cuando esté' : 'Quiero suscribirme',
    ctaTo: MAILTO_PRO,
    teaserCta: 'Ver el plan Pro',
    highlight: !BETA,
    soon: BETA,
  },
  {
    id: 'estudio',
    name: 'Estudio',
    blurb: 'Cuando la IA tiene que razonar, no solo rellenar.',
    price: '49',
    unit: '€/mes',
    features: [
      'Todo lo de Pro',
      'Asistente con el modelo que razona, incluido',
      'Diagnostica por qué falla una comprobación',
      'Propone la corrección, no solo el error',
      'Sin traer tu propia clave',
    ],
    teaserFeatures: [
      'Todo lo de Pro',
      'IA que diagnostica y propone',
      'Sin traer tu propia clave',
    ],
    cta: 'Avísame cuando esté',
    ctaTo: MAILTO_ESTUDIO,
    teaserCta: 'Ver el plan Estudio',
    highlight: false,
    soon: true,
  },
];
