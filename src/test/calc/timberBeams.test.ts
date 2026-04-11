// Timber Beams — unit tests (EC5 EN 1995-1-1 + EN 1995-1-2)
// Hand-calc reference: C24, b=150mm, h=400mm, ss, L=5m, gk=2kN/m, qk=3kN/m
// SC1, medium duration (kmod=0.80, kdef=0.60, γM=1.30, ψ2=0.30)
//
// ELU:
//   w_elu = 1.35×2 + 1.50×3 = 2.70+4.50 = 7.20 kN/m
//   MEd = 7.20×5²/8 = 22.50 kNm
//   VEd = 7.20×5/2  = 18.00 kN
//   W   = 150×400²/6 = 4 000 000 mm³
//   σm  = 22.50×1e6/4e6 = 5.625 N/mm²
//   fm,d = 0.80×24/1.30 = 14.77 N/mm²  → util = 5.625/14.77 = 0.381
//   A   = 150×400 = 60 000 mm²
//   τ   = 1.5×18000/60000 = 0.450 N/mm²
//   fv,d = 0.80×4.0/1.30  = 2.462 N/mm² → util = 0.450/2.462 = 0.183
//
// LTB (EC5 §6.3.3):
//   Lef = L = 5000mm, E0,05 = 7.4 kN/mm² = 7400 N/mm²
//   σm,crit = 0.78×150²×7400/(400×5000) = 0.78×22500×7400/2 000 000
//           = 0.78×166 500 000/2 000 000 = 0.78×83.25 = 64.935 N/mm²
//   λrel,m = sqrt(24/64.935) = sqrt(0.3695) = 0.608 → ≤0.75 → kcrit=1.0
//
// ELS (formula contract: δ = k_defl · Mser · L² / EI; for ss → 5wL⁴/(384·EI)):
//   I = 150×400³/12 = 800 000 000 mm⁴
//   E0_mean = 11.0 kN/mm² → 11 000 N/mm²
//   EI = 11000 × 8e8 = 8.8e12 N·mm²
//   Mser_G = 2×5²/8 = 6.25 kNm = 6.25e6 Nmm
//   Mser_Q = 3×5²/8 = 9.375 kNm = 9.375e6 Nmm
//   k_defl (ss) = 5/48
//   u_inst_G = (5/48) × 6.25e6 × 5000² / 8.8e12
//            = (5/48) × 6.25e6 × 2.5e7 / 8.8e12
//            = (5/48) × 17.756 = 1.850 mm
//   u_inst_Q = (5/48) × 9.375e6 × 2.5e7 / 8.8e12
//            = (5/48) × 26.634 = 2.774 mm
//   u_inst   = 1.850 + 2.774 = 4.624 mm  → L/300 = 16.67 mm → OK
//   u_fin    = 1.850×(1+0.60) + 2.774×(1+0.30×0.60)
//            = 2.960 + 3.273 = 6.234 mm → L/250 = 20.00 mm → OK
//   u_active = 2.774 × 1.18 = 3.273 mm    → L/350 = 14.29 mm → OK

import { describe, expect, it } from 'vitest';
import { calcTimberBeam } from '../../lib/calculations/timberBeams';
import { type TimberBeamInputs } from '../../data/defaults';

const baseInp: TimberBeamInputs = {
  gradeId: 'C24',
  b: 150,
  h: 400,
  beamType: 'ss',
  L: 5,
  gk: 2.0,
  qk: 3.0,
  serviceClass: 1,
  loadDuration: 'medium',
  loadType: 'residential',
  psi2Custom: 0.30,
  fireResistance: 'R0',
  exposedFaces: 3,
  isSystem: false,
};

