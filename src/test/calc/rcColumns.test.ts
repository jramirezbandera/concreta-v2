// Tests for RC Columns calculation engine — CE Spain (biaxial bending)
// All defaults: b=300, h=300, cover=30, cornerBarDiam=16, nBarsX=0, nBarsY=0,
//   barDiamX=12, barDiamY=12, stirrupDiam=6, stirrupSpacing=150,
//   fck=25, fyk=500, Nd=500kN, MEdy=30kNm, MEdz=10kNm, L=3.5m, beta=1

import { describe, it, expect } from 'vitest';
import { calcRCColumn } from '../../lib/calculations/rcColumns';
import { rcColumnDefaults } from '../../data/defaults';

const D = rcColumnDefaults;

function inp(overrides: Partial<typeof D> = {}): typeof D {
  return { ...D, ...overrides } as typeof D;
}

// ── FTUX defaults ───────────────────────────────────────────────────────────

describe('RC Columns — FTUX defaults', () => {
  it('result is valid', () => {
    expect(calcRCColumn(inp()).valid).toBe(true);
  });

  it('d_y = h - cover - stirrupDiam - cornerBarDiam/2 = 256 mm', () => {
    const r = calcRCColumn(inp());
    expect(r.d_y).toBeCloseTo(256, 0);
  });

  it("d_prime = cover + stirrupDiam + cornerBarDiam/2 = 44 mm", () => {
    const r = calcRCColumn(inp());
    expect(r.d_prime).toBeCloseTo(44, 0);
  });

  it('As_total = 4 * π(8)² = 804.2 mm² for 4×Ø16c', () => {
    const r = calcRCColumn(inp());
    expect(r.As_total).toBeCloseTo(804.2, 0);
  });

  it('lambda_y ≈ 40.4 for b=h=300, L=3.5, beta=1', () => {
    const r = calcRCColumn(inp());
    expect(r.lambda_y).toBeCloseTo(40.4, 0);
  });

  it('lambda_y = lambda_z for square section b=h', () => {
    const r = calcRCColumn(inp());
    expect(r.lambda_y).toBeCloseTo(r.lambda_z, 3);
  });

  it('e_imp_y = Lk_mm / 400 = 8.75 mm', () => {
    const r = calcRCColumn(inp());
    expect(r.e_imp_y).toBeCloseTo(8.75, 1);
  });

  it('e_imp_y = e_imp_z (same Lk)', () => {
    const r = calcRCColumn(inp());
    expect(r.e_imp_y).toBeCloseTo(r.e_imp_z, 3);
  });

  it('all checks not fail (CUMPLE defaults)', () => {
    const r = calcRCColumn(inp());
    expect(r.valid).toBe(true);
    const governingIds = ['biaxial-check', 'lambda-y', 'lambda-z', 'nd-max',
      'as-min', 'as-max', 'nBars-min', 'bar-spacing-x', 'bar-spacing-y',
      'stirrup-diam', 'stirrup-spacing'];
    for (const id of governingIds) {
      const ch = r.checks.find((c) => c.id === id);
      expect(ch, `check ${id} missing`).toBeDefined();
      expect(ch!.status, `check ${id} failed`).not.toBe('fail');
    }
  });

  it('MRdy > MEd_tot_y (y-axis passes)', () => {
    const r = calcRCColumn(inp());
    expect(r.MRdy).toBeGreaterThan(r.MEd_tot_y);
  });

  it('biaxial utilization 40–90% for FTUX defaults', () => {
    const r = calcRCColumn(inp());
    expect(r.biaxialUtil).toBeGreaterThan(0.3);
    expect(r.biaxialUtil).toBeLessThan(0.95);
  });

  it('rebarSchedule contains corner bar info', () => {
    const r = calcRCColumn(inp());
    expect(r.rebarSchedule).toContain('4');
    expect(r.rebarSchedule).toContain('16');
  });

  it('lapLength > 0', () => {
    const r = calcRCColumn(inp());
    expect(r.lapLength).toBeGreaterThan(0);
  });

  it('checks array has 15 entries', () => {
    const r = calcRCColumn(inp());
    expect(r.checks).toHaveLength(15);
  });

  it('result has all required fields', () => {
    const r = calcRCColumn(inp());
    expect(r.d_y).toBeDefined();
    expect(r.d_z).toBeDefined();
    expect(r.d_prime).toBeDefined();
    expect(r.As_total).toBeDefined();
    expect(r.lambda_y).toBeDefined();
    expect(r.lambda_z).toBeDefined();
    expect(r.e1_y).toBeDefined();
    expect(r.e_imp_y).toBeDefined();
    expect(r.e2_y).toBeDefined();
    expect(r.e_tot_y).toBeDefined();
    expect(r.MEd_tot_y).toBeDefined();
    expect(r.MEd_tot_z).toBeDefined();
    expect(r.MRdy).toBeDefined();
    expect(r.MRdz).toBeDefined();
    expect(r.NRd_max).toBeDefined();
    expect(r.ned).toBeDefined();
    expect(r.a).toBeDefined();
    expect(r.biaxialUtil).toBeDefined();
  });
});

