/**
 * Adapter del asistente IA para el módulo Cimentación/Zapata aislada (T2.4).
 * Payload en unidades "humanas" (geometría en m, recubrimiento/separaciones en
 * mm, sigma_adm en kPa) — que aquí coinciden con las unidades internas del
 * estado (`IsolatedFootingInputs`), por lo que el mapper NO convierte.
 *
 * Sin `minimum`/`maximum` en el schema (no soportados en structured outputs de
 * todos los proveedores) — los rangos se validan en cliente (`buildPlan`).
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectResolvedRisks,
  detectSafetyRisks,
  higherIsSafer,
  lowerIsSafer,
  type ResolvedSafetyRule,
  type SafetyRule,
} from '../safety';
import type { DistributionType, IsolatedFootingResult } from '../../calculations/isolatedFooting';
import { isolatedFootingDefaults, type IsolatedFootingInputs } from '../../../data/defaults';
import { availableFck } from '../../../data/materials';
import { availableBarDiams } from '../../../data/rebar';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
// fyk divergente por módulo: el panel de zapatas solo ofrece 500/400 (NO 600).
const FYK_OPTIONS: readonly number[] = [400, 500];

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const ISOLATED_FOOTING_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'loadsAreFactored', 'loadFactor', 'N_kN', 'Mx_kNm', 'My_kNm', 'H_kN',
    'B_m', 'L_m', 'h_m', 'bc_m', 'hc_m', 'Df_m', 'cover_mm', 'sigma_adm_kPa',
    'fck_MPa', 'fyk_MPa', 'phi_x_mm', 's_x_mm', 'phi_y_mm', 's_y_mm',
    'gamma_soil_kN_m3', 'mu_friction', 'warnings',
  ],
  properties: {
    loadsAreFactored: { type: ['boolean', 'null'], description: 'Naturaleza de las cargas: false = de servicio/característica/sin mayorar (N_k); true = de cálculo/mayoradas/ELU (N_d). null si el enunciado no lo deja claro (en ese caso pregunta en reply y deja también las cargas en null).' },
    loadFactor: { type: ['number', 'null'], description: 'Coeficiente global de mayoración γ entre servicio y cálculo. SOLO si el enunciado lo da explícitamente.' },
    N_kN: { type: ['number', 'null'], description: 'Axil vertical N en kN (compresión positiva).' },
    Mx_kNm: { type: ['number', 'null'], description: 'Momento alrededor del eje x, en kNm.' },
    My_kNm: { type: ['number', 'null'], description: 'Momento alrededor del eje y, en kNm.' },
    H_kN: { type: ['number', 'null'], description: 'Carga horizontal H en kN (para deslizamiento).' },
    B_m: { type: ['number', 'null'], description: 'Ancho de la zapata B (dirección x) en METROS.' },
    L_m: { type: ['number', 'null'], description: 'Largo de la zapata L (dirección y) en METROS.' },
    h_m: { type: ['number', 'null'], description: 'Canto de la zapata h en METROS.' },
    bc_m: { type: ['number', 'null'], description: 'Ancho del pilar bc (dirección x) en METROS.' },
    hc_m: { type: ['number', 'null'], description: 'Canto del pilar hc (dirección y) en METROS.' },
    Df_m: { type: ['number', 'null'], description: 'Profundidad de cimentación Df desde el terreno natural, en METROS.' },
    cover_mm: { type: ['integer', 'null'], description: 'Recubrimiento geométrico en mm.' },
    sigma_adm_kPa: { type: ['number', 'null'], description: 'Tensión admisible del terreno en kPa (del estudio geotécnico).' },
    fck_MPa: { type: ['integer', 'null'], enum: [...availableFck, null], description: 'Resistencia característica del hormigón en MPa (HA-25 → 25).' },
    fyk_MPa: { type: ['integer', 'null'], enum: [...FYK_OPTIONS, null], description: 'Límite elástico del acero de armar en MPa (B500S → 500). Este módulo solo admite 400 o 500.' },
    phi_x_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'Diámetro de las barras en dirección x, en mm.' },
    s_x_mm: { type: ['integer', 'null'], description: 'Separación entre ejes de las barras en dirección x, en mm.' },
    phi_y_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'Diámetro de las barras en dirección y, en mm.' },
    s_y_mm: { type: ['integer', 'null'], description: 'Separación entre ejes de las barras en dirección y, en mm.' },
    gamma_soil_kN_m3: { type: ['number', 'null'], description: 'Peso específico del terreno sobre la zapata, en kN/m³.' },
    mu_friction: { type: ['number', 'null'], description: 'Coeficiente de rozamiento zapata-terreno (adimensional).' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Zapata aislada:
1. Geometría de la ZAPATA (B_m, L_m, h_m, Df_m) y del PILAR (bc_m, hc_m) en METROS. Los pilares suelen enunciarse en cm ("pilar de 40×40") — convierte a metros (0.40) y añade un warning con la conversión. El recubrimiento (cover_mm) y las separaciones de barras (s_x_mm, s_y_mm) van en mm.
2. Cargas: N_kN (axil vertical, kN), Mx_kNm y My_kNm (momentos, kNm) y H_kN (horizontal, kN) son datos de entrada directos del módulo.
3. loadsAreFactored: si el enunciado dice "característica", "de servicio", "sin mayorar" o usa N_k → false. Si dice "de cálculo", "mayoradas", "ELU" o usa N_d → true. Si NO está claro, pregunta en "reply" y deja las cargas Y loadsAreFactored en null: no propongas cargas sin conocer su naturaleza.
4. loadFactor SOLO si el enunciado da un coeficiente γ global explícito entre servicio y cálculo. Si no, null.
5. sigma_adm_kPa: tensión admisible del terreno (estudio geotécnico), en kPa. Si viene en kg/cm², multiplica por 98.07 (2 kg/cm² ≈ 196 kPa) y añade un warning con la conversión. Si viene en MPa o N/mm², multiplica por 1000.
6. Momento "M" sin eje indicado: pregunta en "reply" a qué eje se refiere y deja Mx_kNm y My_kNm en null (Mx es el momento alrededor del eje x).
7. En este módulo son DATOS del problema, no variables de diseño: las cargas (N_kN, Mx_kNm, My_kNm, H_kN), su naturaleza (loadsAreFactored) y su coeficiente (loadFactor), los datos del terreno (sigma_adm_kPa, mu_friction — los fija el estudio geotécnico) y el recubrimiento (cover_mm — lo fija la clase de exposición por durabilidad). Para hacer que la zapata cumpla actúa SIEMPRE sobre la GEOMETRÍA y el ARMADO: zapata mayor (B_m, L_m), más canto (h_m), más armadura o de mayor diámetro. NUNCA rebajes una carga, ni subas la tensión admisible del terreno o el rozamiento, ni marques como "mayoradas" unas cargas de servicio, para que salga el cálculo.
8. DOS REGLAS GEOMÉTRICAS que el cálculo exige (romperlas deja el módulo en "Datos no válidos"): (a) el canto de la zapata NO puede superar la profundidad de cimentación: h_m ≤ Df_m. Si para el punzonamiento o el cortante necesitas MÁS canto que la Df actual, propón en el MISMO turno una Df_m mayor (es una excavación más profunda) y dilo en "reply". (b) El pilar debe ser MENOR que la zapata: bc_m < B_m y hc_m < L_m. Si agrandas el pilar, comprueba que la zapata sigue siendo mayor.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Zapata aislada para un pilar de 40×40 cm con N = 600 kN y Mx = 45 kNm en servicio. ' +
  'Tensión admisible del terreno 200 kPa, canto 60 cm, hormigón HA-25 y acero B500S.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface IsolatedFootingPayload {
  loadsAreFactored: boolean | null;
  loadFactor: number | null;
  N_kN: number | null;
  Mx_kNm: number | null;
  My_kNm: number | null;
  H_kN: number | null;
  B_m: number | null;
  L_m: number | null;
  h_m: number | null;
  bc_m: number | null;
  hc_m: number | null;
  Df_m: number | null;
  cover_mm: number | null;
  sigma_adm_kPa: number | null;
  fck_MPa: number | null;
  fyk_MPa: number | null;
  phi_x_mm: number | null;
  s_x_mm: number | null;
  phi_y_mm: number | null;
  s_y_mm: number | null;
  gamma_soil_kN_m3: number | null;
  mu_friction: number | null;
  warnings: string[];
}

/** número finito o null (NaN/Infinity/tipo incorrecto → null, defensivo). */
function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Normaliza el payload crudo del LLM. raw no-objeto → AiError('bad-response');
 * campo con tipo incorrecto → null (defensivo, no throw). Los enums (fck, fyk,
 * diámetros) NO se filtran aquí: el mapper los valida contra catálogo para
 * poder explicar el skip.
 */
