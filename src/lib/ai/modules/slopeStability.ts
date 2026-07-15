/**
 * Adapter del asistente IA para el módulo Geotecnia/Taludes (ola 3).
 *
 * Particularidades únicas de este módulo:
 * - `resultsRecalc: 'manual'` — el cálculo lo lanza el usuario con "Calcular"
 *   (PySlope/Pyodide, asíncrono): el prompt usa CHAT_RESULTS_RULES_MANUAL y
 *   el resumen de resultados tiene TRES estados (sin calcular / fresco /
 *   desactualizado), construidos por summarizeSlopeResults.
 * - El nivel freático interno es `waterTableDepth: number | null` donde null
 *   significa "sin NF" — COLISIONA con el null del payload ("sin cambio").
 *   El payload lo separa en el PAR `sinNivelFreatico` + `nfProfundidad_m`,
 *   recombinado en buildPlan.
 * - Dos arrays con REEMPLAZO completo: `strata` (SoilLayer, solo los campos
 *   que lee el motor de taludes: γ/c'/φ/su) y `loads` (sobrecargas en
 *   coronación). Todo el terreno es DATO GEOTÉCNICO: aquí γ tiene la
 *   dirección OPUESTA a micropilotes (el peso del terreno DESESTABILIZA:
 *   bajarlo infla el FoS).
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
  offIsUnbounded,
  offIsUnsafe,
  ordinalLevel,
  zeroIsOff,
  type ElementSafetyRule,
  type SafetyRule,
} from '../safety';
import type { SlopeResult } from '../../calculations/geotech/types';
import {
  slopeDefaults,
  type SlopeInputs,
  type SlopeLoad,
  type SoilLayer,
} from '../../../data/defaults';
import type { SoilType } from '../../../data/micropileLookups';

// ── Catálogos del módulo ──────────────────────────────────────────────────────

const METHODS = ['bishop', 'fellenius'] as const;
const SITUATIONS = ['persistent', 'transient', 'extraordinary'] as const;
const CONTEXTS = ['excavation', 'global-foundation'] as const;
const SOIL_TYPES = ['granular', 'cohesive'] as const;
const LOAD_KINDS = ['udl', 'line'] as const;

// ── Payload schema ────────────────────────────────────────────────────────────

export const SLOPE_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'height_m', 'angle_deg', 'sinNivelFreatico', 'nfProfundidad_m',
    'method', 'situation', 'context', 'strata', 'loads', 'warnings',
  ],
  properties: {
    height_m: { type: ['number', 'null'], description: 'Altura del talud H en METROS.' },
    angle_deg: { type: ['number', 'null'], description: 'Inclinación de la cara del talud β en GRADOS respecto a la horizontal (0–90).' },
    sinNivelFreatico: { type: ['boolean', 'null'], description: 'true = análisis SECO (sin nivel freático). false = hay NF (da también nfProfundidad_m). null = sin cambio.' },
    nfProfundidad_m: { type: ['number', 'null'], description: 'Profundidad del nivel freático en m DESDE LA CORONACIÓN, positiva hacia abajo. Solo si hay NF.' },
    method: { type: ['string', 'null'], enum: [...METHODS, null], description: 'Método de dovelas: bishop (simplificado, el habitual) o fellenius.' },
    situation: { type: ['string', 'null'], enum: [...SITUATIONS, null], description: 'Situación de proyecto (fija los FoS límite): persistent (persistente/transitoria de larga duración), transient, extraordinary.' },
    context: { type: ['string', 'null'], enum: [...CONTEXTS, null], description: 'Contexto normativo: excavation (talud de excavación, CTE γ_R=1.5) o global-foundation (estabilidad global de cimentación, CTE Tabla 2.1 γ_M=1.8).' },
    strata: {
      type: ['array', 'null'],
      description: 'Estratigrafía COMPLETA de arriba (coronación) hacia abajo. REEMPLAZA la lista entera; la suma de espesores debe cubrir al menos la altura del talud. null = sin cambio.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'thickness_m', 'gamma_kNm3', 'c_kPa', 'phi_deg', 'su_kPa'],
        properties: {
          type: { type: 'string', enum: [...SOIL_TYPES], description: 'granular o cohesive.' },
          thickness_m: { type: 'number', description: 'Espesor del estrato en m.' },
          gamma_kNm3: { type: 'number', description: 'Peso específico γ en kN/m³.' },
          c_kPa: { type: ['number', 'null'], description: "Cohesión efectiva c' en kPa (solo cohesivos; null → 0)." },
          phi_deg: { type: ['number', 'null'], description: "Ángulo de rozamiento φ' en grados (null → 0)." },
          su_kPa: { type: ['number', 'null'], description: 'Resistencia al corte sin drenaje su en kN/m² (solo cohesivos con comprobación no drenada; null → 0).' },
        },
      },
    },
    loads: {
      type: ['array', 'null'],
      description: 'Sobrecargas en coronación. REEMPLAZA la lista entera (lista vacía [] = sin sobrecargas). null = sin cambio.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'magnitude', 'offset_m', 'length_m'],
        properties: {
          kind: { type: 'string', enum: [...LOAD_KINDS], description: 'udl = carga uniforme en banda (kPa); line = carga lineal (kN/m).' },
          magnitude: { type: 'number', description: 'Magnitud: kPa si udl, kN/m si line.' },
          offset_m: { type: ['number', 'null'], description: 'Distancia desde la coronación hacia el trasdós, en m (null → 0).' },
          length_m: { type: ['number', 'null'], description: 'Solo udl: longitud de la banda en m (0 o null = hasta el límite del análisis).' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Estabilidad de taludes:
1. Geometría: height_m es la ALTURA del talud y angle_deg su inclinación respecto a la horizontal. Si el enunciado da un talud "2H:1V", conviértelo a grados (atan(1/2) ≈ 26.6°) y añade un warning con la conversión.
2. El campo "strata" REEMPLAZA la estratigrafía ENTERA (de coronación hacia abajo) y "loads" REEMPLAZA las sobrecargas: incluye siempre TODAS las que deban quedar. La suma de espesores de estratos debe cubrir al menos la altura del talud.
3. Nivel freático: usa el PAR sinNivelFreatico / nfProfundidad_m. Análisis seco → sinNivelFreatico true. Con agua → sinNivelFreatico false Y nfProfundidad_m (m desde la coronación, positiva hacia abajo).
4. Coherencia de estrato: en granulares c_kPa y su_kPa son 0 (la app los fuerza). su_kPa solo en cohesivos con datos no drenados: activa una comprobación adicional con φ=0, c=su.
5. La malla de búsqueda (dovelas/iteraciones) no se propone por chat: la fijan los presets del módulo.
6. IMPORTANTE — en este módulo el cálculo es MANUAL: al aplicar una propuesta el resultado NO se actualiza solo; el usuario debe pulsar "Calcular" (tarda unos segundos, motor Python). Recuérdaselo tras cada aplicación.
7. En este módulo son DATOS del problema, no variables de diseño: TODO el terreno (estratos con γ/c'/φ/su — los fija el estudio geotécnico), el nivel freático, las sobrecargas en coronación, la situación de proyecto y el contexto normativo. La "resistencia" aquí es la GEOMETRÍA de la solución: tender el talud (menos ángulo), reducir su altura con bermas o bancales, o medidas fuera del módulo (drenajes, escolleras, anclajes — descríbelas en reply/warnings, no tienen campo). OJO: bajar angle_deg o height_m como SOLUCIÓN propuesta al usuario es legítimo (es rediseñar el talud); lo que NUNCA debes hacer es mejorar los datos del terreno, quitar agua o sobrecargas, o cambiar situación/contexto para que el FoS salga.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Talud de excavación de 6 m de altura con inclinación 2H:1V en arcillas '
  + '(γ=19 kN/m³, c\'=10 kPa, φ\'=28°), nivel freático a 4 m de la coronación y '
  + 'una sobrecarga de 10 kPa en coronación.';

// ── Parseo defensivo ──────────────────────────────────────────────────────────

interface StratumPayload {
  type: SoilType | null;
  thickness_m: number | null;
  gamma_kNm3: number | null;
  c_kPa: number | null;
  phi_deg: number | null;
  su_kPa: number | null;
}

interface LoadPayload {
  kind: 'udl' | 'line' | null;
  magnitude: number | null;
  offset_m: number | null;
  length_m: number | null;
}

interface SlopePayload {
  height_m: number | null;
  angle_deg: number | null;
  sinNivelFreatico: boolean | null;
  nfProfundidad_m: number | null;
  method: 'bishop' | 'fellenius' | null;
  situation: SlopeInputs['situation'] | null;
  context: SlopeInputs['context'] | null;
  strata: StratumPayload[] | null;
  loads: LoadPayload[] | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : null;
}

function parseStratum(raw: unknown): StratumPayload {
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
  };
}

function parseLoad(raw: unknown): LoadPayload {
  const r = (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
    ? (raw as Record<string, unknown>)
    : {};
  return {
    kind: oneOf(r.kind, LOAD_KINDS),
    magnitude: finiteNumber(r.magnitude),
    offset_m: finiteNumber(r.offset_m),
    length_m: finiteNumber(r.length_m),
  };
}

function parsePayload(raw: unknown): SlopePayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    height_m: finiteNumber(r.height_m),
    angle_deg: finiteNumber(r.angle_deg),
    sinNivelFreatico: typeof r.sinNivelFreatico === 'boolean' ? r.sinNivelFreatico : null,
    nfProfundidad_m: finiteNumber(r.nfProfundidad_m),
    method: oneOf(r.method, METHODS),
    situation: oneOf(r.situation, SITUATIONS),
    context: oneOf(r.context, CONTEXTS),
    strata: Array.isArray(r.strata) ? r.strata.map(parseStratum) : null,
    loads: Array.isArray(r.loads) ? r.loads.map(parseLoad) : null,
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Labels y orden ────────────────────────────────────────────────────────────

const LABELS = {
  height_m: 'Altura del talud H',
  angle_deg: 'Inclinación β',
  nf: 'Nivel freático',
  method: 'Método de cálculo',
  situation: 'Situación de proyecto',
  context: 'Contexto normativo',
  strata: 'Estratigrafía',
  loads: 'Sobrecargas en coronación',
} as const;

type LogicalKey = keyof typeof LABELS;

/** Orden lógico (el par NF cuenta como UNA entrada). */
const KEY_ORDER: readonly LogicalKey[] = [
  'height_m', 'angle_deg', 'nf', 'method', 'situation', 'context', 'strata', 'loads',
];

