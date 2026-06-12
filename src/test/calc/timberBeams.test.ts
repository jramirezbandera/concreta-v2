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
// ELS (CTE DB-SE 4.3.3, fixes auditoría #109/#110/#114 — flexión + CORTANTE):
//   I = 8e8 mm⁴; EI = 8.8e12; A = 60 000 mm²; G = 0.69 kN/mm² → GA = 4.14e7
//   Flexión: u_G,b = (5/48)·6.25e6·2.5e7/8.8e12 = 1.850 mm; u_Q,b = 2.774 mm
//   Cortante (k_shear=0.15): u_G,s = 0.15·2·2.5e7/4.14e7 = 0.181 mm; u_Q,s = 0.272 mm
//   u_inst_G = 2.031 ; u_inst_Q = 3.046 ; u_inst = 5.08 mm
//   u_fin    = 2.031×1.60 + 3.046×1.18 = 6.84 mm  → L/300 = 16.67 OK (apariencia)
//   u_ACTIVA = 2.031×0.60 + 3.046×1.18 = 4.81 mm  → L/400 = 12.50 OK (integridad,
//              tabiques ordinarios; ANTES se omitía u_G·kdef y daba 3.27)
//   u_confort = 3.046 mm → L/350 = 14.29 OK
//
// LTB con Lef de Tabla 6.1 (fix #112): Lef = 0.9·5000 + 2·400 = 5300 mm
//   σm,crit = 0.78×150²×7400/(400×5300) = 61.3 N/mm² ; λrel = 0.626 → kcrit = 1

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
  partitionType: 'ordinary',
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

  it('LTB: λrel,m ≈ 0.626 (Lef=0.9L+2h) → kcrit = 1.0', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.lambda_rel_m).toBeCloseTo(0.626, 1);
    expect(r.kcrit).toBeCloseTo(1.0, 4);
  });

  it('LTB σm,crit ≈ 61.3 N/mm² (Lef=5300, fix #112)', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.sigma_m_crit).toBeCloseTo(61.3, 0);
  });

  it('ELS: u_inst ≈ 5.08 mm (flexión + cortante, fix #114)', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.u_inst).toBeCloseTo(5.08, 1);
  });

  it('ELS: u_inst_lim = L/300 = 16.67 mm', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.u_inst_lim).toBeCloseTo(5000 / 300, 1);
  });

  it('ELS: u_fin ≈ 6.84 mm', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.u_fin).toBeCloseTo(6.84, 1);
  });

  it('ELS: u_activa ≈ 4.81 mm con fluencia de G (fix #109; antes 3.27)', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.u_active).toBeCloseTo(4.81, 1);
  });

  it('deflection checks PASS for base case (normal loads)', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.checks.find(c => c.id === 'defl-confort')?.status).toBe('ok');
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

  it('fire bending uses kfi·fm,k as limit (fix #117)', () => {
    const r = calcTimberBeam(fireInp);
    expect(r.fm_k_fi).toBeCloseTo(30, 4);  // kfi·fm_k = 1.25×24 (fix #117)
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
    expect(r.checks.find(c => c.id === 'defl-confort')).toBeTruthy();
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
    expect(r.checks.find(c => c.id === 'defl-confort')?.status).toBe('ok');
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
    expect(r.u_inst).toBeCloseTo(50.0, 0);
    expect(r.checks.find(c => c.id === 'defl-confort')?.status).toBe('fail');
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

// ── Fixes auditoría adenda 5 (hallazgos #108-118) ─────────────────────────────
describe('Auditoría #108: GL32h reemplaza a la inexistente GL36h', () => {
  it('GL36h ya no existe en el catálogo', () => {
    expect(calcTimberBeam({ ...baseInp, gradeId: 'GL36h' }).valid).toBe(false);
  });

  it('GL32h existe con fm_k=32 (EN 14080:2013)', () => {
    const r = calcTimberBeam({ ...baseInp, gradeId: 'GL32h' });
    expect(r.valid).toBe(true);
    // fm_d = kmod·kh·... — comprobamos vía fm_d (sin kh): 0.80×32/1.25 = 20.48
    expect(r.fm_d).toBeCloseTo(0.80 * 32 / 1.25, 2);
  });
});

describe('Auditoría #109/#110: integridad según tabiquería', () => {
  it('límite integridad por partitionType: frágil L/500, ordinaria L/400, sin L/300', () => {
    expect(calcTimberBeam({ ...baseInp, partitionType: 'fragile' }).u_active_lim).toBeCloseTo(5000 / 500, 2);
    expect(calcTimberBeam({ ...baseInp, partitionType: 'ordinary' }).u_active_lim).toBeCloseTo(5000 / 400, 2);
    expect(calcTimberBeam({ ...baseInp, partitionType: 'none' }).u_active_lim).toBeCloseTo(5000 / 300, 2);
  });

  it('SC3 (kdef=2.0): la fluencia de G domina la activa (antes omitida)', () => {
    const r = calcTimberBeam({ ...baseInp, serviceClass: 3 });
    // u_act = u_G·2.0 + u_Q·(1+0.3·2.0) — el término de G ya no se pierde
    const expected = 2.0307 * 2.0 + 3.0461 * 1.6;
    expect(r.u_active).toBeCloseTo(expected, 1);
  });

  it('confort = sobrecarga instantánea ≤ L/350', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.u_confort).toBeCloseTo(3.05, 1);
    expect(r.u_confort_lim).toBeCloseTo(5000 / 350, 2);
  });
});