describe('calcTimberBeam — C24 150×400 ss L=5m', () => {
  it('returns valid result for base case', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.valid).toBe(true);
  });

  it('derives kmod=0.80 for SC1 medium', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.kmod).toBeCloseTo(0.80, 4);
  });

  it('derives kdef=0.60 for SC1 sawn', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.kdef).toBeCloseTo(0.60, 4);
  });

  it('derives gammaM=1.30 for sawn timber', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.gammaM).toBeCloseTo(1.30, 4);
  });

  it('ELU MEd ≈ 22.50 kNm', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.MEd).toBeCloseTo(22.5, 1);
  });

  it('ELU VEd ≈ 18.00 kN', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.VEd).toBeCloseTo(18.0, 1);
  });

  it('bending stress σm ≈ 5.625 N/mm²', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.sigma_m).toBeCloseTo(5.625, 2);
  });

  it('fm,d ≈ 14.769 N/mm²', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.fm_d).toBeCloseTo(0.80 * 24 / 1.30, 2);
  });

  it('kh=1.0 for h=400mm (sawn, h≥150mm)', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.kh).toBeCloseTo(1.0, 4);
  });

  it('kh>1.0 for h=100mm sawn (small section bonus)', () => {
    const r = calcTimberBeam({ ...baseInp, b: 100, h: 100 });
    expect(r.kh).toBeGreaterThan(1.0);
    expect(r.kh).toBeLessThanOrEqual(1.3);
  });

  it('kh for h=100mm sawn ≈ (150/100)^0.2 = 1.084', () => {
    const r = calcTimberBeam({ ...baseInp, b: 100, h: 100 });
    expect(r.kh).toBeCloseTo(Math.pow(150 / 100, 0.2), 3);
  });

  it('kcr=0.67 always', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.kcr).toBeCloseTo(0.67, 4);
  });

  it('shear stress τ with kcr=0.67 ≈ 0.672 N/mm² (not 0.450)', () => {
    // τ = 1.5 × VEd / (kcr × A) = 1.5×18000 / (0.67×60000) = 27000/40200 = 0.672
    const r = calcTimberBeam(baseInp);
    expect(r.tau_d).toBeCloseTo(1.5 * 18000 / (0.67 * 60000), 2);
  });

  it('fv,d ≈ 2.462 N/mm²', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.fv_d).toBeCloseTo(0.80 * 4.0 / 1.30, 2);
  });

  it('bending check CUMPLE (util < 0.50)', () => {
    const r = calcTimberBeam(baseInp);
    const bending = r.checks.find(c => c.id === 'bending');
    expect(bending?.status).toBe('ok');
    expect(bending!.utilization).toBeCloseTo(5.625 / (0.80 * 24 / 1.30), 2);
  });

  it('shear check CUMPLE', () => {
    const r = calcTimberBeam(baseInp);
    const shear = r.checks.find(c => c.id === 'shear');
    expect(shear?.status).toBe('ok');
  });

  it('LTB: λrel,m ≈ 0.608 → kcrit = 1.0', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.lambda_rel_m).toBeCloseTo(0.608, 1);
    expect(r.kcrit).toBeCloseTo(1.0, 4);
  });

  it('LTB σm,crit ≈ 64.9 N/mm²', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.sigma_m_crit).toBeCloseTo(64.9, 0);
  });

  it('ELS: u_inst ≈ 4.62 mm (5wL⁴/384EI)', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.u_inst).toBeCloseTo(4.62, 1);
  });

  it('ELS: u_inst_lim = L/300 = 16.67 mm', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.u_inst_lim).toBeCloseTo(5000 / 300, 1);
  });

  it('ELS: u_fin ≈ 6.23 mm', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.u_fin).toBeCloseTo(6.23, 1);
  });

  it('ELS: u_active ≈ 3.27 mm', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.u_active).toBeCloseTo(3.27, 1);
  });

  it('deflection checks PASS for base case (normal loads)', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.checks.find(c => c.id === 'defl-inst')?.status).toBe('ok');
    expect(r.checks.find(c => c.id === 'defl-fin')?.status).toBe('ok');
    expect(r.checks.find(c => c.id === 'defl-active')?.status).toBe('ok');
  });

  it('no fire checks when R0', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.fireActive).toBe(false);
    expect(r.checks.filter(c => c.group === 'fire' && !c.neutral)).toHaveLength(0);
  });
});

