// FEM 2D — direct-stiffness frame solver (Lane B, Fase 2)
//
// Plane-frame solver: 3 DOF per node (u global-x, v global-y, θ CCW).
// Two element formulations (eng-review D3/D10):
//
//   beam-column : 6-DOF Euler-Bernoulli + axial. Local stiffness (DOF order
//                 [u_i, v_i, θ_i, u_j, v_j, θ_j], x_local i→j, y_local ⊥ CCW):
//
//                   ⎡  EA/L    ·        ·       −EA/L    ·        ·      ⎤
//                   ⎢   ·   12EI/L³  6EI/L²      ·   −12EI/L³  6EI/L²   ⎥
//                   ⎢   ·    6EI/L²  4EI/L       ·    −6EI/L²  2EI/L    ⎥
//                   ⎢ −EA/L    ·        ·        EA/L    ·        ·     ⎥
//                   ⎢   ·  −12EI/L³ −6EI/L²      ·    12EI/L³ −6EI/L²   ⎥
//                   ⎣   ·    6EI/L²  2EI/L       ·    −6EI/L²  4EI/L    ⎦
//
//                 (Kassimali, Matrix Analysis of Structures, ch. 6.)
//
//   two-force   : axial-only, 4 global DOFs [u_i,v_i,u_j,v_j]:
//                 K = (EA/L)·[c s]ᵀ[c s] pattern. Keeps trusses
//                 well-conditioned (no EI/L³ ≪ EA/L scale mixing).
//
// Releases (internal hinges) use the DUPLICATE-θ-DOF scheme: every
// beam-column end gets a rotation DOF — continuous ends SHARE the node's θ
// cluster, released ends get their OWN θ unknown. A released end's θ row
// receives contributions only from its own element, so its equilibrium
// equation IS the zero-moment hinge condition — exact, no condensed matrices
// and no diagonal-penalty hacks (improves on the 1D solver). Nodes touched
// only by two-force elements allocate no θ at all.
//
// Sign conventions for recovered internal forces (pinned by the analytical
// test battery — see solver2d.test.ts):
//   S = K_local·u_local − F_eq_local  = force the NODES apply TO the element
//       at its ends, local axes. (F_eq = consistent equivalent nodal loads of
//       the member load.)
//   N(x) = −(S[0] + qx·x)      axial, tension positive
//   V(x) =   S[1] + qy·x       shear, matches the 1D sagging convention
//   M(x) =  −S[2] + S[1]·x + qy·x²/2   bending, sagging positive w.r.t. +y_local
//   w(x) = Hermite(nodal) + qy·L⁴/(24EI)·ξ²(1−ξ)²   (particular term makes
//          interior deflections EXACT for constant q, not just nodal ones)
//   u(x) = linear(nodal) + qx·x(L−x)/(2EA)

import { gaussSolve, matrixRowDot, subMatrix } from '../../lib/frame-core/linalg';
import type { ModelError } from '../../lib/frame-core/types';
import type {
  Analysis2DElement,
  Analysis2DLoadCase,
  Analysis2DModel,
  Analysis2DNode,
} from './analysis';

// ── Public shapes ───────────────────────────────────────────────────────────

export interface Solve2DOptions {
  /** Sample points per element (default 41 → 40 intervals, mirrors 1D). */
  samplesPerElement?: number;
  /** Pivot tolerance for singularity detection. Default 1e-12. */
  pivotEps?: number;
  /** Tolerance for the post-solve ΣF equilibrium check. Default 1e-3. */
  equilibriumEps?: number;
}

export interface Element2DSamples {
  xs: number[];
  /** Per load case: axial (tension+), shear, bending (sagging+ local),
   *  local transverse deflection w, local axial displacement u. */
  N: Record<string, number[]>;
  V: Record<string, number[]>;
  M: Record<string, number[]>;
  w: Record<string, number[]>;
  u: Record<string, number[]>;
}

