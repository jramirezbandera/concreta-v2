/**
 * Adapter del asistente IA para el módulo Empresillado (ola 1, CE Anejo 22 §6.4):
 * refuerzo de un pilar de hormigón EXISTENTE con 4 angulares en las esquinas
 * unidos por presillas.
 *
 * Particularidades del módulo:
 * - UNIDADES MIXTAS, la mezcla más traicionera de la campaña: bc, hc, s, lp y bp
 *   van en CENTÍMETROS; solo tp va en milímetros; L en metros. El estado interno
 *   usa esas mismas unidades → el mapper no convierte, pero cada `description`
 *   del schema lo repite campo a campo.
 * - EN REHABILITACIÓN, LO EXISTENTE ES DATO (corolario del §7 de la
 *   arquitectura): bc/hc son la geometría MEDIDA del pilar existente, así que la
 *   regla de seguridad se INVIERTE — lo peligroso es AGRANDARLOS (`lowerIsSafer`),
 *   porque separa los angulares del eje y les regala brazo de palanca sin que
 *   nadie haya medido ese pilar. El refuerzo (angulares, presillas, acero) sí es
 *   diseño libre.
 * - Invariante del motor: s > lp (la separación libre s₀ = s − lp debe ser > 0).
 *   Se comprueba sobre el estado COMBINADO, y si se rompe no se aplica ninguno de
 *   los dos: media pareja aplicada dejaría el cálculo en error.
 * - El motor deriva VEd = π·MEd/L + Vd; `Vd` es lo que se escribe, VEd no se
 *   expone.
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectSafetyRisks,
  higherIsSafer,
  lowerIsSafer,
  type SafetyRule,
} from '../safety';
import type { EmpresalladoResult } from '../../calculations/empresillado';
import { ANGLE_PROFILES, getAngleProfile } from '../../../data/angleProfiles';
import { empresalladoDefaults, type EmpresalladoInputs } from '../../../data/defaults';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogo del módulo ───────────────────────────────────────────────────────
const PROFILE_KEYS: readonly string[] = ANGLE_PROFILES.map((p) => p.key);

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const EMPRESILLADO_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'bc_cm', 'hc_cm', 'L_m', 'N_Ed_kN', 'Mx_kNm', 'My_kNm', 'Vd_kN',
    'perfil', 'fy_MPa', 'beta_x', 'beta_y',
    's_cm', 'lp_cm', 'bp_cm', 'tp_mm', 'warnings',
  ],
  properties: {
    bc_cm: { type: ['number', 'null'], description: 'Ancho del pilar EXISTENTE (eje x) en CENTÍMETROS. Es una medida de obra: un pilar de 30×30 cm son 30 y 30.' },
    hc_cm: { type: ['number', 'null'], description: 'Canto del pilar EXISTENTE (eje y) en CENTÍMETROS.' },
    L_m: { type: ['number', 'null'], description: 'Altura libre del pilar (altura entre plantas) en METROS.' },
    N_Ed_kN: { type: ['number', 'null'], description: 'Axil de cálculo N_Ed en kN (ELU, compresión positiva).' },
    Mx_kNm: { type: ['number', 'null'], description: 'Momento de cálculo alrededor del eje x, en kNm (ELU).' },
    My_kNm: { type: ['number', 'null'], description: 'Momento de cálculo alrededor del eje y, en kNm (ELU).' },
    Vd_kN: { type: ['number', 'null'], description: 'Cortante de cálculo en la sección del pilar, en kN (ELU). Si es menor que N_Ed/500 el motor aplica ese mínimo normativo.' },
    perfil: { type: ['string', 'null'], enum: [...PROFILE_KEYS, null], description: 'Angular (perfil L de lados iguales) de cada cordón, con la clave del catálogo: "L60x5" … "L160x16". Un "L 100×10" es "L100x10".' },
    fy_MPa: { type: ['number', 'null'], description: 'Límite elástico del acero de los angulares y las presillas, en MPa (típicamente 275 o 355).' },
    beta_x: { type: ['number', 'null'], description: 'Coeficiente de pandeo global del eje x: 0.5 biempotrado, 0.7 articulado-empotrado, 1.0 biarticulado.' },
    beta_y: { type: ['number', 'null'], description: 'Coeficiente de pandeo global del eje y: 0.5 biempotrado, 0.7 articulado-empotrado, 1.0 biarticulado.' },
    s_cm: { type: ['number', 'null'], description: 'Separación entre ejes de presillas en CENTÍMETROS. Debe ser MAYOR que lp_cm.' },
    lp_cm: { type: ['number', 'null'], description: 'Alto de la presilla (dimensión en la dirección del eje del pilar) en CENTÍMETROS. Debe ser MENOR que s_cm.' },
    bp_cm: { type: ['number', 'null'], description: 'Ancho de la presilla (perpendicular al eje del pilar) en CENTÍMETROS.' },
    tp_mm: { type: ['number', 'null'], description: 'Espesor de la presilla en MILÍMETROS (ojo: es el ÚNICO campo de presilla que NO va en cm).' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Empresillado (refuerzo de pilar existente con angulares):
1. UNIDADES MIXTAS, mucho cuidado: el pilar (bc_cm, hc_cm) y las presillas (s_cm, lp_cm, bp_cm) van en CENTÍMETROS; el espesor de la presilla (tp_mm) va en MILÍMETROS; la altura (L_m) en METROS. Un pilar de 0.30×0.40 m son bc=30 y hc=40; una presilla de "120×100×10 mm" es lp=12 cm, bp=10 cm y tp=10 mm. Añade un warning con cada conversión que hagas.
2. El pilar de hormigón (bc_cm, hc_cm) es EXISTENTE: son medidas de obra, un DATO. El modelo desprecia su capacidad (lado seguro) y comprueba solo el empresillado, pero su geometría fija la posición de los angulares y sus brazos de palanca. NUNCA los "ajustes" para que cumpla: si el pilar no está medido, pregunta.
3. N_Ed, Mx, My y Vd son esfuerzos de CÁLCULO, YA MAYORADOS (ELU). Si el enunciado da cargas de servicio, mayóralas y explícalo en un warning. El motor deriva el cortante de comprobación como VEd = π·MEd/L + Vd (con la imperfección e₀ = L/500 amplificada de segundo orden): tú solo escribes Vd.
4. Las presillas: s es la separación entre ejes y lp el alto de cada presilla, así que s DEBE ser mayor que lp (la separación libre es s₀ = s − lp). Una propuesta que rompa esa relación no se aplica.
5. beta_x y beta_y describen la condición de apoyo REAL del pilar en el marco: 0.5 biempotrado, 0.7 articulado-empotrado, 1.0 biarticulado.
6. En este módulo son DATOS del problema, no variables de diseño: los esfuerzos (N_Ed, Mx, My, Vd), la altura (L_m), los coeficientes de pandeo (beta_x, beta_y) y —por ser rehabilitación— LA GEOMETRÍA DEL PILAR EXISTENTE (bc_cm, hc_cm). Lo que SÍ puedes dimensionar es el REFUERZO: angular mayor (perfil), acero de más límite elástico (fy), presillas más juntas (menos s, que reduce el pandeo local del cordón) o más robustas (bp, tp). NUNCA rebajes un esfuerzo ni AGRANDES el pilar existente para que salga el cálculo: agrandarlo separa los angulares del eje y les regala inercia que nadie ha medido en obra.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Refuerzo de un pilar existente de 30×30 cm y 3 m de altura con 4 angulares L100x10 '
  + 'de acero S275. Axil de cálculo 500 kN y momentos de 20 y 10 kNm. Presillas cada 40 cm.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface EmpresalladoPayload {
  bc_cm: number | null;
  hc_cm: number | null;
  L_m: number | null;
  N_Ed_kN: number | null;
  Mx_kNm: number | null;
  My_kNm: number | null;
  Vd_kN: number | null;
  perfil: string | null;
  fy_MPa: number | null;
  beta_x: number | null;
  beta_y: number | null;
  s_cm: number | null;
  lp_cm: number | null;
  bp_cm: number | null;
  tp_mm: number | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parsePayload(raw: unknown): EmpresalladoPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    bc_cm: finiteNumber(r.bc_cm),
    hc_cm: finiteNumber(r.hc_cm),
    L_m: finiteNumber(r.L_m),
    N_Ed_kN: finiteNumber(r.N_Ed_kN),
    Mx_kNm: finiteNumber(r.Mx_kNm),
    My_kNm: finiteNumber(r.My_kNm),
    Vd_kN: finiteNumber(r.Vd_kN),
    perfil: typeof r.perfil === 'string' ? r.perfil : null,
    fy_MPa: finiteNumber(r.fy_MPa),
    beta_x: finiteNumber(r.beta_x),
    beta_y: finiteNumber(r.beta_y),
    s_cm: finiteNumber(r.s_cm),
    lp_cm: finiteNumber(r.lp_cm),
    bp_cm: finiteNumber(r.bp_cm),
    tp_mm: finiteNumber(r.tp_mm),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  bc_cm: 'Ancho del pilar existente bc',
  hc_cm: 'Canto del pilar existente hc',
  L_m: 'Altura del pilar L',
  N_Ed_kN: 'Axil N_Ed',
  Mx_kNm: 'Momento Mx',
  My_kNm: 'Momento My',
  Vd_kN: 'Cortante Vd',
  perfil: 'Angular de los cordones',
  fy_MPa: 'Límite elástico fy',
  beta_x: 'Coef. pandeo βx',
  beta_y: 'Coef. pandeo βy',
  s_cm: 'Separación de presillas s',
  lp_cm: 'Alto de presilla lp',
  bp_cm: 'Ancho de presilla bp',
  tp_mm: 'Espesor de presilla tp',
} as const;

type PayloadKey = keyof typeof LABELS;

const KEY_ORDER: readonly PayloadKey[] = [
  'bc_cm', 'hc_cm', 'L_m', 'N_Ed_kN', 'Mx_kNm', 'My_kNm', 'Vd_kN',
  'perfil', 'fy_MPa', 'beta_x', 'beta_y',
  's_cm', 'lp_cm', 'bp_cm', 'tp_mm',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

/**
 * Campos que NO son variables de diseño.
 *
 * bc/hc llevan `lowerIsSafer` — la regla INVERTIDA de la rehabilitación: son la
 * geometría MEDIDA del pilar existente, así que aquí lo peligroso es
 * AGRANDARLOS. Un pilar más grande aleja los angulares del eje (dx = bc/2 + e),
 * y como I = 4·(I₁ + A·d²) la inercia del conjunto crece con el CUADRADO de esa
 * distancia: el empresillado "cumple" sin que nadie haya vuelto a medir en obra.
 *
 * El refuerzo (perfil, fy, s, lp, bp, tp) es diseño libre y no lleva regla:
 * subirlo es la salida legítima.
 */