function parsePayload(raw: unknown): IsolatedFootingPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    loadsAreFactored: typeof r.loadsAreFactored === 'boolean' ? r.loadsAreFactored : null,
    loadFactor: finiteNumber(r.loadFactor),
    N_kN: finiteNumber(r.N_kN),
    Mx_kNm: finiteNumber(r.Mx_kNm),
    My_kNm: finiteNumber(r.My_kNm),
    H_kN: finiteNumber(r.H_kN),
    B_m: finiteNumber(r.B_m),
    L_m: finiteNumber(r.L_m),
    h_m: finiteNumber(r.h_m),
    bc_m: finiteNumber(r.bc_m),
    hc_m: finiteNumber(r.hc_m),
    Df_m: finiteNumber(r.Df_m),
    cover_mm: finiteNumber(r.cover_mm),
    sigma_adm_kPa: finiteNumber(r.sigma_adm_kPa),
    fck_MPa: finiteNumber(r.fck_MPa),
    fyk_MPa: finiteNumber(r.fyk_MPa),
    phi_x_mm: finiteNumber(r.phi_x_mm),
    s_x_mm: finiteNumber(r.s_x_mm),
    phi_y_mm: finiteNumber(r.phi_y_mm),
    s_y_mm: finiteNumber(r.s_y_mm),
    gamma_soil_kN_m3: finiteNumber(r.gamma_soil_kN_m3),
    mu_friction: finiteNumber(r.mu_friction),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

