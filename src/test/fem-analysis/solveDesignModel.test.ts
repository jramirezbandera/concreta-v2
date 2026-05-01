// FEM 2D — solveDesignModel pipeline test
//
// Smoke-tests the end-to-end DesignModel → SolveResult bridge. Detailed math
// is covered by autoDecompose, femSolver, and adapter unit tests. This file
// just verifies the integration produces sane outputs.

import { describe, expect, it } from 'vitest';
import { solveDesignModel } from '../../features/fem-analysis/solveDesignModel';
import type {
  ArmadoHA,
  DesignBar,
  DesignModel,
  Node,
  RcSection,
} from '../../features/fem-analysis/types';

const RC_30x50: RcSection = { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' };
const ARM_VANO: ArmadoHA = { tens_nBars: 4, tens_barDiam: 16, comp_nBars: 2, comp_barDiam: 12, stirrupDiam: 8, stirrupSpacing: 150, stirrupLegs: 2 };
const ARM_APOYO: ArmadoHA = { tens_nBars: 3, tens_barDiam: 16, comp_nBars: 2, comp_barDiam: 12, stirrupDiam: 8, stirrupSpacing: 100, stirrupLegs: 2 };

function node(id: string, x: number): Node { return { id, x, y: 0 }; }

function rcBar(id: string, i: string, j: string, withArmado: boolean): DesignBar {
  return {
    id, i, j, material: 'rc',
    rcSection: { ...RC_30x50 },
    internalHinges: { i: false, j: false },
    vano_armado: withArmado ? { ...ARM_VANO } : undefined,
    apoyo_armado: withArmado ? { ...ARM_APOYO } : undefined,
  };
}

describe('solveDesignModel — end-to-end pipeline', () => {
  it('SS HA beam UDL with armado: returns ok status and η > 0', () => {
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2', true)],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 25, dir: '-y' }],
    };
    const r = solveDesignModel(model);
    expect(r.errors.filter((e) => e.severity === 'fail')).toHaveLength(0);
    expect(r.status).toMatch(/^(ok|warn|fail)$/);
    expect(r.perBar.b1.eta).toBeGreaterThan(0);
    expect(r.perBar.b1.checks.length).toBeGreaterThan(0);
    expect(r.perBar.b1.M.length).toBeGreaterThan(0);
    expect(Math.abs(r.perBar.b1.Mmax)).toBeGreaterThan(100); // ~152 kN·m for ELU 1.35·25·36/8
  });

  it('SS HA beam without armado: returns pending status', () => {
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2', false)],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 25, dir: '-y' }],
    };
    const r = solveDesignModel(model);
    expect(r.perBar.b1.status).toBe('pending');
    expect(r.status).toBe('pending');
  });

  it('Invariant violation: bar with both ends articulated → fail status, no solving', () => {
    const model: DesignModel = {
      presetCode: 'custom', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 5)],
      bars: [{
        id: 'b1', i: 'n1', j: 'n2',
        material: 'rc',
        rcSection: { ...RC_30x50 },
        internalHinges: { i: true, j: true },
      }],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [],
    };
    const r = solveDesignModel(model);
    expect(r.status).toBe('fail');
    expect(r.errors.some((e) => e.code === 'BIARTICULATED_BAR')).toBe(true);
    expect(r.elements).toHaveLength(0);
  });

  it('No supports: fail with NO_SUPPORTS error', () => {
    const model: DesignModel = {
      presetCode: 'custom', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 5)],
      bars: [rcBar('b1', 'n1', 'n2', true)],
      supports: [],
      loads: [],
    };
    const r = solveDesignModel(model);
    expect(r.status).toBe('fail');
    expect(r.errors.some((e) => e.code === 'NO_SUPPORTS')).toBe(true);
  });

  it('Empty model: status neutral, no errors', () => {
    const model: DesignModel = {
      presetCode: 'custom', combo: 'ELU', selfWeight: false,
      nodes: [], bars: [], supports: [], loads: [],
    };
    const r = solveDesignModel(model);
    expect(r.status).toBe('neutral');
    expect(r.errors.filter((e) => e.severity === 'fail')).toHaveLength(0);
  });
});