export interface Solver2DElementResult {
  elementId: string;
  designMemberId: string;
  L: number;
  /** Element angle (rad, atan2 world). Canvas rotates diagrams with it. */
  angle: number;
  samples: Element2DSamples;
}

export interface Reaction2D {
  node: string;
  x: number;
  y: number;
  Rx: number; // kN, +x world
  Ry: number; // kN, +y world (up)
  Mr: number; // kN·m, CCW+
}

export interface NodeDisplacement2D {
  ux: number; // m
  uy: number; // m
  /** Shared-cluster rotation (rad, CCW+); null when the node has no θ DOF. */
  theta: number | null;
}

export interface Solve2DResultBundle {
  elements: Solver2DElementResult[];
  /** Reactions summed across all load cases. */
  reactions: Reaction2D[];
  /** Per-load-case reactions (linear superposition inputs for combinations). */
  reactionsByLc: Record<string, Reaction2D[]>;
  /** Per-load-case nodal displacements. */
  displacementsByLc: Record<string, Record<string, NodeDisplacement2D>>;
  errors: ModelError[];
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function solveAnalysis2D(
  am: Analysis2DModel,
  opts: Solve2DOptions = {},
): Solve2DResultBundle {
  const samplesN = Math.max(2, opts.samplesPerElement ?? 41);
  const pivotEps = opts.pivotEps ?? 1e-12;
  const equilEps = opts.equilibriumEps ?? 1e-3;

  const errors: ModelError[] = [];
  const empty: Solve2DResultBundle = {
    elements: [], reactions: [], reactionsByLc: {}, displacementsByLc: {}, errors,
  };

  if (am.elements.length === 0) return empty;

  const nodeById = new Map<string, Analysis2DNode>(am.nodes.map((n) => [n.id, n]));

  // Geometry per element.
  const geo = new Map<string, { L: number; c: number; s: number; angle: number }>();
  for (const el of am.elements) {
    const ni = nodeById.get(el.i);
    const nj = nodeById.get(el.j);
    if (!ni || !nj) {
      errors.push({ severity: 'fail', code: 'ELEMENT_NODE_MISSING', msg: `Elemento ${el.id}: nodo inexistente.` });
      return empty;
    }
    const dx = nj.x - ni.x;
    const dy = nj.y - ni.y;
    const L = Math.hypot(dx, dy);
    if (L <= 0) {
      errors.push({ severity: 'fail', code: 'ELEMENT_ZERO_LENGTH', msg: `Elemento ${el.id} de longitud nula.` });
      return empty;
    }
    geo.set(el.id, { L, c: dx / L, s: dy / L, angle: Math.atan2(dy, dx) });
  }

  // Floating nodes (referenced by no element) would create all-zero rows.
  const touched = new Set<string>();
  for (const el of am.elements) { touched.add(el.i); touched.add(el.j); }
  for (const n of am.nodes) {
    if (!touched.has(n.id)) {
      errors.push({ severity: 'fail', code: 'FLOATING_NODE', msg: `Nodo ${n.id} sin barras conectadas.` });
    }
  }
  if (errors.some((e) => e.severity === 'fail')) return empty;

  // Two-force elements must carry no member load (validated upstream too).
  for (const lcCase of am.loadCases) {
    for (let ei = 0; ei < am.elements.length; ei++) {
      const el = am.elements[ei];
      const q = lcCase.q[ei];
      if (el.elementType === 'two-force' && q && (q.qx !== 0 || q.qy !== 0)) {
        errors.push({
          severity: 'fail',
          code: 'TWO_FORCE_MEMBER_LOAD',
          msg: `Elemento biela ${el.id} con carga distribuida en hipótesis '${lcCase.lc}'.`,
        });
      }
    }
  }
  if (errors.some((e) => e.severity === 'fail')) return empty;

  const dofMap = buildDofMap(am);
  const N = dofMap.total;
  const K = assembleK(am, dofMap, geo);
  const { fixedDofs, freeDofs } = applyBCs(am, dofMap);

  if (freeDofs.length === 0) {
    errors.push({ severity: 'fail', code: 'NO_FREE_DOFS', msg: 'Modelo sobre-restringido: ningún grado de libertad libre.' });
    return empty;
  }

  // Result scaffolding.
  const elements: Solver2DElementResult[] = am.elements.map((el) => {
    const g = geo.get(el.id)!;
    return {
      elementId: el.id,
      designMemberId: el.designMemberId,
      L: g.L,
      angle: g.angle,
      samples: { xs: linspace(0, g.L, samplesN), N: {}, V: {}, M: {}, w: {}, u: {} },
    };
  });

  const reactionsByNode = new Map<string, { Rx: number; Ry: number; Mr: number }>();
  const reactionsByLc: Record<string, Reaction2D[]> = {};
  const displacementsByLc: Record<string, Record<string, NodeDisplacement2D>> = {};

  const Kff = subMatrix(K, freeDofs, freeDofs);

  for (const lcCase of am.loadCases) {
    const F = assembleF(am, dofMap, geo, lcCase, N, errors);
    const Ff = freeDofs.map((d) => F[d]);

    let u_f: number[];
    try {
      u_f = gaussSolve(Kff, Ff, pivotEps);
    } catch {
      errors.push({
        severity: 'fail',
        code: 'SINGULAR_MATRIX',
        msg: `Estructura inestable (mecanismo) en hipótesis '${lcCase.lc}': la matriz de rigidez es singular.`,
      });
      continue;
    }

    const u = new Array<number>(N).fill(0);
    for (let i = 0; i < freeDofs.length; i++) u[freeDofs[i]] = u_f[i];

    // Reactions: R = K·u − F at fixed DOFs (positive in +DOF direction).
    const lcBucket = new Map<string, { Rx: number; Ry: number; Mr: number }>();
    for (const d of fixedDofs) {
      const r = matrixRowDot(K[d], u) - F[d];
      const node = dofMap.dofNode[d];
      const kind = dofMap.dofKind[d];
      const acc = reactionsByNode.get(node) ?? { Rx: 0, Ry: 0, Mr: 0 };
      const accLc = lcBucket.get(node) ?? { Rx: 0, Ry: 0, Mr: 0 };
      if (kind === 'u') { acc.Rx += r; accLc.Rx += r; }
      else if (kind === 'v') { acc.Ry += r; accLc.Ry += r; }
      else { acc.Mr += r; accLc.Mr += r; }
      reactionsByNode.set(node, acc);
      lcBucket.set(node, accLc);
    }
    reactionsByLc[lcCase.lc] = am.nodes
      .filter((n) => lcBucket.has(n.id))
      .map((n) => ({ node: n.id, x: n.x, y: n.y, ...lcBucket.get(n.id)! }));

    // Nodal displacements.
    const disp: Record<string, NodeDisplacement2D> = {};
    for (const n of am.nodes) {
      const thetaDof = dofMap.nodeSharedTheta[n.id];
      disp[n.id] = {
        ux: u[dofMap.nodeU[n.id]],
        uy: u[dofMap.nodeV[n.id]],
        theta: thetaDof !== undefined ? u[thetaDof] : null,
      };
    }
    displacementsByLc[lcCase.lc] = disp;

    // Internal-force recovery + sampling.
    for (let ei = 0; ei < am.elements.length; ei++) {
      const el = am.elements[ei];
      const g = geo.get(el.id)!;
      const out = elements[ei].samples;
      const q = lcCase.q[ei] ?? { qx: 0, qy: 0 };
      if (el.elementType === 'two-force') {
        sampleTwoForce(el, g, dofMap, u, samplesN, lcCase.lc, out);
      } else {
        sampleBeamColumn(el, g, dofMap, u, q.qx, q.qy, samplesN, lcCase.lc, out);
      }
    }

    // Global force equilibrium: ΣF_applied + ΣR ≈ 0 (per axis).
    let appFx = 0;
    let appFy = 0;
    for (const nl of lcCase.nodeLoads) { appFx += nl.Fx; appFy += nl.Fy; }
    for (let ei = 0; ei < am.elements.length; ei++) {
      const q = lcCase.q[ei];
      if (!q) continue;
      const g = geo.get(am.elements[ei].id)!;
      appFx += (g.c * q.qx - g.s * q.qy) * g.L;
      appFy += (g.s * q.qx + g.c * q.qy) * g.L;
    }
    let reactFx = 0;
    let reactFy = 0;
    for (const r of lcBucket.values()) { reactFx += r.Rx; reactFy += r.Ry; }
    const scale = Math.max(1, Math.abs(appFx), Math.abs(appFy));
    if (Math.abs(appFx + reactFx) > equilEps * scale || Math.abs(appFy + reactFy) > equilEps * scale) {
      errors.push({
        severity: 'warn',
        code: 'EQUILIBRIUM_VIOLATION',
        msg: `Hipótesis '${lcCase.lc}': desequilibrio ΣF=(${(appFx + reactFx).toFixed(3)}, ${(appFy + reactFy).toFixed(3)}) kN.`,
      });
    }
  }

  const reactions: Reaction2D[] = am.nodes
    .filter((n) => reactionsByNode.has(n.id))
    .map((n) => ({ node: n.id, x: n.x, y: n.y, ...reactionsByNode.get(n.id)! }));

  return { elements, reactions, reactionsByLc, displacementsByLc, errors };
}

// ── DOF map ─────────────────────────────────────────────────────────────────

interface Dof2DMap {
  total: number;
  nodeU: Record<string, number>;
  nodeV: Record<string, number>;
  /** Shared θ cluster per node (only where a continuous beam-column end lands). */
  nodeSharedTheta: Record<string, number | undefined>;
  /** Global DOF list per element: 6 for beam-column, 4 for two-force. */
  elementDofs: Record<string, number[]>;
  dofNode: string[];
  dofKind: ('u' | 'v' | 'theta')[];
}

function buildDofMap(am: Analysis2DModel): Dof2DMap {
  const nodeU: Record<string, number> = {};
  const nodeV: Record<string, number> = {};
  const nodeSharedTheta: Record<string, number | undefined> = {};
  const elementDofs: Record<string, number[]> = {};
  const dofNode: string[] = [];
  const dofKind: ('u' | 'v' | 'theta')[] = [];

  const alloc = (node: string, kind: 'u' | 'v' | 'theta'): number => {
    dofNode.push(node);
    dofKind.push(kind);
    return dofNode.length - 1;
  };

  for (const n of am.nodes) {
    nodeU[n.id] = alloc(n.id, 'u');
    nodeV[n.id] = alloc(n.id, 'v');
  }

  const sharedTheta = (node: string): number => {
    let d = nodeSharedTheta[node];
    if (d === undefined) {
      d = alloc(node, 'theta');
      nodeSharedTheta[node] = d;
    }
    return d;
  };

  for (const el of am.elements) {
    if (el.elementType === 'two-force') {
      elementDofs[el.id] = [nodeU[el.i], nodeV[el.i], nodeU[el.j], nodeV[el.j]];
      continue;
    }
    const thetaI = el.releaseI ? alloc(el.i, 'theta') : sharedTheta(el.i);
    const thetaJ = el.releaseJ ? alloc(el.j, 'theta') : sharedTheta(el.j);
    elementDofs[el.id] = [nodeU[el.i], nodeV[el.i], thetaI, nodeU[el.j], nodeV[el.j], thetaJ];
  }

  return { total: dofNode.length, nodeU, nodeV, nodeSharedTheta, elementDofs, dofNode, dofKind };
}

// ── Element matrices ────────────────────────────────────────────────────────

/** Beam-column local 6×6 (see header diagram). Exported for unit tests. */
export function beamColumnLocalK(EA: number, EI: number, L: number): number[][] {
  const a = EA / L;
  const b12 = (12 * EI) / (L * L * L);
  const b6 = (6 * EI) / (L * L);
  const b4 = (4 * EI) / L;
  const b2 = (2 * EI) / L;
  return [
    [ a,    0,    0,   -a,    0,    0  ],
    [ 0,   b12,  b6,    0,  -b12,  b6  ],
    [ 0,   b6,   b4,    0,  -b6,   b2  ],
    [-a,    0,    0,    a,    0,    0  ],
    [ 0,  -b12, -b6,    0,   b12, -b6  ],
    [ 0,   b6,   b2,    0,  -b6,   b4  ],
  ];
}

/** Local→global congruence transform for the 6-DOF element. Exported for tests. */
export function beamColumnGlobalK(EA: number, EI: number, L: number, c: number, s: number): number[][] {
  const Kl = beamColumnLocalK(EA, EI, L);
  // T maps global→local: block-diag of [c s 0; −s c 0; 0 0 1] per node.
  // K_g = Tᵀ · K_l · T, expanded index-wise for clarity-free speed.
  const T = transform6(c, s);
  return congruence(Kl, T);
}

/** Two-force global 4×4 on [u_i, v_i, u_j, v_j]. Exported for tests. */
export function twoForceGlobalK(EA: number, L: number, c: number, s: number): number[][] {
  const k = EA / L;
  const cc = k * c * c;
  const cs = k * c * s;
  const ss = k * s * s;
  return [
    [ cc,  cs, -cc, -cs],
    [ cs,  ss, -cs, -ss],
    [-cc, -cs,  cc,  cs],
    [-cs, -ss,  cs,  ss],
  ];
}

function transform6(c: number, s: number): number[][] {
  return [
    [ c,  s, 0,  0, 0, 0],
    [-s,  c, 0,  0, 0, 0],
    [ 0,  0, 1,  0, 0, 0],
    [ 0,  0, 0,  c, s, 0],
    [ 0,  0, 0, -s, c, 0],
    [ 0,  0, 0,  0, 0, 1],
  ];
}

/** Tᵀ·K·T for small dense matrices. */
function congruence(K: number[][], T: number[][]): number[][] {
  const n = K.length;
  const KT: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sAcc = 0;
      for (let k = 0; k < n; k++) sAcc += K[i][k] * T[k][j];
      KT[i][j] = sAcc;
    }
  }
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sAcc = 0;
      for (let k = 0; k < n; k++) sAcc += T[k][i] * KT[k][j];
      out[i][j] = sAcc;
    }
  }
  return out;
}

