/**
 * Adapter del asistente IA para el módulo Cimentación/Micropilotes (ola 3 —
 * fases A+B: escalares Y estratigrafía).
 *
 * El estado del módulo es MIXTO: los escalares viven en useModuleState y los
 * estratos (`SoilLayer[]`) en un localStorage propio orquestado por la
 * feature. El adapter tipa sobre el COMBINADO `MicropilesAiInputs` — la
 * feature pasa `current = {...state, soil}` y su `handleAiApply` separa:
 * escalares por `setField`, `soil` por `setSoil` (reemplazo completo).
 *
 * Convención nº 1 del módulo (y de su prompt): las profundidades se miden
 * DESDE LA RASANTE, POSITIVAS hacia abajo, y el perfil de estratos debe
 * cubrir desde la rasante hasta la punta (Σespesores ≥ toeDepth).
 *
 * Los estratos son DATO GEOTÉCNICO: cualquier cambio que mejore el terreno
 * (subir c/φ/su/rflim/γ/NSPT) sobre un perfil ya establecido se marca como
 * riesgo vía detectElementRisks — aquí γ con dirección OPUESTA a taludes
 * (más γ ⇒ más σ'v ⇒ más rozamiento por fuste).
 */
import { AiError } from '../types';
import type {
  AiApplyPlan,
  AiFieldChange,
  AiModuleAdapter,
  AiSkippedField,
} from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectElementRisks,
  detectSafetyRisks,
  higherIsSafer,
  lowerIsSafer,
  offIsUnsafe,
  ordinalLevel,
  zeroIsOff,
  unfactoredIsSafer,
  type ElementSafetyRule,
  type SafetyRule,
} from '../safety';
import type { MicropilesResult } from '../../calculations/micropiles';
import {
  micropilesDefaults,
  micropilesSoilDefaults,
  type MicropilesInputs,
  type SoilLayer,
} from '../../../data/defaults';
import {
  CORROSION_OPTIONS,
  DESIGN_LIFE_OPTIONS,
  EXECUTION_OPTIONS,
  GROUT_OPTIONS,
  type ApplicationType,
  type ConnectionType,
  type CorrosionEnv,
  type DesignLifeYears,
  type Duration,
  type EffortType,
  type ExecutionType,
  type GroutType,
  type SoilType,
} from '../../../data/micropileLookups';
import { CUSTOM_TUBE_SENTINEL, MICROPILE_TUBES } from '../../../data/micropileTubes';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

/** Estado combinado que ve el asistente: escalares + estratigrafía. */
export interface MicropilesAiInputs extends MicropilesInputs {
  soil: SoilLayer[];
}

/** Defaults del combinado (los tests y el gate de fábrica comparan contra esto). */
export const micropilesAiDefaults: MicropilesAiInputs = {
  ...micropilesDefaults,
  soil: micropilesSoilDefaults,
};

// ── Catálogos del módulo ──────────────────────────────────────────────────────

const EFFORTS = ['compression', 'tension', 'compression+tension'] as const;
const METHODS = ['theoretical', 'empirical'] as const;
const GROUTS = ['lechada', 'mortero'] as const;
const EXECUTIONS = EXECUTION_OPTIONS.map((o) => o.key);
const CORROSIONS = CORROSION_OPTIONS.map((o) => o.key);
const DESIGN_LIVES = DESIGN_LIFE_OPTIONS.map((o) => o.key);
const CONNECTIONS = ['no-loss', 'other'] as const;
const APPLICATIONS = ['new', 'existing'] as const;
const DURATIONS = ['short', 'long'] as const;
const SOIL_TYPES = ['granular', 'cohesive'] as const;
const CONCRETE_GRADES = [25, 30, 35] as const;
/** Labels EXACTOS del catálogo PIRESA + sentinel custom. */
const TUBES = [...MICROPILE_TUBES.map((t) => t.label), CUSTOM_TUBE_SENTINEL] as const;

// ── Payload schema ────────────────────────────────────────────────────────────

