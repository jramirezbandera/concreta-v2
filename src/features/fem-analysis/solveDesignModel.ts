// FEM 1D — pipeline bridge
//
// Single entry point that takes a DesignModel and returns a SolveResult ready
// for the UI. Composes the four foundational pieces from Lane A:
//
//   validateModel  → invariants (reject degenerate state before solver runs)
//   autoDecompose  → DesignModel → AnalysisModel
//   femSolver      → AnalysisModel → solver elements + reactions per LC
//   adaptRcBar / adaptSteelBar → per-bar checks via existing calc engines
//
// The output `SolveResult` collapses ELU samples per bar, per-bar verdicts
// (η, status, checks), and aggregated reactions. The UI consumes this shape
// directly.

import { adaptRcBar } from './adapters/rcBeams';
import { adaptSteelBar } from './adapters/steelBeams';
import { autoDecompose } from './autoDecompose';
import { solveAnalysisModel } from './femSolver';
import { validateModel } from './invariants';
import { buildLcCombinations, type LcCombinations, type LcFactors } from './lcCombinations';
import type {
  BarEnvelope,
  BarResult,
  DesignModel,
  LoadCase,
  ModelError,
  ReactionResult,
  ReactionsByCombo,
  SolveResult,
} from './types';
import { toStatus } from '../../lib/calculations/types';

/**
 * Build a BarEnvelope (xs/M/V/N arrays) by taking the worst-case absolute
 * value across multiple LC factor sets. For each sample point, evaluate every
 * combination and keep the value with maximum |M|, |V|, |N| (signed kept for
 * downstream rendering; abs is the comparator).
 */
function buildBarEnvelope(
  elements: ReturnType<typeof solveAnalysisModel>['elements'],
  designBarId: string,
  combos: LcFactors[],
): BarEnvelope {
  const xs: number[] = [];
  const M: number[] = [];
  const V: number[] = [];
  const N: number[] = [];
  const delta: number[] = [];
  let xOffset = 0;
  for (const e of elements.filter((el) => el.designBarId === designBarId)) {
    const elemXs = e.samples.xs;
    const lcs = Object.keys(e.samples.M) as LoadCase[];
    for (let i = 0; i < elemXs.length; i++) {
      let bestM = 0;
      let bestV = 0;
      let bestDelta = 0;
      for (const combo of combos) {
        let m = 0;
        let v = 0;
        let d = 0;
        for (const lc of lcs) {
          const factor = combo[lc] ?? 0;
          if (factor === 0) continue;
          m += factor * (e.samples.M[lc]?.[i] ?? 0);
          v += factor * (e.samples.V[lc]?.[i] ?? 0);
          d += factor * (e.samples.w[lc]?.[i] ?? 0);
        }
        if (Math.abs(m) > Math.abs(bestM)) bestM = m;
        if (Math.abs(v) > Math.abs(bestV)) bestV = v;
        if (Math.abs(d) > Math.abs(bestDelta)) bestDelta = d;
      }
      xs.push(xOffset + elemXs[i]);
      M.push(bestM);
      V.push(bestV);
      N.push(0); // V1: vigas continuas → axial = 0
      delta.push(bestDelta);
    }
    xOffset += e.L;
  }
  return { xs, M, V, N, delta };
}

/**
 * Build per-combination reactions envelope from per-LC reactions.
 *
 * For each combination group (ELU/ELS_c/ELS_frec/ELS_cp), iterate the multi-
 * principal sub-combinations and compute `Σ factor[lc] · R_lc[node]` per node.
 * Take the worst (max-abs) Ry and Mr per node across sub-combinations.
 * Linear superposition is exact for the elastic FEM — reactions scale with
 * load factors directly.
 */
