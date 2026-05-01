// FEM 2D — Euler-Bernoulli direct-stiffness solver
//
// Consumes an AnalysisModel produced by autoDecompose and returns per-element
// sampled M(x), V(x), w(x) plus support reactions, for every load case in the
// model. Solver runs once per non-empty load case (linear superposition).
//
// References:
//   - Hibbeler, Structural Analysis (10th ed.) — Ch. 16
//   - Kassimali, Matrix Analysis of Structures — Ch. 7
//
// Element stiffness conventions:
//   - DOFs per element: [v_i, θ_i, v_j, θ_j] (vertical translation, rotation)
//   - Sign: M+ = sagging, V+ = i-end rotates CCW, gravity = -y
//   - For released ends, the standard 4×4 form has the released DOF row/col
//     zeroed (K_pc, K_fp). Globally, hinged interior nodes get separate θ DOFs
//     per element-end so the free-rotation equation is decoupled.
//
// Robustness (post Codex outside-voice review):
//   - Gauss elimination uses partial pivoting (swap rows by max |pivot|)
//   - Singularity guard: |pivot| < ε_pivot · max|K_diag| → SINGULAR_MATRIX
//   - Post-solve equilibrium check: ΣF_y = 0 within tolerance
//
// V1 limitations:
//   - 'spring' supports treated as 'roller' (TODO V1.5)
//   - All material is linear elastic (no nonlinearity)

import type {
  AnalysisBC,
  AnalysisElement,
  AnalysisLoadCase,
  AnalysisModel,
  ModelError,
  ReactionResult,
  SolverElementResult,
} from './types';

// ── Public entry point ──────────────────────────────────────────────────────

export interface SolveOptions {
  /** Number of x sampling points per element (default: 41 → 40 intervals). */
  samplesPerElement?: number;
  /** Pivot tolerance for singularity detection. Defaults to 1e-12. */
  pivotEps?: number;
  /** Tolerance for post-solve equilibrium check (relative to max|F|). */
  equilibriumEps?: number;
}

export interface SolveResultBundle {
  elements: SolverElementResult[];
  /** Reactions summed across all load cases (back-compat / equilibrium check). */
  reactions: ReactionResult[];
  /**
   * Per-load-case reactions. Each entry holds the reactions induced by that
   * LC's loads alone. solveDesignModel composes per-combination reactions by
   * applying CTE factor weights to these (linear superposition).
   */
  reactionsByLc: Record<string, ReactionResult[]>;
  errors: ModelError[];
}

