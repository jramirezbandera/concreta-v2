// Traspaso muro → taludes: construye un SlopeInputs prefabricado a partir del
// estado de un módulo de muro, para comprobar la ESTABILIDAD GLOBAL del conjunto
// (CTE DB-SE-C Tabla 2.1) sin que el usuario reintroduzca a mano la geometría,
// el nivel freático y la sobrecarga.
//
// ─── La idea central: el muro como SÓLIDO RÍGIDO ────────────────────────────
//
// Un muro que YA ha superado sus comprobaciones internas (hilada a hilada /
// juntas entre filas) y de conjunto (vuelco, deslizamiento, tensiones) puede
// idealizarse como un bloque rígido en el análisis global: las superficies de
// rotura se fuerzan a pasar BAJO la zapata en toda la huella, recorriendo el
// terreno de cimentación, mientras el muro aporta su peso. Eso es lo que hace
// `rigidBlock` (ver defaults.ts y el filtro en pyslopeAnalyze.ts).
//
// Por qué NO se modela el muro como un estrato de material: PySlope sólo admite
// estratos HORIZONTALES, así que la banda del muro se extiende también por el
// trasdós. No se le puede dar resistencia al muro sin dársela al relleno (por
// donde entran los círculos), y con c=0 el modelo resultante es un talud sin
// cohesión a 71-85°, que no se sostiene: FoS ≈ tanφ/tanβ ≈ 0,20 con los
// defaults de escollera. Un muro correcto salía suspendido por factor ~7.
//
// ─── Aproximaciones conscientes ─────────────────────────────────────────────
//
// 1. ESTRATO DE CIMENTACIÓN PLACEHOLDER. Es el parámetro que GOBIERNA el
//    resultado y ningún módulo de muro lo pide (sólo σadm y muBase/mu). Se
//    entrega marcado como pendiente de revisión; la UI avisa. Como punto de
//    partida, muBase ≈ tan(⅔·φ) da φ ≈ 35° para muBase = 0,43 — pero NO se
//    auto-aplica: es criterio del proyectista.
// 2. SÍSMICO NO TRASLADADO. Con Ab > 0 el modelo sale estático: PySlope no
//    tiene pseudo-estático (slope.ts emite una fila neutra diferida). La UI
//    avisa; no se calla.
// 3. β > 0 NO REPRESENTABLE. PySlope fija la coronación horizontal. NO se
//    convierte a sobrecarga equivalente: no existe método de equivalencia
//    general y hacerlo sería inseguro.
// 4. γ SATURADO: el estrato del cuerpo SÍ se parte en el NF (banda seca + banda
//    saturada), porque el usuario da ambos pesos. Lo que NO se parte es el
//    estrato de cimentación placeholder: si el NF cae por debajo de la base del
//    cimiento, queda dentro de ese estrato y se ignora — partirlo exigiría
//    inventarse un γsat que nadie ha dado. Otra razón para revisarlo a mano.
// 5. MURO HA: LA RESISTENCIA DEL HORMIGÓN SE IGNORA. Es un CRIBADO APROXIMADO,
//    no una comprobación "conservadora": sustituir geometría y peso del
//    hormigón por suelo cambia fuerzas estabilizadoras Y desestabilizadoras,
//    sin monotonicidad garantizada.

import { slopeDefaults, type SlopeInputs, type SoilLayer, type SlopeLoad } from '../../../data/defaults';
import type { RockfillWallInputs, RetainingWallInputs } from '../../../data/defaults';
import type { RockfillWallResult } from '../rockfillWall';

/** PySlope exige angle < 90°. Una cara vertical (mIntra→0, gaviones alineados
 *  por delante, alzado de HA) se representa con el máximo admisible. */
const MAX_ANGLE_DEG = 85;

/** Malla más densa que el default: el filtro del bloque rígido descarta parte
 *  de los círculos generados, así que la malla EFECTIVA es menor. */
const PREFILL_ITERATIONS = 2000;