function buildReactionsByCombo(
  reactionsByLc: Record<string, ReactionResult[]>,
  combos: LcCombinations,
): ReactionsByCombo {
  function envelopeOver(combosList: LcFactors[]): ReactionResult[] {
    // Collect all nodes across LCs (union, in case some LCs only touch some nodes).
    const nodeMeta = new Map<string, { x: number; y: number }>();
    for (const arr of Object.values(reactionsByLc)) {
      for (const r of arr) {
        if (!nodeMeta.has(r.node)) nodeMeta.set(r.node, { x: r.x, y: r.y });
      }
    }
    const out: ReactionResult[] = [];
    for (const [nodeId, { x, y }] of nodeMeta) {
      let bestRy = 0;
      let bestMr = 0;
      let bestRx = 0;
      for (const factors of combosList) {
        let ry = 0;
        let mr = 0;
        let rx = 0;
        for (const [lc, factor] of Object.entries(factors)) {
          const f = factor ?? 0;
          if (f === 0) continue;
          const lcArr = reactionsByLc[lc];
          if (!lcArr) continue;
          const r = lcArr.find((x) => x.node === nodeId);
          if (!r) continue;
          ry += f * r.Ry;
          mr += f * r.Mr;
          rx += f * r.Rx;
        }
        if (Math.abs(ry) > Math.abs(bestRy)) bestRy = ry;
        if (Math.abs(mr) > Math.abs(bestMr)) bestMr = mr;
        if (Math.abs(rx) > Math.abs(bestRx)) bestRx = rx;
      }
      out.push({ node: nodeId, x, y, Rx: bestRx, Ry: bestRy, Mr: bestMr });
    }
    return out;
  }
  return {
    ELU:      envelopeOver(combos.ELU),
    ELS_c:    envelopeOver(combos.ELS_c),
    ELS_frec: envelopeOver(combos.ELS_frec),
    ELS_cp:   envelopeOver([combos.ELS_cp]),
  };
}

