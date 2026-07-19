/**
 * Adapter del asistente IA para el módulo Vigas de hormigón (ola 2, CE Anejo 19).
 *
 * Particularidades del módulo:
 * - DOS SECCIONES (vano M+ / apoyo M−) en un estado plano con prefijo. El motor
 *   devuelve `{valid, error?, vano, apoyo}` — NO cumple `CalcResultLike`, así que
 *   el summarize construye un resultado sintético (ver `summarizeRcBeamResults`).
 * - `mode` es el gate mayor: en 'simple' el panel SOLO renderiza la sección de
 *   vano (RCBeamSimpleView), así que los `apoyo_*` se saltan con motivo — la IA no
 *   escribe lo que el usuario no puede ver ni corregir. Si el enunciado trae vano
 *   Y apoyo, el modelo debe proponer `mode='portico'` en el mismo turno.
 * - Y a la inversa: volver a 'simple' desde 'portico' OCULTA un apoyo que quizá
 *   incumple (el motor lo sigue calculando). Es una rebaja del veredicto sin tocar
 *   la obra ⇒ regla de seguridad, no solo un warning.
 * - `L` es interno en mm y se edita en m (única conversión del módulo). `L = 0`
 *   desactiva la comprobación de esbeltez.
 * - Signos: el motor hace `Math.abs()` sobre Md/VEd, y `Ms = |M_G + ψ₂·M_Q|` —
 *   ahí unos signos mezclados se CANCELARÍAN, así que buildPlan normaliza los
 *   cuatro esfuerzos a magnitud positiva y avisa si llega un negativo.
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary, type CalcResultLike } from '../resultsSummary';
import {
  detectResolvedRisks,
  detectSafetyRisks,
  higherIsSafer,
  ordinalLevel,
  type SafetyRule,
  type ResolvedSafetyRule,
} from '../safety';
import type { CheckRow } from '../../calculations/types';
import { psi2Quasi, type RCBeamResult, type RCBeamSectionResult } from '../../calculations/rcBeams';
import { availableFck } from '../../../data/materials';
import { availableBarDiams } from '../../../data/rebar';
import { rcBeamDefaults, type RCBeamInputs } from '../../../data/defaults';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
const MODES: readonly string[] = ['simple', 'portico'];
const FYK: readonly number[] = [400, 500, 600];
const EXPOSURE: readonly string[] = ['XC1', 'XC2', 'XC3', 'XC4'];
const LOAD_TYPES: readonly string[] = ['residential', 'office', 'parking', 'roof', 'custom'];
const STRUCT_SYSTEMS: readonly string[] = ['ss', 'end', 'interior', 'cantilever'];
/** Cercos: el panel ofrece los diámetros del catálogo hasta Ø16. */
const STIRRUP_DIAMS: readonly number[] = availableBarDiams.filter((d) => d <= 16);
const STIRRUP_LEGS: readonly number[] = [2, 3, 4, 5, 6];

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

const SECTION_DESC = {
  Md: 'Momento flector de CÁLCULO (ELU, ya mayorado) en kNm',
  VEd: 'Esfuerzo cortante de CÁLCULO (ELU, ya mayorado) en kN',
  M_G: 'Momento de SERVICIO (sin mayorar) por cargas permanentes, en kNm — se usa solo en la fisuración',
  M_Q: 'Momento de SERVICIO (sin mayorar) por sobrecargas, en kNm — se usa solo en la fisuración',
} as const;