const METHOD_LABELS: Record<'bishop' | 'fellenius', string> = {
  bishop: 'Bishop simplificado',
  fellenius: 'Fellenius',
};
const SITUATION_LABELS: Record<SlopeInputs['situation'], string> = {
  persistent: 'Persistente',
  transient: 'Transitoria',
  extraordinary: 'Extraordinaria',
};
const CONTEXT_LABELS: Record<SlopeInputs['context'], string> = {
  excavation: 'Talud de excavación',
  'global-foundation': 'Estabilidad global de cimentación',
};

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

// ── Reglas de seguridad ───────────────────────────────────────────────────────

/**
 * En taludes casi TODO es dato: geometría real del talud, agua, situación y
 * contexto. La única "resistencia" es rediseñar la geometría — y eso pasa por
 * estos mismos campos (bajar β o H a petición del usuario es legítimo), así
 * que el interlock de la tarjeta es exactamente el mecanismo adecuado: el
 * cambio se marca en rojo y el usuario confirma que ES un rediseño.
 */
export const SLOPE_SAFETY_RULES: ReadonlyArray<SafetyRule<SlopeInputs>> = [
  {
    field: 'height',
    confirmKey: 'height_m',
    level: higherIsSafer,
    why: 'La altura del talud es la geometría real del problema: reducirla baja la demanda. Solo es válido si se está REDISEÑANDO el talud (bermas, bancales), no para que salga el cálculo.',
  },
  {
    field: 'angle',
    confirmKey: 'angle_deg',
    level: higherIsSafer,
    why: 'La inclinación es la geometría real del talud: tenderla sube el FoS. Solo es válido como rediseño consciente del talud.',
  },
  {
    field: 'waterTableDepth',
    // El estado `waterTableDepth: number | null` lo alimenta el PAR de claves de
    // payload sinNivelFreatico + nfProfundidad_m (ver buildPlan). `confirmKey`
    // admite UNA sola: se elige la que porta la PROFUNDIDAD, la magnitud que
    // compara esta regla y la única que el modelo manda siempre que hay NF.
    // (El gate no llega a morder aquí: slopeDefaults.waterTableDepth es null =
    // seco = el nivel MÍNIMO, así que desde el default no hay bajada posible.)
    confirmKey: 'nfProfundidad_m',
    // null = sin NF (el caso MENOS conservador); profundizar el NF también relaja.
    level: (v) => (v === null ? Number.NEGATIVE_INFINITY : typeof v === 'number' && Number.isFinite(v) ? -v : null),
    why: 'El nivel freático lo fija el estudio geotécnico: quitarlo o profundizarlo elimina presiones intersticiales y el FoS sube artificialmente.',
  },
  {
    // situation / context: el payload usa el MISMO nombre que el estado ⇒ sin confirmKey.
    field: 'situation',
    level: ordinalLevel({ persistent: 2, transient: 1, extraordinary: 0 }),
    why: 'La situación de proyecto la fija el proyecto: pasarla a transitoria/extraordinaria relaja los FoS límite de las comprobaciones.',
  },
  {
    field: 'context',
    level: ordinalLevel({ 'global-foundation': 1, excavation: 0 }),
    why: 'El contexto normativo lo fija el problema real: la estabilidad global de cimentación exige γ_M=1.8 (Tabla 2.1) frente al 1.5 del talud de excavación.',
  },
];

