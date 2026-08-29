/**
 * Adapter del asistente IA para el módulo Muros de escollera y gaviones
 * (Guía Fomento 2006 + CTE DB-SE-C).
 *
 * Particularidades del módulo:
 * - DOS TIPOLOGÍAS gateadas por `wallType`: los campos de escollera (taludes,
 *   contrainclinación de hiladas) no intervienen en gaviones y viceversa
 *   (filas de cajas, escalón, batter). El gate se resuelve con el valor FINAL
 *   de wallType (propuesto o actual), como hasWater→hw en el muro de contención.
 * - φ del muro con dos modos: 'directo' (φ_deg) o 'guia' (litología + Δφe; la
 *   app deriva Δφn de la tensión en la base). phiMode gatea los tres campos.
 * - Es un muro de GRAVEDAD: no hay armado. Para que cumpla se actúa sobre la
 *   GEOMETRÍA (ancho de coronación, taludes, cimiento). El terreno, la
 *   sobrecarga y la sismicidad son DATOS.
 * - `kh` y `kv` son DERIVADOS (kh = S·Ab, kv = kh/2) — la IA propone Ab y S.
 * - La contrainclinación de hiladas por encima de 3H:1V (18.4°) no debe usarse
 *   para "hacer cumplir" el deslizamiento entre hiladas (Guía §4.2.2.4).
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
import type { RockfillWallResult } from '../../calculations/rockfillWall';
import {
  rockfillWallDefaults,
  type RockfillWallInputs,
  type RockfillLitologia,
} from '../../../data/defaults';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
const WALL_TYPES = ['escollera', 'gaviones'] as const;
const PHI_MODES = ['directo', 'guia'] as const;
const STEP_ALIGNS = ['front', 'back'] as const;
const LITOLOGIAS: readonly RockfillLitologia[] = [
  'granito', 'gneis', 'cuarcita', 'basalto', 'riolita',
  'granodiorita', 'caliza', 'conglomerado', 'arenisca',
];
const HCAJAS = [0.5, 1.0] as const;

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const ROCKFILL_WALL_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'wallType',
    'H_m', 'a_m', 'mIntra_h1v', 'mTras_h1v', 'alphaHiladas_deg',
    'hCaja_m', 'stepCaja_m', 'stepAlign', 'alphaBatter_deg',
    'hz_m', 'x0_m', 'xT_m', 'alphaBase_deg', 'df_m',
    'gammaAp_kNm3', 'phiMode', 'phi_deg', 'litologia', 'dPhiE_deg', 'contactoMejorado',
    'gammaSuelo_kNm3', 'gammaSat_kNm3', 'phiRelleno_deg', 'delta_deg', 'beta_deg',
    'q_kNm2', 'sigmaAdm_kPa', 'muBase',
    'usePassive', 'hasWater', 'hw_m', 'Ab', 'S',
    'warnings',
  ],
  properties: {
    wallType: { type: ['string', 'null'], enum: [...WALL_TYPES, null], description: "Tipología del muro de gravedad: 'escollera' (bloques colocados, cuerpo trapecial) o 'gaviones' (filas de cajas escalonadas)." },
    H_m: { type: ['number', 'null'], description: 'Altura del cuerpo del muro sobre la cara superior del cimiento, en metros. En gaviones la app la ajusta a un número entero de filas.' },
    a_m: { type: ['number', 'null'], description: 'Ancho de coronación, en metros. La Guía exige ≥ 2 m en escollera (1.5 m justificable si H < 5 m).' },
    mIntra_h1v: { type: ['number', 'null'], description: 'SOLO escollera: talud del intradós (paramento visto) en metros horizontales por metro de altura. La Guía exige ≥ 0.33 (1H:3V). Ejemplo: 0.34.' },
    mTras_h1v: { type: ['number', 'null'], description: 'SOLO escollera: batter del trasdós hacia el relleno, en m/m. 0 = trasdós vertical.' },
    alphaHiladas_deg: { type: ['number', 'null'], description: 'SOLO escollera: contrainclinación de las hiladas hacia el trasdós, en grados. La Guía prescribe ≈ 18.4° (3H:1V). NO subirla por encima para hacer cumplir el deslizamiento.' },
    hCaja_m: { type: ['number', 'null'], enum: [...HCAJAS, null], description: 'SOLO gaviones: altura de cada fila de cajas, en metros (0.5 o 1.0).' },
    stepCaja_m: { type: ['number', 'null'], description: 'SOLO gaviones: incremento de ancho de cada fila hacia abajo, en metros.' },
    stepAlign: { type: ['string', 'null'], enum: [...STEP_ALIGNS, null], description: "SOLO gaviones: 'back' = trasdós plano con escalones vistos (habitual en contención); 'front' = paramento visto plano." },
    alphaBatter_deg: { type: ['number', 'null'], description: 'SOLO gaviones: contrainclinación global de la pila de cajas hacia el relleno, en grados (típico 6–10).' },
    hz_m: { type: ['number', 'null'], description: 'Canto del cimiento de escollera hormigonada, en metros. La Guía recomienda ≥ 1 m.' },
    x0_m: { type: ['number', 'null'], description: 'Vuelo de la puntera del cimiento (lado visto), en metros.' },
    xT_m: { type: ['number', 'null'], description: 'Vuelo del talón del cimiento (lado del relleno), en metros.' },
    alphaBase_deg: { type: ['number', 'null'], description: 'Contrainclinación del plano de apoyo del cimiento hacia el trasdós, en grados (Guía: ≈ 18.4° = 3H:1V). Mejora el deslizamiento.' },
    df_m: { type: ['number', 'null'], description: 'Terreno frontal por encima de la cara superior del cimiento, en metros. Con usePassive habilita el empuje pasivo.' },
    gammaAp_kNm3: { type: ['number', 'null'], description: 'Peso específico APARENTE del cuerpo del muro γap = γd·(1−n), en kN/m³. Escollera colocada: 17–19; gaviones: 15–18.' },
    phiMode: { type: ['string', 'null'], enum: [...PHI_MODES, null], description: "Cómo se define el rozamiento interno del muro: 'directo' (φ_deg) o 'guia' (φ = φb por litología + Δφe − Δφn, Guía 2006 §4.1.3)." },
    phi_deg: { type: ['number', 'null'], description: "SOLO phiMode='directo': ángulo de rozamiento interno del material del muro, en grados (escollera colocada: 38–42)." },
    litologia: { type: ['string', 'null'], enum: [...LITOLOGIAS, null], description: "SOLO phiMode='guia': litología de la roca (tabla 4.2 de la Guía → φb)." },
    dPhiE_deg: { type: ['number', 'null'], description: "SOLO phiMode='guia': incremento Δφe por colocación cuidada, en grados (1–3 según la tabla 4.2)." },
    contactoMejorado: { type: ['boolean', 'null'], description: 'true = hiladas trabadas/recebadas con hormigón: el rozamiento entre hiladas usa φ completo en vez del ⅔·φ conservador. Solo si la ejecución lo garantiza.' },
    gammaSuelo_kNm3: { type: ['number', 'null'], description: 'Peso específico del relleno del trasdós, en kN/m³ (típico 18–20).' },
    gammaSat_kNm3: { type: ['number', 'null'], description: 'Peso específico SATURADO del relleno, en kN/m³. Solo interviene bajo el nivel freático.' },
    phiRelleno_deg: { type: ['number', 'null'], description: 'Ángulo de rozamiento interno del relleno del trasdós, en grados. Dato del estudio geotécnico: fija Ka.' },
    delta_deg: { type: ['number', 'null'], description: 'Rozamiento muro-relleno δ en el plano virtual de empuje, en grados (habitual ⅔·φ del relleno; 0 el caso más conservador).' },
    beta_deg: { type: ['number', 'null'], description: 'Inclinación de la superficie del terreno sobre la coronación, en grados. Debe ser menor que φ del relleno.' },
    q_kNm2: { type: ['number', 'null'], description: 'Sobrecarga uniforme sobre el relleno del trasdós, en kN/m².' },
    sigmaAdm_kPa: { type: ['number', 'null'], description: 'Tensión admisible del terreno de cimentación, en kPa. La fija el estudio geotécnico.' },
    muBase: { type: ['number', 'null'], description: 'Coeficiente de rozamiento cimiento-terreno (≈ tan ⅔·φ del terreno de apoyo). Lo fija el estudio geotécnico.' },
    usePassive: { type: ['boolean', 'null'], description: 'true para INCLUIR el empuje pasivo frontal en la estabilidad. Solo si el terreno delantero está garantizado (decisión de proyecto).' },
    hasWater: { type: ['boolean', 'null'], description: 'true si hay nivel freático en el trasdós. La Guía exige además garantizar el drenaje.' },
    hw_m: { type: ['number', 'null'], description: 'Profundidad del nivel freático desde la CORONACIÓN, en metros. Solo con hasWater = true.' },
    Ab: { type: ['number', 'null'], description: 'Aceleración sísmica básica, como FRACCIÓN de g (mapa NCSE-02). 0 = sin comprobación sísmica.' },
    S: { type: ['number', 'null'], description: 'Coeficiente de amplificación del terreno (NCSE-02). La app deriva kh = S·Ab y kv = kh/2.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Muros de escollera y gaviones:
1. TIPOLOGÍA: wallType gatea los campos. Los taludes del cuerpo (mIntra, mTras) y la contrainclinación de hiladas son SOLO de escollera; la altura de caja, el escalón, la alineación y el batter son SOLO de gaviones. No propongas campos de la tipología inactiva.
2. UNIDADES: toda la geometría va en METROS y los ángulos en GRADOS. Los taludes del cuerpo van como metros horizontales por metro de altura (1H:3V = 0.33).
3. Es un muro de GRAVEDAD sin armadura: para que cumpla se actúa sobre la GEOMETRÍA (más ancho de coronación, taludes más tendidos, cimiento mayor, más contrainclinación de la base). En gaviones, más escalón o cajas más anchas.
4. Son DATOS del problema, no variables de diseño: la altura a contener (H_m), la sobrecarga q, los pesos específicos y φ del relleno, δ, la pendiente del terreno β, la tensión admisible, el rozamiento de la base, el nivel freático y la sismicidad. NUNCA los "mejores" para que salga el cálculo.
5. HILADAS: la comprobación característica del módulo es que ninguna piedra deslice sobre otra (índice ≤ 1 con γR = 1.5). La contrainclinación de hiladas prescrita es ≈ 18.4° (3H:1V); NO la subas por encima para hacer cumplir — la Guía no permite contar con más en el cálculo.
6. φ DEL MURO: phiMode gatea. En 'directo' propón phi_deg; en 'guia' propón litologia y dPhiE_deg (la app deriva Δφn de la tensión en la base). contactoMejorado = true regala resistencia entre hiladas: solo si el usuario garantiza la ejecución (recebado con hormigón).
7. SISMO: introduce solo Ab (fracción de g) y S; la app deriva kh = S·Ab y kv = kh/2.
8. GAVIONES: la app ajusta H a un número entero de filas de altura hCaja. El peso γap de caja rellena es γ piedra·(1−n) ≈ 15–18 kN/m³, no el de la roca maciza.
9. La ESTABILIDAD GLOBAL (superficie que engloba todo el muro) no se calcula aquí: se remite al módulo Taludes. Si el usuario la pide, dile dónde está.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Escollera de 5 m de altura con coronación de 2 m, intradós 1H:3V, cimiento de 1 m '
  + 'contrainclinado 3H:1V. Relleno γ = 19 kN/m³ y φ = 30°, δ = 20°, terreno admisible 200 kPa, '
  + 'escollera caliza de 18 kN/m³ aparentes.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

type RockfillWallPayload = {
  wallType: string | null;
  H_m: number | null;
  a_m: number | null;
  mIntra_h1v: number | null;
  mTras_h1v: number | null;
  alphaHiladas_deg: number | null;
  hCaja_m: number | null;
  stepCaja_m: number | null;
  stepAlign: string | null;
  alphaBatter_deg: number | null;
  hz_m: number | null;
  x0_m: number | null;
  xT_m: number | null;
  alphaBase_deg: number | null;
  df_m: number | null;
  gammaAp_kNm3: number | null;
  phiMode: string | null;
  phi_deg: number | null;
  litologia: string | null;
  dPhiE_deg: number | null;
  contactoMejorado: boolean | null;
  gammaSuelo_kNm3: number | null;
  gammaSat_kNm3: number | null;
  phiRelleno_deg: number | null;
  delta_deg: number | null;
  beta_deg: number | null;
  q_kNm2: number | null;
  sigmaAdm_kPa: number | null;
  muBase: number | null;
  usePassive: boolean | null;
  hasWater: boolean | null;
  hw_m: number | null;
  Ab: number | null;
  S: number | null;
  warnings: string[];
};

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parsePayload(raw: unknown): RockfillWallPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    wallType: strOrNull(r.wallType),
    H_m: finiteNumber(r.H_m),
    a_m: finiteNumber(r.a_m),
    mIntra_h1v: finiteNumber(r.mIntra_h1v),
    mTras_h1v: finiteNumber(r.mTras_h1v),
    alphaHiladas_deg: finiteNumber(r.alphaHiladas_deg),
    hCaja_m: finiteNumber(r.hCaja_m),
    stepCaja_m: finiteNumber(r.stepCaja_m),
    stepAlign: strOrNull(r.stepAlign),
    alphaBatter_deg: finiteNumber(r.alphaBatter_deg),
    hz_m: finiteNumber(r.hz_m),
    x0_m: finiteNumber(r.x0_m),
    xT_m: finiteNumber(r.xT_m),
    alphaBase_deg: finiteNumber(r.alphaBase_deg),
    df_m: finiteNumber(r.df_m),
    gammaAp_kNm3: finiteNumber(r.gammaAp_kNm3),
    phiMode: strOrNull(r.phiMode),
    phi_deg: finiteNumber(r.phi_deg),
    litologia: strOrNull(r.litologia),
    dPhiE_deg: finiteNumber(r.dPhiE_deg),
    contactoMejorado: boolOrNull(r.contactoMejorado),
    gammaSuelo_kNm3: finiteNumber(r.gammaSuelo_kNm3),
    gammaSat_kNm3: finiteNumber(r.gammaSat_kNm3),
    phiRelleno_deg: finiteNumber(r.phiRelleno_deg),
    delta_deg: finiteNumber(r.delta_deg),
    beta_deg: finiteNumber(r.beta_deg),
    q_kNm2: finiteNumber(r.q_kNm2),
    sigmaAdm_kPa: finiteNumber(r.sigmaAdm_kPa),
    muBase: finiteNumber(r.muBase),
    usePassive: boolOrNull(r.usePassive),
    hasWater: boolOrNull(r.hasWater),
    hw_m: finiteNumber(r.hw_m),
    Ab: finiteNumber(r.Ab),
    S: finiteNumber(r.S),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS: Record<string, string> = {
  wallType: 'Tipología',
  H_m: 'Altura del cuerpo H',
  a_m: 'Ancho de coronación a',
  mIntra_h1v: 'Talud del intradós',
  mTras_h1v: 'Talud del trasdós',
  alphaHiladas_deg: 'Contrainclinación de hiladas',
  hCaja_m: 'Altura de caja',
  stepCaja_m: 'Escalón por fila',
  stepAlign: 'Alineación de las filas',
  alphaBatter_deg: 'Contrainclinación de la pila',
  hz_m: 'Canto del cimiento hz',
  x0_m: 'Vuelo de puntera',
  xT_m: 'Vuelo de talón',
  alphaBase_deg: 'Contrainclinación de la base',
  df_m: 'Empotramiento frontal d_f',
  gammaAp_kNm3: 'Peso específico aparente γap',
  phiMode: 'Definición de φ del muro',
  phi_deg: 'Rozamiento interno del muro φ',
  litologia: 'Litología (tabla 4.2)',
  dPhiE_deg: 'Mejora por colocación Δφe',
  contactoMejorado: 'Contacto mejorado entre hiladas',
  gammaSuelo_kNm3: 'Peso específico del relleno γ',
  gammaSat_kNm3: 'Peso específico saturado γsat',
  phiRelleno_deg: 'Rozamiento del relleno φt',
  delta_deg: 'Rozamiento muro-relleno δ',
  beta_deg: 'Talud del terreno β',
  q_kNm2: 'Sobrecarga q',
  sigmaAdm_kPa: 'Tensión admisible σadm',
  muBase: 'Coef. de rozamiento base μ',
  usePassive: 'Empuje pasivo',
  hasWater: 'Nivel freático',
  hw_m: 'Profundidad del NF',
  Ab: 'Aceleración básica Ab',
  S: 'Amplificación del terreno S',
};

type PayloadKey = Exclude<keyof RockfillWallPayload, 'warnings'>;

/** ORDER del contrato: `wallType` primero (gatea familias), `phiMode` antes que
 *  φ/litología, `hasWater` antes que `hw`, `Ab` antes que `S`. */