export function solveAnalysisModel(
  am: AnalysisModel,
  opts: SolveOptions = {},
): SolveResultBundle {
  const samplesN = Math.max(2, opts.samplesPerElement ?? 41);
  const pivotEps = opts.pivotEps ?? 1e-12;
  const equilEps = opts.equilibriumEps ?? 1e-3;

  const errors: ModelError[] = [];

  // Trivial cases.
  if (am.elements.length === 0) {
    return { elements: [], reactions: [], reactionsByLc: {}, errors };
  }

  // Build DOF map (v per node, θ per rotation cluster).
  const dofMap = buildDofMap(am);
  const N = dofMap.totalDofs;

  // Assemble global stiffness K (size N × N, dense).
  const K = assembleGlobalK(am, dofMap);

  // Active DOFs (after applying BCs).
  const { fixedDofs, freeDofs } = applyBCs(am.bcs, dofMap);

  if (freeDofs.length === 0) {
    errors.push({
      severity: 'fail',
      code: 'NO_FREE_DOFS',
      msg: 'Modelo sobre-restringido: ningún grado de libertad libre.',
    });
    return { elements: [], reactions: [], reactionsByLc: {}, errors };
  }

  // Build per-element samples placeholder.
  const elements: SolverElementResult[] = am.elements.map((el) => ({
    elementId: el.id,
    designBarId: el.designBarId,
    L: el.length,
    samples: {
      xs: linspace(0, el.length, samplesN),
      M: {},
      V: {},
      w: {},
    },
  }));

  // Per-load-case solve.
  const reactionsByNode = new Map<string, { Rx: number; Ry: number; Mr: number }>();
  const reactionsPerLcByNode = new Map<string, Map<string, { Rx: number; Ry: number; Mr: number }>>();
  for (const lc of am.loadCases) {
    const F = assembleGlobalF(am, dofMap, lc, N);

    // Solve K_ff · u_f = F_f - K_fc · u_c (u_c = 0 for our BCs).
    const Kff = subMatrix(K, freeDofs, freeDofs);
    const Ff = freeDofs.map((d) => F[d]);

    let u_f: number[];
    try {
      u_f = gaussSolve(Kff, Ff, pivotEps);
    } catch (e) {
      const msg = (e as Error).message ?? 'Singular K matrix';
      errors.push({
        severity: 'fail',
        code: 'SINGULAR_MATRIX',
        msg: `Matriz singular en hipótesis '${lc.lc}': ${msg}`,
      });
      continue;
    }

    // Reconstruct full displacement vector.
    const u = new Array<number>(N).fill(0);
    for (let i = 0; i < freeDofs.length; i++) u[freeDofs[i]] = u_f[i];

    // Compute reactions: R = K · u - F at fixed DOFs.
    //
    // The DOF equation is: K[d]·u = F[d] + R_d  (applied external + support
    // reaction = inertia-free equilibrium). Solving for the reaction:
    //   R_d = K[d]·u - F[d]
    //
    // R_d is positive in the +DOF direction (UP for v, CCW for θ). For Ry we
    // report the support's UPWARD push directly. For the moment reaction Mr
    // we report the CCW moment the support applies to the structure.
    // Per-LC bucket so callers can do CTE multi-principal weighting later.
    const lcBucket = reactionsPerLcByNode.get(lc.lc) ?? new Map<string, { Rx: number; Ry: number; Mr: number }>();
    for (const d of fixedDofs) {
      const r = matrixRowDot(K[d], u) - F[d];
      const nodeForDof = dofMap.dofToNode[d];
      const isVDof = dofMap.nodeVDof[nodeForDof] === d;
      const cur = reactionsByNode.get(nodeForDof) ?? { Rx: 0, Ry: 0, Mr: 0 };
      const curLc = lcBucket.get(nodeForDof) ?? { Rx: 0, Ry: 0, Mr: 0 };
      if (isVDof) {
        cur.Ry += r;
        curLc.Ry += r;
      } else {
        cur.Mr += r;
        curLc.Mr += r;
      }
      reactionsByNode.set(nodeForDof, cur);
      lcBucket.set(nodeForDof, curLc);
    }
    reactionsPerLcByNode.set(lc.lc, lcBucket);

    // Sample M, V, w per element using Hermite shape functions.
    for (let ei = 0; ei < am.elements.length; ei++) {
      const el = am.elements[ei];
      const dofs = dofMap.elementDofs[el.id]; // [v_i, θ_i, v_j, θ_j]
      const u_e = dofs.map((d) => u[d]);

      // Element-local fixed-end forces (signed) for this load case's q on this element.
      const q_e = lc.q[ei];
      // Equivalent forces for distributed load q (constant) transferred to nodes:
      // (matches Hermite-cubic FEM consistent loading).
      // Subtract them when computing internal M, V from FE displacements (since the
      // FE internal forces include the reactions to the fixed-end forces).
      const samples = sampleElement(el, u_e, q_e, samplesN);
      elements[ei].samples.M[lc.lc] = samples.M;
      elements[ei].samples.V[lc.lc] = samples.V;
      elements[ei].samples.w[lc.lc] = samples.w;
    }

    // Equilibrium check for this load case: sum of reactions Ry plus total
    // applied Y forces should be ≈ 0 (Newton's first law for the structure).
    const totalAppliedY = computeTotalAppliedY(am, lc);
    let totalReactionY = 0;
    for (const d of fixedDofs) {
      const nodeForDof = dofMap.dofToNode[d];
      const isVDof = dofMap.nodeVDof[nodeForDof] === d;
      if (isVDof) {
        const r = matrixRowDot(K[d], u) - F[d];
        totalReactionY += r;
      }
    }
    const sumY = totalReactionY + totalAppliedY;
    const tol = equilEps * Math.max(1, Math.abs(totalAppliedY));
    if (Math.abs(sumY) > tol) {
      errors.push({
        severity: 'warn',
        code: 'EQUILIBRIUM_VIOLATION',
        msg: `Hipótesis '${lc.lc}': desequilibrio ΣF_y = ${sumY.toFixed(3)} kN (tolerancia ${tol.toFixed(3)}).`,
      });
    }
  }

  // Build reactions array, preserving node x.
  const reactions: ReactionResult[] = [];
  for (const an of am.nodes) {
    const r = reactionsByNode.get(an.id);
    if (!r) continue;
    reactions.push({
      node: an.id,
      x: an.x,
      y: 0, // V1 strip
      Rx: r.Rx,
      Ry: r.Ry,
      Mr: r.Mr,
    });
  }

  // Per-LC reactions for downstream multi-principal weighting (V1.1 R9 / canvas
  // combo selector also driving reactions, not just diagrams).
  const reactionsByLc: Record<string, ReactionResult[]> = {};
  for (const [lc, bucket] of reactionsPerLcByNode.entries()) {
    const arr: ReactionResult[] = [];
    for (const an of am.nodes) {
      const r = bucket.get(an.id);
      if (!r) continue;
      arr.push({ node: an.id, x: an.x, y: 0, Rx: r.Rx, Ry: r.Ry, Mr: r.Mr });
    }
    reactionsByLc[lc] = arr;
  }

  return { elements, reactions, reactionsByLc, errors };
}

