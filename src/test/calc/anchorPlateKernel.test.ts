// PR0 — kernel-level tests. Verify the new types (`AnchorGeometry`,
// `AnchorLoad`, `SolverResult.residuals`) are present and that the legacy
// `AnchorPlateInputs` adapts onto them without changing numerical behaviour.

import { describe, expect, it } from 'vitest';
import { calcAnchorPlate } from '../../lib/calculations/anchorPlate';
import { toKernel } from '../../lib/calculations/anchor-plate';
import { anchorPlateDefaults } from '../../data/defaults';

describe('PR0 — kernel adapter roundtrip', () => {
  it('toKernel projects AnchorPlateInputs onto AnchorGeometry + AnchorLoad', () => {
    const { geometry, load } = toKernel(anchorPlateDefaults);

    // Plate
    expect(geometry.plate.a).toBe(400);
    expect(geometry.plate.b).toBe(300);
    expect(geometry.plate.t).toBe(20);
    expect(geometry.plate.steel).toBe('S275');

    // Pedestal — directional defaults seed from legacy symmetric values
    expect(geometry.pedestal.cX1).toBe(200);
    expect(geometry.pedestal.cX2).toBe(200);
    expect(geometry.pedestal.cY1).toBe(200);
    expect(geometry.pedestal.cY2).toBe(200);
    expect(geometry.pedestal.h).toBe(1000);
    expect(geometry.pedestal.fck).toBe(25);

    // Bars
    expect(geometry.bars.count).toBe(4);
    expect(geometry.bars.diameter).toBe(20);
    expect(geometry.bars.grade).toBe('B500S');
    expect(geometry.bars.hef).toBe(300);

    // Profile
    expect(geometry.profile.type).toBe('HEB');
    expect(geometry.profile.size).toBe(200);

    // Stiffener
    expect(geometry.stiffener.count).toBe(2);

    // Loads — Vx defaults to VEd, Vy defaults to 0 (PR0 backward-compat)
    expect(load.NEd).toBe(200);
    expect(load.Mx).toBe(45);
    expect(load.My).toBe(10);
    expect(load.Vx).toBe(50);
    expect(load.Vy).toBe(0);
  });

  it('directional cX1/cX2/cY1/cY2 override legacy symmetric values when set', () => {
    const { geometry } = toKernel({
      ...anchorPlateDefaults,
      pedestal_cX: 200,   // legacy
      pedestal_cX1: 50,   // direccional override
      pedestal_cX2: 600,
      pedestal_cY1: 150,
      pedestal_cY2: 350,
    });
    expect(geometry.pedestal.cX1).toBe(50);
    expect(geometry.pedestal.cX2).toBe(600);
    expect(geometry.pedestal.cY1).toBe(150);
    expect(geometry.pedestal.cY2).toBe(350);
  });

  it('legacy AnchorPlateInputs without new fields adapts via fallback', () => {
    const legacyInputs = { ...anchorPlateDefaults };
    delete (legacyInputs as Partial<typeof legacyInputs>).pedestal_cX1;
    delete (legacyInputs as Partial<typeof legacyInputs>).pedestal_cX2;
    delete (legacyInputs as Partial<typeof legacyInputs>).pedestal_cY1;
    delete (legacyInputs as Partial<typeof legacyInputs>).pedestal_cY2;
    delete (legacyInputs as Partial<typeof legacyInputs>).pedestal_h;
    delete (legacyInputs as Partial<typeof legacyInputs>).Vx;
    delete (legacyInputs as Partial<typeof legacyInputs>).Vy;

    const { geometry, load } = toKernel(legacyInputs);
    expect(geometry.pedestal.cX1).toBe(200);     // from legacy pedestal_cX
    expect(geometry.pedestal.cX2).toBe(200);
    expect(geometry.pedestal.h).toBe(1000);      // default
    expect(load.Vx).toBe(50);                    // from legacy VEd
    expect(load.Vy).toBe(0);                     // default
  });
});

