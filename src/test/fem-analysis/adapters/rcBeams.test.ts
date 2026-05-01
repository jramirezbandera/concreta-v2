// FEM 2D — rcBeams adapter test suite
//
// Validates that:
//   1. The adapter returns 'pending' when armado is missing.
//   2. Envelope rollup picks the correct vano + apoyo regions.
//   3. vano_VEd captures max |V| in the vano region (post-Codex correction —
//      NOT V at the location of M_max, which is unconservative).
//   4. cm → mm conversion happens for b and h.
//   5. calcRCBeam is called with valid inputs and returns a valid result.
//   6. Multi-element bars (mid-bar splits) roll up correctly across elements.

import { describe, expect, it } from 'vitest';
import { adaptRcBar } from '../../../features/fem-analysis/adapters/rcBeams';
import { autoDecompose } from '../../../features/fem-analysis/autoDecompose';
import { solveAnalysisModel } from '../../../features/fem-analysis/femSolver';
import type {
  ArmadoHA,
  DesignBar,
  DesignModel,
  Node,
  RcSection,
} from '../../../features/fem-analysis/types';

const RC_30x50: RcSection = { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' };
const ARM_VANO: ArmadoHA = { tens_nBars: 4, tens_barDiam: 16, comp_nBars: 2, comp_barDiam: 12, stirrupDiam: 8, stirrupSpacing: 150, stirrupLegs: 2 };
const ARM_APOYO: ArmadoHA = { tens_nBars: 3, tens_barDiam: 16, comp_nBars: 2, comp_barDiam: 12, stirrupDiam: 8, stirrupSpacing: 100, stirrupLegs: 2 };

function node(id: string, x: number): Node { return { id, x, y: 0 }; }

function ssBeamModel(L: number, q: number, withArmado: boolean): { model: DesignModel; bar: DesignBar } {
  const bar: DesignBar = {
    id: 'b1', i: 'n1', j: 'n2',
    material: 'rc',
    rcSection: { ...RC_30x50 },
    internalHinges: { i: false, j: false },
    vano_armado: withArmado ? { ...ARM_VANO } : undefined,
    apoyo_armado: withArmado ? { ...ARM_APOYO } : undefined,
  };
  const model: DesignModel = {
    presetCode: 'beam',
    combo: 'ELU',
    selfWeight: false,
    nodes: [node('n1', 0), node('n2', L)],
    bars: [bar],
    supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
    loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: q, dir: '-y' }],
  };
  return { model, bar };
}

// ── Pending state ──────────────────────────────────────────────────────────

describe('rcBeams adapter — pending state', () => {
  it('returns status="pending" when vano_armado is missing', () => {
    const { model, bar } = ssBeamModel(6, 25, false);
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptRcBar(bar, result.elements);
    expect(adapt.status).toBe('pending');
    expect(adapt.inputs).toBeUndefined();
    expect(adapt.result).toBeUndefined();
  });

  it('still returns envelope when pending (so UI can show esfuerzos)', () => {
    const { model, bar } = ssBeamModel(6, 25, false);
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptRcBar(bar, result.elements);
    expect(adapt.envelope.L).toBeCloseTo(6, 6);
    expect(adapt.envelope.vano_Md_ELU).toBeGreaterThan(0); // sagging present
  });
});

// ── Envelope: SS UDL ────────────────────────────────────────────────────────

describe('rcBeams adapter — SS UDL envelope', () => {
  const L = 6;
  const q = 25;
  const { model, bar } = ssBeamModel(L, q, true);
  const result = solveAnalysisModel(autoDecompose(model));
  const adapt = adaptRcBar(bar, result.elements);

  it('vano_Md_ELU ≈ 1.35·q·L²/8 (only G load)', () => {
    const expected = 1.35 * (q * L * L) / 8;
    expect(adapt.envelope.vano_Md_ELU).toBeCloseTo(expected, 1);
  });

  it('apoyo_Md_ELU is sagging (positive) and < vano_Md for SS beam (no hogging exists)', () => {
    // For SS UDL, "apoyo region" [0, 0.15L] ∪ [0.85L, L] still has sagging M
    // (just smaller than midspan). Worst |M| in that region occurs at x=0.15L
    // (or 0.85L by symmetry): M = q·0.15·0.85·L²/2 = 0.06375·q·L².
    // ELU 1.35x: ≈ 1.35 · 0.06375 · 25 · 36 = 77 kN·m. Should be positive
    // (sagging) and notably smaller than vano (≈152 kN·m).
    expect(adapt.envelope.apoyo_Md_ELU).toBeGreaterThan(0);
    expect(adapt.envelope.apoyo_Md_ELU).toBeLessThan(adapt.envelope.vano_Md_ELU);
  });

  it('vano_VEd_ELU ≈ 1.35·q·L/4 (max |V| in vano region [0.25L, 0.75L]) — CORRECTED post-Codex', () => {
    // For SS UDL: V(x) = q·L/2 - q·x. At x=0.25L: V = q·L·(1/2 - 1/4) = q·L/4
    // At x=0.75L: V = q·L·(1/2 - 3/4) = -q·L/4. So max |V| in vano region = q·L/4.
    // ELU factor 1.35 (G only).
    const expected = 1.35 * (q * L) / 4;
    expect(adapt.envelope.vano_VEd_ELU).toBeCloseTo(expected, 1);
  });

  it('apoyo_VEd_ELU ≈ 1.35·q·L/2 (max |V| in apoyo region — happens at x=0)', () => {
    const expected = 1.35 * (q * L) / 2;
    expect(adapt.envelope.apoyo_VEd_ELU).toBeCloseTo(expected, 1);
  });
});