const KEY_ORDER: readonly PayloadKey[] = [
  'wallType',
  'H_m', 'a_m', 'mIntra_h1v', 'mTras_h1v', 'alphaHiladas_deg',
  'hCaja_m', 'stepCaja_m', 'stepAlign', 'alphaBatter_deg',
  'hz_m', 'x0_m', 'xT_m', 'alphaBase_deg', 'df_m',
  'gammaAp_kNm3', 'phiMode', 'phi_deg', 'litologia', 'dPhiE_deg', 'contactoMejorado',
  'gammaSuelo_kNm3', 'gammaSat_kNm3', 'phiRelleno_deg', 'delta_deg', 'beta_deg',
  'q_kNm2', 'sigmaAdm_kPa', 'muBase',
  'usePassive', 'hasWater', 'hw_m', 'Ab', 'S',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

export const WATER_GATE_REASON =
  'Sin nivel freático (hasWater), la profundidad del NF no interviene en el cálculo.';

export const SEISMIC_GATE_REASON =
  'Sin sismo (Ab = 0), el coeficiente de amplificación del terreno no interviene: kh = S·Ab sería 0 igualmente.';

export const ESCOLLERA_GATE_REASON =
  'Con tipología gaviones, los taludes del cuerpo y la contrainclinación de hiladas no intervienen.';

export const GAVION_GATE_REASON =
  'Con tipología escollera, las filas de cajas (altura, escalón, alineación, batter) no intervienen.';

export const PHI_DIRECTO_GATE_REASON =
  "Con φ en modo 'guia', el φ directo no interviene: se deriva de la litología (φb + Δφe − Δφn).";

export const PHI_GUIA_GATE_REASON =
  "Con φ en modo 'directo', la litología y Δφe no intervienen: se usa el φ introducido.";

/**
 * La tabla anti-trampa: en un muro de gravedad el PESO PROPIO es la resistencia,
 * así que subir γap del muro es tan tramposo como subir σadm del terreno. Todo
 * el terreno (relleno, apoyo, NF, sismo) es dato del estudio geotécnico; el φ
 * del muro y su mejora por colocación regalan rozamiento entre hiladas.
 */
export const ROCKFILL_WALL_SAFETY_RULES: ReadonlyArray<SafetyRule<RockfillWallInputs>> = [
  { field: 'H', confirmKey: 'H_m', level: higherIsSafer, why: 'La altura de terreno a contener la fija el proyecto: rebajarla reduce el empuje activo (que crece con H²) y con él todos los índices.' },
  { field: 'q', confirmKey: 'q_kNm2', level: higherIsSafer, why: 'La sobrecarga sobre el relleno la fija el uso previsto (tráfico, acopios): rebajarla reduce el empuje sin que la obra haya cambiado.' },
  { field: 'gammaSuelo', confirmKey: 'gammaSuelo_kNm3', level: higherIsSafer, why: 'El peso específico del relleno es dato del estudio geotécnico: rebajarlo reduce el empuje activo, que es proporcional a γ.' },
  { field: 'gammaSat', confirmKey: 'gammaSat_kNm3', level: higherIsSafer, why: 'El peso específico saturado es dato del estudio geotécnico: rebajarlo reduce el empuje bajo el nivel freático.' },
  { field: 'beta', confirmKey: 'beta_deg', level: higherIsSafer, why: 'La pendiente del terreno sobre la coronación la fija el emplazamiento: rebajarla reduce el coeficiente de empuje Ka sin que el terreno haya cambiado.' },
  { field: 'Ab', level: higherIsSafer, why: 'La aceleración sísmica básica la fija el mapa de peligrosidad de la NCSE-02 según el emplazamiento: rebajarla elimina o suaviza la comprobación sísmica.' },
  { field: 'S', level: higherIsSafer, why: 'El coeficiente de amplificación del terreno lo fija su clasificación en la NCSE-02: rebajarlo reduce kh = S·Ab y con él la acción sísmica.' },
  { field: 'gammaAp', confirmKey: 'gammaAp_kNm3', level: lowerIsSafer, why: 'En un muro de gravedad el peso propio ES la resistencia: subir el γ aparente (bajar la porosidad sobre el papel) hace "cumplir" el muro sin cambiar ni la piedra ni la colocación.' },
  { field: 'phi', confirmKey: 'phi_deg', level: lowerIsSafer, why: 'El rozamiento interno de la escollera colocada lo fija la roca y su colocación (38–42° según la Guía): subirlo regala resistencia al deslizamiento entre hiladas.' },
  { field: 'dPhiE', confirmKey: 'dPhiE_deg', level: lowerIsSafer, why: 'La mejora Δφe por colocación (1–3°) exige cumplir las prescripciones de ejecución del capítulo 5 de la Guía: subirla es contar con una ejecución que nadie ha garantizado.' },
  { field: 'phiRelleno', confirmKey: 'phiRelleno_deg', level: lowerIsSafer, why: 'El ángulo de rozamiento del relleno es dato del estudio geotécnico: SUBIRLO baja el coeficiente de empuje Ka y hace "cumplir" el muro sin tocarlo.' },
  { field: 'delta', confirmKey: 'delta_deg', level: lowerIsSafer, why: 'El rozamiento muro-relleno lo fija la rugosidad del trasdós: subirlo inclina el empuje y reduce su componente horizontal — el lado conservador es δ = 0.' },
  { field: 'sigmaAdm', confirmKey: 'sigmaAdm_kPa', level: lowerIsSafer, why: 'La tensión admisible del terreno la fija el estudio geotécnico: subirla hace "cumplir" el hundimiento sin ensanchar el cimiento.' },
  { field: 'muBase', level: lowerIsSafer, why: 'El coeficiente de rozamiento cimiento-terreno lo fija el estudio geotécnico: subirlo hace "cumplir" el deslizamiento sin tocar el muro.' },
  { field: 'hw', confirmKey: 'hw_m', level: lowerIsSafer, why: 'La profundidad del nivel freático la fija el estudio geotécnico: profundizarlo reduce el empuje hidrostático del trasdós.' },
  { field: 'hasWater', level: trueIsSafer, why: 'El nivel freático lo fija el estudio geotécnico: desactivarlo borra de golpe el empuje hidrostático del trasdós, que puede gobernar todas las comprobaciones.' },
  {
    field: 'usePassive',
    level: falseIsSafer,
    alwaysCheck: true,
    why: 'El empuje pasivo frontal SUMA resistencia y el CTE lo condiciona a que ese terreno esté garantizado (que no se excave después). Activarlo hace "cumplir" el deslizamiento apoyándose en una hipótesis que el usuario debe asumir a conciencia.',
  },
  {
    field: 'contactoMejorado',
    level: falseIsSafer,
    alwaysCheck: true,
    why: 'El contacto mejorado entre hiladas (φ completo en vez de ⅔·φ) presupone bloques trabados o recebados con hormigón: activarlo regala un 50% de rozamiento entre piedras que solo la ejecución puede garantizar.',
  },
];

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

function buildRockfillWallPlan(
  x: RockfillWallPayload,
  current: RockfillWallInputs,
  _system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<RockfillWallInputs> {
  const fields: Partial<RockfillWallInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ field: key, label: LABELS[key], reason });
  }

  function apply<K extends keyof RockfillWallInputs>(
    key: PayloadKey,
    field: K,
    value: RockfillWallInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  function applyNum<K extends keyof RockfillWallInputs>(
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
      apply(key, field, v as RockfillWallInputs[K], fmt(before), fmt(v));
    }
  }

  function applyEnum<K extends keyof RockfillWallInputs>(
    key: PayloadKey,
    field: K,
    value: string | null,
    catalog: readonly string[],
    fmt: (v: string) => string,
  ): void {
    if (value === null) return;
    if (!catalog.includes(value)) {
      skip(key, `'${value}' no está en el catálogo (${catalog.join(', ')})`);
      return;
    }
    if (value === (current[field] as string)) skip(key, ALREADY);
    else apply(key, field, value as RockfillWallInputs[K], fmt(current[field] as string), fmt(value));
  }

  // --- Tipología (gatea las dos familias) ---
  applyEnum('wallType', 'wallType', x.wallType, WALL_TYPES, (v) => (v === 'escollera' ? 'Escollera' : 'Gaviones'));
  const typeFinal = (fields.wallType ?? current.wallType) as string;
  const isGavion = typeFinal === 'gaviones';

  // --- Geometría común ---
  applyNum('H_m', 'H', x.H_m, 0.5, 20, 'm');
  applyNum('a_m', 'a', x.a_m, 0.5, 8, 'm');

  // --- Cuerpo escollera (gate por tipología) ---
  if (isGavion) {
    if (x.mIntra_h1v !== null) skip('mIntra_h1v', ESCOLLERA_GATE_REASON);
    if (x.mTras_h1v !== null) skip('mTras_h1v', ESCOLLERA_GATE_REASON);
    if (x.alphaHiladas_deg !== null) skip('alphaHiladas_deg', ESCOLLERA_GATE_REASON);
  } else {
    applyNum('mIntra_h1v', 'mIntra', x.mIntra_h1v, 0, 2, 'H:1V');
    applyNum('mTras_h1v', 'mTras', x.mTras_h1v, 0, 2, 'H:1V');
    applyNum('alphaHiladas_deg', 'alphaHiladas', x.alphaHiladas_deg, 0, 30, '°', 1);
  }

  // --- Cuerpo gaviones (gate por tipología) ---
  if (!isGavion) {
    if (x.hCaja_m !== null) skip('hCaja_m', GAVION_GATE_REASON);
    if (x.stepCaja_m !== null) skip('stepCaja_m', GAVION_GATE_REASON);
    if (x.stepAlign !== null) skip('stepAlign', GAVION_GATE_REASON);
    if (x.alphaBatter_deg !== null) skip('alphaBatter_deg', GAVION_GATE_REASON);
  } else {
    if (x.hCaja_m !== null) {
      if (!HCAJAS.some((h) => Math.abs(h - x.hCaja_m!) <= EPS)) {
        skip('hCaja_m', `Altura de caja ${x.hCaja_m} m no estándar (${HCAJAS.join(', ')} m)`);
      } else if (Math.abs(x.hCaja_m - current.hCaja) <= EPS) {
        skip('hCaja_m', ALREADY);
      } else {
        apply('hCaja_m', 'hCaja', x.hCaja_m, `${current.hCaja.toFixed(1)} m`, `${x.hCaja_m.toFixed(1)} m`);
      }
    }
    applyNum('stepCaja_m', 'stepCaja', x.stepCaja_m, 0, 2, 'm');
    applyEnum('stepAlign', 'stepAlign', x.stepAlign, STEP_ALIGNS, (v) => (v === 'back' ? 'Trasdós plano' : 'Frente plano'));
    applyNum('alphaBatter_deg', 'alphaBatter', x.alphaBatter_deg, 0, 30, '°', 1);
  }

  // --- Cimiento ---
  applyNum('hz_m', 'hz', x.hz_m, 0.3, 4, 'm');
  applyNum('x0_m', 'x0', x.x0_m, 0, 5, 'm');
  applyNum('xT_m', 'xT', x.xT_m, 0, 5, 'm');
  applyNum('alphaBase_deg', 'alphaBase', x.alphaBase_deg, 0, 30, '°', 1);
  applyNum('df_m', 'df', x.df_m, 0, 10, 'm');

  // --- Material del muro: phiMode gatea φ / litología ---
  applyNum('gammaAp_kNm3', 'gammaAp', x.gammaAp_kNm3, 10, 26, 'kN/m³', 1);
  applyEnum('phiMode', 'phiMode', x.phiMode, PHI_MODES, (v) => (v === 'guia' ? 'Guía 2006 (φb+Δφe−Δφn)' : 'Directo'));
  const phiModeFinal = (fields.phiMode ?? current.phiMode) as string;
  if (phiModeFinal === 'guia') {
    if (x.phi_deg !== null) skip('phi_deg', PHI_DIRECTO_GATE_REASON);
    applyEnum('litologia', 'litologia', x.litologia, LITOLOGIAS, (v) => v);
    applyNum('dPhiE_deg', 'dPhiE', x.dPhiE_deg, 0, 3, '°', 1);
  } else {
    if (x.litologia !== null) skip('litologia', PHI_GUIA_GATE_REASON);
    if (x.dPhiE_deg !== null) skip('dPhiE_deg', PHI_GUIA_GATE_REASON);
    applyNum('phi_deg', 'phi', x.phi_deg, 20, 55, '°', 1);
  }
  if (x.contactoMejorado !== null) {
    if (x.contactoMejorado === current.contactoMejorado) {
      skip('contactoMejorado', ALREADY);
    } else {
      const fmt = (v: boolean) => (v ? 'tan φ (mejorado)' : 'tan ⅔·φ');
      apply('contactoMejorado', 'contactoMejorado', x.contactoMejorado, fmt(current.contactoMejorado), fmt(x.contactoMejorado));
    }
  }

  // --- Relleno y terreno ---
  applyNum('gammaSuelo_kNm3', 'gammaSuelo', x.gammaSuelo_kNm3, 10, 30, 'kN/m³', 1);
  applyNum('gammaSat_kNm3', 'gammaSat', x.gammaSat_kNm3, 10, 30, 'kN/m³', 1);
  applyNum('phiRelleno_deg', 'phiRelleno', x.phiRelleno_deg, 5, 55, '°', 1);
  applyNum('delta_deg', 'delta', x.delta_deg, 0, 45, '°', 1);
  applyNum('beta_deg', 'beta', x.beta_deg, 0, 50, '°', 1);
  applyNum('q_kNm2', 'q', x.q_kNm2, 0, 200, 'kN/m²', 1);
  applyNum('sigmaAdm_kPa', 'sigmaAdm', x.sigmaAdm_kPa, 20, 2000, 'kPa', 0);
  applyNum('muBase', 'muBase', x.muBase, 0.1, 1, '', 2);

  // --- Empuje pasivo ---
  if (x.usePassive !== null) {
    if (x.usePassive === current.usePassive) {
      skip('usePassive', ALREADY);
    } else {
      const fmt = (v: boolean) => (v ? 'Incluido' : 'No incluido');
      apply('usePassive', 'usePassive', x.usePassive, fmt(current.usePassive), fmt(x.usePassive));
    }
  }

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

  // --- notFound ---
  const values = x as unknown as Record<PayloadKey, unknown>;
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = detectSafetyRisks(
    ROCKFILL_WALL_SAFETY_RULES, changes, fields, current, rockfillWallDefaults, confirmed,
  );
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

