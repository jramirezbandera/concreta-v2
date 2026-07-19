// FEM 2D — analytical validation battery (Lane B, eng-review D13)
//
// This suite is the BLOCKING safety net for the 2D solver: every case has an
// independent closed-form solution (statics, beam formulas, method of joints,
// slope-deflection) computed in the test itself. The portal-frame sway cases
// additionally pin the general solution against rigid/flexible-beam limits
// that do not depend on the test author's sign discipline.
//
// Sign conventions asserted here (they PIN the solver's documented contract):
//   N tension+, V/M in the 1D-compatible sagging convention w.r.t. +y_local,
//   reactions +x/+y world and CCW+ moments, loads signed world components.

import { describe, expect, it } from 'vitest';
import type { Analysis2DElement, Analysis2DLoadCase, Analysis2DModel, Analysis2DNodeLoad } from '../../features/fem2d/analysis';
import {
  beamColumnFeq,
  beamColumnGlobalK,
  beamColumnLocalK,
  solveAnalysis2D,
  twoForceGlobalK,
} from '../../features/fem2d/solver2d';

const EI = 1e4; // kN·m²
const EA = 1e6; // kN

// ── Terse builders ──────────────────────────────────────────────────────────

function el(id: string, i: string, j: string, over: Partial<Analysis2DElement> = {}): Analysis2DElement {
  return { id, designMemberId: id, i, j, elementType: 'beam-column', EA, EI, releaseI: false, releaseJ: false, ...over };
}

function tf(id: string, i: string, j: string, over: Partial<Analysis2DElement> = {}): Analysis2DElement {
  return { id, designMemberId: id, i, j, elementType: 'two-force', EA, EI: 0, releaseI: false, releaseJ: false, ...over };
}

function lcase(
  elements: Analysis2DElement[],
  lc: 'G' | 'Q' | 'W' | 'S' | 'E',
  q: Record<string, { qx?: number; qy?: number }> = {},
  nodeLoads: Analysis2DNodeLoad[] = [],
): Analysis2DLoadCase {
  return {
    lc,
    q: elements.map((e) => ({ qx: q[e.id]?.qx ?? 0, qy: q[e.id]?.qy ?? 0 })),
    nodeLoads,
  };
}

function reaction(bundle: ReturnType<typeof solveAnalysis2D>, lc: string, node: string) {
  const r = bundle.reactionsByLc[lc]?.find((x) => x.node === node);
  expect(r, `reacción en ${node}`).toBeDefined();
  return r!;
}

function noFails(bundle: ReturnType<typeof solveAnalysis2D>) {
  expect(bundle.errors.filter((e) => e.severity === 'fail')).toEqual([]);
  expect(bundle.errors.filter((e) => e.code === 'EQUILIBRIUM_VIOLATION')).toEqual([]);
}

// ── Element matrix invariants ───────────────────────────────────────────────

describe('element matrices', () => {
  const angles = [0, Math.PI / 6, Math.PI / 2, 2.15];

  it('beam-column global K is symmetric and annihilates rigid-body motion', () => {
    for (const a of angles) {
      const L = 5;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const K = beamColumnGlobalK(EA, EI, L, c, s);
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) expect(K[i][j]).toBeCloseTo(K[j][i], 6);
      }
      // Nodes at (0,0) and (L·c, L·s); rigid rotation φ about origin moves a
      // point (x,y) by (−y·φ, x·φ) with section rotation φ.
      const xi = 0, yi = 0, xj = L * c, yj = L * s;
      const modes = [
        [1, 0, 0, 1, 0, 0],
        [0, 1, 0, 0, 1, 0],
        [-yi, xi, 1, -yj, xj, 1],
      ];
      for (const m of modes) {
        for (let r = 0; r < 6; r++) {
          const f = K[r].reduce((acc, kij, jx) => acc + kij * m[jx], 0);
          expect(Math.abs(f)).toBeLessThan(1e-6 * EA);
        }
      }
    }
  });

  it('two-force global K is symmetric and annihilates translations + ⊥ motion', () => {
    for (const a of angles) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const K = twoForceGlobalK(EA, 4, c, s);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) expect(K[i][j]).toBeCloseTo(K[j][i], 8);
      }
      for (const m of [[1, 0, 1, 0], [0, 1, 0, 1], [-s, c, -s, c]]) {
        for (let r = 0; r < 4; r++) {
          const f = K[r].reduce((acc, kij, jx) => acc + kij * m[jx], 0);
          expect(Math.abs(f)).toBeLessThan(1e-6 * EA);
        }
      }
    }
  });

  it('local K matches the closed-form entries and Feq the qL/2 · qL²/12 pattern', () => {
    const K = beamColumnLocalK(EA, EI, 2);
    expect(K[0][0]).toBeCloseTo(EA / 2, 9);
    expect(K[1][1]).toBeCloseTo((12 * EI) / 8, 9);
    expect(K[2][2]).toBeCloseTo((4 * EI) / 2, 9);
    expect(K[2][5]).toBeCloseTo((2 * EI) / 2, 9);
    const feq = beamColumnFeq(4, -10, 2);
    expect(feq[0]).toBeCloseTo(4, 12);
    expect(feq[1]).toBeCloseTo(-10, 12);
    expect(feq[2]).toBeCloseTo(-10 / 3, 12);
    expect(feq[3]).toBeCloseTo(4, 12);
    expect(feq[4]).toBeCloseTo(-10, 12);
    expect(feq[5]).toBeCloseTo(10 / 3, 12);
  });
});