export const EMPRESILLADO_SAFETY_RULES: ReadonlyArray<SafetyRule<EmpresalladoInputs>> = [
  { field: 'N_Ed', confirmKey: 'N_Ed_kN', level: higherIsSafer, why: 'El axil de cálculo lo fija el análisis de la estructura: rebajarlo baja la compresión de los cordones y el pandeo global.' },
  { field: 'Mx_Ed', confirmKey: 'Mx_kNm', level: higherIsSafer, why: 'El momento Mx lo fija el análisis de la estructura: rebajarlo descarga el cordón más comprimido y el cortante de las presillas.' },
  { field: 'My_Ed', confirmKey: 'My_kNm', level: higherIsSafer, why: 'El momento My lo fija el análisis de la estructura: rebajarlo descarga el cordón más comprimido y el cortante de las presillas.' },
  { field: 'Vd', confirmKey: 'Vd_kN', level: higherIsSafer, why: 'El cortante de cálculo lo fija el análisis de la estructura: rebajarlo alivia la flexión y el cortante de las presillas.' },
  { field: 'L', confirmKey: 'L_m', level: higherIsSafer, why: 'La altura entre plantas la fija la geometría del edificio: acortarla reduce a la vez la esbeltez y la imperfección e₀ = L/500.' },
  { field: 'beta_x', level: higherIsSafer, why: 'β describe la condición de apoyo REAL del pilar en el marco: rebajarlo acorta la longitud de pandeo y sube χ sin tocar el refuerzo.' },
  { field: 'beta_y', level: higherIsSafer, why: 'β describe la condición de apoyo REAL del pilar en el marco: rebajarlo acorta la longitud de pandeo y sube χ sin tocar el refuerzo.' },
  {
    field: 'bc',
    confirmKey: 'bc_cm',
    level: lowerIsSafer, // rehabilitación: lo peligroso es AGRANDAR lo existente
    why: 'El pilar es EXISTENTE: bc es una medida de obra, no una variable de diseño. Agrandarlo separa los angulares del eje y dispara la inercia del conjunto (crece con el cuadrado de la distancia) sin que nadie haya medido ese pilar.',
  },
  {
    field: 'hc',
    confirmKey: 'hc_cm',
    level: lowerIsSafer,
    why: 'El pilar es EXISTENTE: hc es una medida de obra, no una variable de diseño. Agrandarlo separa los angulares del eje y dispara la inercia del conjunto sin que nadie haya medido ese pilar.',
  },
];

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtCm = (v: number) => `${v} cm`;