type StateKey = Exclude<keyof RockfillWallInputs, 'title'>;

const SNAPSHOT_FIELDS: Record<PayloadKey, StateKey> = {
  wallType: 'wallType',
  H_m: 'H',
  a_m: 'a',
  mIntra_h1v: 'mIntra',
  mTras_h1v: 'mTras',
  alphaHiladas_deg: 'alphaHiladas',
  hCaja_m: 'hCaja',
  stepCaja_m: 'stepCaja',
  stepAlign: 'stepAlign',
  alphaBatter_deg: 'alphaBatter',
  hz_m: 'hz',
  x0_m: 'x0',
  xT_m: 'xT',
  alphaBase_deg: 'alphaBase',
  df_m: 'df',
  gammaAp_kNm3: 'gammaAp',
  phiMode: 'phiMode',
  phi_deg: 'phi',
  litologia: 'litologia',
  dPhiE_deg: 'dPhiE',
  contactoMejorado: 'contactoMejorado',
  gammaSuelo_kNm3: 'gammaSuelo',
  gammaSat_kNm3: 'gammaSat',
  phiRelleno_deg: 'phiRelleno',
  delta_deg: 'delta',
  beta_deg: 'beta',
  q_kNm2: 'q',
  sigmaAdm_kPa: 'sigmaAdm',
  muBase: 'muBase',
  usePassive: 'usePassive',
  hasWater: 'hasWater',
  hw_m: 'hw',
  Ab: 'Ab',
  S: 'S',
};