export const RC_BEAMS_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'mode', 'b_mm', 'h_mm', 'cover_mm', 'fck_MPa', 'fyk_MPa', 'exposureClass',
    'loadType', 'psi2Custom', 'L_m', 'structSystem',
    'vano_Md_kNm', 'vano_VEd_kN', 'vano_M_G_kNm', 'vano_M_Q_kNm',
    'vano_bot_nBars', 'vano_bot_barDiam_mm', 'vano_top_nBars', 'vano_top_barDiam_mm',
    'vano_stirrupDiam_mm', 'vano_stirrupSpacing_mm', 'vano_stirrupLegs',
    'apoyo_Md_kNm', 'apoyo_VEd_kN', 'apoyo_M_G_kNm', 'apoyo_M_Q_kNm',
    'apoyo_top_nBars', 'apoyo_top_barDiam_mm', 'apoyo_bot_nBars', 'apoyo_bot_barDiam_mm',
    'apoyo_stirrupDiam_mm', 'apoyo_stirrupSpacing_mm', 'apoyo_stirrupLegs',
    'warnings',
  ],
  properties: {
    mode: { type: ['string', 'null'], enum: [...MODES, null], description: 'Modo del módulo: "simple" comprueba UNA sección (la de vano, momento positivo) y es lo que ve el usuario; "portico" comprueba vano Y apoyo lado a lado. Si el enunciado da momentos de vano y de apoyo, propón "portico" — con "simple" los datos de apoyo no son visibles ni editables.' },
    b_mm: { type: ['number', 'null'], description: 'Ancho de la sección de hormigón, en mm.' },
    h_mm: { type: ['number', 'null'], description: 'Canto TOTAL de la sección, en mm (no el canto útil).' },
    cover_mm: { type: ['number', 'null'], description: 'Recubrimiento GEOMÉTRICO (hasta la cara del cerco), en mm. El canto útil lo calcula la app: d = h − recubrimiento − Ø_cerco − Ø_barra/2.' },
    fck_MPa: { type: ['integer', 'null'], enum: [...availableFck, null], description: 'Resistencia característica del hormigón en MPa (HA-25 → 25).' },
    fyk_MPa: { type: ['integer', 'null'], enum: [...FYK, null], description: 'Límite elástico del acero de armar en MPa (B500S → 500).' },
    exposureClass: { type: ['string', 'null'], enum: [...EXPOSURE, null], description: 'Clase de exposición ambiental (XC1–XC4). Fija el límite de abertura de fisura wk: XC1 → 0.40 mm; XC2, XC3 y XC4 → 0.30 mm.' },
    loadType: { type: ['string', 'null'], enum: [...LOAD_TYPES, null], description: 'Categoría de uso de la sobrecarga, que fija ψ₂ para la combinación cuasipermanente de fisuración: "residential" (0.3), "office" (0.3), "parking" (0.6), "roof" (0.0) o "custom" (ψ₂ a medida en psi2Custom).' },
    psi2Custom: { type: ['number', 'null'], description: 'Valor de ψ₂ a medida (0–1). SOLO se aplica con loadType = "custom".' },
    L_m: { type: ['number', 'null'], description: 'Luz de la viga en METROS, para la comprobación de esbeltez L/d (que exime de calcular la flecha). 0 = no comprobar la esbeltez.' },
    structSystem: { type: ['string', 'null'], enum: [...STRUCT_SYSTEMS, null], description: 'Sistema estructural, para el límite de esbeltez L/d (coeficiente K de la Tabla 7.4N): "ss" biapoyada (K=1.0), "end" vano extremo de viga continua (1.3), "interior" vano interior (1.5), "cantilever" ménsula (0.4).' },

    vano_Md_kNm: { type: ['number', 'null'], description: `VANO (momento positivo, tracción ABAJO). ${SECTION_DESC.Md}.` },
    vano_VEd_kN: { type: ['number', 'null'], description: `VANO. ${SECTION_DESC.VEd}.` },
    vano_M_G_kNm: { type: ['number', 'null'], description: `VANO. ${SECTION_DESC.M_G}.` },
    vano_M_Q_kNm: { type: ['number', 'null'], description: `VANO. ${SECTION_DESC.M_Q}.` },
    vano_bot_nBars: { type: ['integer', 'null'], description: 'VANO: número de barras INFERIORES, que son las de TRACCIÓN con momento positivo.' },
    vano_bot_barDiam_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'VANO: diámetro de las barras inferiores (tracción), en mm.' },
    vano_top_nBars: { type: ['integer', 'null'], description: 'VANO: número de barras SUPERIORES, que con momento positivo son las de COMPRESIÓN (armadura de montaje).' },
    vano_top_barDiam_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'VANO: diámetro de las barras superiores (compresión), en mm.' },
    vano_stirrupDiam_mm: { type: ['integer', 'null'], enum: [...STIRRUP_DIAMS, null], description: 'VANO: diámetro del cerco, en mm.' },
    vano_stirrupSpacing_mm: { type: ['number', 'null'], description: 'VANO: separación longitudinal entre cercos, en mm.' },
    vano_stirrupLegs: { type: ['integer', 'null'], enum: [...STIRRUP_LEGS, null], description: 'VANO: número de ramas del cerco cortadas por el plano de cortante (2 = cerco simple).' },

    apoyo_Md_kNm: { type: ['number', 'null'], description: `APOYO (momento negativo, tracción ARRIBA). ${SECTION_DESC.Md} — da la MAGNITUD, sin el signo menos. Solo se aplica en modo "portico".` },
    apoyo_VEd_kN: { type: ['number', 'null'], description: `APOYO. ${SECTION_DESC.VEd}. Solo en modo "portico".` },
    apoyo_M_G_kNm: { type: ['number', 'null'], description: `APOYO. ${SECTION_DESC.M_G}. Solo en modo "portico".` },
    apoyo_M_Q_kNm: { type: ['number', 'null'], description: `APOYO. ${SECTION_DESC.M_Q}. Solo en modo "portico".` },
    apoyo_top_nBars: { type: ['integer', 'null'], description: 'APOYO: número de barras SUPERIORES, que son las de TRACCIÓN con momento negativo. Solo en modo "portico".' },
    apoyo_top_barDiam_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'APOYO: diámetro de las barras superiores (tracción), en mm. Solo en modo "portico".' },
    apoyo_bot_nBars: { type: ['integer', 'null'], description: 'APOYO: número de barras INFERIORES, que con momento negativo son las de COMPRESIÓN. Solo en modo "portico".' },
    apoyo_bot_barDiam_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'APOYO: diámetro de las barras inferiores (compresión), en mm. Solo en modo "portico".' },
    apoyo_stirrupDiam_mm: { type: ['integer', 'null'], enum: [...STIRRUP_DIAMS, null], description: 'APOYO: diámetro del cerco, en mm. Solo en modo "portico".' },
    apoyo_stirrupSpacing_mm: { type: ['number', 'null'], description: 'APOYO: separación longitudinal entre cercos, en mm. Solo en modo "portico".' },
    apoyo_stirrupLegs: { type: ['integer', 'null'], enum: [...STIRRUP_LEGS, null], description: 'APOYO: número de ramas del cerco. Solo en modo "portico".' },

    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Vigas de hormigón:
