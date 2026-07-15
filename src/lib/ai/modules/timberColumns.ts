/**
 * Adapter del asistente IA para el módulo Pilares de madera (ola 1, EC5).
 * Payload en unidades humanas (mm de sección, m de altura, kN/kNm de esfuerzos)
 * que aquí coinciden con las internas de `TimberColumnInputs` → sin conversión.
 *
 * Particularidades del módulo:
 * - Nd/Vd/Md son valores de CÁLCULO, YA MAYORADOS (contraste con vigas de
 *   madera, que reciben cargas características y las mayora el motor). Es la
 *   regla nº 1 del prompt.
 * - Estrena los NIVELES ORDINALES de `safety.ts`: clase de servicio, duración de
 *   la carga y resistencia al fuego son enums cuyo "nivel de seguridad" se
 *   calibra con el factor normativo real del motor (kmod de la Tabla 3.1 de EC5,
 *   minutos de exposición), no con un orden inventado.
 * - Gate de fuego: con `fireResistance = 'R0'` la comprobación de incendio no
 *   existe y `exposedFaces` / `etaFi` son campos inertes.
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary, type CalcResultLike } from '../resultsSummary';
import {
  detectSafetyRisks,
  higherIsSafer,
  ordinalLevel,
  type SafetyRule,
} from '../safety';
import type { CheckRow } from '../../calculations/types';
import type { TimberColumnResult } from '../../calculations/timberColumns';
import { timberColumnDefaults, type TimberColumnInputs } from '../../../data/defaults';
import { TIMBER_GRADES } from '../../../data/timberGrades';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
const GRADE_IDS: readonly string[] = TIMBER_GRADES.map((g) => g.id);
const SERVICE_CLASSES: readonly number[] = [1, 2, 3];
const LOAD_DURATIONS: readonly string[] = ['permanent', 'long', 'medium', 'short', 'instantaneous'];
const FIRE_RESISTANCES: readonly string[] = ['R0', 'R30', 'R60', 'R90', 'R120'];
const EXPOSED_FACES: readonly number[] = [3, 4];
const MOMENT_AXES: readonly string[] = ['strong', 'weak'];
/** β del panel: el selector solo ofrece estas cuatro condiciones de apoyo. */
const BETA_OPTIONS: readonly number[] = [0.5, 0.7, 1.0, 2.0];

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const TIMBER_COLUMN_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'gradeId', 'b_mm', 'h_mm', 'L_m', 'beta_y', 'beta_z',
    'Nd_kN', 'Vd_kN', 'Md_kNm', 'momentAxis',
    'serviceClass', 'loadDuration', 'fireResistance', 'exposedFaces', 'etaFi',
    'warnings',
  ],
  properties: {
    gradeId: { type: ['string', 'null'], enum: [...GRADE_IDS, null], description: 'Clase resistente de la madera: C14–C40 (conífera aserrada), D30–D70 (frondosa aserrada) o GL24h–GL32h (laminada encolada). No existe GL36h.' },
    b_mm: { type: ['number', 'null'], description: 'Ancho de la sección b en mm (eje débil z).' },
    h_mm: { type: ['number', 'null'], description: 'Canto de la sección h en mm (eje fuerte y).' },
    L_m: { type: ['number', 'null'], description: 'Altura libre del pilar en METROS.' },
    beta_y: { type: ['number', 'null'], enum: [...BETA_OPTIONS, null], description: 'Coeficiente de pandeo del eje FUERTE (y): 0.5 biempotrado, 0.7 empotrado-articulado, 1.0 biarticulado, 2.0 ménsula.' },
    beta_z: { type: ['number', 'null'], enum: [...BETA_OPTIONS, null], description: 'Coeficiente de pandeo del eje DÉBIL (z): 0.5 biempotrado, 0.7 empotrado-articulado, 1.0 biarticulado, 2.0 ménsula.' },
    Nd_kN: { type: ['number', 'null'], description: 'Axil de CÁLCULO Nd en kN (compresión positiva). YA MAYORADO (ELU).' },
    Vd_kN: { type: ['number', 'null'], description: 'Cortante de CÁLCULO Vd en kN. YA MAYORADO (ELU).' },
    Md_kNm: { type: ['number', 'null'], description: 'Momento de CÁLCULO Md en kNm, sobre un solo eje. YA MAYORADO (ELU). Siempre positivo (es el módulo del momento).' },
    momentAxis: { type: ['string', 'null'], enum: [...MOMENT_AXES, null], description: 'Eje sobre el que actúa el momento: "strong" (eje fuerte, flexión en la dirección de h) o "weak" (eje débil, en la dirección de b).' },
    serviceClass: { type: ['integer', 'null'], enum: [...SERVICE_CLASSES, null], description: 'Clase de servicio EC5: 1 interior seco, 2 exterior cubierto o interior húmedo, 3 exterior a la intemperie.' },
    loadDuration: { type: ['string', 'null'], enum: [...LOAD_DURATIONS, null], description: 'Clase de duración de la carga (fija kmod): "permanent" (peso propio, tierras), "long" (almacenamiento), "medium" (sobrecarga de uso), "short" (nieve, montaje), "instantaneous" (viento, sismo).' },
    fireResistance: { type: ['string', 'null'], enum: [...FIRE_RESISTANCES, null], description: 'Resistencia al fuego exigida: "R0" (sin requisito), "R30", "R60", "R90" o "R120".' },
    exposedFaces: { type: ['integer', 'null'], enum: [...EXPOSED_FACES, null], description: 'Caras expuestas al fuego: 3 (pilar adosado a muro) o 4 (pilar exento). Solo aplica si hay requisito de fuego.' },
    etaFi: { type: ['number', 'null'], description: 'Factor de reducción de carga en incendio η_fi (0–1): Nd,fi = η_fi·Nd. Típico 0.65–0.70. Solo aplica si hay requisito de fuego.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, mayoración de cargas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Pilares de madera:
1. Nd, Vd y Md son valores de CÁLCULO, YA MAYORADOS (ELU). Si el enunciado da cargas características o de servicio ("el pilar recibe 60 kN de peso propio y 40 kN de sobrecarga"), MAYÓRALAS tú antes de proponerlas (γG = 1.35 permanentes, γQ = 1.5 variables, salvo indicación distinta) y explica la mayoración en un warning. Es la diferencia con el módulo de Vigas de madera, que recibe cargas SIN mayorar.
2. Md va en valor absoluto (el motor rechaza momentos negativos) y actúa sobre UN solo eje: "strong" es la flexión sobre el eje fuerte (dirección del canto h), "weak" sobre el débil (dirección del ancho b). Si el enunciado da momento en las dos direcciones, avísalo en warnings: este módulo no calcula flexión biaxial.
3. La sección (b_mm, h_mm) va en MILÍMETROS y la altura (L_m) en METROS. Una sección "16×16 cm" son b=160 y h=160 mm.
4. beta_y y beta_z solo admiten 0.5 (biempotrado), 0.7 (empotrado-articulado), 1.0 (biarticulado) y 2.0 (ménsula), y describen las condiciones de apoyo REALES del pilar en cada plano.
5. La clase de servicio y la duración de la carga fijan kmod (Tabla 3.1 de EC5), que multiplica TODAS las resistencias: son datos del proyecto (dónde está el pilar y qué acción gobierna), no botones para hacer que cumpla.
6. El fuego: con fireResistance = "R0" no hay comprobación de incendio y exposedFaces y etaFi son inertes. Con R30–R120 el motor calcula la sección residual carbonizada.
7. En este módulo son DATOS del problema, no variables de diseño: los esfuerzos (Nd, Vd, Md), la altura (L_m), los coeficientes de pandeo (beta_y, beta_z), la clase de servicio, la duración de la carga, la resistencia al fuego exigida y η_fi. Para que el pilar cumpla actúa SIEMPRE sobre la RESISTENCIA: sección mayor (b_mm, h_mm — subir la dimensión del eje que pandea) o clase resistente superior (C24 → C30, o madera laminada GL). NUNCA rebajes un esfuerzo, ni alargues la duración de la carga a una clase con kmod mayor, ni bajes la clase de servicio o el R exigido para que salga el cálculo.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Pilar de madera C24 de 16×16 cm y 3 m de altura, biarticulado, con un axil '
  + 'de cálculo de 80 kN y un momento de viento de 3 kNm en el eje fuerte. Interior seco, R60.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface TimberColumnPayload {
  gradeId: string | null;
  b_mm: number | null;
  h_mm: number | null;
  L_m: number | null;
  beta_y: number | null;
  beta_z: number | null;
  Nd_kN: number | null;
  Vd_kN: number | null;
  Md_kNm: number | null;
  momentAxis: string | null;
  serviceClass: number | null;
  loadDuration: string | null;
  fireResistance: string | null;
  exposedFaces: number | null;
  etaFi: number | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parsePayload(raw: unknown): TimberColumnPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    gradeId: stringOrNull(r.gradeId),
    b_mm: finiteNumber(r.b_mm),
    h_mm: finiteNumber(r.h_mm),
    L_m: finiteNumber(r.L_m),
    beta_y: finiteNumber(r.beta_y),
    beta_z: finiteNumber(r.beta_z),
    Nd_kN: finiteNumber(r.Nd_kN),
    Vd_kN: finiteNumber(r.Vd_kN),
    Md_kNm: finiteNumber(r.Md_kNm),
    momentAxis: stringOrNull(r.momentAxis),
    serviceClass: finiteNumber(r.serviceClass),
    loadDuration: stringOrNull(r.loadDuration),
    fireResistance: stringOrNull(r.fireResistance),
    exposedFaces: finiteNumber(r.exposedFaces),
    etaFi: finiteNumber(r.etaFi),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  gradeId: 'Clase resistente',
  b_mm: 'Ancho de sección b',
  h_mm: 'Canto de sección h',
  L_m: 'Altura del pilar L',
  beta_y: 'Coef. pandeo βy (eje fuerte)',
  beta_z: 'Coef. pandeo βz (eje débil)',
  Nd_kN: 'Axil de cálculo Nd',
  Vd_kN: 'Cortante de cálculo Vd',
  Md_kNm: 'Momento de cálculo Md',
  momentAxis: 'Eje del momento',
  serviceClass: 'Clase de servicio',
  loadDuration: 'Duración de la carga',
  fireResistance: 'Resistencia al fuego',
  exposedFaces: 'Caras expuestas al fuego',
  etaFi: 'Factor de carga en incendio η_fi',
} as const;

type PayloadKey = keyof typeof LABELS;

/** ORDER del contrato: `fireResistance` antes que sus dependientes. */
const KEY_ORDER: readonly PayloadKey[] = [
  'gradeId', 'b_mm', 'h_mm', 'L_m', 'beta_y', 'beta_z',
  'Nd_kN', 'Vd_kN', 'Md_kNm', 'momentAxis',
  'serviceClass', 'loadDuration', 'fireResistance', 'exposedFaces', 'etaFi',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

// Etiquetas humanas de los enums (mismos textos que los selectores del panel).
const DURATION_ES: Record<string, string> = {
  permanent: 'Permanente',
  long: 'Larga duración',
  medium: 'Media duración',
  short: 'Corta duración',
  instantaneous: 'Instantánea',
};
const AXIS_ES: Record<string, string> = { strong: 'Eje fuerte (h)', weak: 'Eje débil (b)' };

/**
 * Campos que NO son variables de diseño. La sección (b, h) y la clase resistente
 * SÍ lo son: agrandar el pilar o subir de C24 a GL28h es la salida legítima.
 *
 * Los ordinales se calibran con el FACTOR NORMATIVO real del motor, no con un
 * orden inventado:
 * - `loadDuration` → −kmod (Tabla 3.1 de EC5): kmod MENOR = más conservador, así
 *   que el nivel es el kmod cambiado de signo. Declarar "instantánea" (kmod 1.10)
 *   una carga permanente (0.60) sube todas las resistencias un 83%.
 * - `serviceClass` → SC3 baja kmod (0.65 frente a 0.80 en media duración); SC1 y
 *   SC2 comparten kmod EXACTO en pilares (kdef solo interviene en la flecha de
 *   vigas), así que pasar de 2 a 1 no relaja nada y no debe marcarse.
 * - `fireResistance` → minutos exigidos: bajar de R60 a R0 elimina entera la
 *   comprobación de incendio.
 *
 * PUNTOS CIEGOS conocidos (análogos al β=1.0 de pilares de hormigón y al
 * `duration='long'` de micropilotes): `exposedFaces` y `loadDuration` tienen por
 * defecto el valor CONSERVADOR (4 caras, media duración). Su relajación desde el
 * default — 4→3 caras, media→instantánea — es indistinguible de un primer
 * relleno del formulario, así que el gate anti-ruido la deja pasar. Con
 * `alwaysCheck` el aviso saltaría en casi toda extracción de enunciado y se
 * volvería papel pintado; el riesgo sí salta en cuanto el valor está fijado.
 */
export const TIMBER_COLUMN_SAFETY_RULES: ReadonlyArray<SafetyRule<TimberColumnInputs>> = [
  { field: 'Nd', confirmKey: 'Nd_kN', level: higherIsSafer, why: 'El axil de cálculo lo fija el análisis de la estructura: rebajarlo baja la compresión y la utilización de pandeo.' },
  { field: 'Vd', confirmKey: 'Vd_kN', level: higherIsSafer, why: 'El cortante de cálculo lo fija el análisis de la estructura: rebajarlo baja la tensión tangencial.' },
  { field: 'Md', confirmKey: 'Md_kNm', level: higherIsSafer, why: 'El momento de cálculo lo fija el análisis de la estructura: rebajarlo alivia la flexocompresión (ec. 6.23/6.24).' },
  { field: 'L', confirmKey: 'L_m', level: higherIsSafer, why: 'La altura del pilar la fija la geometría del edificio: acortarla reduce la esbeltez y sube kc, la resistencia a pandeo.' },
  {
    // FUGA 4 (auditoría 2026-07-14): `momentAxis` no tenía regla, y elige el módulo
    // resistente con el que se comprueba la flexión: eje fuerte → W = Wy (flexión
    // sobre h); eje débil → W = Wz (sobre b) — timberColumns.ts:206. En una escuadra
    // con h > b, declarar el momento sobre el eje FUERTE multiplica W por h/b (una
    // 100×200 lo duplica) y la tensión de flexión se parte por dos, sin tocar el pilar.
    //
    // Ordinal, y no magnitud resuelta, a propósito: resolver W mezclaría el efecto del
    // EJE con el de b/h, que sí son variables de diseño — engordar el pilar es la
    // salida legítima y no debe salir en rojo.
    field: 'momentAxis', // payload `momentAxis`: mismo nombre ⇒ sin confirmKey
    level: ordinalLevel({ weak: 1, strong: 0 }),
    why: 'El eje sobre el que flecta el pilar lo fija cómo está orientado en la obra y de dónde le llega el momento: pasarlo al eje FUERTE multiplica el módulo resistente por h/b y la tensión de flexión se desploma sin que nadie haya girado el pilar.',
  },
  { field: 'beta_y', level: higherIsSafer, why: 'β describe la condición de apoyo REAL del pilar: rebajarlo acorta la longitud de pandeo y sube kc sin tocar el pilar.' },
  { field: 'beta_z', level: higherIsSafer, why: 'β describe la condición de apoyo REAL del pilar: rebajarlo acorta la longitud de pandeo y sube kc sin tocar el pilar.' },
  {
    field: 'serviceClass',
    level: (v) => (typeof v === 'number' ? ({ 1: 0, 2: 0, 3: 1 }[v] ?? null) : null),
    why: 'La clase de servicio la fija dónde está el pilar (humedad del ambiente): bajarla desde la 3 sube kmod y con él todas las resistencias.',
  },
  {
    field: 'loadDuration',
    // Nivel = −kmod (EC5 Tabla 3.1, clase de servicio 1): menor kmod = más conservador.
    level: ordinalLevel({
      permanent: -0.60,
      long: -0.70,
      medium: -0.80,
      short: -0.90,
      instantaneous: -1.10,
    }),
    why: 'La duración de la carga la fija la acción que gobierna: declararla más corta sube kmod y con él todas las resistencias de cálculo.',
  },
  {
    field: 'fireResistance',
    level: ordinalLevel({ R0: 0, R30: 30, R60: 60, R90: 90, R120: 120 }),
    why: 'La resistencia al fuego exigida la fija el CTE DB-SI según el uso y la altura del edificio: rebajarla elimina o acorta la comprobación de incendio.',
  },
  {
    field: 'exposedFaces',
    level: higherIsSafer, // 4 caras carbonizan más que 3
    why: 'Las caras expuestas al fuego las fija la posición real del pilar (exento o adosado): pasar de 4 a 3 deja una sección residual mayor sin cambiar el pilar.',
  },
  { field: 'etaFi', level: higherIsSafer, why: 'η_fi es la fracción de la carga presente en el incendio: rebajarlo reduce la demanda de la combinación accidental.' },
];

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtMm = (mm: number) => `${mm} mm`;
const fmtM = (m: number) => `${m.toFixed(2)} m`;

export const FIRE_GATE_REASON =
  'Sin requisito de fuego (R0) no hay comprobación de incendio: el campo es inerte. '
  + 'Propón primero una resistencia al fuego (R30–R120).';

function buildTimberColumnPlan(
  x: TimberColumnPayload,
  current: TimberColumnInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<TimberColumnInputs> {
  const fields: Partial<TimberColumnInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof TimberColumnInputs>(
    key: PayloadKey,
    field: K,
    value: TimberColumnInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  /** Enum contra catálogo: fuera → skip; igual → ALREADY; si no, apply. */
  function applyEnum<K extends keyof TimberColumnInputs>(
    key: PayloadKey,
    field: K,
    value: string | number | null,
    catalog: readonly (string | number)[],
    reason: string,
    fmt: (v: string | number) => string,
  ): void {
    if (value === null) return;
    if (!catalog.includes(value)) {
      skip(key, reason);
      return;
    }
    const before = current[field] as unknown as string | number;
    if (value === before) skip(key, ALREADY);
    else apply(key, field, value as TimberColumnInputs[K], fmt(before), fmt(value));
  }

  // --- Clase resistente (catálogo EN 338 / EN 14080) ---
  applyEnum(
    'gradeId', 'gradeId', x.gradeId, GRADE_IDS,
    `La clase "${x.gradeId}" no existe en el catálogo (C14–C40, D30–D70, GL24h–GL32h; no hay GL36h)`,
    String,
  );

  // --- Sección (mm) y altura (m) ---
  function applyMm(key: 'b_mm' | 'h_mm', field: 'b' | 'h', value: number | null): void {
    if (value === null) return;
    if (value < 40 || value > 2000) {
      skip(key, rangeReason(value, 40, 2000, 'mm'));
      return;
    }
    const v = Math.round(value);
    if (v === current[field]) skip(key, ALREADY);
    else apply(key, field, v, fmtMm(current[field]), fmtMm(v));
  }
  applyMm('b_mm', 'b', x.b_mm);
  applyMm('h_mm', 'h', x.h_mm);

  if (x.L_m !== null) {
    if (x.L_m <= 0 || x.L_m > 30) {
      skip('L_m', rangeReason(x.L_m, 0.5, 30, 'm'));
    } else {
      const v = round2(x.L_m);
      if (Math.abs(v - current.L) <= EPS) skip('L_m', ALREADY);
      else apply('L_m', 'L', v, fmtM(current.L), fmtM(v));
    }
  }

  // --- β (catálogo del selector) ---
  const fmtBeta = (v: string | number) => Number(v).toFixed(2);
  const betaReason = (v: number) =>
    `β = ${v} no está entre las condiciones de apoyo del módulo (0.5, 0.7, 1.0, 2.0)`;
  if (x.beta_y !== null) {
    applyEnum('beta_y', 'beta_y', x.beta_y, BETA_OPTIONS, betaReason(x.beta_y), fmtBeta);
  }
  if (x.beta_z !== null) {
    applyEnum('beta_z', 'beta_z', x.beta_z, BETA_OPTIONS, betaReason(x.beta_z), fmtBeta);
  }

  // --- Esfuerzos de CÁLCULO (ya mayorados; el motor rechaza negativos) ---
  const fmtForce = (v: number) => formatQuantity(v, 'force', system);
  const fmtMoment = (v: number) => formatQuantity(v, 'moment', system);

  function applyEffort(
    key: 'Nd_kN' | 'Vd_kN' | 'Md_kNm',
    field: 'Nd' | 'Vd' | 'Md',
    value: number | null,
    max: number,
    unit: string,
    fmt: (v: number) => string,
  ): void {
    if (value === null) return;
    if (value < 0 || value > max) {
      skip(key, rangeReason(value, 0, max, unit));
      return;
    }
    const v = round2(value);
    if (Math.abs(v - current[field]) <= EPS) skip(key, ALREADY);
    else apply(key, field, v, fmt(current[field]), fmt(v));
  }
  applyEffort('Nd_kN', 'Nd', x.Nd_kN, 20000, 'kN', fmtForce);
  applyEffort('Vd_kN', 'Vd', x.Vd_kN, 5000, 'kN', fmtForce);
  applyEffort('Md_kNm', 'Md', x.Md_kNm, 5000, 'kNm', fmtMoment);

  applyEnum(
    'momentAxis', 'momentAxis', x.momentAxis, MOMENT_AXES,
    `Eje "${x.momentAxis}" desconocido (solo "strong" o "weak")`,
    (v) => AXIS_ES[String(v)] ?? String(v),
  );

  // --- Condiciones de uso ---
  applyEnum(
    'serviceClass', 'serviceClass', x.serviceClass, SERVICE_CLASSES,
    `Clase de servicio ${x.serviceClass} inexistente (solo 1, 2 ó 3)`,
    (v) => `SC ${v}`,
  );
  applyEnum(
    'loadDuration', 'loadDuration', x.loadDuration, LOAD_DURATIONS,
    `Duración "${x.loadDuration}" desconocida (permanent, long, medium, short, instantaneous)`,
    (v) => DURATION_ES[String(v)] ?? String(v),
  );

  // --- Fuego: gate R0 (exposedFaces y etaFi son inertes sin requisito) ---
  applyEnum(
    'fireResistance', 'fireResistance', x.fireResistance, FIRE_RESISTANCES,
    `Resistencia al fuego "${x.fireResistance}" desconocida (R0, R30, R60, R90, R120)`,
    String,
  );
  const fireFinal = (fields.fireResistance ?? current.fireResistance) as string;
  const fireActive = fireFinal !== 'R0';

  if (x.exposedFaces !== null) {
    if (!fireActive) {
      skip('exposedFaces', FIRE_GATE_REASON);
    } else {
      applyEnum(
        'exposedFaces', 'exposedFaces', x.exposedFaces, EXPOSED_FACES,
        `Solo 3 ó 4 caras expuestas (propuesto: ${x.exposedFaces})`,
        (v) => `${v} caras`,
      );
    }
  }
  if (x.etaFi !== null) {
    if (!fireActive) {
      skip('etaFi', FIRE_GATE_REASON);
    } else if (x.etaFi < 0 || x.etaFi > 1) {
      skip('etaFi', rangeReason(x.etaFi, 0, 1, ''));
    } else {
      const v = round2(x.etaFi);
      if (Math.abs(v - current.etaFi) <= EPS) skip('etaFi', ALREADY);
      else apply('etaFi', 'etaFi', v, current.etaFi.toFixed(2), v.toFixed(2));
    }
  }

  // --- notFound ---
  const values: Record<PayloadKey, unknown> = {
    gradeId: x.gradeId, b_mm: x.b_mm, h_mm: x.h_mm, L_m: x.L_m,
    beta_y: x.beta_y, beta_z: x.beta_z,
    Nd_kN: x.Nd_kN, Vd_kN: x.Vd_kN, Md_kNm: x.Md_kNm, momentAxis: x.momentAxis,
    serviceClass: x.serviceClass, loadDuration: x.loadDuration,
    fireResistance: x.fireResistance, exposedFaces: x.exposedFaces, etaFi: x.etaFi,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = detectSafetyRisks(
    TIMBER_COLUMN_SAFETY_RULES, changes, fields, current, timberColumnDefaults, confirmed,
  );
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

type StateKey = Exclude<keyof TimberColumnInputs, 'title'>;

const SNAPSHOT_FIELDS: Readonly<Record<PayloadKey, StateKey>> = {
  gradeId: 'gradeId',
  b_mm: 'b',
  h_mm: 'h',
  L_m: 'L',
  beta_y: 'beta_y',
  beta_z: 'beta_z',
  Nd_kN: 'Nd',
  Vd_kN: 'Vd',
  Md_kNm: 'Md',
  momentAxis: 'momentAxis',
  serviceClass: 'serviceClass',
  loadDuration: 'loadDuration',
  fireResistance: 'fireResistance',
  exposedFaces: 'exposedFaces',
  etaFi: 'etaFi',
};

function buildSnapshot(c: TimberColumnInputs): string {
  const valores: Record<string, number | string> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    valores[key] = value;
    if (value === timberColumnDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/**
 * `TimberColumnCheckRow` es "casi" un `CheckRow`, con una divergencia que hay que
 * traducir: sus filas informativas llevan `neutral: true` pero conservan
 * `status: 'ok'`. Sin este mapeo, `summarizeCalcResults` (que discrimina por
 * `status === 'neutral'`) contaría las cabeceras y las notas como
 * comprobaciones CUMPLE y falsearía el "N de M comprobaciones fallan".
 */
function toCheckRows(r: TimberColumnResult): CalcResultLike {
  const checks: CheckRow[] = r.checks.map((c) => ({
    ...c,
    status: c.neutral === true ? 'neutral' : c.status,
  }));
  return { valid: r.valid, error: r.error, checks };
}

export function summarizeTimberColumnResults(r: TimberColumnResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(toCheckRows(r));
  const extras = [
    `Factores del material: kmod = ${r.kmod.toFixed(2)} · γM = ${r.gammaM.toFixed(2)} · kh = ${r.kh.toFixed(3)}`,
    `Pandeo: λrel,y = ${r.lambda_rel_y.toFixed(2)} (kc,y = ${r.kc_y.toFixed(3)}) · `
      + `λrel,z = ${r.lambda_rel_z.toFixed(2)} (kc,z = ${r.kc_z.toFixed(3)})`,
  ];
  if (r.fireActive) {
    extras.push(
      `Incendio R${r.t_fire}: sección residual ${r.b_ef.toFixed(0)}×${r.h_ef.toFixed(0)} mm `
      + `(profundidad eficaz ${r.def.toFixed(1)} mm)`,
    );
  }
  return summarizeCalcResults(toCheckRows(r), extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const timberColumnsAdapter: AiModuleAdapter<TimberColumnInputs> = {
  id: 'timber-columns',
  label: 'Pilares de madera',
  payloadSchema: TIMBER_COLUMN_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildTimberColumnPlan(parsePayload(payload), current, system, confirmed),
};