// ── DOF map ─────────────────────────────────────────────────────────────────

interface DofMap {
  totalDofs: number;
  /** Global v-DOF index for each analysis node id. */
  nodeVDof: Record<string, number>;
  /** [v_i, θ_i, v_j, θ_j] global indices per element id. */
  elementDofs: Record<string, [number, number, number, number]>;
  /** Reverse index from DOF → node id, used for reaction extraction. */
  dofToNode: string[];
}

function buildDofMap(am: AnalysisModel): DofMap {
  const nodeVDof: Record<string, number> = {};
  const elementDofs: Record<string, [number, number, number, number]> = {};
  const dofToNode: string[] = [];

  // Step 1: allocate one v-DOF per node.
  for (const n of am.nodes) {
    nodeVDof[n.id] = dofToNode.length;
    dofToNode.push(n.id);
  }

  // Step 2: for each node, find the element-ends meeting at it and assign
  // rotation DOFs. Continuous element-ends share one θ DOF per node;
  // released element-ends each get their own θ DOF.
  type EndRef = { elementId: string; isI: boolean; released: boolean };
  const endsByNode = new Map<string, EndRef[]>();
  for (const el of am.elements) {
    if (!endsByNode.has(el.i_node)) endsByNode.set(el.i_node, []);
    if (!endsByNode.has(el.j_node)) endsByNode.set(el.j_node, []);
    endsByNode.get(el.i_node)!.push({
      elementId: el.id,
      isI: true,
      released: el.rotZ_i === 'released',
    });
    endsByNode.get(el.j_node)!.push({
      elementId: el.id,
      isI: false,
      released: el.rotZ_j === 'released',
    });
  }

  // Per-element θ-DOF lookup we'll fill in.
  const elementThetaI: Record<string, number> = {};
  const elementThetaJ: Record<string, number> = {};

  for (const n of am.nodes) {
    const ends = endsByNode.get(n.id) ?? [];
    if (ends.length === 0) continue;

    const continuousEnds = ends.filter((e) => !e.released);
    const releasedEnds = ends.filter((e) => e.released);

    // Allocate one shared θ DOF for all continuous ends at this node, if any.
    let sharedThetaDof: number | null = null;
    if (continuousEnds.length > 0) {
      sharedThetaDof = dofToNode.length;
      dofToNode.push(n.id);
      for (const e of continuousEnds) {
        if (e.isI) elementThetaI[e.elementId] = sharedThetaDof;
        else elementThetaJ[e.elementId] = sharedThetaDof;
      }
    }

    // Each released end gets its own θ DOF.
    for (const e of releasedEnds) {
      const dof = dofToNode.length;
      dofToNode.push(n.id);
      if (e.isI) elementThetaI[e.elementId] = dof;
      else elementThetaJ[e.elementId] = dof;
    }
  }

  // Compose elementDofs.
  for (const el of am.elements) {
    elementDofs[el.id] = [
      nodeVDof[el.i_node],
      elementThetaI[el.id],
      nodeVDof[el.j_node],
      elementThetaJ[el.id],
    ];
  }

  return {
    totalDofs: dofToNode.length,
    nodeVDof,
    elementDofs,
    dofToNode,
  };
}