// ── A/B: vertical cantilever (the member class the 1D decompose dropped) ────

describe('vertical cantilever column', () => {
  const nodes = [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 0, y: 3 }];
  const elements = [el('c1', 'n1', 'n2')];
  const bcs = [{ node: 'n1', fixX: true, fixY: true, fixRot: true }];

  it('A: horizontal tip load — δ=PH³/3EI, Rx=−P, Mr=+P·H, V/M diagrams', () => {
    const am: Analysis2DModel = {
      nodes, elements, bcs,
      loadCases: [lcase(elements, 'W', {}, [{ node: 'n2', Fx: 10, Fy: 0 }])],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    const d = r.displacementsByLc.W.n2;
    expect(d.ux).toBeCloseTo((10 * 27) / (3 * EI), 10);        // 0.009 m
    expect(d.uy).toBeCloseTo(0, 12);
    expect(d.theta).toBeCloseTo(-(10 * 9) / (2 * EI), 10);     // −0.0045 rad
    const base = reaction(r, 'W', 'n1');
    expect(base.Rx).toBeCloseTo(-10, 9);
    expect(base.Ry).toBeCloseTo(0, 9);
    expect(base.Mr).toBeCloseTo(+30, 9);
    const s = r.elements[0].samples;
    expect(s.V.W[0]).toBeCloseTo(10, 9);
    expect(s.V.W.at(-1)!).toBeCloseTo(10, 9);
    expect(s.M.W[0]).toBeCloseTo(-30, 9);
    expect(s.M.W.at(-1)!).toBeCloseTo(0, 9);
    expect(Math.max(...s.N.W.map(Math.abs))).toBeLessThan(1e-9);
  });

  it('B: axial tip load — δ=PH/EA, N=−P constant, Ry=+P', () => {
    const am: Analysis2DModel = {
      nodes, elements, bcs,
      loadCases: [lcase(elements, 'G', {}, [{ node: 'n2', Fx: 0, Fy: -100 }])],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    expect(r.displacementsByLc.G.n2.uy).toBeCloseTo(-(100 * 3) / EA, 12);
    const base = reaction(r, 'G', 'n1');
    expect(base.Ry).toBeCloseTo(100, 9);
    const N = r.elements[0].samples.N.G;
    for (const n of N) expect(n).toBeCloseTo(-100, 9);
  });

  it('B2 (auditoría F3): DISTRIBUTED axial (self-weight) — N(x) linear −wH → 0', () => {
    // Column height H=3, local x runs UP, self-weight w=5 kN/m acts along
    // −x_local (qx = −w). Closed form: N(x) = −w·(H−x) (compression fading to
    // zero at the free top), Ry = wH, tip shortening = −wH²/(2EA).
    const w = 5;
    const am: Analysis2DModel = {
      nodes, elements, bcs,
      loadCases: [lcase(elements, 'G', { c1: { qx: -w } })],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    const s = r.elements[0].samples;
    const last = s.xs.length - 1;
    const mid = last / 2;
    expect(s.N.G[0]).toBeCloseTo(-w * 3, 9);
    expect(s.N.G[mid]).toBeCloseTo(-w * 1.5, 9);
    expect(s.N.G[last]).toBeCloseTo(0, 9);
    expect(reaction(r, 'G', 'n1').Ry).toBeCloseTo(w * 3, 9);
    expect(r.displacementsByLc.G.n2.uy).toBeCloseTo(-(w * 9) / (2 * EA), 12);
  });
});

// ── C/D: simply supported — horizontal, inclined, rotation invariance ───────

describe('simply supported beams', () => {
  it('C: horizontal SS + UDL — M=qL²/8, V=±qL/2, δmid exact (particular term)', () => {
    const nodes = [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 6, y: 0 }];
    const elements = [el('b1', 'n1', 'n2')];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [
        { node: 'n1', fixX: true, fixY: true, fixRot: false },
        { node: 'n2', fixX: false, fixY: true, fixRot: false },
      ],
      loadCases: [lcase(elements, 'G', { b1: { qy: -25 } })],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    const s = r.elements[0].samples;
    const mid = (s.xs.length - 1) / 2;
    expect(s.M.G[mid]).toBeCloseTo((25 * 36) / 8, 9);            // 112.5 sagging
    expect(s.V.G[0]).toBeCloseTo(75, 9);
    expect(s.V.G.at(-1)!).toBeCloseTo(-75, 9);
    expect(s.w.G[mid]).toBeCloseTo(-(5 * 25 * 1296) / (384 * EI), 10); // exact interior
    expect(reaction(r, 'G', 'n1').Ry).toBeCloseTo(75, 9);
    expect(reaction(r, 'G', 'n2').Ry).toBeCloseTo(75, 9);
  });

  it('D: inclined SS (3-4-5) + LOCAL transverse UDL — statics-exact reactions, N tension, M=wL²/8', () => {
    // Member (0,0)→(4,3), L=5, local qy=−10. Hand statics: resultant global
    // (30, −40) at midpoint (2, 1.5); roller (vertical) at j: Ry_j = 31.25;
    // pin at i: Rx=−30, Ry=8.75. Axial from end-reaction projections: +18.75
    // TENSION (the elevated vertical roller pulls the member up-slope).
    const nodes = [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 4, y: 3 }];
    const elements = [el('b1', 'n1', 'n2')];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [
        { node: 'n1', fixX: true, fixY: true, fixRot: false },
        { node: 'n2', fixX: false, fixY: true, fixRot: false },
      ],
      loadCases: [lcase(elements, 'G', { b1: { qy: -10 } })],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    const ri = reaction(r, 'G', 'n1');
    const rj = reaction(r, 'G', 'n2');
    expect(ri.Rx).toBeCloseTo(-30, 9);
    expect(ri.Ry).toBeCloseTo(8.75, 9);
    expect(rj.Ry).toBeCloseTo(31.25, 9);
    const s = r.elements[0].samples;
    const mid = (s.xs.length - 1) / 2;
    expect(s.M.G[mid]).toBeCloseTo((10 * 25) / 8, 9);   // 31.25
    expect(s.V.G[0]).toBeCloseTo(25, 9);                 // wL/2
    for (const n of s.N.G) expect(n).toBeCloseTo(18.75, 9); // constant tension
  });

  it('D2: rotation invariance — local samples identical at any orientation', () => {
    const build = (x2: number, y2: number): Analysis2DModel => {
      const nodes = [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: x2, y: y2 }];
      const elements = [el('b1', 'n1', 'n2')];
      return {
        nodes, elements,
        bcs: [
          { node: 'n1', fixX: true, fixY: true, fixRot: false },
          { node: 'n2', fixX: false, fixY: true, fixRot: false },
        ],
        loadCases: [lcase(elements, 'G', { b1: { qy: -25 } })],
      };
    };
    // Same L=6 member: horizontal vs rotated (3-4-5 scaled: 4.8, 3.6).
    // The vertical roller is NOT orientation-equivalent for reactions, but
    // the LOCAL flexural response to a LOCAL load — M and V — must match the
    // wL²/8 family exactly; w differs only through axial-coupled support
    // movement, absent here (v_local at both ends stays 0).
    const flat = solveAnalysis2D(build(6, 0));
    const tilted = solveAnalysis2D(build(4.8, 3.6));
    noFails(flat);
    noFails(tilted);
    const a = flat.elements[0].samples;
    const b = tilted.elements[0].samples;
    const mid = (a.xs.length - 1) / 2;
    expect(b.M.G[mid]).toBeCloseTo(a.M.G[mid], 8);
    expect(b.V.G[0]).toBeCloseTo(a.V.G[0], 8);
    expect(b.M.G[0]).toBeCloseTo(0, 8);
    expect(b.M.G.at(-1)!).toBeCloseTo(0, 8);
  });
});