// Labels españoles propios del módulo.
const LABELS = {
  loadsAreFactored: 'Tipo de cargas (sin mayorar/mayoradas)',
  loadFactor: 'Coef. de mayoración γ',
  N_kN: 'Axil N',
  Mx_kNm: 'Momento Mx',
  My_kNm: 'Momento My',
  H_kN: 'Horizontal H',
  B_m: 'Ancho de zapata B',
  L_m: 'Largo de zapata L',
  h_m: 'Canto de zapata h',
  bc_m: 'Ancho de pilar bc',
  hc_m: 'Canto de pilar hc',
  Df_m: 'Profundidad Df',
  cover_mm: 'Recubrimiento',
  sigma_adm_kPa: 'Tensión admisible σadm',
  fck_MPa: 'Hormigón fck',
  fyk_MPa: 'Acero fyk',
  phi_x_mm: 'Diámetro barras x',
  s_x_mm: 'Separación barras x',
  phi_y_mm: 'Diámetro barras y',
  s_y_mm: 'Separación barras y',
  gamma_soil_kN_m3: 'Peso específico del terreno',
  mu_friction: 'Coef. de rozamiento μ',
} as const;

type PayloadKey = keyof typeof LABELS;

// ORDER del contrato (loadsAreFactored PRIMERO), en claves del payload.
const KEY_ORDER: readonly PayloadKey[] = [
  'loadsAreFactored', 'loadFactor', 'N_kN', 'Mx_kNm', 'My_kNm', 'H_kN',
  'B_m', 'L_m', 'h_m', 'bc_m', 'hc_m', 'Df_m', 'cover_mm', 'sigma_adm_kPa',
  'fck_MPa', 'fyk_MPa', 'phi_x_mm', 's_x_mm', 'phi_y_mm', 's_y_mm',
  'gamma_soil_kN_m3', 'mu_friction',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

/**
 * Campos de zapatas que NO son variables de diseño: los fija el análisis de la
 * estructura (cargas), el estudio geotécnico (σadm, μ) o la durabilidad
 * (recubrimiento). Bajar su nivel hace que la zapata cumpla sin tocar la zapata
 * (ver safety.ts). La geometría (B, L, h, Df) y el armado SÍ son diseño —
 * agrandar la zapata es la salida legítima — y por eso no tienen regla.
 *
 * OJO al doble papel del axil: N es desfavorable para la tensión sobre el
 * terreno (el caso que suele gobernar) pero ESTABILIZADOR frente a vuelco y
 * deslizamiento. La regla marca la bajada, que es la que hace "entrar" la
 * tensión admisible — el patrón de trampa realista.
 */
export const FOOTING_SAFETY_RULES: ReadonlyArray<SafetyRule<IsolatedFootingInputs>> = [
  {
    // FUGA 4 (auditoría 2026-07-14): `gamma_soil` no tenía regla. Las tierras sobre
    // la zapata pesan: W_soil = γ·(Df−h)·(B·L − bc·hc) se SUMA al axil de servicio
    // (isolatedFooting.ts:357), que es la demanda del hundimiento — la comprobación
    // que dimensiona la zapata. Aligerar el terreno la descarga.
    field: 'gamma_soil_kN_m3', // payload `gamma_soil_kN_m3`: mismo nombre ⇒ sin confirmKey
    level: higherIsSafer,
    why: 'El peso específico del terreno sobre la zapata es dato del estudio geotécnico: rebajarlo aligera las tierras que gravitan sobre la puntera, baja el axil total de servicio y con él la tensión σmax del hundimiento, que es la comprobación que dimensiona la zapata.',
  },
  {
    field: 'N',
    confirmKey: 'N_kN',
    level: higherIsSafer,
    why: 'El axil lo fija el análisis de la estructura: rebajarlo baja la tensión transmitida al terreno y el armado necesario.',
  },
  {
    field: 'Mx',
    confirmKey: 'Mx_kNm',
    level: higherIsSafer,
    why: 'El momento Mx lo fija el análisis de la estructura: rebajarlo reduce la excentricidad y, con ella, la tensión de borde y el vuelco.',
  },
  {
    field: 'My',
    confirmKey: 'My_kNm',
    level: higherIsSafer,
    why: 'El momento My lo fija el análisis de la estructura: rebajarlo reduce la excentricidad y, con ella, la tensión de borde y el vuelco.',
  },
  {
    field: 'H',
    confirmKey: 'H_kN',
    level: higherIsSafer,
    why: 'La carga horizontal la fija el análisis de la estructura: rebajarla reduce la demanda de deslizamiento.',
  },
  {
    field: 'sigma_adm',
    confirmKey: 'sigma_adm_kPa',
    level: lowerIsSafer, // peligroso AUMENTARLA
    why: 'La tensión admisible del terreno la fija el estudio geotécnico: subirla hace que la zapata "cumpla" sin tocar la zapata.',
  },
  {
    field: 'mu_friction', // payload `mu_friction`: mismo nombre ⇒ sin confirmKey
    level: lowerIsSafer, // peligroso AUMENTARLO
    why: 'El coeficiente de rozamiento zapata-terreno lo fija el estudio geotécnico: subirlo aumenta artificialmente la resistencia al deslizamiento.',
  },
  {
    field: 'cover',
    confirmKey: 'cover_mm',
    level: higherIsSafer,
    why: 'El recubrimiento lo fija la clase de exposición por durabilidad (CE Anejo 19 §4.4), no la comprobación resistente: reducirlo aumenta el canto útil y, con él, la resistencia calculada.',
  },
];

/**
 * BUG DE DIRECCIÓN INVERTIDA (auditoría 2026-07-14) — el par (loadsAreFactored, γ).
 *
 * `loadFactor` tenía `higherIsSafer` + `alwaysCheck`, y con el toggle en "sin
 * mayorar" era correcto: el motor hace N_elu = N·γ, así que bajar γ rebaja la
 * demanda de cálculo. Pero con el toggle en "MAYORADAS" el motor **divide**:
 * N_sls = N/γ (isolatedFooting.ts:122). Ahí SUBIR γ rebaja la demanda de SERVICIO,
 * que es la del hundimiento — la comprobación que dimensiona la zapata. La red
 * estaba puesta, y apuntando al lado contrario: solo marcaba las bajadas.
 *
 * Ninguna regla por campo puede acertar, porque la dirección de γ DEPENDE de otro
 * campo. Así que las dos reglas por campo se sustituyen por las dos DEMANDAS que el
 * motor deriva de verdad, cada una expresada como el multiplicador que γ y el toggle
 * aplican sobre las cargas introducidas. Aísla el efecto del par: N, Mx, My y H
 * conservan sus propias reglas y no se doble-reportan.
 */
export const FOOTING_RESOLVED_RULES: ReadonlyArray<ResolvedSafetyRule<IsolatedFootingInputs>> = [
  {
    id: 'demanda_servicio',
    label: 'Demanda de SERVICIO (hundimiento, deslizamiento, vuelco)',
    resolve: (s) => (s.loadsAreFactored ? 1 / s.loadFactor : 1),
    level: higherIsSafer,
    format: (v) => `${(v * 100).toFixed(0)}% de las cargas introducidas`,
    why: 'Con las cargas marcadas como MAYORADAS, el programa las divide por γ para obtener las de servicio (N/γ), que son las del hundimiento — la comprobación que dimensiona la zapata. SUBIR γ, o marcar como mayoradas unas cargas de servicio, rebaja esa demanda sin tocar la obra.',
    fields: ['loadFactor', 'loadsAreFactored'],
    confirmKeys: ['loadFactor', 'loadsAreFactored'],
    // Sin gate, como el antiguo `loadsAreFactored`: un γ por debajo del 1.35 del
    // CTE no es un dato de proyecto plausible, y declarar mayoradas unas cargas de
    // servicio no tiene "primer relleno legítimo". Avisar siempre no da falsos
    // positivos aquí y sí cubre la rebaja DESDE el default.
    alwaysCheck: true,
  },
  {
    id: 'demanda_calculo',
    label: 'Demanda de CÁLCULO (flexión, cortante, punzonamiento)',
    resolve: (s) => (s.loadsAreFactored ? 1 : s.loadFactor),
    level: higherIsSafer,
    format: (v) => `${(v * 100).toFixed(0)}% de las cargas introducidas`,
    why: 'Con las cargas SIN mayorar, el programa las multiplica por γ para obtener las de cálculo (N·γ), que son las del armado. BAJAR γ, o declarar mayoradas unas cargas de servicio, rebaja esa demanda de golpe. Comprueba que N, Mx, My y H son realmente de cálculo (ELU).',
    fields: ['loadFactor', 'loadsAreFactored'],
    confirmKeys: ['loadFactor', 'loadsAreFactored'],
    // Sin gate, como el antiguo `loadsAreFactored`: un γ por debajo del 1.35 del
    // CTE no es un dato de proyecto plausible, y declarar mayoradas unas cargas de
    // servicio no tiene "primer relleno legítimo". Avisar siempre no da falsos
    // positivos aquí y sí cubre la rebaja DESDE el default.
    alwaysCheck: true,
  },
];

export const FACTORED_UNKNOWN_WARNING =
  'No se pudo determinar si las cargas propuestas son de servicio o mayoradas; '
  + 'revisa el conmutador "Sin mayorar/Mayoradas" antes de calcular.';

const TOGGLE_LABELS = { false: 'Sin mayorar', true: 'Mayoradas' } as const;

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtM = (m: number) => m.toFixed(2) + ' m';
const fmtMm = (mm: number) => `${mm} mm`;

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

/**
 * Convierte el payload (unidades humanas, nullable) en un plan de aplicación
 * sobre IsolatedFootingInputs. La geometría del payload ya está en m y el
 * estado también → SIN conversión. Nunca aplica en silencio: fuera de rango /
 * fuera de catálogo / igual al actual → skipped con motivo. NUNCA produce
 * `title` ni derivados.
 *
 * Trampa loadsAreFactored: si el payload trae alguna carga (N/Mx/My/H) y el
 * toggle viene null, las cargas SÍ se aplican pero se añade un warning
 * destacado y el toggle actual NO se toca.
 */
function buildFootingPlan(
  x: IsolatedFootingPayload,
  current: IsolatedFootingInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<IsolatedFootingInputs> {
  const fields: Partial<IsolatedFootingInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  // Claves del payload ya resueltas (change o skip) — el resto de nulls va a notFound.
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof IsolatedFootingInputs>(
    key: PayloadKey,
    field: K,
    value: IsolatedFootingInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  /** Numérico continuo genérico: rango → skip; ALREADY (±EPS) → skip; si no, apply. */
  function applyNumber(
    key: PayloadKey,
    field: keyof IsolatedFootingInputs & keyof typeof current,
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
    const before = current[field] as number;
    if (Math.abs(value - before) <= EPS) skip(key, ALREADY);
    else apply(key, field, value as IsolatedFootingInputs[typeof field], fmt(before), fmt(value));
  }

  /** Entero en mm: redondeo + rango; ALREADY exacto. */
  function applyIntMm(
    key: PayloadKey,
    field: keyof IsolatedFootingInputs & keyof typeof current,
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
    const before = current[field] as number;
    if (v === before) skip(key, ALREADY);
    else apply(key, field, v as IsolatedFootingInputs[typeof field], fmtMm(before), fmtMm(v));
  }

  // --- Trampa loadsAreFactored (PRIMERO, contrato) ---
  const hasLoads = x.N_kN !== null || x.Mx_kNm !== null || x.My_kNm !== null || x.H_kN !== null;
  if (x.loadsAreFactored !== null) {
    if (x.loadsAreFactored === current.loadsAreFactored) {
      skip('loadsAreFactored', ALREADY);
    } else {
      apply(
        'loadsAreFactored', 'loadsAreFactored', x.loadsAreFactored,
        TOGGLE_LABELS[`${current.loadsAreFactored}`],
        TOGGLE_LABELS[`${x.loadsAreFactored}`],
      );
    }
  } else if (hasLoads) {
    // Cargas sin naturaleza conocida: se aplican, pero con aviso destacado y
    // sin tocar el conmutador actual. La clave queda resuelta (no va a notFound).
    handled.add('loadsAreFactored');
    warnings.push(FACTORED_UNKNOWN_WARNING);
  }

  // --- loadFactor (solo γ global explícito; rango 1.0–2.0) ---
  if (x.loadFactor !== null) {
    if (x.loadFactor < 1.0 || x.loadFactor > 2.0) {
      skip('loadFactor', rangeReason(x.loadFactor, 1.0, 2.0, ''));
    } else {
      const v = round2(x.loadFactor);
      if (Math.abs(v - current.loadFactor) <= EPS) skip('loadFactor', ALREADY);
      else apply('loadFactor', 'loadFactor', v, current.loadFactor.toFixed(2), v.toFixed(2));
    }
  }

  // --- Cargas (kN / kNm, sin conversión) ---
  const fmtForce = (v: number) => formatQuantity(v, 'force', system);
  const fmtMoment = (v: number) => formatQuantity(v, 'moment', system);

  if (x.N_kN !== null) {
    if (x.N_kN < 0 || x.N_kN > 50000) {
      skip('N_kN', rangeReason(x.N_kN, 0, 50000, 'kN'));
    } else {
      const v = round2(x.N_kN);
      if (Math.abs(v - current.N) <= EPS) skip('N_kN', ALREADY);
      else apply('N_kN', 'N', v, fmtForce(current.N), fmtForce(v));
    }
  }

  /** Momentos: |M| ≤ 20000; negativos → valor absoluto + warning (el signo no afecta). */
  function applyMoment(key: 'Mx_kNm' | 'My_kNm', field: 'Mx' | 'My', value: number | null): void {
    if (value === null) return;
    if (Math.abs(value) > 20000) {
      skip(key, rangeReason(value, 0, 20000, 'kNm'));
      return;
    }
    let v = round2(value);
    if (v < 0) {
      v = Math.abs(v);
      warnings.push(`El momento ${field} venía con signo negativo; se aplica su valor absoluto (${v} kNm).`);
    }
    if (Math.abs(v - current[field]) <= EPS) skip(key, ALREADY);
    else apply(key, field, v, fmtMoment(current[field]), fmtMoment(v));
  }
  applyMoment('Mx_kNm', 'Mx', x.Mx_kNm);
  applyMoment('My_kNm', 'My', x.My_kNm);

  if (x.H_kN !== null) {
    if (x.H_kN < 0 || x.H_kN > 10000) {
      skip('H_kN', rangeReason(x.H_kN, 0, 10000, 'kN'));
    } else {
      const v = round2(x.H_kN);
      if (Math.abs(v - current.H) <= EPS) skip('H_kN', ALREADY);
      else apply('H_kN', 'H', v, fmtForce(current.H), fmtForce(v));
    }
  }

  // --- Geometría (payload en m, estado YA en m → SIN conversión) ---
  applyNumber('B_m', 'B', x.B_m, 0.4, 10, 'm', fmtM);
  applyNumber('L_m', 'L', x.L_m, 0.4, 10, 'm', fmtM);
  applyNumber('h_m', 'h', x.h_m, 0.3, 3, 'm', fmtM);
  applyNumber('bc_m', 'bc', x.bc_m, 0.1, 2, 'm', fmtM);
  applyNumber('hc_m', 'hc', x.hc_m, 0.1, 2, 'm', fmtM);
  applyNumber('Df_m', 'Df', x.Df_m, 0, 10, 'm', fmtM);
  applyIntMm('cover_mm', 'cover', x.cover_mm, 10, 120);

  // --- Tensión admisible (kPa internos; se muestra vía formatQuantity) ---
  applyNumber('sigma_adm_kPa', 'sigma_adm', x.sigma_adm_kPa, 20, 2000, 'kPa',
    (v) => formatQuantity(v, 'soilPressure', system));

  // --- Materiales contra catálogo ---
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
    if (!FYK_OPTIONS.includes(x.fyk_MPa)) {
      skip('fyk_MPa', `fyk ${x.fyk_MPa} MPa no disponible en este módulo (solo 400 o 500 MPa)`);
    } else if (x.fyk_MPa === current.fyk) {
      skip('fyk_MPa', ALREADY);
    } else {
      apply('fyk_MPa', 'fyk', x.fyk_MPa, `B${current.fyk}`, `B${x.fyk_MPa}`);
    }
  }

  // --- Armadura (diámetros contra catálogo; separaciones 50–400 mm) ---
  function applyBarDiam(key: 'phi_x_mm' | 'phi_y_mm', field: 'phi_x' | 'phi_y', value: number | null): void {
    if (value === null) return;
    if (!availableBarDiams.includes(value)) {
      skip(key, `Ø${value} no es un diámetro del catálogo (Ø${availableBarDiams.join(', Ø')})`);
    } else if (value === current[field]) {
      skip(key, ALREADY);
    } else {
      apply(key, field, value, `Ø${current[field]} mm`, `Ø${value} mm`);
    }
  }
  applyBarDiam('phi_x_mm', 'phi_x', x.phi_x_mm);
  applyIntMm('s_x_mm', 's_x', x.s_x_mm, 50, 400);
  applyBarDiam('phi_y_mm', 'phi_y', x.phi_y_mm);
  applyIntMm('s_y_mm', 's_y', x.s_y_mm, 50, 400);

  // --- Suelo ---
  applyNumber('gamma_soil_kN_m3', 'gamma_soil_kN_m3', x.gamma_soil_kN_m3, 10, 25, 'kN/m³',
    (v) => formatQuantity(v, 'weightDensity', system));
  applyNumber('mu_friction', 'mu_friction', x.mu_friction, 0.1, 1.0, '', (v) => v.toFixed(2));

  // ── Invariantes de pareja del motor: nunca dejar el módulo INVÁLIDO ─────────
  //
  // Auditoría 2026-07-14 (5ª familia): `calcIsolatedFooting` rechaza `h > Df`,
  // `bc ≥ B` y `hc ≥ L`. Una propuesta que rompa una de estas parejas dejaría el
  // cálculo en "Datos no válidos" tras UN clic — y el caso es real: el prompt
  // empuja a subir el canto para el punzonamiento, y el canto no puede superar la
  // profundidad de cimentación. Si el estado FINAL viola una pareja, se REVIERTEN
  // los miembros PROPUESTOS de esa pareja (vuelven a su valor vigente, que era
  // válido) y se explican en `skipped`. El modelo que de verdad quiera esa
  // geometría debe proponer la pareja coherente (más canto ⇒ más Df; pilar menor
  // que la zapata) — se lo dice el prompt. Solo se toca lo propuesto: si la pareja
  // ya venía inválida del estado del usuario, no la empeoramos ni la bloqueamos.
  function revertField<K extends keyof IsolatedFootingInputs>(
    field: K, payloadKey: PayloadKey, reason: string,
  ): void {
    if (!(field in fields)) return; // no propuesto ⇒ no lo tocamos
    delete fields[field];
    const i = changes.findIndex((c) => c.field === field);
    if (i >= 0) changes.splice(i, 1);
    skipped.push({ label: LABELS[payloadKey], reason });
  }
  const finalState = () => ({ ...current, ...fields });
  {
    const f = finalState();
    if (f.h > f.Df) {
      const r = `El canto de la zapata (${fmtM(f.h)}) no puede superar la profundidad de cimentación Df (${fmtM(f.Df)}): el motor lo rechaza. Si necesitas más canto, propón TAMBIÉN una Df mayor (excavación más profunda) en el mismo turno — la profundidad no se ajusta sola.`;
      revertField('h', 'h_m', r);
      revertField('Df', 'Df_m', r);
    }
  }
  {
    const f = finalState();
    if (f.bc >= f.B) {
      const r = `El pilar (bc = ${fmtM(f.bc)}) debe ser MENOR que la zapata (B = ${fmtM(f.B)}), no igual ni mayor. Propón una zapata más ancha o revisa la dimensión del pilar.`;
      revertField('bc', 'bc_m', r);
      revertField('B', 'B_m', r);
    }
  }
  {
    const f = finalState();
    if (f.hc >= f.L) {
      const r = `El pilar (hc = ${fmtM(f.hc)}) debe ser MENOR que la zapata (L = ${fmtM(f.L)}), no igual ni mayor. Propón una zapata más larga o revisa la dimensión del pilar.`;
      revertField('hc', 'hc_m', r);
      revertField('L', 'L_m', r);
    }
  }

  // --- notFound: claves null no resueltas por el mapper ---
  const values: Record<PayloadKey, unknown> = {
    loadsAreFactored: x.loadsAreFactored, loadFactor: x.loadFactor,
    N_kN: x.N_kN, Mx_kNm: x.Mx_kNm, My_kNm: x.My_kNm, H_kN: x.H_kN,
    B_m: x.B_m, L_m: x.L_m, h_m: x.h_m, bc_m: x.bc_m, hc_m: x.hc_m, Df_m: x.Df_m,
    cover_mm: x.cover_mm, sigma_adm_kPa: x.sigma_adm_kPa,
    fck_MPa: x.fck_MPa, fyk_MPa: x.fyk_MPa,
    phi_x_mm: x.phi_x_mm, s_x_mm: x.s_x_mm, phi_y_mm: x.phi_y_mm, s_y_mm: x.s_y_mm,
    gamma_soil_kN_m3: x.gamma_soil_kN_m3, mu_friction: x.mu_friction,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = [
    ...detectSafetyRisks(
      FOOTING_SAFETY_RULES, changes, fields, current, isolatedFootingDefaults, confirmed,
    ),
    // El par (loadsAreFactored, γ): la dirección de γ depende del toggle, así que
    // se vigilan las DEMANDAS resueltas, no los campos. Ver arriba.
    ...detectResolvedRisks(
      FOOTING_RESOLVED_RULES, fields, current, isolatedFootingDefaults, confirmed,
    ),
  ];
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

/** Claves de estado mapeables desde el payload (`title` es metadato de documento). */
type StateKey = Exclude<keyof IsolatedFootingInputs, 'title'>;

/**
 * Tabla clave-de-payload → clave-de-estado: única fuente de verdad del snapshot
 * (construye a la vez `valores` y `sin_confirmar`). Aquí las unidades humanas
 * coinciden con las internas (m, mm, kN, kPa) → sin conversión.
 */
const SNAPSHOT_FIELDS: Readonly<Record<PayloadKey, StateKey>> = {
  loadsAreFactored: 'loadsAreFactored',
  loadFactor: 'loadFactor',
  N_kN: 'N',
  Mx_kNm: 'Mx',
  My_kNm: 'My',
  H_kN: 'H',
  B_m: 'B',
  L_m: 'L',
  h_m: 'h',
  bc_m: 'bc',
  hc_m: 'hc',
  Df_m: 'Df',
  cover_mm: 'cover',
  sigma_adm_kPa: 'sigma_adm',
  fck_MPa: 'fck',
  fyk_MPa: 'fyk',
  phi_x_mm: 'phi_x',
  s_x_mm: 's_x',
  phi_y_mm: 'phi_y',
  s_y_mm: 's_y',
  gamma_soil_kN_m3: 'gamma_soil_kN_m3',
  mu_friction: 'mu_friction',
};

/**
 * Estado → `{"valores":{…},"sin_confirmar":[…]}` (contrato del snapshot).
 * `sin_confirmar` = claves cuyo valor de ESTADO sigue siendo el default del
 * módulo → nadie las ha tocado y el asistente NO debe darlas por buenas.
 * Se compara el valor de estado (no el humano) para evitar ruido de redondeo;
 * `loadsAreFactored` es booleano y compara igual. Orden = el de `valores`
 * (KEY_ORDER) → determinista.
 */
function buildSnapshot(c: IsolatedFootingInputs): string {
  const valores: Record<string, number | boolean> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    valores[key] = value;
    if (value === isolatedFootingDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt (Fase 2 — T2.4) ─────────────────────

// Labels españoles de DistributionType (mismos términos que UI/PDF del módulo).
const DIST_ES: Record<DistributionType, string> = {
  trapezoidal: 'trapecial',
  bitriangular_uniaxial: 'bitriangular uniaxial',
  bitriangular_biaxial: 'bitriangular biaxial',
  overturning_fail: 'vuelco geométrico',
};

/**
 * Resume el resultado del motor de zapatas para el bloque RESULTADOS del
 * prompt del chat. OJO al `valid` divergente de este módulo
 * (`valid = !overall_fail`): el discriminador de cálculo no válido es
 * `error != null` — una zapata que incumple vuelco tiene `valid:false` SIN
 * error y debe resumirse como 'fail' (checks + extras), nunca como 'invalid'.
 * Los extras (distribución/σ y rígida-flexible) se emiten siempre que el motor
 * pudo calcular; σmax puede ser Infinity (vuelco geométrico) → formatQuantity
 * ya lo presenta como '∞'.
 */
export function summarizeIsolatedFootingResults(r: IsolatedFootingResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(r);
  return summarizeCalcResults(r, [
    `Distribución de tensiones: ${DIST_ES[r.distributionType]} — `
      + `σmax=${formatQuantity(r.sigma_max, 'soilPressure', 'si')}, `
      + `σmin=${formatQuantity(r.sigma_min, 'soilPressure', 'si')}`,
    `Comportamiento: zapata ${r.isRigid ? 'rígida' : 'flexible'} (vuelo máx ${r.isRigid ? '≤' : '>'} 2h)`,
  ]);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const isolatedFootingAdapter: AiModuleAdapter<IsolatedFootingInputs> = {
  id: 'isolated-footing',
  label: 'Zapata aislada',
  payloadSchema: ISOLATED_FOOTING_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildFootingPlan(parsePayload(payload), current, system, confirmed),
};