function buildSnapshot(c: RockfillWallInputs): string {
  const valores: Record<string, number | string | boolean> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    valores[key] = value;
    if (value === rockfillWallDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

export function summarizeRockfillWallResults(r: RockfillWallResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(r);

  const seismic = r.kh_derived > 0;
  const extras: string[] = [
    `Empujes: Ka = ${r.Ka.toFixed(3)} · E_activo = ${r.EAH_total.toFixed(1)} kN/m`
    + (r.EW !== undefined ? ` · E_agua = ${r.EW.toFixed(1)} kN/m` : '')
    + (r.Ep !== undefined ? ` · E_pasivo = ${r.Ep.toFixed(1)} kN/m` : ''),
    `Material del muro: φ = ${r.phiEff.toFixed(1)}° · rozamiento entre hiladas tan(${r.phiPP.toFixed(1)}°)`
    + (r.dPhiN !== undefined ? ` · Δφn = ${r.dPhiN.toFixed(2)}° (σn = ${(r.sigmaN ?? 0).toFixed(0)} kPa)` : ''),
    `Hiladas (índices ≤ 1, γR incluido): deslizamiento pésimo = ${r.worstSlide.util.toFixed(2)} en z = ${r.worstSlide.z.toFixed(2)} m · `
    + `vuelco parcial pésimo = ${r.worstOvert.util.toFixed(2)} en z = ${r.worstOvert.z.toFixed(2)} m`,
    `Base: FS vuelco = ${(seismic && r.FS_vuelco_seis !== undefined ? r.FS_vuelco_seis : r.FS_vuelco).toFixed(2)} · `
    + `FS deslizamiento = ${isFinite(seismic && r.FS_desliz_seis !== undefined ? r.FS_desliz_seis : r.FS_desliz) ? (seismic && r.FS_desliz_seis !== undefined ? r.FS_desliz_seis : r.FS_desliz).toFixed(2) : '∞ (autoestable por la contrainclinación)'}`
    + (seismic ? ' (valores SÍSMICOS, que son los que gobiernan)' : ''),
    `Cimentación: ΣV = ${r.ΣV.toFixed(1)} kN/m · e = ${r.e.toFixed(3)} m · b' = ${r.bEq.toFixed(2)} m · σ_ref = ${r.sigma_ref.toFixed(1)} kPa`,
    'La ESTABILIDAD GLOBAL no se calcula en este módulo: la fila neutral remite al módulo Taludes (equilibrio límite).',
  ];
  if (seismic) {
    extras.push(`Sismo: kh = ${r.kh_derived.toFixed(3)} · kv = ${r.kv_derived.toFixed(3)} (derivados de Ab y S)`);
  }
  if (r.seismicUnstable === true) {
    extras.push('AVISO: con esta sismicidad el relleno no es estable por sí mismo (φ − β − θ < 0): el empuje sísmico no se puede evaluar con fiabilidad.');
  }

  return summarizeCalcResults(r, extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const rockfillWallAdapter: AiModuleAdapter<RockfillWallInputs> = {
  id: 'rockfill-wall',
  label: 'Muros de escollera y gaviones',
  payloadSchema: ROCKFILL_WALL_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildRockfillWallPlan(parsePayload(payload), current, system, confirmed),
};