// ── E/F: trusses and mixed structures ───────────────────────────────────────

describe('two-force elements', () => {
  it('E: triangle truss — method-of-joints member forces, no θ DOFs anywhere', () => {
    // A(0,0) pinned, B(4,0) roller, C(2,1.5) apex, P=12 down at C.
    // Joints: F_AC = F_BC = −P/(2·sinθ) = −10 (compression, sinθ=0.6);
    // F_AB = +8 (tension).
    const nodes = [
      { id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }, { id: 'C', x: 2, y: 1.5 },
    ];
    const elements = [tf('AC', 'A', 'C'), tf('BC', 'B', 'C'), tf('AB', 'A', 'B')];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [
        { node: 'A', fixX: true, fixY: true, fixRot: false },
        { node: 'B', fixX: false, fixY: true, fixRot: false },
      ],
      loadCases: [lcase(elements, 'G', {}, [{ node: 'C', Fx: 0, Fy: -12 }])],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    const byId = new Map(r.elements.map((e) => [e.elementId, e]));
    expect(byId.get('AC')!.samples.N.G[0]).toBeCloseTo(-10, 9);
    expect(byId.get('BC')!.samples.N.G[0]).toBeCloseTo(-10, 9);
    expect(byId.get('AB')!.samples.N.G[0]).toBeCloseTo(+8, 9);
    expect(reaction(r, 'G', 'A').Ry).toBeCloseTo(6, 9);
    expect(reaction(r, 'G', 'B').Ry).toBeCloseTo(6, 9);
    expect(reaction(r, 'G', 'A').Rx).toBeCloseTo(0, 9);
  });

  it('F: cantilever propped by a vertical two-force hanger — elastic-support closed form', () => {
    // Beam A(0,0 fixed)→B(4,0), UDL w=10 down; rod B→C(4,3), C pinned support,
    // EA_rod = 2e5. Compatibility: T = (wL⁴/8EI) / (L³/3EI + Lr/EA_r).
    const w = 10, L = 4, Lr = 3, EAr = 2e5;
    const T = ((w * L ** 4) / (8 * EI)) / ((L ** 3) / (3 * EI) + Lr / EAr);
    const nodes = [
      { id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }, { id: 'C', x: 4, y: 3 },
    ];
    const elements = [el('beam', 'A', 'B'), tf('rod', 'B', 'C', { EA: EAr })];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [
        { node: 'A', fixX: true, fixY: true, fixRot: true },
        { node: 'C', fixX: true, fixY: true, fixRot: false },
      ],
      loadCases: [lcase(elements, 'G', { beam: { qy: -w } })],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    const byId = new Map(r.elements.map((e) => [e.elementId, e]));
    expect(byId.get('rod')!.samples.N.G[0]).toBeCloseTo(T, 8);          // tension
    expect(r.displacementsByLc.G.B.uy).toBeCloseTo(-(T * Lr) / EAr, 10); // rod stretch
    expect(byId.get('beam')!.samples.M.G[0]).toBeCloseTo(-(w * L * L) / 2 + T * L, 8);
    expect(reaction(r, 'G', 'A').Ry).toBeCloseTo(w * L - T, 8);
    expect(reaction(r, 'G', 'C').Ry).toBeCloseTo(T, 8);
  });
});