/**
 * Terreno de cimentación por defecto. Valores deliberadamente genéricos: NO son
 * un dato del proyecto, son un punto de partida que el usuario DEBE revisar. Es
 * el estrato que gobierna el resultado del análisis global, porque es por donde
 * discurre la superficie crítica.
 *
 * Por qué c' = 5 kPa y no 0: con cohesión estrictamente nula la corrida CTE
 * Tabla 2.1 (c'/1,8, tanφ'/1,8) suspende casi cualquier escalón de 3 m aunque
 * el muro sea correcto — ni subiendo φ' a 32° se alcanza el equivalente a
 * FoS_k ≥ 1,8 (medido: c=0/φ=28 → 0,89; c=0/φ=32 → 0,99; c=5/φ=28 → 1,04).
 * Un placeholder tan extremo convertía el caso por defecto en un INCUMPLE
 * automático con aspecto normativo, generado por un dato inventado. 5 kPa es
 * una cohesión efectiva modesta y habitual en suelos reales de cimentación;
 * sigue siendo un valor genérico que el usuario debe sustituir por el suyo.
 *
 * `thickness` lo calcula `foundationThickness()`: no es un dato del material.
 */
export const FOUNDATION_PLACEHOLDER: Omit<SoilLayer, 'id' | 'thickness'> = {
  type: 'granular',
  gamma: 18,
  c: 5,
  phi: 28,
  Nspt: 0,
  su: 0,
  rflim: 0,
};

/** Espesor mínimo del estrato de cimentación, por si el cuerpo ya llena el
 *  modelo (muro bajo con cimiento desproporcionado). */
const MIN_FOUNDATION_M = 2;

/**
 * Espesor del estrato de cimentación para que la columna de suelo termine justo
 * en el fondo del modelo, sin sobrar ni faltar.
 *
 * PySlope sintetiza un dominio de altura `tot_h` bajo la coronación
 * (`set_external_boundary`, pyslope.py:355-395) y el SVG encuadra hasta ese
 * fondo (`yBotPhys = min(...gys, 0)`). Un espesor fijo pintaba metros de terreno
 * por debajo del modelo y ensuciaba la leyenda con profundidades irreales — un
 * muro de 3 m mostraba estratos hasta 23,50 m.
 *
 * No afecta al cálculo: PySlope extiende el ÚLTIMO material indefinidamente
 * hacia abajo (`get_material_at_depth` → `return self._materials[-1]`,
 * pyslope.py:2196, y el mismo criterio en el reparto por dovelas), así que
 * cualquier círculo más profundo sigue viendo este estrato. Es sólo cuestión de
 * que lo dibujado y lo rotulado se correspondan con el modelo real.
 */
function foundationThickness(height: number, angleDeg: number, bodyThickness: number): number {
  const length = height / Math.tan((angleDeg * Math.PI) / 180);
  const modelDepth = Math.max(3 * height, 6, 2.5 * length); // = tot_h de PySlope
  return Math.max(modelDepth - bodyThickness, MIN_FOUNDATION_M);
}

/**
 * Espesor mínimo de una banda al partir por el nivel freático. Por debajo de
 * esto la banda no aporta nada y sí estorba: PySlope rechaza espesor 0 y las
 * profundidades acumuladas casi duplicadas le dan problemas ("same material
 * depth"). Con un NF a ras de coronación o justo en la base del cimiento se
 * colapsa a una sola banda del γ que domine.
 */
const MIN_BAND_M = 0.05;

