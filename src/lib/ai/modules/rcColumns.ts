/**
 * Adapter del asistente IA para el módulo Pilares de hormigón (rc-columns).
 * Fase 1 — chat conversacional. A diferencia de vigas de acero, aquí los
 * esfuerzos de cálculo (Nd/MEdy/MEdz) SON inputs manuales y sí se extraen.
 *
 * Payload en unidades "humanas" del modelo: L_m en METROS (el estado interno
 * de rc-columns YA guarda L en m — sin conversión), geometría de la sección
 * en mm, esfuerzos en kN/kNm. Mismo patrón que mapExtraction.ts: parseo
 * defensivo, skip con motivo, "Ya coincide con el valor actual", notFound
 * por labels y jamás clamp silencioso.
 */
import { AiError } from '../types';
import type {
  AiApplyPlan,
  AiFieldChange,
  AiModuleAdapter,
  AiSkippedField,
} from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import { detectSafetyRisks, higherIsSafer, type SafetyRule } from '../safety';
import type { RCColumnResult } from '../../calculations/rcColumns';
import { rcColumnDefaults, type RCColumnInputs } from '../../../data/defaults';
import { availableFck, availableFyk } from '../../../data/materials';
import { availableBarDiams } from '../../../data/rebar';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

type SectionShape = 'rectangular' | 'circular';

const SHAPES = ['rectangular', 'circular'] as const;

/** Diámetros de cerco que ofrece el panel (RCColumnsInputs STIRRUP_DIAM_OPTIONS). */
const STIRRUP_DIAMS: readonly number[] = [6, 8, 10, 12];

/** Payload del proposal en unidades del modelo. Todo nullable. */
interface RcColumnsPayload {
  sectionType: SectionShape | null;
  b_mm: number | null;
  h_mm: number | null;
  D_mm: number | null;
  cover_mm: number | null;
  L_m: number | null;
  beta: number | null;
  fck_MPa: number | null;
  fyk_MPa: number | null;
  cornerBarDiam_mm: number | null;
  nBarsX: number | null;
  barDiamX_mm: number | null;
  nBarsY: number | null;
  barDiamY_mm: number | null;
  nBarsCirc: number | null;
  circBarDiam_mm: number | null;
  stirrupDiam_mm: number | null;
  stirrupSpacing_mm: number | null;
  Nd_kN: number | null;
  MEdy_kNm: number | null;
  MEdz_kNm: number | null;
  warnings: string[];
}

/**
 * JSON Schema canónico PLANO del payload (mismo estilo que
 * STEEL_BEAM_EXTRACTION_SCHEMA): todo nullable vía type-arrays / enums con
 * null, additionalProperties false, todos required, descriptions en español
 * indicando la unidad. Sin minimum/maximum: los rangos se validan en cliente.
 */