describe('PR0 — SolverResult.residuals exposed', () => {
  it('uniform-compression path: residuals all zero', () => {
    const r = calcAnchorPlate({ ...anchorPlateDefaults, NEd: 500, Mx: 0, My: 0 });
    expect(r.solver.residuals).toBeDefined();
    expect(r.solver.residuals.SN_kN).toBe(0);
    expect(r.solver.residuals.SMx_kNm).toBe(0);
    expect(r.solver.residuals.SMy_kNm).toBe(0);
  });

  it('partial-lift path: residuals all zero (closed-form exact)', () => {
    const r = calcAnchorPlate({ ...anchorPlateDefaults, My: 0 });
    expect(r.solver.mode).toBe('partial-lift');
    expect(r.solver.residuals.SN_kN).toBe(0);
    expect(r.solver.residuals.SMx_kNm).toBe(0);
    expect(r.solver.residuals.SMy_kNm).toBe(0);
  });

  it('biaxial path: residuals expose Mx/My deviation from grid search', () => {
    const r = calcAnchorPlate(anchorPlateDefaults);
    expect(['biaxial-plastic', 'biaxial-grid']).toContain(r.solver.mode);
    expect(r.solver.residuals.SN_kN).toBe(0);
    expect(typeof r.solver.residuals.SMx_kNm).toBe('number');
    expect(typeof r.solver.residuals.SMy_kNm).toBe('number');
    // Tolerance on residual depends on convergence — when converged it should
    // be within the solver tolerance (max(0.5 kNm, 2% of |M_ext|)).
    if (r.solver.converged) {
      const M_ext = Math.hypot(anchorPlateDefaults.Mx, anchorPlateDefaults.My);
      const tol = Math.max(0.5, 0.02 * M_ext);
      const residualMag = Math.hypot(r.solver.residuals.SMx_kNm, r.solver.residuals.SMy_kNm);
      expect(residualMag).toBeLessThanOrEqual(tol);
    }
  });

  it('empty case (no loads): residuals all zero', () => {
    const r = calcAnchorPlate({ ...anchorPlateDefaults, NEd: 0, Mx: 0, My: 0 });
    expect(r.valid).toBe(false);
    expect(r.solver.residuals.SN_kN).toBe(0);
    expect(r.solver.residuals.SMx_kNm).toBe(0);
    expect(r.solver.residuals.SMy_kNm).toBe(0);
  });
});

describe('PR0 — backward compatibility: existing behaviour unchanged', () => {
  it('default FTUX worstUtil sentinel (post-CR1 biaxial linear distribution)', () => {
    // Pin the FTUX worstUtil to catch unintended numerical drift.
    //
    // Timeline:
    //   - Pre-PR7b (bug): worstUtil = 7.1107, driven by concrete-cone with
    //     biaxial solver clamping Ft to n·FtRd = 4·136.6 = 546.4 kN regardless
    //     of external moment (CR1).
    //   - Post-PR7b: worstUtil ≈ 0.928, driven by plate-bending (which depends
    //     on fjd·c²/2 vs t²·fyd/4, independent of solver Ft). Biaxial now
    //     converges at φ≈12.4° (atan(My/Mx)) with Ft_total≈31.8 kN, cone
    //     util ≈ 0.55.
    //   - Future drift: CR3 splitting rewrite (PR6) may change worstUtil
    //     slightly if splitting becomes governing for FTUX. Re-pin then.
    const r = calcAnchorPlate(anchorPlateDefaults);
    expect(r.valid).toBe(true);
    expect(r.checks).toHaveLength(13);    // PR8b: 10 → 13 (concrete shear modes)
    expect(r.worstUtil).toBeCloseTo(0.928, 2);
  });

  it('FTUX default check count, IDs and articles unchanged', () => {
    const r = calcAnchorPlate(anchorPlateDefaults);
    const expectedIds = [
      'plate-compression', 'plate-bending', 'bolt-tension', 'bolt-shear',
      'bolt-interaction', 'anchorage-length', 'concrete-cone', 'pullout',
      'splitting', 'stiffener',
    ];
    for (const id of expectedIds) {
      const c = r.checks.find((x) => x.id === id);
      expect(c).toBeDefined();
      expect(c!.article).not.toBe('');
    }
  });
});
