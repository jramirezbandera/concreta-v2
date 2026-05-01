// FEM 2D — solver edge case + numerical-stability tests
//
// These tests cover the cases Codex flagged in the eng-review outside-voice
// challenge: degenerate inputs, near-singular matrices, mixed EI orders of
// magnitude, post-solve equilibrium, mesh refinement invariance.

import { describe, expect, it } from 'vitest';
import {
  elementStiffness,
  fixedEndForces,
  solveAnalysisModel,
} from '../../features/fem-analysis/femSolver';
import { autoDecompose } from '../../features/fem-analysis/autoDecompose';
import type {
  DesignBar,
  DesignModel,
  Node,
  RcSection,
  SteelSelection,
} from '../../features/fem-analysis/types';

// ── Fixture helpers ─────────────────────────────────────────────────────────

const RC_30x50: RcSection = { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' };
const STEEL_IPE240: SteelSelection = { profileKey: 'steel_IPE240', steel: 'S275', beamType: 'ss', deflLimit: 300, elsCombo: 'characteristic', useCategory: 'B' };

function node(id: string, x: number): Node { return { id, x, y: 0 }; }

function rcBar(id: string, i: string, j: string, sectionOverride?: Partial<RcSection>, extras?: Partial<DesignBar>): DesignBar {
  return {
    id, i, j,
    material: 'rc',
    rcSection: { ...RC_30x50, ...sectionOverride },
    internalHinges: { i: false, j: false },
    ...extras,
  };
}

function steelBar(id: string, i: string, j: string, extras?: Partial<DesignBar>): DesignBar {
  return {
    id, i, j,
    material: 'steel',
    steelSelection: { ...STEEL_IPE240 },
    internalHinges: { i: false, j: false },
    ...extras,
  };
}

// ── Element stiffness — symmetry + sign sanity ─────────────────────────────

describe('elementStiffness — pure math sanity', () => {
  it('K_cc is symmetric', () => {
    const K = elementStiffness(8173, 6, 'continuous', 'continuous');
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        expect(K[i][j]).toBeCloseTo(K[j][i], 6);
      }
    }
  });

  it('K_cc diagonal is positive (stiffness)', () => {
    const K = elementStiffness(8173, 6, 'continuous', 'continuous');
    for (let i = 0; i < 4; i++) expect(K[i][i]).toBeGreaterThan(0);
  });

  it('K_pc has zero row+col at index 1 (released θ_i)', () => {
    const K = elementStiffness(8173, 6, 'released', 'continuous');
    for (let j = 0; j < 4; j++) expect(K[1][j]).toBe(0);
    for (let i = 0; i < 4; i++) expect(K[i][1]).toBe(0);
  });

  it('K_fp has zero row+col at index 3 (released θ_j)', () => {
    const K = elementStiffness(8173, 6, 'continuous', 'released');
    for (let j = 0; j < 4; j++) expect(K[3][j]).toBe(0);
    for (let i = 0; i < 4; i++) expect(K[i][3]).toBe(0);
  });

  it('K_pp (both released) is the zero matrix', () => {
    const K = elementStiffness(8173, 6, 'released', 'released');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) expect(K[i][j]).toBe(0);
  });

  it('K scales linearly with EI', () => {
    const K1 = elementStiffness(1000, 5, 'continuous', 'continuous');
    const K2 = elementStiffness(2000, 5, 'continuous', 'continuous');
    expect(K2[0][0]).toBeCloseTo(2 * K1[0][0], 6);
    expect(K2[1][3]).toBeCloseTo(2 * K1[1][3], 6);
  });
});

// ── Fixed-end forces ───────────────────────────────────────────────────────