const kPa = (v: unknown) => `${v} kN/m²`;

/** Estratos: γ con dirección OPUESTA a micropilotes (peso DESESTABILIZADOR). */
export const STRATA_ELEMENT_RULES: ReadonlyArray<ElementSafetyRule<SoilLayer>> = [
  { field: 'c', label: "cohesión c'", level: lowerIsSafer, format: (v) => `${v} kPa`, why: 'La cohesión la fija el estudio geotécnico: subirla mejora el terreno y el FoS sube sin estabilizar nada.' },
  { field: 'phi', label: "rozamiento φ'", level: lowerIsSafer, format: (v) => `${v}°`, why: 'El ángulo de rozamiento lo fija el estudio geotécnico: subirlo aumenta la resistencia al corte de todo el talud.' },
  { field: 'su', label: 'resistencia sin drenaje su', level: lowerIsSafer, format: kPa, why: 'su la fija el estudio geotécnico: subirla mejora la comprobación no drenada.' },
  {
    // FUGA 3 (auditoría 2026-07-14) — el CENTINELA de su.
    //
    // La comprobación sin drenaje existe si —y solo si— algún estrato tiene su > 0
    // (`hasUndrained`, geotech/slope.ts:95). Poner su = 0 en TODOS los estratos no
    // rebaja esa comprobación: LA BORRA de la tabla de resultados. Si era la que
    // gobernaba y fallaba, el veredicto vuelca a CUMPLE — y la regla `lowerIsSafer`
    // de arriba leía la caída como "más conservador", así que no avisaba de nada.
    //
    // Segunda regla sobre el MISMO campo porque el peligro de su no es monótono:
    // subirla es riesgo (la de arriba), anularla es riesgo (esta), y bajarla de 50
    // a 30 kPa es conservador (ninguna). Cada una dispara en un solo sentido, así
    // que nunca se doble-reportan.
    field: 'su',
    key: 'su_anulada',
    label: 'resistencia sin drenaje su ANULADA',
    level: offIsUnsafe(zeroIsOff, () => 1), // >0 = la comprobación existe; 0 = se apaga
    format: kPa,
    why: 'Anular su NO es rebajar un dato: DESACTIVA la comprobación sin drenaje entera (solo se calcula si algún estrato tiene su > 0). Una comprobación que no se hace no es una comprobación que se cumple — si era la que gobernaba, desaparece del veredicto.',
  },
  { field: 'gamma', label: 'peso específico γ', level: higherIsSafer, format: (v) => `${v} kN/m³`, why: 'En taludes el peso del terreno es acción DESESTABILIZADORA: bajar γ reduce el peso deslizante y el FoS sube artificialmente.' },
];