export function solveDesignModel(model: DesignModel): SolveResult {
  // 1. Pre-solver invariants. If any 'fail' severity, do NOT solve.
  const validation = validateModel(model);
  if (!validation.ok) {
    return {
      elements: [],
      reactions: [],
      errors: validation.errors,
      perBar: {},
      maxEta: 0,
      status: 'fail',
    };
  }

  // 2. Decompose + solve.
  const am = autoDecompose(model);
  const solved = solveAnalysisModel(am);

  const errors: ModelError[] = [...validation.errors, ...solved.errors];
  const hasFail = errors.some((e) => e.severity === 'fail');

  // 3. Build LC-level combinations (V1.1 — Lane R1 per CTE Tabla 4.2).
  const combos = buildLcCombinations(model.loads);

  // 4. Per-bar adapter rollup → check verdicts.
  const perBar: Record<string, BarResult> = {};
  let maxEta = 0;
  let allPending = model.bars.length > 0;

  for (const bar of model.bars) {
    // El diagrama, la ficha Y el PDF leen la MISMA envolvente multi-principal ELU
    // (CTE Tabla 4.2), no el bucket sumado `1.35·G + 1.5·(Q+W+S+E)`. El lienzo ya
    // leía envelope.ELU (`Canvas.tsx`), pero `xs/M/V/N` y `Mmax/Vmax` salían del
    // bucket, y el PDF imprimía esos Mmax/Vmax bajo el rótulo "ENVOLVENTE (ELU)":
    // sobrestimaba con ≥2 variables simultáneas (el bucket omite la reducción ψ0
    // de las acciones acompañantes). Un único origen ⇒ diagrama, ficha y PDF
    // coinciden a mano y con CYPE.
    const elements = solved.elements.filter((e) => e.designBarId === bar.id);
    const envelopeELU  = buildBarEnvelope(solved.elements, bar.id, combos.ELU);
    const envelopeFrec = buildBarEnvelope(solved.elements, bar.id, combos.ELS_frec);
    const envelopeCp   = buildBarEnvelope(solved.elements, bar.id, [combos.ELS_cp]);
    const L = elements.reduce((s, e) => s + e.L, 0);
    const worstAbs = (m: number, v: number) => (Math.abs(v) > Math.abs(m) ? v : m);
    const Mmax = envelopeELU.M.reduce(worstAbs, 0);
    const Vmax = envelopeELU.V.reduce(worstAbs, 0);

    // Adapter call → check verdict.
    let eta = 0;
    let status: BarResult['status'] = 'pending';
    let checks: BarResult['checks'] = [];
    let rcResult: unknown = undefined;
    let steelResult: unknown = undefined;
    if (!hasFail && elements.length > 0) {
      try {
        if (bar.material === 'rc' && bar.rcSection) {
          const adapted = adaptRcBar(bar, solved.elements);
          if (adapted.status === 'pending') {
            status = 'pending';
            eta = 0;
            checks = [];
          } else if (adapted.result) {
            const res = adapted.result;
            rcResult = res; // R6: preserve full RCBeamResult for embed
            // Aggregate η across both regions: max of vano + apoyo + per-check.
            const vanoChecks = res.vano?.checks ?? [];
            const apoyoChecks = res.apoyo?.checks ?? [];
            const all = [...vanoChecks, ...apoyoChecks];
            for (const c of all) {
              eta = Math.max(eta, c.utilization);
              checks.push({
                name: c.description ?? c.id,
                val: typeof c.value === 'string' ? c.value : String(c.value),
                unit: '',
                eta: c.utilization,
                ref: c.article ?? '',
              });
            }
            status = toStatus(eta);
          }
        } else if (bar.material === 'steel' && bar.steelSelection) {
          const adapted = adaptSteelBar(bar, solved.elements, model);
          if (adapted.result?.valid) {
            steelResult = adapted.result; // R6: preserve for embed
            const allChecks = adapted.result.checks ?? [];
            for (const c of allChecks) {
              eta = Math.max(eta, c.utilization);
              checks.push({
                name: c.description ?? c.id,
                val: typeof c.value === 'string' ? c.value : String(c.value),
                unit: '',
                eta: c.utilization,
                ref: c.article ?? '',
              });
            }
            status = toStatus(eta);
          } else {
            status = 'pending';
          }
        }
      } catch (e) {
        errors.push({
          severity: 'warn',
          code: 'ADAPTER_ERROR',
          msg: `Barra ${bar.id}: ${(e as Error).message}`,
        });
        status = 'pending';
      }
    } else if (hasFail) {
      status = 'fail';
    }

    if (status !== 'pending') allPending = false;

    perBar[bar.id] = {
      // xs/M/V/N = la envolvente ELU (mismo objeto que envelope.ELU): la clave
      // heredada ya no miente, es la envolvente que también dibuja el lienzo.
      xs: envelopeELU.xs,
      M: envelopeELU.M,
      V: envelopeELU.V,
      N: envelopeELU.N,
      L,
      Mmax,
      Vmax,
      Nmax: 0,
      eta,
      status,
      checks,
      envelope: {
        ELU: envelopeELU,
        ELS_frec: envelopeFrec,
        ELS_cp: envelopeCp,
      },
      rcResult,
      steelResult,
    };
    if (eta > maxEta) maxEta = eta;
  }

  // 4. Reactions: forward summed reactions for back-compat AND build per-combo
  //    envelopes so the canvas combo selector can drive reactions too (R9 fix).
  const reactions: ReactionResult[] = solved.reactions.slice();
  const reactionsByCombo = buildReactionsByCombo(solved.reactionsByLc, combos);

  let topStatus: SolveResult['status'];
  if (hasFail) topStatus = 'fail';
  else if (model.bars.length === 0) topStatus = 'neutral';
  else if (allPending) topStatus = 'pending';
  else topStatus = toStatus(maxEta);

  return {
    elements: solved.elements,
    reactions,
    reactionsByCombo,
    errors,
    perBar,
    maxEta,
    status: topStatus,
  };
}