// ── Inputs construction ────────────────────────────────────────────────────

describe('rcBeams adapter — inputs construction', () => {
  it('cm → mm conversion: 30 cm b → 300 mm in RCBeamInputs', () => {
    const { model, bar } = ssBeamModel(6, 25, true);
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptRcBar(bar, result.elements);
    expect(adapt.status).toBe('ok');
    expect(adapt.inputs!.b).toBe(300);
    expect(adapt.inputs!.h).toBe(500);
  });

  it('Armado fields wired correctly: vano_bot ← tens, vano_top ← comp', () => {
    const { model, bar } = ssBeamModel(6, 25, true);
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptRcBar(bar, result.elements);
    expect(adapt.inputs!.vano_bot_nBars).toBe(ARM_VANO.tens_nBars);
    expect(adapt.inputs!.vano_bot_barDiam).toBe(ARM_VANO.tens_barDiam);
    expect(adapt.inputs!.vano_top_nBars).toBe(ARM_VANO.comp_nBars);
    expect(adapt.inputs!.vano_top_barDiam).toBe(ARM_VANO.comp_barDiam);
    // Apoyo: tens on top (hogging), comp on bottom
    expect(adapt.inputs!.apoyo_top_nBars).toBe(ARM_APOYO.tens_nBars);
    expect(adapt.inputs!.apoyo_bot_nBars).toBe(ARM_APOYO.comp_nBars);
  });

  it('Material/exposure passed through; CTE category translates to custom + psi2', () => {
    const { model, bar } = ssBeamModel(6, 25, true);
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptRcBar(bar, result.elements);
    expect(adapt.inputs!.fck).toBe(25);
    expect(adapt.inputs!.fyk).toBe(500);
    expect(adapt.inputs!.exposureClass).toBe('XC1');
    // Section uses CTE Tabla 3.1 'B' → adapter converts to loadType='custom'
    // with psi2Custom from Tabla 4.2 (B → ψ2 = 0.3) so the calc engine and the
    // steel-beams module apply the same ELS quasi-permanent factor.
    expect(adapt.inputs!.loadType).toBe('custom');
    expect(adapt.inputs!.psi2Custom).toBeCloseTo(0.3, 3);
  });
});

// ── calcRCBeam integration ──────────────────────────────────────────────────

describe('rcBeams adapter — calcRCBeam integration', () => {
  it('returns a calcRCBeam result with valid sections', () => {
    const { model, bar } = ssBeamModel(6, 25, true);
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptRcBar(bar, result.elements);
    expect(adapt.status).toBe('ok');
    expect(adapt.result).toBeDefined();
    expect(adapt.result!.valid).toBe(true);
    // Vano sections have utilization > 0 because we loaded the beam
    expect(adapt.result!.vano).toBeDefined();
    const bendingCheck = adapt.result!.vano.checks.find((c) => c.id === 'bending');
    expect(bendingCheck).toBeDefined();
    expect(bendingCheck!.utilization).toBeGreaterThan(0);
  });

  it('larger UDL → larger bending utilization in vano', () => {
    const smallM = ssBeamModel(6, 5, true);
    const bigM = ssBeamModel(6, 50, true);
    const small = adaptRcBar(smallM.bar, solveAnalysisModel(autoDecompose(smallM.model)).elements);
    const big = adaptRcBar(bigM.bar, solveAnalysisModel(autoDecompose(bigM.model)).elements);
    const sBend = small.result!.vano.checks.find((c) => c.id === 'bending')!;
    const bBend = big.result!.vano.checks.find((c) => c.id === 'bending')!;
    expect(sBend.utilization).toBeLessThan(bBend.utilization);
  });
});

// ── Multi-element bar (mid-bar split) ──────────────────────────────────────

describe('rcBeams adapter — multi-element bar (mid-bar split)', () => {
  it('SS beam with mid-bar node: envelope rollup spans both sub-elements', () => {
    const L = 6, q = 25;
    const bar: DesignBar = {
      id: 'b1', i: 'n1', j: 'n2',
      material: 'rc',
      rcSection: { ...RC_30x50 },
      internalHinges: { i: false, j: false },
      vano_armado: { ...ARM_VANO },
      apoyo_armado: { ...ARM_APOYO },
    };
    const model: DesignModel = {
      presetCode: 'custom',
      combo: 'ELU',
      selfWeight: false,
      nodes: [node('n1', 0), node('mid', 3), node('n2', L)],
      bars: [bar],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' }],
      loads: [{ id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: q, dir: '-y' }],
    };
    const result = solveAnalysisModel(autoDecompose(model));
    const adapt = adaptRcBar(bar, result.elements);
    expect(adapt.envelope.L).toBeCloseTo(L, 6);
    // M_max should still be ≈ 1.35·q·L²/8 ≈ 152 kN·m, regardless of split
    const expected = 1.35 * (q * L * L) / 8;
    expect(adapt.envelope.vano_Md_ELU).toBeCloseTo(expected, 1);
  });
});