/**
 * Sobrecargas en coronación. Antes SOLO tenía regla `magnitude`, y las otras tres
 * propiedades son maneras igual de baratas de descargar el talud sin bajar un solo
 * número (fugas 3 y 4 de la auditoría).
 */
export const LOADS_ELEMENT_RULES: ReadonlyArray<ElementSafetyRule<SlopeLoad>> = [
  { field: 'magnitude', label: 'magnitud', level: higherIsSafer, why: 'Las sobrecargas en coronación las fija el proyecto: rebajar una reduce la demanda del cálculo.' },
  {
    // CENTINELA: `length = 0` (o ausente) NO es "una banda de cero metros", es una
    // banda que llega HASTA EL LÍMITE DEL ANÁLISIS (pyslopeAnalyze.ts:50) — o sea,
    // el caso MÁS cargado. Un `higherIsSafer` ingenuo leería 0 → 2 m como una
    // subida cuando en realidad es un recorte drástico de la carga.
    field: 'length',
    label: 'longitud de la banda',
    level: offIsUnbounded(zeroIsOff, higherIsSafer), // 0 = banda hasta el límite = el máximo
    format: (v) => ((v ?? 0) === 0 ? 'hasta el límite' : `${v} m`),
    why: 'Acortar la banda de una carga uniforme reduce la carga total sobre la coronación. Y una longitud de 0 no es "sin banda": es una banda que llega hasta el límite del análisis, el caso más desfavorable — ponerle un valor finito SIEMPRE descarga el talud.',
  },
  {
    field: 'offset',
    label: 'distancia a la coronación',
    level: lowerIsSafer,
    format: (v) => `${v ?? 0} m`,
    why: 'La posición de la sobrecarga la fija el proyecto: ALEJARLA de la coronación la saca de la cuña de rotura y su efecto desestabilizador se desvanece, sin que nadie haya movido nada en obra.',
  },
  {
    // `kind` cambia las UNIDADES de `magnitude`: 20 kPa repartidos en una banda no
    // son 20 kN/m en una línea. Con la banda hasta el límite (length = 0, el
    // default), la carga uniforme es siempre la envolvente.
    field: 'kind',
    label: 'tipo de carga',
    level: ordinalLevel({ udl: 1, line: 0 }),
    why: 'Pasar de carga uniforme (kPa, repartida en una banda) a carga lineal (kN/m, concentrada en una línea) NO es traducir unidades: con el mismo número, la carga total sobre la coronación cae en picado. Si la carga es realmente lineal, revisa también su magnitud.',
  },
];