// ── Assembly ────────────────────────────────────────────────────────────────

function assembleK(
  am: Analysis2DModel,
  dofMap: Dof2DMap,
  geo: Map<string, { L: number; c: number; s: number }>,
): number[][] {
  const N = dofMap.total;
  const K: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (const el of am.elements) {
    const g = geo.get(el.id)!;
    const Ke = el.elementType === 'two-force'
      ? twoForceGlobalK(el.EA, g.L, g.c, g.s)
      : beamColumnGlobalK(el.EA, el.EI, g.L, g.c, g.s);
    const dofs = dofMap.elementDofs[el.id];
    for (let i = 0; i < dofs.length; i++) {
      for (let j = 0; j < dofs.length; j++) {
        K[dofs[i]][dofs[j]] += Ke[i][j];
      }
    }
  }
  return K;
}

/**
 * Consistent equivalent nodal loads for constant LOCAL (qx, qy) on a
 * beam-column element, LOCAL axes (forces ON the structure at the nodes):
 *   [qx·L/2, qy·L/2, +qy·L²/12, qx·L/2, qy·L/2, −qy·L²/12]
 * Matches the 1D fixedEndForces transverse pattern. Exported for tests.
 */
export function beamColumnFeq(qx: number, qy: number, L: number): number[] {
  return [
    (qx * L) / 2,
    (qy * L) / 2,
    (qy * L * L) / 12,
    (qx * L) / 2,
    (qy * L) / 2,
    -(qy * L * L) / 12,
  ];
}

