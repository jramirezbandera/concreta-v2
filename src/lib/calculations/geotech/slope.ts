// Adaptador motor↔worker del módulo de taludes. Orquesta las corridas de PySlope
// y arma SlopeResult para la UI. Frontera UI↔motor: la UI nunca habla con el
// worker directamente, solo con calcSlope().
//
// Decisión clave (eng-review §9.2 #5): NO dividir FoS/γ como regla universal. Cada
// check RE-CORRE PySlope con los parámetros reales (c'/γ, atan(tanφ'/γ), cargas
// ×1,3) y compara contra su umbral. Phase 2 = tabla completa (~6 checks):
//   #1 CTE DB-SE-C art. 7.2.2.1 — talud de excavación (γ_R = 1,5 / 1,1)   [solo excavation]
//   #2 CTE DB-SE-C Tabla 2.1    — estabilidad global cim. (c'/γ_M, FoS_d ≥ 1) [solo global]
//   #3 UNE-EN 1997-1 · DA3      — M2+A2 (c'/1,25, tanφ'/1,25, cargas ×1,3) ≥ 1
//   #4 Guía Carretera / ROM     — FoS ≥ 1,5 (perm.) / 1,3 (trans.) / 1,1 (acc.)
//   #7 Sin drenaje (φ_u=0,c=c_u)— CTE DB-SE-C apdo. 4.2.3.1 (solo si hay estratos su>0)
//   #6 Sísmico pseudo-estático  — fila NEUTRA, diferida a Phase 3 (no re-corre el motor)
//
// Minimiza corridas: cachea cada corrida por su terna (gammaC,gammaPhi,loadFactor)
// para no repetir motor; la corrida sin-drenaje usa inputs transformados (estratos
// cohesivos con phi=0, c=su) y se cachea por separado.

import type { CheckRow } from "../types";
import { toStatus, makeCheckNeutral } from "../types";
import type { SlopeInputs } from "../../../data/defaults";
import type { SlopeResult, SlopeRun, SlopeRunOptions, SlopeEngineMeta } from "./types";
import { getPySlope } from "./client";
import manifest from "./vendor/pyslope.manifest.json";

const PYODIDE_VERSION = "314.0.0";

// Cotas duras de malla — acotan el cómputo para que una corrida patológica no
// monopolice el worker (eng-review §9.2 #1, "iteraciones acotadas").
const SLICES_RANGE = { min: 10, max: 200 } as const;
const ITERATIONS_RANGE = { min: 500, max: 5000 } as const;

// EC7-DA3 (España, taludes/estabilidad global): set M2 + set A2.
const DA3 = { gammaC: 1.25, gammaPhi: 1.25, loadFactor: 1.3 } as const;

// Opciones neutras (corrida característica, sin minorar terreno ni mayorar cargas).
const NEUTRAL: Required<SlopeRunOptions> = { gammaC: 1, gammaPhi: 1, loadFactor: 1 };

/** Límite de FoS característico por situación — CTE DB-SE-C art. 7.2.2.1 (γ_R):
 *  persistente y transitoria γ_R = 1,5; extraordinaria γ_R = 1,1 (doc §4.2). */
function staticLimit(situation: SlopeInputs["situation"]): number {
  return situation === "extraordinary" ? 1.1 : 1.5;
}

/** γ_M de CTE DB-SE-C Tabla 2.1 (estabilidad global de cimentación): 1,8
 *  persistente/transitoria; 1,2 extraordinaria (doc §4.2). Se aplica a c' y a
 *  tanφ' (gammaC = gammaPhi = γ_M) con cargas sin mayorar y umbral FoS_d ≥ 1,0. */
function tabla21GammaM(situation: SlopeInputs["situation"]): number {
  return situation === "extraordinary" ? 1.2 : 1.8;
}

/** Límite de FoS global Guía de Cimentaciones de Carreteras (CEDEX) / ROM 0.5-05
 *  por situación (doc §4.2): 1,5 permanente · 1,3 transitoria · 1,1 accidental. */