1. DOS SECCIONES. El módulo comprueba la sección de VANO (momento positivo, tracción abajo) y la de APOYO (momento negativo, tracción arriba). En modo "simple" solo existe la de vano: es lo único que la app muestra y lo único que el usuario puede editar. Si el enunciado da momentos de vano Y de apoyo (una viga continua, un pórtico), propón mode="portico" EN EL MISMO TURNO que los campos apoyo_*; si no, se saltarán.
2. NOMBRES DEL ARMADO: son por CARA, no por papel. En vano la tracción es vano_bot_* (abajo) y la compresión vano_top_*; en apoyo se invierte: la tracción es apoyo_top_* (arriba) y la compresión apoyo_bot_*.
3. ESFUERZOS: Md y VEd son de CÁLCULO (ELU, ya mayorados). M_G y M_Q son momentos de SERVICIO (SIN mayorar) y solo intervienen en la fisuración: la app combina Ms = M_G + ψ₂·M_Q. Los cuatro se dan como MAGNITUD POSITIVA en cada sección (del apoyo, el valor absoluto del momento negativo). Si el enunciado da cargas y no esfuerzos, calcula tú los esfuerzos, dilo en "reply" y añade un warning.
4. Longitudes en MILÍMETROS (b, h, recubrimiento, diámetros, separación de cercos) salvo L_m, que va en METROS. El recubrimiento es GEOMÉTRICO (hasta la cara del cerco); el canto útil lo deriva la app.
5. L_m solo se usa para la comprobación de esbeltez L/d, que exime de calcular la flecha; con L_m = 0 esa comprobación no se hace. La app NO calcula la flecha: si la esbeltez se excede, dilo.
6. En este módulo son DATOS del problema, no variables de diseño: los esfuerzos (Md, VEd, M_G, M_Q de cada sección), la luz (L_m), el sistema estructural (structSystem), la categoría de uso (loadType/psi2Custom), la clase de exposición (exposureClass — fija el límite de fisura) y el recubrimiento (durabilidad). Para que una viga cumpla actúa SIEMPRE sobre la RESISTENCIA: más canto (h), más ancho (b), más armadura de tracción (Ø mayor o más barras), cercos más juntos o de más diámetro, o mejor hormigón. NUNCA rebajes un esfuerzo, ni acortes la luz, ni bajes la clase de exposición, ni vuelvas al modo "simple" para que deje de verse un apoyo que incumple.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Viga biapoyada de 6 m, 30×50 cm, HA-25 y B500S, ambiente XC2. '
  + 'En el vano: Md = 120 kNm y VEd = 90 kN. Armada con 4Ø20 abajo y cercos Ø8 a 15 cm.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface RcBeamsPayload {
  mode: string | null;
  b_mm: number | null;
  h_mm: number | null;
  cover_mm: number | null;
  fck_MPa: number | null;
  fyk_MPa: number | null;
  exposureClass: string | null;
  loadType: string | null;
  psi2Custom: number | null;
  L_m: number | null;
  structSystem: string | null;
  vano_Md_kNm: number | null;
  vano_VEd_kN: number | null;
  vano_M_G_kNm: number | null;
  vano_M_Q_kNm: number | null;
  vano_bot_nBars: number | null;
  vano_bot_barDiam_mm: number | null;
  vano_top_nBars: number | null;
  vano_top_barDiam_mm: number | null;
  vano_stirrupDiam_mm: number | null;
  vano_stirrupSpacing_mm: number | null;
  vano_stirrupLegs: number | null;
  apoyo_Md_kNm: number | null;
  apoyo_VEd_kN: number | null;
  apoyo_M_G_kNm: number | null;
  apoyo_M_Q_kNm: number | null;
  apoyo_top_nBars: number | null;
  apoyo_top_barDiam_mm: number | null;
  apoyo_bot_nBars: number | null;
  apoyo_bot_barDiam_mm: number | null;
  apoyo_stirrupDiam_mm: number | null;
  apoyo_stirrupSpacing_mm: number | null;
  apoyo_stirrupLegs: number | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parsePayload(raw: unknown): RcBeamsPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    mode: stringOrNull(r.mode),
    b_mm: finiteNumber(r.b_mm),
    h_mm: finiteNumber(r.h_mm),
    cover_mm: finiteNumber(r.cover_mm),
    fck_MPa: finiteNumber(r.fck_MPa),
    fyk_MPa: finiteNumber(r.fyk_MPa),
    exposureClass: stringOrNull(r.exposureClass),
    loadType: stringOrNull(r.loadType),
    psi2Custom: finiteNumber(r.psi2Custom),
    L_m: finiteNumber(r.L_m),
    structSystem: stringOrNull(r.structSystem),
    vano_Md_kNm: finiteNumber(r.vano_Md_kNm),
    vano_VEd_kN: finiteNumber(r.vano_VEd_kN),
    vano_M_G_kNm: finiteNumber(r.vano_M_G_kNm),
    vano_M_Q_kNm: finiteNumber(r.vano_M_Q_kNm),
    vano_bot_nBars: finiteNumber(r.vano_bot_nBars),
    vano_bot_barDiam_mm: finiteNumber(r.vano_bot_barDiam_mm),
    vano_top_nBars: finiteNumber(r.vano_top_nBars),
    vano_top_barDiam_mm: finiteNumber(r.vano_top_barDiam_mm),
    vano_stirrupDiam_mm: finiteNumber(r.vano_stirrupDiam_mm),
    vano_stirrupSpacing_mm: finiteNumber(r.vano_stirrupSpacing_mm),
    vano_stirrupLegs: finiteNumber(r.vano_stirrupLegs),
    apoyo_Md_kNm: finiteNumber(r.apoyo_Md_kNm),
    apoyo_VEd_kN: finiteNumber(r.apoyo_VEd_kN),
    apoyo_M_G_kNm: finiteNumber(r.apoyo_M_G_kNm),
    apoyo_M_Q_kNm: finiteNumber(r.apoyo_M_Q_kNm),
    apoyo_top_nBars: finiteNumber(r.apoyo_top_nBars),
    apoyo_top_barDiam_mm: finiteNumber(r.apoyo_top_barDiam_mm),
    apoyo_bot_nBars: finiteNumber(r.apoyo_bot_nBars),
    apoyo_bot_barDiam_mm: finiteNumber(r.apoyo_bot_barDiam_mm),
    apoyo_stirrupDiam_mm: finiteNumber(r.apoyo_stirrupDiam_mm),
    apoyo_stirrupSpacing_mm: finiteNumber(r.apoyo_stirrupSpacing_mm),
    apoyo_stirrupLegs: finiteNumber(r.apoyo_stirrupLegs),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  mode: 'Modo',
  b_mm: 'Ancho b',
  h_mm: 'Canto h',
  cover_mm: 'Recubrimiento',
  fck_MPa: 'Hormigón fck',
  fyk_MPa: 'Acero fyk',
  exposureClass: 'Clase de exposición',
  loadType: 'Categoría de uso',
  psi2Custom: 'ψ₂ personalizado',
  L_m: 'Luz L',
  structSystem: 'Sistema estructural',
  vano_Md_kNm: 'Vano — Md',
  vano_VEd_kN: 'Vano — VEd',
  vano_M_G_kNm: 'Vano — M_G (servicio)',
  vano_M_Q_kNm: 'Vano — M_Q (servicio)',
  vano_bot_nBars: 'Vano — nº barras inferiores',
  vano_bot_barDiam_mm: 'Vano — Ø barras inferiores',
  vano_top_nBars: 'Vano — nº barras superiores',
  vano_top_barDiam_mm: 'Vano — Ø barras superiores',
  vano_stirrupDiam_mm: 'Vano — Ø cerco',
  vano_stirrupSpacing_mm: 'Vano — separación de cercos',
  vano_stirrupLegs: 'Vano — ramas del cerco',
  apoyo_Md_kNm: 'Apoyo — Md',
  apoyo_VEd_kN: 'Apoyo — VEd',
  apoyo_M_G_kNm: 'Apoyo — M_G (servicio)',
  apoyo_M_Q_kNm: 'Apoyo — M_Q (servicio)',
  apoyo_top_nBars: 'Apoyo — nº barras superiores',
  apoyo_top_barDiam_mm: 'Apoyo — Ø barras superiores',
  apoyo_bot_nBars: 'Apoyo — nº barras inferiores',
  apoyo_bot_barDiam_mm: 'Apoyo — Ø barras inferiores',
  apoyo_stirrupDiam_mm: 'Apoyo — Ø cerco',
  apoyo_stirrupSpacing_mm: 'Apoyo — separación de cercos',
  apoyo_stirrupLegs: 'Apoyo — ramas del cerco',
} as const;