function assembleF(
  am: Analysis2DModel,
  dofMap: Dof2DMap,
  geo: Map<string, { L: number; c: number; s: number }>,
  lcCase: Analysis2DLoadCase,
  N: number,
  errors: ModelError[],
): number[] {
  const F = new Array<number>(N).fill(0);

  for (let ei = 0; ei < am.elements.length; ei++) {
    const q = lcCase.q[ei];
    if (!q || (q.qx === 0 && q.qy === 0)) continue;
    const el = am.elements[ei];
    const g = geo.get(el.id)!;
    const feqLocal = beamColumnFeq(q.qx, q.qy, g.L);
    // Global nodal forces: F_g = Tᵀ · F_l  → per node block:
    //   Fx = c·fx_l − s·fy_l ; Fy = s·fx_l + c·fy_l ; M unchanged.
    const dofs = dofMap.elementDofs[el.id];
    F[dofs[0]] += g.c * feqLocal[0] - g.s * feqLocal[1];
    F[dofs[1]] += g.s * feqLocal[0] + g.c * feqLocal[1];
    F[dofs[2]] += feqLocal[2];
    F[dofs[3]] += g.c * feqLocal[3] - g.s * feqLocal[4];
    F[dofs[4]] += g.s * feqLocal[3] + g.c * feqLocal[4];
    F[dofs[5]] += feqLocal[5];
  }

  for (const nl of lcCase.nodeLoads) {
    const uDof = dofMap.nodeU[nl.node];
    const vDof = dofMap.nodeV[nl.node];
    if (uDof === undefined || vDof === undefined) {
      errors.push({ severity: 'warn', code: 'LOAD_NODE_MISSING', msg: `Carga en nodo inexistente '${nl.node}'.` });
      continue;
    }
    F[uDof] += nl.Fx;
    F[vDof] += nl.Fy;
    if (nl.M) {
      const thetaDof = dofMap.nodeSharedTheta[nl.node];
      if (thetaDof !== undefined) F[thetaDof] += nl.M;
      else errors.push({ severity: 'warn', code: 'MOMENT_ON_PIN', msg: `Momento nodal en '${nl.node}' ignorado (nodo sin rigidez a giro).` });
    }
  }

  return F;
}