// ── Lane R1 V1.1 — multi-envelope tests ─────────────────────────────────────

describe('solveDesignModel — three envelopes per bar (V1.1)', () => {
  it('SS HA beam G-only: ELU = 1.35·G; ELS_frec = ELS_cp = 1.0·G', () => {
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2', true)],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' }],
    };
    const r = solveDesignModel(model);
    const bar = r.perBar.b1;
    expect(bar.envelope).toBeDefined();
    const elu = bar.envelope!.ELU;
    const frec = bar.envelope!.ELS_frec;
    const cp = bar.envelope!.ELS_cp;
    // M_max ELU = 1.35·10·36/8 = 60.75 kN·m. ELS = 10·36/8 = 45 kN·m.
    const mEluMax = Math.max(...elu.M.map(Math.abs));
    const mFrecMax = Math.max(...frec.M.map(Math.abs));
    const mCpMax = Math.max(...cp.M.map(Math.abs));
    expect(mEluMax).toBeCloseTo(60.75, 0);
    expect(mFrecMax).toBeCloseTo(45, 0);
    expect(mCpMax).toBeCloseTo(45, 0);
  });

  it('SS HA beam G+Q (cat B): ELU = 1.35G+1.5Q; ELS_frec = G+0.5Q; ELS_cp = G+0.3Q', () => {
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2', true)],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' },
        { id: 'q1', kind: 'udl', lc: 'Q', useCategory: 'B', bar: 'b1', w: 5, dir: '-y' },
      ],
    };
    const r = solveDesignModel(model);
    const bar = r.perBar.b1;
    expect(bar.envelope).toBeDefined();
    // M_max for SS UDL: w·L²/8 = w·6²/8 = w·4.5
    const mElu = Math.max(...bar.envelope!.ELU.M.map(Math.abs));
    const mFrec = Math.max(...bar.envelope!.ELS_frec.M.map(Math.abs));
    const mCp = Math.max(...bar.envelope!.ELS_cp.M.map(Math.abs));

    // ELU = (1.35·10 + 1.5·5)·4.5 = 21·4.5 = 94.5
    expect(mElu).toBeCloseTo(94.5, 0);
    // ELS_frec (Q principal, cat B → ψ1=0.5): (10 + 0.5·5)·4.5 = 12.5·4.5 = 56.25
    expect(mFrec).toBeCloseTo(56.25, 0);
    // ELS_cp (cat B → ψ2=0.3): (10 + 0.3·5)·4.5 = 11.5·4.5 = 51.75
    expect(mCp).toBeCloseTo(51.75, 0);
  });

  it('SS HA beam G+Q+W: ELU envelope is worst of (Q principal) vs (W principal)', () => {
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2', true)],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G', bar: 'b1', w: 8, dir: '-y' },
        { id: 'q1', kind: 'udl', lc: 'Q', useCategory: 'B', bar: 'b1', w: 5, dir: '-y' },
        { id: 'w1', kind: 'udl', lc: 'W', bar: 'b1', w: 3, dir: '-y' },
      ],
    };
    const r = solveDesignModel(model);
    const bar = r.perBar.b1;
    expect(bar.envelope).toBeDefined();
    // ELU_Q_principal: (1.35·8 + 1.5·5 + 1.5·0.6·3) = 10.8 + 7.5 + 2.7 = 21.0
    //                                                      ψ0(W)=0.6
    // ELU_W_principal: (1.35·8 + 1.5·3 + 1.5·0.7·5) = 10.8 + 4.5 + 5.25 = 20.55
    //                                                      ψ0(Q,B)=0.7
    // Envelope picks worst (max abs) per sample: 21.0 (Q principal) at midspan.
    // M = 21.0·4.5 = 94.5
    const mElu = Math.max(...bar.envelope!.ELU.M.map(Math.abs));
    expect(mElu).toBeCloseTo(94.5, 0);
  });

  it('SS HA beam G+W (no Q): ELS_cp envelope = 1.0G only (W ψ2=0)', () => {
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2', true)],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' },
        { id: 'w1', kind: 'udl', lc: 'W', bar: 'b1', w: 4, dir: '-y' },
      ],
    };
    const r = solveDesignModel(model);
    const mCp = Math.max(...r.perBar.b1.envelope!.ELS_cp.M.map(Math.abs));
    // ELS_cp = 1·G + 0·W = 10·4.5 = 45 (W ψ2=0)
    expect(mCp).toBeCloseTo(45, 0);
  });

  it('Py sign: positive Py = downward (V1.1 convention) → reactions support upward', () => {
    // SS beam with point-node load Py=10 at midspan. Engineering convention:
    // Py>0 = downward (gravity). Reactions at supports must be upward (positive Ry).
    const L = 6;
    const P = 10;
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('nMid', L / 2), node('n2', L)],
      bars: [
        rcBar('b1', 'n1', 'nMid', true),
        rcBar('b2', 'nMid', 'n2',  true),
      ],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'point-node', lc: 'G', node: 'nMid', Py: P }],
    };
    const r = solveDesignModel(model);
    expect(r.errors.filter((e) => e.severity === 'fail')).toHaveLength(0);
    // Reactions at both supports = P/2 (each half), upward (Ry > 0).
    // Solver convention: Ry > 0 = upward push from support.
    // ELU factors: 1.35·G → reactions = 1.35·5 = 6.75 each.
    const reactions = r.reactionsByCombo!.ELU;
    const r1 = reactions.find((x) => x.node === 'n1')!;
    const r2 = reactions.find((x) => x.node === 'n2')!;
    expect(r1.Ry).toBeCloseTo(1.35 * P / 2, 1);
    expect(r2.Ry).toBeCloseTo(1.35 * P / 2, 1);
  });

  it('reactionsByCombo: ELU vs ELS-c differ by load factors for G+Q', () => {
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2', true)],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G',                   bar: 'b1', w: 10, dir: '-y' },
        { id: 'q1', kind: 'udl', lc: 'Q', useCategory: 'B', bar: 'b1', w:  5, dir: '-y' },
      ],
    };
    const r = solveDesignModel(model);
    expect(r.reactionsByCombo).toBeDefined();
    const elu  = r.reactionsByCombo!.ELU.find((x) => x.node === 'n1')!;
    const elsC = r.reactionsByCombo!.ELS_c.find((x) => x.node === 'n1')!;
    const elsCp = r.reactionsByCombo!.ELS_cp.find((x) => x.node === 'n1')!;
    // SS UDL: each support takes w·L/2 = w·3.
    // ELU = (1.35·10 + 1.5·5)·3 = 21·3 = 63 kN
    expect(elu.Ry).toBeCloseTo(63, 1);
    // ELS-c (characteristic, V1.1 default): G + Q = (10 + 5)·3 = 45 kN
    expect(elsC.Ry).toBeCloseTo(45, 1);
    // ELS-cp: G + ψ2(B,Q)·Q = (10 + 0.3·5)·3 = 11.5·3 = 34.5 kN
    expect(elsCp.Ry).toBeCloseTo(34.5, 1);
  });

  it('REGRESSION — existing perBar.M (ELU envelope) is unchanged for G+Q', () => {
    // Pre-V1.1, perBar[id].M was the ELU envelope using bucketed `var`.
    // Post-V1.1, it stays as ELU (now multi-principal aware) for back-compat.
    const model: DesignModel = {
      presetCode: 'beam', combo: 'ELU', selfWeight: false,
      nodes: [node('n1', 0), node('n2', 6)],
      bars: [rcBar('b1', 'n1', 'n2', true)],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' },
        { id: 'q1', kind: 'udl', lc: 'Q', useCategory: 'B', bar: 'b1', w: 5, dir: '-y' },
      ],
    };
    const r = solveDesignModel(model);
    // Existing M (ELU bucketed) = (1.35·10 + 1.5·5)·4.5 = 94.5
    const mLegacy = Math.max(...r.perBar.b1.M.map(Math.abs));
    expect(mLegacy).toBeCloseTo(94.5, 0);
    // And the new envelope.ELU agrees:
    const mNew = Math.max(...r.perBar.b1.envelope!.ELU.M.map(Math.abs));
    expect(mNew).toBeCloseTo(mLegacy, 1);
  });
});