function romLimit(situation: SlopeInputs["situation"]): number {
  if (situation === "extraordinary") return 1.1;
  if (situation === "transient") return 1.3;
  return 1.5;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

async function run(inputs: SlopeInputs, opts: SlopeRunOptions): Promise<SlopeRun> {
  const api = await getPySlope();
  const slices = clamp(inputs.slices, SLICES_RANGE.min, SLICES_RANGE.max);
  const iterations = clamp(inputs.iterations, ITERATIONS_RANGE.min, ITERATIONS_RANGE.max);
  const json = await api.analyze(
    JSON.stringify(inputs),
    JSON.stringify({ ...opts, slices, iterations }),
  );
  return JSON.parse(json) as SlopeRun;
}

/** FoS check: muestra el FoS calculado vs el límite; η = límite/FoS (≥1 ⇒ falla). */
function fosCheck(id: string, description: string, fos: number, limit: number, article: string): CheckRow {
  const utilization = fos > 0 ? limit / fos : Infinity;
  return {
    id,
    description,
    valueStr: fos.toFixed(2),
    limitStr: `≥ ${limit.toFixed(2)}`,
    utilization,
    status: toStatus(utilization),
    article,
  };
}

// djb2 — hash estable de los inputs para trazabilidad del PDF (§9.2 #3).
function hashInputs(inputs: SlopeInputs): string {
  const s = JSON.stringify(inputs);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** ¿Hay datos para la comprobación sin drenaje? — algún estrato con su > 0. */
function hasUndrained(inputs: SlopeInputs): boolean {
  return inputs.strata.some((s) => s.su > 0);
}

/** Inputs para el análisis sin drenaje (corto plazo): cada estrato cohesivo con
 *  su > 0 pasa a (φ_u = 0, c = c_u = su). El resto de estratos quedan igual. El
 *  worker construye los Material desde inputs.strata, así que transformar AQUÍ
 *  (antes de run) es la vía sin tocar el worker. Opts neutras: la resistencia ya
 *  va embebida en c = su (no se vuelve a minorar). */
function undrainedInputs(inputs: SlopeInputs): SlopeInputs {
  return {
    ...inputs,
    strata: inputs.strata.map((s) =>
      s.su > 0 ? { ...s, phi: 0, c: s.su } : { ...s },
    ),
  };
}

/**
 * Calcula el talud y arma la tabla completa de checks Phase 2, RE-CORRIENDO
 * PySlope por check con los parámetros reales (nunca FoS/γ). Cachea las corridas
 * por terna (gammaC,gammaPhi,loadFactor) para no repetir motor:
 *   - corrida base (1,1,1)  — SIEMPRE; su geometría es la que pinta el SVG.
 *   - corrida DA3            — SIEMPRE.
 *   - corrida Tabla 2.1      — SOLO si context==='global-foundation'.
 *   - corrida sin drenaje    — SOLO si hay estratos con su>0 (inputs transformados).
 * El sísmico (#6) es una fila NEUTRA: no re-corre el motor (Phase 3).
 *
 * Lanza si el motor falla; los invariantes de entrada los gatea la UI (no se
 * llama a calcSlope con datos inválidos). `result.fos`/`result.run` siguen siendo
 * los de la corrida base (contrato que consume el SVG) — no los minorados.
 */
export async function calcSlope(inputs: SlopeInputs): Promise<SlopeResult> {
  const slices = clamp(inputs.slices, SLICES_RANGE.min, SLICES_RANGE.max);
  const iterations = clamp(inputs.iterations, ITERATIONS_RANGE.min, ITERATIONS_RANGE.max);

  // Cache de corridas por terna γ sobre los MISMOS inputs (base/DA3/Tabla 2.1).
  // La corrida sin-drenaje usa inputs distintos, así que va por separado.
  const cache = new Map<string, Promise<SlopeRun>>();
  const runCached = (opts: Required<SlopeRunOptions>): Promise<SlopeRun> => {
    const key = `${opts.gammaC}|${opts.gammaPhi}|${opts.loadFactor}`;
    let p = cache.get(key);
    if (!p) {
      p = run(inputs, opts);
      cache.set(key, p);
    }
    return p;
  };

  const gammaM = tabla21GammaM(inputs.situation);

  let base: SlopeRun;
  let da3: SlopeRun;
  let tabla21: SlopeRun | null = null;
  let undrained: SlopeRun | null = null;
  try {
    // Característica (sin minorar) — su geometría es la que pinta el SVG.
    base = await runCached(NEUTRAL);
    // EC7-DA3 — re-corre con terreno minorado (M2) y cargas mayoradas (A2).
    da3 = await runCached(DA3);
    // CTE Tabla 2.1 — solo en contexto de estabilidad global de cimentación.
    if (inputs.context === "global-foundation") {
      tabla21 = await runCached({ gammaC: gammaM, gammaPhi: gammaM, loadFactor: 1 });
    }
    // Sin drenaje — solo si hay estratos con su>0; inputs transformados, opts neutras.
    if (hasUndrained(inputs)) {
      undrained = await run(undrainedInputs(inputs), NEUTRAL);
    }
  } catch (e) {
    throw new Error(`No se pudo calcular la estabilidad del talud: ${(e as Error).message ?? e}`);
  }

  const checks: CheckRow[] = [];

  // ── Bloque CTE (#1 excavación / #2 estabilidad global de cimentación) ──
  if (inputs.context === "global-foundation" && tabla21) {
    // #2 — minoración del terreno c'/γ_M, tanφ'/γ_M, cargas ×1; umbral FoS_d ≥ 1,0.
    checks.push(
      fosCheck(
        "fos-cte-tabla21",
        `Estabilidad global de cimentación — γ_M = ${gammaM.toFixed(1).replace(".", ",")}`,
        tabla21.fos,
        1.0,
        "CTE DB-SE-C Tabla 2.1",
      ),
    );
  } else {
    // #1 — FoS característico vs γ_R (1,5 pers./trans.; 1,1 extraord.).
    checks.push(
      fosCheck(
        "fos-static",
        "FoS estático — talud de excavación",
        base.fos,
        staticLimit(inputs.situation),
        "CTE DB-SE-C art. 7.2.2.1",
      ),
    );
  }

  // #3 — EC7-DA3 (M2+A2). Siempre.
  checks.push(
    fosCheck(
      "fos-ec7-da3",
      "Verificación EC7 — Enfoque DA3 (M2+A2)",
      da3.fos,
      1.0,
      "UNE-EN 1997-1 · DA3",
    ),
  );

  // #4 — Guía de Cimentaciones de Carreteras / ROM 0.5-05. Siempre; límite por situación.
  checks.push(
    fosCheck(
      "fos-rom",
      "FoS estático — carreteras / ROM",
      base.fos,
      romLimit(inputs.situation),
      "Guía Cimentaciones Carretera / ROM 0.5-05",
    ),
  );

  // #7 — Sin drenaje (corto plazo, φ_u=0, c=c_u). Solo si hay estratos con su>0.
  if (undrained) {
    checks.push(
      fosCheck(
        "fos-undrained",
        "FoS sin drenaje — corto plazo (φ_u = 0, c = c_u)",
        undrained.fos,
        staticLimit(inputs.situation),
        "CTE DB-SE-C apdo. 4.2.3.1",
      ),
    );
  }

  // #6 — Sísmico pseudo-estático: fila informativa NEUTRA (diferido a Phase 3).
  // No re-corre el motor (no se toca el balance de fuerzas del fork). Siempre.
  checks.push(
    makeCheckNeutral(
      "fos-seismic",
      "Análisis sísmico pseudo-estático · requiere Phase 3",
      "DIFERIDO",
      "NCSE-02 (Phase 3)",
    ),
  );

  const engine: SlopeEngineMeta = {
    pyslopeVersion: manifest.version,
    pyodideVersion: PYODIDE_VERSION,
    patchHash: manifest.patchHash,
    inputsHash: hashInputs(inputs),
    mesh: { iterations, slices },
  };

  return { valid: true, fos: base.fos, run: base, checks, engine };
}