/** `field` = clave del array en el estado Y en el payload ("strata") ⇒ sin confirmKey. */
export const STRATA_RISK_CTX = {
  field: 'strata',
  itemLabel: 'Estrato',
  collectionLabel: 'Estratos',
  removalWhy: 'Quitar un estrato reescribe el modelo de terreno del estudio geotécnico: con menos estratos débiles el talud "mejora" solo.',
} as const;

/** `field` = clave del array en el estado Y en el payload ("loads") ⇒ sin confirmKey. */
export const LOADS_RISK_CTX = {
  field: 'loads',
  itemLabel: 'Sobrecarga',
  collectionLabel: 'Sobrecargas',
  removalWhy: 'Las sobrecargas en coronación las fija el proyecto: eliminar una reduce la demanda del cálculo.',
} as const;

// ── Formateadores ─────────────────────────────────────────────────────────────

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtM = (v: number) => `${round2(v)} m`;
const fmtDeg = (v: number) => `${round2(v)}°`;
const fmtNF = (v: number | null) => (v === null ? 'Sin NF (seco)' : `${round2(v)} m bajo coronación`);

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

function fmtStratum(l: SoilLayer): string {
  const props = l.type === 'granular'
    ? `γ=${l.gamma}, φ'=${l.phi}°`
    : `γ=${l.gamma}, c'=${l.c}${l.su > 0 ? `, su=${l.su}` : ''}, φ'=${l.phi}°`;
  return `${l.thickness} m ${l.type === 'granular' ? 'granular' : 'cohesivo'} (${props})`;
}

function fmtStrata(strata: readonly SoilLayer[]): string {
  return `${strata.length} estrato${strata.length === 1 ? '' : 's'}: ${strata.map(fmtStratum).join(' · ')}`;
}

function fmtLoad(l: SlopeLoad): string {
  const kind = l.kind === 'udl'
    ? `${l.magnitude} kPa en banda${(l.length ?? 0) > 0 ? ` de ${l.length} m` : ''}`
    : `${l.magnitude} kN/m lineal`;
  return `${kind} a ${l.offset} m de coronación`;
}

function fmtLoads(loads: readonly SlopeLoad[]): string {
  if (loads.length === 0) return 'sin sobrecargas';
  return `${loads.length} sobrecarga${loads.length === 1 ? '' : 's'}: ${loads.map(fmtLoad).join(' · ')}`;
}