// ── Element stiffness ───────────────────────────────────────────────────────

/**
 * Standard 4×4 Euler-Bernoulli beam stiffness for an element with rotational
 * end-condition flags. Returns a 4×4 matrix in DOF order [v_i, θ_i, v_j, θ_j].
 *
 * For released ends, the corresponding θ row/col is zero; the released θ DOF
 * gets its own global index (per buildDofMap), so the singular row in the
 * global K is harmless because no other element contributes to that row either
 * — and the DOF will be solved as 0 by penalty (we add ε to the diagonal of
 * any all-zero row before solving — see assembleGlobalK).
 */
export function elementStiffness(
  EI: number,
  L: number,
  rotZ_i: 'continuous' | 'released',
  rotZ_j: 'continuous' | 'released',
): number[][] {
  const c = EI / (L * L * L);
  const L2 = L * L;
  if (rotZ_i === 'continuous' && rotZ_j === 'continuous') {
    return [
      [12 * c,    6 * L * c,    -12 * c,    6 * L * c],
      [6 * L * c, 4 * L2 * c,   -6 * L * c, 2 * L2 * c],
      [-12 * c,   -6 * L * c,   12 * c,     -6 * L * c],
      [6 * L * c, 2 * L2 * c,   -6 * L * c, 4 * L2 * c],
    ];
  }
  if (rotZ_i === 'released' && rotZ_j === 'continuous') {
    // K_pc — i-end pinned, j-end fixed.
    return [
      [3 * c,     0, -3 * c,     3 * L * c],
      [0,         0, 0,          0],
      [-3 * c,    0, 3 * c,      -3 * L * c],
      [3 * L * c, 0, -3 * L * c, 3 * L2 * c],
    ];
  }
  if (rotZ_i === 'continuous' && rotZ_j === 'released') {
    // K_fp — i-end fixed, j-end pinned.
    return [
      [3 * c,     3 * L * c,  -3 * c,    0],
      [3 * L * c, 3 * L2 * c, -3 * L * c, 0],
      [-3 * c,    -3 * L * c, 3 * c,     0],
      [0,         0,          0,          0],
    ];
  }
  // Both released: biarticulated, no flexural stiffness. Returns zero matrix;
  // upstream invariant rejection means we should never reach here for V1.
  return [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
}

/**
 * Fixed-end forces from a uniformly distributed load q (signed, kN/m) on an
 * element with end-condition flags. Returns 4-vector in DOF order [V_i, M_i,
 * V_j, M_j]. This is the equivalent NODAL load applied to the structure to
 * preserve the FE displacement formulation (sign convention: positive matches
 * a force or moment ON the structure at that node, in the +DOF direction).
 *
 * For Euler-Bernoulli with consistent (work-equivalent) loading.
 */
export function fixedEndForces(
  q: number,
  L: number,
  rotZ_i: 'continuous' | 'released',
  rotZ_j: 'continuous' | 'released',
): [number, number, number, number] {
  if (rotZ_i === 'continuous' && rotZ_j === 'continuous') {
    return [q * L / 2, q * L * L / 12, q * L / 2, -q * L * L / 12];
  }
  if (rotZ_i === 'released' && rotZ_j === 'continuous') {
    return [3 * q * L / 8, 0, 5 * q * L / 8, -q * L * L / 8];
  }
  if (rotZ_i === 'continuous' && rotZ_j === 'released') {
    return [5 * q * L / 8, q * L * L / 8, 3 * q * L / 8, 0];
  }
  return [q * L / 2, 0, q * L / 2, 0];
}

// ── Assembly ────────────────────────────────────────────────────────────────

function assembleGlobalK(am: AnalysisModel, dofMap: DofMap): number[][] {
  const N = dofMap.totalDofs;
  const K: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (const el of am.elements) {
    const K_e = elementStiffness(el.EI, el.length, el.rotZ_i, el.rotZ_j);
    const dofs = dofMap.elementDofs[el.id];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        K[dofs[i]][dofs[j]] += K_e[i][j];
      }
    }
  }
  // Numerical penalty on any all-zero row/col. Released-end θ DOFs at a hinge
  // node (where no element shares the rotation) have zero stiffness from
  // every element. Without a penalty, the global K row is identically zero
  // and Gauss elimination reports SINGULAR_MATRIX. The penalty must be small
  // enough to not perturb the real solution but LARGER than the pivot
  // tolerance (default 1e-12·max|K_diag|), so 1e-8·max is safe.
  let maxDiag = 0;
  for (let i = 0; i < N; i++) maxDiag = Math.max(maxDiag, Math.abs(K[i][i]));
  const eps = Math.max(1e-30, maxDiag * 1e-8);
  for (let i = 0; i < N; i++) {
    let allZero = true;
    for (let j = 0; j < N; j++) {
      if (Math.abs(K[i][j]) > 1e-30) { allZero = false; break; }
    }
    if (allZero) K[i][i] = eps;
  }
  return K;
}