interface SlopeModelCore {
  /** Desnivel expuesto (m). */
  height: number;
  /** Inclinación de la cara (°), ya capada a MAX_ANGLE_DEG. */
  angle: number;
  /** Estrato del cuerpo/relleno POR ENCIMA del NF (γ aparente), sin `id`. */
  bodyStratum: Omit<SoilLayer, 'id'>;
  /** γ del cuerpo/relleno BAJO el NF (kN/m³). Si el NF parte el estrato, el
   *  núcleo emite dos bandas con el mismo c'/φ' y distinto peso. */
  bodyGammaSat: number;
  /** Profundidad del NF desde coronación (m), o null si no hay. */
  waterTableDepth: number | null;
  /** Sobrecarga uniforme en coronación (kPa); 0 ⇒ sin cargas. */
  surcharge: number;
  rigidBlock: NonNullable<SlopeInputs['rigidBlock']>;
}

/**
 * Reparto del estrato del cuerpo/relleno en bandas seca y saturada.
 *
 * PySlope tiene un ÚNICO unit_weight por material y resta la presión
 * intersticial u = γw·h por separado, así que el peso que hay que darle bajo el
 * NF es el SATURADO (el suelo con los huecos llenos), no el aparente. Ambos
 * módulos de muro piden γsat como input y antes se descartaba, con lo que la
 * masa sumergida salía infravalorada ~10%.
 *
 * Sólo se parte el estrato del cuerpo, donde el usuario SÍ ha dado los dos
 * pesos. El estrato de cimentación es un placeholder genérico marcado para
 * revisión: partirlo exigiría inventarse un segundo número que nadie ha dado.
 */
function bodyStrata(core: SlopeModelCore): Omit<SoilLayer, 'id'>[] {
  const wt = core.waterTableDepth;
  const total = core.bodyStratum.thickness;
  const saturated = { ...core.bodyStratum, gamma: core.bodyGammaSat };

  if (wt === null) return [core.bodyStratum];
  // NF en coronación o casi: todo el estrato está sumergido.
  if (wt < MIN_BAND_M) return [saturated];
  // NF por debajo de la base del cimiento: el estrato entero está seco (el NF
  // cae dentro del placeholder de cimentación, que no se parte).
  if (total - wt < MIN_BAND_M) return [core.bodyStratum];
  return [
    { ...core.bodyStratum, thickness: wt },
    { ...saturated, thickness: total - wt },
  ];
}

/**
 * Núcleo compartido por ambos adaptadores. Todo lo normativo y lo placeholder
 * vive AQUÍ, en una sola definición: si cambia el φ de cimentación o se añade
 * un campo a SlopeInputs, es un solo cambio que ambos módulos heredan.
 */
function buildSlopeModel(core: SlopeModelCore): SlopeInputs {
  const loads: SlopeLoad[] =
    core.surcharge > 0
      ? [{ id: 1, kind: 'udl', magnitude: core.surcharge, offset: 0, length: 0 }]
      : [];

  // El placeholder de cimentación va SIEMPRE el último: el nº de bandas del
  // cuerpo depende de si el NF lo parte.
  const body = bodyStrata(core);
  const bodyTotal = body.reduce((s, st) => s + st.thickness, 0);
  const strata: SoilLayer[] = [
    ...body,
    {
      ...FOUNDATION_PLACEHOLDER,
      thickness: foundationThickness(core.height, core.angle, bodyTotal),
    },
  ].map((st, i) => ({ id: i + 1, ...st }));

  return {
    ...slopeDefaults,
    height: core.height,
    angle: core.angle,
    waterTableDepth: core.waterTableDepth,
    strata,
    loads,
    method: 'bishop',
    iterations: PREFILL_ITERATIONS,
    situation: 'persistent',
    context: 'global-foundation',
    rigidBlock: core.rigidBlock,
  };
}

const clampAngle = (deg: number): number =>
  Number.isFinite(deg) ? Math.min(Math.max(deg, 1), MAX_ANGLE_DEG) : MAX_ANGLE_DEG;

/**
 * Inclinación de la cara vista del muro de escollera/gaviones.
 * - Escollera: talud del intradós mIntra (xH:1V) → atan(1/mIntra).
 * - Gaviones: cara escalonada → atan(H / Δx entre el frente de la fila superior
 *   y el de la inferior). Con alineación por delante Δx≈0 y sale vertical, que
 *   es lo correcto; el cap se encarga.
 */
