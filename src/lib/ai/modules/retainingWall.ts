/**
 * Adapter del asistente IA para el módulo Muro de contención (ola 2,
 * CTE DB-SE-C + CE).
 *
 * Particularidades del módulo:
 * - Es el más rico en REGLAS DE SEGURIDAD de toda la campaña: casi todo el
 *   terreno es dato del estudio geotécnico, y las dos direcciones conviven
 *   (bajar γ del relleno reduce el empuje; subir φ baja Ka; subir σadm o μ regala
 *   resistencia). Ver `RETAINING_WALL_SAFETY_RULES`.
 * - UNIDADES MIXTAS: la geometría va en METROS (H, hf, tFuste, bPunta, bTalon, df,
 *   hw) y el recubrimiento en MILÍMETROS. `cover` se migró de m → mm en el
 *   saneamiento del 2026-07-13 y el motor rechaza en alto cualquier valor < 10 mm.
 * - Ø = 0 en una zona de armado NO es "sin armadura": es "sin definir", y activa
 *   el modo DIMENSIONADO (el motor calcula el As requerido en vez de comprobar el
 *   provisto). Todos los diámetros vienen así de fábrica.
 * - `kh` y `kv` son DERIVADOS (kh = S·Ab, kv = kh/2) — la IA propone Ab y S.
 * - Con |e| ≥ B/3 el motor OMITE el bloque estructural entero (ver
 *   `summarizeRetainingWallResults`).
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectSafetyRisks,
  falseIsSafer,
  higherIsSafer,
  lowerIsSafer,
  trueIsSafer,
  type SafetyRule,
} from '../safety';
import type { RetainingWallResult } from '../../calculations/retainingWall';
import { availableFck } from '../../../data/materials';
import { retainingWallDefaults, type RetainingWallInputs } from '../../../data/defaults';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
const FYK: readonly number[] = [400, 500, 600];
/** Ø de armado del muro. El 0 es un valor legítimo: "zona sin definir". */
const REBAR_DIAMS: readonly number[] = [0, 10, 12, 14, 16, 20];

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

const REBAR_ZONES = [
  { key: 'fv_int', label: 'fuste vertical, cara del TRASDÓS (la cara del relleno: es la armadura principal de flexión del fuste)' },
  { key: 'fv_ext', label: 'fuste vertical, cara del INTRADÓS (cara vista)' },
  { key: 'fh', label: 'fuste horizontal, por cara (armadura de reparto/retracción)' },
  { key: 'zs', label: 'zapata, cara SUPERIOR (tracción en el talón)' },
  { key: 'zi', label: 'zapata, cara INFERIOR (tracción en la puntera)' },
  { key: 'zt_inf', label: 'zapata, armadura TRANSVERSAL de la cara inferior' },
  { key: 'zt_sup', label: 'zapata, armadura TRANSVERSAL de la cara superior' },
] as const;

const rebarProps: Record<string, unknown> = {};
for (const z of REBAR_ZONES) {
  rebarProps[`diam_${z.key}_mm`] = {
    type: ['integer', 'null'], enum: [...REBAR_DIAMS, null],
    description: `Diámetro de la armadura del ${z.label}, en mm. 0 = zona SIN DEFINIR: la app calcula entonces el área de acero necesaria en vez de comprobar la dispuesta (modo dimensionado). NO significa "sin armadura".`,
  };
  rebarProps[`sep_${z.key}_mm`] = {
    type: ['number', 'null'],
    description: `Separación entre barras del ${z.label}, en mm.`,
  };
}