const RC_COLUMNS_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'sectionType', 'b_mm', 'h_mm', 'D_mm', 'cover_mm', 'L_m', 'beta',
    'fck_MPa', 'fyk_MPa', 'cornerBarDiam_mm', 'nBarsX', 'barDiamX_mm',
    'nBarsY', 'barDiamY_mm', 'nBarsCirc', 'circBarDiam_mm',
    'stirrupDiam_mm', 'stirrupSpacing_mm', 'Nd_kN', 'MEdy_kNm', 'MEdz_kNm',
    'warnings',
  ],
  properties: {
    sectionType: { type: ['string', 'null'], enum: ['rectangular', 'circular', null], description: 'Forma de la sección. Obligatorio "circular" si el enunciado da un diámetro D.' },
    b_mm: { type: ['integer', 'null'], description: 'Ancho b de la sección rectangular en mm.' },
    h_mm: { type: ['integer', 'null'], description: 'Canto h de la sección rectangular en mm.' },
    D_mm: { type: ['integer', 'null'], description: 'Diámetro D de la sección circular en mm.' },
    cover_mm: { type: ['integer', 'null'], description: 'Recubrimiento mecánico en mm.' },
    L_m: { type: ['number', 'null'], description: 'Longitud real del pilar en METROS.' },
    beta: { type: ['number', 'null'], description: 'Coeficiente de pandeo β (Lk = β·L), adimensional. SOLO si el enunciado da su valor numérico explícito.' },
    fck_MPa: { type: ['integer', 'null'], enum: [...availableFck, null], description: 'Resistencia característica del hormigón en MPa (HA-25 → 25).' },
    fyk_MPa: { type: ['integer', 'null'], enum: [...availableFyk, null], description: 'Límite elástico del acero de armar en MPa (B500S → 500).' },
    cornerBarDiam_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'Diámetro en mm de las 4 barras de esquina (solo sección rectangular).' },
    nBarsX: { type: ['integer', 'null'], description: 'Nº de barras intermedias POR CARA en las caras superior/inferior, sin contar esquinas (solo rectangular).' },
    barDiamX_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'Diámetro en mm de las barras intermedias de las caras superior/inferior (solo rectangular).' },
    nBarsY: { type: ['integer', 'null'], description: 'Nº de barras intermedias POR CARA en las caras laterales, sin contar esquinas (solo rectangular).' },
    barDiamY_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'Diámetro en mm de las barras intermedias de las caras laterales (solo rectangular).' },
    nBarsCirc: { type: ['integer', 'null'], description: 'Nº de barras longitudinales del anillo (solo sección circular, mínimo 4).' },
    circBarDiam_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'Diámetro en mm de las barras del anillo (solo circular).' },
    stirrupDiam_mm: { type: ['integer', 'null'], enum: [...STIRRUP_DIAMS, null], description: 'Diámetro del cerco en mm.' },
    stirrupSpacing_mm: { type: ['integer', 'null'], description: 'Separación longitudinal entre cercos en mm.' },
    Nd_kN: { type: ['number', 'null'], description: 'Axil de cálculo Nd en kN, compresión positiva.' },
    MEdy_kNm: { type: ['number', 'null'], description: 'Momento de cálculo MEd,y en kNm, en VALOR ABSOLUTO (flexión que agota el canto h).' },
    MEdz_kNm: { type: ['number', 'null'], description: 'Momento de cálculo MEd,z en kNm, en VALOR ABSOLUTO (flexión que agota el ancho b).' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades, ambigüedades, datos ignorados.' },
  },
};