// ── G/H/I: portal frames vs slope-deflection ────────────────────────────────

describe('portal frames (slope-deflection oracle)', () => {
  const h = 4, L = 6, EIc = 2e4, EIb = 3e4;
  // Axially near-rigid members: the slope-deflection oracle assumes no axial
  // deformation, so EA is cranked until the residual (beam-thrust shortening
  // bending the columns, ~6EI_c·δ/h²) sits well under the assert precision.
  const EArigid = 1e10;
  const portal = (EIbeam: number): { nodes: Analysis2DModel['nodes']; elements: Analysis2DElement[] } => ({
    nodes: [
      { id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: h },
      { id: 'C', x: L, y: h }, { id: 'D', x: L, y: 0 },
    ],
    elements: [
      el('colL', 'A', 'B', { EI: EIc, EA: EArigid }),
      el('beam', 'B', 'C', { EI: EIbeam, EA: EArigid }),
      el('colR', 'D', 'C', { EI: EIc, EA: EArigid }),
    ],
  });
  const fixedBases = [
    { node: 'A', fixX: true, fixY: true, fixRot: true },
    { node: 'D', fixX: true, fixY: true, fixRot: true },
  ];

  it('G: symmetric UDL, no sway — corner/base/midspan moments from slope-deflection', () => {
    const w = 20;
    const { nodes, elements } = portal(EIb);
    const am: Analysis2DModel = {
      nodes, elements, bcs: fixedBases,
      loadCases: [lcase(elements, 'G', { beam: { qy: -w } })],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    // Slope-deflection (θ_C = −θ_B, no sway):
    //   θ_B·(4EI_c/h + 2EI_b/L) = wL²/12  → M_corner = (4EI_c/h)·θ_B, base = half.
    const thetaB = (w * L * L / 12) / ((4 * EIc) / h + (2 * EIb) / L);
    const Mcorner = ((4 * EIc) / h) * thetaB;  // 40
    const Mbase = Mcorner / 2;                  // 20
    const byId = new Map(r.elements.map((e) => [e.elementId, e]));
    const beam = byId.get('beam')!.samples;
    const mid = (beam.xs.length - 1) / 2;
    expect(beam.M.G[0]).toBeCloseTo(-Mcorner, 3);                 // hogging corners
    expect(beam.M.G.at(-1)!).toBeCloseTo(-Mcorner, 3);
    expect(beam.M.G[mid]).toBeCloseTo((w * L * L) / 8 - Mcorner, 3); // 50 sagging
    const colL = byId.get('colL')!.samples;
    expect(Math.abs(colL.M.G[0])).toBeCloseTo(Mbase, 3);
    expect(Math.abs(colL.M.G.at(-1)!)).toBeCloseTo(Mcorner, 3);
    // Reactions: Ry = wL/2 each; |Rx| = (M_base + M_corner)/h, antisymmetric; no sway.
    expect(reaction(r, 'G', 'A').Ry).toBeCloseTo((w * L) / 2, 6);
    expect(reaction(r, 'G', 'D').Ry).toBeCloseTo((w * L) / 2, 6);
    expect(Math.abs(reaction(r, 'G', 'A').Rx)).toBeCloseTo((Mbase + Mcorner) / h, 3);
    expect(reaction(r, 'G', 'A').Rx).toBeCloseTo(-reaction(r, 'G', 'D').Rx, 6);
    expect(Math.abs(r.displacementsByLc.G.B.ux)).toBeLessThan(1e-7);
  });

  it('H: sway limits — Δ→Hh³/24EIc (rigid beam) and Δ→Hh³/6EIc (EI_b→0)', () => {
    const H = 10;
    for (const [EIbeam, expected, tol] of [
      [1e12, (H * h ** 3) / (24 * EIc), 1e-5],
      [1e-3, (H * h ** 3) / (6 * EIc), 1e-4],
    ] as const) {
      const { nodes, elements } = portal(EIbeam);
      const am: Analysis2DModel = {
        nodes, elements, bcs: fixedBases,
        loadCases: [lcase(elements, 'W', {}, [{ node: 'B', Fx: H, Fy: 0 }])],
      };
      const r = solveAnalysis2D(am);
      noFails(r);
      const delta = r.displacementsByLc.W.B.ux;
      expect(Math.abs(delta - expected) / expected).toBeLessThan(tol);
      // Both column tops translate together (axially rigid beam).
      expect(r.displacementsByLc.W.C.ux).toBeCloseTo(delta, 8);
    }
  });

  it('I: general sway — Δ and column end moments from the 2×2 slope-deflection system', () => {
    const H = 10;
    const alpha = EIc / h;   // 5000
    const beta = EIb / L;    // 5000
    // eq1 (joint):  (4α+6β)θ − (6α/h)Δ = 0
    // eq2 (story):  (12α/h)θ − (24α/h²)Δ = −H
    const a11 = 4 * alpha + 6 * beta;
    const a12 = -(6 * alpha) / h;
    const a21 = (12 * alpha) / h;
    const a22 = -(24 * alpha) / (h * h);
    const det = a11 * a22 - a12 * a21;
    const theta = (a12 * H) / det;    // [a11 a12; a21 a22]·[θ,Δ] = [0, −H]
    const delta = (-a11 * H) / det;
    expect(delta).toBeGreaterThan(0); // sanity of the oracle itself
    const M_BA = 4 * alpha * theta - ((6 * alpha) / h) * delta; // corner
    const M_AB = 2 * alpha * theta - ((6 * alpha) / h) * delta; // base

    const { nodes, elements } = portal(EIb);
    const am: Analysis2DModel = {
      nodes, elements, bcs: fixedBases,
      loadCases: [lcase(elements, 'W', {}, [{ node: 'B', Fx: H, Fy: 0 }])],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    expect(r.displacementsByLc.W.B.ux).toBeCloseTo(delta, 8);
    const colL = new Map(r.elements.map((e) => [e.elementId, e])).get('colL')!.samples;
    expect(Math.abs(colL.M.W[0])).toBeCloseTo(Math.abs(M_AB), 4);
    expect(Math.abs(colL.M.W.at(-1)!)).toBeCloseTo(Math.abs(M_BA), 4);
    // Story shear closes: Σ|Rx| = H.
    const RxA = reaction(r, 'W', 'A').Rx;
    const RxD = reaction(r, 'W', 'D').Rx;
    expect(RxA + RxD).toBeCloseTo(-H, 8);
  });
});

// ── J: internal hinge (duplicate-θ-DOF release) ─────────────────────────────

describe('internal hinge', () => {
  it('J: fixed-fixed beam with center hinge + UDL — twin cantilevers', () => {
    const w = 10, l = 4; // half length
    const nodes = [
      { id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }, { id: 'C', x: 8, y: 0 },
    ];
    const elements = [el('e1', 'A', 'B', { releaseJ: true }), el('e2', 'B', 'C')];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [
        { node: 'A', fixX: true, fixY: true, fixRot: true },
        { node: 'C', fixX: true, fixY: true, fixRot: true },
      ],
      loadCases: [lcase(elements, 'G', { e1: { qy: -w }, e2: { qy: -w } })],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    const byId = new Map(r.elements.map((e) => [e.elementId, e]));
    const s1 = byId.get('e1')!.samples;
    const s2 = byId.get('e2')!.samples;
    expect(s1.M.G[0]).toBeCloseTo(-(w * l * l) / 2, 8);   // −80 hogging at A
    expect(s2.M.G.at(-1)!).toBeCloseTo(-(w * l * l) / 2, 8);
    expect(s1.M.G.at(-1)!).toBeCloseTo(0, 8);             // hinge: M = 0
    expect(s2.M.G[0]).toBeCloseTo(0, 8);
    expect(s1.V.G.at(-1)!).toBeCloseTo(0, 8);             // symmetric: V hinge = 0
    expect(r.displacementsByLc.G.B.uy).toBeCloseTo(-(w * l ** 4) / (8 * EI), 9);
    expect(reaction(r, 'G', 'A').Ry).toBeCloseTo(w * l, 8);
    expect(reaction(r, 'G', 'A').Mr).toBeCloseTo(+(w * l * l) / 2, 8);
    expect(reaction(r, 'G', 'C').Mr).toBeCloseTo(-(w * l * l) / 2, 8);
  });
});

// ── M: applied nodal moment ─────────────────────────────────────────────────

describe('nodal moment', () => {
  it('M: cantilever tip moment — θ=ML/EI, δ=ML²/2EI upward for CCW M', () => {
    const M = 5, L = 3;
    const nodes = [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 3, y: 0 }];
    const elements = [el('e1', 'A', 'B')];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [{ node: 'A', fixX: true, fixY: true, fixRot: true }],
      loadCases: [{ lc: 'G', q: [{ qx: 0, qy: 0 }], nodeLoads: [{ node: 'B', Fx: 0, Fy: 0, M }] }],
    };
    const r = solveAnalysis2D(am);
    noFails(r);
    expect(r.displacementsByLc.G.B.theta).toBeCloseTo((M * L) / EI, 10);
    expect(r.displacementsByLc.G.B.uy).toBeCloseTo((M * L * L) / (2 * EI), 10);
    expect(reaction(r, 'G', 'A').Mr).toBeCloseTo(-M, 9);
  });
});

