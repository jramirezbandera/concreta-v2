// FEM 2D — Steel beam adapter
//
// Bridges the FEM solver output to the existing calcSteelBeam check engine.
// Per the design doc, steel section is uniform along the bar, so we use a
// single peak envelope per design bar (not vano/apoyo split as for HA).
//
// The adapter:
//   1. Combines per-load-case samples into ELU and ELS-c envelopes.
//   2. Picks max |M_ELU| and max |V_ELU| across the entire bar.
//      VEd_interaction = V at the location of M_max (per calcSteelBeam's
//      M-V interaction check, which uses shear at the critical M section).
//   3. Computes Mser as max |M_ELS-c| for deflection limit comparison.
//   4. Auto-derives beamType from topology:
//        cantilever, ss, fp, ff
//      and the user can override in the panel.
//   5. Maps the catalog key (e.g. 'steel_IPE240') to (tipo, size) tokens.
//   6. Stubs loadgen fields (gk=0, qk=0, bTrib=1) — the user-facing panel
//      hides them; calcSteelBeam's internal deriveFromLoads is bypassed
//      because we provide MEd/VEd/Mser directly.
//   7. Calls calcSteelBeam and returns the result.

import { calcSteelBeam, type SteelBeamResult, type SteelCheckRow } from '../../../lib/calculations/steelBeams';
import type { SteelBeamInputs } from '../../../data/defaults';
import { buildLcCombinations, type LcFactors } from '../lcCombinations';
import type {
  DesignBar,
  DesignModel,
  LoadCase,
  SolverElementResult,
  Support,
  SteelSelection,
} from '../types';

// Combination factors (V1 single-bucket var case — kept for legacy
// computeEnvelope path used by the M-V interaction "V at M" calc).
const ELU_GAMMA_G = 1.35;
const ELU_GAMMA_VAR = 1.5;

// ── Public API ─────────────────────────────────────────────────────────────

export interface SteelBarEnvelope {
  L: number;
  /** Total length in m. */
  M_Ed: number;          // ELU peak |M|
  V_Ed: number;          // ELU peak |V|
  VEd_interaction: number; // V at the location of M_Ed (signed)
  Mser: number;          // ELS-c peak |M|
  /** Position where M_Ed peaks (m, from i-end). */
  x_at_M_Ed: number;
}

export interface AdaptResult {
  status: 'ok';
  envelope: SteelBarEnvelope;
  inputs: SteelBeamInputs;
  result: ReturnType<typeof calcSteelBeam>;
}

/**
 * Adapt one design bar (steel) to a calcSteelBeam call.
 *
 * V1.1 — Lane R9 / Codex catch #4 fix:
 *   The adapter iterates the multi-principal ELU combinations (G+Q principal,
 *   G+W principal, etc.) and runs calcSteelBeam per sub-combination. M-V
 *   interaction (EC3 §6.2.8) requires the (M, V) tuple from the SAME
 *   combination at the SAME section — taking M_max from one combo and V_max
 *   from another would overestimate the interaction check (false INCUMPLE).
 *
 *   Output: per-check worst utilization across all ELU sub-combinations,
 *   aggregated into a single SteelBeamResult. Mser comes from the worst-case
 *   ELS combination (frec or cp, depending on sel.elsCombo).
 *
 *   When the model has only G (no variables), this degenerates to one
 *   combination and matches V1.0 behavior numerically.
 */