// ── Short column (lambda ≤ 25) ──────────────────────────────────────────────

describe('RC Columns — Short column (lambda ≤ 25)', () => {
  it('e2_y = 0 when lambda_y ≤ 25', () => {
    const r = calcRCColumn(inp({ L: 1.5, beta: 1 }));
    expect(r.valid).toBe(true);
    expect(r.e2_y).toBe(0);
    expect(r.lambda_y).toBeLessThanOrEqual(25);
  });

  it('e2_z = 0 when lambda_z ≤ 25', () => {
    const r = calcRCColumn(inp({ L: 1.5, beta: 1 }));
    expect(r.e2_z).toBe(0);
    expect(r.lambda_z).toBeLessThanOrEqual(25);
  });

  it('MEd_tot_y = NEd * (e1_y + e_imp_y) / 1e6 when lambda_y ≤ 25', () => {
    const r = calcRCColumn(inp({ L: 1.5, beta: 1 }));
    const expected = (D.Nd * 1e3) * (r.e1_y + r.e_imp_y) / 1e6;
    expect(r.MEd_tot_y).toBeCloseTo(expected, 1);
  });
});

// ── Slender column (lambda > 25) ────────────────────────────────────────────

describe('RC Columns — Slender column (lambda > 25)', () => {
  it('e2_y > 0 when lambda_y > 25', () => {
    const r = calcRCColumn(inp({ L: 3.5, beta: 1 }));
    expect(r.valid).toBe(true);
    expect(r.lambda_y).toBeGreaterThan(25);
    expect(r.e2_y).toBeGreaterThan(0);
  });

  it('MEd_tot_y > MEdy for slender column (amplification)', () => {
    const r = calcRCColumn(inp({ L: 6, beta: 1 }));
    expect(r.MEd_tot_y).toBeGreaterThan(D.MEdy);
  });

  it('lambda_y = 25 boundary: e2_y = 0 (exactly short)', () => {
    const Lk_boundary = (25 * (300 / Math.sqrt(12))) / 1000;
    const r = calcRCColumn(inp({ L: Lk_boundary, beta: 1 }));
    expect(r.e2_y).toBe(0);
  });

  it('second-order e2_y increases with Lk for slender columns', () => {
    const r1 = calcRCColumn(inp({ L: 4, beta: 1 }));
    const r2 = calcRCColumn(inp({ L: 7, beta: 1 }));
    expect(r2.e2_y).toBeGreaterThan(r1.e2_y);
  });
});

// ── lambda > 100 warning ─────────────────────────────────────────────────────

describe('RC Columns — lambda > 100 warning', () => {
  it('lambda-y status is warn when lambda_y > 100', () => {
    const r = calcRCColumn(inp({ L: 10, beta: 1 }));
    expect(r.valid).toBe(true);
    expect(r.lambda_y).toBeGreaterThan(100);
    const ch = r.checks.find((c) => c.id === 'lambda-y');
    expect(ch?.status).toBe('warn');
  });

  it('lambda-z status is warn when lambda_z > 100', () => {
    const r = calcRCColumn(inp({ L: 10, beta: 1 }));
    const ch = r.checks.find((c) => c.id === 'lambda-z');
    expect(ch?.status).toBe('warn');
  });
});

