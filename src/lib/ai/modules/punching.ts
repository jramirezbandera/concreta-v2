/**
 * Adapter del asistente IA para el módulo Punzonamiento (ola 1, CE Anejo 19 §6.4).
 *
 * Particularidades del módulo:
 * - TRES MODOS con campos inertes. `mode` es el gate mayor: 'pilar' y
 *   'carga-puntual' comprueban una losa (cx/cy, cercos…); 'pilar-cruceta' es el
 *   "compañero de hand-calc" de una cruceta UPN y el motor FUERZA cx/cy = placa,
 *   isCircular = false y hasShearReinf = false. Todo campo que no pinte en el
 *   modo FINAL se salta con motivo en vez de aplicarse en silencio.
 * - `isCircular` solo tiene efecto en posición interior (el motor lo ignora en
 *   borde/esquina, y el panel lo deshabilita).
 * - Convención de borde/esquina: `cx` es la dimensión PARALELA al borde libre y
 *   `cy` la PERPENDICULAR (hacia el interior de la losa). Es la regla de prompt
 *   que más se equivoca sin explicarla.
 * - `plateT` (espesor de la placa de testa) NO va en el payload: es informativo y
 *   no tiene control en la UI — la IA no escribe lo que el usuario no puede ver.
 * - `betaMode`/`betaManual` (β personalizado) NO van en el payload A PROPÓSITO: el
 *   β afinado es un override manual del método general §6.4.3 (requiere MEd, W1 que
 *   el enunciado no da). La IA se queda en 'auto' y su β sigue saliendo de
 *   `position`/`mode` (reglas de seguridad intactas); el proyectista activa el
 *   'custom' a mano. Snapshot y reglas siguen teniendo 27 claves.
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectSafetyRisks,
  higherIsSafer,
  lowerIsSafer,
  ordinalLevel,
  trueIsSafer,
  type SafetyRule,
} from '../safety';
import type { PunchingResult } from '../../calculations/punching';
import { getSizesForTipo, getSizesUPN } from '../../../data/steelProfiles';
import { availableFck } from '../../../data/materials';
import { availableBarDiams } from '../../../data/rebar';
import {
  punchingDefaults,
  type CrucetaColType,
  type CrucetaSteel,
  type PunchingInputs,
  type PunchingMode,
  type PunchingPosition,
} from '../../../data/defaults';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
const MODES: readonly string[] = ['pilar', 'carga-puntual', 'pilar-cruceta'];
const POSITIONS: readonly string[] = ['interior', 'borde', 'esquina'];
const SW_DIAMS: readonly number[] = [6, 8, 10, 12];
const SW_LEGS: readonly number[] = [2, 3, 4, 5, 6];
const COL_TYPES: readonly string[] = ['HEB', 'HEA', 'IPE'];
const STEEL_GRADES: readonly string[] = ['S275', 'S355'];

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const PUNCHING_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'mode', 'position', 'isCircular', 'cx_mm', 'cy_mm', 'd_mm',
    'fck_MPa', 'fyk_MPa', 'barDiamSup_mm', 'sSup_mm', 'barDiamInf_mm', 'sInf_mm',
    'VEd_kN', 'hasShearReinf', 'swDiam_mm', 'swLegs', 'sr_mm', 'fywk_MPa',
    'colType', 'colSize', 'plateA_mm', 'plateB_mm', 'steelGrade', 'upnSize',
    'weldThroat_mm', 'edgeY_mm', 'edgeX_mm', 'warnings',
  ],
  properties: {
    mode: { type: ['string', 'null'], enum: [...MODES, null], description: 'Modo de cálculo: "pilar" (reacción de un pilar sobre la losa, con transferencia de momento), "carga-puntual" (carga puntual sobre la losa, sin momento) o "pilar-cruceta" (pilar metálico apoyado en una cruceta de perfiles UPN).' },
    position: { type: ['string', 'null'], enum: [...POSITIONS, null], description: 'Posición del soporte en la losa: "interior", "borde" (un borde libre) o "esquina" (dos bordes libres). Fija el coeficiente β y el perímetro crítico.' },
    isCircular: { type: ['boolean', 'null'], description: 'true si el soporte es de sección circular (entonces cx_mm es el DIÁMETRO). Solo tiene efecto en posición interior.' },
    cx_mm: { type: ['number', 'null'], description: 'Dimensión del pilar o del área cargada en dirección x, en mm (o el diámetro si es circular). En borde y esquina, cx es la dimensión PARALELA al borde libre.' },
    cy_mm: { type: ['number', 'null'], description: 'Dimensión del pilar o del área cargada en dirección y, en mm. En borde y esquina, cy es la dimensión PERPENDICULAR al borde libre (hacia el interior de la losa).' },
    d_mm: { type: ['number', 'null'], description: 'Canto ÚTIL de la losa en mm (de la fibra comprimida al centro de la armadura de tracción). En una losa de 25 cm con recubrimiento 4 cm son unos 200 mm.' },
    fck_MPa: { type: ['integer', 'null'], enum: [...availableFck, null], description: 'Resistencia característica del hormigón de la losa en MPa (HA-25 → 25).' },
    fyk_MPa: { type: ['number', 'null'], description: 'Límite elástico del acero de la armadura de flexión, en MPa (B500S → 500).' },
    barDiamSup_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'Diámetro de la malla de flexión de la cara SUPERIOR, en mm.' },
    sSup_mm: { type: ['number', 'null'], description: 'Separación entre barras de la malla superior, en mm.' },
    barDiamInf_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'Diámetro de la malla de flexión de la cara INFERIOR, en mm.' },
    sInf_mm: { type: ['number', 'null'], description: 'Separación entre barras de la malla inferior, en mm.' },
    VEd_kN: { type: ['number', 'null'], description: 'Esfuerzo de punzonamiento de cálculo en kN (ELU): la reacción del pilar, la carga puntual o el axil que baja por la cruceta.' },
    hasShearReinf: { type: ['boolean', 'null'], description: 'true si se disponen cercos de punzonamiento (armadura transversal tipo viga).' },
    swDiam_mm: { type: ['integer', 'null'], enum: [...SW_DIAMS, null], description: 'Diámetro de las barras del cerco, en mm. Solo con cercos.' },
    swLegs: { type: ['integer', 'null'], enum: [...SW_LEGS, null], description: 'Número de ramas de cerco cortadas por el perímetro de control. Solo con cercos.' },
    sr_mm: { type: ['number', 'null'], description: 'Separación radial entre perímetros sucesivos de cercos, en mm (debe ser ≤ 0.75·d). Solo con cercos.' },
    fywk_MPa: { type: ['number', 'null'], description: 'Límite elástico característico del acero de los cercos, en MPa. Solo con cercos.' },
    colType: { type: ['string', 'null'], enum: [...COL_TYPES, null], description: 'SOLO en modo cruceta: familia del perfil del pilar metálico (HEB, HEA o IPE).' },
    colSize: { type: ['integer', 'null'], description: 'SOLO en modo cruceta: designación del perfil del pilar (HEB 200 → 200).' },
    plateA_mm: { type: ['number', 'null'], description: 'SOLO en modo cruceta: ancho de la placa de testa (dirección x), en mm. La placa ES el área cargada del punzonamiento.' },
    plateB_mm: { type: ['number', 'null'], description: 'SOLO en modo cruceta: largo de la placa de testa (dirección y), en mm.' },
    steelGrade: { type: ['string', 'null'], enum: [...STEEL_GRADES, null], description: 'SOLO en modo cruceta: acero de la cruceta ("S275" o "S355").' },
    upnSize: { type: ['integer', 'null'], description: 'SOLO en modo cruceta: perfil UPN de los brazos (UPN 160 → 160).' },
    weldThroat_mm: { type: ['number', 'null'], description: 'SOLO en modo cruceta: espesor de garganta del cordón de soldadura, en mm (informativo).' },
    edgeY_mm: { type: ['number', 'null'], description: 'SOLO en modo cruceta y posición borde/esquina: distancia libre de la cara de la placa al borde libre de la losa, en mm.' },
    edgeX_mm: { type: ['number', 'null'], description: 'SOLO en modo cruceta y posición esquina: distancia libre al SEGUNDO borde libre, en mm.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Punzonamiento:
1. TODAS las longitudes van en MILÍMETROS (pilar, canto útil, separaciones, placa, bordes). Los enunciados dan el pilar en cm y la losa en cm: convierte y añade un warning.
2. d_mm es el canto ÚTIL de la losa, NO su espesor: d ≈ espesor − recubrimiento − φ/2 (una losa de 25 cm con recubrimiento de 4 cm tiene d ≈ 200 mm). Si el enunciado da el canto total, haz la estimación, dilo en un warning y ofrécele al usuario afinarla.
3. CONVENCIÓN DE BORDE Y ESQUINA (importante): cx es la dimensión del pilar PARALELA al borde libre y cy la PERPENDICULAR, hacia el interior de la losa. Si el enunciado no permite distinguirlas, pregunta en "reply".
4. Los tres modos: "pilar" es la reacción de un pilar con transferencia de momento (β = 1.15 en interior); "carga-puntual" es una carga sin momento (β = 1.0); "pilar-cruceta" es un pilar metálico sobre una cruceta de UPN. En modo cruceta el área cargada es LA PLACA de testa (plateA × plateB): el motor fuerza cx/cy a las dimensiones de la placa e ignora isCircular y los cercos, así que esos campos no se aplican. En los modos de losa, a la inversa, no se aplican los campos de la cruceta (placa, UPN, pilar metálico, bordes).
5. VEd_kN es el esfuerzo de CÁLCULO (ELU), ya mayorado.
6. La cuantía de flexión ρl sale del armado de la cara traccionada (Ø y separación) y el motor supone la MALLA IGUAL en las dos direcciones ortogonales.
7. En este módulo son DATOS del problema, no variables de diseño: el esfuerzo (VEd_kN), la posición del soporte en la losa (interior/borde/esquina — la fija el proyecto, no la comprobación) y, en la cruceta, las distancias reales a los bordes libres (edgeY_mm, edgeX_mm). Para que el punzonamiento cumpla actúa SIEMPRE sobre la RESISTENCIA: más canto útil (d_mm, lo más eficaz), más armadura de flexión (Ø mayor o menos separación), hormigón de más resistencia, un capitel o un pilar mayor, o cercos de punzonamiento (hasShearReinf). NUNCA rebajes VEd, ni "muevas" el pilar de esquina a interior, ni declares como carga puntual la reacción de un pilar (baja β de 1.15 a 1.0), para que salga el cálculo.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Punzonamiento de un pilar interior de 30×30 cm en una losa de 25 cm de canto '
  + '(d ≈ 20 cm) con HA-25, mallazo Ø12 cada 15 cm arriba. Reacción de cálculo 260 kN.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface PunchingPayload {
  mode: string | null;
  position: string | null;
  isCircular: boolean | null;
  cx_mm: number | null;
  cy_mm: number | null;
  d_mm: number | null;
  fck_MPa: number | null;
  fyk_MPa: number | null;
  barDiamSup_mm: number | null;
  sSup_mm: number | null;
  barDiamInf_mm: number | null;
  sInf_mm: number | null;
  VEd_kN: number | null;
  hasShearReinf: boolean | null;
  swDiam_mm: number | null;
  swLegs: number | null;
  sr_mm: number | null;
  fywk_MPa: number | null;
  colType: string | null;
  colSize: number | null;
  plateA_mm: number | null;
  plateB_mm: number | null;
  steelGrade: string | null;
  upnSize: number | null;
  weldThroat_mm: number | null;
  edgeY_mm: number | null;
  edgeX_mm: number | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function parsePayload(raw: unknown): PunchingPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    mode: stringOrNull(r.mode),
    position: stringOrNull(r.position),
    isCircular: boolOrNull(r.isCircular),
    cx_mm: finiteNumber(r.cx_mm),
    cy_mm: finiteNumber(r.cy_mm),
    d_mm: finiteNumber(r.d_mm),
    fck_MPa: finiteNumber(r.fck_MPa),
    fyk_MPa: finiteNumber(r.fyk_MPa),
    barDiamSup_mm: finiteNumber(r.barDiamSup_mm),
    sSup_mm: finiteNumber(r.sSup_mm),
    barDiamInf_mm: finiteNumber(r.barDiamInf_mm),
    sInf_mm: finiteNumber(r.sInf_mm),
    VEd_kN: finiteNumber(r.VEd_kN),
    hasShearReinf: boolOrNull(r.hasShearReinf),
    swDiam_mm: finiteNumber(r.swDiam_mm),
    swLegs: finiteNumber(r.swLegs),
    sr_mm: finiteNumber(r.sr_mm),
    fywk_MPa: finiteNumber(r.fywk_MPa),
    colType: stringOrNull(r.colType),
    colSize: finiteNumber(r.colSize),
    plateA_mm: finiteNumber(r.plateA_mm),
    plateB_mm: finiteNumber(r.plateB_mm),
    steelGrade: stringOrNull(r.steelGrade),
    upnSize: finiteNumber(r.upnSize),
    weldThroat_mm: finiteNumber(r.weldThroat_mm),
    edgeY_mm: finiteNumber(r.edgeY_mm),
    edgeX_mm: finiteNumber(r.edgeX_mm),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  mode: 'Modo de cálculo',
  position: 'Posición del soporte',
  isCircular: 'Soporte circular',
  cx_mm: 'Dimensión cx',
  cy_mm: 'Dimensión cy',
  d_mm: 'Canto útil d',
  fck_MPa: 'Hormigón fck',
  fyk_MPa: 'Acero de flexión fyk',
  barDiamSup_mm: 'Ø malla superior',
  sSup_mm: 'Separación malla superior',
  barDiamInf_mm: 'Ø malla inferior',
  sInf_mm: 'Separación malla inferior',
  VEd_kN: 'Esfuerzo VEd',
  hasShearReinf: 'Cercos de punzonamiento',
  swDiam_mm: 'Ø del cerco',
  swLegs: 'Nº de ramas',
  sr_mm: 'Separación radial sr',
  fywk_MPa: 'Acero de los cercos fywk',
  colType: 'Perfil del pilar (cruceta)',
  colSize: 'Tamaño del pilar (cruceta)',
  plateA_mm: 'Ancho de la placa a',
  plateB_mm: 'Largo de la placa b',
  steelGrade: 'Acero de la cruceta',
  upnSize: 'Perfil UPN',
  weldThroat_mm: 'Garganta de soldadura',
  edgeY_mm: 'Distancia al borde libre',
  edgeX_mm: 'Distancia al 2º borde',
} as const;

type PayloadKey = keyof typeof LABELS;

/** ORDER del contrato: `mode` → `position` → `isCircular` → `hasShearReinf` → resto. */
const KEY_ORDER: readonly PayloadKey[] = [
  'mode', 'position', 'isCircular', 'cx_mm', 'cy_mm', 'd_mm',
  'fck_MPa', 'fyk_MPa', 'barDiamSup_mm', 'sSup_mm', 'barDiamInf_mm', 'sInf_mm',
  'VEd_kN', 'hasShearReinf', 'swDiam_mm', 'swLegs', 'sr_mm', 'fywk_MPa',
  'colType', 'colSize', 'plateA_mm', 'plateB_mm', 'steelGrade', 'upnSize',
  'weldThroat_mm', 'edgeY_mm', 'edgeX_mm',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

const MODE_ES: Record<string, string> = {
  pilar: 'Pilar',
  'carga-puntual': 'Carga puntual',
  'pilar-cruceta': 'Cruceta',
};
const POSITION_ES: Record<string, string> = {
  interior: 'Interior',
  borde: 'Borde',
  esquina: 'Esquina',
};

/**
 * Campos que NO son variables de diseño. El canto útil, el armado, el hormigón,
 * el tamaño del soporte y los cercos SÍ lo son: subirlos es la salida legítima.
 *
 * Ordinales calibrados con el β real de `betaForPosition` (punching.ts):
 * - `position` → β: esquina 1.5 > borde 1.4 > interior 1.15. "Mover" el pilar
 *   hacia el interior rebaja la demanda un 23% sin tocar la losa.
 * - `mode` → β por transferencia de momento: 'pilar' y 'pilar-cruceta' transmiten
 *   momento (1.15 en interior); 'carga-puntual' no (1.0). Declarar carga puntual
 *   la reacción de un pilar rebaja la demanda un 13%.
 */
export const PUNCHING_SAFETY_RULES: ReadonlyArray<SafetyRule<PunchingInputs>> = [
  { field: 'VEd', confirmKey: 'VEd_kN', level: higherIsSafer, why: 'El esfuerzo de punzonamiento lo fija el análisis de la estructura: rebajarlo baja directamente la tensión vEd en el perímetro crítico.' },
  {
    field: 'position', // payload `position`: mismo nombre ⇒ sin confirmKey
    level: ordinalLevel({ esquina: 1.5, borde: 1.4, interior: 1.15 }),
    why: 'La posición del soporte en la losa la fija el proyecto: "moverlo" hacia el interior baja el coeficiente β de excentricidad y alarga el perímetro crítico, rebajando la demanda sin tocar la losa.',
  },
  {
    field: 'mode', // payload `mode`: mismo nombre ⇒ sin confirmKey
    level: ordinalLevel({ pilar: 1.15, 'pilar-cruceta': 1.15, 'carga-puntual': 1.0 }),
    why: 'Un pilar transfiere momento a la losa (β = 1.15) y una carga puntual no (β = 1.0): declarar carga puntual la reacción de un pilar rebaja la demanda un 13% sin cambiar nada de la obra.',
  },
  {
    // FUGA 4 (auditoría 2026-07-14): `isCircular` no tenía regla. Para un soporte
    // interior de lado c, el perímetro crítico rectangular es 2(cx+cy)+4πd = 4c+4πd
    // y el circular π(Ø+4d) = πc+4πd. Como πc < 4c, el perímetro circular es MENOR
    // ⇒ vEd = VEd/(u₁·d) es MAYOR ⇒ el caso circular es el conservador. Apagar el
    // interruptor en un pilar que ES circular alarga el perímetro y rebaja la
    // tensión sin tocar la losa.
    field: 'isCircular', // payload `isCircular`: mismo nombre ⇒ sin confirmKey
    level: trueIsSafer,
    why: 'La sección del soporte es la que es. Declarar rectangular un pilar CIRCULAR alarga el perímetro crítico (4c frente a πc) y rebaja la tensión de punzonamiento sin cambiar nada de la obra.',
  },
  {
    field: 'edgeY',
    confirmKey: 'edgeY_mm',
    level: lowerIsSafer, // peligroso AGRANDARLA
    why: 'La distancia al borde libre es una medida real del macizo: agrandarla da cabida a la cruceta sin que el borde se haya movido.',
  },
  {
    field: 'edgeX',
    confirmKey: 'edgeX_mm',
    level: lowerIsSafer,
    why: 'La distancia al segundo borde libre es una medida real del macizo: agrandarla da cabida a la cruceta sin que el borde se haya movido.',
  },
];

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtMm = (mm: number) => `${mm} mm`;

export const CRUCETA_INERT_REASON =
  'En modo cruceta el área cargada es la PLACA de testa: el motor fuerza las dimensiones del '
  + 'soporte y no admite cercos de punzonamiento, así que este campo no interviene.';

export const SLAB_INERT_REASON =
  'Los datos de la cruceta (pilar metálico, placa, UPN, soldadura y bordes) solo se usan en '
  + 'el modo "pilar-cruceta".';

export const CIRCULAR_POSITION_REASON =
  'El soporte circular solo se modela en posición interior: en borde y esquina el motor usa '
  + 'el perímetro rectangular.';

export const SHEAR_REINF_GATE_REASON =
  'Sin cercos de punzonamiento (hasShearReinf), este campo no interviene en el cálculo.';

export const EDGE_POSITION_REASON =
  'Las distancias a los bordes libres solo se usan en posición de borde (edgeY) o esquina '
  + '(edgeY y edgeX).';

function buildPunchingPlan(
  x: PunchingPayload,
  current: PunchingInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<PunchingInputs> {
  const fields: Partial<PunchingInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof PunchingInputs>(
    key: PayloadKey,
    field: K,
    value: PunchingInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  // --- mode PRIMERO (gate mayor: decide qué campos existen) ---
  if (x.mode !== null) {
    if (!MODES.includes(x.mode)) {
      skip('mode', `Modo "${x.mode}" desconocido (pilar, carga-puntual, pilar-cruceta)`);
    } else if (x.mode === current.mode) {
      skip('mode', ALREADY);
    } else {
      apply('mode', 'mode', x.mode as PunchingMode, MODE_ES[current.mode], MODE_ES[x.mode]);
    }
  }
  const modeFinal = (fields.mode ?? current.mode) as PunchingMode;
  const isCruceta = modeFinal === 'pilar-cruceta';

  // --- position (gate de isCircular y de los bordes) ---
  if (x.position !== null) {
    if (!POSITIONS.includes(x.position)) {
      skip('position', `Posición "${x.position}" desconocida (interior, borde, esquina)`);
    } else if (x.position === current.position) {
      skip('position', ALREADY);
    } else {
      apply(
        'position', 'position', x.position as PunchingPosition,
        POSITION_ES[current.position], POSITION_ES[x.position],
      );
    }
  }
  const positionFinal = (fields.position ?? current.position) as PunchingPosition;

  /** Longitud en mm con rango; ALREADY exacto. */
  function applyMm<K extends keyof PunchingInputs>(
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
    else apply(key, field, v as PunchingInputs[K], fmtMm(before), fmtMm(v));
  }

  // --- Geometría del soporte (inerte en cruceta: la fuerza la placa) ---
  if (x.isCircular !== null) {
    if (isCruceta) {
      skip('isCircular', CRUCETA_INERT_REASON);
    } else if (positionFinal !== 'interior') {
      skip('isCircular', CIRCULAR_POSITION_REASON);
    } else if (x.isCircular === current.isCircular) {
      skip('isCircular', ALREADY);
    } else {
      const fmt = (v: boolean) => (v ? 'Circular' : 'Rectangular');
      apply('isCircular', 'isCircular', x.isCircular, fmt(current.isCircular), fmt(x.isCircular));
    }
  }
  if (isCruceta) {
    if (x.cx_mm !== null) skip('cx_mm', CRUCETA_INERT_REASON);
    if (x.cy_mm !== null) skip('cy_mm', CRUCETA_INERT_REASON);
  } else {
    applyMm('cx_mm', 'cx', x.cx_mm, 50, 5000);
    applyMm('cy_mm', 'cy', x.cy_mm, 50, 5000);
  }

  // --- Losa: canto útil, materiales y armado de flexión ---
  applyMm('d_mm', 'd', x.d_mm, 20, 2000);

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
    if (x.fyk_MPa < 200 || x.fyk_MPa > 700) {
      skip('fyk_MPa', rangeReason(x.fyk_MPa, 200, 700, 'MPa'));
    } else {
      const v = round2(x.fyk_MPa);
      if (Math.abs(v - current.fyk) <= EPS) skip('fyk_MPa', ALREADY);
      else apply('fyk_MPa', 'fyk', v, `${current.fyk} MPa`, `${v} MPa`);
    }
  }

  function applyBarDiam(key: 'barDiamSup_mm' | 'barDiamInf_mm', field: 'barDiamSup' | 'barDiamInf', value: number | null): void {
    if (value === null) return;
    // La malla inferior no interviene en el punzonamiento de la cruceta (el
    // motor comprueba la placa con la cara superior).
    if (isCruceta && field === 'barDiamInf') {
      skip(key, CRUCETA_INERT_REASON);
      return;
    }
    if (!availableBarDiams.includes(value)) {
      skip(key, `Ø${value} no es un diámetro del catálogo (Ø${availableBarDiams.join(', Ø')})`);
    } else if (value === current[field]) {
      skip(key, ALREADY);
    } else {
      apply(key, field, value, `Ø${current[field]} mm`, `Ø${value} mm`);
    }
  }
  applyBarDiam('barDiamSup_mm', 'barDiamSup', x.barDiamSup_mm);
  applyMm('sSup_mm', 'sSup', x.sSup_mm, 20, 1000);
  applyBarDiam('barDiamInf_mm', 'barDiamInf', x.barDiamInf_mm);
  if (isCruceta && x.sInf_mm !== null) skip('sInf_mm', CRUCETA_INERT_REASON);
  else applyMm('sInf_mm', 'sInf', x.sInf_mm, 20, 1000);

  // --- Esfuerzo ---
  if (x.VEd_kN !== null) {
    if (x.VEd_kN <= 0 || x.VEd_kN > 100000) {
      skip('VEd_kN', rangeReason(x.VEd_kN, 1, 100000, 'kN'));
    } else {
      const v = round2(x.VEd_kN);
      if (Math.abs(v - current.VEd) <= EPS) skip('VEd_kN', ALREADY);
      else apply('VEd_kN', 'VEd', v, formatQuantity(current.VEd, 'force', system), formatQuantity(v, 'force', system));
    }
  }

  // --- Cercos de punzonamiento (inertes en cruceta) ---
  if (x.hasShearReinf !== null) {
    if (isCruceta) {
      skip('hasShearReinf', CRUCETA_INERT_REASON);
    } else if (x.hasShearReinf === current.hasShearReinf) {
      skip('hasShearReinf', ALREADY);
    } else {
      const fmt = (v: boolean) => (v ? 'Con cercos' : 'Sin cercos');
      apply('hasShearReinf', 'hasShearReinf', x.hasShearReinf, fmt(current.hasShearReinf), fmt(x.hasShearReinf));
    }
  }
  const shearFinal = isCruceta ? false : ((fields.hasShearReinf ?? current.hasShearReinf) as boolean);

  /** Campos de cerco: inertes en cruceta y sin cercos activos. */
  function shearGate(key: PayloadKey, value: unknown): boolean {
    if (value === null) return false;
    if (isCruceta) {
      skip(key, CRUCETA_INERT_REASON);
      return false;
    }
    if (!shearFinal) {
      skip(key, SHEAR_REINF_GATE_REASON);
      return false;
    }
    return true;
  }
  if (shearGate('swDiam_mm', x.swDiam_mm)) {
    const v = x.swDiam_mm as number;
    if (!SW_DIAMS.includes(v)) skip('swDiam_mm', `Ø${v} no está entre los diámetros de cerco (Ø${SW_DIAMS.join(', Ø')})`);
    else if (v === current.swDiam) skip('swDiam_mm', ALREADY);
    else apply('swDiam_mm', 'swDiam', v, `Ø${current.swDiam} mm`, `Ø${v} mm`);
  }
  if (shearGate('swLegs', x.swLegs)) {
    const v = x.swLegs as number;
    if (!SW_LEGS.includes(v)) skip('swLegs', `${v} ramas no está entre las opciones (${SW_LEGS.join(', ')})`);
    else if (v === current.swLegs) skip('swLegs', ALREADY);
    else apply('swLegs', 'swLegs', v, `${current.swLegs} ramas`, `${v} ramas`);
  }
  if (shearGate('sr_mm', x.sr_mm)) applyMm('sr_mm', 'sr', x.sr_mm, 20, 1000);
  if (shearGate('fywk_MPa', x.fywk_MPa)) {
    const v = x.fywk_MPa as number;
    if (v < 200 || v > 700) skip('fywk_MPa', rangeReason(v, 200, 700, 'MPa'));
    else if (Math.abs(v - current.fywk) <= EPS) skip('fywk_MPa', ALREADY);
    else apply('fywk_MPa', 'fywk', round2(v), `${current.fywk} MPa`, `${round2(v)} MPa`);
  }

  // --- Bloque cruceta (inerte en los modos de losa) ---
  /** Campos de cruceta: solo con mode='pilar-cruceta' final. */
  function crucetaGate(key: PayloadKey, value: unknown): boolean {
    if (value === null) return false;
    if (!isCruceta) {
      skip(key, SLAB_INERT_REASON);
      return false;
    }
    return true;
  }

  if (crucetaGate('colType', x.colType)) {
    const v = x.colType as string;
    if (!COL_TYPES.includes(v)) skip('colType', `Perfil "${v}" no disponible en la cruceta (HEB, HEA, IPE)`);
    else if (v === current.colType) skip('colType', ALREADY);
    else apply('colType', 'colType', v as CrucetaColType, current.colType, v);
  }
  const colTypeFinal = (fields.colType ?? current.colType) as CrucetaColType;

  if (crucetaGate('colSize', x.colSize)) {
    const v = x.colSize as number;
    const catalog = getSizesForTipo(colTypeFinal);
    if (!catalog.includes(v)) {
      skip('colSize', `${colTypeFinal} ${v} no está en el catálogo (${catalog.join(', ')})`);
    } else if (v === current.colSize && fields.colType === undefined) {
      skip('colSize', ALREADY);
    } else {
      apply('colSize', 'colSize', v, `${current.colType} ${current.colSize}`, `${colTypeFinal} ${v}`);
    }
  }
  if (crucetaGate('plateA_mm', x.plateA_mm)) applyMm('plateA_mm', 'plateA', x.plateA_mm, 50, 2000);
  if (crucetaGate('plateB_mm', x.plateB_mm)) applyMm('plateB_mm', 'plateB', x.plateB_mm, 50, 2000);
  if (crucetaGate('steelGrade', x.steelGrade)) {
    const v = x.steelGrade as string;
    if (!STEEL_GRADES.includes(v)) skip('steelGrade', `Acero "${v}" no disponible (S275, S355)`);
    else if (v === current.steelGrade) skip('steelGrade', ALREADY);
    else apply('steelGrade', 'steelGrade', v as CrucetaSteel, current.steelGrade, v);
  }
  if (crucetaGate('upnSize', x.upnSize)) {
    const v = x.upnSize as number;
    const catalog = getSizesUPN();
    if (!catalog.includes(v)) skip('upnSize', `UPN ${v} no está en el catálogo (${catalog.join(', ')})`);
    else if (v === current.upnSize) skip('upnSize', ALREADY);
    else apply('upnSize', 'upnSize', v, `UPN ${current.upnSize}`, `UPN ${v}`);
  }
  if (crucetaGate('weldThroat_mm', x.weldThroat_mm)) applyMm('weldThroat_mm', 'weldThroat', x.weldThroat_mm, 2, 50);

  // --- Bordes libres: cruceta + posición ---
  if (crucetaGate('edgeY_mm', x.edgeY_mm)) {
    if (positionFinal === 'interior') skip('edgeY_mm', EDGE_POSITION_REASON);
    else applyMm('edgeY_mm', 'edgeY', x.edgeY_mm, 1, 10000);
  }
  if (crucetaGate('edgeX_mm', x.edgeX_mm)) {
    if (positionFinal !== 'esquina') skip('edgeX_mm', EDGE_POSITION_REASON);
    else applyMm('edgeX_mm', 'edgeX', x.edgeX_mm, 1, 10000);
  }

  // --- notFound ---
  const values: Record<PayloadKey, unknown> = {
    mode: x.mode, position: x.position, isCircular: x.isCircular,
    cx_mm: x.cx_mm, cy_mm: x.cy_mm, d_mm: x.d_mm,
    fck_MPa: x.fck_MPa, fyk_MPa: x.fyk_MPa,
    barDiamSup_mm: x.barDiamSup_mm, sSup_mm: x.sSup_mm,
    barDiamInf_mm: x.barDiamInf_mm, sInf_mm: x.sInf_mm,
    VEd_kN: x.VEd_kN, hasShearReinf: x.hasShearReinf,
    swDiam_mm: x.swDiam_mm, swLegs: x.swLegs, sr_mm: x.sr_mm, fywk_MPa: x.fywk_MPa,
    colType: x.colType, colSize: x.colSize,
    plateA_mm: x.plateA_mm, plateB_mm: x.plateB_mm,
    steelGrade: x.steelGrade, upnSize: x.upnSize, weldThroat_mm: x.weldThroat_mm,
    edgeY_mm: x.edgeY_mm, edgeX_mm: x.edgeX_mm,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = detectSafetyRisks(
    PUNCHING_SAFETY_RULES, changes, fields, current, punchingDefaults, confirmed,
  );
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

type StateKey = Exclude<keyof PunchingInputs, 'title' | 'plateT'>;

const SNAPSHOT_FIELDS: Readonly<Record<PayloadKey, StateKey>> = {
  mode: 'mode',
  position: 'position',
  isCircular: 'isCircular',
  cx_mm: 'cx',
  cy_mm: 'cy',
  d_mm: 'd',
  fck_MPa: 'fck',
  fyk_MPa: 'fyk',
  barDiamSup_mm: 'barDiamSup',
  sSup_mm: 'sSup',
  barDiamInf_mm: 'barDiamInf',
  sInf_mm: 'sInf',
  VEd_kN: 'VEd',
  hasShearReinf: 'hasShearReinf',
  swDiam_mm: 'swDiam',
  swLegs: 'swLegs',
  sr_mm: 'sr',
  fywk_MPa: 'fywk',
  colType: 'colType',
  colSize: 'colSize',
  plateA_mm: 'plateA',
  plateB_mm: 'plateB',
  steelGrade: 'steelGrade',
  upnSize: 'upnSize',
  weldThroat_mm: 'weldThroat',
  edgeY_mm: 'edgeY',
  edgeX_mm: 'edgeX',
};

function buildSnapshot(c: PunchingInputs): string {
  const valores: Record<string, number | string | boolean> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    valores[key] = value;
    if (value === punchingDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/**
 * Resume el resultado del motor de punzonamiento. OJO al `valid` divergente de
 * este módulo (`valid = ningún check en fail`): el discriminador de cálculo no
 * válido es `error != null` — un punzonamiento que INCUMPLE tiene `valid:false`
 * SIN error y debe resumirse como 'fail', no como 'invalid'.
 *
 * Las filas neutral (`punz-beta-note`, `punz-layout-note`) ya las agrega
 * `summarizeCalcResults` en la línea de informativas.
 */
export function summarizePunchingResults(r: PunchingResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(r);
  const extras = [
    `Perímetros: u0 = ${r.u0.toFixed(0)} mm (cara del soporte) · u1 = ${r.u1.toFixed(0)} mm (a 2d) · `
      + `β = ${r.beta.toFixed(2)}`,
    `Tensiones: vEd = ${r.vEd.toFixed(3)} MPa frente a vRd,c = ${r.vRdc.toFixed(3)} MPa`
      + (r.vRdcs !== undefined ? ` y vRd,cs = ${r.vRdcs.toFixed(3)} MPa (con cercos)` : ''),
    `Cuantía de flexión ρl = ${(r.rhoL * 100).toFixed(3)}%`
      + (r.rhoLClamped ? ' (POR DEBAJO del mínimo ρl,min)' : ''),
    `Perímetro sin necesidad de cercos: uout = ${r.uout.toFixed(0)} mm`,
  ];
  if (r.cruceta) {
    extras.push(
      `Cruceta: UPN ${r.cruceta.upnSize} ${r.cruceta.steelGrade} clase ${r.cruceta.upnClass} — `
      + `M_Rd = ${r.cruceta.MRd.toFixed(1)} kNm · Vpl,Rd = ${r.cruceta.VplRd.toFixed(0)} kN `
      + `(${r.cruceta.nArms} brazos). El REPARTO de la cruceta lo verifica el ingeniero a mano: `
      + 'el punzonamiento mostrado es el de la placa sola (conservador).',
    );
  }
  return summarizeCalcResults(r, extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const punchingAdapter: AiModuleAdapter<PunchingInputs> = {
  id: 'punching',
  label: 'Punzonamiento',
  payloadSchema: PUNCHING_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildPunchingPlan(parsePayload(payload), current, system, confirmed),
};