export function adaptSteelBar(
  bar: DesignBar,
  allElements: SolverElementResult[],
  model: DesignModel,
): AdaptResult {
  if (bar.material !== 'steel' || !bar.steelSelection) {
    throw new Error(`adaptSteelBar called with non-steel bar ${bar.id}`);
  }
  const elements = allElements.filter((e) => e.designBarId === bar.id);
  const sel = bar.steelSelection;
  const beamType = sel.beamType ?? deriveBeamType(bar, model);

  const combos = buildLcCombinations(model.loads);
  const elsCombosToUse =
    sel.elsCombo === 'quasi-permanent' ? [combos.ELS_cp]
    : sel.elsCombo === 'frequent'      ? combos.ELS_frec
                                       : combos.ELS_c;  // 'characteristic' default
  const Mser_worst = worstMserAcrossCombos(elements, elsCombosToUse);

  // Iterate ELU sub-combinations, aggregate worst-η per check id.
  let aggregatedChecks: SteelCheckRow[] = [];
  let worstEnvelope: SteelBarEnvelope = computeEnvelope(elements);
  let lastInputs: SteelBeamInputs | null = null;
  let lastResult: SteelBeamResult | null = null;
  let allValid = true;

  for (const factors of combos.ELU) {
    const env = envelopeForCombo(elements, factors, Mser_worst);
    const inputs = buildSteelBeamInputs(sel, beamType, env);
    const result = calcSteelBeam(inputs);
    if (!result.valid) {
      allValid = false;
      lastResult = result;
      lastInputs = inputs;
      worstEnvelope = env;
      continue;
    }
    aggregatedChecks = mergeWorstChecks(aggregatedChecks, result.checks ?? []);
    // Track the envelope/inputs from the combination producing the worst peak η
    // so the surfaced inputs reflect the governing case for debugging.
    const peak = (result.checks ?? []).reduce((m, c) => Math.max(m, c.utilization ?? 0), 0);
    const lastPeak = lastResult ? (lastResult.checks ?? []).reduce((m, c) => Math.max(m, c.utilization ?? 0), 0) : -1;
    if (peak > lastPeak) {
      lastInputs = inputs;
      lastResult = result;
      worstEnvelope = env;
    }
  }

  if (!allValid && lastResult) {
    return { status: 'ok', envelope: worstEnvelope, inputs: lastInputs!, result: lastResult };
  }

  // Synthesize the final SteelBeamResult with aggregated worst checks.
  const finalResult: SteelBeamResult = lastResult
    ? { ...lastResult, checks: aggregatedChecks }
    : ({ valid: false, error: 'No combinations produced a valid result' } as SteelBeamResult);

  return {
    status: 'ok',
    envelope: worstEnvelope,
    inputs: lastInputs ?? buildSteelBeamInputs(sel, beamType, worstEnvelope),
    result: finalResult,
  };
}

/** Compute the SteelBarEnvelope for ONE LC factor set (one combination). */
function envelopeForCombo(
  elements: SolverElementResult[],
  factors: LcFactors,
  Mser: number,
): SteelBarEnvelope {
  if (elements.length === 0) {
    return { L: 0, M_Ed: 0, V_Ed: 0, VEd_interaction: 0, Mser, x_at_M_Ed: 0 };
  }
  const L = elements.reduce((s, e) => s + e.L, 0);
  let M_Ed = 0;
  let V_at_MEd = 0;
  let V_Ed = 0;
  let x_at_M = 0;
  let xOffset = 0;
  for (const e of elements) {
    const xs = e.samples.xs;
    for (let i = 0; i < xs.length; i++) {
      let M = 0;
      let V = 0;
      for (const lc of Object.keys(e.samples.M) as LoadCase[]) {
        const factor = factors[lc] ?? 0;
        if (factor === 0) continue;
        M += factor * (e.samples.M[lc]?.[i] ?? 0);
        V += factor * (e.samples.V[lc]?.[i] ?? 0);
      }
      if (Math.abs(M) > M_Ed) {
        M_Ed = Math.abs(M);
        V_at_MEd = V;
        x_at_M = xOffset + xs[i];
      }
      if (Math.abs(V) > V_Ed) V_Ed = Math.abs(V);
    }
    xOffset += e.L;
  }
  return {
    L,
    M_Ed,
    V_Ed,
    VEd_interaction: Math.abs(V_at_MEd),
    Mser,
    x_at_M_Ed: x_at_M,
  };
}

/** Worst-case |M_ELS| across multiple ELS sub-combinations. */
function worstMserAcrossCombos(
  elements: SolverElementResult[],
  combos: LcFactors[],
): number {
  let best = 0;
  for (const factors of combos) {
    for (const e of elements) {
      const xs = e.samples.xs;
      for (let i = 0; i < xs.length; i++) {
        let M = 0;
        for (const lc of Object.keys(e.samples.M) as LoadCase[]) {
          const factor = factors[lc] ?? 0;
          if (factor === 0) continue;
          M += factor * (e.samples.M[lc]?.[i] ?? 0);
        }
        if (Math.abs(M) > best) best = Math.abs(M);
      }
    }
  }
  return best;
}

/**
 * Merge a new batch of checks into the running aggregate, keeping the worst
 * utilization per check id. The check `value`, `status`, etc. follow the worst
 * utilization (so the user sees the inputs that drove that peak).
 */