export const MICROPILES_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'topDepth_m', 'toeDepth_m', 'drillDiameter_mm', 'waterTableDepth_m',
    'injectionPressure_kPa', 'designLoad_kN', 'effort', 'method', 'groutType',
    'concreteGrade_MPa', 'tube', 'customTubeDe_mm', 'customTubeE_mm', 'steelGrade_MPa',
    'execution', 'corrosionEnv', 'designLifeYears', 'connection', 'application', 'duration',
    'crManualOverride', 'CR', 'coverManualOverride', 'structuralCover_mm',
    'baseMoment_kNm', 'baseShear_kN', 'soilModulusTop_kNm2', 'soilModulusEmbed_kNm2',
    'soil', 'warnings',
  ],
  properties: {
    topDepth_m: { type: ['number', 'null'], description: 'Profundidad de la CABEZA del micropilote en m, DESDE LA RASANTE y positiva hacia abajo (cabeza enterrada 1 m → 1).' },
    toeDepth_m: { type: ['number', 'null'], description: 'Profundidad de la PUNTA en m desde la rasante (positiva hacia abajo, mayor que la cabeza).' },
    drillDiameter_mm: { type: ['integer', 'null'], description: 'Diámetro de perforación del barreno Dn en mm.' },
    waterTableDepth_m: { type: ['number', 'null'], description: 'Profundidad del nivel freático en m desde la rasante (positiva hacia abajo; menor que la cabeza = NF sobre la cabeza).' },
    injectionPressure_kPa: { type: ['number', 'null'], description: 'Presión de inyección en kPa.' },
    designLoad_kN: { type: ['number', 'null'], description: 'Carga de cálculo Nc,d en kN.' },
    effort: { type: ['string', 'null'], enum: [...EFFORTS, null], description: 'Tipo de esfuerzo: compression, tension o compression+tension.' },
    method: { type: ['string', 'null'], enum: [...METHODS, null], description: 'Método de cálculo del fuste: theoretical (teórico) o empirical (rozamiento límite rflim de los estratos).' },
    groutType: { type: ['string', 'null'], enum: [...GROUTS, null], description: 'Material inyectado: lechada o mortero (fija el recubrimiento mínimo, Guía Tabla 2.3).' },
    concreteGrade_MPa: { type: ['integer', 'null'], enum: [...CONCRETE_GRADES, null], description: 'Resistencia de la lechada/mortero en MPa (HA-25/30/35 → 25/30/35).' },
    tube: { type: ['string', 'null'], enum: [...TUBES, null], description: 'Armadura tubular del catálogo PIRESA (usa el label EXACTO, p. ej. "Ø88,9 × 9 mm") o "custom" para diámetro/espesor personalizados.' },
    customTubeDe_mm: { type: ['number', 'null'], description: 'Diámetro exterior del tubo personalizado en mm. SOLO con tube="custom".' },
    customTubeE_mm: { type: ['number', 'null'], description: 'Espesor de pared del tubo personalizado en mm. SOLO con tube="custom".' },
    steelGrade_MPa: { type: ['number', 'null'], description: 'Límite elástico fy del acero del tubo en N/mm² (PIRESA típico 551).' },
    execution: { type: ['string', 'null'], enum: [...EXECUTIONS, null], description: 'Tipo de terreno y perforación (Guía Tabla 3.5): wt-above-no-casing-no-mud (NF sobre punta, sin revestir), wt-below-no-casing-no-mud, with-mud (con lodos), casing-recoverable (revestimiento recuperable), casing-lost (camisa perdida).' },
    corrosionEnv: { type: ['string', 'null'], enum: [...CORROSIONS, null], description: 'Entorno de corrosión (Guía Tabla 2.4): natural-undisturbed, natural-contaminated-industrial, natural-aggressive-peat, fill-non-aggressive-loose, fill-aggressive-loose.' },
    designLifeYears: { type: ['integer', 'null'], enum: [...DESIGN_LIVES, null], description: 'Vida útil de proyecto en años (5/25/50/75/100).' },
    connection: { type: ['string', 'null'], enum: [...CONNECTIONS, null], description: 'Unión tubo-encepado: no-loss (sin pérdida) u other (otros, reduce a la mitad la contribución del acero en tracción).' },
    application: { type: ['string', 'null'], enum: [...APPLICATIONS, null], description: 'Aplicación: new (obra nueva, Fc=Fφ=1.5) o existing (recalce de cimentación existente, 1.2).' },
    duration: { type: ['string', 'null'], enum: [...DURATIONS, null], description: 'Duración de la carga: short (≤ 6 meses, provisional) o long (> 6 meses, permanente).' },
    crManualOverride: { type: ['boolean', 'null'], description: 'false = el coeficiente de pandeo CR lo determina el programa de la estratigrafía (lo normal); true = usar el CR manual del campo CR.' },
    CR: { type: ['number', 'null'], description: 'Coeficiente CR de pandeo manual (R = 1.07 − 0.027·CR). SOLO con crManualOverride=true.' },
    coverManualOverride: { type: ['boolean', 'null'], description: 'false = recubrimiento estructural automático r=(Dn−de)/2 (la lechada llena el barreno, lo normal); true = usar structuralCover_mm manual.' },
    structuralCover_mm: { type: ['number', 'null'], description: 'Recubrimiento estructural r manual en mm. SOLO con coverManualOverride=true.' },
    baseMoment_kNm: { type: ['number', 'null'], description: 'Momento de cálculo Md en cabeza, en kNm (empujes horizontales; 0 = sin flexión).' },
    baseShear_kN: { type: ['number', 'null'], description: 'Cortante de cálculo Vd en cabeza, en kN.' },
    soilModulusTop_kNm2: { type: ['number', 'null'], description: 'Módulo de deformación del terreno en cabeza E₀ en kN/m².' },
    soilModulusEmbed_kNm2: { type: ['number', 'null'], description: 'Módulo de deformación del terreno del empotramiento EL en kN/m².' },
    soil: {
      type: ['array', 'null'],
      description: 'Estratigrafía COMPLETA de arriba hacia abajo, con espesores medidos desde la rasante (el primer estrato empieza en la superficie). REEMPLAZA la lista entera: incluye SIEMPRE todos los estratos; la suma de espesores debe cubrir hasta la punta. null = sin cambio.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'thickness_m', 'gamma_kNm3', 'c_kPa', 'phi_deg', 'su_kPa', 'Nspt', 'rflim_MPa', 'Cu'],
        properties: {
          type: { type: 'string', enum: [...SOIL_TYPES], description: 'granular o cohesive.' },
          thickness_m: { type: 'number', description: 'Espesor del estrato en m.' },
          gamma_kNm3: { type: 'number', description: 'Peso específico γ en kN/m³.' },
          c_kPa: { type: ['number', 'null'], description: "Cohesión efectiva c' en kPa (solo cohesivos; null → 0)." },
          phi_deg: { type: ['number', 'null'], description: 'Ángulo de rozamiento interno φ en grados (null → 0).' },
          su_kPa: { type: ['number', 'null'], description: 'Resistencia al corte sin drenaje su en kN/m² (solo cohesivos; null → 0).' },
          Nspt: { type: ['integer', 'null'], description: 'Golpeo NSPT (informativo; null → 0).' },
          rflim_MPa: { type: ['number', 'null'], description: 'Rozamiento límite empírico rflim en MPa (necesario para el método empírico; null → 0).' },
          Cu: { type: ['number', 'null'], description: 'Coeficiente de uniformidad Cu=D60/D10 (solo granulares, para el pandeo; null = sin dato).' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Micropilotes:
1. CONVENCIÓN DE PROFUNDIDADES: todas (cabeza topDepth_m, punta toeDepth_m, nivel freático waterTableDepth_m) se miden DESDE LA RASANTE, POSITIVAS hacia abajo — como las entrega el estudio geotécnico. "Cabeza a 1 m bajo rasante y punta a 17 m" → topDepth_m 1, toeDepth_m 17. Si el enunciado usa cotas (positivas hacia arriba), conviértelas y añade un warning.
2. El campo "soil" REEMPLAZA la estratigrafía ENTERA: incluye siempre TODOS los estratos de arriba hacia abajo, empezando en la superficie (rasante), y con espesores cuya suma cubra al menos hasta la punta (toeDepth_m). El terreno por encima de la cabeza también cuenta (aporta tensión vertical).
3. Coherencia de estrato: en granulares c_kPa y su_kPa son 0 (la app los fuerza); en cohesivos Cu no aplica. rflim_MPa solo hace falta con method="empirical".
4. El tubo se elige del catálogo PIRESA con su label EXACTO (p. ej. "Ø88,9 × 9 mm", con coma decimal) o tube="custom" con customTubeDe_mm/customTubeE_mm. No inventes medidas que no estén en el catálogo sin marcar custom.
5. CR y el recubrimiento estructural son AUTOMÁTICOS por defecto (crManualOverride/coverManualOverride en false): el programa los deriva de la estratigrafía y la geometría. Solo propon el modo manual si el usuario lo pide expresamente o su enunciado da el valor.
6. Unidades: profundidades y espesores en m; Dn, tubo y recubrimiento en mm; presión en kPa; cargas en kN/kNm; módulos E en kN/m²; γ en kN/m³; c/su en kPa; rflim en MPa.
7. En este módulo son DATOS del problema, no variables de diseño: la carga (designLoad_kN, baseMoment_kNm, baseShear_kN), TODO el terreno (los estratos con c/φ/su/γ/rflim/NSPT, el nivel freático, los módulos E₀/EL — los fija el estudio geotécnico), el entorno de corrosión, la vida útil, la aplicación y la duración. Para que el micropilote cumpla actúa sobre el DISEÑO: más longitud (punta más profunda), mayor diámetro de perforación, tubo de más capacidad, mejor lechada. NUNCA mejores un dato del terreno, rebajes una carga, acortes la vida útil ni relajes el entorno de corrosión para que salga el cálculo.
8. La ejecución (execution) y la unión (connection) describen cómo se CONSTRUIRÁ: pregúntalas si faltan, no las elijas tú por conveniencia del cálculo.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Micropilote con cabeza a 1 m y punta a 17 m bajo rasante, barreno de 185 mm, tubo '
  + 'Ø88,9 × 9 mm, Nc,d = 350 kN en compresión. NF a 7,5 m. Terreno: 3,3 m de arenas '
  + '(γ=19, φ=20º) sobre arcillas (γ=20, rflim=0,08 MPa).';

// ── Parseo defensivo ──────────────────────────────────────────────────────────

interface SoilPayload {
  type: SoilType | null;
  thickness_m: number | null;
  gamma_kNm3: number | null;
  c_kPa: number | null;
  phi_deg: number | null;
  su_kPa: number | null;
  Nspt: number | null;
  rflim_MPa: number | null;
  Cu: number | null;
}

interface MicropilesPayload {
  topDepth_m: number | null;
  toeDepth_m: number | null;
  drillDiameter_mm: number | null;
  waterTableDepth_m: number | null;
  injectionPressure_kPa: number | null;
  designLoad_kN: number | null;
  effort: EffortType | null;
  method: 'theoretical' | 'empirical' | null;
  groutType: GroutType | null;
  concreteGrade_MPa: number | null;
  tube: string | null;
  customTubeDe_mm: number | null;
  customTubeE_mm: number | null;
  steelGrade_MPa: number | null;
  execution: ExecutionType | null;
  corrosionEnv: CorrosionEnv | null;
  designLifeYears: number | null;
  connection: ConnectionType | null;
  application: ApplicationType | null;
  duration: Duration | null;
  crManualOverride: boolean | null;
  CR: number | null;
  coverManualOverride: boolean | null;
  structuralCover_mm: number | null;
  baseMoment_kNm: number | null;
  baseShear_kN: number | null;
  soilModulusTop_kNm2: number | null;
  soilModulusEmbed_kNm2: number | null;
  soil: SoilPayload[] | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function oneOf<T extends string | number>(v: unknown, allowed: readonly T[]): T | null {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function parseSoil(raw: unknown): SoilPayload {
  const r = (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
    ? (raw as Record<string, unknown>)
    : {};
  return {
    type: oneOf(r.type, SOIL_TYPES),
    thickness_m: finiteNumber(r.thickness_m),
    gamma_kNm3: finiteNumber(r.gamma_kNm3),
    c_kPa: finiteNumber(r.c_kPa),
    phi_deg: finiteNumber(r.phi_deg),
    su_kPa: finiteNumber(r.su_kPa),
    Nspt: finiteNumber(r.Nspt),
    rflim_MPa: finiteNumber(r.rflim_MPa),
    Cu: finiteNumber(r.Cu),
  };
}

function parsePayload(raw: unknown): MicropilesPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    topDepth_m: finiteNumber(r.topDepth_m),
    toeDepth_m: finiteNumber(r.toeDepth_m),
    drillDiameter_mm: finiteNumber(r.drillDiameter_mm),
    waterTableDepth_m: finiteNumber(r.waterTableDepth_m),
    injectionPressure_kPa: finiteNumber(r.injectionPressure_kPa),
    designLoad_kN: finiteNumber(r.designLoad_kN),
    effort: oneOf(r.effort, EFFORTS),
    method: oneOf(r.method, METHODS),
    groutType: oneOf(r.groutType, GROUTS),
    concreteGrade_MPa: finiteNumber(r.concreteGrade_MPa),
    tube: oneOf(r.tube, TUBES),
    customTubeDe_mm: finiteNumber(r.customTubeDe_mm),
    customTubeE_mm: finiteNumber(r.customTubeE_mm),
    steelGrade_MPa: finiteNumber(r.steelGrade_MPa),
    execution: oneOf(r.execution, EXECUTIONS),
    corrosionEnv: oneOf(r.corrosionEnv, CORROSIONS),
    designLifeYears: finiteNumber(r.designLifeYears),
    connection: oneOf(r.connection, CONNECTIONS),
    application: oneOf(r.application, APPLICATIONS),
    duration: oneOf(r.duration, DURATIONS),
    crManualOverride: bool(r.crManualOverride),
    CR: finiteNumber(r.CR),
    coverManualOverride: bool(r.coverManualOverride),
    structuralCover_mm: finiteNumber(r.structuralCover_mm),
    baseMoment_kNm: finiteNumber(r.baseMoment_kNm),
    baseShear_kN: finiteNumber(r.baseShear_kN),
    soilModulusTop_kNm2: finiteNumber(r.soilModulusTop_kNm2),
    soilModulusEmbed_kNm2: finiteNumber(r.soilModulusEmbed_kNm2),
    soil: Array.isArray(r.soil) ? r.soil.map(parseSoil) : null,
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Labels y orden ────────────────────────────────────────────────────────────

const LABELS = {
  topDepth_m: 'Profundidad de cabeza',
  toeDepth_m: 'Profundidad de punta',
  drillDiameter_mm: 'Diámetro de perforación Dn',
  waterTableDepth_m: 'Nivel freático',
  injectionPressure_kPa: 'Presión de inyección',
  designLoad_kN: 'Carga de cálculo Nc,d',
  effort: 'Tipo de esfuerzo',
  method: 'Método de cálculo',
  groutType: 'Material inyectado',
  concreteGrade_MPa: 'Lechada/mortero',
  tube: 'Armadura tubular',
  customTubeDe_mm: 'Ø exterior del tubo custom',
  customTubeE_mm: 'Espesor del tubo custom',
  steelGrade_MPa: 'Acero del tubo fy',
  execution: 'Ejecución',
  corrosionEnv: 'Entorno de corrosión',
  designLifeYears: 'Vida útil',
  connection: 'Unión tubo-encepado',
  application: 'Aplicación',
  duration: 'Duración de la carga',
  crManualOverride: 'Modo del CR de pandeo',
  CR: 'CR de pandeo manual',
  coverManualOverride: 'Modo del recubrimiento',
  structuralCover_mm: 'Recubrimiento estructural r',
  baseMoment_kNm: 'Momento en cabeza Md',
  baseShear_kN: 'Cortante en cabeza Vd',
  soilModulusTop_kNm2: 'Módulo del terreno E₀',
  soilModulusEmbed_kNm2: 'Módulo del empotramiento EL',
  soil: 'Estratigrafía',
} as const;

type PayloadKey = keyof typeof LABELS;

const KEY_ORDER: readonly PayloadKey[] = [
  'topDepth_m', 'toeDepth_m', 'drillDiameter_mm', 'waterTableDepth_m',
  'injectionPressure_kPa', 'designLoad_kN', 'effort', 'method', 'groutType',
  'concreteGrade_MPa', 'tube', 'customTubeDe_mm', 'customTubeE_mm', 'steelGrade_MPa',
  'execution', 'corrosionEnv', 'designLifeYears', 'connection', 'application', 'duration',
  'crManualOverride', 'CR', 'coverManualOverride', 'structuralCover_mm',
  'baseMoment_kNm', 'baseShear_kN', 'soilModulusTop_kNm2', 'soilModulusEmbed_kNm2',
  'soil',
];

const EXECUTION_LABELS = Object.fromEntries(EXECUTION_OPTIONS.map((o) => [o.key, o.label])) as Record<ExecutionType, string>;
const CORROSION_LABELS = Object.fromEntries(CORROSION_OPTIONS.map((o) => [o.key, o.label])) as Record<CorrosionEnv, string>;
const DESIGN_LIFE_LABELS = Object.fromEntries(DESIGN_LIFE_OPTIONS.map((o) => [o.key, o.label])) as Record<DesignLifeYears, string>;
const GROUT_LABELS = Object.fromEntries(GROUT_OPTIONS.map((o) => [o.key, o.label])) as Record<GroutType, string>;
const EFFORT_LABELS: Record<EffortType, string> = {
  compression: 'Compresión',
  tension: 'Tracción',
  'compression+tension': 'Compresión + tracción',
};
const METHOD_LABELS: Record<'theoretical' | 'empirical', string> = {
  theoretical: 'Teórico',
  empirical: 'Empírico',
};
const CONNECTION_LABELS: Record<ConnectionType, string> = { 'no-loss': 'Sin pérdida', other: 'Otros' };
const APPLICATION_LABELS: Record<ApplicationType, string> = { new: 'Nueva construcción', existing: 'Cimentación existente' };
const DURATION_LABELS: Record<Duration, string> = { short: '≤ 6 meses (provisional)', long: '> 6 meses (permanente)' };
const OVERRIDE_LABELS = { false: 'Automático', true: 'Manual' } as const;

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

// ── Reglas de seguridad ───────────────────────────────────────────────────────

/**
 * Escalares que NO son variables de diseño. Las direcciones de los ordinales
 * están verificadas contra el motor (micropiles.ts):
 * - Fe DIVIDE Nc,rd (Nc_rd = ·/(1.2·Fe)) → nivel = Fe (bajar Fe infla el tope).
 * - Fr DIVIDE rflim (rfcEmp = rflim/Fr) → nivel = Fr.
 * - Fu MULTIPLICA la contribución del acero en tracción → 'other' (0.5) es el
 *   lado conservador.
 * - Fc/Fφ minoran c/φ → 'new' (1.5) es más conservador que 'existing' (1.2).
 * - re (corrosión) crece con la agresividad y la vida útil → reducirlos rebaja
 *   la pérdida de pared.
 * - La presión de inyección SUMA a σH (rozamiento teórico) → subirla infla Rfc.
 * - CR alto = más penalización de pandeo (R = 1.07 − 0.027·CR) → bajarlo infla.
 */
export const MICROPILES_SAFETY_RULES: ReadonlyArray<SafetyRule<MicropilesAiInputs>> = [
  { field: 'designLoad', confirmKey: 'designLoad_kN', level: higherIsSafer, why: 'La carga de cálculo la fija el análisis de la estructura: rebajarla baja toda la demanda.' },
  { field: 'baseMoment', confirmKey: 'baseMoment_kNm', level: higherIsSafer, why: 'El momento en cabeza lo fija el análisis: rebajarlo baja la demanda de flexión.' },
  { field: 'baseShear', confirmKey: 'baseShear_kN', level: higherIsSafer, why: 'El cortante en cabeza lo fija el análisis: rebajarlo baja la demanda de cortante.' },
  { field: 'soilModulusTop', confirmKey: 'soilModulusTop_kNm2', level: lowerIsSafer, why: 'El módulo E₀ lo fija el estudio geotécnico: subirlo mejora el empotramiento y el pandeo sin ensayo que lo avale.' },
  { field: 'soilModulusEmbed', confirmKey: 'soilModulusEmbed_kNm2', level: lowerIsSafer, why: 'El módulo EL lo fija el estudio geotécnico: subirlo acorta la longitud ficticia de empotramiento.' },
  { field: 'waterTableDepth', confirmKey: 'waterTableDepth_m', level: lowerIsSafer, why: 'El nivel freático lo fija el estudio geotécnico: profundizarlo sube las tensiones efectivas y el rozamiento por fuste.' },
  { field: 'injectionPressure', confirmKey: 'injectionPressure_kPa', level: lowerIsSafer, why: 'La presión de inyección suma a la tensión horizontal del fuste: subirla infla la resistencia teórica sin respaldo de ejecución.' },
  // designLifeYears / corrosionEnv / execution / connection / application /
  // duration / CR / crManualOverride / coverManualOverride: el payload usa el
  // MISMO nombre que el estado ⇒ sin confirmKey (el default `field` ya vale).
  { field: 'designLifeYears', level: higherIsSafer, why: 'La vida útil de proyecto la fija el proyecto: acortarla reduce la pérdida de pared por corrosión (Tabla 2.4).' },
  {
    field: 'corrosionEnv',
    // Nivel = re a 50 años (Tabla 2.4): más agresivo = más conservador.
    level: ordinalLevel({
      'natural-undisturbed': 0.60,
      'fill-non-aggressive-loose': 1.20,
      'natural-contaminated-industrial': 1.50,
      'natural-aggressive-peat': 1.75,
      'fill-aggressive-loose': 3.25,
    }),
    why: 'El entorno de corrosión lo fija el estudio geotécnico: pasarlo a uno menos agresivo reduce la pérdida de pared re.',
  },
  {
    field: 'execution',
    // Nivel = Fe (Tabla 3.5): Fe divide el tope estructural.
    level: ordinalLevel({
      'wt-above-no-casing-no-mud': 1.50,
      'wt-below-no-casing-no-mud': 1.30,
      'with-mud': 1.15,
      'casing-recoverable': 1.05,
      'casing-lost': 1.00,
    }),
    why: 'La ejecución describe cómo se perforará realmente: cambiarla a una categoría con Fe menor infla el tope estructural sin cambiar la obra.',
  },
  {
    field: 'connection',
    level: ordinalLevel({ other: 1, 'no-loss': 0 }),
    why: 'La unión tubo-encepado es un detalle constructivo real: declararla "sin pérdida" duplica la contribución del acero en tracción.',
  },
  {
    field: 'application',
    // Nivel = Fc (Tabla 3.6): new 1.5 minora más el terreno que existing 1.2.
    level: ordinalLevel({ new: 1.5, existing: 1.2 }),
    why: 'La aplicación (obra nueva/recalce) la fija el proyecto: pasar a "existente" relaja los factores Fc/Fφ que minoran el terreno.',
  },
  {
    field: 'duration',
    // Nivel = Fr (Tabla 3.7): Fr divide rflim.
    level: ordinalLevel({ long: 1.65, short: 1.45 }),
    why: 'La duración de la carga la fija el proyecto: declararla provisional (Fr menor) infla el rozamiento empírico.',
  },
  { field: 'CR', level: higherIsSafer, why: 'CR penaliza el tope estructural por pandeo (R = 1.07 − 0.027·CR): rebajarlo a mano infla la capacidad sin que el terreno lo avale.' },
  {
    field: 'crManualOverride',
    level: unfactoredIsSafer, // false (auto) es el lado seguro
    alwaysCheck: true,
    why: 'Pasar el CR de automático a manual desconecta el pandeo del terreno real: el programa deja de derivarlo de la estratigrafía.',
  },
  {
    field: 'coverManualOverride',
    level: unfactoredIsSafer,
    alwaysCheck: true,
    why: 'Pasar el recubrimiento de automático a manual reinterpreta el bulbo estructural: el programa deja de derivarlo de la geometría del barreno.',
  },
];

/** Estratos = dato geotécnico: TODO lo que mejora el terreno es riesgo (γ incluido — dirección OPUESTA a taludes). */
export const SOIL_ELEMENT_RULES: ReadonlyArray<ElementSafetyRule<SoilLayer>> = [
  { field: 'c', label: "cohesión c'", level: lowerIsSafer, format: (v) => `${v} kPa`, why: 'La cohesión la fija el estudio geotécnico: subirla infla el rozamiento teórico por fuste.' },
  {
    // El rozamiento por fuste NO crece con φ: es proporcional a K₀·tanδ =
    // (1 − sen φ)·tan(2φ/3) (micropiles.ts:277-282), que tiene un MÁXIMO cerca de
    // los 34° y decrece por encima — 0.184 a 34°, 0.169 a 45°, 0.154 a 50°. Con
    // `lowerIsSafer` sobre el ángulo, en arenas densas la regla apuntaba al revés:
    // marcaba como riesgo subir φ de 45° a 50° (que en realidad REBAJA el fuste) y
    // dejaba pasar bajarlo de 50° a 34° (que lo SUBE un 20%).
    //
    // El nivel es el propio coeficiente de rozamiento, negado: exacto por
    // construcción y con la no-monotonía dentro. φ no entra en ningún otro sitio
    // del motor (único uso: layer.phi en micropiles.ts:275).
    field: 'phi',
    label: 'rozamiento φ',
    level: (v) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      const rad = (deg: number) => (deg * Math.PI) / 180;
      return -(Math.max(0, 1 - Math.sin(rad(v))) * Math.tan(rad((2 / 3) * v)));
    },
    format: (v) => `${v}°`,
    why: 'El ángulo de rozamiento lo fija el estudio geotécnico. Lo que cuenta no es el ángulo sino el rozamiento que produce, K₀·tan(2φ/3), que NO crece indefinidamente con φ: alcanza su máximo cerca de los 34°. Este cambio lo aumenta, y con él la resistencia teórica por fuste.',
  },
  { field: 'su', label: 'resistencia sin drenaje su', level: lowerIsSafer, format: (v) => `${v} kN/m²`, why: 'su la fija el estudio geotécnico: subirla infla la resistencia del estrato cohesivo.' },
  {
    // FUGA 3 (auditoría 2026-07-14) — el CENTINELA de su, hermano del de taludes.
    // `su = 0` no rebaja nada: APAGA el tope del fuste del estrato cohesivo
    // (`if (layer.type === 'cohesive' && layer.su > 0)`, micropiles.ts:296) y con
    // él la penalización de pandeo del terreno blando. La regla `lowerIsSafer` de
    // arriba leía la caída como "más conservador". Y hay una puerta aún más barata:
    // `mapLayer` convierte un `su_kPa: null` en 0 sin avisar — al modelo le basta
    // con NO reenviar el campo.
    field: 'su',
    key: 'su_anulada',
    label: 'resistencia sin drenaje su ANULADA',
    level: offIsUnsafe(zeroIsOff, () => 1),
    format: (v) => `${v} kN/m²`,
    why: 'Anular su en un estrato cohesivo NO es rebajar un dato: DESACTIVA el tope de rozamiento por fuste que impone la resistencia del terreno (y con él la penalización de pandeo del estrato blando). Una limitación que no se aplica no es una limitación que se cumple.',
  },
  { field: 'rflim', level: lowerIsSafer, label: 'rozamiento límite rflim', format: (v) => `${v} MPa`, why: 'rflim lo fija el estudio geotécnico: subirlo infla directamente la resistencia empírica por fuste.' },
  { field: 'gamma', label: 'peso específico γ', level: lowerIsSafer, format: (v) => `${v} kN/m³`, why: 'γ lo fija el estudio geotécnico: subirlo aumenta la tensión efectiva y con ella el rozamiento por fuste (dirección opuesta a taludes).' },
  { field: 'Nspt', label: 'golpeo NSPT', level: lowerIsSafer, format: (v) => `${v}`, why: 'El NSPT es un resultado de ensayo: no se mejora sobre el papel.' },
  {
    // FUGA 3 — `Cu` no tenía NINGUNA regla, y es un interruptor: con Cu ≥ 2 la
    // arena floja saturada deja de ser "terreno inestable" (Nc,rd = 0) y pasa a
    // tratarse con CR (micropilesBuckling.ts:123). Ausente ⇒ el motor asume Cu < 2,
    // que es el lado conservador: por eso el nivel trata null/ausente como 0.
    field: 'Cu',
    label: 'coef. de uniformidad Cu',
    level: (v) => lowerIsSafer(v ?? 0),
    format: (v) => (v == null ? 'sin dato (→ < 2)' : `${v}`),
    why: 'Cu = D60/D10 sale de la granulometría del ensayo, no del cálculo: subirlo a 2 o más saca al estrato de la categoría de TERRENO INESTABLE (arena floja bajo el nivel freático), que anula la capacidad a pandeo, y lo devuelve a la escala normal de CR. Es el interruptor más barato del módulo.',
  },
];

/** `field` = clave del array en el estado Y en el payload ("soil") ⇒ sin confirmKey. */
export const SOIL_RISK_CTX = {
  field: 'soil',
  itemLabel: 'Estrato',
  collectionLabel: 'Estratos',
  removalWhy: 'Quitar estratos reescribe el modelo de terreno del estudio geotécnico: el perfil debe cubrir de la rasante a la punta tal y como lo entregó el geotécnico.',
} as const;

// ── Formateadores ─────────────────────────────────────────────────────────────

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtM = (v: number) => `${round2(v)} m`;
const fmtMm = (v: number) => `${round2(v)} mm`;
const fmtKPa = (v: number) => `${round2(v)} kPa`;
const fmtKNm2 = (v: number) => `${round2(v)} kN/m²`;

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

function fmtLayer(l: SoilLayer): string {
  const props = l.type === 'granular'
    ? `γ=${l.gamma}, φ=${l.phi}°`
    : `γ=${l.gamma}${l.su > 0 ? `, su=${l.su}` : ''}${l.c > 0 ? `, c'=${l.c}` : ''}`;
  return `${l.thickness} m ${l.type === 'granular' ? 'granular' : 'cohesivo'} (${props})`;
}

function fmtSoil(soil: readonly SoilLayer[]): string {
  return `${soil.length} estrato${soil.length === 1 ? '' : 's'}: ${soil.map(fmtLayer).join(' · ')}`;
}

/** Igualdad de estrato ignorando id (Cu opcional compara con ausente=undefined). */
function sameLayer(a: SoilLayer, b: SoilLayer): boolean {
  return a.type === b.type && a.thickness === b.thickness && a.gamma === b.gamma
    && a.c === b.c && a.phi === b.phi && a.Nspt === b.Nspt && a.su === b.su
    && a.rflim === b.rflim && (a.Cu ?? 0) === (b.Cu ?? 0);
}

function sameSoil(a: readonly SoilLayer[], b: readonly SoilLayer[]): boolean {
  return a.length === b.length && a.every((l, i) => sameLayer(l, b[i]));
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

/** Rangos de los escalares (los mismos MICROPILES_INPUT_LIMITS de la UI; profundidades propias del adapter). */
const SOIL_LIMITS = {
  thickness: { min: 0.05, max: 200 },
  gamma: { min: 10, max: 26 },
  c: { min: 0, max: 1000 },
  phi: { min: 0, max: 50 },
  Nspt: { min: 0, max: 200 },
  su: { min: 0, max: 1000 },
  rflim: { min: 0, max: 5 },
  Cu: { min: 0, max: 50 },
} as const;

/** Valida y normaliza UN estrato del payload. String = motivo de invalidez (invalida el array entero). */
function mapLayer(raw: SoilPayload, index: number, warnings: string[]): Omit<SoilLayer, 'id'> | string {
  const n = index + 1;
  if (raw.type === null) return `Estrato ${n}: type ausente o no reconocido (granular/cohesive)`;
  if (raw.thickness_m === null) return `Estrato ${n}: falta thickness_m`;
  if (raw.thickness_m < SOIL_LIMITS.thickness.min || raw.thickness_m > SOIL_LIMITS.thickness.max) {
    return `Estrato ${n}: espesor ${raw.thickness_m} m fuera del rango ${SOIL_LIMITS.thickness.min}–${SOIL_LIMITS.thickness.max} m`;
  }
  if (raw.gamma_kNm3 === null) return `Estrato ${n}: falta gamma_kNm3`;
  if (raw.gamma_kNm3 < SOIL_LIMITS.gamma.min || raw.gamma_kNm3 > SOIL_LIMITS.gamma.max) {
    return `Estrato ${n}: γ ${raw.gamma_kNm3} kN/m³ fuera del rango ${SOIL_LIMITS.gamma.min}–${SOIL_LIMITS.gamma.max}`;
  }
  function inRange(v: number | null, lim: { min: number; max: number }, label: string): number | string {
    if (v === null) return 0;
    if (v < lim.min || v > lim.max) return `Estrato ${n}: ${label} ${v} fuera del rango ${lim.min}–${lim.max}`;
    return v;
  }
  const c = inRange(raw.c_kPa, SOIL_LIMITS.c, "c'");
  if (typeof c === 'string') return c;
  const phi = inRange(raw.phi_deg, SOIL_LIMITS.phi, 'φ');
  if (typeof phi === 'string') return phi;
  const su = inRange(raw.su_kPa, SOIL_LIMITS.su, 'su');
  if (typeof su === 'string') return su;
  const nspt = inRange(raw.Nspt, SOIL_LIMITS.Nspt, 'NSPT');
  if (typeof nspt === 'string') return nspt;
  const rflim = inRange(raw.rflim_MPa, SOIL_LIMITS.rflim, 'rflim');
  if (typeof rflim === 'string') return rflim;

  let cFinal = round2(c);
  let suFinal = round2(su);
  let cu: number | undefined;
  if (raw.type === 'granular') {
    if (cFinal > 0 || suFinal > 0) {
      warnings.push(`Estrato ${n}: c' y su se fuerzan a 0 en granulares (coherencia del módulo).`);
      cFinal = 0;
      suFinal = 0;
    }
    if (raw.Cu !== null) {
      const cuChecked = inRange(raw.Cu, SOIL_LIMITS.Cu, 'Cu');
      if (typeof cuChecked === 'string') return cuChecked;
      cu = round2(cuChecked);
    }
  } else {
    if (raw.Cu !== null) {
      warnings.push(`Estrato ${n}: Cu solo aplica a granulares; se ignora.`);
    }
    // El array viaja con semántica de REEMPLAZO: un `su_kPa` que no llega se
    // convierte en 0 (inRange), y en un estrato COHESIVO un su = 0 apaga el tope
    // de fuste. Que el silencio del modelo borre un dato del geotécnico tiene que
    // verse (el riesgo `su_anulada` lo marca; esto lo explica).
    if (raw.su_kPa === null) {
      warnings.push(
        `Estrato ${n} (cohesivo): no se ha indicado su, así que queda en 0 — y con su = 0 el motor NO aplica el tope de rozamiento por fuste. Si el estrato tiene resistencia sin drenaje, indícala.`,
      );
    }
  }
  return {
    type: raw.type,
    thickness: round2(raw.thickness_m),
    gamma: round2(raw.gamma_kNm3),
    c: cFinal,
    phi: round2(phi as number),
    Nspt: Math.round(nspt as number),
    su: suFinal,
    rflim: round2(rflim as number),
    ...(cu !== undefined ? { Cu: cu } : {}),
  };
}

function buildMicropilesPlan(
  payload: unknown,
  current: MicropilesAiInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<MicropilesAiInputs> {
  const x = parsePayload(payload);
  const fields: Partial<MicropilesAiInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof MicropilesAiInputs>(
    key: PayloadKey,
    field: K,
    value: MicropilesAiInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  /** Numérico continuo con rango. */
  function applyNumber<K extends keyof MicropilesAiInputs>(
    key: PayloadKey,
    field: K,
    value: number | null,
    min: number,
    max: number,
    unit: string,
    fmt: (v: number) => string,
  ): void {
    if (value === null) return;
    if (value < min || value > max) { skip(key, rangeReason(value, min, max, unit)); return; }
    const v = round2(value);
    const before = current[field] as number;
    if (Math.abs(v - before) <= EPS) skip(key, ALREADY);
    else apply(key, field, v as MicropilesAiInputs[K], fmt(before), fmt(v));
  }

  /** Enum contra catálogo con labels humanos. */
  function applyEnum<K extends keyof MicropilesAiInputs, V extends MicropilesAiInputs[K] & (string | number | boolean)>(
    key: PayloadKey,
    field: K,
    value: V | null,
    labelOf: (v: V) => string,
  ): void {
    if (value === null) return;
    const before = current[field] as V;
    if (value === before) skip(key, ALREADY);
    else apply(key, field, value, labelOf(before), labelOf(value));
  }

  // --- Profundidades (convención rasante, cross-check punta > cabeza) ---
  const toeDepth = x.toeDepth_m ?? current.toeDepth;
  if (x.topDepth_m !== null) {
    if (x.topDepth_m < -5 || x.topDepth_m > 50) skip('topDepth_m', rangeReason(x.topDepth_m, -5, 50, 'm'));
    else if (x.topDepth_m >= toeDepth) skip('topDepth_m', `La cabeza (${x.topDepth_m} m) debe quedar por encima de la punta (${toeDepth} m)`);
    else if (Math.abs(x.topDepth_m - current.topDepth) <= EPS) skip('topDepth_m', ALREADY);
    else apply('topDepth_m', 'topDepth', round2(x.topDepth_m), fmtM(current.topDepth), fmtM(round2(x.topDepth_m)));
  }
  if (x.toeDepth_m !== null && !handled.has('toeDepth_m')) {
    const topEff = fields.topDepth ?? current.topDepth;
    if (x.toeDepth_m < 1 || x.toeDepth_m > 100) skip('toeDepth_m', rangeReason(x.toeDepth_m, 1, 100, 'm'));
    else if (x.toeDepth_m <= topEff) skip('toeDepth_m', `La punta (${x.toeDepth_m} m) debe quedar por debajo de la cabeza (${topEff} m)`);
    else if (Math.abs(x.toeDepth_m - current.toeDepth) <= EPS) skip('toeDepth_m', ALREADY);
    else apply('toeDepth_m', 'toeDepth', round2(x.toeDepth_m), fmtM(current.toeDepth), fmtM(round2(x.toeDepth_m)));
  }

  applyNumber('drillDiameter_mm', 'drillDiameter', x.drillDiameter_mm, 50, 600, 'mm', fmtMm);
  applyNumber('waterTableDepth_m', 'waterTableDepth', x.waterTableDepth_m, -5, 100, 'm', fmtM);
  applyNumber('injectionPressure_kPa', 'injectionPressure', x.injectionPressure_kPa, 0, 3000, 'kPa', fmtKPa);
  applyNumber('designLoad_kN', 'designLoad', x.designLoad_kN, 0, 100000, 'kN',
    (v) => formatQuantity(v, 'force', system));

  applyEnum('effort', 'effort', x.effort, (v) => EFFORT_LABELS[v]);
  applyEnum('method', 'method', x.method, (v) => METHOD_LABELS[v]);
  applyEnum('groutType', 'groutType', x.groutType, (v) => GROUT_LABELS[v]);

  if (x.concreteGrade_MPa !== null) {
    if (!(CONCRETE_GRADES as readonly number[]).includes(x.concreteGrade_MPa)) {
      skip('concreteGrade_MPa', `HA-${x.concreteGrade_MPa} no está en el catálogo (${CONCRETE_GRADES.join(', ')} MPa)`);
    } else if (x.concreteGrade_MPa === current.concreteGrade) skip('concreteGrade_MPa', ALREADY);
    else apply('concreteGrade_MPa', 'concreteGrade', x.concreteGrade_MPa, `HA-${current.concreteGrade}`, `HA-${x.concreteGrade_MPa}`);
  }

  // --- Tubo (gate del custom) ---
  const tube = x.tube ?? current.tube;
  applyEnum('tube', 'tube', x.tube, (v) => (v === CUSTOM_TUBE_SENTINEL ? 'Personalizado' : v));
  const CUSTOM_ONLY = 'Solo aplica con tube="custom"; elige el tubo personalizado explícitamente si procede';
  if (x.customTubeDe_mm !== null) {
    if (tube !== CUSTOM_TUBE_SENTINEL) skip('customTubeDe_mm', CUSTOM_ONLY);
    else applyNumber('customTubeDe_mm', 'customTubeDe', x.customTubeDe_mm, 30, 300, 'mm', fmtMm);
  }
  if (x.customTubeE_mm !== null) {
    if (tube !== CUSTOM_TUBE_SENTINEL) skip('customTubeE_mm', CUSTOM_ONLY);
    else applyNumber('customTubeE_mm', 'customTubeE', x.customTubeE_mm, 3, 20, 'mm', fmtMm);
  }
  applyNumber('steelGrade_MPa', 'steelGrade', x.steelGrade_MPa, 100, 2000, 'N/mm²',
    (v) => formatQuantity(v, 'stress', system));

  // --- Ejecución / entorno ---
  applyEnum('execution', 'execution', x.execution, (v) => EXECUTION_LABELS[v]);
  applyEnum('corrosionEnv', 'corrosionEnv', x.corrosionEnv, (v) => CORROSION_LABELS[v]);
  if (x.designLifeYears !== null) {
    if (!(DESIGN_LIVES as readonly number[]).includes(x.designLifeYears)) {
      skip('designLifeYears', `${x.designLifeYears} años no es una vida útil de la Tabla 2.4 (${DESIGN_LIVES.join(', ')})`);
    } else if (x.designLifeYears === current.designLifeYears) skip('designLifeYears', ALREADY);
    else {
      apply('designLifeYears', 'designLifeYears', x.designLifeYears as DesignLifeYears,
        DESIGN_LIFE_LABELS[current.designLifeYears], DESIGN_LIFE_LABELS[x.designLifeYears as DesignLifeYears]);
    }
  }
  applyEnum('connection', 'connection', x.connection, (v) => CONNECTION_LABELS[v]);
  applyEnum('application', 'application', x.application, (v) => APPLICATION_LABELS[v]);
  applyEnum('duration', 'duration', x.duration, (v) => DURATION_LABELS[v]);

  // --- Overrides de pandeo y recubrimiento (gates de CR / structuralCover) ---
  const crManual = x.crManualOverride ?? current.crManualOverride;
  applyEnum('crManualOverride', 'crManualOverride', x.crManualOverride,
    (v) => OVERRIDE_LABELS[`${v}`]);
  if (x.CR !== null) {
    if (!crManual) skip('CR', 'El CR es automático (lo deriva el programa de la estratigrafía); propone crManualOverride=true para fijarlo a mano');
    else applyNumber('CR', 'CR', x.CR, 0.5, 30, '', (v) => v.toFixed(1));
  }
  const coverManual = x.coverManualOverride ?? current.coverManualOverride;
  applyEnum('coverManualOverride', 'coverManualOverride', x.coverManualOverride,
    (v) => OVERRIDE_LABELS[`${v}`]);
  if (x.structuralCover_mm !== null) {
    if (!coverManual) skip('structuralCover_mm', 'El recubrimiento es automático (r = (Dn−de)/2); propone coverManualOverride=true para fijarlo a mano');
    else applyNumber('structuralCover_mm', 'structuralCover', x.structuralCover_mm, 0, 200, 'mm', fmtMm);
  }

  // --- Empujes horizontales ---
  function applyLoad(key: 'baseMoment_kNm' | 'baseShear_kN', field: 'baseMoment' | 'baseShear', value: number | null, quantity: 'moment' | 'force'): void {
    if (value === null) return;
    let v = value;
    if (v < 0) {
      v = Math.abs(v);
      warnings.push(`${LABELS[key]} negativo (${value}): se aplica su valor absoluto (${v}).`);
    }
    applyNumber(key, field, v, 0, 100000, quantity === 'moment' ? 'kNm' : 'kN',
      (n) => formatQuantity(n, quantity, system));
  }
  applyLoad('baseMoment_kNm', 'baseMoment', x.baseMoment_kNm, 'moment');
  applyLoad('baseShear_kN', 'baseShear', x.baseShear_kN, 'force');
  applyNumber('soilModulusTop_kNm2', 'soilModulusTop', x.soilModulusTop_kNm2, 0, 1e8, 'kN/m²', fmtKNm2);
  applyNumber('soilModulusEmbed_kNm2', 'soilModulusEmbed', x.soilModulusEmbed_kNm2, 1, 1e8, 'kN/m²', fmtKNm2);

  // --- Estratigrafía: REEMPLAZO completo, todo-o-nada ---
  if (x.soil !== null) {
    if (x.soil.length === 0) {
      skip('soil', 'La estratigrafía no puede quedar vacía: hace falta al menos un estrato');
    } else {
      const mapped: SoilLayer[] = [];
      let elementError: string | null = null;
      const soilWarnings: string[] = [];
      for (let i = 0; i < x.soil.length; i++) {
        const res = mapLayer(x.soil[i], i, soilWarnings);
        if (typeof res === 'string') { elementError = res; break; }
        mapped.push({ id: i + 1, ...res });
      }
      if (elementError !== null) {
        skip('soil', `${elementError} — no se aplica ningún estrato (la lista reemplaza a la actual entera)`);
      } else {
        const total = mapped.reduce((s, l) => s + l.thickness, 0);
        const toeEff = fields.toeDepth ?? current.toeDepth;
        if (total < toeEff - 1e-6) {
          skip('soil', `Los estratos suman ${round2(total)} m y no cubren hasta la punta (${toeEff} m): el perfil debe llegar de la rasante a la punta`);
        } else if (sameSoil(mapped, current.soil)) {
          skip('soil', ALREADY);
        } else {
          warnings.push(...soilWarnings);
          apply('soil', 'soil', mapped, fmtSoil(current.soil), fmtSoil(mapped));
        }
      }
    }
  }

  // --- notFound ---
  const values: Record<PayloadKey, unknown> = {
    topDepth_m: x.topDepth_m, toeDepth_m: x.toeDepth_m, drillDiameter_mm: x.drillDiameter_mm,
    waterTableDepth_m: x.waterTableDepth_m, injectionPressure_kPa: x.injectionPressure_kPa,
    designLoad_kN: x.designLoad_kN, effort: x.effort, method: x.method, groutType: x.groutType,
    concreteGrade_MPa: x.concreteGrade_MPa, tube: x.tube,
    customTubeDe_mm: x.customTubeDe_mm, customTubeE_mm: x.customTubeE_mm, steelGrade_MPa: x.steelGrade_MPa,
    execution: x.execution, corrosionEnv: x.corrosionEnv, designLifeYears: x.designLifeYears,
    connection: x.connection, application: x.application, duration: x.duration,
    crManualOverride: x.crManualOverride, CR: x.CR,
    coverManualOverride: x.coverManualOverride, structuralCover_mm: x.structuralCover_mm,
    baseMoment_kNm: x.baseMoment_kNm, baseShear_kN: x.baseShear_kN,
    soilModulusTop_kNm2: x.soilModulusTop_kNm2, soilModulusEmbed_kNm2: x.soilModulusEmbed_kNm2,
    soil: x.soil,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = [
    ...detectSafetyRisks(MICROPILES_SAFETY_RULES, changes, fields, current, micropilesAiDefaults, confirmed),
    ...detectElementRisks(SOIL_ELEMENT_RULES, fields.soil, current.soil, micropilesSoilDefaults, SOIL_RISK_CTX, confirmed),
  ];
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

function layerToPayloadShape(l: SoilLayer): Record<string, unknown> {
  return {
    type: l.type,
    thickness_m: l.thickness,
    gamma_kNm3: l.gamma,
    c_kPa: l.c,
    phi_deg: l.phi,
    su_kPa: l.su,
    Nspt: l.Nspt,
    rflim_MPa: l.rflim,
    Cu: l.type === 'granular' ? (l.Cu ?? null) : null,
  };
}

/** Lectura del estado por clave del payload (unidades ya humanas — sin conversión). */
const SNAPSHOT_READ: Record<Exclude<PayloadKey, 'soil'>, (c: MicropilesAiInputs) => string | number | boolean> = {
  topDepth_m: (c) => c.topDepth,
  toeDepth_m: (c) => c.toeDepth,
  drillDiameter_mm: (c) => c.drillDiameter,
  waterTableDepth_m: (c) => c.waterTableDepth,
  injectionPressure_kPa: (c) => c.injectionPressure,
  designLoad_kN: (c) => c.designLoad,
  effort: (c) => c.effort,
  method: (c) => c.method,
  groutType: (c) => c.groutType,
  concreteGrade_MPa: (c) => c.concreteGrade,
  tube: (c) => c.tube,
  customTubeDe_mm: (c) => c.customTubeDe,
  customTubeE_mm: (c) => c.customTubeE,
  steelGrade_MPa: (c) => c.steelGrade,
  execution: (c) => c.execution,
  corrosionEnv: (c) => c.corrosionEnv,
  designLifeYears: (c) => c.designLifeYears,
  connection: (c) => c.connection,
  application: (c) => c.application,
  duration: (c) => c.duration,
  crManualOverride: (c) => c.crManualOverride,
  CR: (c) => c.CR,
  coverManualOverride: (c) => c.coverManualOverride,
  structuralCover_mm: (c) => c.structuralCover,
  baseMoment_kNm: (c) => c.baseMoment,
  baseShear_kN: (c) => c.baseShear,
  soilModulusTop_kNm2: (c) => c.soilModulusTop,
  soilModulusEmbed_kNm2: (c) => c.soilModulusEmbed,
};

function buildSnapshot(c: MicropilesAiInputs): string {
  const valores: Record<string, unknown> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    if (key === 'soil') {
      valores.soil = c.soil.map(layerToPayloadShape);
      if (sameSoil(c.soil, micropilesSoilDefaults)) sinConfirmar.push('soil');
    } else {
      const read = SNAPSHOT_READ[key];
      valores[key] = read(c);
      if (read(c) === read(micropilesAiDefaults)) sinConfirmar.push(key);
    }
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados ─────────────────────────────────────────────────────

export function summarizeMicropilesResults(r: MicropilesResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(r);
  return summarizeCalcResults(r, [
    `Fuste: Rfc teórico = ${r.RfcTheoretical.toFixed(1)} kN · empírico = ${r.RfcEmpirical.toFixed(1)} kN — adoptado ${r.RfcAdopted.toFixed(1)} kN`,
    `Pandeo: CR adoptado = ${r.crAdopted.toFixed(1)} → R = ${r.R.toFixed(3)} · recubrimiento r = ${r.coverAdopted.toFixed(1)} mm`,
    `Longitud bajo cabeza L = ${r.length.toFixed(2)} m`,
  ]);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const micropilesAdapter: AiModuleAdapter<MicropilesAiInputs> = {
  id: 'micropiles',
  label: 'Micropilotes',
  payloadSchema: MICROPILES_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: buildMicropilesPlan,
};