describe('fixedEndForces — UDL', () => {
  it('continuous-continuous: q·L/2 + q·L²/12', () => {
    const q = -25, L = 6;
    const fe = fixedEndForces(q, L, 'continuous', 'continuous');
    expect(fe[0]).toBeCloseTo((q * L) / 2, 6);
    expect(fe[1]).toBeCloseTo((q * L * L) / 12, 6);
    expect(fe[2]).toBeCloseTo((q * L) / 2, 6);
    expect(fe[3]).toBeCloseTo(-(q * L * L) / 12, 6);
  });

  it('pinned-fixed (i pinned): asymmetric distribution 3qL/8 + 5qL/8', () => {
    const q = -25, L = 6;
    const fe = fixedEndForces(q, L, 'released', 'continuous');
    expect(fe[0]).toBeCloseTo((3 * q * L) / 8, 6);
    expect(fe[1]).toBe(0);
    expect(fe[2]).toBeCloseTo((5 * q * L) / 8, 6);
    expect(fe[3]).toBeCloseTo(-(q * L * L) / 8, 6);
  });

  it('fixed-pinned (j pinned): mirror of pinned-fixed', () => {
    const q = -25, L = 6;
    const fe = fixedEndForces(q, L, 'continuous', 'released');
    expect(fe[0]).toBeCloseTo((5 * q * L) / 8, 6);
    expect(fe[1]).toBeCloseTo((q * L * L) / 8, 6);
    expect(fe[2]).toBeCloseTo((3 * q * L) / 8, 6);
    expect(fe[3]).toBe(0);
  });
});

// ── Edge case: very short bar (numerical stability) ────────────────────────

describe('solver — short bar (L=0.1m)', () => {
  it('L=0.1m IPE240 SS UDL solves without singularity', () => {
    const L = 0.1;
    const q = 1; // small load to avoid huge moments
    const model: DesignModel = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [steelBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: q, dir: '-y' }],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    expect(result.errors.filter((e) => e.severity === 'fail')).toHaveLength(0);
    // M_max should be approximately q·L²/8 = 1·0.01/8 = 0.00125 kN·m
    const e = result.elements[0];
    const Mmax = Math.max(...e.samples.M.G);
    expect(Mmax).toBeCloseTo((q * L * L) / 8, 5);
  });
});

// ── Edge case: very long bar (numerical stability) ─────────────────────────

describe('solver — long bar (L=30m)', () => {
  it('L=30m IPE240 SS UDL solves with M ≈ q·L²/8', () => {
    const L = 30, q = 5;
    const model: DesignModel = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [steelBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: q, dir: '-y' }],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    expect(result.errors.filter((e) => e.severity === 'fail')).toHaveLength(0);
    const e = result.elements[0];
    const Mmax = Math.max(...e.samples.M.G);
    expect(Mmax).toBeCloseTo((q * L * L) / 8, 1);
  });
});

// ── Edge case: mixed EI orders (1:100 ratio) ───────────────────────────────

describe('solver — mixed EI orders (1:100)', () => {
  it('Continuous beam with one IPE240 vano + one HA 30×100 vano (~100x stiffer): no singularity', () => {
    // HA 30x100 has I = 30·100³/12 = 2.5e6 cm⁴, E = 8500·∛33 ≈ 27263 MPa
    // EI_HA = 27263 * 1e3 * 2.5e6 * 1e-8 = 681575 kN·m²
    // EI_IPE240 = 8173 kN·m². Ratio ~83x.
    const L = 5, q = 10;
    const model: DesignModel = {
      presetCode: 'continuous',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('n2', L), node('n3', 2 * L)],
      bars: [
        steelBar('b1', 'n1', 'n2'),
        rcBar('b2', 'n2', 'n3', { b: 30, h: 100 }),
      ],
      supports: [
        { node: 'n1', type: 'pinned' },
        { node: 'n2', type: 'roller' },
        { node: 'n3', type: 'roller' },
      ],
      loads: [
        { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: q, dir: '-y' },
        { id: 'l2', kind: 'udl', lc: 'G', bar: 'b2', w: q, dir: '-y' },
      ],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    expect(result.errors.filter((e) => e.severity === 'fail')).toHaveLength(0);
    // Sanity: total load = 2·q·L = 100 kN. Reactions sum should match.
    const sumR = result.reactions.reduce((s, r) => s + r.Ry, 0);
    expect(sumR).toBeCloseTo(2 * q * L, 1);
  });
});

// ── Edge case: equilibrium check (post-solve sanity) ───────────────────────