const RC_COLUMNS_PROMPT_RULES = `Reglas del módulo Pilares de hormigón:
1. En este módulo los esfuerzos de cálculo son entradas directas (no hay generador de cargas): extrae Nd_kN (axil de cálculo, compresión positiva), MEdy_kNm y MEdz_kNm cuando el enunciado los dé. Devuelve los momentos SIEMPRE en valor absoluto (magnitud sin signo). El módulo no calcula tracción: si el axil es de tracción, explícalo en "reply" y deja Nd_kN en null.
2. Unidades: L_m (longitud real del pilar) en METROS; toda la geometría de la sección (b_mm, h_mm, D_mm, cover_mm, stirrupSpacing_mm y los diámetros) en MILÍMETROS. Si el enunciado usa cm, convierte (30×40 cm → b_mm 300, h_mm 400).
3. beta SOLO si el enunciado da un valor numérico explícito del coeficiente de pandeo β. Si describe las vinculaciones con palabras ("biempotrado", "empotrado-libre", "en ménsula"...), NO deduzcas β: pregunta en "reply" qué β usar y deja beta en null.
4. Armado rectangular: cornerBarDiam_mm es el diámetro de las 4 barras de esquina; nBarsX/barDiamX_mm son las intermedias por cara arriba/abajo y nBarsY/barDiamY_mm las intermedias por cara en los laterales. Si el usuario da un armado total sin distribución (p. ej. "8Ø16") en sección rectangular, NO lo repartas tú: pregunta en "reply" cómo se distribuye y deja los campos de armado en null. En sección circular sí es directo: "8Ø16" → nBarsCirc 8 y circBarDiam_mm 16.
5. Si el enunciado da un momento "M" sin indicar el eje, NO elijas tú: el módulo es de flexión biaxial (MEd,y agota el canto h; MEd,z agota el ancho b). Pregunta en "reply" sobre qué eje actúa y deja MEdy_kNm y MEdz_kNm en null.
6. Si el enunciado da un diámetro de sección D, el pilar es circular: devuelve sectionType "circular" junto con D_mm. Si da b×h, devuelve sectionType "rectangular" con b_mm/h_mm. Nunca mezcles campos de ambas formas.
7. En este módulo son DATOS del problema, no variables de diseño: los esfuerzos (Nd_kN, MEdy_kNm, MEdz_kNm), la longitud L_m, el coeficiente de pandeo beta y el recubrimiento cover_mm (lo fija la clase de exposición por durabilidad, CE Anejo 19 §4.4 — no la comprobación). Para hacer que el pilar cumpla actúa SIEMPRE sobre la resistencia: sección mayor (b_mm/h_mm/D_mm), más armadura o de mayor diámetro, hormigón de más resistencia (fck_MPa). NUNCA bajes un esfuerzo, la longitud, β o el recubrimiento para que salga el cálculo.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Pilar de 30×40 cm y 3,20 m de altura, HA-30 y B500S, con Nd = 900 kN, MEdy = 40 kN·m y β = 1.';

// --- Labels españoles propios del módulo (patrón mapExtraction regla 9) ---
const LABELS = {
  sectionType: 'Forma de la sección',
  b_mm: 'Ancho b',
  h_mm: 'Canto h',
  D_mm: 'Diámetro D',
  cover_mm: 'Recubrimiento mecánico',
  L_m: 'Longitud L',
  beta: 'Coeficiente de pandeo β',
  fck_MPa: 'Hormigón fck',
  fyk_MPa: 'Acero fyk',
  cornerBarDiam_mm: 'Ø barras de esquina',
  nBarsX: 'Barras intermedias cara X',
  barDiamX_mm: 'Ø intermedias cara X',
  nBarsY: 'Barras intermedias cara Y',
  barDiamY_mm: 'Ø intermedias cara Y',
  nBarsCirc: 'Nº barras del anillo',
  circBarDiam_mm: 'Ø barras del anillo',
  stirrupDiam_mm: 'Ø cercos',
  stirrupSpacing_mm: 'Separación de cercos',
  Nd_kN: 'Axil Nd',
  MEdy_kNm: 'Momento MEd,y',
  MEdz_kNm: 'Momento MEd,z',
} as const;

type PayloadKey = keyof typeof LABELS;

const KEY_ORDER: readonly PayloadKey[] = [
  'sectionType', 'b_mm', 'h_mm', 'D_mm', 'cover_mm', 'L_m', 'beta',
  'fck_MPa', 'fyk_MPa', 'cornerBarDiam_mm', 'nBarsX', 'barDiamX_mm',
  'nBarsY', 'barDiamY_mm', 'nBarsCirc', 'circBarDiam_mm',
  'stirrupDiam_mm', 'stirrupSpacing_mm', 'Nd_kN', 'MEdy_kNm', 'MEdz_kNm',
];

const SHAPE_LABELS: Record<SectionShape, string> = {
  rectangular: 'Rectangular',
  circular: 'Circular',
};

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

/**
 * Campos de pilares que NO son variables de diseño: los fija el análisis de la
 * estructura (esfuerzos, longitud, vinculaciones) o la durabilidad
 * (recubrimiento). Bajar su nivel hace que el pilar cumpla sin tocar el pilar
 * (ver safety.ts). La sección (b/h/D), el armado y el hormigón SÍ son diseño —
 * subirlos es la salida legítima — y por eso no tienen regla.
 */
export const RC_COLUMNS_SAFETY_RULES: ReadonlyArray<SafetyRule<RCColumnInputs>> = [
  {
    field: 'Nd',
    confirmKey: 'Nd_kN',
    level: higherIsSafer,
    why: 'El axil de cálculo lo fija el análisis de la estructura: rebajarlo baja la solicitación del pilar.',
  },
  {
    field: 'MEdy',
    confirmKey: 'MEdy_kNm',
    level: higherIsSafer,
    why: 'El momento de cálculo MEd,y lo fija el análisis de la estructura: rebajarlo baja la solicitación del pilar.',
  },
  {
    field: 'MEdz',
    confirmKey: 'MEdz_kNm',
    level: higherIsSafer,
    why: 'El momento de cálculo MEd,z lo fija el análisis de la estructura: rebajarlo baja la solicitación del pilar.',
  },
  {
    field: 'L',
    confirmKey: 'L_m',
    level: higherIsSafer,
    why: 'La longitud del pilar es un dato de la estructura: rebajarla reduce la esbeltez y con ella los efectos de segundo orden.',
  },
  {
    field: 'beta', // payload `beta`: mismo nombre que el estado ⇒ sin confirmKey
    level: higherIsSafer,
    // PUNTO CIEGO CONOCIDO: el default de beta es 1.0, que es además el valor
    // real más común (pilar biarticulado). Un β = 1.0 fijado a conciencia es
    // indistinguible del de fábrica, así que el gate anti-ruido deja pasar sin
    // aviso la bajada 1.0 → 0.7. No se corrige con `alwaysCheck` a propósito:
    // en edificación β < 1 (pórtico arriostrado) es un dato de entrada
    // frecuentísimo y avisar siempre pondría el interlock delante de casi toda
    // primera extracción — papel pintado. Aquí cubre la regla 7 del prompt (el
    // modelo solo puede proponer β si el enunciado da su valor numérico).
    why: 'El coeficiente de pandeo β lo fijan las vinculaciones reales del pilar: rebajarlo acorta la longitud de pandeo y reduce artificialmente la excentricidad de segundo orden.',
  },
  {
    field: 'cover',
    confirmKey: 'cover_mm',
    level: higherIsSafer,
    why: 'El recubrimiento lo fija la clase de exposición por durabilidad (CE Anejo 19 §4.4), no la comprobación resistente: reducirlo aumenta el canto útil y, con él, la resistencia calculada.',
  },
];

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtM = (m: number) => m.toFixed(2) + ' m';
const fmtMm = (mm: number) => `${mm} mm`;
const fmtDiam = (mm: number) => `Ø${mm}`;
const fmtCount = (n: number) => `${n} ud`;
const fmtMPa = (v: number) => `${v} MPa`;

function rangeReason(value: number, min: number, max: number, unit = ''): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

// --- Parseo defensivo (calca de parseExtraction en validate.ts) ---

/** número finito o null (NaN/Infinity/tipo incorrecto → null, defensivo). */
function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** valor dentro de la lista permitida o null. */
function oneOf<T extends string | number>(v: unknown, allowed: readonly T[]): T | null {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : null;
}

/**
 * Normaliza el proposal crudo del LLM a RcColumnsPayload.
 * - raw no-objeto → throw AiError('bad-response')
 * - Campo con tipo incorrecto, número no finito o enum fuera de lista → null
 * - warnings: filtra a strings; si falta o no es array → []
 * Los catálogos numéricos (fck/fyk/diámetros) NO se filtran aquí: los valida
 * el mapper para que el descarte sea visible como skip con motivo.
 */
function parsePayload(raw: unknown): RcColumnsPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    sectionType: oneOf(r.sectionType, SHAPES),
    b_mm: finiteNumber(r.b_mm),
    h_mm: finiteNumber(r.h_mm),
    D_mm: finiteNumber(r.D_mm),
    cover_mm: finiteNumber(r.cover_mm),
    L_m: finiteNumber(r.L_m),
    beta: finiteNumber(r.beta),
    fck_MPa: finiteNumber(r.fck_MPa),
    fyk_MPa: finiteNumber(r.fyk_MPa),
    cornerBarDiam_mm: finiteNumber(r.cornerBarDiam_mm),
    nBarsX: finiteNumber(r.nBarsX),
    barDiamX_mm: finiteNumber(r.barDiamX_mm),
    nBarsY: finiteNumber(r.nBarsY),
    barDiamY_mm: finiteNumber(r.barDiamY_mm),
    nBarsCirc: finiteNumber(r.nBarsCirc),
    circBarDiam_mm: finiteNumber(r.circBarDiam_mm),
    stirrupDiam_mm: finiteNumber(r.stirrupDiam_mm),
    stirrupSpacing_mm: finiteNumber(r.stirrupSpacing_mm),
    Nd_kN: finiteNumber(r.Nd_kN),
    MEdy_kNm: finiteNumber(r.MEdy_kNm),
    MEdz_kNm: finiteNumber(r.MEdz_kNm),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

/**
 * Convierte el payload crudo del LLM en un plan de aplicación sobre
 * RCColumnInputs. Nunca aplica en silencio: fuera de rango / fuera de
 * catálogo / campo de la otra forma / igual al actual → skipped con motivo.
 * NUNCA produce title/phiEf ni derivados (Lk).
 * `fields` en unidades internas: L directo en m (¡sin conversión!), resto
 * en mm/kN/kNm tal cual.
 */
function buildRcColumnsPlan(
  payload: unknown,
  current: RCColumnInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<RCColumnInputs> {
  const x = parsePayload(payload);
  const fields: Partial<RCColumnInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  // Campos del payload ya resueltos (change o skip) — el resto de nulls va a notFound.
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof RCColumnInputs>(
    key: PayloadKey,
    field: K,
    value: RCColumnInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  /** Entero con rango (gate de forma ya superado). Redondeo defensivo a entero. */
  function applyIntRange(
    key: PayloadKey,
    field: 'b' | 'h' | 'D' | 'cover' | 'stirrupSpacing' | 'nBarsX' | 'nBarsY' | 'nBarsCirc',
    raw: number,
    min: number,
    max: number,
    cur: number,
    fmt: (v: number) => string,
    unit: string,
  ): void {
    const v = Math.round(raw);
    if (v < min || v > max) skip(key, rangeReason(v, min, max, unit));
    else if (v === cur) skip(key, ALREADY);
    else apply(key, field, v, fmt(cur), fmt(v));
  }

  /** Valor contra catálogo cerrado (gate de forma ya superado). */
  function applyCatalog(
    key: PayloadKey,
    field: 'fck' | 'fyk' | 'cornerBarDiam' | 'barDiamX' | 'barDiamY' | 'circBarDiam' | 'stirrupDiam',
    raw: number,
    list: readonly number[],
    cur: number,
    fmt: (v: number) => string,
  ): void {
    if (!list.includes(raw)) skip(key, `${fmt(raw)} no está en el catálogo (${list.map(fmt).join(', ')})`);
    else if (raw === cur) skip(key, ALREADY);
    else apply(key, field, raw, fmt(cur), fmt(raw));
  }

  // --- Trampa sectionType: forma efectiva; nunca conmutar forma en silencio ---
  const currentShape: SectionShape = current.sectionType ?? 'rectangular';
  const shape: SectionShape = x.sectionType ?? currentShape;
  const RECT_ONLY = 'Solo aplica a la sección rectangular y la forma efectiva es circular; indica el cambio de forma explícitamente si procede';
  const CIRC_ONLY = 'Solo aplica a la sección circular y la forma efectiva es rectangular; indica el cambio de forma explícitamente si procede';

  if (x.sectionType !== null) {
    if (x.sectionType === currentShape) skip('sectionType', ALREADY);
    else apply('sectionType', 'sectionType', x.sectionType, SHAPE_LABELS[currentShape], SHAPE_LABELS[x.sectionType]);
  }

  // --- Geometría rectangular (gate por forma efectiva) ---
  if (x.b_mm !== null) {
    if (shape !== 'rectangular') skip('b_mm', RECT_ONLY);
    else applyIntRange('b_mm', 'b', x.b_mm, 100, 2000, current.b, fmtMm, 'mm');
  }
  if (x.h_mm !== null) {
    if (shape !== 'rectangular') skip('h_mm', RECT_ONLY);
    else applyIntRange('h_mm', 'h', x.h_mm, 100, 2000, current.h, fmtMm, 'mm');
  }

  // --- Geometría circular (con sectionType+D_mm juntos ambos aplican) ---
  if (x.D_mm !== null) {
    if (shape !== 'circular') skip('D_mm', CIRC_ONLY);
    else applyIntRange('D_mm', 'D', x.D_mm, 150, 2000, current.D ?? 350, fmtMm, 'mm');
  }

  // --- Común a ambas formas ---
  if (x.cover_mm !== null) {
    applyIntRange('cover_mm', 'cover', x.cover_mm, 10, 100, current.cover, fmtMm, 'mm');
  }

  // --- L: estado YA en m — sin conversión ---
  if (x.L_m !== null) {
    if (x.L_m < 0.5 || x.L_m > 20) skip('L_m', rangeReason(x.L_m, 0.5, 20, 'm'));
    else if (Math.abs(x.L_m - current.L) <= EPS) skip('L_m', ALREADY);
    else apply('L_m', 'L', x.L_m, fmtM(current.L), fmtM(x.L_m));
  }

  // --- β: solo llega si fue numérico explícito (regla 3 del prompt) ---
  if (x.beta !== null) {
    if (x.beta < 0.5 || x.beta > 4) skip('beta', rangeReason(x.beta, 0.5, 4));
    else if (Math.abs(x.beta - current.beta) <= EPS) skip('beta', ALREADY);
    else apply('beta', 'beta', x.beta, current.beta.toFixed(2), x.beta.toFixed(2));
  }

  // --- Materiales contra catálogo ---
  if (x.fck_MPa !== null) applyCatalog('fck_MPa', 'fck', x.fck_MPa, availableFck, current.fck, fmtMPa);
  if (x.fyk_MPa !== null) applyCatalog('fyk_MPa', 'fyk', x.fyk_MPa, availableFyk, current.fyk, fmtMPa);

  // --- Armado longitudinal rectangular ---
  if (x.cornerBarDiam_mm !== null) {
    if (shape !== 'rectangular') skip('cornerBarDiam_mm', RECT_ONLY);
    else applyCatalog('cornerBarDiam_mm', 'cornerBarDiam', x.cornerBarDiam_mm, availableBarDiams, current.cornerBarDiam, fmtDiam);
  }
  if (x.nBarsX !== null) {
    if (shape !== 'rectangular') skip('nBarsX', RECT_ONLY);
    else applyIntRange('nBarsX', 'nBarsX', x.nBarsX, 0, 10, current.nBarsX, fmtCount, 'ud');
  }
  if (x.barDiamX_mm !== null) {
    if (shape !== 'rectangular') skip('barDiamX_mm', RECT_ONLY);
    else applyCatalog('barDiamX_mm', 'barDiamX', x.barDiamX_mm, availableBarDiams, current.barDiamX, fmtDiam);
  }
  if (x.nBarsY !== null) {
    if (shape !== 'rectangular') skip('nBarsY', RECT_ONLY);
    else applyIntRange('nBarsY', 'nBarsY', x.nBarsY, 0, 10, current.nBarsY, fmtCount, 'ud');
  }
  if (x.barDiamY_mm !== null) {
    if (shape !== 'rectangular') skip('barDiamY_mm', RECT_ONLY);
    else applyCatalog('barDiamY_mm', 'barDiamY', x.barDiamY_mm, availableBarDiams, current.barDiamY, fmtDiam);
  }

  // --- Armado longitudinal circular ---
  if (x.nBarsCirc !== null) {
    if (shape !== 'circular') skip('nBarsCirc', CIRC_ONLY);
    else applyIntRange('nBarsCirc', 'nBarsCirc', x.nBarsCirc, 4, 24, current.nBarsCirc ?? 6, fmtCount, 'ud');
  }
  if (x.circBarDiam_mm !== null) {
    if (shape !== 'circular') skip('circBarDiam_mm', CIRC_ONLY);
    else applyCatalog('circBarDiam_mm', 'circBarDiam', x.circBarDiam_mm, availableBarDiams, current.circBarDiam ?? 16, fmtDiam);
  }

  // --- Armadura transversal (ambas formas) ---
  if (x.stirrupDiam_mm !== null) {
    applyCatalog('stirrupDiam_mm', 'stirrupDiam', x.stirrupDiam_mm, STIRRUP_DIAMS, current.stirrupDiam, fmtDiam);
  }
  if (x.stirrupSpacing_mm !== null) {
    applyIntRange('stirrupSpacing_mm', 'stirrupSpacing', x.stirrupSpacing_mm, 50, 400, current.stirrupSpacing, fmtMm, 'mm');
  }

  // --- Esfuerzos (aquí SÍ se extraen: inputs manuales del módulo) ---
  if (x.Nd_kN !== null) {
    if (x.Nd_kN < 0) {
      skip('Nd_kN', `Axil ${x.Nd_kN} kN negativo: tracción no soportada (el módulo calcula pilares en compresión)`);
    } else if (x.Nd_kN > 20000) {
      skip('Nd_kN', rangeReason(x.Nd_kN, 0, 20000, 'kN'));
    } else {
      const v = round2(x.Nd_kN);
      if (Math.abs(v - current.Nd) <= EPS) skip('Nd_kN', ALREADY);
      else apply('Nd_kN', 'Nd', v, formatQuantity(current.Nd, 'force', system), formatQuantity(v, 'force', system));
    }
  }

  /** Momento: negativo → valor absoluto + warning (jamás clamp silencioso). */
  function applyMoment(key: 'MEdy_kNm' | 'MEdz_kNm', field: 'MEdy' | 'MEdz', raw: number, cur: number): void {
    let m = raw;
    if (m < 0) {
      m = Math.abs(m);
      warnings.push(`${LABELS[key]} negativo (${raw} kNm): se aplica su valor absoluto (${m} kNm).`);
    }
    if (m > 5000) {
      skip(key, rangeReason(m, 0, 5000, 'kNm'));
    } else {
      const v = round2(m);
      if (Math.abs(v - cur) <= EPS) skip(key, ALREADY);
      else apply(key, field, v, formatQuantity(cur, 'moment', system), formatQuantity(v, 'moment', system));
    }
  }

  if (x.MEdy_kNm !== null) applyMoment('MEdy_kNm', 'MEdy', x.MEdy_kNm, current.MEdy);
  if (x.MEdz_kNm !== null) applyMoment('MEdz_kNm', 'MEdz', x.MEdz_kNm, current.MEdz);

  // --- notFound: campos null no resueltos por el mapper ---
  const values: Record<PayloadKey, unknown> = {
    sectionType: x.sectionType, b_mm: x.b_mm, h_mm: x.h_mm, D_mm: x.D_mm,
    cover_mm: x.cover_mm, L_m: x.L_m, beta: x.beta,
    fck_MPa: x.fck_MPa, fyk_MPa: x.fyk_MPa,
    cornerBarDiam_mm: x.cornerBarDiam_mm, nBarsX: x.nBarsX, barDiamX_mm: x.barDiamX_mm,
    nBarsY: x.nBarsY, barDiamY_mm: x.barDiamY_mm,
    nBarsCirc: x.nBarsCirc, circBarDiam_mm: x.circBarDiam_mm,
    stirrupDiam_mm: x.stirrupDiam_mm, stirrupSpacing_mm: x.stirrupSpacing_mm,
    Nd_kN: x.Nd_kN, MEdy_kNm: x.MEdy_kNm, MEdz_kNm: x.MEdz_kNm,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = detectSafetyRisks(
    RC_COLUMNS_SAFETY_RULES, changes, fields, current, rcColumnDefaults, confirmed,
  );
  return { fields, changes, skipped, notFound, warnings, risks };
}

// --- Snapshot del estado vivo (contrato {valores, sin_confirmar}) ---

/** Valor humano de una clave del payload (aquí = valor de estado: sin conversión). */
type SnapshotValue = string | number;

/**
 * Tabla explícita clave-de-payload → lectura del ESTADO, con los mismos
 * fallbacks que panel/motor para los opcionales (?? 'rectangular'/350/6/16).
 * Única fuente de verdad de `valores` y de la comparación de `sin_confirmar`:
 * ambos se construyen recorriendo KEY_ORDER con estas lecturas, así que las
 * claves y el orden coinciden siempre (determinista para los tests).
 */
const SNAPSHOT_READ: Record<PayloadKey, (c: RCColumnInputs) => SnapshotValue> = {
  sectionType: (c) => c.sectionType ?? 'rectangular',
  b_mm: (c) => c.b,
  h_mm: (c) => c.h,
  D_mm: (c) => c.D ?? 350,
  cover_mm: (c) => c.cover,
  L_m: (c) => c.L,
  beta: (c) => c.beta,
  fck_MPa: (c) => c.fck,
  fyk_MPa: (c) => c.fyk,
  cornerBarDiam_mm: (c) => c.cornerBarDiam,
  nBarsX: (c) => c.nBarsX,
  barDiamX_mm: (c) => c.barDiamX,
  nBarsY: (c) => c.nBarsY,
  barDiamY_mm: (c) => c.barDiamY,
  nBarsCirc: (c) => c.nBarsCirc ?? 6,
  circBarDiam_mm: (c) => c.circBarDiam ?? 16,
  stirrupDiam_mm: (c) => c.stirrupDiam,
  stirrupSpacing_mm: (c) => c.stirrupSpacing,
  Nd_kN: (c) => c.Nd,
  MEdy_kNm: (c) => c.MEdy,
  MEdz_kNm: (c) => c.MEdz,
};

/**
 * Estado → JSON `{"valores":{…},"sin_confirmar":[…]}`.
 * `valores`: las MISMAS claves del payload, en unidades humanas (el estado de
 * rc-columns ya lo está: L en m, sección en mm, esfuerzos en kN/kNm).
 * `sin_confirmar`: claves cuyo valor de estado sigue siendo el de
 * `rcColumnDefaults` → nadie las ha tocado (un opcional ausente cae en su
 * fallback, que es el default: cuenta como sin confirmar). Se compara sobre el
 * valor de estado, no sobre el texto, y el orden es el de `valores`.
 */
function snapshotRcColumns(c: RCColumnInputs): string {
  const valores: Record<string, SnapshotValue> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const read = SNAPSHOT_READ[key];
    const value = read(c);
    valores[key] = value;
    if (value === read(rcColumnDefaults)) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

/**
 * Resumen de resultados para el prompt del chat (Fase 2 — T2.3).
 * Delegación pura en el serializador genérico; si el cálculo es válido añade
 * el armado resultante (`rebarSchedule`, string SIEMPRE presente en
 * RCColumnResult: no-vacío en ambos forks válidos — rectangular y circular —
 * y '' en los resultados de invalid(), donde ya delegamos antes por error).
 */
export function summarizeRCColumnResults(r: RCColumnResult): AiResultsSummary {
  if (r.error != null || r.rebarSchedule === '') return summarizeCalcResults(r);
  return summarizeCalcResults(r, [`Armado resultante: ${r.rebarSchedule}`]);
}

export const rcColumnsAdapter: AiModuleAdapter<RCColumnInputs> = {
  id: 'rc-columns',
  label: 'Pilares de hormigón',
  payloadSchema: RC_COLUMNS_PAYLOAD_SCHEMA,
  promptRules: RC_COLUMNS_PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: snapshotRcColumns,
  buildPlan: buildRcColumnsPlan,
};
