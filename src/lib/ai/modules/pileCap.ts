/**
 * Adapter del asistente IA para el módulo Encepados de micropilotes (ola 1).
 * Payload en unidades "humanas" (mm, kN, kNm, MPa) que aquí COINCIDEN con las
 * internas de `PileCapInputs` → el mapper no convierte.
 *
 * Particularidades del módulo frente a zapatas (su calco más cercano):
 * - `n` (2|3|4) es un GATE: decide las posiciones de los pilotes y qué tirantes
 *   existen. Va PRIMERO en el orden de aplicación.
 * - Los momentos entran CON SIGNO en Navier (a diferencia de zapatas, donde el
 *   motor trabaja con el valor absoluto): NO se normalizan.
 * - Con n=2 (pilotes alineados en x, Σyi²=0) un Mx ≠ 0 es estáticamente
 *   inadmisible y el motor devuelve `error`. El mapper lo comprueba sobre el
 *   estado COMBINADO (vigente + propuesto) para no aplicar en silencio una
 *   pareja de valores que invalida el cálculo.
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectSafetyRisks,
  higherIsSafer,
  lowerIsSafer,
  magnitudeIsSafer,
  type SafetyRule,
} from '../safety';
import type { PileCapResult } from '../../calculations/pileCap';
import { pileCapDefaults, type PileCapInputs } from '../../../data/defaults';
import { availableFck } from '../../../data/materials';
import { availableBarDiams } from '../../../data/rebar';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
// El motor rechaza fck fuera de 20–50 MPa (`calcPileCap`), así que el catálogo
// del módulo es el de hormigones MENOS los HA-12/HA-16 de `availableFck`.
const FCK_OPTIONS: readonly number[] = availableFck.filter((f) => f >= 20 && f <= 50);
// fyk divergente por módulo: el panel solo ofrece 500/400 (como zapatas, sin 600).
const FYK_OPTIONS: readonly number[] = [400, 500];
const N_OPTIONS: readonly number[] = [2, 3, 4];

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const PILE_CAP_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'n', 'd_p_mm', 's_mm', 'h_enc_mm', 'b_col_mm', 'h_col_mm',
    'fck_MPa', 'fyk_MPa', 'cover_mm', 'phi_tie_mm',
    'N_Ed_kN', 'Mx_kNm', 'My_kNm', 'R_adm_kN', 'warnings',
  ],
  properties: {
    n: { type: ['integer', 'null'], enum: [...N_OPTIONS, null], description: 'Número de micropilotes del encepado: 2, 3 ó 4. Con 2 van alineados en x; con 3 forman triángulo equilátero; con 4, cuadrado.' },
    d_p_mm: { type: ['number', 'null'], description: 'Diámetro del micropilote en mm.' },
    s_mm: { type: ['number', 'null'], description: 'Separación entre ejes de micropilotes (centro a centro) en mm.' },
    h_enc_mm: { type: ['number', 'null'], description: 'Canto del encepado en mm.' },
    b_col_mm: { type: ['number', 'null'], description: 'Ancho del pilar (dirección x) en mm. Un "pilar de 40×40 cm" son 400 mm.' },
    h_col_mm: { type: ['number', 'null'], description: 'Canto del pilar (dirección y) en mm.' },
    fck_MPa: { type: ['integer', 'null'], enum: [...FCK_OPTIONS, null], description: 'Resistencia característica del hormigón del encepado en MPa (HA-25 → 25). Solo 20–50.' },
    fyk_MPa: { type: ['integer', 'null'], enum: [...FYK_OPTIONS, null], description: 'Límite elástico del acero de armar en MPa (B500S → 500). Este módulo solo admite 400 o 500.' },
    cover_mm: { type: ['integer', 'null'], description: 'Recubrimiento inferior hasta el centro de gravedad del tirante, en mm.' },
    phi_tie_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'Diámetro de las barras del tirante, en mm.' },
    N_Ed_kN: { type: ['number', 'null'], description: 'Axil de cálculo N_Ed en kN (ELU, compresión positiva).' },
    Mx_kNm: { type: ['number', 'null'], description: 'Momento de cálculo alrededor del eje x, en kNm. CON SIGNO (entra en la fórmula de Navier). Con n=2 debe ser 0.' },
    My_kNm: { type: ['number', 'null'], description: 'Momento de cálculo alrededor del eje y, en kNm. CON SIGNO.' },
    R_adm_kN: { type: ['number', 'null'], description: 'Resistencia de cálculo a compresión de UN micropilote (R_c,Rd) en kN. La fija el estudio geotécnico o el fabricante.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Encepados de micropilotes:
1. TODAS las longitudes van en MILÍMETROS (diámetro del pilote, separación, canto del encepado, pilar, recubrimiento, diámetro del tirante). Los enunciados suelen dar el pilar y el canto en cm o m ("pilar de 40×40 cm", "encepado de 80 cm de canto"): convierte a mm (400 mm, 800 mm) y añade un warning con la conversión.
2. Las acciones (N_Ed_kN, Mx_kNm, My_kNm) son de CÁLCULO, YA MAYORADAS (ELU). Si el enunciado da cargas características o de servicio, mayóralas antes de proponerlas (γG=1.35 / γQ=1.5 salvo que el enunciado indique otra cosa) y dilo en un warning.
3. Los momentos entran CON SIGNO: no los pases a valor absoluto.
4. n (2, 3 ó 4 micropilotes) condiciona toda la geometría. Con n=2 los pilotes van alineados en el eje x y Mx debe ser 0: un Mx ≠ 0 es estáticamente inadmisible (el cálculo no es válido). Si el enunciado trae momento en las dos direcciones, propón n=4.
5. R_adm_kN es la resistencia de cálculo a compresión de UN micropilote: la fija el estudio geotécnico o el fabricante del micropilote, no este cálculo.
6. En este módulo son DATOS del problema, no variables de diseño: las acciones (N_Ed, Mx, My), la resistencia del micropilote (R_adm) y el recubrimiento (lo fija la durabilidad). Para que el encepado cumpla actúa SIEMPRE sobre su GEOMETRÍA y su ARMADO: más canto (h_enc, es lo que endereza la biela), mayor separación entre pilotes, más micropilotes, hormigón de más resistencia, tirante de mayor diámetro. NUNCA rebajes una carga ni subas R_adm para que salga el cálculo.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Encepado de 2 micropilotes de Ø220 separados 1.20 m para un pilar de 40×40 cm '
  + 'con N_Ed = 600 kN. Canto 80 cm, HA-25 y B500S. Cada micropilote resiste 250 kN.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface PileCapPayload {
  n: number | null;
  d_p_mm: number | null;
  s_mm: number | null;
  h_enc_mm: number | null;
  b_col_mm: number | null;
  h_col_mm: number | null;
  fck_MPa: number | null;
  fyk_MPa: number | null;
  cover_mm: number | null;
  phi_tie_mm: number | null;
  N_Ed_kN: number | null;
  Mx_kNm: number | null;
  My_kNm: number | null;
  R_adm_kN: number | null;
  warnings: string[];
}

/** número finito o null (NaN/Infinity/tipo incorrecto → null, defensivo). */
function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parsePayload(raw: unknown): PileCapPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    n: finiteNumber(r.n),
    d_p_mm: finiteNumber(r.d_p_mm),
    s_mm: finiteNumber(r.s_mm),
    h_enc_mm: finiteNumber(r.h_enc_mm),
    b_col_mm: finiteNumber(r.b_col_mm),
    h_col_mm: finiteNumber(r.h_col_mm),
    fck_MPa: finiteNumber(r.fck_MPa),
    fyk_MPa: finiteNumber(r.fyk_MPa),
    cover_mm: finiteNumber(r.cover_mm),
    phi_tie_mm: finiteNumber(r.phi_tie_mm),
    N_Ed_kN: finiteNumber(r.N_Ed_kN),
    Mx_kNm: finiteNumber(r.Mx_kNm),
    My_kNm: finiteNumber(r.My_kNm),
    R_adm_kN: finiteNumber(r.R_adm_kN),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  n: 'Nº de micropilotes',
  d_p_mm: 'Diámetro del micropilote',
  s_mm: 'Separación entre pilotes s',
  h_enc_mm: 'Canto del encepado',
  b_col_mm: 'Ancho de pilar b',
  h_col_mm: 'Canto de pilar h',
  fck_MPa: 'Hormigón fck',
  fyk_MPa: 'Acero fyk',
  cover_mm: 'Recubrimiento',
  phi_tie_mm: 'Diámetro del tirante',
  N_Ed_kN: 'Axil N_Ed',
  Mx_kNm: 'Momento Mx',
  My_kNm: 'Momento My',
  R_adm_kN: 'Resistencia del micropilote R_c,Rd',
} as const;