function sameStratum(a: SoilLayer, b: SoilLayer): boolean {
  return a.type === b.type && a.thickness === b.thickness && a.gamma === b.gamma
    && a.c === b.c && a.phi === b.phi && a.su === b.su;
}
function sameStrata(a: readonly SoilLayer[], b: readonly SoilLayer[]): boolean {
  return a.length === b.length && a.every((l, i) => sameStratum(l, b[i]));
}
function sameLoad(a: SlopeLoad, b: SlopeLoad): boolean {
  return a.kind === b.kind && a.magnitude === b.magnitude && a.offset === b.offset
    && (a.length ?? 0) === (b.length ?? 0);
}
function sameLoads(a: readonly SlopeLoad[], b: readonly SlopeLoad[]): boolean {
  return a.length === b.length && a.every((l, i) => sameLoad(l, b[i]));
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const STRATA_LIMITS = {
  thickness: { min: 0.05, max: 200 },
  gamma: { min: 10, max: 26 },
  c: { min: 0, max: 1000 },
  phi: { min: 0, max: 50 },
  su: { min: 0, max: 1000 },
} as const;

/** Valida y normaliza UN estrato del payload. String = motivo (invalida el array entero). */
function mapStratum(raw: StratumPayload, index: number, warnings: string[]): Omit<SoilLayer, 'id'> | string {
  const n = index + 1;
  if (raw.type === null) return `Estrato ${n}: type ausente o no reconocido (granular/cohesive)`;
  if (raw.thickness_m === null) return `Estrato ${n}: falta thickness_m`;
  if (raw.thickness_m < STRATA_LIMITS.thickness.min || raw.thickness_m > STRATA_LIMITS.thickness.max) {
    return `Estrato ${n}: espesor ${raw.thickness_m} m fuera del rango ${STRATA_LIMITS.thickness.min}–${STRATA_LIMITS.thickness.max} m`;
  }
  if (raw.gamma_kNm3 === null) return `Estrato ${n}: falta gamma_kNm3`;
  if (raw.gamma_kNm3 < STRATA_LIMITS.gamma.min || raw.gamma_kNm3 > STRATA_LIMITS.gamma.max) {
    return `Estrato ${n}: γ ${raw.gamma_kNm3} kN/m³ fuera del rango ${STRATA_LIMITS.gamma.min}–${STRATA_LIMITS.gamma.max}`;
  }
  function inRange(v: number | null, lim: { min: number; max: number }, label: string): number | string {
    if (v === null) return 0;
    if (v < lim.min || v > lim.max) return `Estrato ${n}: ${label} ${v} fuera del rango ${lim.min}–${lim.max}`;
    return v;
  }
  const c = inRange(raw.c_kPa, STRATA_LIMITS.c, "c'");
  if (typeof c === 'string') return c;
  const phi = inRange(raw.phi_deg, STRATA_LIMITS.phi, 'φ');
  if (typeof phi === 'string') return phi;
  const su = inRange(raw.su_kPa, STRATA_LIMITS.su, 'su');
  if (typeof su === 'string') return su;

  let cFinal = round2(c as number);
  let suFinal = round2(su as number);
  if (raw.type === 'granular' && (cFinal > 0 || suFinal > 0)) {
    warnings.push(`Estrato ${n}: c' y su se fuerzan a 0 en granulares (coherencia del módulo).`);
    cFinal = 0;
    suFinal = 0;
  }
  // Nspt/rflim/Cu son campos de micropilotes: el motor de taludes los ignora.
  return {
    type: raw.type,
    thickness: round2(raw.thickness_m),
    gamma: round2(raw.gamma_kNm3),
    c: cFinal,
    phi: round2(phi as number),
    Nspt: 0,
    su: suFinal,
    rflim: 0,
  };
}

/** Valida y normaliza UNA sobrecarga. String = motivo (invalida el array entero). */
function mapLoad(raw: LoadPayload, index: number, warnings: string[]): Omit<SlopeLoad, 'id'> | string {
  const n = index + 1;
  if (raw.kind === null) return `Sobrecarga ${n}: kind ausente o no reconocido (udl/line)`;
  if (raw.magnitude === null) return `Sobrecarga ${n}: falta magnitude`;
  const maxMag = raw.kind === 'udl' ? 1000 : 2000;
  if (raw.magnitude <= 0 || raw.magnitude > maxMag) {
    return `Sobrecarga ${n}: magnitud ${raw.magnitude} fuera del rango 0–${maxMag} ${raw.kind === 'udl' ? 'kPa' : 'kN/m'}`;
  }
  const offset = raw.offset_m ?? 0;
  if (offset < 0 || offset > 100) return `Sobrecarga ${n}: offset ${offset} m fuera del rango 0–100 m`;
  let length = 0;
  if (raw.kind === 'udl') {
    length = raw.length_m ?? 0;
    if (length < 0 || length > 200) return `Sobrecarga ${n}: longitud de banda ${length} m fuera del rango 0–200 m`;
  } else if (raw.length_m !== null && raw.length_m !== 0) {
    warnings.push(`Sobrecarga ${n}: length_m solo aplica a cargas en banda (udl); se ignora.`);
  }
  return {
    kind: raw.kind,
    magnitude: round2(raw.magnitude),
    offset: round2(offset),
    ...(raw.kind === 'udl' ? { length: round2(length) } : {}),
  };
}

function buildSlopePlan(
  payload: unknown,
  current: SlopeInputs,
  _system: unknown,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<SlopeInputs> {
  const x = parsePayload(payload);
  const fields: Partial<SlopeInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<LogicalKey>();

  function skip(key: LogicalKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof SlopeInputs>(
    key: LogicalKey,
    field: K,
    value: SlopeInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  // --- Geometría ---
  if (x.height_m !== null) {
    if (x.height_m < 0.5 || x.height_m > 50) skip('height_m', rangeReason(x.height_m, 0.5, 50, 'm'));
    else if (Math.abs(x.height_m - current.height) <= EPS) skip('height_m', ALREADY);
    else apply('height_m', 'height', round2(x.height_m), fmtM(current.height), fmtM(round2(x.height_m)));
  }
  if (x.angle_deg !== null) {
    if (x.angle_deg < 5 || x.angle_deg > 89) skip('angle_deg', rangeReason(x.angle_deg, 5, 89, '°'));
    else if (Math.abs(x.angle_deg - current.angle) <= EPS) skip('angle_deg', ALREADY);
    else apply('angle_deg', 'angle', round2(x.angle_deg), fmtDeg(current.angle), fmtDeg(round2(x.angle_deg)));
  }

  // --- Nivel freático (par sinNivelFreatico / nfProfundidad_m) ---
  if (x.sinNivelFreatico === true) {
    if (x.nfProfundidad_m !== null) {
      warnings.push('Se indicó "sin nivel freático" y a la vez una profundidad de NF; se ignora la profundidad.');
    }
    if (current.waterTableDepth === null) skip('nf', ALREADY);
    else apply('nf', 'waterTableDepth', null, fmtNF(current.waterTableDepth), fmtNF(null));
  } else if (x.nfProfundidad_m !== null) {
    if (x.nfProfundidad_m < 0 || x.nfProfundidad_m > 100) {
      skip('nf', rangeReason(x.nfProfundidad_m, 0, 100, 'm'));
    } else if (current.waterTableDepth !== null && Math.abs(x.nfProfundidad_m - current.waterTableDepth) <= EPS) {
      skip('nf', ALREADY);
    } else {
      const v = round2(x.nfProfundidad_m);
      apply('nf', 'waterTableDepth', v, fmtNF(current.waterTableDepth), fmtNF(v));
    }
  } else if (x.sinNivelFreatico === false) {
    skip('nf', 'Se indicó que HAY nivel freático pero falta su profundidad (nfProfundidad_m)');
  }

  // --- Método / situación / contexto ---
  if (x.method !== null) {
    if (x.method === current.method) skip('method', ALREADY);
    else apply('method', 'method', x.method, METHOD_LABELS[current.method], METHOD_LABELS[x.method]);
  }
  if (x.situation !== null) {
    if (x.situation === current.situation) skip('situation', ALREADY);
    else apply('situation', 'situation', x.situation, SITUATION_LABELS[current.situation], SITUATION_LABELS[x.situation]);
  }
  if (x.context !== null) {
    if (x.context === current.context) skip('context', ALREADY);
    else apply('context', 'context', x.context, CONTEXT_LABELS[current.context], CONTEXT_LABELS[x.context]);
  }

  // --- Estratos: REEMPLAZO completo, todo-o-nada, Σespesores ≥ altura ---
  if (x.strata !== null) {
    if (x.strata.length === 0) {
      skip('strata', 'La estratigrafía no puede quedar vacía: hace falta al menos un estrato');
    } else {
      const mapped: SoilLayer[] = [];
      let elementError: string | null = null;
      const strataWarnings: string[] = [];
      for (let i = 0; i < x.strata.length; i++) {
        const res = mapStratum(x.strata[i], i, strataWarnings);
        if (typeof res === 'string') { elementError = res; break; }
        mapped.push({ id: i + 1, ...res });
      }
      if (elementError !== null) {
        skip('strata', `${elementError} — no se aplica ningún estrato (la lista reemplaza a la actual entera)`);
      } else {
        const total = mapped.reduce((s, l) => s + l.thickness, 0);
        const heightEff = fields.height ?? current.height;
        if (total < heightEff - 1e-6) {
          skip('strata', `Los estratos suman ${round2(total)} m y no cubren la altura del talud (${heightEff} m)`);
        } else if (sameStrata(mapped, current.strata)) {
          skip('strata', ALREADY);
        } else {
          warnings.push(...strataWarnings);
          apply('strata', 'strata', mapped, fmtStrata(current.strata), fmtStrata(mapped));
        }
      }
    }
  }

  // --- Sobrecargas: REEMPLAZO completo ([] = quitar todas, riesgo si había) ---
  if (x.loads !== null) {
    const mapped: SlopeLoad[] = [];
    let elementError: string | null = null;
    const loadWarnings: string[] = [];
    for (let i = 0; i < x.loads.length; i++) {
      const res = mapLoad(x.loads[i], i, loadWarnings);
      if (typeof res === 'string') { elementError = res; break; }
      mapped.push({ id: i + 1, ...res });
    }
    if (elementError !== null) {
      skip('loads', `${elementError} — no se aplica ninguna sobrecarga (la lista reemplaza a la actual entera)`);
    } else if (sameLoads(mapped, current.loads)) {
      skip('loads', ALREADY);
    } else {
      warnings.push(...loadWarnings);
      apply('loads', 'loads', mapped, fmtLoads(current.loads), fmtLoads(mapped));
    }
  }

  // --- notFound (el par NF cuenta una vez) ---
  const values: Record<LogicalKey, boolean> = {
    height_m: x.height_m === null,
    angle_deg: x.angle_deg === null,
    nf: x.sinNivelFreatico === null && x.nfProfundidad_m === null,
    method: x.method === null,
    situation: x.situation === null,
    context: x.context === null,
    strata: x.strata === null,
    loads: x.loads === null,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = [
    ...detectSafetyRisks(SLOPE_SAFETY_RULES, changes, fields, current, slopeDefaults, confirmed),
    ...detectElementRisks(STRATA_ELEMENT_RULES, fields.strata, current.strata, slopeDefaults.strata, STRATA_RISK_CTX, confirmed),
    ...detectElementRisks(LOADS_ELEMENT_RULES, fields.loads, current.loads, slopeDefaults.loads, LOADS_RISK_CTX, confirmed),
  ];
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

function buildSnapshot(c: SlopeInputs): string {
  const valores: Record<string, unknown> = {
    height_m: c.height,
    angle_deg: c.angle,
    sinNivelFreatico: c.waterTableDepth === null,
    nfProfundidad_m: c.waterTableDepth,
    method: c.method,
    situation: c.situation,
    context: c.context,
    strata: c.strata.map((l) => ({
      type: l.type,
      thickness_m: l.thickness,
      gamma_kNm3: l.gamma,
      c_kPa: l.c,
      phi_deg: l.phi,
      su_kPa: l.su,
    })),
    loads: c.loads.map((l) => ({
      kind: l.kind,
      magnitude: l.magnitude,
      offset_m: l.offset,
      length_m: l.length ?? 0,
    })),
  };
  const d = slopeDefaults;
  const sinConfirmar: string[] = [];
  if (c.height === d.height) sinConfirmar.push('height_m');
  if (c.angle === d.angle) sinConfirmar.push('angle_deg');
  if (c.waterTableDepth === d.waterTableDepth) sinConfirmar.push('sinNivelFreatico', 'nfProfundidad_m');
  if (c.method === d.method) sinConfirmar.push('method');
  if (c.situation === d.situation) sinConfirmar.push('situation');
  if (c.context === d.context) sinConfirmar.push('context');
  if (sameStrata(c.strata, d.strata)) sinConfirmar.push('strata');
  if (sameLoads(c.loads, d.loads)) sinConfirmar.push('loads');
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados (3 estados — cálculo MANUAL) ───────────────────────

export const SLOPE_STALE_NOTICE =
  'AVISO: RESULTADOS DESACTUALIZADOS — los datos del formulario han cambiado después de esta corrida; '
  + 'lo que sigue corresponde a los datos ANTERIORES. Pide al usuario pulsar "Calcular" para actualizarlos.';

/**
 * Tres estados (contrato con CHAT_RESULTS_RULES_MANUAL):
 * - `result === null` → "SIN CALCULAR" con verdict 'invalid' (misma clase
 *   funcional que error != null: no hay comprobaciones utilizables; ni CUMPLE
 *   en falso ni tarjeta "¿Por qué no cumple?" sobre nada).
 * - fresco → resumen normal + FoS como extraLine.
 * - stale → MISMO verdict que la corrida (un INCUMPLE desactualizado sigue
 *   siendo la mejor señal disponible) con el AVISO como primera línea.
 */
export function summarizeSlopeResults(result: SlopeResult | null, isStale: boolean): AiResultsSummary {
  if (result === null) {
    return {
      verdict: 'invalid',
      text: 'SIN CALCULAR: este módulo calcula bajo demanda y aún no se ha ejecutado ninguna corrida. '
        + 'No hay veredicto ni comprobaciones que citar; cuando los datos estén completos, el usuario debe pulsar "Calcular".',
    };
  }
  const base = result.error != null
    ? summarizeCalcResults(result)
    : summarizeCalcResults(result, [`FoS estático (característico) = ${result.fos.toFixed(2)}`]);
  if (!isStale) return base;
  return { verdict: base.verdict, text: `${SLOPE_STALE_NOTICE}\n${base.text}` };
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const slopeStabilityAdapter: AiModuleAdapter<SlopeInputs> = {
  id: 'slope-stability',
  label: 'Estabilidad de taludes',
  payloadSchema: SLOPE_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  resultsRecalc: 'manual',
  snapshot: buildSnapshot,
  buildPlan: buildSlopePlan,
};