describe('calcTimberBeam — fire resistance', () => {
  const fireInp: TimberBeamInputs = { ...baseInp, fireResistance: 'R60', exposedFaces: 3 };

  it('fires active for R60', () => {
    const r = calcTimberBeam(fireInp);
    expect(r.fireActive).toBe(true);
    expect(r.t_fire).toBe(60);
  });

  it('betaN = 0.80 for C24 (softwood sawn)', () => {
    const r = calcTimberBeam(fireInp);
    expect(r.betaN).toBeCloseTo(0.80, 4);
  });

  it('dchar = 0.80×60 = 48mm', () => {
    const r = calcTimberBeam(fireInp);
    expect(r.dchar).toBeCloseTo(48, 4);
  });

  it('def = 48+7 = 55mm', () => {
    const r = calcTimberBeam(fireInp);
    expect(r.def).toBeCloseTo(55, 4);
  });

  it('b_ef = 150-2×55 = 40mm (3 faces)', () => {
    const r = calcTimberBeam(fireInp);
    expect(r.b_ef).toBeCloseTo(40, 1);
  });

  it('h_ef = 400-55 = 345mm (3 faces, only bottom exposed)', () => {
    const r = calcTimberBeam(fireInp);
    expect(r.h_ef).toBeCloseTo(345, 1);
  });

  it('h_ef = 400-2×55 = 290mm for 4 faces', () => {
    const r = calcTimberBeam({ ...fireInp, exposedFaces: 4 });
    expect(r.h_ef).toBeCloseTo(290, 1);
  });

  it('fire MEd uses ψ2=0.30 combination', () => {
    const r = calcTimberBeam(fireInp);
    // w_fi = gk + ψ2×qk = 2+0.30×3 = 2.90 kN/m → MEd_fi = 2.90×25/8 = 9.0625
    expect(r.MEd_fi).toBeCloseTo((2.0 + 0.30 * 3.0) * 25 / 8, 2);
  });

  it('fire bending check present', () => {
    const r = calcTimberBeam(fireInp);
    expect(r.checks.find(c => c.id === 'fire-bending')).toBeTruthy();
  });

  it('fire bending uses fm,k as limit (γM,fi=1.0)', () => {
    const r = calcTimberBeam(fireInp);
    expect(r.fm_k_fi).toBeCloseTo(24, 4);  // fm_k of C24
  });
});

describe('calcTimberBeam — glulam GL28h', () => {
  const glInp: TimberBeamInputs = { ...baseInp, gradeId: 'GL28h' };

  it('gammaM=1.25 for glulam', () => {
    const r = calcTimberBeam(glInp);
    expect(r.gammaM).toBeCloseTo(1.25, 4);
  });

  it('betaN=0.70 for glulam softwood', () => {
    const r = calcTimberBeam({ ...glInp, fireResistance: 'R60' });
    expect(r.betaN).toBeCloseTo(0.70, 4);
  });

  it('fm,d = kmod×fm_k/γM = 0.80×28/1.25 = 17.92 N/mm²', () => {
    const r = calcTimberBeam(glInp);
    expect(r.fm_d).toBeCloseTo(0.80 * 28 / 1.25, 2);
  });
});

describe('calcTimberBeam — service classes', () => {
  it('SC2 medium → kmod=0.80 (same as SC1 for aserrada)', () => {
    const r = calcTimberBeam({ ...baseInp, serviceClass: 2 });
    expect(r.kmod).toBeCloseTo(0.80, 4);
  });

  it('SC3 medium → kmod=0.65', () => {
    const r = calcTimberBeam({ ...baseInp, serviceClass: 3 });
    expect(r.kmod).toBeCloseTo(0.65, 4);
  });

  it('SC1 permanent → kmod=0.60', () => {
    const r = calcTimberBeam({ ...baseInp, loadDuration: 'permanent' });
    expect(r.kmod).toBeCloseTo(0.60, 4);
  });

  it('SC1 instantaneous → kmod=1.10', () => {
    const r = calcTimberBeam({ ...baseInp, loadDuration: 'instantaneous' });
    expect(r.kmod).toBeCloseTo(1.10, 4);
  });
});