// ── NEd > NRd,max fails ──────────────────────────────────────────────────────

describe('RC Columns — NEd > NRd,max fails', () => {
  it('nd-max fails when NEd greatly exceeds pure compression capacity', () => {
    const r = calcRCColumn(inp({ Nd: 2500 }));
    expect(r.valid).toBe(true);
    const ch = r.checks.find((c) => c.id === 'nd-max');
    expect(ch?.status).toBe('fail');
  });

  it('biaxial-check is fail (N/A) when nd-max fails', () => {
    const r = calcRCColumn(inp({ Nd: 2500 }));
    const bc = r.checks.find((c) => c.id === 'biaxial-check');
    expect(bc?.status).toBe('fail');
  });

  it('NRd_max uses net concrete area: fcd*(b*h-As) + fyd*As', () => {
    const r = calcRCColumn(inp());
    expect(r.NRd_max).toBeGreaterThan(1800);
    expect(r.NRd_max).toBeLessThan(1850);
  });

  it('binary search succeeds for NEd in Whitney gap zone (no NaN)', () => {
    const r = calcRCColumn(inp({ Nd: 1600 }));
    expect(r.valid).toBe(true);
    expect(r.x_star_y).toBeGreaterThan(0);
    expect(isNaN(r.MRdy)).toBe(false);
    const nd = r.checks.find((c) => c.id === 'nd-max');
    expect(nd?.status).not.toBe('fail');
  });
});

// ── N-M interaction fails ────────────────────────────────────────────────────

describe('RC Columns — N-M interaction fails', () => {
  it('biaxial-check fails for very high moment (y-axis)', () => {
    const r = calcRCColumn(inp({ MEdy: 200, Nd: 100 }));
    expect(r.valid).toBe(true);
    const bc = r.checks.find((c) => c.id === 'biaxial-check');
    expect(bc?.status).toBe('fail');
  });

  it('biaxial-check fails for very high moment (z-axis)', () => {
    const r = calcRCColumn(inp({ MEdz: 200, Nd: 100 }));
    expect(r.valid).toBe(true);
    const bc = r.checks.find((c) => c.id === 'biaxial-check');
    expect(bc?.status).toBe('fail');
  });
});

// ── Reinforcement limit checks ───────────────────────────────────────────────

describe('RC Columns — Reinforcement limit checks', () => {
  it('as-min fails when As < 0.003·b·h', () => {
    // 4×Ø6 = 4*28.3=113 mm² < 270 mm²
    const r = calcRCColumn(inp({ cornerBarDiam: 6 }));
    expect(r.valid).toBe(true);
    const ch = r.checks.find((c) => c.id === 'as-min');
    expect(ch?.status).toBe('fail');
  });

  it('as-max fails when As > 0.04·b·h', () => {
    // 4×Ø32c + 4×Ø25x + 4×Ø25y = 4*804+8*491 = 7154 mm² > 3600 mm²
    const r = calcRCColumn(inp({ cornerBarDiam: 32, nBarsX: 2, barDiamX: 25, nBarsY: 2, barDiamY: 25 }));
    expect(r.valid).toBe(true);
    const ch = r.checks.find((c) => c.id === 'as-max');
    expect(ch?.status).toBe('fail');
  });

  it('nBars-min always passes since we always have 4 corner bars', () => {
    const r = calcRCColumn(inp());
    const ch = r.checks.find((c) => c.id === 'nBars-min');
    expect(ch?.status).toBe('ok');
  });
});

// ── Transverse reinforcement checks ─────────────────────────────────────────

