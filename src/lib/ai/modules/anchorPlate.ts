/**
 * Adapter del asistente IA para el módulo Placas de anclaje (ola 2, EN 1992-4 +
 * CE Anejo 22 §6.2.5).
 *
 * Particularidades del módulo:
 * - CAMPOS LEGACY SINCRONIZADOS. El estado guarda el cortante dos veces (`VEd`
 *   escalar histórico y el par direccional `Vx`/`Vy`) y los bordes del macizo otras
 *   dos (`pedestal_cX`/`cY` y el par por cara `cX1..cY2`). Los resolvers del motor
 *   leen uno u otro según la simetría, así que escribirlos sueltos deja el cálculo
 *   incoherente. El payload expone SOLO la forma canónica y `buildPlan` escribe el
 *   espejo legacy con `shearPatch` / `edgeAxisPatch` — los mismos helpers que usa
 *   la UI. Los campos legacy van a `fields` SIN fila en `changes`: son consecuencia,
 *   no decisión (mismo patrón que los β derivados de pilares de acero).
 * - EL MOTOR NO TIENE CAMPO `error`. `valid:false` ocurre en UN caso (sin ninguna
 *   solicitación) y encima llega con `overallStatus:'ok'`, que sería letal leer
 *   como verde. Y sus `warnings` de severidad 'fail' vuelcan el veredicto SIN ser
 *   checks. Ver `summarizeAnchorPlateResults`.
 * - Regla de seguridad contraintuitiva: aquí lo peligroso es SUBIR el axil. La
 *   compresión alivia la tracción de los anclajes, que es el fallo que gobierna.
 * - Fuera del payload: `concrete_cracked` (no tiene control en la UI: la IA no
 *   escribe lo que el usuario no puede ver, y desde su default `true` —el lado
 *   conservador— el único movimiento posible sería relajar el cálculo) y
 *   `bar_spacing_x`/`bar_spacing_y` (el motor los IGNORA: el layout sale de la
 *   placa, los bordes y el número de barras).
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectSafetyRisks,
  lowerIsSafer,
  magnitudeIsSafer,
  ordinalLevel,
  type SafetyRule,
} from '../safety';
import type { CheckRow } from '../../calculations/types';
import {
  edgeAxisPatch,
  shearPatch,
  type AnchorPlateResult,
} from '../../calculations/anchorPlate';
import { getSizesForTipo } from '../../../data/steelProfiles';
import { availableFck } from '../../../data/materials';
import {
  AVAILABLE_BOTTOM_ANCHORAGES,
  AVAILABLE_REBAR_DIAMS,
  AVAILABLE_REBAR_GRADES,
  AVAILABLE_TOP_CONNECTIONS,
  BOTTOM_ANCHORAGE_LABEL,
  TOP_CONNECTION_LABEL,
  type BottomAnchorage,
  type RebarDiam,
  type RebarGrade,
  type TopConnection,
} from '../../../data/anchorBars';
import {
  anchorPlateDefaults,
  type AnchorPlateInputs,
  type AnchorPlateSectionType,
  type AnchorPlateSteel,
  type PedestalSurface,
} from '../../../data/defaults';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
const SECTION_TYPES: readonly string[] = ['IPE', 'HEA', 'HEB', 'IPN'];
const PLATE_STEELS: readonly string[] = ['S235', 'S275', 'S355'];
const BAR_LAYOUTS: readonly number[] = [4, 6, 8, 9];
const RIB_COUNTS: readonly number[] = [0, 2, 4];
const SURFACES: readonly string[] = ['smooth', 'roughened'];

const SURFACE_ES: Record<string, string> = {
  smooth: 'Lisa (μ = 0.2)',
  roughened: 'Rugosa (μ = 0.4)',
};

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const ANCHOR_PLATE_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'sectionType', 'sectionSize',
    'NEd_kN', 'NEd_G_kN', 'Mx_kNm', 'My_kNm', 'Vx_kN', 'Vy_kN',
    'plate_a_mm', 'plate_b_mm', 'plate_t_mm', 'plate_steel',
    'bar_nLayout', 'bar_diam_mm', 'bar_grade', 'bar_edge_x_mm', 'bar_edge_y_mm', 'bar_hef_mm',
    'bottom_anchorage', 'top_connection', 'washer_od_mm',
    'rib_count', 'rib_h_mm', 'rib_t_mm',
    'fck_MPa',
    'pedestal_cX1_mm', 'pedestal_cX2_mm', 'pedestal_cY1_mm', 'pedestal_cY2_mm',
    'pedestal_h_mm', 'plate_margin_x_mm', 'plate_margin_y_mm', 'surface_type', 'weld_throat_mm',
    'warnings',
  ],
  properties: {
    sectionType: { type: ['string', 'null'], enum: [...SECTION_TYPES, null], description: 'Familia del perfil del pilar que apoya en la placa (IPE, HEA, HEB o IPN).' },
    sectionSize: { type: ['integer', 'null'], description: 'Designación del perfil (HEB 200 → 200).' },
    NEd_kN: { type: ['number', 'null'], description: 'Axil de CÁLCULO (ELU) en kN, COMPRESIÓN POSITIVA. Un valor negativo es tracción.' },
    NEd_G_kN: { type: ['number', 'null'], description: 'Axil CUASI-PERMANENTE en kN (la parte del axil que siempre está: peso propio y cargas permanentes). Se usa solo para la fricción placa-hormigón que resiste el cortante.' },
    Mx_kNm: { type: ['number', 'null'], description: 'Momento de cálculo alrededor del eje FUERTE, en kNm.' },
    My_kNm: { type: ['number', 'null'], description: 'Momento de cálculo alrededor del eje DÉBIL, en kNm.' },
    Vx_kN: { type: ['number', 'null'], description: 'Cortante de cálculo en la dirección del eje FUERTE, en kN.' },
    Vy_kN: { type: ['number', 'null'], description: 'Cortante de cálculo en la dirección del eje DÉBIL, en kN. Si el enunciado da un único cortante sin dirección, ponlo en Vx_kN y deja Vy_kN a 0.' },
    plate_a_mm: { type: ['number', 'null'], description: 'Dimensión de la placa PARALELA al eje fuerte, en mm.' },
    plate_b_mm: { type: ['number', 'null'], description: 'Dimensión de la placa PARALELA al eje débil, en mm.' },
    plate_t_mm: { type: ['number', 'null'], description: 'Espesor de la placa, en mm.' },
    plate_steel: { type: ['string', 'null'], enum: [...PLATE_STEELS, null], description: 'Acero de la placa (S235, S275 o S355).' },
    bar_nLayout: { type: ['integer', 'null'], enum: [...BAR_LAYOUTS, null], description: 'Número y disposición de las barras de anclaje: 4 (esquinas), 6 (esquinas + 2 en el centro de los lados del eje fuerte), 8 (esquinas + 4 centradas) o 9 (retícula 3×3).' },
    bar_diam_mm: { type: ['integer', 'null'], enum: [...AVAILABLE_REBAR_DIAMS, null], description: 'Diámetro de las barras de anclaje, en mm.' },
    bar_grade: { type: ['string', 'null'], enum: [...AVAILABLE_REBAR_GRADES, null], description: 'Acero de las barras de anclaje (B400S o B500S).' },
    bar_edge_x_mm: { type: ['number', 'null'], description: 'Distancia del eje de la barra al borde de la PLACA en el eje fuerte, en mm. Junto con las dimensiones de la placa y el número de barras, define dónde caen las barras (no hay un campo de "separación").' },
    bar_edge_y_mm: { type: ['number', 'null'], description: 'Distancia del eje de la barra al borde de la PLACA en el eje débil, en mm.' },
    bar_hef_mm: { type: ['number', 'null'], description: 'Profundidad eficaz de anclaje de las barras en el hormigón, en mm (típico 15–25 veces el diámetro).' },
    bottom_anchorage: { type: ['string', 'null'], enum: [...AVAILABLE_BOTTOM_ANCHORAGES, null], description: 'Anclaje del EXTREMO EMPOTRADO de la barra: "prolongacion_recta", "patilla" (90°), "gancho" (≥135°) o "arandela_tuerca" (cabeza ensanchada, que transfiere por aplastamiento y se comprueba a pull-out).' },
    top_connection: { type: ['string', 'null'], enum: [...AVAILABLE_TOP_CONNECTIONS, null], description: 'Unión de la barra con la placa: "soldada" o "tuerca_arandela". Es un detalle constructivo: no modifica ninguna comprobación.' },
    washer_od_mm: { type: ['number', 'null'], description: 'Diámetro exterior de la arandela de la cabeza, en mm. SOLO con bottom_anchorage = "arandela_tuerca".' },
    rib_count: { type: ['integer', 'null'], enum: [...RIB_COUNTS, null], description: 'Número de rigidizadores (cartelas) de la placa: 0, 2 o 4.' },
    rib_h_mm: { type: ['number', 'null'], description: 'Altura del rigidizador, en mm. Solo con rigidizadores.' },
    rib_t_mm: { type: ['number', 'null'], description: 'Espesor del rigidizador, en mm. Solo con rigidizadores.' },
    fck_MPa: { type: ['integer', 'null'], enum: [...availableFck, null], description: 'Resistencia característica del hormigón del macizo, en MPa. Por debajo de 25 la app avisa; por debajo de 20 no es admisible para anclajes.' },
    pedestal_cX1_mm: { type: ['number', 'null'], description: 'Distancia de la barra al borde del MACIZO en la dirección +x, en mm. Es una medida real del macizo de hormigón, no de la placa.' },
    pedestal_cX2_mm: { type: ['number', 'null'], description: 'Distancia de la barra al borde del macizo en la dirección −x, en mm. Si el macizo es simétrico, igual a cX1.' },
    pedestal_cY1_mm: { type: ['number', 'null'], description: 'Distancia de la barra al borde del macizo en la dirección +y, en mm.' },
    pedestal_cY2_mm: { type: ['number', 'null'], description: 'Distancia de la barra al borde del macizo en la dirección −y, en mm.' },
    pedestal_h_mm: { type: ['number', 'null'], description: 'Canto (altura) del macizo de hormigón, en mm.' },
    plate_margin_x_mm: { type: ['number', 'null'], description: 'Distancia del borde de la PLACA al borde del macizo en el eje fuerte, en mm (gobierna el ensanchamiento α de la presión de contacto).' },
    plate_margin_y_mm: { type: ['number', 'null'], description: 'Distancia del borde de la placa al borde del macizo en el eje débil, en mm.' },
    surface_type: { type: ['string', 'null'], enum: [...SURFACES, null], description: 'Acabado de la superficie del macizo bajo la placa: "smooth" (lisa, μ = 0.2) o "roughened" (rugosa, μ = 0.4). Gobierna la fricción que resiste el cortante.' },
    weld_throat_mm: { type: ['number', 'null'], description: 'Espesor de garganta del cordón de soldadura pilar-placa, en mm (informativo).' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Placas de anclaje:
1. TODAS las longitudes van en MILÍMETROS (placa, barras, rigidizadores, macizo). Las fuerzas en kN y los momentos en kNm, siempre de CÁLCULO (ELU, ya mayorados).
2. SIGNO DEL AXIL: NEd_kN es positivo en COMPRESIÓN. NEd_G_kN es la parte cuasi-permanente de ese axil (peso propio y permanentes): es la que da fricción contra el cortante, así que no la infles.
3. CORTANTE: si el enunciado da un cortante único sin dirección, ponlo en Vx_kN (eje fuerte) y deja Vy_kN = 0.
4. POSICIÓN DE LAS BARRAS: no hay campo de "separación entre barras". Las barras las coloca la app a partir de la placa (plate_a, plate_b), las distancias al borde de la PLACA (bar_edge_x, bar_edge_y) y el número/disposición (bar_nLayout). Para moverlas, cambia esos campos.
5. DOS GEOMETRÍAS DISTINTAS que se confunden con facilidad: bar_edge_* es de la barra al borde de la PLACA; pedestal_cX1..cY2 es de la barra al borde del MACIZO de hormigón (y gobiernan la rotura de cono por borde). Si el macizo es simétrico, cX1 = cX2 y cY1 = cY2.
6. El anclaje inferior (bottom_anchorage) y la conexión superior (top_connection) son independientes. Solo "arandela_tuerca" activa la comprobación de pull-out y necesita washer_od_mm; los otros tres anclan por adherencia y necesitan un hef suficiente.
7. En este módulo son DATOS del problema, no variables de diseño: los esfuerzos (Mx, My, Vx, Vy), el axil (NEd y NEd_G) y la geometría real del macizo (pedestal_cX1..cY2, pedestal_h, plate_margin_x/y, surface_type). Para que una placa cumpla actúa SIEMPRE sobre la RESISTENCIA: placa más gruesa o más grande, más barras o de más diámetro, más profundidad de anclaje (hef), rigidizadores, mejor hormigón. Y OJO con una trampa propia de este módulo: SUBIR el axil de compresión "mejora" el resultado (alivia la tracción de los anclajes, que es lo que suele fallar) — no lo toques para hacer cumplir la placa. Tampoco agrandes el macizo ni sus distancias a los bordes, que son medidas de la obra.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Placa de anclaje de un HEB-220 con axil de 350 kN, momento de 60 kNm y cortante de 40 kN. '
  + 'Placa 450×350×25 de S275 sobre macizo de HA-30, con 4 barras Ø25 B500S.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface AnchorPlatePayload {
  sectionType: string | null;
  sectionSize: number | null;
  NEd_kN: number | null;
  NEd_G_kN: number | null;
  Mx_kNm: number | null;
  My_kNm: number | null;
  Vx_kN: number | null;
  Vy_kN: number | null;
  plate_a_mm: number | null;
  plate_b_mm: number | null;
  plate_t_mm: number | null;
  plate_steel: string | null;
  bar_nLayout: number | null;
  bar_diam_mm: number | null;
  bar_grade: string | null;
  bar_edge_x_mm: number | null;
  bar_edge_y_mm: number | null;
  bar_hef_mm: number | null;
  bottom_anchorage: string | null;
  top_connection: string | null;
  washer_od_mm: number | null;
  rib_count: number | null;
  rib_h_mm: number | null;
  rib_t_mm: number | null;
  fck_MPa: number | null;
  pedestal_cX1_mm: number | null;
  pedestal_cX2_mm: number | null;
  pedestal_cY1_mm: number | null;
  pedestal_cY2_mm: number | null;
  pedestal_h_mm: number | null;
  plate_margin_x_mm: number | null;
  plate_margin_y_mm: number | null;
  surface_type: string | null;
  weld_throat_mm: number | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parsePayload(raw: unknown): AnchorPlatePayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    sectionType: stringOrNull(r.sectionType),
    sectionSize: finiteNumber(r.sectionSize),
    NEd_kN: finiteNumber(r.NEd_kN),
    NEd_G_kN: finiteNumber(r.NEd_G_kN),
    Mx_kNm: finiteNumber(r.Mx_kNm),
    My_kNm: finiteNumber(r.My_kNm),
    Vx_kN: finiteNumber(r.Vx_kN),
    Vy_kN: finiteNumber(r.Vy_kN),
    plate_a_mm: finiteNumber(r.plate_a_mm),
    plate_b_mm: finiteNumber(r.plate_b_mm),
    plate_t_mm: finiteNumber(r.plate_t_mm),
    plate_steel: stringOrNull(r.plate_steel),
    bar_nLayout: finiteNumber(r.bar_nLayout),
    bar_diam_mm: finiteNumber(r.bar_diam_mm),
    bar_grade: stringOrNull(r.bar_grade),
    bar_edge_x_mm: finiteNumber(r.bar_edge_x_mm),
    bar_edge_y_mm: finiteNumber(r.bar_edge_y_mm),
    bar_hef_mm: finiteNumber(r.bar_hef_mm),
    bottom_anchorage: stringOrNull(r.bottom_anchorage),
    top_connection: stringOrNull(r.top_connection),
    washer_od_mm: finiteNumber(r.washer_od_mm),
    rib_count: finiteNumber(r.rib_count),
    rib_h_mm: finiteNumber(r.rib_h_mm),
    rib_t_mm: finiteNumber(r.rib_t_mm),
    fck_MPa: finiteNumber(r.fck_MPa),
    pedestal_cX1_mm: finiteNumber(r.pedestal_cX1_mm),
    pedestal_cX2_mm: finiteNumber(r.pedestal_cX2_mm),
    pedestal_cY1_mm: finiteNumber(r.pedestal_cY1_mm),
    pedestal_cY2_mm: finiteNumber(r.pedestal_cY2_mm),
    pedestal_h_mm: finiteNumber(r.pedestal_h_mm),
    plate_margin_x_mm: finiteNumber(r.plate_margin_x_mm),
    plate_margin_y_mm: finiteNumber(r.plate_margin_y_mm),
    surface_type: stringOrNull(r.surface_type),
    weld_throat_mm: finiteNumber(r.weld_throat_mm),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  sectionType: 'Familia del perfil',
  sectionSize: 'Tamaño del perfil',
  NEd_kN: 'Axil NEd',
  NEd_G_kN: 'Axil cuasi-permanente NEd,G',
  Mx_kNm: 'Momento Mx',
  My_kNm: 'Momento My',
  Vx_kN: 'Cortante Vx',
  Vy_kN: 'Cortante Vy',
  plate_a_mm: 'Placa — dimensión a',
  plate_b_mm: 'Placa — dimensión b',
  plate_t_mm: 'Placa — espesor t',
  plate_steel: 'Acero de la placa',
  bar_nLayout: 'Disposición de barras',
  bar_diam_mm: 'Ø de las barras',
  bar_grade: 'Acero de las barras',
  bar_edge_x_mm: 'Barra al borde de placa (x)',
  bar_edge_y_mm: 'Barra al borde de placa (y)',
  bar_hef_mm: 'Profundidad de anclaje hef',
  bottom_anchorage: 'Anclaje inferior',
  top_connection: 'Conexión superior',
  washer_od_mm: 'Ø exterior de la arandela',
  rib_count: 'Nº de rigidizadores',
  rib_h_mm: 'Rigidizador — altura',
  rib_t_mm: 'Rigidizador — espesor',
  fck_MPa: 'Hormigón fck',
  pedestal_cX1_mm: 'Macizo — borde +x',
  pedestal_cX2_mm: 'Macizo — borde −x',
  pedestal_cY1_mm: 'Macizo — borde +y',
  pedestal_cY2_mm: 'Macizo — borde −y',
  pedestal_h_mm: 'Canto del macizo',
  plate_margin_x_mm: 'Placa al borde del macizo (x)',
  plate_margin_y_mm: 'Placa al borde del macizo (y)',
  surface_type: 'Superficie del macizo',
  weld_throat_mm: 'Garganta de soldadura',
} as const;

type PayloadKey = keyof typeof LABELS;

/** ORDER del contrato: familia antes que tamaño; los gates antes que sus dependientes. */
const KEY_ORDER: readonly PayloadKey[] = [
  'sectionType', 'sectionSize',
  'NEd_kN', 'NEd_G_kN', 'Mx_kNm', 'My_kNm', 'Vx_kN', 'Vy_kN',
  'plate_a_mm', 'plate_b_mm', 'plate_t_mm', 'plate_steel',
  'bar_nLayout', 'bar_diam_mm', 'bar_grade', 'bar_edge_x_mm', 'bar_edge_y_mm', 'bar_hef_mm',
  'bottom_anchorage', 'top_connection', 'washer_od_mm',
  'rib_count', 'rib_h_mm', 'rib_t_mm',
  'fck_MPa',
  'pedestal_cX1_mm', 'pedestal_cX2_mm', 'pedestal_cY1_mm', 'pedestal_cY2_mm',
  'pedestal_h_mm', 'plate_margin_x_mm', 'plate_margin_y_mm', 'surface_type', 'weld_throat_mm',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

export const WASHER_GATE_REASON =
  'El diámetro de la arandela solo interviene con el anclaje inferior "arandela_tuerca" (es el que '
  + 'transfiere por aplastamiento y se comprueba a pull-out).';

export const RIB_GATE_REASON =
  'Sin rigidizadores (rib_count = 0), la geometría del rigidizador no interviene en el cálculo.';

/**
 * Campos que NO son variables de diseño. La placa, las barras, el hef, los
 * rigidizadores y el hormigón SÍ lo son.
 *
 * DOS REGLAS CONTRAINTUITIVAS, y conviene no "arreglarlas" al leerlas:
 * - `NEd` es `lowerIsSafer`: es el ÚNICO campo de carga de toda la app donde lo
 *   peligroso es AUMENTARLO. La compresión centra la resultante y alivia la
 *   tracción de los anclajes, que es el fallo que gobierna una placa con momento.
 * - `NEd_G` igual, y más directo: es el axil cuasi-permanente que RESISTE por
 *   fricción (μ·Nc,G) frente al cortante. Inflarlo regala capacidad a cortante.
 * Los momentos y cortantes van con `magnitudeIsSafer`: el solver es biaxial y el
 * signo solo decide qué barras traccionan — la demanda es el módulo.
 *
 * `surface_type` es ordinal por el μ real del motor (rugosa 0.4 > lisa 0.2).
 *
 * Los campos LEGACY (`VEd`, `pedestal_cX`, `pedestal_cY`) NO tienen regla: son
 * espejo de los canónicos, no existen en el payload y `buildPlan` los escribe sin
 * fila en `changes`. La regla vive sobre la forma canónica (`Vx`/`Vy`,
 * `pedestal_cX1..cY2`) y su `confirmKey` es la clave de payload que el modelo SÍ
 * puede proponer (`Vx_kN`, `pedestal_cX1_mm`…).
 */
export const ANCHOR_PLATE_SAFETY_RULES: ReadonlyArray<SafetyRule<AnchorPlateInputs>> = [
  { field: 'Mx', confirmKey: 'Mx_kNm', level: magnitudeIsSafer, why: 'El momento de cálculo lo fija el análisis de la estructura: rebajarlo reduce la tracción de las barras sin tocar la placa.' },
  { field: 'My', confirmKey: 'My_kNm', level: magnitudeIsSafer, why: 'El momento de cálculo lo fija el análisis de la estructura: rebajarlo reduce la tracción de las barras sin tocar la placa.' },
  { field: 'Vx', confirmKey: 'Vx_kN', level: magnitudeIsSafer, why: 'El cortante de cálculo lo fija el análisis: rebajarlo hace "cumplir" las barras y el hormigón de borde sin cambiar nada.' },
  { field: 'Vy', confirmKey: 'Vy_kN', level: magnitudeIsSafer, why: 'El cortante de cálculo lo fija el análisis: rebajarlo hace "cumplir" las barras y el hormigón de borde sin cambiar nada.' },
  {
    field: 'NEd',
    confirmKey: 'NEd_kN',
    level: lowerIsSafer,
    why: 'CUIDADO, aquí lo peligroso es SUBIR el axil: la compresión alivia la tracción de los anclajes, que es el fallo que gobierna una placa con momento. Aumentar NEd hace "cumplir" la placa sin tocarla, y el axil lo fija el análisis de la estructura.',
  },
  {
    field: 'NEd_G',
    confirmKey: 'NEd_G_kN',
    level: lowerIsSafer,
    why: 'El axil cuasi-permanente es el que RESISTE el cortante por fricción (μ·Nc,G): inflarlo regala capacidad a cortante. Es la parte permanente del axil, y la fija la estructura, no el proyectista de la placa.',
  },
  { field: 'pedestal_cX1', confirmKey: 'pedestal_cX1_mm', level: lowerIsSafer, why: 'La distancia de la barra al borde del macizo es una medida real de la obra: agrandarla aleja la rotura de cono por borde sin que el macizo se haya movido.' },
  { field: 'pedestal_cX2', confirmKey: 'pedestal_cX2_mm', level: lowerIsSafer, why: 'La distancia de la barra al borde del macizo es una medida real de la obra: agrandarla aleja la rotura de cono por borde sin que el macizo se haya movido.' },
  { field: 'pedestal_cY1', confirmKey: 'pedestal_cY1_mm', level: lowerIsSafer, why: 'La distancia de la barra al borde del macizo es una medida real de la obra: agrandarla aleja la rotura de cono por borde sin que el macizo se haya movido.' },
  { field: 'pedestal_cY2', confirmKey: 'pedestal_cY2_mm', level: lowerIsSafer, why: 'La distancia de la barra al borde del macizo es una medida real de la obra: agrandarla aleja la rotura de cono por borde sin que el macizo se haya movido.' },
  { field: 'pedestal_h', confirmKey: 'pedestal_h_mm', level: lowerIsSafer, why: 'El canto del macizo es una medida real de la obra: agrandarlo relaja el factor de hendimiento (splitting) sin que el macizo haya crecido.' },
  { field: 'plate_margin_x', confirmKey: 'plate_margin_x_mm', level: lowerIsSafer, why: 'La distancia de la placa al borde del macizo es una medida real de la obra: agrandarla ensancha el área de reparto de la presión de contacto.' },
  { field: 'plate_margin_y', confirmKey: 'plate_margin_y_mm', level: lowerIsSafer, why: 'La distancia de la placa al borde del macizo es una medida real de la obra: agrandarla ensancha el área de reparto de la presión de contacto.' },
  {
    // Nivel = −μ: lo conservador es la superficie LISA (μ = 0.2). Declararla
    // rugosa (μ = 0.4) DUPLICA la fricción que resiste el cortante.
    field: 'surface_type', // payload `surface_type`: mismo nombre ⇒ sin confirmKey
    level: ordinalLevel({ smooth: -0.2, roughened: -0.4 }),
    why: 'El acabado de la superficie del macizo fija el coeficiente de rozamiento (lisa 0.2 · rugosa 0.4): declararla rugosa duplica la fricción que resiste el cortante, y eso hay que garantizarlo en obra.',
  },
];

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtMm = (mm: number) => `${mm} mm`;

function buildAnchorPlatePlan(
  x: AnchorPlatePayload,
  current: AnchorPlateInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<AnchorPlateInputs> {
  const fields: Partial<AnchorPlateInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof AnchorPlateInputs>(
    key: PayloadKey,
    field: K,
    value: AnchorPlateInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  /** Longitud en mm con rango; ALREADY exacto. */
  function applyMm<K extends keyof AnchorPlateInputs>(
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
    else apply(key, field, v as AnchorPlateInputs[K], fmtMm(before), fmtMm(v));
  }

  // --- Perfil: familia ANTES que tamaño (validación cruzada) ---
  if (x.sectionType !== null) {
    if (!SECTION_TYPES.includes(x.sectionType)) {
      skip('sectionType', `Perfil "${x.sectionType}" no disponible (${SECTION_TYPES.join(', ')})`);
    } else if (x.sectionType === current.sectionType) {
      skip('sectionType', ALREADY);
    } else {
      apply(
        'sectionType', 'sectionType', x.sectionType as AnchorPlateSectionType,
        current.sectionType, x.sectionType,
      );
    }
  }
  const typeFinal = (fields.sectionType ?? current.sectionType) as AnchorPlateSectionType;
  const sizes = getSizesForTipo(typeFinal);

  if (x.sectionSize !== null) {
    if (!sizes.includes(x.sectionSize)) {
      skip('sectionSize', `${typeFinal} ${x.sectionSize} no está en el catálogo (${sizes.join(', ')})`);
    } else if (x.sectionSize === current.sectionSize && fields.sectionType === undefined) {
      skip('sectionSize', ALREADY);
    } else {
      apply(
        'sectionSize', 'sectionSize', x.sectionSize,
        `${current.sectionType} ${current.sectionSize}`, `${typeFinal} ${x.sectionSize}`,
      );
    }
  } else if (fields.sectionType !== undefined && !sizes.includes(current.sectionSize)) {
    // Cambio de familia sin tamaño y el vigente no existe en la nueva: se ajusta
    // al primero del catálogo, igual que hace la UI, y se avisa.
    const first = sizes[0];
    fields.sectionSize = first;
    warnings.push(
      `El tamaño ${current.sectionSize} no existe en la serie ${typeFinal}: se ajusta a ${typeFinal} ${first}.`,
    );
  }

  // --- Esfuerzos ---
  function applyEffort(
    key: PayloadKey,
    field: keyof AnchorPlateInputs,
    value: number | null,
    quantity: 'force' | 'moment',
  ): void {
    if (value === null) return;
    if (Math.abs(value) > 100000) {
      skip(key, rangeReason(value, -100000, 100000, quantity === 'force' ? 'kN' : 'kNm'));
      return;
    }
    const v = round2(value);
    const before = current[field] as number;
    if (Math.abs(v - before) <= EPS) skip(key, ALREADY);
    else {
      apply(
        key, field, v as AnchorPlateInputs[typeof field],
        formatQuantity(before, quantity, system), formatQuantity(v, quantity, system),
      );
    }
  }

  applyEffort('NEd_kN', 'NEd', x.NEd_kN, 'force');
  applyEffort('NEd_G_kN', 'NEd_G', x.NEd_G_kN, 'force');
  applyEffort('Mx_kNm', 'Mx', x.Mx_kNm, 'moment');
  applyEffort('My_kNm', 'My', x.My_kNm, 'moment');

  const nEdFinal = (fields.NEd ?? current.NEd) as number;
  const nEdGFinal = (fields.NEd_G ?? current.NEd_G) as number;
  if (nEdFinal > 0 && nEdGFinal > nEdFinal) {
    warnings.push(
      'El axil cuasi-permanente (NEd,G) es mayor que el axil total de cálculo (NEd): revísalo, '
      + 'porque NEd,G es la PARTE permanente de ese axil.',
    );
  }

  // --- Cortante: Vx/Vy son la forma canónica; VEd es su espejo legacy ---
  //
  // `shearPatch` deja los tres coherentes con lo que lee `resolveShear`. VEd va a
  // `fields` SIN fila en `changes` (es consecuencia, no decisión) — así el riesgo
  // se marca una sola vez, sobre Vx/Vy, con su `why` correcto.
  applyEffort('Vx_kN', 'Vx', x.Vx_kN, 'force');
  applyEffort('Vy_kN', 'Vy', x.Vy_kN, 'force');
  if (fields.Vx !== undefined || fields.Vy !== undefined) {
    const vxFinal = (fields.Vx ?? current.Vx) as number;
    const vyFinal = (fields.Vy ?? current.Vy) as number;
    const patch = shearPatch(vxFinal, vyFinal);
    fields.Vx = patch.Vx;
    fields.Vy = patch.Vy;
    fields.VEd = patch.VEd;
  }

  // --- Placa ---
  applyMm('plate_a_mm', 'plate_a', x.plate_a_mm, 100, 2000);
  applyMm('plate_b_mm', 'plate_b', x.plate_b_mm, 100, 2000);
  applyMm('plate_t_mm', 'plate_t', x.plate_t_mm, 5, 100);
  if (x.plate_steel !== null) {
    if (!PLATE_STEELS.includes(x.plate_steel)) {
      skip('plate_steel', `Acero "${x.plate_steel}" no disponible (${PLATE_STEELS.join(', ')})`);
    } else if (x.plate_steel === current.plate_steel) {
      skip('plate_steel', ALREADY);
    } else {
      apply(
        'plate_steel', 'plate_steel', x.plate_steel as AnchorPlateSteel,
        current.plate_steel, x.plate_steel,
      );
    }
  }

  // --- Barras de anclaje ---
  if (x.bar_nLayout !== null) {
    if (!BAR_LAYOUTS.includes(x.bar_nLayout)) {
      skip('bar_nLayout', `${x.bar_nLayout} barras no es una disposición admitida (${BAR_LAYOUTS.join(', ')})`);
    } else if (x.bar_nLayout === current.bar_nLayout) {
      skip('bar_nLayout', ALREADY);
    } else {
      apply(
        'bar_nLayout', 'bar_nLayout', x.bar_nLayout as AnchorPlateInputs['bar_nLayout'],
        `${current.bar_nLayout} barras`, `${x.bar_nLayout} barras`,
      );
    }
  }
  if (x.bar_diam_mm !== null) {
    if (!AVAILABLE_REBAR_DIAMS.includes(x.bar_diam_mm as RebarDiam)) {
      skip('bar_diam_mm', `Ø${x.bar_diam_mm} no es un diámetro del catálogo (Ø${AVAILABLE_REBAR_DIAMS.join(', Ø')})`);
    } else if (x.bar_diam_mm === current.bar_diam) {
      skip('bar_diam_mm', ALREADY);
    } else {
      apply(
        'bar_diam_mm', 'bar_diam', x.bar_diam_mm as RebarDiam,
        `Ø${current.bar_diam} mm`, `Ø${x.bar_diam_mm} mm`,
      );
    }
  }
  if (x.bar_grade !== null) {
    if (!AVAILABLE_REBAR_GRADES.includes(x.bar_grade as RebarGrade)) {
      skip('bar_grade', `Acero "${x.bar_grade}" no disponible (${AVAILABLE_REBAR_GRADES.join(', ')})`);
    } else if (x.bar_grade === current.bar_grade) {
      skip('bar_grade', ALREADY);
    } else {
      apply('bar_grade', 'bar_grade', x.bar_grade as RebarGrade, current.bar_grade, x.bar_grade);
    }
  }
  applyMm('bar_edge_x_mm', 'bar_edge_x', x.bar_edge_x_mm, 10, 500);
  applyMm('bar_edge_y_mm', 'bar_edge_y', x.bar_edge_y_mm, 10, 500);
  applyMm('bar_hef_mm', 'bar_hef', x.bar_hef_mm, 40, 2000);

  // --- Anclaje inferior (gatea la arandela) y conexión superior ---
  if (x.bottom_anchorage !== null) {
    if (!AVAILABLE_BOTTOM_ANCHORAGES.includes(x.bottom_anchorage as BottomAnchorage)) {
      skip('bottom_anchorage', `Anclaje "${x.bottom_anchorage}" no disponible (${AVAILABLE_BOTTOM_ANCHORAGES.join(', ')})`);
    } else if (x.bottom_anchorage === current.bottom_anchorage) {
      skip('bottom_anchorage', ALREADY);
    } else {
      apply(
        'bottom_anchorage', 'bottom_anchorage', x.bottom_anchorage as BottomAnchorage,
        BOTTOM_ANCHORAGE_LABEL[current.bottom_anchorage],
        BOTTOM_ANCHORAGE_LABEL[x.bottom_anchorage as BottomAnchorage],
      );
    }
  }
  const anchorageFinal = (fields.bottom_anchorage ?? current.bottom_anchorage) as BottomAnchorage;

  if (x.top_connection !== null) {
    if (!AVAILABLE_TOP_CONNECTIONS.includes(x.top_connection as TopConnection)) {
      skip('top_connection', `Conexión "${x.top_connection}" no disponible (${AVAILABLE_TOP_CONNECTIONS.join(', ')})`);
    } else if (x.top_connection === current.top_connection) {
      skip('top_connection', ALREADY);
    } else {
      apply(
        'top_connection', 'top_connection', x.top_connection as TopConnection,
        TOP_CONNECTION_LABEL[current.top_connection],
        TOP_CONNECTION_LABEL[x.top_connection as TopConnection],
      );
    }
  }

  if (x.washer_od_mm !== null && anchorageFinal !== 'arandela_tuerca') {
    skip('washer_od_mm', WASHER_GATE_REASON);
  } else {
    applyMm('washer_od_mm', 'washer_od', x.washer_od_mm, 10, 300);
  }

  // --- Rigidizadores: rib_count gatea la geometría ---
  if (x.rib_count !== null) {
    if (!RIB_COUNTS.includes(x.rib_count)) {
      skip('rib_count', `${x.rib_count} rigidizadores no es una opción (${RIB_COUNTS.join(', ')})`);
    } else if (x.rib_count === current.rib_count) {
      skip('rib_count', ALREADY);
    } else {
      apply(
        'rib_count', 'rib_count', x.rib_count as AnchorPlateInputs['rib_count'],
        `${current.rib_count}`, `${x.rib_count}`,
      );
    }
  }
  const ribsFinal = (fields.rib_count ?? current.rib_count) as number;
  if (x.rib_h_mm !== null && ribsFinal === 0) skip('rib_h_mm', RIB_GATE_REASON);
  else applyMm('rib_h_mm', 'rib_h', x.rib_h_mm, 20, 1000);
  if (x.rib_t_mm !== null && ribsFinal === 0) skip('rib_t_mm', RIB_GATE_REASON);
  else applyMm('rib_t_mm', 'rib_t', x.rib_t_mm, 3, 100);

  // --- Hormigón ---
  if (x.fck_MPa !== null) {
    if (!availableFck.includes(x.fck_MPa)) {
      skip('fck_MPa', `HA-${x.fck_MPa} no está en el catálogo (${availableFck.join(', ')} MPa)`);
    } else if (x.fck_MPa === current.fck) {
      skip('fck_MPa', ALREADY);
    } else {
      apply('fck_MPa', 'fck', x.fck_MPa, `HA-${current.fck}`, `HA-${x.fck_MPa}`);
    }
  }

  // --- Macizo: los bordes canónicos por cara; el legacy pedestal_cX/cY es su espejo ---
  applyMm('pedestal_cX1_mm', 'pedestal_cX1', x.pedestal_cX1_mm, 20, 5000);
  applyMm('pedestal_cX2_mm', 'pedestal_cX2', x.pedestal_cX2_mm, 20, 5000);
  applyMm('pedestal_cY1_mm', 'pedestal_cY1', x.pedestal_cY1_mm, 20, 5000);
  applyMm('pedestal_cY2_mm', 'pedestal_cY2', x.pedestal_cY2_mm, 20, 5000);
  if (fields.pedestal_cX1 !== undefined || fields.pedestal_cX2 !== undefined) {
    const patch = edgeAxisPatch(
      'x',
      (fields.pedestal_cX1 ?? current.pedestal_cX1) as number,
      (fields.pedestal_cX2 ?? current.pedestal_cX2) as number,
    );
    Object.assign(fields, patch);
  }
  if (fields.pedestal_cY1 !== undefined || fields.pedestal_cY2 !== undefined) {
    const patch = edgeAxisPatch(
      'y',
      (fields.pedestal_cY1 ?? current.pedestal_cY1) as number,
      (fields.pedestal_cY2 ?? current.pedestal_cY2) as number,
    );
    Object.assign(fields, patch);
  }

  applyMm('pedestal_h_mm', 'pedestal_h', x.pedestal_h_mm, 100, 10000);
  applyMm('plate_margin_x_mm', 'plate_margin_x', x.plate_margin_x_mm, 0, 5000);
  applyMm('plate_margin_y_mm', 'plate_margin_y', x.plate_margin_y_mm, 0, 5000);

  if (x.surface_type !== null) {
    if (!SURFACES.includes(x.surface_type)) {
      skip('surface_type', `Superficie "${x.surface_type}" no disponible (smooth, roughened)`);
    } else if (x.surface_type === current.surface_type) {
      skip('surface_type', ALREADY);
    } else {
      apply(
        'surface_type', 'surface_type', x.surface_type as PedestalSurface,
        SURFACE_ES[current.surface_type], SURFACE_ES[x.surface_type],
      );
    }
  }

  applyMm('weld_throat_mm', 'weld_throat', x.weld_throat_mm, 2, 50);

  // --- notFound ---
  const values = x as unknown as Record<PayloadKey, unknown>;
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = detectSafetyRisks(
    ANCHOR_PLATE_SAFETY_RULES, changes, fields, current, anchorPlateDefaults, confirmed,
  );
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

// Fuera del snapshot, además de `title`: los campos legacy (`VEd`, `pedestal_cX`,
// `pedestal_cY`), que son espejo de los canónicos; `concrete_cracked`, que no tiene
// control en la UI; y `bar_spacing_x`/`bar_spacing_y`, que el motor ignora.
type StateKey = Exclude<
  keyof AnchorPlateInputs,
  'title' | 'VEd' | 'pedestal_cX' | 'pedestal_cY' | 'concrete_cracked'
  | 'bar_spacing_x' | 'bar_spacing_y'
>;

const SNAPSHOT_FIELDS: Readonly<Record<PayloadKey, StateKey>> = {
  sectionType: 'sectionType',
  sectionSize: 'sectionSize',
  NEd_kN: 'NEd',
  NEd_G_kN: 'NEd_G',
  Mx_kNm: 'Mx',
  My_kNm: 'My',
  Vx_kN: 'Vx',
  Vy_kN: 'Vy',
  plate_a_mm: 'plate_a',
  plate_b_mm: 'plate_b',
  plate_t_mm: 'plate_t',
  plate_steel: 'plate_steel',
  bar_nLayout: 'bar_nLayout',
  bar_diam_mm: 'bar_diam',
  bar_grade: 'bar_grade',
  bar_edge_x_mm: 'bar_edge_x',
  bar_edge_y_mm: 'bar_edge_y',
  bar_hef_mm: 'bar_hef',
  bottom_anchorage: 'bottom_anchorage',
  top_connection: 'top_connection',
  washer_od_mm: 'washer_od',
  rib_count: 'rib_count',
  rib_h_mm: 'rib_h',
  rib_t_mm: 'rib_t',
  fck_MPa: 'fck',
  pedestal_cX1_mm: 'pedestal_cX1',
  pedestal_cX2_mm: 'pedestal_cX2',
  pedestal_cY1_mm: 'pedestal_cY1',
  pedestal_cY2_mm: 'pedestal_cY2',
  pedestal_h_mm: 'pedestal_h',
  plate_margin_x_mm: 'plate_margin_x',
  plate_margin_y_mm: 'plate_margin_y',
  surface_type: 'surface_type',
  weld_throat_mm: 'weld_throat',
};

function buildSnapshot(c: AnchorPlateInputs): string {
  const valores: Record<string, number | string | boolean> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    valores[key] = value;
    if (value === anchorPlateDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

const SOLVER_MODE_ES: Record<string, string> = {
  'uniform-compression': 'toda la placa comprimida (sin despegue)',
  'partial-lift': 'despegue parcial de la placa',
  'partial-lift-saturated': 'despegue parcial con las barras saturadas',
  'axis-aligned-4': 'flexión según un eje con 4 barras',
  'biaxial-plastic': 'flexión biaxial (modelo plástico)',
  'biaxial-grid': 'flexión biaxial (retícula de barras)',
  'pure-tension': 'tracción pura (la placa levanta entera)',
};

/**
 * Resume el resultado del motor de placas de anclaje.
 *
 * DOS TRAMPAS, y las dos rompen el resumen si se ignoran:
 * 1. El motor NO tiene campo `error`. Su `valid:false` significa UNA cosa —no hay
 *    ninguna solicitación— y encima llega con `overallStatus:'ok'`: leerlo como
 *    verde sería decirle al usuario que su placa cumple sin haber comprobado nada.
 *    Se mapea a un resultado con `error` ⇒ veredicto 'invalid'.
 * 2. Los `warnings` de severidad 'fail' (arandela menor que la barra, fck < 20 MPa,
 *    garganta de soldadura insuficiente) FUERZAN el veredicto a INCUMPLE en la
 *    pantalla SIN ser checks. Si no se inyectan como filas, el resumen diría
 *    CUMPLE mientras la app dice INCUMPLE. Se convierten en CheckRow sintéticos.
 */
export function summarizeAnchorPlateResults(r: AnchorPlateResult): AiResultsSummary {
  if (!r.valid) {
    return summarizeCalcResults({
      valid: false,
      error: 'Sin solicitaciones definidas (axil, momentos y cortante son cero): no hay nada que comprobar.',
      checks: [],
    });
  }

  const failWarnings = r.warnings.filter((w) => w.severity === 'fail');
  const warnWarnings = r.warnings.filter((w) => w.severity === 'warn');

  // Las validaciones de entrada con severidad 'fail' vuelcan el veredicto en la
  // pantalla aunque todos los checks estén verdes: entran como filas propias.
  const validationRows: CheckRow[] = failWarnings.map((w, i) => ({
    id: `validation-${i}`,
    description: `Validación de entrada — ${w.message}`,
    value: '',
    limit: '',
    utilization: 1,
    status: 'fail' as const,
    article: 'Concreta — validación de entrada',
  }));

  const extras: string[] = [
    `Utilización máxima: η = ${(r.worstUtil * 100).toFixed(0)}%`,
    `Solver: ${SOLVER_MODE_ES[r.solver.mode] ?? r.solver.mode} · `
    + `Nc = ${r.solver.Nc.toFixed(1)} kN de compresión en el hormigón · `
    + `Ft total = ${r.solver.Ft_total.toFixed(1)} kN en ${r.solver.n_t} barra(s) traccionada(s)`,
  ];
  if (!r.solver.converged) {
    extras.push(
      'AVISO: el solver de equilibrio NO ha convergido, así que el reparto de tracciones es '
      + 'APROXIMADO y puede quedarse corto. Ese es el motivo de la comprobación "Equilibrio no '
      + 'garantizado": no lo ignores ni propongas cambios cosméticos para taparlo.',
    );
  }
  if (warnWarnings.length > 0) {
    extras.push(`Avisos de la app (no vuelcan el veredicto): ${warnWarnings.map((w) => w.message).join(' · ')}`);
  }

  return summarizeCalcResults(
    { valid: r.valid, checks: [...r.checks, ...validationRows] },
    extras,
  );
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const anchorPlateAdapter: AiModuleAdapter<AnchorPlateInputs> = {
  id: 'anchor-plate',
  label: 'Placas de anclaje',
  payloadSchema: ANCHOR_PLATE_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildAnchorPlatePlan(parsePayload(payload), current, system, confirmed),
};