describe('calcTimberBeam — beam types', () => {
  it('cantilever MEd = w×L²/2', () => {
    const r = calcTimberBeam({ ...baseInp, beamType: 'cantilever' });
    const w = 1.35 * 2 + 1.50 * 3;
    expect(r.MEd).toBeCloseTo(w * 25 / 2, 1);
  });

  it('ff MEd = w×L²/12', () => {
    const r = calcTimberBeam({ ...baseInp, beamType: 'ff' });
    const w = 1.35 * 2 + 1.50 * 3;
    expect(r.MEd).toBeCloseTo(w * 25 / 12, 1);
  });
});

describe('calcTimberBeam — psi2 custom', () => {
  it('custom loadType uses psi2Custom', () => {
    const r = calcTimberBeam({ ...baseInp, loadType: 'custom', psi2Custom: 0.60 });
    expect(r.psi2).toBeCloseTo(0.60, 4);
  });
});

describe('calcTimberBeam — LTB slenderness cases', () => {
  it('stocky section λrel,m <= 0.75 → kcrit=1.0', () => {
    // Very short span → very high σm,crit → low λrel,m
    const r = calcTimberBeam({ ...baseInp, L: 1 });
    expect(r.kcrit).toBeCloseTo(1.0, 4);
    expect(r.lambda_rel_m).toBeLessThan(0.75);
  });

  it('very slender span → kcrit < 1.0', () => {
    // L=20m (very long) → high λrel,m
    const r = calcTimberBeam({ ...baseInp, b: 100, h: 400, L: 20 });
    expect(r.kcrit).toBeLessThan(1.0);
    expect(r.lambda_rel_m).toBeGreaterThan(0.75);
  });
});

describe('calcTimberBeam — input validation', () => {
  it('invalid gradeId → valid=false', () => {
    expect(calcTimberBeam({ ...baseInp, gradeId: 'X999' }).valid).toBe(false);
  });

  it('b=0 → valid=false', () => {
    expect(calcTimberBeam({ ...baseInp, b: 0 }).valid).toBe(false);
  });

  it('h=0 → valid=false', () => {
    expect(calcTimberBeam({ ...baseInp, h: 0 }).valid).toBe(false);
  });

  it('L=0 → valid=false', () => {
    expect(calcTimberBeam({ ...baseInp, L: 0 }).valid).toBe(false);
  });

  it('b > h → valid=false (not a beam orientation)', () => {
    expect(calcTimberBeam({ ...baseInp, b: 500, h: 100 }).valid).toBe(false);
  });

  it('negative load → valid=false', () => {
    expect(calcTimberBeam({ ...baseInp, gk: -1 }).valid).toBe(false);
  });
});

describe('calcTimberBeam — FTUX defaults produce valid result', () => {
  it('default inputs produce all checks', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.valid).toBe(true);
    expect(r.checks.length).toBeGreaterThan(4);
  });

  it('bending and shear checks present', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.checks.find(c => c.id === 'bending')).toBeTruthy();
    expect(r.checks.find(c => c.id === 'shear')).toBeTruthy();
    expect(r.checks.find(c => c.id === 'ltb')).toBeTruthy();
    expect(r.checks.find(c => c.id === 'defl-inst')).toBeTruthy();
    expect(r.checks.find(c => c.id === 'defl-fin')).toBeTruthy();
    expect(r.checks.find(c => c.id === 'defl-active')).toBeTruthy();
  });
});