function assembleGlobalF(
  am: AnalysisModel,
  dofMap: DofMap,
  lc: AnalysisLoadCase,
  N: number,
): number[] {
  const F = new Array<number>(N).fill(0);

  // Distributed loads → equivalent nodal forces per element.
  for (let ei = 0; ei < am.elements.length; ei++) {
    const el = am.elements[ei];
    const q = lc.q[ei];
    if (Math.abs(q) < 1e-30) continue;
    const fe = fixedEndForces(q, el.length, el.rotZ_i, el.rotZ_j);
    const dofs = dofMap.elementDofs[el.id];
    F[dofs[0]] += fe[0];
    F[dofs[1]] += fe[1];
    F[dofs[2]] += fe[2];
    F[dofs[3]] += fe[3];
  }

  // Concentrated nodal loads.
  for (const pl of lc.pointLoads) {
    const vDof = dofMap.nodeVDof[pl.node];
    if (vDof != null) F[vDof] += pl.Py;
    if (pl.M != null && pl.M !== 0) {
      // Apply moment to the shared (continuous) θ DOF if it exists; otherwise
      // to the first available θ DOF at this node. For V1 we don't introduce
      // applied moments via point loads, so this branch is mostly unused.
      // Find any θ DOF at this node by scanning element θ assignments.
      // (For simplicity, we leave applied moments unimplemented; they are not
      // surfaced by the V1 UI.)
    }
  }

  return F;
}

// ── BCs ─────────────────────────────────────────────────────────────────────

interface BCsResult {
  fixedDofs: number[];
  freeDofs: number[];
}

function applyBCs(bcs: AnalysisBC[], dofMap: DofMap): BCsResult {
  const fixed = new Set<number>();
  for (const bc of bcs) {
    if (bc.fixY) {
      const vDof = dofMap.nodeVDof[bc.node];
      if (vDof != null) fixed.add(vDof);
    }
    if (bc.fixRot) {
      // Restrain ALL θ DOFs at this node (continuous + released).
      // Find them by scanning dofToNode for entries matching this node id.
      for (let i = 0; i < dofMap.dofToNode.length; i++) {
        if (dofMap.dofToNode[i] === bc.node && i !== dofMap.nodeVDof[bc.node]) {
          fixed.add(i);
        }
      }
    }
  }
  const fixedDofs = Array.from(fixed).sort((a, b) => a - b);
  const freeDofs: number[] = [];
  for (let i = 0; i < dofMap.totalDofs; i++) {
    if (!fixed.has(i)) freeDofs.push(i);
  }
  return { fixedDofs, freeDofs };
}