export const RETAINING_WALL_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'H_m', 'hf_m', 'tFuste_m', 'bPunta_m', 'bTalon_m', 'df_m',
    'fck_MPa', 'fyk_MPa', 'cover_mm',
    'gammaSuelo_kNm3', 'gammaSat_kNm3', 'phi_deg', 'delta_deg', 'q_kNm2',
    'sigmaAdm_kPa', 'mu', 'usePassive', 'hasWater', 'hw_m', 'Ab', 'S',
    ...REBAR_ZONES.flatMap((z) => [`diam_${z.key}_mm`, `sep_${z.key}_mm`]),
    'warnings',
  ],
  properties: {
    H_m: { type: ['number', 'null'], description: 'Altura LIBRE del fuste sobre la cara superior de la zapata, en metros (la altura del terreno contenido).' },
    hf_m: { type: ['number', 'null'], description: 'Canto de la zapata, en metros.' },
    tFuste_m: { type: ['number', 'null'], description: 'Espesor del fuste (uniforme), en metros.' },
    bPunta_m: { type: ['number', 'null'], description: 'Vuelo de la PUNTERA (el lado del intradós, hacia fuera), en metros. 0 = sin puntera.' },
    bTalon_m: { type: ['number', 'null'], description: 'Vuelo del TALÓN (el lado del relleno), en metros. 0 = sin talón.' },
    df_m: { type: ['number', 'null'], description: 'Profundidad de terreno POR ENCIMA de la zapata en el lado de la puntera, en metros. Da peso estabilizador y, con hf, el empotramiento del empuje pasivo (df + hf).' },
    fck_MPa: { type: ['integer', 'null'], enum: [...availableFck, null], description: 'Resistencia característica del hormigón en MPa (HA-25 → 25).' },
    fyk_MPa: { type: ['integer', 'null'], enum: [...FYK, null], description: 'Límite elástico del acero de armar en MPa (B500S → 500).' },
    cover_mm: { type: ['number', 'null'], description: 'Recubrimiento de la armadura en MILÍMETROS (típico 40–50 mm contra el terreno). OJO: este campo va en mm, no en metros como la geometría.' },
    gammaSuelo_kNm3: { type: ['number', 'null'], description: 'Peso específico aparente del relleno, en kN/m³ (típico 18–20).' },
    gammaSat_kNm3: { type: ['number', 'null'], description: 'Peso específico SATURADO del relleno, en kN/m³ (típico 20–22). Solo interviene bajo el nivel freático.' },
    phi_deg: { type: ['number', 'null'], description: 'Ángulo de rozamiento interno del relleno, en grados. Es dato del estudio geotécnico: fija el coeficiente de empuje activo Ka.' },
    delta_deg: { type: ['number', 'null'], description: 'Ángulo de rozamiento entre el muro y el terreno, en grados (habitual: 1/2 a 2/3 de φ; 0 en el caso más conservador).' },
    q_kNm2: { type: ['number', 'null'], description: 'Sobrecarga uniforme sobre el relleno, en kN/m² (por ejemplo, tráfico o acopios).' },
    sigmaAdm_kPa: { type: ['number', 'null'], description: 'Tensión admisible del terreno de cimentación, en kPa. La fija el estudio geotécnico.' },
    mu: { type: ['number', 'null'], description: 'Coeficiente de rozamiento entre la base de la zapata y el terreno (típico 0.35–0.55). Lo fija el estudio geotécnico.' },
    usePassive: { type: ['boolean', 'null'], description: 'true para INCLUIR el empuje pasivo delante de la puntera en la estabilidad. El CTE lo deja a decisión razonada: solo si el terreno de delante está garantizado (no se va a excavar, no es relleno reciente).' },
    hasWater: { type: ['boolean', 'null'], description: 'true si hay nivel freático en el trasdós. Añade el empuje hidrostático, que suele gobernar el vuelco.' },
    hw_m: { type: ['number', 'null'], description: 'Profundidad del nivel freático desde la CORONACIÓN del muro, en metros. Solo se usa con hasWater = true.' },
    Ab: { type: ['number', 'null'], description: 'Aceleración sísmica básica, como FRACCIÓN de g (mapa de peligrosidad de la NCSE-02; p. ej. 0.12). 0 = sin comprobación sísmica.' },
    S: { type: ['number', 'null'], description: 'Coeficiente de amplificación del terreno (NCSE-02). La app deriva de aquí kh = S·Ab y kv = kh/2 — no los introduzcas tú.' },
    ...rebarProps,
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Muro de contención:
1. UNIDADES MIXTAS: toda la geometría va en METROS (altura del fuste, canto de zapata, espesor, vuelos, empotramiento, nivel freático) pero el recubrimiento y el armado van en MILÍMETROS. Si el enunciado da centímetros, convierte y añade un warning.
2. GEOMETRÍA: H_m es la altura LIBRE del fuste sobre la zapata (el terreno contenido), no la altura total del muro; la altura total es H + hf. bPunta es el vuelo del lado visto y bTalon el del lado del relleno.
3. ARMADO: Ø = 0 NO significa "sin armadura", significa ZONA SIN DEFINIR: la app pasa a modo dimensionado y te dice el área de acero necesaria. Es el estado de partida. Si el enunciado ya da un armado, introdúcelo; si no, deja los ceros y explica en "reply" que la app dimensionará.
4. SISMO: introduce solo Ab (fracción de g) y S. La app deriva kh = S·Ab y kv = kh/2 — no existen como campos.
5. EMPUJE PASIVO (usePassive): activarlo SUMA resistencia al deslizamiento y al vuelco. El CTE lo condiciona a que el terreno de delante esté garantizado. No lo actives para hacer cumplir un muro: es una decisión de proyecto que debe tomar el usuario.
6. En este módulo son DATOS del problema, no variables de diseño: la altura contenida (H_m), la sobrecarga (q), los pesos específicos del relleno, el rozamiento interno φ y el de contacto δ, la tensión admisible del terreno (sigmaAdm), el coeficiente de rozamiento de la base (mu), el nivel freático y la sismicidad. Los fijan el proyecto y el estudio geotécnico. Para que un muro cumpla actúa SIEMPRE sobre la GEOMETRÍA y el armado: zapata más ancha (más talón o más puntera), zapata más gruesa, fuste más grueso, más armadura, mejor hormigón. NUNCA subas φ o σadm ni bajes el peso del relleno, y NUNCA quites el nivel freático, para que salga el cálculo.
7. Si la excentricidad se sale del núcleo central (|e| ≥ B/3), la app NO comprueba el armado: el muro hay que redimensionarlo antes (típicamente, alargando el talón).`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Muro ménsula de 4 m de altura contenida, zapata de 60 cm de canto con 0.8 m de puntera '
  + 'y 2.2 m de talón. Relleno granular γ = 19 kN/m³ y φ = 32°, sobrecarga 10 kN/m², '
  + 'terreno admisible 250 kPa.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

type RebarKey = `diam_${(typeof REBAR_ZONES)[number]['key']}_mm` | `sep_${(typeof REBAR_ZONES)[number]['key']}_mm`;

type RetainingWallPayload = {
  H_m: number | null;
  hf_m: number | null;
  tFuste_m: number | null;
  bPunta_m: number | null;
  bTalon_m: number | null;
  df_m: number | null;
  fck_MPa: number | null;
  fyk_MPa: number | null;
  cover_mm: number | null;
  gammaSuelo_kNm3: number | null;
  gammaSat_kNm3: number | null;
  phi_deg: number | null;
  delta_deg: number | null;
  q_kNm2: number | null;
  sigmaAdm_kPa: number | null;
  mu: number | null;
  usePassive: boolean | null;
  hasWater: boolean | null;
  hw_m: number | null;
  Ab: number | null;
  S: number | null;
  warnings: string[];
} & Record<RebarKey, number | null>;

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function parsePayload(raw: unknown): RetainingWallPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  const rebar: Record<string, number | null> = {};
  for (const z of REBAR_ZONES) {
    rebar[`diam_${z.key}_mm`] = finiteNumber(r[`diam_${z.key}_mm`]);
    rebar[`sep_${z.key}_mm`] = finiteNumber(r[`sep_${z.key}_mm`]);
  }
  return {
    H_m: finiteNumber(r.H_m),
    hf_m: finiteNumber(r.hf_m),
    tFuste_m: finiteNumber(r.tFuste_m),
    bPunta_m: finiteNumber(r.bPunta_m),
    bTalon_m: finiteNumber(r.bTalon_m),
    df_m: finiteNumber(r.df_m),
    fck_MPa: finiteNumber(r.fck_MPa),
    fyk_MPa: finiteNumber(r.fyk_MPa),
    cover_mm: finiteNumber(r.cover_mm),
    gammaSuelo_kNm3: finiteNumber(r.gammaSuelo_kNm3),
    gammaSat_kNm3: finiteNumber(r.gammaSat_kNm3),
    phi_deg: finiteNumber(r.phi_deg),
    delta_deg: finiteNumber(r.delta_deg),
    q_kNm2: finiteNumber(r.q_kNm2),
    sigmaAdm_kPa: finiteNumber(r.sigmaAdm_kPa),
    mu: finiteNumber(r.mu),
    usePassive: boolOrNull(r.usePassive),
    hasWater: boolOrNull(r.hasWater),
    hw_m: finiteNumber(r.hw_m),
    Ab: finiteNumber(r.Ab),
    S: finiteNumber(r.S),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
    ...(rebar as Record<RebarKey, number | null>),
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const ZONE_LABEL: Record<string, string> = {
  fv_int: 'Fuste vertical (trasdós)',
  fv_ext: 'Fuste vertical (intradós)',
  fh: 'Fuste horizontal',
  zs: 'Zapata superior (talón)',
  zi: 'Zapata inferior (puntera)',
  zt_inf: 'Zapata transversal inferior',
  zt_sup: 'Zapata transversal superior',
};

const BASE_LABELS = {
  H_m: 'Altura contenida H',
  hf_m: 'Canto de zapata h_f',
  tFuste_m: 'Espesor del fuste',
  bPunta_m: 'Vuelo de puntera',
  bTalon_m: 'Vuelo de talón',
  df_m: 'Terreno sobre la puntera d_f',
  fck_MPa: 'Hormigón fck',
  fyk_MPa: 'Acero fyk',
  cover_mm: 'Recubrimiento',
  gammaSuelo_kNm3: 'Peso específico del relleno γ',
  gammaSat_kNm3: 'Peso específico saturado γsat',
  phi_deg: 'Rozamiento interno φ',
  delta_deg: 'Rozamiento muro-terreno δ',
  q_kNm2: 'Sobrecarga q',
  sigmaAdm_kPa: 'Tensión admisible σadm',
  mu: 'Coef. de rozamiento base μ',
  usePassive: 'Empuje pasivo',
  hasWater: 'Nivel freático',
  hw_m: 'Profundidad del NF',
  Ab: 'Aceleración básica Ab',
  S: 'Amplificación del terreno S',
} as const;

const LABELS: Record<string, string> = { ...BASE_LABELS };
for (const z of REBAR_ZONES) {
  LABELS[`diam_${z.key}_mm`] = `${ZONE_LABEL[z.key]} — Ø`;
  LABELS[`sep_${z.key}_mm`] = `${ZONE_LABEL[z.key]} — separación`;
}

type PayloadKey = keyof typeof BASE_LABELS | RebarKey;

/** ORDER del contrato: `hasWater` antes que `hw`, `Ab` antes que `S`. */
const KEY_ORDER: readonly PayloadKey[] = [
  'H_m', 'hf_m', 'tFuste_m', 'bPunta_m', 'bTalon_m', 'df_m',
  'fck_MPa', 'fyk_MPa', 'cover_mm',
  'gammaSuelo_kNm3', 'gammaSat_kNm3', 'phi_deg', 'delta_deg', 'q_kNm2',
  'sigmaAdm_kPa', 'mu', 'usePassive', 'hasWater', 'hw_m', 'Ab', 'S',
  ...REBAR_ZONES.flatMap((z) => [`diam_${z.key}_mm`, `sep_${z.key}_mm`] as RebarKey[]),
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

export const WATER_GATE_REASON =
  'Sin nivel freático (hasWater), la profundidad del NF no interviene en el cálculo.';

export const SEISMIC_GATE_REASON =
  'Sin sismo (Ab = 0), el coeficiente de amplificación del terreno no interviene: kh = S·Ab sería 0 igualmente.';

export const PASSIVE_NO_EMBED_WARNING =
  'El empuje pasivo queda activado, pero sin empotramiento por delante (d_f + h_f) su aportación es nula: '
  + 'revisa la profundidad de terreno sobre la puntera.';

/**
 * La tabla anti-trampa geotécnica. TODO el terreno es dato del estudio, y las dos
 * direcciones conviven en el mismo muro:
 * - bajar γ del relleno REDUCE el empuje activo (por eso γ es higherIsSafer);
 * - subir φ o δ BAJA el coeficiente Ka (por eso son lowerIsSafer);
 * - subir σadm o μ regala resistencia sin tocar el muro;
 * - profundizar el NF (hw mayor) reduce el empuje hidrostático.
 * La geometría del muro (canto, espesor, vuelos) SÍ es diseño: agrandarla es la
 * salida legítima. La única excepción es H, que es el terreno a contener.
 */
export const RETAINING_WALL_SAFETY_RULES: ReadonlyArray<SafetyRule<RetainingWallInputs>> = [
  { field: 'H', confirmKey: 'H_m', level: higherIsSafer, why: 'La altura de terreno a contener la fija el proyecto: rebajarla reduce el empuje activo (que crece con H²) y con él todos los factores de seguridad.' },
  { field: 'q', confirmKey: 'q_kNm2', level: higherIsSafer, why: 'La sobrecarga sobre el relleno la fija el uso previsto (tráfico, acopios): rebajarla reduce el empuje sin que la obra haya cambiado.' },
  { field: 'gammaSuelo', confirmKey: 'gammaSuelo_kNm3', level: higherIsSafer, why: 'El peso específico del relleno es dato del estudio geotécnico: rebajarlo reduce el empuje activo, que es proporcional a γ.' },
  { field: 'gammaSat', confirmKey: 'gammaSat_kNm3', level: higherIsSafer, why: 'El peso específico saturado es dato del estudio geotécnico: rebajarlo reduce el empuje bajo el nivel freático.' },
  { field: 'Ab', level: higherIsSafer, why: 'La aceleración sísmica básica la fija el mapa de peligrosidad de la NCSE-02 según el emplazamiento: rebajarla elimina o suaviza la comprobación sísmica.' }, // payload `Ab`: mismo nombre ⇒ sin confirmKey
  { field: 'S', level: higherIsSafer, why: 'El coeficiente de amplificación del terreno lo fija su clasificación en la NCSE-02: rebajarlo reduce kh = S·Ab y con él la acción sísmica.' }, // payload `S`: mismo nombre ⇒ sin confirmKey
  { field: 'cover', confirmKey: 'cover_mm', level: higherIsSafer, why: 'El recubrimiento es un criterio de durabilidad (un muro está contra el terreno): rebajarlo aumenta el canto útil y regala capacidad a flexión.' },
  { field: 'phi', confirmKey: 'phi_deg', level: lowerIsSafer, why: 'El ángulo de rozamiento interno es dato del estudio geotécnico: SUBIRLO baja el coeficiente de empuje activo Ka y con él todo el empuje, haciendo "cumplir" el muro sin tocarlo.' },
  { field: 'delta', confirmKey: 'delta_deg', level: lowerIsSafer, why: 'El rozamiento muro-terreno lo fija la rugosidad del trasdós: subirlo inclina el empuje y reduce su componente horizontal — el lado conservador es δ = 0.' },
  { field: 'sigmaAdm', confirmKey: 'sigmaAdm_kPa', level: lowerIsSafer, why: 'La tensión admisible del terreno la fija el estudio geotécnico: subirla hace "cumplir" el hundimiento sin ensanchar la zapata.' },
  { field: 'mu', level: lowerIsSafer, why: 'El coeficiente de rozamiento de la base lo fija el estudio geotécnico: subirlo hace "cumplir" el deslizamiento sin tocar el muro.' }, // payload `mu`: mismo nombre ⇒ sin confirmKey
  { field: 'df', confirmKey: 'df_m', level: lowerIsSafer, why: 'La profundidad de terreno sobre la puntera es una medida real de la obra: agrandarla suma peso estabilizador y empotramiento pasivo que nadie ha comprobado.' },
  { field: 'hw', confirmKey: 'hw_m', level: lowerIsSafer, why: 'La profundidad del nivel freático la fija el estudio geotécnico: profundizarlo reduce el empuje hidrostático, que suele ser la acción que gobierna el vuelco.' },
  {
    field: 'hasWater', // payload `hasWater`: mismo nombre ⇒ sin confirmKey
    level: trueIsSafer,
    why: 'El nivel freático lo fija el estudio geotécnico: desactivarlo borra de golpe el empuje hidrostático del trasdós, que suele ser la acción que gobierna el vuelco y el deslizamiento.',
  },
  {
    field: 'usePassive', // payload `usePassive`: mismo nombre ⇒ sin confirmKey (y `alwaysCheck` lo hace irrelevante)
    level: falseIsSafer,
    alwaysCheck: true,
    why: 'El empuje pasivo delante de la puntera SUMA resistencia, y el CTE lo condiciona a que ese terreno esté garantizado (que no se excave después, que no sea relleno reciente). Activarlo hace "cumplir" el deslizamiento apoyándose en una hipótesis que el usuario debe asumir a conciencia.',
  },
];

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

function buildRetainingWallPlan(
  x: RetainingWallPayload,
  current: RetainingWallInputs,
  _system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<RetainingWallInputs> {
  const fields: Partial<RetainingWallInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof RetainingWallInputs>(
    key: PayloadKey,
    field: K,
    value: RetainingWallInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  /** Escalar numérico con rango y unidad en el texto. */
  function applyNum<K extends keyof RetainingWallInputs>(
    key: PayloadKey,
    field: K,
    value: number | null,
    min: number,
    max: number,
    unit: string,
    decimals = 2,
  ): void {
    if (value === null) return;
    if (value < min || value > max) {
      skip(key, rangeReason(value, min, max, unit));
      return;
    }
    const v = round3(value);
    const before = current[field] as number;
    if (Math.abs(v - before) <= EPS) skip(key, ALREADY);
    else {
      const fmt = (n: number) => `${n.toFixed(decimals)}${unit === '' ? '' : ` ${unit}`}`;
      apply(key, field, v as RetainingWallInputs[K], fmt(before), fmt(v));
    }
  }

  // --- Geometría (metros) ---
  applyNum('H_m', 'H', x.H_m, 0.3, 20, 'm');
  applyNum('hf_m', 'hf', x.hf_m, 0.1, 5, 'm');
  applyNum('tFuste_m', 'tFuste', x.tFuste_m, 0.1, 3, 'm');
  applyNum('bPunta_m', 'bPunta', x.bPunta_m, 0, 10, 'm');
  applyNum('bTalon_m', 'bTalon', x.bTalon_m, 0, 15, 'm');
  applyNum('df_m', 'df', x.df_m, 0, 10, 'm');

  // --- Materiales. cover en MILÍMETROS (el motor rechaza < 10 mm) ---
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
  // El rango arranca en 10 mm a propósito: por debajo el motor invalida el
  // cálculo entero, y un 0.04 es un recubrimiento en metros mal convertido.
  applyNum('cover_mm', 'cover', x.cover_mm, 10, 100, 'mm', 0);

  // --- Relleno y terreno ---
  applyNum('gammaSuelo_kNm3', 'gammaSuelo', x.gammaSuelo_kNm3, 10, 30, 'kN/m³', 1);
  applyNum('gammaSat_kNm3', 'gammaSat', x.gammaSat_kNm3, 10, 30, 'kN/m³', 1);
  applyNum('phi_deg', 'phi', x.phi_deg, 5, 55, '°', 1);
  applyNum('delta_deg', 'delta', x.delta_deg, 0, 45, '°', 1);
  applyNum('q_kNm2', 'q', x.q_kNm2, 0, 200, 'kN/m²', 1);
  applyNum('sigmaAdm_kPa', 'sigmaAdm', x.sigmaAdm_kPa, 20, 2000, 'kPa', 0);
  applyNum('mu', 'mu', x.mu, 0.1, 1, '', 2);

  // --- Empuje pasivo ---
  if (x.usePassive !== null) {
    if (x.usePassive === current.usePassive) {
      skip('usePassive', ALREADY);
    } else {
      const fmt = (v: boolean) => (v ? 'Incluido' : 'No incluido');
      apply('usePassive', 'usePassive', x.usePassive, fmt(current.usePassive), fmt(x.usePassive));
    }
  }
  const passiveFinal = (fields.usePassive ?? current.usePassive) as boolean;
  const dfFinal = (fields.df ?? current.df) as number;
  const hfFinal = (fields.hf ?? current.hf) as number;
  if (passiveFinal && dfFinal + hfFinal <= 0) warnings.push(PASSIVE_NO_EMBED_WARNING);

  // --- Agua: hasWater gatea hw ---
  if (x.hasWater !== null) {
    if (x.hasWater === current.hasWater) {
      skip('hasWater', ALREADY);
    } else {
      const fmt = (v: boolean) => (v ? 'Con nivel freático' : 'Sin nivel freático');
      apply('hasWater', 'hasWater', x.hasWater, fmt(current.hasWater), fmt(x.hasWater));
    }
  }
  const waterFinal = (fields.hasWater ?? current.hasWater) as boolean;
  if (x.hw_m !== null && !waterFinal) skip('hw_m', WATER_GATE_REASON);
  else applyNum('hw_m', 'hw', x.hw_m, 0, 30, 'm');

  // --- Sismo: Ab gatea S ---
  applyNum('Ab', 'Ab', x.Ab, 0, 1, 'g', 2);
  const abFinal = (fields.Ab ?? current.Ab) as number;
  if (x.S !== null && abFinal <= 0) skip('S', SEISMIC_GATE_REASON);
  else applyNum('S', 'S', x.S, 0.5, 2, '', 2);

  // --- Armado: Ø = 0 es "zona sin definir" (modo dimensionado) ---
  for (const z of REBAR_ZONES) {
    const dKey = `diam_${z.key}_mm` as RebarKey;
    const sKey = `sep_${z.key}_mm` as RebarKey;
    const dField = `diam_${z.key}` as keyof RetainingWallInputs;
    const sField = `sep_${z.key}` as keyof RetainingWallInputs;

    const d = x[dKey];
    if (d !== null) {
      if (!REBAR_DIAMS.includes(d)) {
        skip(dKey, `Ø${d} no está entre los diámetros disponibles (0 = sin definir, Ø${REBAR_DIAMS.slice(1).join(', Ø')})`);
      } else if (d === (current[dField] as number)) {
        skip(dKey, ALREADY);
      } else {
        const fmt = (v: number) => (v === 0 ? 'sin definir (dimensionado)' : `Ø${v} mm`);
        apply(dKey, dField, d as RetainingWallInputs[typeof dField], fmt(current[dField] as number), fmt(d));
      }
    }
    applyNum(sKey, sField, x[sKey], 50, 400, 'mm', 0);
  }

  // --- notFound ---
  const values = x as unknown as Record<PayloadKey, unknown>;
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = detectSafetyRisks(
    RETAINING_WALL_SAFETY_RULES, changes, fields, current, retainingWallDefaults, confirmed,
  );
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

type StateKey = Exclude<keyof RetainingWallInputs, 'title'>;

const SNAPSHOT_FIELDS: Record<string, StateKey> = {
  H_m: 'H',
  hf_m: 'hf',
  tFuste_m: 'tFuste',
  bPunta_m: 'bPunta',
  bTalon_m: 'bTalon',
  df_m: 'df',
  fck_MPa: 'fck',
  fyk_MPa: 'fyk',
  cover_mm: 'cover',
  gammaSuelo_kNm3: 'gammaSuelo',
  gammaSat_kNm3: 'gammaSat',
  phi_deg: 'phi',
  delta_deg: 'delta',
  q_kNm2: 'q',
  sigmaAdm_kPa: 'sigmaAdm',
  mu: 'mu',
  usePassive: 'usePassive',
  hasWater: 'hasWater',
  hw_m: 'hw',
  Ab: 'Ab',
  S: 'S',
  ...Object.fromEntries(
    REBAR_ZONES.flatMap((z) => [
      [`diam_${z.key}_mm`, `diam_${z.key}`],
      [`sep_${z.key}_mm`, `sep_${z.key}`],
    ]),
  ),
};

function buildSnapshot(c: RetainingWallInputs): string {
  const valores: Record<string, number | string | boolean> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    valores[key] = value;
    if (value === retainingWallDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/**
 * Resume el resultado del motor de muros. `{valid, error?, checks}` ✓ directo.
 *
 * TRAMPA DEL NÚCLEO CENTRAL: con |e| ≥ B/3 el motor fuerza `sigma-min` a fail y
 * OMITE el bloque estructural entero (fuste, talón y puntera) — el resultado sigue
 * siendo válido, pero sin esas comprobaciones. Se detecta por la ausencia del check
 * `fuste-bending` y se dice explícitamente: si no, el modelo "echa en falta"
 * comprobaciones y se inventa el motivo.
 */
export function summarizeRetainingWallResults(r: RetainingWallResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(r);

  const seismic = r.kh_derived > 0;
  const extras: string[] = [
    `Empujes: Ka = ${r.Ka.toFixed(3)} · E_activo = ${r.EAH_total.toFixed(1)} kN/m`
    + (r.EW !== undefined ? ` · E_agua = ${r.EW.toFixed(1)} kN/m` : '')
    + (r.Ep !== undefined ? ` · E_pasivo = ${r.Ep.toFixed(1)} kN/m` : ''),
    `Estabilidad: FS vuelco = ${(seismic && r.FS_vuelco_seis !== undefined ? r.FS_vuelco_seis : r.FS_vuelco).toFixed(2)} · `
    + `FS deslizamiento = ${(seismic && r.FS_desliz_seis !== undefined ? r.FS_desliz_seis : r.FS_desliz).toFixed(2)}`
    + (seismic ? ' (valores SÍSMICOS, que son los que gobiernan)' : ''),
    `Cimentación: ΣV = ${r.ΣV.toFixed(1)} kN/m · excentricidad e = ${r.e.toFixed(3)} m `
    + `(positiva hacia la puntera) · σmax = ${r.sigma_max.toFixed(1)} kPa · σmin = ${r.sigma_min.toFixed(1)} kPa`,
  ];
  if (seismic) {
    extras.push(`Sismo: kh = ${r.kh_derived.toFixed(3)} · kv = ${r.kv_derived.toFixed(3)} (derivados de Ab y S)`);
  }
  if (r.seismicUnstable === true) {
    extras.push('AVISO: con esta sismicidad el relleno no es estable por sí mismo (φ − θ < 0): el empuje sísmico no se puede evaluar.');
  }
  if (!r.checks.some((c) => c.id === 'fuste-bending')) {
    extras.push(
      'ATENCIÓN: la resultante se sale del núcleo central (|e| ≥ B/3), así que la app NO ha '
      + 'comprobado el armado (fuste, talón ni puntera). No faltan comprobaciones: es que el muro '
      + 'hay que redimensionarlo antes — normalmente alargando el talón.',
    );
  }

  return summarizeCalcResults(r, extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const retainingWallAdapter: AiModuleAdapter<RetainingWallInputs> = {
  id: 'retaining-wall',
  label: 'Muro de contención',
  payloadSchema: RETAINING_WALL_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildRetainingWallPlan(parsePayload(payload), current, system, confirmed),
};