describe('calcTimberBeam — ksys (EC5 §6.6)', () => {
  it('ksys=1.0 when isSystem=false (viga aislada)', () => {
    const r = calcTimberBeam({ ...baseInp, isSystem: false });
    expect(r.ksys).toBeCloseTo(1.0, 4);
  });

  it('ksys=1.10 when isSystem=true (tablero colaborante)', () => {
    const r = calcTimberBeam({ ...baseInp, isSystem: true });
    expect(r.ksys).toBeCloseTo(1.10, 4);
  });

  it('ksys=1.10 raises bending limit by 10%', () => {
    const rIso = calcTimberBeam({ ...baseInp, isSystem: false });
    const rSys = calcTimberBeam({ ...baseInp, isSystem: true });
    // fm_d_sys = ksys × fm_d_kh → bending check limit increases 10%
    const bendIso = rIso.checks.find(c => c.id === 'bending')!;
    const bendSys = rSys.checks.find(c => c.id === 'bending')!;
    const limIso = parseFloat(bendIso.limit);
    const limSys = parseFloat(bendSys.limit);
    expect(limSys / limIso).toBeCloseTo(1.10, 3);
  });

  it('ksys does NOT affect shear limit', () => {
    const rIso = calcTimberBeam({ ...baseInp, isSystem: false });
    const rSys = calcTimberBeam({ ...baseInp, isSystem: true });
    expect(rIso.tau_d).toBeCloseTo(rSys.tau_d, 6);
  });

  it('ksys does NOT affect deflections', () => {
    const rIso = calcTimberBeam({ ...baseInp, isSystem: false });
    const rSys = calcTimberBeam({ ...baseInp, isSystem: true });
    expect(rIso.u_fin).toBeCloseTo(rSys.u_fin, 6);
  });
});

describe('calcTimberBeam — kdef SC2 and SC3 (sawn)', () => {
  it('SC2 sawn → kdef=0.80', () => {
    const r = calcTimberBeam({ ...baseInp, serviceClass: 2 });
    expect(r.kdef).toBeCloseTo(0.80, 4);
  });

  it('SC3 sawn → kdef=2.00', () => {
    const r = calcTimberBeam({ ...baseInp, serviceClass: 3 });
    expect(r.kdef).toBeCloseTo(2.00, 4);
  });
});

describe('calcTimberBeam — glulam kh formula', () => {
  // GL28h: h < 600mm → kh = min((600/h)^0.1, 1.1)
  it('glulam h=400mm → kh = (600/400)^0.1 ≈ 1.041', () => {
    const r = calcTimberBeam({ ...baseInp, gradeId: 'GL28h' });
    expect(r.kh).toBeCloseTo(Math.min(Math.pow(600 / 400, 0.1), 1.1), 3);
    expect(r.kh).toBeGreaterThan(1.0);
    expect(r.kh).toBeLessThanOrEqual(1.1);
  });

  it('glulam h≥600mm → kh=1.0', () => {
    const r = calcTimberBeam({ ...baseInp, gradeId: 'GL28h', b: 200, h: 600 });
    expect(r.kh).toBeCloseTo(1.0, 4);
  });
});

describe('calcTimberBeam — LTB zone formulas', () => {
  // Zone 2: 0.75 < λrel,m ≤ 1.40 → kcrit = 1.56 - 0.75×λrel,m
  it('LTB zone 2 (0.75 < λ ≤ 1.40) → kcrit = 1.56 - 0.75×λrel,m', () => {
    // b=100, h=400, L=8m → σm,crit = 0.78×100²×7400/(400×8000) = 17.94 N/mm²
    // λrel,m = sqrt(24/17.94) = 1.157 → zone 2 → kcrit = 1.56 - 0.75×1.157 = 0.693
    const r = calcTimberBeam({ ...baseInp, b: 100, h: 400, L: 8 });
    expect(r.lambda_rel_m).toBeGreaterThan(0.75);
    expect(r.lambda_rel_m).toBeLessThanOrEqual(1.40);
    expect(r.kcrit).toBeCloseTo(1.56 - 0.75 * r.lambda_rel_m, 3);
  });

  // Zone 3: λrel,m > 1.40 → kcrit = 1/λrel,m²
  it('LTB zone 3 (λ > 1.40) → kcrit = 1/λrel,m²', () => {
    const r = calcTimberBeam({ ...baseInp, b: 100, h: 400, L: 20 });
    expect(r.lambda_rel_m).toBeGreaterThan(1.40);
    expect(r.kcrit).toBeCloseTo(1.0 / (r.lambda_rel_m * r.lambda_rel_m), 4);
  });
});