function applyBCs(am: Analysis2DModel, dofMap: Dof2DMap): { fixedDofs: number[]; freeDofs: number[] } {
  const fixed = new Set<number>();
  for (const bc of am.bcs) {
    if (bc.fixX) {
      const d = dofMap.nodeU[bc.node];
      if (d !== undefined) fixed.add(d);
    }
    if (bc.fixY) {
      const d = dofMap.nodeV[bc.node];
      if (d !== undefined) fixed.add(d);
    }
    if (bc.fixRot) {
      // Only the shared cluster: released ends keep their hinge (see analysis.ts).
      const d = dofMap.nodeSharedTheta[bc.node];
      if (d !== undefined) fixed.add(d);
    }
  }
  const fixedDofs = Array.from(fixed).sort((a, b) => a - b);
  const freeDofs: number[] = [];
  for (let i = 0; i < dofMap.total; i++) if (!fixed.has(i)) freeDofs.push(i);
  return { fixedDofs, freeDofs };
}

// ── Recovery & sampling ─────────────────────────────────────────────────────

function sampleBeamColumn(
  el: Analysis2DElement,
  g: { L: number; c: number; s: number },
  dofMap: Dof2DMap,
  u: number[],
  qx: number,
  qy: number,
  samplesN: number,
  lc: string,
  out: Element2DSamples,
): void {
  const { L, c, s } = g;
  const dofs = dofMap.elementDofs[el.id];
  const ug = dofs.map((d) => u[d]); // [u_i, v_i, θ_i, u_j, v_j, θ_j] global
  // Global → local per node block.
  const ul = [
    c * ug[0] + s * ug[1],
    -s * ug[0] + c * ug[1],
    ug[2],
    c * ug[3] + s * ug[4],
    -s * ug[3] + c * ug[4],
    ug[5],
  ];
  const Kl = beamColumnLocalK(el.EA, el.EI, L);
  const Feq = beamColumnFeq(qx, qy, L);
  // S = K_l·u_l − F_eq: end forces the nodes apply to the element (local).
  const S = Kl.map((row, r) => matrixRowDot(row, ul) - Feq[r]);

  const [uiL, viL, thI, ujL, vjL, thJ] = ul;
  const Ns = new Array<number>(samplesN);
  const Vs = new Array<number>(samplesN);
  const Ms = new Array<number>(samplesN);
  const ws = new Array<number>(samplesN);
  const us = new Array<number>(samplesN);
  for (let i = 0; i < samplesN; i++) {
    const x = (L * i) / (samplesN - 1);
    const xi = x / L;
    Ns[i] = -(S[0] + qx * x);
    Vs[i] = S[1] + qy * x;
    Ms[i] = -S[2] + S[1] * x + (qy * x * x) / 2;
    // Hermite homogeneous + clamped-clamped particular (exact interiors).
    const N1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;
    const N2 = xi - 2 * xi * xi + xi * xi * xi;
    const N3 = 3 * xi * xi - 2 * xi * xi * xi;
    const N4 = -xi * xi + xi * xi * xi;
    const wp = el.EI > 0 ? (qy * Math.pow(L, 4)) / (24 * el.EI) * xi * xi * (1 - xi) * (1 - xi) : 0;
    ws[i] = N1 * viL + N2 * thI * L + N3 * vjL + N4 * thJ * L + wp;
    const up = el.EA > 0 ? (qx * x * (L - x)) / (2 * el.EA) : 0;
    us[i] = uiL * (1 - xi) + ujL * xi + up;
  }
  out.N[lc] = Ns;
  out.V[lc] = Vs;
  out.M[lc] = Ms;
  out.w[lc] = ws;
  out.u[lc] = us;
}