function rockfillFaceAngle(result: RockfillWallResult): number {
  const g = result.geom;
  if (g.rows && g.rows.length > 1) {
    const xs = g.rows.map((r) => r.xFront);
    const dx = Math.abs(Math.max(...xs) - Math.min(...xs));
    return clampAngle(dx > 1e-6 ? (Math.atan(g.H / dx) * 180) / Math.PI : MAX_ANGLE_DEG);
  }
  return clampAngle(g.mIntra > 1e-6 ? (Math.atan(1 / g.mIntra) * 180) / Math.PI : MAX_ANGLE_DEG);
}

/**
 * Modelo de estabilidad global desde el módulo de escollera / gaviones.
 * Devuelve `null` si el resultado del muro no es válido o el desnivel expuesto
 * no es positivo (no hay talud que analizar).
 *
 * φ del estrato del cuerpo = φ del RELLENO a secas. Con el bloque rígido activo
 * ninguna superficie atraviesa el muro, así que el φ del material del muro no
 * interviene en el arco y tomar el mínimo sólo penalizaría al relleno sin
 * motivo físico. γ sí es el MÁXIMO de ambos: el estrato aporta el peso del
 * bloque que gravita sobre la superficie de rotura, y ahí el desfavorable es el
 * mayor.
 */
export function slopeModelFromRockfill(
  inp: RockfillWallInputs,
  result: RockfillWallResult,
): SlopeInputs | null {
  if (!result.valid) return null;
  const g = result.geom;
  const height = g.H - inp.df;
  if (!(height > 0)) return null;

  return buildSlopeModel({
    height,
    angle: rockfillFaceAngle(result),
    bodyStratum: {
      thickness: g.H + g.hz,
      type: 'granular',
      gamma: Math.max(inp.gammaAp, inp.gammaSuelo),
      c: 0,
      phi: inp.phiRelleno,
      Nspt: 0,
      su: 0,
      rflim: 0,
    },
    // Bajo el NF, el mismo criterio de la banda seca (el desfavorable de los
    // dos materiales que comparten la banda), con γ saturado del relleno.
    bodyGammaSat: Math.max(inp.gammaAp, inp.gammaSat),
    waterTableDepth: inp.hasWater ? inp.hw : null,
    surcharge: inp.q,
    rigidBlock: { padHeel: inp.xT, padToe: inp.x0, depth: g.H + g.hz },
  });
}

/**
 * Modelo de estabilidad global desde el módulo de muro de contención (HA).
 * Devuelve `null` si el desnivel expuesto no es positivo.
 *
 * El estrato lleva las propiedades del RELLENO: la resistencia del hormigón se
 * ignora y el alzado queda dentro del bloque rígido excluido. El muro HA no
 * tiene `beta` ni cohesión de relleno como inputs, así que β se sintetiza a 0 y
 * c = 0 (Coulomb φ-δ puro, igual que el motor del propio módulo).
 */
export function slopeModelFromRetaining(inp: RetainingWallInputs): SlopeInputs | null {
  const height = inp.H - inp.df;
  if (!(height > 0)) return null;

  // El result del muro HA no expone geometría derivada — se recalcula aquí con
  // las mismas fórmulas del motor (retainingWall.ts §geometría).
  const hTotal = inp.H + inp.hf;

  return buildSlopeModel({
    height,
    angle: MAX_ANGLE_DEG, // alzado vertical
    bodyStratum: {
      thickness: hTotal,
      type: 'granular',
      gamma: inp.gammaSuelo,
      c: 0,
      phi: inp.phi,
      Nspt: 0,
      su: 0,
      rflim: 0,
    },
    bodyGammaSat: inp.gammaSat,
    waterTableDepth: inp.hasWater ? inp.hw : null,
    surcharge: inp.q,
    rigidBlock: { padHeel: inp.bTalon, padToe: inp.bPunta, depth: hTotal },
  });
}