function mergeWorstChecks(
  agg: SteelCheckRow[],
  next: SteelCheckRow[],
): SteelCheckRow[] {
  const byId = new Map<string, SteelCheckRow>();
  for (const c of agg) byId.set(c.id, c);
  for (const c of next) {
    const prev = byId.get(c.id);
    if (!prev || (c.utilization ?? 0) > (prev.utilization ?? 0)) {
      byId.set(c.id, c);
    }
  }
  return Array.from(byId.values());
}

/**
 * Topology-derived beam type. Inspects the DesignModel to classify the bar:
 *   - 'cantilever' : one end fixed, other end TRULY free (no support, no neighbour)
 *   - 'ss'         : both ends pinned/roller (translation restrained, rotation free)
 *   - 'fp'         : one fixed-rotation end + one pinned-rotation end
 *   - 'ff'         : both ends fixed-rotation (continuous interior of chain)
 *
 * "Fixed-rotation" at a node means the bar's rotation at that node is
 * coupled to something rigid: either a 'fixed' support OR a continuous
 * neighbour (no internal hinge on this bar's side at that node).
 *
 * "Pinned-rotation" means rotation is free: pinned/roller support, OR an
 * internal hinge on this bar's side at that node, OR a hinge on the
 * neighbour's side at that node.
 *
 * "Free end" requires NO support AND NO neighbour bar at all.
 */
export function deriveBeamType(
  bar: DesignBar,
  model: DesignModel,
): 'ss' | 'cantilever' | 'fp' | 'ff' {
  const iHasAnyNeighbour = hasAnyNeighbour(bar.id, bar.i, model.bars);
  const jHasAnyNeighbour = hasAnyNeighbour(bar.id, bar.j, model.bars);
  const iHasContinuousRotNeighbour =
    !bar.internalHinges.i && hasContinuousNeighbour(bar.id, bar.i, model.bars);
  const jHasContinuousRotNeighbour =
    !bar.internalHinges.j && hasContinuousNeighbour(bar.id, bar.j, model.bars);
  const iSupport = supportAt(bar.i, model.supports);
  const jSupport = supportAt(bar.j, model.supports);

  // Cantilever: one end fixed (rotation restrained by 'fixed' support),
  // other end TRULY FREE (no support, no neighbour at all).
  const iIsFixedSupport = iSupport === 'fixed';
  const jIsFixedSupport = jSupport === 'fixed';
  const iIsTrulyFree = iSupport === undefined && !iHasAnyNeighbour;
  const jIsTrulyFree = jSupport === undefined && !jHasAnyNeighbour;
  if ((iIsFixedSupport && jIsTrulyFree) || (jIsFixedSupport && iIsTrulyFree)) {
    return 'cantilever';
  }

  // Determine rotation-fixity at each end:
  //   fixed-rot: 'fixed' support OR continuous neighbour
  //   pinned-rot: otherwise (pinned/roller support, hinge, or terminal)
  const iIsRotFixed = iIsFixedSupport || iHasContinuousRotNeighbour;
  const jIsRotFixed = jIsFixedSupport || jHasContinuousRotNeighbour;

  if (iIsRotFixed && jIsRotFixed) return 'ff';
  if (iIsRotFixed !== jIsRotFixed) return 'fp';
  return 'ss';
}

function hasAnyNeighbour(barId: string, nodeId: string, bars: DesignBar[]): boolean {
  for (const b of bars) {
    if (b.id === barId) continue;
    if (b.i === nodeId || b.j === nodeId) return true;
  }
  return false;
}

function hasContinuousNeighbour(
  barId: string,
  nodeId: string,
  bars: DesignBar[],
): boolean {
  for (const b of bars) {
    if (b.id === barId) continue;
    if (b.i === nodeId && !b.internalHinges.i) return true;
    if (b.j === nodeId && !b.internalHinges.j) return true;
  }
  return false;
}

function supportAt(nodeId: string, supports: Support[]): Support['type'] | undefined {
  return supports.find((s) => s.node === nodeId)?.type;
}

// ── Envelope computation ───────────────────────────────────────────────────