// ── K/L/N/O: degenerate models fail loudly, never silently ──────────────────

describe('mechanism & guard rails', () => {
  it('K1: beam with no horizontal restraint → SINGULAR_MATRIX, no crash', () => {
    const nodes = [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 6, y: 0 }];
    const elements = [el('b1', 'n1', 'n2')];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [
        { node: 'n1', fixX: false, fixY: true, fixRot: false },
        { node: 'n2', fixX: false, fixY: true, fixRot: false },
      ],
      loadCases: [lcase(elements, 'G', { b1: { qy: -10 } })],
    };
    const r = solveAnalysis2D(am);
    expect(r.errors.some((e) => e.code === 'SINGULAR_MATRIX')).toBe(true);
  });

  it('K2: pin-jointed square without diagonal → mechanism detected', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0 }, { id: 'b', x: 4, y: 0 },
      { id: 'c', x: 4, y: 4 }, { id: 'd', x: 0, y: 4 },
    ];
    const elements = [tf('m1', 'a', 'b'), tf('m2', 'b', 'c'), tf('m3', 'c', 'd'), tf('m4', 'd', 'a')];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [
        { node: 'a', fixX: true, fixY: true, fixRot: false },
        { node: 'b', fixX: false, fixY: true, fixRot: false },
      ],
      loadCases: [lcase(elements, 'W', {}, [{ node: 'c', Fx: 5, Fy: 0 }])],
    };
    const r = solveAnalysis2D(am);
    expect(r.errors.some((e) => e.code === 'SINGULAR_MATRIX')).toBe(true);
  });

  it('L: fully fixed both ends of a single element → NO_FREE_DOFS', () => {
    const nodes = [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 2, y: 0 }];
    const elements = [el('b1', 'n1', 'n2')];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [
        { node: 'n1', fixX: true, fixY: true, fixRot: true },
        { node: 'n2', fixX: true, fixY: true, fixRot: true },
      ],
      loadCases: [lcase(elements, 'G', { b1: { qy: -1 } })],
    };
    const r = solveAnalysis2D(am);
    expect(r.errors.some((e) => e.code === 'NO_FREE_DOFS')).toBe(true);
  });

  it('N: distributed load on a two-force element → hard fail', () => {
    const nodes = [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 3, y: 0 }];
    const elements = [tf('t1', 'n1', 'n2')];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [
        { node: 'n1', fixX: true, fixY: true, fixRot: false },
        { node: 'n2', fixX: false, fixY: true, fixRot: false },
      ],
      loadCases: [lcase(elements, 'G', { t1: { qy: -5 } })],
    };
    const r = solveAnalysis2D(am);
    expect(r.errors.some((e) => e.code === 'TWO_FORCE_MEMBER_LOAD')).toBe(true);
  });

  it('O: node referenced by no element → FLOATING_NODE', () => {
    const nodes = [
      { id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 3, y: 0 }, { id: 'ghost', x: 9, y: 9 },
    ];
    const elements = [el('b1', 'n1', 'n2')];
    const am: Analysis2DModel = {
      nodes, elements,
      bcs: [{ node: 'n1', fixX: true, fixY: true, fixRot: true }],
      loadCases: [lcase(elements, 'G', { b1: { qy: -1 } })],
    };
    const r = solveAnalysis2D(am);
    expect(r.errors.some((e) => e.code === 'FLOATING_NODE')).toBe(true);
  });
});