type PayloadKey = keyof typeof LABELS;

/** ORDER del contrato: `mode` PRIMERO (decide si la sección de apoyo existe). */
const KEY_ORDER: readonly PayloadKey[] = [
  'mode', 'b_mm', 'h_mm', 'cover_mm', 'fck_MPa', 'fyk_MPa', 'exposureClass',
  'loadType', 'psi2Custom', 'L_m', 'structSystem',
  'vano_Md_kNm', 'vano_VEd_kN', 'vano_M_G_kNm', 'vano_M_Q_kNm',
  'vano_bot_nBars', 'vano_bot_barDiam_mm', 'vano_top_nBars', 'vano_top_barDiam_mm',
  'vano_stirrupDiam_mm', 'vano_stirrupSpacing_mm', 'vano_stirrupLegs',
  'apoyo_Md_kNm', 'apoyo_VEd_kN', 'apoyo_M_G_kNm', 'apoyo_M_Q_kNm',
  'apoyo_top_nBars', 'apoyo_top_barDiam_mm', 'apoyo_bot_nBars', 'apoyo_bot_barDiam_mm',
  'apoyo_stirrupDiam_mm', 'apoyo_stirrupSpacing_mm', 'apoyo_stirrupLegs',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

export const APOYO_SIMPLE_REASON =
  'En modo "sección simple" la app solo muestra la sección de vano: los datos de apoyo no serían '
  + 'visibles ni editables. Propón el modo "pórtico" en el mismo mensaje para poder aplicarlos.';

const MODE_ES: Record<string, string> = { simple: 'Sección simple', portico: 'Pórtico' };
const STRUCT_ES: Record<string, string> = {
  ss: 'Biapoyada (K=1.0)',
  end: 'Vano extremo (K=1.3)',
  interior: 'Vano interior (K=1.5)',
  cantilever: 'Ménsula (K=0.4)',
};
// Etiquetas ALINEADAS con el selector del panel (RCBeamsInputs) para que la
// tabla de cambios y la UI hablen igual: allí 'parking' se llama "Garaje".
const LOAD_TYPE_ES: Record<string, string> = {
  residential: 'Residencial (ψ₂=0.3)',
  office: 'Oficinas (ψ₂=0.3)',
  parking: 'Garaje (ψ₂=0.6)',
  roof: 'Cubierta (ψ₂=0.0)',
  custom: 'Personalizado',
};

/**
 * Campos que NO son variables de diseño. La sección (b, h), el armado y el
 * hormigón SÍ lo son: subirlos es la salida legítima.
 *
 * Ordinales calibrados con el factor real del motor:
 * - `exposureClass` → wkMax (factors.ts): XC1 admite 0.40 mm de fisura y XC2–XC4
 *   solo 0.30. El motor NO distingue entre XC2, XC3 y XC4 (mismo límite), así que
 *   el único cambio que relaja algo es BAJAR A XC1 — y eso es lo que marca el mapa.
 * - `structSystem` → −K de la Tabla 7.4N: el límite de esbeltez es proporcional a
 *   K, así que a MAYOR K más permisiva es la comprobación (nivel = −K).
 * - `loadType` → ψ₂ de la Tabla 12.1: rebajarlo baja el momento cuasipermanente y
 *   con él la fisura calculada.
 * - `mode` → volver a "simple" oculta la sección de apoyo (el motor la sigue
 *   calculando, pero la app no la pinta): un apoyo que incumple deja de verse.
 */
export const RC_BEAMS_SAFETY_RULES: ReadonlyArray<SafetyRule<RCBeamInputs>> = [
  { field: 'vano_Md', confirmKey: 'vano_Md_kNm', level: higherIsSafer, why: 'El momento de cálculo del vano lo fija el análisis de la estructura: rebajarlo hace "cumplir" la sección sin tocar la viga.' },
  { field: 'vano_VEd', confirmKey: 'vano_VEd_kN', level: higherIsSafer, why: 'El cortante de cálculo del vano lo fija el análisis: rebajarlo hace "cumplir" los cercos sin tocarlos.' },
  { field: 'vano_M_G', confirmKey: 'vano_M_G_kNm', level: higherIsSafer, why: 'El momento de servicio por cargas permanentes sale de la composición real del forjado: rebajarlo reduce la fisura calculada.' },
  { field: 'vano_M_Q', confirmKey: 'vano_M_Q_kNm', level: higherIsSafer, why: 'El momento de servicio por sobrecarga lo fija la categoría de uso: rebajarlo reduce la fisura calculada.' },
  { field: 'apoyo_Md', confirmKey: 'apoyo_Md_kNm', level: higherIsSafer, why: 'El momento de cálculo del apoyo lo fija el análisis de la estructura: rebajarlo hace "cumplir" la sección sin tocar la viga.' },
  { field: 'apoyo_VEd', confirmKey: 'apoyo_VEd_kN', level: higherIsSafer, why: 'El cortante de cálculo del apoyo lo fija el análisis: rebajarlo hace "cumplir" los cercos sin tocarlos.' },
  { field: 'apoyo_M_G', confirmKey: 'apoyo_M_G_kNm', level: higherIsSafer, why: 'El momento de servicio por cargas permanentes sale de la composición real del forjado: rebajarlo reduce la fisura calculada.' },
  { field: 'apoyo_M_Q', confirmKey: 'apoyo_M_Q_kNm', level: higherIsSafer, why: 'El momento de servicio por sobrecarga lo fija la categoría de uso: rebajarlo reduce la fisura calculada.' },
  { field: 'L', confirmKey: 'L_m', level: higherIsSafer, why: 'La luz la fija la geometría del edificio: acortarla relaja el límite de esbeltez L/d que exime de comprobar la flecha.' },
  { field: 'cover', confirmKey: 'cover_mm', level: higherIsSafer, why: 'El recubrimiento es un criterio de durabilidad que fija la clase de exposición: rebajarlo aumenta el canto útil y regala capacidad a flexión.' },
  {
    field: 'exposureClass', // payload `exposureClass`: mismo nombre ⇒ sin confirmKey
    level: ordinalLevel({ XC1: 0, XC2: 1, XC3: 1, XC4: 1 }),
    why: 'La clase de exposición la fija el ambiente real de la obra, y con ella el límite de fisura: XC1 admite wk = 0.40 mm frente a los 0.30 mm de XC2–XC4. Bajar a XC1 relaja la comprobación de fisuración sin que el ambiente haya cambiado.',
  },
  {
    field: 'structSystem', // payload `structSystem`: mismo nombre ⇒ sin confirmKey
    level: ordinalLevel({ cantilever: -0.4, ss: -1.0, end: -1.3, interior: -1.5 }),
    why: 'El sistema estructural lo fija el proyecto y con él el coeficiente K del límite de esbeltez (ménsula 0.4 · biapoyada 1.0 · vano extremo 1.3 · vano interior 1.5): declarar un K mayor relaja el límite L/d sin cambiar la viga.',
  },
  {
    field: 'mode', // payload `mode`: mismo nombre ⇒ sin confirmKey
    level: ordinalLevel({ portico: 1, simple: 0 }),
    why: 'Volver al modo "sección simple" OCULTA la sección de apoyo: el motor la sigue calculando, pero la app deja de mostrarla. Un apoyo que incumple desaparece de la vista sin que la viga haya cambiado.',
  },
];

/**
 * FUGA 2 (auditoría 2026-07-14) — ψ₂ EFECTIVO, no `loadType` ni `psi2Custom`.
 *
 * Antes había dos reglas por campo: un ordinal sobre `loadType` con el ψ₂ de cada
 * categoría, y `higherIsSafer` sobre `psi2Custom`. Entre las dos quedaba abierta
 * la puerta que el motor sí ve:
 *   - `ordinalLevel` no tenía entrada para `'custom'` (no puede tenerla: su nivel
 *     LO DECIDE `psi2Custom`), así que pasar a 'custom' no era riesgo;
 *   - la regla de `psi2Custom` no lo tapaba: su valor vigente es el default (0.3)
 *     y el gate anti-ruido la desarmaba.
 * Resultado: `{loadType:'custom', psi2Custom:0}` convertía Ms = |M_G + ψ₂·M_Q| en
 * |M_G| — la fisuración se desvanecía — con `plan.risks` VACÍO.
 *
 * La regla correcta mira `psi2Quasi`, que es exactamente lo que resuelve el motor.
 */
export const RC_BEAMS_RESOLVED_RULES: ReadonlyArray<ResolvedSafetyRule<RCBeamInputs>> = [
  {
    id: 'psi2_efectivo',
    label: 'Coef. cuasipermanente ψ₂ efectivo',
    resolve: (s) => psi2Quasi(s),
    level: higherIsSafer,
    format: (v) => v.toFixed(2),
    why: 'ψ₂ lo fija la categoría de uso (Tabla 12.1), no el cálculo: rebajarlo —cambiando la categoría o escribiéndolo a mano en "custom"— baja el momento cuasipermanente Ms = |M_G + ψ₂·M_Q| y con él la fisura calculada. Con ψ₂ = 0 la comprobación de fisuración se queda solo con el peso propio.',
    fields: ['loadType', 'psi2Custom'],
    confirmKeys: ['loadType', 'psi2Custom'],
  },
];

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtMm = (mm: number) => `${mm} mm`;

type SectionKind = 'vano' | 'apoyo';

function buildRcBeamsPlan(
  x: RcBeamsPayload,
  current: RCBeamInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<RCBeamInputs> {
  const fields: Partial<RCBeamInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof RCBeamInputs>(
    key: PayloadKey,
    field: K,
    value: RCBeamInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  // --- mode PRIMERO: decide si la sección de apoyo existe para el usuario ---
  if (x.mode !== null) {
    if (!MODES.includes(x.mode)) {
      skip('mode', `Modo "${x.mode}" desconocido (simple, portico)`);
    } else if (x.mode === current.mode) {
      skip('mode', ALREADY);
    } else {
      // `mode` puede llegar undefined desde un localStorage antiguo (la UI se
      // defiende igual); el fallback evita pintar "undefined" en la tabla.
      apply(
        'mode', 'mode', x.mode as RCBeamInputs['mode'],
        MODE_ES[current.mode] ?? MODE_ES.simple, MODE_ES[x.mode],
      );
    }
  }
  const modeFinal = (fields.mode ?? current.mode) as RCBeamInputs['mode'];
  const apoyoVisible = modeFinal === 'portico';

  /** Longitud en mm con rango; ALREADY exacto. */
  function applyMm<K extends keyof RCBeamInputs>(
    key: PayloadKey,
    field: K,
    value: number | null,
    min: number,
    max: number,
  ): void {
    if (value === null) return;
    if (value < min || value > max) {
      skip(key, rangeReason(value, min, max, 'mm'));
      return;
    }
    const v = round2(value);
    const before = current[field] as number;
    if (Math.abs(v - before) <= EPS) skip(key, ALREADY);
    else apply(key, field, v as RCBeamInputs[K], fmtMm(before), fmtMm(v));
  }

  // --- Sección, materiales y durabilidad ---
  applyMm('b_mm', 'b', x.b_mm, 50, 3000);
  applyMm('h_mm', 'h', x.h_mm, 50, 3000);
  applyMm('cover_mm', 'cover', x.cover_mm, 10, 100);

  if (x.fck_MPa !== null) {
    if (!availableFck.includes(x.fck_MPa)) {
      skip('fck_MPa', `HA-${x.fck_MPa} no está en el catálogo (${availableFck.join(', ')} MPa)`);
    } else if (x.fck_MPa === current.fck) {
      skip('fck_MPa', ALREADY);
    } else {
      apply('fck_MPa', 'fck', x.fck_MPa, `HA-${current.fck}`, `HA-${x.fck_MPa}`);
    }
  }
  if (x.fyk_MPa !== null) {
    if (!FYK.includes(x.fyk_MPa)) {
      skip('fyk_MPa', `fyk ${x.fyk_MPa} no está en el catálogo (${FYK.join(', ')} MPa)`);
    } else if (x.fyk_MPa === current.fyk) {
      skip('fyk_MPa', ALREADY);
    } else {
      apply('fyk_MPa', 'fyk', x.fyk_MPa, `${current.fyk} MPa`, `${x.fyk_MPa} MPa`);
    }
  }
  if (x.exposureClass !== null) {
    if (!EXPOSURE.includes(x.exposureClass)) {
      skip('exposureClass', `Clase "${x.exposureClass}" no disponible (${EXPOSURE.join(', ')})`);
    } else if (x.exposureClass === current.exposureClass) {
      skip('exposureClass', ALREADY);
    } else {
      apply('exposureClass', 'exposureClass', x.exposureClass, current.exposureClass, x.exposureClass);
    }
  }

  // --- Categoría de uso: loadType ANTES que psi2Custom (lo gatea) ---
  if (x.loadType !== null) {
    if (!LOAD_TYPES.includes(x.loadType)) {
      skip('loadType', `Categoría "${x.loadType}" desconocida (${LOAD_TYPES.join(', ')})`);
    } else if (x.loadType === current.loadType) {
      skip('loadType', ALREADY);
    } else {
      apply('loadType', 'loadType', x.loadType, LOAD_TYPE_ES[current.loadType] ?? current.loadType, LOAD_TYPE_ES[x.loadType]);
    }
  }
  const loadTypeFinal = (fields.loadType ?? current.loadType) as string;

  if (x.psi2Custom !== null) {
    if (loadTypeFinal !== 'custom') {
      skip('psi2Custom', 'ψ₂ personalizado solo se aplica con la categoría de uso "custom".');
    } else if (x.psi2Custom < 0 || x.psi2Custom > 1) {
      skip('psi2Custom', rangeReason(x.psi2Custom, 0, 1, ''));
    } else {
      const v = round2(x.psi2Custom);
      if (Math.abs(v - current.psi2Custom) <= EPS) skip('psi2Custom', ALREADY);
      else apply('psi2Custom', 'psi2Custom', v, String(current.psi2Custom), String(v));
    }
  }

  // --- Luz: payload en m, estado en mm ---
  if (x.L_m !== null) {
    if (x.L_m < 0 || x.L_m > 50) {
      skip('L_m', rangeReason(x.L_m, 0, 50, 'm'));
    } else {
      const mm = Math.round(x.L_m * 1000);
      if (Math.abs(mm - current.L) <= EPS) skip('L_m', ALREADY);
      else apply('L_m', 'L', mm, `${current.L / 1000} m`, `${mm / 1000} m`);
    }
  }

  if (x.structSystem !== null) {
    if (!STRUCT_SYSTEMS.includes(x.structSystem)) {
      skip('structSystem', `Sistema "${x.structSystem}" desconocido (${STRUCT_SYSTEMS.join(', ')})`);
    } else if (x.structSystem === current.structSystem) {
      skip('structSystem', ALREADY);
    } else {
      apply(
        'structSystem', 'structSystem', x.structSystem as RCBeamInputs['structSystem'],
        STRUCT_ES[current.structSystem], STRUCT_ES[x.structSystem],
      );
    }
  }

  // --- Esfuerzos y armado, por sección ---
  //
  // El motor normaliza Md/VEd con Math.abs() y combina Ms = |M_G + ψ₂·M_Q|: unos
  // signos mezclados en M_G/M_Q se CANCELARÍAN y bajarían la fisura calculada.
  // Aquí se guardan siempre como magnitud, avisando de la conversión.
  function applyEffort(
    key: PayloadKey,
    field: keyof RCBeamInputs,
    value: number | null,
    quantity: 'force' | 'moment',
    max: number,
  ): void {
    if (value === null) return;
    if (Math.abs(value) > max) {
      skip(key, rangeReason(value, -max, max, quantity === 'force' ? 'kN' : 'kNm'));
      return;
    }
    if (value < 0) {
      warnings.push(
        `${LABELS[key]}: el valor se toma como magnitud (${Math.abs(value)}); el signo del momento lo `
        + 'fija la sección (vano = positivo, apoyo = negativo).',
      );
    }
    const v = round2(Math.abs(value));
    const before = current[field] as number;
    if (Math.abs(v - before) <= EPS) skip(key, ALREADY);
    else {
      apply(
        key, field, v as RCBeamInputs[typeof field],
        formatQuantity(before, quantity, system), formatQuantity(v, quantity, system),
      );
    }
  }

  function applyNBars(key: PayloadKey, field: keyof RCBeamInputs, value: number | null): void {
    if (value === null) return;
    if (!Number.isInteger(value) || value < 1 || value > 20) {
      skip(key, rangeReason(value, 1, 20, 'barras'));
      return;
    }
    const before = current[field] as number;
    if (value === before) skip(key, ALREADY);
    else apply(key, field, value as RCBeamInputs[typeof field], `${before} barras`, `${value} barras`);
  }

  function applyBarDiam(
    key: PayloadKey,
    field: keyof RCBeamInputs,
    value: number | null,
    catalog: readonly number[],
  ): void {
    if (value === null) return;
    if (!catalog.includes(value)) {
      skip(key, `Ø${value} no es un diámetro del catálogo (Ø${catalog.join(', Ø')})`);
      return;
    }
    const before = current[field] as number;
    if (value === before) skip(key, ALREADY);
    else apply(key, field, value as RCBeamInputs[typeof field], `Ø${before} mm`, `Ø${value} mm`);
  }

  function applyLegs(key: PayloadKey, field: keyof RCBeamInputs, value: number | null): void {
    if (value === null) return;
    if (!STIRRUP_LEGS.includes(value)) {
      skip(key, `${value} ramas no está entre las opciones (${STIRRUP_LEGS.join(', ')})`);
      return;
    }
    const before = current[field] as number;
    if (value === before) skip(key, ALREADY);
    else apply(key, field, value as RCBeamInputs[typeof field], `${before} ramas`, `${value} ramas`);
  }

  /** Los 11 campos de una sección. En `apoyo` con modo final simple: skip con motivo. */
  function applySection(kind: SectionKind): void {
    const gated = kind === 'apoyo' && !apoyoVisible;
    const keys = {
      Md: `${kind}_Md_kNm`, VEd: `${kind}_VEd_kN`,
      M_G: `${kind}_M_G_kNm`, M_Q: `${kind}_M_Q_kNm`,
      topN: `${kind}_top_nBars`, topD: `${kind}_top_barDiam_mm`,
      botN: `${kind}_bot_nBars`, botD: `${kind}_bot_barDiam_mm`,
      swD: `${kind}_stirrupDiam_mm`, swS: `${kind}_stirrupSpacing_mm`, swL: `${kind}_stirrupLegs`,
    } as unknown as Record<string, PayloadKey>;
    const vals = x as unknown as Record<string, number | null>;

    if (gated) {
      for (const key of Object.values(keys)) {
        if (vals[key] !== null) skip(key, APOYO_SIMPLE_REASON);
      }
      return;
    }
    applyEffort(keys.Md, `${kind}_Md` as keyof RCBeamInputs, vals[keys.Md], 'moment', 100000);
    applyEffort(keys.VEd, `${kind}_VEd` as keyof RCBeamInputs, vals[keys.VEd], 'force', 100000);
    applyEffort(keys.M_G, `${kind}_M_G` as keyof RCBeamInputs, vals[keys.M_G], 'moment', 100000);
    applyEffort(keys.M_Q, `${kind}_M_Q` as keyof RCBeamInputs, vals[keys.M_Q], 'moment', 100000);
    applyNBars(keys.topN, `${kind}_top_nBars` as keyof RCBeamInputs, vals[keys.topN]);
    applyBarDiam(keys.topD, `${kind}_top_barDiam` as keyof RCBeamInputs, vals[keys.topD], availableBarDiams);
    applyNBars(keys.botN, `${kind}_bot_nBars` as keyof RCBeamInputs, vals[keys.botN]);
    applyBarDiam(keys.botD, `${kind}_bot_barDiam` as keyof RCBeamInputs, vals[keys.botD], availableBarDiams);
    applyBarDiam(keys.swD, `${kind}_stirrupDiam` as keyof RCBeamInputs, vals[keys.swD], STIRRUP_DIAMS);
    applyMm(keys.swS, `${kind}_stirrupSpacing` as keyof RCBeamInputs, vals[keys.swS], 50, 600);
    applyLegs(keys.swL, `${kind}_stirrupLegs` as keyof RCBeamInputs, vals[keys.swL]);
  }

  applySection('vano');
  applySection('apoyo');

  // --- notFound ---
  const values = x as unknown as Record<PayloadKey, unknown>;
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = [
    ...detectSafetyRisks(
      RC_BEAMS_SAFETY_RULES, changes, fields, current, rcBeamDefaults, confirmed,
    ),
    // ψ₂ efectivo: sustituye a las reglas por campo de loadType/psi2Custom (fuga 2).
    ...detectResolvedRisks(RC_BEAMS_RESOLVED_RULES, fields, current, rcBeamDefaults, confirmed),
  ];
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

// Se excluyen también los campos OPCIONALES del estado (deflMethod/phiEf, flecha
// directa): no viajan al payload a propósito (límite de 16 uniones Anthropic +
// snapshot estable) y su `undefined` rompería el tipado de `valores`.
type StateKey = Exclude<keyof RCBeamInputs, 'title' | 'deflMethod' | 'phiEf'>;

const SNAPSHOT_FIELDS: Readonly<Record<PayloadKey, StateKey>> = {
  mode: 'mode',
  b_mm: 'b',
  h_mm: 'h',
  cover_mm: 'cover',
  fck_MPa: 'fck',
  fyk_MPa: 'fyk',
  exposureClass: 'exposureClass',
  loadType: 'loadType',
  psi2Custom: 'psi2Custom',
  L_m: 'L',
  structSystem: 'structSystem',
  vano_Md_kNm: 'vano_Md',
  vano_VEd_kN: 'vano_VEd',
  vano_M_G_kNm: 'vano_M_G',
  vano_M_Q_kNm: 'vano_M_Q',
  vano_bot_nBars: 'vano_bot_nBars',
  vano_bot_barDiam_mm: 'vano_bot_barDiam',
  vano_top_nBars: 'vano_top_nBars',
  vano_top_barDiam_mm: 'vano_top_barDiam',
  vano_stirrupDiam_mm: 'vano_stirrupDiam',
  vano_stirrupSpacing_mm: 'vano_stirrupSpacing',
  vano_stirrupLegs: 'vano_stirrupLegs',
  apoyo_Md_kNm: 'apoyo_Md',
  apoyo_VEd_kN: 'apoyo_VEd',
  apoyo_M_G_kNm: 'apoyo_M_G',
  apoyo_M_Q_kNm: 'apoyo_M_Q',
  apoyo_top_nBars: 'apoyo_top_nBars',
  apoyo_top_barDiam_mm: 'apoyo_top_barDiam',
  apoyo_bot_nBars: 'apoyo_bot_nBars',
  apoyo_bot_barDiam_mm: 'apoyo_bot_barDiam',
  apoyo_stirrupDiam_mm: 'apoyo_stirrupDiam',
  apoyo_stirrupSpacing_mm: 'apoyo_stirrupSpacing',
  apoyo_stirrupLegs: 'apoyo_stirrupLegs',
};

function buildSnapshot(c: RCBeamInputs): string {
  const valores: Record<string, number | string | boolean> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    // La luz se serializa en las unidades humanas del payload (m).
    valores[key] = key === 'L_m' ? (value as number) / 1000 : value;
    if (value === rcBeamDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/** Prefija la descripción de cada fila: los ids se repiten entre secciones. */
function prefixed(checks: CheckRow[], prefix: string): CheckRow[] {
  return checks.map((c) => ({ ...c, description: `${prefix}: ${c.description}` }));
}

function sectionExtras(s: RCBeamSectionResult, label: string): string {
  return `${label} — d = ${s.d.toFixed(0)} mm · MRd = ${s.MRd.toFixed(1)} kNm · `
    + `VRd = ${s.VRd.toFixed(1)} kN · wk = ${s.wk.toFixed(3)} mm (límite ${s.wkMax.toFixed(2)}) · `
    + `armado: ${s.rebarSchedule}`;
}

/**
 * Resume el resultado del motor de vigas de hormigón. `RCBeamResult` NO cumple
 * `CalcResultLike`: trae DOS secciones con sus propios `checks`. El resumen
 * refleja lo que el usuario VE:
 * - modo 'simple' → solo la sección de vano (es la única que pinta la app);
 * - modo 'portico' → vano + apoyo, con las filas prefijadas.
 *
 * OJO al doble nivel de invalidez: `calcRCBeam` devuelve `valid:true` aunque una
 * SECCIÓN tenga `error` (p. ej. canto insuficiente para el Ø de barra). Se
 * discrimina por `error != null`, primero el global y después el de las secciones
 * mostradas.
 */
export function summarizeRcBeamResults(
  r: RCBeamResult,
  mode: RCBeamInputs['mode'],
): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults({ valid: false, error: r.error, checks: [] });

  const isPortico = mode === 'portico';

  const sectionErrors: string[] = [];
  if (r.vano.error != null) sectionErrors.push(`Vano: ${r.vano.error}`);
  if (isPortico && r.apoyo.error != null) sectionErrors.push(`Apoyo: ${r.apoyo.error}`);
  if (sectionErrors.length > 0) {
    return summarizeCalcResults({ valid: false, error: sectionErrors.join(' · '), checks: [] });
  }

  const checks: CheckRow[] = isPortico
    ? [...prefixed(r.vano.checks, 'Vano'), ...prefixed(r.apoyo.checks, 'Apoyo')]
    : r.vano.checks;
  const synthetic: CalcResultLike = { valid: r.valid, checks };

  const extras: string[] = [sectionExtras(r.vano, 'Vano (M+)')];
  if (isPortico) extras.push(sectionExtras(r.apoyo, 'Apoyo (M−)'));
  else extras.push('Modo "sección simple": la app solo muestra la sección de vano.');

  return summarizeCalcResults(synthetic, extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const rcBeamsAdapter: AiModuleAdapter<RCBeamInputs> = {
  id: 'rc-beams',
  label: 'Vigas de hormigón',
  payloadSchema: RC_BEAMS_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildRcBeamsPlan(parsePayload(payload), current, system, confirmed),
};
