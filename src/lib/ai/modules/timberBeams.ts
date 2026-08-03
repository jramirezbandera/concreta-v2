/**
 * Adapter del asistente IA para el módulo Vigas de madera (ola 1, EC5).
 * Payload en unidades humanas (mm de sección, m de luz, kN/m de cargas) que aquí
 * coinciden con las internas de `TimberBeamInputs` → sin conversión.
 *
 * Particularidades del módulo:
 * - `gk`/`qk` son cargas LINEALES en kN/m, no superficiales: este módulo NO
 *   tiene ancho tributario (el caso inverso de las vigas de acero, que sí lo
 *   tienen). Es la trampa nº 1 del prompt.
 * - Las cargas van SIN MAYORAR (características): el motor aplica γG/γQ y además
 *   comprueba la combinación solo-permanente con kmod permanente. Contraste con
 *   los pilares de madera, que reciben esfuerzos ya mayorados.
 * - `beamType` es un DATO del problema (la condición de apoyo real), y su nivel
 *   de seguridad se calibra con el coeficiente de MEd de `BEAM_CASES`.
 * - La sección NO tiene invariante de forma: el motor acepta b > h (tabla,
 *   dintel plano, refuerzo adosado) y solo cambia que el vuelco lateral deja de
 *   aplicar. Por eso b_mm y h_mm ya no van todo-o-nada.
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary, type CalcResultLike } from '../resultsSummary';
import {
  detectResolvedRisks,
  detectSafetyRisks,
  falseIsSafer,
  higherIsSafer,
  ordinalLevel,
  type ResolvedSafetyRule,
  type SafetyRule,
} from '../safety';
import type { CheckRow } from '../../calculations/types';
import { psi2ForLoadType, type TimberBeamResult } from '../../calculations/timberBeams';
import { beamSchemeRules } from '../beamScheme';
import { BEAM_CASES } from '../../calculations/beamCases';
import { timberBeamDefaults, type BeamType, type TimberBeamInputs } from '../../../data/defaults';
import { TIMBER_GRADES } from '../../../data/timberGrades';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
const GRADE_IDS: readonly string[] = TIMBER_GRADES.map((g) => g.id);
const BEAM_TYPES: readonly string[] = ['ss', 'cantilever', 'fp', 'ff'];
const SERVICE_CLASSES: readonly number[] = [1, 2, 3];
const LOAD_DURATIONS: readonly string[] = ['permanent', 'long', 'medium', 'short', 'instantaneous'];
// ψ₂ del panel de vigas de madera (PSI2_TABLE del motor): OJO, no coincide con
// el de vigas de hormigón (aquí hay 'storage', no hay 'parking').
const LOAD_TYPES: readonly string[] = ['residential', 'office', 'storage', 'roof', 'custom'];
const FIRE_RESISTANCES: readonly string[] = ['R0', 'R30', 'R60', 'R90', 'R120'];
const EXPOSED_FACES: readonly number[] = [3, 4];
const PARTITION_TYPES: readonly string[] = ['fragile', 'ordinary', 'none'];

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const TIMBER_BEAM_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'gradeId', 'b_mm', 'h_mm', 'beamType', 'L_m', 'gk_kNm', 'qk_kNm',
    'serviceClass', 'loadDuration', 'loadType', 'psi2Custom',
    'fireResistance', 'exposedFaces', 'isSystem', 'partitionType',
    'warnings',
  ],
  properties: {
    gradeId: { type: ['string', 'null'], enum: [...GRADE_IDS, null], description: 'Clase resistente de la madera: C14–C40 (conífera aserrada), D30–D70 (frondosa aserrada) o GL24h–GL32h (laminada encolada). No existe GL36h.' },
    b_mm: { type: ['number', 'null'], description: 'Ancho de la sección b en mm (dimensión horizontal).' },
    h_mm: { type: ['number', 'null'], description: 'Canto de la sección h en mm (dimensión VERTICAL, la que trabaja a flexión). Puede ser menor que b: una sección apaisada (tabla, dintel plano, refuerzo adosado) es válida.' },
    beamType: { type: ['string', 'null'], enum: [...BEAM_TYPES, null], description: 'Condiciones de apoyo del vano: "ss" biapoyada, "cantilever" ménsula (voladizo), "fp" articulada-empotrada, "ff" biempotrada.' },
    L_m: { type: ['number', 'null'], description: 'Luz del vano en METROS (en una ménsula, el vuelo).' },
    gk_kNm: { type: ['number', 'null'], description: 'Carga PERMANENTE característica en kN/m LINEALES sobre la viga (NO kN/m²: este módulo no tiene ancho tributario). Sin mayorar.' },
    qk_kNm: { type: ['number', 'null'], description: 'Sobrecarga VARIABLE característica en kN/m LINEALES sobre la viga (NO kN/m²). Sin mayorar.' },
    serviceClass: { type: ['integer', 'null'], enum: [...SERVICE_CLASSES, null], description: 'Clase de servicio EC5: 1 interior seco, 2 exterior cubierto o interior húmedo, 3 exterior a la intemperie.' },
    loadDuration: { type: ['string', 'null'], enum: [...LOAD_DURATIONS, null], description: 'Clase de duración de la carga variable (fija kmod): "permanent", "long" (almacenamiento), "medium" (sobrecarga de uso), "short" (nieve, montaje), "instantaneous" (viento, sismo).' },
    loadType: { type: ['string', 'null'], enum: [...LOAD_TYPES, null], description: 'Categoría de uso, fija ψ₂ para la flecha activa: "residential" (0.30), "office" (0.30), "storage" (0.80), "roof" (0.00) o "custom".' },
    psi2Custom: { type: ['number', 'null'], description: 'Valor de ψ₂ a medida (0–1). SOLO se usa si loadType = "custom".' },
    fireResistance: { type: ['string', 'null'], enum: [...FIRE_RESISTANCES, null], description: 'Resistencia al fuego exigida: "R0" (sin requisito), "R30", "R60", "R90" o "R120".' },
    exposedFaces: { type: ['integer', 'null'], enum: [...EXPOSED_FACES, null], description: 'Caras expuestas al fuego: 3 (viga bajo forjado, lo habitual) o 4 (viga exenta). Solo aplica si hay requisito de fuego.' },
    isSystem: { type: ['boolean', 'null'], description: 'true si la viga forma parte de un sistema con reparto de carga (tablero o forjado solidario sobre ≥4 vigas paralelas): aplica ksys = 1.10, que SUBE la resistencia a flexión. false = viga aislada.' },
    partitionType: { type: ['string', 'null'], enum: [...PARTITION_TYPES, null], description: 'Tabiquería soportada; fija el límite de flecha activa (integridad): "fragile" L/500, "ordinary" L/400, "none" (sin tabiques) L/300.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas (sobre todo kN/m² × ancho tributario → kN/m), ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Vigas de madera:
1. LAS CARGAS SON LINEALES: gk_kNm y qk_kNm van en kN/m sobre la viga, NO en kN/m². Este módulo no tiene ancho tributario. Si el enunciado da cargas SUPERFICIALES (kN/m²) y una separación entre vigas o un ancho tributario, MULTIPLICA (carga superficial × ancho tributario = carga lineal) y añade un warning con la conversión ("2.5 kN/m² × 0.60 m de intereje = 1.5 kN/m"). Si da la carga superficial pero NO el ancho tributario, pregunta en "reply" y deja gk/qk en null: no lo inventes.
2. Las cargas van SIN MAYORAR (características): el motor aplica γG = 1.35 y γQ = 1.50. NO las mayores tú. Es la diferencia con el módulo de Pilares de madera, que recibe esfuerzos YA MAYORADOS.
3. El motor comprueba también la combinación SOLO PERMANENTE (1.35·gk con kmod de carga permanente, más bajo). Con una sobrecarga pequeña frente al peso propio, esa combinación puede GOBERNAR: si aparece en los resultados, explícalo — no es un error.
4. La sección (b_mm, h_mm) va en MILÍMETROS y la luz (L_m) en METROS. h es el CANTO (dimensión vertical, la que trabaja) y b el ancho. Para ganar resistencia y rigidez sube el CANTO (h), que entra al cuadrado en la flexión y al cubo en la flecha. Se admite h < b (sección apaisada: tabla, dintel plano, refuerzo adosado bajo un forjado): en ese caso desaparece el vuelco lateral. Si el enunciado da dos dimensiones sin decir cuál es el canto, asume la mayor como h y avisa en "warnings".
5. beamType describe las condiciones de apoyo REALES del vano: "ss" biapoyada (M = wL²/8), "cantilever" ménsula/voladizo (M = wL²/2, la más exigente), "fp" articulada-empotrada, "ff" biempotrada (M = wL²/12). No es una variable de diseño: es cómo está construida la viga.
6. isSystem = true SOLO si hay ≥ 4 vigas paralelas con un tablero o forjado que reparte la carga entre ellas: regala un ksys = 1.10 de resistencia a flexión. No lo actives por defecto.
7. partitionType fija el límite de flecha activa por integridad (frágil L/500, ordinaria L/400, sin tabiques L/300): lo decide qué hay construido sobre la viga.
8. En este módulo son DATOS del problema, no variables de diseño: las cargas (gk, qk), la luz (L_m), las condiciones de apoyo (beamType), la clase de servicio, la duración de la carga, la categoría de uso (ψ₂), la tabiquería, el sistema de reparto (isSystem) y la resistencia al fuego exigida. Para que la viga cumpla actúa SIEMPRE sobre la RESISTENCIA: más canto (h_mm) — es lo más eficaz, sobre todo en flecha —, más ancho (b_mm) o clase resistente superior (C24 → C30, o laminada GL). NUNCA rebajes una carga, ni acortes la luz, ni relajes el límite de flecha cambiando la tabiquería, ni actives el reparto de sistema para que salga el cálculo.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Viga de madera C24 de 5 m de luz, biapoyada, con vigas cada 60 cm. '
  + 'Carga permanente 2.5 kN/m² y sobrecarga de uso 2 kN/m². Interior seco, tabiquería ordinaria.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface TimberBeamPayload {
  gradeId: string | null;
  b_mm: number | null;
  h_mm: number | null;
  beamType: string | null;
  L_m: number | null;
  gk_kNm: number | null;
  qk_kNm: number | null;
  serviceClass: number | null;
  loadDuration: string | null;
  loadType: string | null;
  psi2Custom: number | null;
  fireResistance: string | null;
  exposedFaces: number | null;
  isSystem: boolean | null;
  partitionType: string | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parsePayload(raw: unknown): TimberBeamPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    gradeId: stringOrNull(r.gradeId),
    b_mm: finiteNumber(r.b_mm),
    h_mm: finiteNumber(r.h_mm),
    beamType: stringOrNull(r.beamType),
    L_m: finiteNumber(r.L_m),
    gk_kNm: finiteNumber(r.gk_kNm),
    qk_kNm: finiteNumber(r.qk_kNm),
    serviceClass: finiteNumber(r.serviceClass),
    loadDuration: stringOrNull(r.loadDuration),
    loadType: stringOrNull(r.loadType),
    psi2Custom: finiteNumber(r.psi2Custom),
    fireResistance: stringOrNull(r.fireResistance),
    exposedFaces: finiteNumber(r.exposedFaces),
    isSystem: typeof r.isSystem === 'boolean' ? r.isSystem : null,
    partitionType: stringOrNull(r.partitionType),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  gradeId: 'Clase resistente',
  b_mm: 'Ancho de sección b',
  h_mm: 'Canto de sección h',
  beamType: 'Tipo de viga',
  L_m: 'Luz L',
  gk_kNm: 'Carga permanente gk',
  qk_kNm: 'Sobrecarga qk',
  serviceClass: 'Clase de servicio',
  loadDuration: 'Duración de la carga',
  loadType: 'Categoría de uso (ψ₂)',
  psi2Custom: 'ψ₂ personalizado',
  fireResistance: 'Resistencia al fuego',
  exposedFaces: 'Caras expuestas al fuego',
  isSystem: 'Sistema de reparto (ksys)',
  partitionType: 'Tabiquería',
} as const;

type PayloadKey = keyof typeof LABELS;

/** ORDER del contrato: los gates (`loadType`, `fireResistance`) antes que sus dependientes. */
const KEY_ORDER: readonly PayloadKey[] = [
  'gradeId', 'b_mm', 'h_mm', 'beamType', 'L_m', 'gk_kNm', 'qk_kNm',
  'serviceClass', 'loadDuration', 'loadType', 'psi2Custom',
  'fireResistance', 'exposedFaces', 'isSystem', 'partitionType',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

const DURATION_ES: Record<string, string> = {
  permanent: 'Permanente',
  long: 'Larga duración',
  medium: 'Media duración',
  short: 'Corta duración',
  instantaneous: 'Instantánea',
};
const LOAD_TYPE_ES: Record<string, string> = {
  residential: 'Residencial (ψ₂=0.30)',
  office: 'Administrativa (ψ₂=0.30)',
  storage: 'Almacenamiento (ψ₂=0.80)',
  roof: 'Cubierta (ψ₂=0.00)',
  custom: 'Personalizada',
};
const PARTITION_ES: Record<string, string> = {
  fragile: 'Frágil (L/500)',
  ordinary: 'Ordinaria (L/400)',
  none: 'Sin tabiques (L/300)',
};

/**
 * Campos que NO son variables de diseño. La sección (b, h) y la clase resistente
 * SÍ lo son: más canto o una clase superior es la salida legítima.
 *
 * Ordinales calibrados con el factor normativo real del motor:
 * - `beamType` → coeficiente de MEd de `BEAM_CASES`: la ménsula (wL²/2) es 4×
 *   más exigente que la biapoyada (wL²/8) y 6× más que la biempotrada (wL²/12).
 *   Declarar biempotrada una viga biapoyada rebaja el momento un 33% sin tocar
 *   la obra. `fp` comparte MEd con `ss` (mismo nivel).
 * - `loadDuration` → −kmod (Tabla 3.1 EC5): kmod menor = más conservador.
 * - `serviceClass` → el propio número: al subir de 1 a 3 baja kmod (menos
 *   resistencia) Y sube kdef (más flecha diferida). SC3 es conservador en ambos.
 * - `partitionType` → denominador del límite de integridad (L/500 > L/400 > L/300).
 * - `loadType` → ψ₂ (la flecha activa crece con él); 'custom' no tiene nivel y lo
 *   cubre la regla de `psi2Custom`.
 * - `isSystem` → `falseIsSafer`: activarlo regala ksys = 1.10 de resistencia.
 */
export const TIMBER_BEAM_SAFETY_RULES: ReadonlyArray<SafetyRule<TimberBeamInputs>> = [
  { field: 'gk', confirmKey: 'gk_kNm', level: higherIsSafer, why: 'La carga permanente la fija la composición real del forjado: rebajarla baja el momento, el cortante y la flecha de golpe.' },
  { field: 'qk', confirmKey: 'qk_kNm', level: higherIsSafer, why: 'La sobrecarga de uso la fija el CTE DB-SE-AE según el uso del edificio: rebajarla baja toda la demanda.' },
  { field: 'L', confirmKey: 'L_m', level: higherIsSafer, why: 'La luz la fija la geometría del edificio: acortarla reduce el momento con el cuadrado y la flecha con la cuarta potencia.' },
  {
    field: 'serviceClass',
    level: higherIsSafer, // SC3: kmod menor Y kdef mayor → conservador en resistencia y en flecha
    why: 'La clase de servicio la fija la humedad del ambiente donde está la viga: bajarla sube kmod y reduce la fluencia (kdef), aflojando resistencia y flecha a la vez.',
  },
  {
    field: 'loadDuration',
    // Nivel = −kmod (EC5 Tabla 3.1, clase de servicio 1).
    level: ordinalLevel({
      permanent: -0.60,
      long: -0.70,
      medium: -0.80,
      short: -0.90,
      instantaneous: -1.10,
    }),
    why: 'La duración de la carga la fija la acción que gobierna: declararla más corta sube kmod y con él todas las resistencias de cálculo.',
  },
  {
    field: 'partitionType',
    level: ordinalLevel({ fragile: 500, ordinary: 400, none: 300 }),
    why: 'La tabiquería soportada fija el límite de flecha activa (CTE DB-SE 4.3.3.1): relajarlo (de L/500 a L/400 o L/300) hace que la flecha "cumpla" sin reducirla.',
  },
  {
    field: 'isSystem',
    level: falseIsSafer,
    // alwaysCheck: el default es `false` (el lado seguro), así que sin desactivar
    // el gate anti-ruido la activación NUNCA se marcaría. Y activarlo es un
    // regalo de capacidad puro —+10% de resistencia a flexión sin tocar la viga—
    // apoyado en una afirmación sobre la obra que nadie ha comprobado: el mismo
    // espíritu del `loadsAreFactored` de zapatas.
    alwaysCheck: true,
    why: 'El reparto de sistema (ksys = 1.10) exige ≥ 4 vigas paralelas con un tablero solidario que reparta la carga: activarlo sube la resistencia a flexión un 10% sin tocar la viga.',
  },
  {
    field: 'fireResistance',
    level: ordinalLevel({ R0: 0, R30: 30, R60: 60, R90: 90, R120: 120 }),
    why: 'La resistencia al fuego exigida la fija el CTE DB-SI según el uso y la altura del edificio: rebajarla elimina o acorta la comprobación de incendio.',
  },
  {
    field: 'exposedFaces',
    level: higherIsSafer, // 4 caras carbonizan más que 3
    why: 'Las caras expuestas al fuego las fija la posición real de la viga (exenta o bajo forjado): pasar de 4 a 3 deja una sección residual mayor sin cambiar la viga.',
  },
];

/**
 * FUGA 2 (auditoría 2026-07-14) — ψ₂ EFECTIVO, no `loadType` ni `psi2Custom`.
 *
 * Misma puerta que en vigas de hormigón (rcBeams.ts) y con MÁS filo: aquí ψ₂ no
 * gobierna una fisura, gobierna la FLECHA —u_fin y u_active (EC5 §2.2.3)—, que es
 * justo lo que suele dimensionar una viga de madera. `ordinalLevel` no tenía nivel
 * para 'custom' (su valor LO DECIDE `psi2Custom`) y la regla de `psi2Custom` la
 * desarmaba el gate anti-ruido, porque su default (0.30) es también el ψ₂ real más
 * común. Bastaba `loadType: 'custom'` para caer de 0.80 (almacén) a 0.30 sin un
 * solo riesgo.
 */
export const TIMBER_BEAM_RESOLVED_RULES: ReadonlyArray<ResolvedSafetyRule<TimberBeamInputs>> = [
  // FUGA 4 — el ordinal de `beamType` estaba MAL CALIBRADO: se construía con
  // MEd(1,1), donde `ss` y `fp` EMPATAN (los dos wL²/8), mientras sus flechas
  // difieren un 59% (5/48 vs 8/185.185). En madera manda la flecha, así que
  // declarar "empotrada en el muro" una viga biapoyada la hacía cumplir con riesgo
  // CERO. Ahora hay una regla por demanda (M, V, flecha) — ver beamScheme.ts.
  ...beamSchemeRules<TimberBeamInputs>(),
  {
    id: 'psi2_efectivo',
    label: 'Coef. cuasipermanente ψ₂ efectivo',
    resolve: (s) => psi2ForLoadType(s),
    level: higherIsSafer,
    format: (v) => v.toFixed(2),
    why: 'ψ₂ lo fija la categoría de uso (CTE DB-SE Tabla 4.2), no el cálculo: rebajarlo —cambiando la categoría o escribiéndolo a mano en "custom"— reduce la parte de sobrecarga que cuenta en la flecha final y en la activa (la que ven los tabiques), y en madera la flecha es quien suele mandar.',
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
const fmtM = (m: number) => `${m.toFixed(2)} m`;

export const FIRE_GATE_REASON =
  'Sin requisito de fuego (R0) no hay comprobación de incendio: el campo es inerte. '
  + 'Propón primero una resistencia al fuego (R30–R120).';

export const PSI2_GATE_REASON =
  'ψ₂ personalizado solo se usa con la categoría de uso "custom": con una categoría '
  + 'del CTE, ψ₂ lo fija la tabla.';

function buildTimberBeamPlan(
  x: TimberBeamPayload,
  current: TimberBeamInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<TimberBeamInputs> {
  const fields: Partial<TimberBeamInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof TimberBeamInputs>(
    key: PayloadKey,
    field: K,
    value: TimberBeamInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  function applyEnum<K extends keyof TimberBeamInputs>(
    key: PayloadKey,
    field: K,
    value: string | number | null,
    catalog: readonly (string | number)[],
    reason: string,
    fmt: (v: string | number) => string,
  ): void {
    if (value === null) return;
    if (!catalog.includes(value)) {
      skip(key, reason);
      return;
    }
    const before = current[field] as unknown as string | number;
    if (value === before) skip(key, ALREADY);
    else apply(key, field, value as TimberBeamInputs[K], fmt(before), fmt(value));
  }

  // --- Clase resistente ---
  applyEnum(
    'gradeId', 'gradeId', x.gradeId, GRADE_IDS,
    `La clase "${x.gradeId}" no existe en el catálogo (C14–C40, D30–D70, GL24h–GL32h; no hay GL36h)`,
    String,
  );

  // --- Sección: sin invariante de forma (b > h es una sección apaisada válida) ---
  const bProposed = x.b_mm !== null && x.b_mm >= 40 && x.b_mm <= 2000 ? Math.round(x.b_mm) : null;
  const hProposed = x.h_mm !== null && x.h_mm >= 40 && x.h_mm <= 3000 ? Math.round(x.h_mm) : null;

  function applySection(
    key: 'b_mm' | 'h_mm',
    field: 'b' | 'h',
    raw: number | null,
    rounded: number | null,
    min: number,
    max: number,
  ): void {
    if (raw === null) return;
    if (rounded === null) {
      skip(key, rangeReason(raw, min, max, 'mm'));
      return;
    }
    if (rounded === current[field]) skip(key, ALREADY);
    else apply(key, field, rounded, fmtMm(current[field]), fmtMm(rounded));
  }
  applySection('b_mm', 'b', x.b_mm, bProposed, 40, 2000);
  applySection('h_mm', 'h', x.h_mm, hProposed, 40, 3000);

  // La sección apaisada es válida, pero también es el síntoma de que el modelo ha
  // INTERCAMBIADO ancho y canto. No se bloquea (bloquearla fue el error anterior):
  // se avisa sobre el estado FINAL, y solo si la sección cambia en este turno.
  if (fields.b !== undefined || fields.h !== undefined) {
    const bFinal = fields.b ?? current.b;
    const hFinal = fields.h ?? current.h;
    if (bFinal > hFinal) {
      warnings.push(
        `La sección resultante queda apaisada (b = ${bFinal} mm > h = ${hFinal} mm): se comprueba `
        + `con canto ${hFinal} mm y sin vuelco lateral. Si ancho y canto están intercambiados, corrígelo.`,
      );
    }
  }

  // --- Tipo de viga (condición de apoyo REAL) ---
  applyEnum(
    'beamType', 'beamType', x.beamType, BEAM_TYPES,
    `Tipo de viga "${x.beamType}" desconocido (ss, cantilever, fp, ff)`,
    (v) => BEAM_CASES[v as BeamType].label,
  );

  // --- Luz (m) ---
  if (x.L_m !== null) {
    if (x.L_m <= 0 || x.L_m > 40) {
      skip('L_m', rangeReason(x.L_m, 0.5, 40, 'm'));
    } else {
      const v = round2(x.L_m);
      if (Math.abs(v - current.L) <= EPS) skip('L_m', ALREADY);
      else apply('L_m', 'L', v, fmtM(current.L), fmtM(v));
    }
  }

  // --- Cargas LINEALES (kN/m, sin mayorar) ---
  const fmtLinear = (v: number) => formatQuantity(v, 'linearLoad', system);
  function applyLoad(key: 'gk_kNm' | 'qk_kNm', field: 'gk' | 'qk', value: number | null): void {
    if (value === null) return;
    if (value < 0 || value > 500) {
      skip(key, rangeReason(value, 0, 500, 'kN/m'));
      return;
    }
    const v = round2(value);
    if (Math.abs(v - current[field]) <= EPS) skip(key, ALREADY);
    else apply(key, field, v, fmtLinear(current[field]), fmtLinear(v));
  }
  applyLoad('gk_kNm', 'gk', x.gk_kNm);
  applyLoad('qk_kNm', 'qk', x.qk_kNm);

  // --- Condiciones de uso ---
  applyEnum(
    'serviceClass', 'serviceClass', x.serviceClass, SERVICE_CLASSES,
    `Clase de servicio ${x.serviceClass} inexistente (solo 1, 2 ó 3)`,
    (v) => `SC ${v}`,
  );
  applyEnum(
    'loadDuration', 'loadDuration', x.loadDuration, LOAD_DURATIONS,
    `Duración "${x.loadDuration}" desconocida (permanent, long, medium, short, instantaneous)`,
    (v) => DURATION_ES[String(v)] ?? String(v),
  );

  // --- loadType antes que psi2Custom (gate) ---
  applyEnum(
    'loadType', 'loadType', x.loadType, LOAD_TYPES,
    `Categoría de uso "${x.loadType}" desconocida (residential, office, storage, roof, custom)`,
    (v) => LOAD_TYPE_ES[String(v)] ?? String(v),
  );
  const loadTypeFinal = (fields.loadType ?? current.loadType) as string;

  if (x.psi2Custom !== null) {
    if (loadTypeFinal !== 'custom') {
      skip('psi2Custom', PSI2_GATE_REASON);
    } else if (x.psi2Custom < 0 || x.psi2Custom > 1) {
      skip('psi2Custom', rangeReason(x.psi2Custom, 0, 1, ''));
    } else {
      const v = round2(x.psi2Custom);
      if (Math.abs(v - current.psi2Custom) <= EPS) skip('psi2Custom', ALREADY);
      else apply('psi2Custom', 'psi2Custom', v, current.psi2Custom.toFixed(2), v.toFixed(2));
    }
  }

  // --- Fuego: gate R0 ---
  applyEnum(
    'fireResistance', 'fireResistance', x.fireResistance, FIRE_RESISTANCES,
    `Resistencia al fuego "${x.fireResistance}" desconocida (R0, R30, R60, R90, R120)`,
    String,
  );
  const fireFinal = (fields.fireResistance ?? current.fireResistance) as string;
  if (x.exposedFaces !== null) {
    if (fireFinal === 'R0') {
      skip('exposedFaces', FIRE_GATE_REASON);
    } else {
      applyEnum(
        'exposedFaces', 'exposedFaces', x.exposedFaces, EXPOSED_FACES,
        `Solo 3 ó 4 caras expuestas (propuesto: ${x.exposedFaces})`,
        (v) => `${v} caras`,
      );
    }
  }

  // --- Sistema de reparto y tabiquería ---
  if (x.isSystem !== null) {
    if (x.isSystem === current.isSystem) {
      skip('isSystem', ALREADY);
    } else {
      const fmtSys = (v: boolean) => (v ? 'Tablero colaborante (ksys=1.10)' : 'Viga aislada (ksys=1.00)');
      apply('isSystem', 'isSystem', x.isSystem, fmtSys(current.isSystem), fmtSys(x.isSystem));
    }
  }
  applyEnum(
    'partitionType', 'partitionType', x.partitionType, PARTITION_TYPES,
    `Tabiquería "${x.partitionType}" desconocida (fragile, ordinary, none)`,
    (v) => PARTITION_ES[String(v)] ?? String(v),
  );

  // --- notFound ---
  const values: Record<PayloadKey, unknown> = {
    gradeId: x.gradeId, b_mm: x.b_mm, h_mm: x.h_mm, beamType: x.beamType, L_m: x.L_m,
    gk_kNm: x.gk_kNm, qk_kNm: x.qk_kNm,
    serviceClass: x.serviceClass, loadDuration: x.loadDuration,
    loadType: x.loadType, psi2Custom: x.psi2Custom,
    fireResistance: x.fireResistance, exposedFaces: x.exposedFaces,
    isSystem: x.isSystem, partitionType: x.partitionType,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = [
    ...detectSafetyRisks(
      TIMBER_BEAM_SAFETY_RULES, changes, fields, current, timberBeamDefaults, confirmed,
    ),
    // ψ₂ efectivo: sustituye a las reglas por campo de loadType/psi2Custom (fuga 2).
    ...detectResolvedRisks(
      TIMBER_BEAM_RESOLVED_RULES, fields, current, timberBeamDefaults, confirmed,
    ),
  ];
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

type StateKey = Exclude<keyof TimberBeamInputs, 'title'>;

const SNAPSHOT_FIELDS: Readonly<Record<PayloadKey, StateKey>> = {
  gradeId: 'gradeId',
  b_mm: 'b',
  h_mm: 'h',
  beamType: 'beamType',
  L_m: 'L',
  gk_kNm: 'gk',
  qk_kNm: 'qk',
  serviceClass: 'serviceClass',
  loadDuration: 'loadDuration',
  loadType: 'loadType',
  psi2Custom: 'psi2Custom',
  fireResistance: 'fireResistance',
  exposedFaces: 'exposedFaces',
  isSystem: 'isSystem',
  partitionType: 'partitionType',
};

function buildSnapshot(c: TimberBeamInputs): string {
  const valores: Record<string, number | string | boolean> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    valores[key] = value;
    if (value === timberBeamDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/**
 * `TimberCheckRow` marca sus filas informativas con `neutral: true` pero les deja
 * `status: 'ok'`. Sin traducirlo, `summarizeCalcResults` contaría las cabeceras
 * (ELU/ELS/fuego) y las notas de alcance como comprobaciones CUMPLE.
 */
function toCheckRows(r: TimberBeamResult): CalcResultLike {
  const checks: CheckRow[] = r.checks.map((c) => ({
    ...c,
    status: c.neutral === true ? 'neutral' : c.status,
  }));
  return { valid: r.valid, error: r.error, checks };
}

export function summarizeTimberBeamResults(r: TimberBeamResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(toCheckRows(r));
  const extras = [
    `Esfuerzos derivados de las cargas: MEd = ${r.MEd.toFixed(1)} kNm · VEd = ${r.VEd.toFixed(1)} kN`,
    `Factores: kmod = ${r.kmod.toFixed(2)} · kdef = ${r.kdef.toFixed(2)} · ψ₂ = ${r.psi2.toFixed(2)}`
      + ` · kh = ${r.kh.toFixed(3)} · ksys = ${r.ksys.toFixed(2)}`,
    `Flechas: activa ${r.u_active.toFixed(1)} mm (límite ${r.u_active_lim.toFixed(1)}) · `
      + `final ${r.u_fin.toFixed(1)} mm (límite ${r.u_fin_lim.toFixed(1)})`,
  ];
  if (r.permGoverns) {
    extras.push(
      'GOBIERNA la combinación solo-permanente (1.35·gk con kmod permanente): la sobrecarga es '
      + 'pequeña frente al peso propio.',
    );
  }
  if (r.fireActive) {
    extras.push(
      `Incendio R${r.t_fire}: sección residual ${r.b_ef.toFixed(0)}×${r.h_ef.toFixed(0)} mm`,
    );
  }
  return summarizeCalcResults(toCheckRows(r), extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const timberBeamsAdapter: AiModuleAdapter<TimberBeamInputs> = {
  id: 'timber-beams',
  label: 'Vigas de madera',
  payloadSchema: TIMBER_BEAM_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildTimberBeamPlan(parsePayload(payload), current, system, confirmed),
};