// ── Linear algebra ──────────────────────────────────────────────────────────

function subMatrix(K: number[][], rows: number[], cols: number[]): number[][] {
  const M: number[][] = [];
  for (const r of rows) {
    const row: number[] = [];
    for (const c of cols) row.push(K[r][c]);
    M.push(row);
  }
  return M;
}

function matrixRowDot(row: number[], u: number[]): number {
  let s = 0;
  for (let i = 0; i < row.length; i++) s += row[i] * u[i];
  return s;
}

/**
 * Gauss elimination with partial pivoting + singularity guard. Solves K·x = b.
 * Throws if any pivot magnitude falls below pivotEps · max|K_diag_initial|.
 */
function gaussSolve(K: number[][], b: number[], pivotEps: number): number[] {
  const N = K.length;
  // Copy to avoid mutating caller's matrix.
  const A: number[][] = K.map((row) => row.slice());
  const x: number[] = b.slice();

  // Initial scale for singularity tolerance.
  let maxDiag = 0;
  for (let i = 0; i < N; i++) maxDiag = Math.max(maxDiag, Math.abs(A[i][i]));
  const tol = pivotEps * Math.max(1, maxDiag);

  for (let k = 0; k < N; k++) {
    // Partial pivot: find row r ≥ k with max |A[r][k]|.
    let maxAbs = Math.abs(A[k][k]);
    let pivotRow = k;
    for (let r = k + 1; r < N; r++) {
      if (Math.abs(A[r][k]) > maxAbs) {
        maxAbs = Math.abs(A[r][k]);
        pivotRow = r;
      }
    }
    if (maxAbs < tol) {
      throw new Error(
        `Pivot below tolerance at row ${k}: |pivot|=${maxAbs.toExponential(3)} < ${tol.toExponential(3)} (matrix singular or ill-conditioned)`,
      );
    }
    if (pivotRow !== k) {
      [A[k], A[pivotRow]] = [A[pivotRow], A[k]];
      [x[k], x[pivotRow]] = [x[pivotRow], x[k]];
    }
    // Eliminate.
    const pivot = A[k][k];
    for (let r = k + 1; r < N; r++) {
      const factor = A[r][k] / pivot;
      if (factor === 0) continue;
      for (let c = k; c < N; c++) A[r][c] -= factor * A[k][c];
      x[r] -= factor * x[k];
    }
  }

  // Back substitution.
  const out = new Array<number>(N).fill(0);
  for (let i = N - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < N; j++) s -= A[i][j] * out[j];
    out[i] = s / A[i][i];
  }
  return out;
}

// ── Hermite element sampling ────────────────────────────────────────────────

/**
 * Sample M(x), V(x), w(x) along an element using Hermite cubic shape functions
 * applied to the element's 4 nodal DOFs [v_i, θ_i, v_j, θ_j], plus the
 * particular solution from the distributed load q on the element.
 *
 * For an Euler-Bernoulli beam:
 *   w(x) = N1(ξ)·v_i + N2(ξ)·θ_i·L + N3(ξ)·v_j + N4(ξ)·θ_j·L  +  w_q(x)
 *   where ξ = x/L.
 *   N1(ξ) = 1 - 3ξ² + 2ξ³
 *   N2(ξ) = ξ - 2ξ² + ξ³
 *   N3(ξ) = 3ξ² - 2ξ³
 *   N4(ξ) = -ξ² + ξ³
 *
 *   M(x) = -EI · w''(x)
 *   V(x) = -EI · w'''(x) - q · (L/2 - x)   (correction for distributed load)
 *
 * The "particular solution" w_q(x) for a uniformly loaded prismatic element
 * (with the FE displacements as boundary conditions) is the cubic that
 * satisfies the Euler-Bernoulli ODE EI·w'''' = q. For consistency with the
 * direct-stiffness formulation we use:
 *
 *   M(x) from the FE displacements + add the distributed-load contribution.
 *
 * Implementation: compute the cubic w(x) from displacements, compute its
 * second derivative for M_FE, then add the M from the q on a fictitious
 * fixed-fixed beam. Equivalent net result.
 */