export const S_GT_LP_REASON =
  'La separación entre presillas (s) debe ser MAYOR que el alto de la presilla (lp): '
  + 'la separación libre s₀ = s − lp quedaría en cero o negativa y el cálculo no sería válido.';

function buildEmpresalladoPlan(
  x: EmpresalladoPayload,
  current: EmpresalladoInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<EmpresalladoInputs> {
  const fields: Partial<EmpresalladoInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof EmpresalladoInputs>(
    key: PayloadKey,
    field: K,
    value: EmpresalladoInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  /** Numérico continuo: rango → skip; ALREADY (±EPS) → skip; si no, apply. */
  function applyNumber(
    key: PayloadKey,
    field: keyof EmpresalladoInputs & ('bc' | 'hc' | 'L' | 'fy' | 'beta_x' | 'beta_y' | 'bp' | 'tp'),
    value: number | null,
    min: number,
    max: number,
    unit: string,
    fmt: (v: number) => string,
  ): void {
    if (value === null) return;
    if (value < min || value > max) {
      skip(key, rangeReason(value, min, max, unit));
      return;
    }
    const v = round2(value);
    const before = current[field];
    if (Math.abs(v - before) <= EPS) skip(key, ALREADY);
    else apply(key, field, v, fmt(before), fmt(v));
  }

  // --- Pilar existente (cm) y altura (m) ---
  applyNumber('bc_cm', 'bc', x.bc_cm, 10, 300, 'cm', fmtCm);
  applyNumber('hc_cm', 'hc', x.hc_cm, 10, 300, 'cm', fmtCm);
  applyNumber('L_m', 'L', x.L_m, 0.5, 30, 'm', (v) => `${v.toFixed(2)} m`);

  // --- Esfuerzos (ELU). El motor toma |M|; N_Ed y Vd deben ser ≥ 0. ---
  const fmtForce = (v: number) => formatQuantity(v, 'force', system);
  const fmtMoment = (v: number) => formatQuantity(v, 'moment', system);

  function applyForce(key: 'N_Ed_kN' | 'Vd_kN', field: 'N_Ed' | 'Vd', value: number | null, max: number): void {
    if (value === null) return;
    if (value < 0 || value > max) {
      skip(key, rangeReason(value, 0, max, 'kN'));
      return;
    }
    const v = round2(value);
    if (Math.abs(v - current[field]) <= EPS) skip(key, ALREADY);
    else apply(key, field, v, fmtForce(current[field]), fmtForce(v));
  }
  applyForce('N_Ed_kN', 'N_Ed', x.N_Ed_kN, 50000);
  applyForce('Vd_kN', 'Vd', x.Vd_kN, 5000);

  function applyMoment(key: 'Mx_kNm' | 'My_kNm', field: 'Mx_Ed' | 'My_Ed', value: number | null): void {
    if (value === null) return;
    if (Math.abs(value) > 20000) {
      skip(key, rangeReason(value, 0, 20000, 'kNm'));
      return;
    }
    let v = round2(value);
    if (v < 0) {
      v = Math.abs(v);
      warnings.push(`El momento ${LABELS[key]} venía con signo negativo; se aplica su valor absoluto (${v} kNm).`);
    }
    if (Math.abs(v - current[field]) <= EPS) skip(key, ALREADY);
    else apply(key, field, v, fmtMoment(current[field]), fmtMoment(v));
  }
  applyMoment('Mx_kNm', 'Mx_Ed', x.Mx_kNm);
  applyMoment('My_kNm', 'My_Ed', x.My_kNm);

  // --- Refuerzo: angular (catálogo) y acero ---
  if (x.perfil !== null) {
    if (getAngleProfile(x.perfil) === undefined) {
      skip('perfil', `El angular "${x.perfil}" no está en el catálogo (L60x5 … L160x16)`);
    } else if (x.perfil === current.perfil) {
      skip('perfil', ALREADY);
    } else {
      const label = (k: string) => getAngleProfile(k)?.label ?? k;
      apply('perfil', 'perfil', x.perfil, label(current.perfil), label(x.perfil));
    }
  }
  applyNumber('fy_MPa', 'fy', x.fy_MPa, 235, 700, 'MPa', (v) => `${v} MPa`);

  // --- Pandeo global ---
  applyNumber('beta_x', 'beta_x', x.beta_x, 0.5, 3, '', (v) => v.toFixed(2));
  applyNumber('beta_y', 'beta_y', x.beta_y, 0.5, 3, '', (v) => v.toFixed(2));

  // --- Presillas: invariante s > lp sobre el estado COMBINADO ---
  const sInRange = x.s_cm !== null && x.s_cm >= 5 && x.s_cm <= 300;
  const lpInRange = x.lp_cm !== null && x.lp_cm >= 1 && x.lp_cm <= 200;
  const sProposed = sInRange ? round2(x.s_cm as number) : null;
  const lpProposed = lpInRange ? round2(x.lp_cm as number) : null;
  const sFinal = sProposed ?? current.s;
  const lpFinal = lpProposed ?? current.lp;
  const battenBroken = sFinal <= lpFinal;

  function applyBatten(
    key: 's_cm' | 'lp_cm',
    field: 's' | 'lp',
    raw: number | null,
    rounded: number | null,
    min: number,
    max: number,
  ): void {
    if (raw === null) return;
    if (rounded === null) {
      skip(key, rangeReason(raw, min, max, 'cm'));
      return;
    }
    // Pareja incoherente: no se aplica NINGUNA de las dos (aplicar solo una
    // dejaría el cálculo en error sin que nadie lo haya pedido).
    if (battenBroken) {
      skip(key, S_GT_LP_REASON);
      return;
    }
    if (Math.abs(rounded - current[field]) <= EPS) skip(key, ALREADY);
    else apply(key, field, rounded, fmtCm(current[field]), fmtCm(rounded));
  }
  applyBatten('s_cm', 's', x.s_cm, sProposed, 5, 300);
  applyBatten('lp_cm', 'lp', x.lp_cm, lpProposed, 1, 200);

  applyNumber('bp_cm', 'bp', x.bp_cm, 2, 100, 'cm', fmtCm);
  applyNumber('tp_mm', 'tp', x.tp_mm, 4, 60, 'mm', (v) => `${v} mm`);

  // --- notFound ---
  const values: Record<PayloadKey, unknown> = {
    bc_cm: x.bc_cm, hc_cm: x.hc_cm, L_m: x.L_m,
    N_Ed_kN: x.N_Ed_kN, Mx_kNm: x.Mx_kNm, My_kNm: x.My_kNm, Vd_kN: x.Vd_kN,
    perfil: x.perfil, fy_MPa: x.fy_MPa, beta_x: x.beta_x, beta_y: x.beta_y,
    s_cm: x.s_cm, lp_cm: x.lp_cm, bp_cm: x.bp_cm, tp_mm: x.tp_mm,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = detectSafetyRisks(
    EMPRESILLADO_SAFETY_RULES, changes, fields, current, empresalladoDefaults, confirmed,
  );
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

type StateKey = Exclude<keyof EmpresalladoInputs, 'title'>;

const SNAPSHOT_FIELDS: Readonly<Record<PayloadKey, StateKey>> = {
  bc_cm: 'bc',
  hc_cm: 'hc',
  L_m: 'L',
  N_Ed_kN: 'N_Ed',
  Mx_kNm: 'Mx_Ed',
  My_kNm: 'My_Ed',
  Vd_kN: 'Vd',
  perfil: 'perfil',
  fy_MPa: 'fy',
  beta_x: 'beta_x',
  beta_y: 'beta_y',
  s_cm: 's',
  lp_cm: 'lp',
  bp_cm: 'bp',
  tp_mm: 'tp',
};

function buildSnapshot(c: EmpresalladoInputs): string {
  const valores: Record<string, number | string> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    valores[key] = value;
    if (value === empresalladoDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/**
 * Resume el resultado del motor de empresillado (`CheckRow[]` estándar).
 * Discriminador de cálculo no válido: `error != null` — que aquí cubre además el
 * caso "N_Ed próximo a la carga crítica" (amplificación de segundo orden
 * divergente), que NO es un fallo de comprobación sino un cálculo imposible.
 */
export function summarizeEmpresalladoResults(r: EmpresalladoResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(r);
  return summarizeCalcResults(r, [
    `Cordón más comprimido: N_chord = ${r.N_chord_max.toFixed(1)} kN `
      + `(pandeo local N_bv,Rd = ${r.N_bv_Rd.toFixed(1)} kN)`,
    `Segundo orden: MEd,II = ${r.MEd_IIX.toFixed(2)} / ${r.MEd_IIY.toFixed(2)} kNm (ejes X/Y) `
      + `→ VEd = ${r.V_Ed.toFixed(1)} kN sobre las presillas`,
    `Pandeo global: χ = ${r.chi.toFixed(3)} → N_b,Rd = ${r.N_b_Rd.toFixed(1)} kN`,
  ]);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const empresalladoAdapter: AiModuleAdapter<EmpresalladoInputs> = {
  id: 'empresillado',
  label: 'Empresillado de pilar',
  payloadSchema: EMPRESILLADO_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildEmpresalladoPlan(parsePayload(payload), current, system, confirmed),
};