function sampleTwoForce(
  el: Analysis2DElement,
  g: { L: number; c: number; s: number },
  dofMap: Dof2DMap,
  u: number[],
  samplesN: number,
  lc: string,
  out: Element2DSamples,
): void {
  const { L, c, s } = g;
  const [uiDof, viDof, ujDof, vjDof] = dofMap.elementDofs[el.id];
  // Tension-positive axial from the relative elongation along the axis.
  const Nax = (el.EA / L) * ((u[ujDof] - u[uiDof]) * c + (u[vjDof] - u[viDof]) * s);
  const uiL = c * u[uiDof] + s * u[viDof];
  const viL = -s * u[uiDof] + c * u[viDof];
  const ujL = c * u[ujDof] + s * u[vjDof];
  const vjL = -s * u[ujDof] + c * u[vjDof];
  const Ns = new Array<number>(samplesN).fill(Nax);
  const zero = new Array<number>(samplesN).fill(0);
  const ws = new Array<number>(samplesN);
  const us = new Array<number>(samplesN);
  for (let i = 0; i < samplesN; i++) {
    const xi = i / (samplesN - 1);
    ws[i] = viL * (1 - xi) + vjL * xi;
    us[i] = uiL * (1 - xi) + ujL * xi;
  }
  out.N[lc] = Ns;
  out.V[lc] = zero.slice();
  out.M[lc] = zero.slice();
  out.w[lc] = ws;
  out.u[lc] = us;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function linspace(a: number, b: number, n: number): number[] {
  if (n === 1) return [a];
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / (n - 1);
  return out;
}