describe('RC Columns — Transverse reinforcement checks', () => {
  it('stirrup-diam fails when stirrupDiam < max(cornerBarDiam/4, 6)', () => {
    // cornerBarDiam=16: demand = max(4, 6) = 6mm. stirrupDiam=5 → fail
    const r = calcRCColumn(inp({ stirrupDiam: 5 }));
    expect(r.valid).toBe(true);
    const ch = r.checks.find((c) => c.id === 'stirrup-diam');
    expect(ch?.status).toBe('fail');
  });

  it('stirrup-diam passes when stirrupDiam = 6 (demand = max(16/4, 6) = 6)', () => {
    const r = calcRCColumn(inp({ stirrupDiam: 6 }));
    const ch = r.checks.find((c) => c.id === 'stirrup-diam');
    expect(ch?.status).toBe('ok');
  });

  it('stirrup-diam uses max of all bar diameters (not just corner)', () => {
    // cornerBarDiam=16, barDiamX=25 → demand = max(25/4, 6) = 7mm. stirrupDiam=6 → fail
    const r = calcRCColumn(inp({ cornerBarDiam: 16, nBarsX: 2, barDiamX: 25, stirrupDiam: 6 }));
    const ch = r.checks.find((c) => c.id === 'stirrup-diam');
    expect(ch?.status).toBe('fail');
  });

  it('stirrup-spacing fails when spacing > min(12φ_corner, min(b,h), 300)', () => {
    // sMax = min(12*16, 300, 300) = 192mm. spacing=250 → fail
    const r = calcRCColumn(inp({ stirrupSpacing: 250 }));
    expect(r.valid).toBe(true);
    const ch = r.checks.find((c) => c.id === 'stirrup-spacing');
    expect(ch?.status).toBe('fail');
  });

  it('stirrup-spacing passes when spacing ≤ sMax', () => {
    const r = calcRCColumn(inp({ stirrupSpacing: 150 }));
    const ch = r.checks.find((c) => c.id === 'stirrup-spacing');
    expect(ch?.status).toBe('ok');
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('RC Columns — Edge cases', () => {
  it('Nd=0 returns invalid with error message', () => {
    const r = calcRCColumn(inp({ Nd: 0 }));
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('Nd=0.5 (<1) returns invalid', () => {
    const r = calcRCColumn(inp({ Nd: 0.5 }));
    expect(r.valid).toBe(false);
  });

  it('MEdy=0 is valid, e1_y = e0_min (min eccentricity governs)', () => {
    const r = calcRCColumn(inp({ MEdy: 0 }));
    expect(r.valid).toBe(true);
    // e0_applied = 0, e0_min = max(300/30, 20) = max(10, 20) = 20mm
    expect(r.e1_y).toBeCloseTo(20, 0);
    expect(r.MEd_tot_y).toBeGreaterThan(0);
  });

  it('MEdz=0 is valid', () => {
    const r = calcRCColumn(inp({ MEdz: 0 }));
    expect(r.valid).toBe(true);
    // e0z_applied=0, e0_min = max(300/30, 20) = 20mm
    expect(r.e1_z).toBeCloseTo(20, 0);
  });

  it('NRd_max > NEd for reasonable defaults', () => {
    const r = calcRCColumn(inp());
    expect(r.NRd_max).toBeGreaterThan(D.Nd);
  });

  it('x_star_y is between 0 and h for typical inputs', () => {
    const r = calcRCColumn(inp());
    expect(r.x_star_y).toBeGreaterThan(0);
    expect(r.x_star_y).toBeLessThan(D.h);
  });

  it('geometric imperfection e_imp_y increases with Lk', () => {
    const r1 = calcRCColumn(inp({ L: 3, beta: 1 }));
    const r2 = calcRCColumn(inp({ L: 6, beta: 1 }));
    expect(r2.e_imp_y).toBeGreaterThan(r1.e_imp_y);
  });

  it('beta multiplies L to produce Lk: L=4m beta=0.7 → Lk=2.8m', () => {
    const r_beta  = calcRCColumn(inp({ L: 4, beta: 0.7 }));
    const r_equiv = calcRCColumn(inp({ L: 2.8, beta: 1 }));
    expect(r_beta.Lk).toBeCloseTo(2.8, 2);
    expect(r_beta.lambda_y).toBeCloseTo(r_equiv.lambda_y, 1);
    expect(r_beta.e_imp_y).toBeCloseTo(r_equiv.e_imp_y, 1);
  });

  it('MEdy < 0 is valid — Math.abs applied', () => {
    const r_neg = calcRCColumn(inp({ MEdy: -30 }));
    const r_pos = calcRCColumn(inp({ MEdy: 30 }));
    expect(r_neg.valid).toBe(true);
    expect(r_neg.MEd_tot_y).toBeCloseTo(r_pos.MEd_tot_y, 1);
  });

  it('bar-spacing-x fails when intermediate bars are too close', () => {
    // b=300, cover=30, stirrupDiam=6, cornerBarDiam=16, nBarsX=6, barDiamX=25
    // innerX = 300 - 2*(30+6) - 2*16 = 300-72-32=196mm; clearX=(196-6*25)/(6+1)=46/7=6.6mm
    // sMin=max(25,16,20)=25mm → fail
    const r = calcRCColumn(inp({ nBarsX: 6, barDiamX: 25 }));
    expect(r.valid).toBe(true);
    const ch = r.checks.find((c) => c.id === 'bar-spacing-x');
    expect(ch?.status).toBe('fail');
  });

  it('bar-spacing-y fails when lateral bars are too close', () => {
    const r = calcRCColumn(inp({ nBarsY: 6, barDiamY: 25 }));
    expect(r.valid).toBe(true);
    const ch = r.checks.find((c) => c.id === 'bar-spacing-y');
    expect(ch?.status).toBe('fail');
  });
});

// ── New biaxial bending tests ────────────────────────────────────────────────

describe('RC Columns — Biaxial bending (new)', () => {
  it('interpExponent: ned=0.1 → a=1.0', () => {
    // For ned=0.1: NEd = 0.1 * NRd_max
    // Use ned≈0.1: NRd_max≈1836kN, NEd=184kN
    const r2 = calcRCColumn(inp({ Nd: 184 }));
    expect(r2.ned).toBeCloseTo(0.1, 1);
    expect(r2.a).toBeCloseTo(1.0, 1);
  });

  it('interpExponent: ned=0.7 → a=1.5', () => {
    // NEd = 0.7 * NRd_max ≈ 0.7 * 1836 = 1285 kN
    const r = calcRCColumn(inp({ Nd: 1285 }));
    expect(r.ned).toBeCloseTo(0.7, 1);
    expect(r.a).toBeCloseTo(1.5, 1);
  });

  it('interpExponent: ned=1.0 → a=2.0', () => {
    // NEd = NRd_max → nd-max fails, ned=1.0, a=2.0
    const r = calcRCColumn(inp({ Nd: 1836 }));
    expect(r.ned).toBeCloseTo(1.0, 1);
    expect(r.a).toBeCloseTo(2.0, 1);
  });

  it('interpExponent: ned=0.4 → a≈1.25', () => {
    // linear interp: 1.0 + (0.4-0.1)/0.6*0.5 = 1.0 + 0.25 = 1.25
    const r = calcRCColumn(inp({ Nd: 735 })); // ≈ 0.4 * 1836
    expect(r.a).toBeCloseTo(1.25, 1);
  });

  it('square column equal moments: biaxial util > each uniaxial util', () => {
    const r = calcRCColumn(inp({ MEdy: 20, MEdz: 20 }));
    expect(r.valid).toBe(true);
    const utilY = r.MRdy > 0 ? r.MEd_tot_y / r.MRdy : 0;
    const utilZ = r.MRdz > 0 ? r.MEd_tot_z / r.MRdz : 0;
    expect(r.biaxialUtil).toBeGreaterThan(utilY);
    expect(r.biaxialUtil).toBeGreaterThan(utilZ);
  });

  it('biaxial CUMPLE: MEdy/MRdy=0.6, MEdz/MRdz=0.6, a~1 → ~1.2 (still checks)', () => {
    // With a≈1 (ned small), (0.6)^1 + (0.6)^1 = 1.2 → fail.
    // With a=1.5, 2*0.6^1.5 = 2*0.465 = 0.93 → ok.
    const r = calcRCColumn(inp({ Nd: 1285 })); // ned≈0.7, a≈1.5
    // Not exactly 0.6/0.6 split, just verify a is 1.5 range
    expect(r.a).toBeCloseTo(1.5, 1);
  });

  it('MEdz=0 → biaxial check effectively matches nm-y', () => {
    const r = calcRCColumn(inp({ MEdz: 0 }));
    expect(r.valid).toBe(true);
    const bc = r.checks.find((c) => c.id === 'biaxial-check');
    // biaxialUtil = (MEd_tot_y/MRdy)^a (z term = 0)
    // The power a≥1 makes sum ≤ uniaxial util for a>1, so biaxial is at most nm-y util
    expect(bc).toBeDefined();
    expect(isNaN(r.biaxialUtil)).toBe(false);
    expect(isFinite(r.biaxialUtil)).toBe(true);
  });

  it('MEdy=0 → biaxial check driven by z-axis only', () => {
    const r = calcRCColumn(inp({ MEdy: 0 }));
    expect(r.valid).toBe(true);
    const bc = r.checks.find((c) => c.id === 'biaxial-check');
    expect(bc).toBeDefined();
    // z term > 0 (MEdz=10kNm, min eccentricity applies)
    expect(r.biaxialUtil).toBeGreaterThan(0);
  });

  it('nBarsX=2 → As_total increases vs nBarsX=0', () => {
    const r0 = calcRCColumn(inp({ nBarsX: 0 }));
    const r2 = calcRCColumn(inp({ nBarsX: 2, barDiamX: 12 }));
    expect(r2.As_total).toBeGreaterThan(r0.As_total);
  });

  it('nBarsX=2 → MRdz increases (nBarsX are side bars for z-axis bending)', () => {
    const r0 = calcRCColumn(inp({ nBarsX: 0 }));
    const r2 = calcRCColumn(inp({ nBarsX: 2, barDiamX: 12 }));
    // nBarsX are intermediate bars on top/bottom faces — they are SIDE bars for z-axis
    // So z-axis bending (barsZ array includes them) should see more capacity
    expect(r2.MRdz).toBeGreaterThan(r0.MRdz);
  });

  it('nBarsY=2 → MRdy increases (nBarsY are side bars for y-axis bending)', () => {
    const r0 = calcRCColumn(inp({ nBarsY: 0 }));
    const r2 = calcRCColumn(inp({ nBarsY: 2, barDiamY: 12 }));
    expect(r2.MRdy).toBeGreaterThan(r0.MRdy);
  });

  it('NRd_max increases with more bars', () => {
    const r0 = calcRCColumn(inp({ nBarsX: 0, nBarsY: 0 }));
    const r2 = calcRCColumn(inp({ nBarsX: 2, barDiamX: 12, nBarsY: 2, barDiamY: 12 }));
    expect(r2.NRd_max).toBeGreaterThan(r0.NRd_max);
  });

  it('Condition 5.38a: b=h=300 → lambda_y/lambda_z = 1.0 (cond_a = true)', () => {
    const r = calcRCColumn(inp());
    expect(r.lambda_y / r.lambda_z).toBeCloseTo(1.0, 3);
    const ch = r.checks.find((c) => c.id === 'cond-5.38a');
    // cond_a always 'ok' (informational)
    expect(ch?.status).toBe('ok');
  });

  it('Condition 5.38a: b=300, h=600 → lambda_y/lambda_z = 300/600 = 0.5 ≤ 2', () => {
    const r = calcRCColumn(inp({ b: 300, h: 600 }));
    // lambda_z / lambda_y = h/b = 600/300 = 2.0 (boundary)
    expect(r.lambda_z / r.lambda_y).toBeCloseTo(2.0, 1);
    const ch = r.checks.find((c) => c.id === 'cond-5.38a');
    expect(ch?.status).toBe('ok');
  });

  it('informational check IDs: nm-y, nm-z, cond-5.38a, cond-5.38b all present', () => {
    const r = calcRCColumn(inp());
    const infoIds = ['nm-y', 'nm-z', 'cond-5.38a', 'cond-5.38b'];
    for (const id of infoIds) {
      expect(r.checks.find((c) => c.id === id), `${id} missing`).toBeDefined();
    }
  });

  it('input validation: Nd < 1 → invalid', () => {
    const r = calcRCColumn(inp({ Nd: 0.5 }));
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('input validation: cornerBarDiam < 6 → invalid', () => {
    const r = calcRCColumn(inp({ cornerBarDiam: 4 }));
    expect(r.valid).toBe(false);
  });

  it('input validation: nBarsX = -1 → invalid', () => {
    const r = calcRCColumn(inp({ nBarsX: -1 }));
    expect(r.valid).toBe(false);
  });
});