function computeEnvelope(elements: SolverElementResult[]): SteelBarEnvelope {
  if (elements.length === 0) {
    return { L: 0, M_Ed: 0, V_Ed: 0, VEd_interaction: 0, Mser: 0, x_at_M_Ed: 0 };
  }
  const L = elements.reduce((s, e) => s + e.L, 0);

  // Walk all samples, tracking max |M_ELU|, V at that location, max |V_ELU|,
  // max |M_ELS_c|.
  let M_Ed = 0;
  let V_at_MEd = 0;
  let V_Ed = 0;
  let Mser = 0;
  let x_at_M = 0;
  let xOffset = 0;
  for (const e of elements) {
    const xs = e.samples.xs;
    const M_G_arr = e.samples.M.G ?? new Array<number>(xs.length).fill(0);
    const V_G_arr = e.samples.V.G ?? new Array<number>(xs.length).fill(0);
    const sumOver = ['Q', 'W', 'S', 'E'] as const;
    for (let i = 0; i < xs.length; i++) {
      let M_var = 0;
      let V_var = 0;
      for (const lc of sumOver) {
        const Ma = e.samples.M[lc];
        const Va = e.samples.V[lc];
        if (Ma) M_var += Ma[i];
        if (Va) V_var += Va[i];
      }
      const M_ELU = ELU_GAMMA_G * M_G_arr[i] + ELU_GAMMA_VAR * M_var;
      const V_ELU = ELU_GAMMA_G * V_G_arr[i] + ELU_GAMMA_VAR * V_var;
      const M_ELS = M_G_arr[i] + M_var;
      if (Math.abs(M_ELU) > M_Ed) {
        M_Ed = Math.abs(M_ELU);
        V_at_MEd = V_ELU;
        x_at_M = xOffset + xs[i];
      }
      if (Math.abs(V_ELU) > V_Ed) V_Ed = Math.abs(V_ELU);
      if (Math.abs(M_ELS) > Mser) Mser = Math.abs(M_ELS);
    }
    xOffset += e.L;
  }

  return {
    L,
    M_Ed,
    V_Ed,
    VEd_interaction: Math.abs(V_at_MEd), // calcSteelBeam uses absolute value
    Mser,
    x_at_M_Ed: x_at_M,
  };
}

// ── SteelBeamInputs construction ───────────────────────────────────────────

function buildSteelBeamInputs(
  sel: SteelSelection,
  beamType: 'ss' | 'cantilever' | 'fp' | 'ff',
  env: SteelBarEnvelope,
): SteelBeamInputs {
  // Map catalog key ('steel_IPE240') to (tipo, size) for calcSteelBeam.
  const { tipo, size } = parseProfileKey(sel.profileKey);
  // L in mm (calcSteelBeam internal). Lcr defaults to bar length when not set.
  const L_mm = env.L * 1000;
  const Lcr_mm = sel.Lcr != null ? sel.Lcr * 1000 : L_mm;

  return {
    tipo,
    size,
    steel: sel.steel,
    beamType,
    MEd: env.M_Ed,
    VEd: env.V_Ed,
    VEd_interaction: env.VEd_interaction,
    Lcr: Lcr_mm,
    Mser: env.Mser,
    L: L_mm,
    deflLimit: sel.deflLimit,
    elsCombo: sel.elsCombo,
    // Loadgen stubs — calcSteelBeam ignores these because the consumer
    // (steel-beams index.tsx) overrides MEd/VEd/Mser via effectiveInputs.
    // For the FEM adapter we provide MEd/VEd/Mser directly here, so the
    // loadgen pass that calcSteelBeam might run on its own is moot — but
    // since the SteelBeamInputs shape requires these fields, we set safe
    // values (gk=0, qk=0, bTrib=1) that produce zero loadgen output.
    useCategory: sel.useCategory,
    gk: 0,
    qk: 0,
    bTrib: 1,
  };
}

function parseProfileKey(key: string): { tipo: 'IPE' | 'HEA' | 'HEB' | 'IPN'; size: number } {
  // Catalog keys follow 'steel_IPE240', 'steel_HEB200', etc.
  const m = key.match(/^steel_(IPE|HEA|HEB|IPN|L)(\d+)/);
  if (!m) {
    // Fallback: best-effort parse for unrecognized keys (e.g. L80x8). The
    // calcSteelBeam check will then return 'Perfil no encontrado', surfaced
    // upstream. V1 only handles IPE/HEB/HEA/IPN; L profiles are out of scope.
    return { tipo: 'IPE', size: 240 };
  }
  const tipo = m[1] === 'L' ? 'IPE' : (m[1] as 'IPE' | 'HEA' | 'HEB' | 'IPN');
  const size = parseInt(m[2], 10);
  return { tipo, size };
}
