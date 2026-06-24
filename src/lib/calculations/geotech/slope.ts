// Adaptador motor↔worker del módulo de taludes. Orquesta las corridas de PySlope
// y arma SlopeResult para la UI. Frontera UI↔motor: la UI nunca habla con el
// worker directamente, solo con calcSlope().
//
// Decisión clave (eng-review §9.2 #5): NO dividir FoS/γ como regla universal. Cada
// check RE-CORRE PySlope con los parámetros reales (c'/γ, atan(tanφ'/γ), cargas
// ×1,3) y compara contra su umbral. Phase 1 = 2 checks core:
//   1. CTE DB-SE-C art. 7.2.2.1 — FoS característico ≥ 1,5 (pers.) / 1,1 (extra.)
//   2. UNE-EN 1997-1 (EC7) DA3   — FoS_d (M2+A2) ≥ 1,0

import type { CheckRow } from "../types";
import { toStatus } from "../types";
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

/** Límite de FoS característico por situación — CTE DB-SE-C art. 7.2.2.1 (γ_R):
 *  persistente y transitoria γ_R = 1,5; extraordinaria γ_R = 1,1 (doc §4.2). */
function staticLimit(situation: SlopeInputs["situation"]): number {
  return situation === "extraordinary" ? 1.1 : 1.5;
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

/**
 * Calcula el talud: corrida característica (geometría + FoS para el SVG) +
 * re-corrida EC7-DA3, y arma los 2 checks core. Lanza si el motor falla; los
 * invariantes de entrada los gatea la UI (no se llama a calcSlope con datos
 * inválidos).
 */
export async function calcSlope(inputs: SlopeInputs): Promise<SlopeResult> {
  const slices = clamp(inputs.slices, SLICES_RANGE.min, SLICES_RANGE.max);
  const iterations = clamp(inputs.iterations, ITERATIONS_RANGE.min, ITERATIONS_RANGE.max);

  let base: SlopeRun;
  let da3: SlopeRun;
  try {
    // Característica (sin minorar) — su geometría es la que pinta el SVG.
    base = await run(inputs, { gammaC: 1, gammaPhi: 1, loadFactor: 1 });
    // EC7-DA3 — re-corre con terreno minorado (M2) y cargas mayoradas (A2).
    da3 = await run(inputs, DA3);
  } catch (e) {
    throw new Error(`No se pudo calcular la estabilidad del talud: ${(e as Error).message ?? e}`);
  }

  const limit = staticLimit(inputs.situation);
  const checks: CheckRow[] = [
    fosCheck(
      "fos-static",
      "FoS estático — talud de excavación",
      base.fos,
      limit,
      "CTE DB-SE-C art. 7.2.2.1",
    ),
    fosCheck(
      "fos-ec7-da3",
      "Verificación EC7 — Enfoque DA3 (M2+A2)",
      da3.fos,
      1.0,
      "UNE-EN 1997-1 · DA3",
    ),
  ];

  const engine: SlopeEngineMeta = {
    pyslopeVersion: manifest.version,
    pyodideVersion: PYODIDE_VERSION,
    patchHash: manifest.patchHash,
    inputsHash: hashInputs(inputs),
    mesh: { iterations, slices },
  };

  return { valid: true, fos: base.fos, run: base, checks, engine };
}