type PayloadKey = keyof typeof LABELS;

/** ORDER del contrato: `n` PRIMERO (gate de geometría y de tirantes). */
const KEY_ORDER: readonly PayloadKey[] = [
  'n', 'd_p_mm', 's_mm', 'h_enc_mm', 'b_col_mm', 'h_col_mm',
  'fck_MPa', 'fyk_MPa', 'cover_mm', 'phi_tie_mm',
  'N_Ed_kN', 'Mx_kNm', 'My_kNm', 'R_adm_kN',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

/**
 * Campos de encepados que NO son variables de diseño. La geometría del encepado
 * (n, d_p, s, h_enc) y el armado SÍ lo son: subir el canto o separar los pilotes
 * es la salida legítima cuando la biela no cumple.
 *
 * Los momentos usan `magnitudeIsSafer` (no `higherIsSafer`): entran CON SIGNO en
 * Navier, así que lo que rebaja la demanda es reducir su MÓDULO, y cambiar el
 * signo no debe marcarse como riesgo.
 */
export const PILE_CAP_SAFETY_RULES: ReadonlyArray<SafetyRule<PileCapInputs>> = [
  {
    field: 'N_Ed',
    confirmKey: 'N_Ed_kN',
    level: higherIsSafer,
    why: 'El axil lo fija el análisis de la estructura: rebajarlo baja la reacción de cada micropilote y la tracción del tirante.',
  },
  {
    field: 'Mx_Ed',
    confirmKey: 'Mx_kNm',
    level: magnitudeIsSafer,
    why: 'El momento Mx lo fija el análisis de la estructura: rebajarlo descarga el micropilote más solicitado.',
  },
  {
    field: 'My_Ed',
    confirmKey: 'My_kNm',
    level: magnitudeIsSafer,
    why: 'El momento My lo fija el análisis de la estructura: rebajarlo descarga el micropilote más solicitado.',
  },
  {
    field: 'R_adm',
    confirmKey: 'R_adm_kN',
    level: lowerIsSafer, // peligroso AUMENTARLA
    why: 'La resistencia de cálculo del micropilote la fijan el estudio geotécnico y el fabricante: subirla hace que el encepado "cumpla" sin tocar el encepado.',
  },
  {
    field: 'cover',
    confirmKey: 'cover_mm',
    level: higherIsSafer,
    why: 'El recubrimiento lo fija la durabilidad (CE Anejo 19 §4.4), no la comprobación resistente: reducirlo aumenta el canto útil y, con él, la resistencia calculada.',
  },
];

const fmtMm = (mm: number) => `${mm} mm`;

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export const N2_MX_SKIP_REASON =
  'Con 2 micropilotes alineados en x, un Mx ≠ 0 es estáticamente inadmisible '
  + '(el cálculo no sería válido). Usa 4 micropilotes para momento en las dos direcciones.';

export const N2_MX_PENDING_WARNING =
  'Con 2 micropilotes el momento Mx debe ser 0, y el valor actual del formulario no lo es: '
  + 'el cálculo será inválido hasta que pongas Mx = 0 o pases a 4 micropilotes.';

/**
 * Payload (unidades humanas = internas aquí) → plan sobre PileCapInputs.
 * Nunca aplica en silencio: fuera de rango / fuera de catálogo / igual al actual
 * → `skipped` con motivo. NUNCA produce `title`.
 */
function buildPileCapPlan(
  x: PileCapPayload,
  current: PileCapInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<PileCapInputs> {
  const fields: Partial<PileCapInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof PileCapInputs>(
    key: PayloadKey,
    field: K,
    value: PileCapInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  /** Longitud en mm: rango → skip; redondeo a entero; ALREADY exacto. */
  function applyMm(
    key: PayloadKey,
    field: 'd_p' | 's' | 'h_enc' | 'b_col' | 'h_col' | 'cover',
    value: number | null,
    min: number,
    max: number,
  ): void {
    if (value === null) return;
    if (value < min || value > max) {
      skip(key, rangeReason(value, min, max, 'mm'));
      return;
    }
    const v = Math.round(value);
    const before = current[field];
    if (v === before) skip(key, ALREADY);
    else apply(key, field, v, fmtMm(before), fmtMm(v));
  }

  const fmtForce = (v: number) => formatQuantity(v, 'force', system);
  const fmtMoment = (v: number) => formatQuantity(v, 'moment', system);

  // --- n PRIMERO (gate de geometría: posiciones y tirantes existentes) ---
  if (x.n !== null) {
    if (!N_OPTIONS.includes(x.n)) {
      skip('n', `El encepado solo admite 2, 3 ó 4 micropilotes (propuesto: ${x.n})`);
    } else if (x.n === current.n) {
      skip('n', ALREADY);
    } else {
      apply('n', 'n', x.n, `${current.n} micropilotes`, `${x.n} micropilotes`);
    }
  }
  const nFinal = (fields.n ?? current.n) as number;

  // --- Geometría (mm) ---
  applyMm('d_p_mm', 'd_p', x.d_p_mm, 60, 600);
  applyMm('s_mm', 's', x.s_mm, 200, 6000);
  applyMm('h_enc_mm', 'h_enc', x.h_enc_mm, 200, 3000);
  applyMm('b_col_mm', 'b_col', x.b_col_mm, 100, 2000);
  applyMm('h_col_mm', 'h_col', x.h_col_mm, 100, 2000);
  applyMm('cover_mm', 'cover', x.cover_mm, 20, 150);

  // --- Materiales contra catálogo ---
  if (x.fck_MPa !== null) {
    if (!FCK_OPTIONS.includes(x.fck_MPa)) {
      skip('fck_MPa', `HA-${x.fck_MPa} no está en el catálogo del módulo (${FCK_OPTIONS.join(', ')} MPa)`);
    } else if (x.fck_MPa === current.fck) {
      skip('fck_MPa', ALREADY);
    } else {
      apply('fck_MPa', 'fck', x.fck_MPa, `HA-${current.fck}`, `HA-${x.fck_MPa}`);
    }
  }
  if (x.fyk_MPa !== null) {
    if (!FYK_OPTIONS.includes(x.fyk_MPa)) {
      skip('fyk_MPa', `fyk ${x.fyk_MPa} MPa no disponible en este módulo (solo 400 o 500 MPa)`);
    } else if (x.fyk_MPa === current.fyk) {
      skip('fyk_MPa', ALREADY);
    } else {
      apply('fyk_MPa', 'fyk', x.fyk_MPa, `B${current.fyk}`, `B${x.fyk_MPa}`);
    }
  }
  if (x.phi_tie_mm !== null) {
    if (!availableBarDiams.includes(x.phi_tie_mm)) {
      skip('phi_tie_mm', `Ø${x.phi_tie_mm} no es un diámetro del catálogo (Ø${availableBarDiams.join(', Ø')})`);
    } else if (x.phi_tie_mm === current.phi_tie) {
      skip('phi_tie_mm', ALREADY);
    } else {
      apply('phi_tie_mm', 'phi_tie', x.phi_tie_mm, `Ø${current.phi_tie} mm`, `Ø${x.phi_tie_mm} mm`);
    }
  }

  // --- Acciones (kN / kNm, sin conversión) ---
  if (x.N_Ed_kN !== null) {
    if (x.N_Ed_kN <= 0 || x.N_Ed_kN > 50000) {
      skip('N_Ed_kN', rangeReason(x.N_Ed_kN, 1, 50000, 'kN'));
    } else {
      const v = round2(x.N_Ed_kN);
      if (Math.abs(v - current.N_Ed) <= EPS) skip('N_Ed_kN', ALREADY);
      else apply('N_Ed_kN', 'N_Ed', v, fmtForce(current.N_Ed), fmtForce(v));
    }
  }

  /**
   * Momentos CON SIGNO (Navier). Trampa n=2: Σyi² = 0, así que un Mx ≠ 0 no
   * tiene solución estática y el motor devuelve error. Se evalúa contra el `n`
   * FINAL (vigente + propuesto).
   */
  function applyMoment(key: 'Mx_kNm' | 'My_kNm', field: 'Mx_Ed' | 'My_Ed', value: number | null): void {
    if (value === null) return;
    if (Math.abs(value) > 20000) {
      skip(key, rangeReason(value, -20000, 20000, 'kNm'));
      return;
    }
    const v = round2(value);
    if (key === 'Mx_kNm' && nFinal === 2 && Math.abs(v) > EPS) {
      skip(key, N2_MX_SKIP_REASON);
      return;
    }
    if (Math.abs(v - current[field]) <= EPS) skip(key, ALREADY);
    else apply(key, field, v, fmtMoment(current[field]), fmtMoment(v));
  }
  applyMoment('Mx_kNm', 'Mx_Ed', x.Mx_kNm);
  applyMoment('My_kNm', 'My_Ed', x.My_kNm);

  // Mx incompatible que NO viene en la propuesta (p. ej. se propone n=2 sobre un
  // estado con Mx ≠ 0): no hay campo que saltar, pero el cálculo quedaría
  // inválido → aviso destacado.
  const mxFinal = fields.Mx_Ed ?? current.Mx_Ed;
  if (nFinal === 2 && Math.abs(mxFinal) > EPS && !handled.has('Mx_kNm')) {
    warnings.push(N2_MX_PENDING_WARNING);
  }

  if (x.R_adm_kN !== null) {
    if (x.R_adm_kN <= 0 || x.R_adm_kN > 20000) {
      skip('R_adm_kN', rangeReason(x.R_adm_kN, 1, 20000, 'kN'));
    } else {
      const v = round2(x.R_adm_kN);
      if (Math.abs(v - current.R_adm) <= EPS) skip('R_adm_kN', ALREADY);
      else apply('R_adm_kN', 'R_adm', v, fmtForce(current.R_adm), fmtForce(v));
    }
  }

  // --- notFound: claves null no resueltas por el mapper ---
  const values: Record<PayloadKey, unknown> = {
    n: x.n, d_p_mm: x.d_p_mm, s_mm: x.s_mm, h_enc_mm: x.h_enc_mm,
    b_col_mm: x.b_col_mm, h_col_mm: x.h_col_mm,
    fck_MPa: x.fck_MPa, fyk_MPa: x.fyk_MPa, cover_mm: x.cover_mm, phi_tie_mm: x.phi_tie_mm,
    N_Ed_kN: x.N_Ed_kN, Mx_kNm: x.Mx_kNm, My_kNm: x.My_kNm, R_adm_kN: x.R_adm_kN,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = detectSafetyRisks(
    PILE_CAP_SAFETY_RULES, changes, fields, current, pileCapDefaults, confirmed,
  );
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

// Solo claves NUMÉRICAS del estado: fuera `title`, el flag `dims_auto` con sus
// cotas manuales L_x/L_y, y la placa de reparto (plate_*) — la IA trabaja con
// la geometría del grupo, no con las cotas del encepado ni el detalle de cabeza.
type StateKey = Exclude<
  keyof PileCapInputs,
  'title' | 'dims_auto' | 'L_x' | 'L_y' | 'plate_on' | 'plate_shape' | 'd_plate'
>;

const SNAPSHOT_FIELDS: Readonly<Record<PayloadKey, StateKey>> = {
  n: 'n',
  d_p_mm: 'd_p',
  s_mm: 's',
  h_enc_mm: 'h_enc',
  b_col_mm: 'b_col',
  h_col_mm: 'h_col',
  fck_MPa: 'fck',
  fyk_MPa: 'fyk',
  cover_mm: 'cover',
  phi_tie_mm: 'phi_tie',
  N_Ed_kN: 'N_Ed',
  Mx_kNm: 'Mx_Ed',
  My_kNm: 'My_Ed',
  R_adm_kN: 'R_adm',
};

function buildSnapshot(c: PileCapInputs): string {
  const valores: Record<string, number> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    valores[key] = value;
    if (value === pileCapDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/**
 * Resume el resultado del motor de encepados. Discriminador de cálculo no
 * válido: `error != null` (nunca `valid`). Los extras dan las dos magnitudes
 * que gobiernan el dimensionado: la reacción del pilote más cargado frente a su
 * resistencia y el ángulo de la biela (que se endereza subiendo el canto).
 */
export function summarizePileCapResults(r: PileCapResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(r);
  const extras = [
    `Reacción máxima R_max = ${r.R_max.toFixed(1)} kN (mínima ${r.R_min.toFixed(1)} kN)`,
    `Ángulo de biela θ = ${r.theta_deg.toFixed(1)}° (admisible 26.5°–63.5°; sube h_enc para enderezarla)`,
  ];
  if (r.R_min < 0) {
    extras.push('Hay micropilotes a TRACCIÓN: su resistencia a tracción no la comprueba este módulo.');
  }
  return summarizeCalcResults(r, extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const pileCapAdapter: AiModuleAdapter<PileCapInputs> = {
  id: 'pile-cap',
  label: 'Encepado de micropilotes',
  payloadSchema: PILE_CAP_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildPileCapPlan(parsePayload(payload), current, system, confirmed),
};