function sampleElement(
  el: AnalysisElement,
  u_e: number[],          // [v_i, θ_i, v_j, θ_j]
  q: number,
  samplesN: number,
): { M: number[]; V: number[]; w: number[] } {
  const L = el.length;
  const EI = el.EI;
  const [vi, thetaI, vj, thetaJ] = u_e;

  const M: number[] = new Array(samplesN);
  const V: number[] = new Array(samplesN);
  const w: number[] = new Array(samplesN);

  // Compute end shears/moments at the element from FE displacements + q
  // (using the original element K and fixed-end forces). This is the
  // "internal force" interpretation:
  //
  //   F_int = K_e · u_e - F_eq  (where F_eq is the fixed-end force vector)
  //
  // F_int = [V_i, M_i, V_j, M_j] is the force the element exerts on its
  // i-end and j-end nodes (sign convention from the K matrix).
  const K_e = elementStiffness(EI, L, el.rotZ_i, el.rotZ_j);
  const F_eq = fixedEndForces(q, L, el.rotZ_i, el.rotZ_j);
  const F_int: [number, number, number, number] = [
    K_e[0][0] * vi + K_e[0][1] * thetaI + K_e[0][2] * vj + K_e[0][3] * thetaJ - F_eq[0],
    K_e[1][0] * vi + K_e[1][1] * thetaI + K_e[1][2] * vj + K_e[1][3] * thetaJ - F_eq[1],
    K_e[2][0] * vi + K_e[2][1] * thetaI + K_e[2][2] * vj + K_e[2][3] * thetaJ - F_eq[2],
    K_e[3][0] * vi + K_e[3][1] * thetaI + K_e[3][2] * vj + K_e[3][3] * thetaJ - F_eq[3],
  ];

  // Internal moment and shear at each x along the element are obtained by
  // walking from the i-end:
  //   V(x) = -V_i_int + q·x          (V_i_int is the force acting at i-end)
  //   Wait — sign conventions are slippery. Use the direct shape-function
  //   approach instead: compute w(x) by Hermite, derive M = -EI·w'', V =
  //   dM/dx + q·integral. That requires careful sign management.
  //
  // Simpler and standard: use the "section equilibrium" at distance x from
  // the i-end. The internal forces just to the right of x are:
  //   V(x) = (-V_i_int) - q·x        (shear)
  //   M(x) = (-M_i_int) + V_i_node·x - q·x²/2   ← this is sloppy
  //
  // Cleanest is to use M(x) = -EI · w''(x) where w(x) is the FE Hermite
  // cubic. The "missing" particular solution for distributed load is
  // already embedded in the FE displacements (because q creates the F_eq
  // that drives the displacements). So pure Hermite evaluation of the
  // displacements actually gives a polynomial that's correct only at the
  // nodes for the pure-FE case. To recover the correct interior M(x) for
  // distributed load, we add the particular solution explicitly.

  // Particular solution for w under uniform q on an element with zero
  // displacements at both ends and zero rotations (clamped both ends):
  //   w_p(x) = -q·x²·(L-x)² / (24·EI)   ← clamped-clamped fixed-end case
  // The corresponding M_p(x) = -EI · w_p'' = -q·(L-x)²·(?)/... — instead of
  // working this out symbolically, we use the equilibrium approach:
  //
  // V(x) at distance x from i-end = -F_int[0] - q·x
  //   (F_int[0] is the FE i-end shear; convention: positive when pushing
  //    structure UP from the i-end. Section equilibrium: V_section = V_i - q·x_section)
  // M(x) at distance x from i-end = F_int[1] + (-F_int[0])·x - q·x²/2
  //   (F_int[1] is the FE i-end moment; CCW positive.)
  //
  // Sign tweaks to align with convention "M+ = sagging":
  // For a downward q (q < 0 in our model), sagging M > 0. Verify with simple
  // beam: q=-25 kN/m, L=6m, V_i_int (FE) = -75 (i-end pushes UP), M at x=L/2:
  //   M(L/2) = M_i + V·L/2 - q·(L/2)²/2 = 0 + 75·3 - (-25)·9/2 = 225 + 112.5 = ... wrong
  //
  // The right formula needs care. Standard is:
  //   V(x) = V_i + ∫₀ˣ q dx' = V_i + q·x   (q is the load per length acting in -y)
  //   M(x) = M_i + ∫₀ˣ V(x') dx' = M_i + V_i·x + q·x²/2
  //
  // For simply supported beam with q=-25 (downward), V_i must be +q·L/2 = -75
  // (V_i positive when the cut shear face on the +x side has +y resultant).
  // Hmm sign of V_i_int from the FE depends on convention. Let me just match
  // the FE convention: F_int[0] is the force the element exerts on its i-end
  // node, positive UP. So the section just to the right of i has shear =
  // -F_int[0] (Newton's third law).
  //
  // For our simple beam (q=-25, L=6): F_int[0] (i-end force) should be +75
  // (the element pushes the i-end node UP since gravity pulls structure down,
  // and the support reaction must hold the structure up). So V at any
  // section x = -75 + q·x = -75 + (-25)·x. At x=3 (midspan): V=-150. Hmm
  // that's the magnitude of the half load + wrong sign...
  //
  // Convention is genuinely tricky. Let me just code what works empirically
  // against the analytical tests, with comments to record the convention.

  // Section equilibrium for the LEFT free body (segment from 0 to x).
  //
  // Verified against two analytical cases (SS UDL, cantilever point at tip)
  // — see femSolver.test.ts case 1 and case 5. Conventions:
  //
  //   F_int[0] = +y force the i-end node applies to the element (= support
  //              reaction R_v_i at a constrained DOF, UP positive).
  //   F_int[1] = CCW moment the i-end node applies to the element (= moment
  //              reaction R_θ_i at a fixed support).
  //   q        = signed distributed load (kN/m, negative for gravity).
  //
  // Walking the LEFT free body (0 to x) and summing forces/moments:
  //
  //   V(x) = +F_int[0] + q·x          (shear at section, positive sagging)
  //   M(x) = -F_int[1] + F_int[0]·x + q·x²/2   (moment, positive sagging)
  //
  // The sign on F_int[1] is negative because the SUPPORT MOMENT R_θ_i
  // applied CCW to the element corresponds to HOGGING at the support
  // (e.g. cantilever with downward tip load: R_θ_i = +PL CCW, but the
  // section moment at the fixed end is -PL hogging).
  for (let i = 0; i < samplesN; i++) {
    const x = (L * i) / (samplesN - 1);
    const xi = x / L;
    // Hermite cubic w(x) from FE displacements (deflection in m, +y up).
    const N1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;
    const N2 = xi - 2 * xi * xi + xi * xi * xi;
    const N3 = 3 * xi * xi - 2 * xi * xi * xi;
    const N4 = -xi * xi + xi * xi * xi;
    w[i] = N1 * vi + N2 * thetaI * L + N3 * vj + N4 * thetaJ * L;
    V[i] = F_int[0] + q * x;
    M[i] = -F_int[1] + F_int[0] * x + (q * x * x) / 2;
  }

  return { M, V, w };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function linspace(a: number, b: number, n: number): number[] {
  if (n === 1) return [a];
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / (n - 1);
  return out;
}

function computeTotalAppliedY(am: AnalysisModel, lc: AnalysisLoadCase): number {
  let total = 0;
  for (let i = 0; i < am.elements.length; i++) {
    total += lc.q[i] * am.elements[i].length;
  }
  for (const pl of lc.pointLoads) total += pl.Py;
  return total;
}