describe('Auditoría #113: combinación solo-permanente', () => {
  it('qk pequeño frente a gk: gobierna 1.35·gk con kmod=0.60', () => {
    // w_perm/kmod_perm = 1.35·5/0.6 = 11.25 > w_main/kmod = (6.75+0.3)/0.8 = 8.8
    const r = calcTimberBeam({ ...baseInp, gk: 5.0, qk: 0.2 });
    expect(r.permGoverns).toBe(true);
    expect(r.kmod).toBeCloseTo(0.60, 4);
    expect(r.MEd).toBeCloseTo(1.35 * 5.0 * 25 / 8, 2);
    expect(r.checks.some(c => c.id === 'elu-perm-combo')).toBe(true);
  });

  it('caso base (qk > 0.3·gk): gobierna la combinación G+Q del usuario', () => {
    const r = calcTimberBeam(baseInp);
    expect(r.permGoverns).toBe(false);
    expect(r.kmod).toBeCloseTo(0.80, 4);
  });
});

describe('Auditoría #111/#117: fuego — kfi y LTB de la sección residual', () => {
  it('kfi = 1.25 aserrada / 1.15 glulam', () => {
    expect(calcTimberBeam({ ...baseInp, fireResistance: 'R60' }).kfi).toBeCloseTo(1.25, 3);
    expect(calcTimberBeam({ ...baseInp, gradeId: 'GL28h', fireResistance: 'R60' }).kfi).toBeCloseTo(1.15, 3);
  });

  it('4 caras expuestas: fila fire-ltb con kcrit_fi < 1 (sección residual esbelta)', () => {
    const r = calcTimberBeam({ ...baseInp, fireResistance: 'R60', exposedFaces: 4 });
    // Residual 40×290: σm,crit,fi = 0.78·40²·7400/(290·5300) ≈ 6.0 → λ≈2.2 → kcrit≈0.2
    expect(r.kcrit_fi).toBeLessThan(0.5);
    const row = r.checks.find(c => c.id === 'fire-ltb');
    expect(row).toBeTruthy();
    expect(row!.status).toBe('fail');
  });

  it('3 caras (tablero arriostra): sin fila fire-ltb y kcrit_fi = 1', () => {
    const r = calcTimberBeam({ ...baseInp, fireResistance: 'R60', exposedFaces: 3 });
    expect(r.kcrit_fi).toBe(1.0);
    expect(r.checks.find(c => c.id === 'fire-ltb')).toBeUndefined();
  });
});

describe('Auditoría #115/#116: límites de alcance declarados', () => {
  it('fila scope-note presente (kc,90 y vibración no incluidos)', () => {
    const r = calcTimberBeam(baseInp);
    const row = r.checks.find(c => c.id === 'scope-note');
    expect(row).toBeTruthy();
    expect(row!.neutral).toBe(true);
  });
});

describe('Auditoría #118: C22 fc0_k = 20 (EN 338:2016)', () => {
  it('C22 sigue siendo válida en vigas (fc0 no afecta)', () => {
    expect(calcTimberBeam({ ...baseInp, gradeId: 'C22' }).valid).toBe(true);
  });
});