describe('calcTimberBeam — beamType fp (empotrado-articulado)', () => {
  it('fp MEd = w×L²/8 (same coefficient as ss)', () => {
    // BEAM_CASES[fp].MEd — fixed-pinned max moment is w×L²/8 at ~3/8 span
    const r = calcTimberBeam({ ...baseInp, beamType: 'fp' });
    expect(r.valid).toBe(true);
    expect(r.MEd).toBeGreaterThan(0);
  });
});

describe('calcTimberBeam — load durations long and short', () => {
  it('SC1 long → kmod=0.70', () => {
    const r = calcTimberBeam({ ...baseInp, loadDuration: 'long' });
    expect(r.kmod).toBeCloseTo(0.70, 4);
  });

  it('SC1 short → kmod=0.90', () => {
    const r = calcTimberBeam({ ...baseInp, loadDuration: 'short' });
    expect(r.kmod).toBeCloseTo(0.90, 4);
  });
});

describe('calcTimberBeam — ELS all checks OK', () => {
  it('lightly loaded beam: all deflection checks pass', () => {
    // C24 150×500, L=4m, gk=0.5, qk=0.5 → very light → all ELS ok
    const r = calcTimberBeam({ ...baseInp, h: 500, L: 4, gk: 0.5, qk: 0.5 });
    expect(r.checks.find(c => c.id === 'defl-inst')?.status).toBe('ok');
    expect(r.checks.find(c => c.id === 'defl-fin')?.status).toBe('ok');
    expect(r.checks.find(c => c.id === 'defl-active')?.status).toBe('ok');
  });
});

describe('calcTimberBeam — ELS deflection FAIL path', () => {
  it('long-span beam: all 3 deflection checks fail', () => {
    // C24 150×400 ss, L=9m, gk=2, qk=3
    // Mser_G = 2×81/8 = 20.25 kNm  → δ_G = (5/48)×20.25e6×81e6/8.8e12 ≈ 19.42 mm
    // Mser_Q = 3×81/8 = 30.375 kNm → δ_Q ≈ 29.13 mm
    // u_inst   ≈ 48.55 mm  > L/300 = 30.0  → FAIL
    // u_fin    ≈ 65.44 mm  > L/250 = 36.0  → FAIL
    // u_active ≈ 34.37 mm  > L/350 = 25.71 → FAIL
    const r = calcTimberBeam({ ...baseInp, L: 9 });
    expect(r.u_inst).toBeCloseTo(48.55, 0);
    expect(r.checks.find(c => c.id === 'defl-inst')?.status).toBe('fail');
    expect(r.checks.find(c => c.id === 'defl-fin')?.status).toBe('fail');
    expect(r.checks.find(c => c.id === 'defl-active')?.status).toBe('fail');
  });
});

describe('calcTimberBeam — fire section fully charred', () => {
  it('b_ef=0 (fully charred) → fire-section-lost neutral row emitted', () => {
    // b=80mm, R120: def=0.80×120+7=103mm → b_ef = 80-2×103 = -126 → 0
    const r = calcTimberBeam({ ...baseInp, b: 80, h: 400, fireResistance: 'R120', exposedFaces: 3 });
    expect(r.fireActive).toBe(true);
    expect(r.b_ef).toBe(0);
    const lost = r.checks.find(c => c.id === 'fire-section-lost');
    expect(lost).toBeTruthy();
    expect(lost?.neutral).toBe(true);
    expect(r.checks.find(c => c.id === 'fire-bending')).toBeUndefined();
  });
});