describe('solver — equilibrium check', () => {
  it('SS beam UDL: ΣRy ≈ q·L (within tolerance)', () => {
    const L = 6, q = 25;
    const model: DesignModel = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [rcBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: q, dir: '-y' }],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const sumR = result.reactions.reduce((s, r) => s + r.Ry, 0);
    expect(sumR).toBeCloseTo(q * L, 1);
    // Should NOT raise EQUILIBRIUM_VIOLATION
    expect(result.errors.find((e) => e.code === 'EQUILIBRIUM_VIOLATION')).toBeUndefined();
  });

  it('Cantilever point load: ΣRy ≈ P', () => {
    const L = 3, P = 15;
    const model: DesignModel = {
      presetCode: 'cantilever',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [steelBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'fixed' }],
      // V1.1 convention: Py>0 = downward (gravity-positive engineering).
      loads: [{ id: 'l1', kind: 'point-node', lc: 'G', node: 'n2', Py: P }],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const r1 = result.reactions.find((r) => r.node === 'n1')!;
    expect(r1.Ry).toBeCloseTo(P, 1);
    expect(r1.Mr).toBeCloseTo(P * L, 1);
  });
});

// ── Edge case: mesh refinement invariance ──────────────────────────────────

describe('solver — mesh refinement invariance', () => {
  it('SS UDL: M_max stays ≈ q·L²/8 whether the bar has 1 element or 5 (via mid-bar nodes)', () => {
    const L = 6, q = 25;
    const expected = (q * L * L) / 8;

    // 1-element model (no mid-bar splits)
    const model1: DesignModel = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [rcBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: q, dir: '-y' }],
    };
    const r1 = solveAnalysisModel(autoDecompose(model1));
    const Mmax1 = Math.max(...r1.elements.flatMap((e) => e.samples.M.G));

    // 5-element model: insert 4 mid-bar nodes at x=1, 2, 3, 4
    const model5: DesignModel = {
      ...model1,
      nodes: [
        node('n1', 0),
        node('m1', 1),
        node('m2', 2),
        node('m3', 3),
        node('m4', 4),
        node('n2', L),
      ],
    };
    const r5 = solveAnalysisModel(autoDecompose(model5));
    const Mmax5 = Math.max(...r5.elements.flatMap((e) => e.samples.M.G));

    // Both should match analytical M_max ≈ 112.5 within 1%
    expect(Mmax1).toBeCloseTo(expected, 1);
    expect(Mmax5).toBeCloseTo(expected, 1);
    // The 5-element solution should be at least as accurate as the 1-element
    // (both are exact at nodes for cubic interpolation; the FE+section-eq
    // gives quasi-exact M for any mesh).
    expect(Math.abs(Mmax5 - expected)).toBeLessThanOrEqual(Math.abs(Mmax1 - expected) + 0.5);
  });
});

// ── Edge case: superposition (G + var) ────────────────────────────────────

describe('solver — superposition', () => {
  it('Same model with G=10 and Q=15: M_G + M_Q ≈ M_combined when applied separately', () => {
    const L = 6;
    const baseModel = (loads: DesignModel['loads']): DesignModel => ({
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('n2', L)],
      bars: [rcBar('b1', 'n1', 'n2')],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads,
    });

    const rGonly = solveAnalysisModel(autoDecompose(baseModel([
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' },
    ])));
    const rQonly = solveAnalysisModel(autoDecompose(baseModel([
      { id: 'l1', kind: 'udl', lc: 'Q', bar: 'b1', w: 15, dir: '-y' },
    ])));
    const rBoth = solveAnalysisModel(autoDecompose(baseModel([
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' },
      { id: 'l2', kind: 'udl', lc: 'Q', bar: 'b1', w: 15, dir: '-y' },
    ])));

    const M_G = Math.max(...rGonly.elements[0].samples.M.G);
    const M_Q = Math.max(...rQonly.elements[0].samples.M.Q);
    const M_both_G = Math.max(...rBoth.elements[0].samples.M.G);
    const M_both_Q = Math.max(...rBoth.elements[0].samples.M.Q);

    // Per-load-case max should match the single-load case results
    expect(M_both_G).toBeCloseTo(M_G, 4);
    expect(M_both_Q).toBeCloseTo(M_Q, 4);
    // And the analytical M_max for q=10 over L=6 = 10·36/8 = 45
    expect(M_G).toBeCloseTo(45, 1);
    // For q=15: 15·36/8 = 67.5
    expect(M_Q).toBeCloseTo(67.5, 1);
  });
});

// ── Edge case: empty model ──────────────────────────────────────────────────

describe('solver — empty/degenerate', () => {
  it('Empty model returns no errors and no elements', () => {
    const model: DesignModel = {
      presetCode: 'custom',
      combo: 'ELU',
      selfWeight: false,
      nodes: [],
      bars: [],
      supports: [],
      loads: [],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    expect(result.elements).toHaveLength(0);
    expect(result.reactions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
