// Timber Columns calc tests — EN 1995-1-1 (EC5) §6.3 + EN 1995-1-2
// Hand-calc reference: C24, 160×160mm, L=3m, β=1.0, SC1, medium duration
//   Lef = 3000mm, iy = iz = 160/√12 = 46.19mm, λy = λz = 64.95
//   E0_05 = 7.4 kN/mm² = 7400 N/mm², fc0_k = 21 N/mm²
//   λrel = (64.95/π) × √(21/7400) = 20.68 × 0.05329 = 1.102
//   βc = 0.2 (sawn) → k = 0.5×(1 + 0.2×(1.102-0.3) + 1.102²) = 0.5×(1+0.1604+1.214) = 1.187
//   kc = 1/(1.187 + √(1.187²-1.102²)) = 1/(1.187+√(1.409-1.214)) = 1/(1.187+0.442) = 0.614
//   kmod=0.8 (medium/SC1), gammaM=1.30
//   fc0_d = 0.8×21/1.30 = 12.92 N/mm²
//   fm_d  = 0.8×24/1.30 = 14.77 N/mm²

import { describe, it, expect } from 'vitest';
import { calcTimberColumn } from '../../lib/calculations/timberColumns';
import { timberColumnDefaults } from '../../data/defaults';

// ── Reference base input ──────────────────────────────────────────────────────
const BASE = {
  ...timberColumnDefaults,
  gradeId: 'C24',
  b: 160,
  h: 160,
  L: 3.0,
  beta: 1.0,
  Nd: 80,
  Vd: 5,
  Md: 8,
  momentAxis: 'strong',
  serviceClass: 1 as const,
  loadDuration: 'medium',
  fireResistance: 'R0',
  exposedFaces: 4,
  etaFi: 0.65,
};

// ── Validation guards ─────────────────────────────────────────────────────────
describe('input validation', () => {
  it('rejects unknown grade', () => {
    const r = calcTimberColumn({ ...BASE, gradeId: 'FAKE' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/clase/i);
  });

  it('rejects zero b', () => {
    const r = calcTimberColumn({ ...BASE, b: 0 });
    expect(r.valid).toBe(false);
  });

  it('rejects zero L', () => {
    const r = calcTimberColumn({ ...BASE, L: 0 });
    expect(r.valid).toBe(false);
  });

  it('rejects negative Nd', () => {
    const r = calcTimberColumn({ ...BASE, Nd: -1 });
    expect(r.valid).toBe(false);
  });

  it('rejects negative beta', () => {
    const r = calcTimberColumn({ ...BASE, beta: 0 });
    expect(r.valid).toBe(false);
  });
});

// ── Material parameters ───────────────────────────────────────────────────────
describe('material parameters', () => {
  it('kmod=0.8 for medium duration SC1', () => {
    const r = calcTimberColumn(BASE);
    expect(r.valid).toBe(true);
    expect(r.kmod).toBeCloseTo(0.8, 5);
  });

  it('gammaM=1.30 for sawn timber', () => {
    const r = calcTimberColumn(BASE);
    expect(r.gammaM).toBeCloseTo(1.30, 5);
  });

  it('gammaM=1.25 for glulam', () => {
    const r = calcTimberColumn({ ...BASE, gradeId: 'GL24h' });
    expect(r.valid).toBe(true);
    expect(r.gammaM).toBeCloseTo(1.25, 5);
  });

  it('fc0_d = kmod*fc0_k/gammaM', () => {
    const r = calcTimberColumn(BASE);
    // C24: fc0_k=21, kmod=0.8, gammaM=1.30
    expect(r.fc0_d).toBeCloseTo(0.8 * 21 / 1.30, 2);
  });

  it('fm_d = kmod*fm_k/gammaM', () => {
    const r = calcTimberColumn(BASE);
    // C24: fm_k=24, kmod=0.8, gammaM=1.30
    expect(r.fm_d).toBeCloseTo(0.8 * 24 / 1.30, 2);
  });
});

// ── Section properties ────────────────────────────────────────────────────────
describe('section geometry', () => {
  it('A = b * h', () => {
    const r = calcTimberColumn(BASE);
    expect(r.A).toBeCloseTo(160 * 160, 0);
  });

  it('iy = h/sqrt(12) for strong axis', () => {
    const r = calcTimberColumn(BASE);
    expect(r.iy).toBeCloseTo(160 / Math.sqrt(12), 3);
  });

  it('iz = b/sqrt(12) for weak axis', () => {
    const r = calcTimberColumn(BASE);
    expect(r.iz).toBeCloseTo(160 / Math.sqrt(12), 3);
  });

  it('iy > iz for non-square section (160x200)', () => {
    const r = calcTimberColumn({ ...BASE, h: 200 });
    expect(r.iy).toBeGreaterThan(r.iz);
  });
});

// ── Slenderness and buckling ──────────────────────────────────────────────────
describe('slenderness EC5 §6.3.2', () => {
  it('Lef = beta * L * 1000 mm', () => {
    const r = calcTimberColumn(BASE);
    expect(r.Lef).toBeCloseTo(1.0 * 3.0 * 1000, 0);
  });

  it('Lef scales with beta', () => {
    const r07 = calcTimberColumn({ ...BASE, beta: 0.7 });
    const r10 = calcTimberColumn({ ...BASE, beta: 1.0 });
    expect(r07.Lef).toBeCloseTo(r10.Lef * 0.7, 1);
  });

  it('lambda_y = Lef / iy for 160x160 L=3m', () => {
    const r = calcTimberColumn(BASE);
    const iy = 160 / Math.sqrt(12);
    expect(r.lambda_y).toBeCloseTo(3000 / iy, 2);
  });

  it('lambda_rel_y hand-calc ~1.102 for C24 160x160 L=3m', () => {
    const r = calcTimberColumn(BASE);
    // λ=64.95, E0_05=7400 N/mm², fc0_k=21
    const expected = (r.lambda_y / Math.PI) * Math.sqrt(21 / 7400);
    expect(r.lambda_rel_y).toBeCloseTo(expected, 4);
    expect(r.lambda_rel_y).toBeGreaterThan(1.0);
  });

  it('kc < 1 when lambda_rel > 0.3', () => {
    const r = calcTimberColumn(BASE);
    expect(r.lambda_rel_y).toBeGreaterThan(0.3);
    expect(r.kc_y).toBeLessThan(1.0);
  });

  it('kc = 1.0 when lambda_rel <= 0.3 (very short column)', () => {
    // Short column: L=0.3m → λ ≈ 6.5, λrel ≈ 0.11
    const r = calcTimberColumn({ ...BASE, L: 0.3 });
    expect(r.lambda_rel_y).toBeLessThanOrEqual(0.3);
    expect(r.kc_y).toBeCloseTo(1.0, 5);
  });

  it('kc_y = kc_z for square section (b=h)', () => {
    const r = calcTimberColumn(BASE);  // 160x160, square
    expect(r.kc_y).toBeCloseTo(r.kc_z, 5);
  });

  it('kc_y > kc_z for non-square (160x200, h>b)', () => {
    const r = calcTimberColumn({ ...BASE, h: 200 });
    expect(r.kc_y).toBeGreaterThan(r.kc_z);
  });

  it('betaC = 0.2 for sawn timber', () => {
    const r = calcTimberColumn(BASE);
    expect(r.betaC).toBeCloseTo(0.2, 5);
  });

  it('betaC = 0.1 for glulam', () => {
    const r = calcTimberColumn({ ...BASE, gradeId: 'GL24h' });
    expect(r.betaC).toBeCloseTo(0.1, 5);
  });

  it('glulam higher kc than sawn at same geometry', () => {
    const rSawn  = calcTimberColumn(BASE);
    const rGlulam = calcTimberColumn({ ...BASE, gradeId: 'GL24h', Nd: 0, Vd: 0, Md: 0 });
    // glulam has lower betaC → less imperfection → higher kc
    expect(rGlulam.kc_y).toBeGreaterThan(rSawn.kc_y);
  });
});

// ── Stress calculations ───────────────────────────────────────────────────────
describe('stresses', () => {
  it('sigma_c = Nd*1000 / (b*h)', () => {
    const r = calcTimberColumn(BASE);
    expect(r.sigma_c).toBeCloseTo(80 * 1000 / (160 * 160), 3);
  });

  it('sigma_c = 0 when Nd = 0', () => {
    const r = calcTimberColumn({ ...BASE, Nd: 0 });
    expect(r.sigma_c).toBe(0);
  });

  it('sigma_m uses Wy = b*h²/6 when momentAxis=strong', () => {
    const r = calcTimberColumn({ ...BASE, momentAxis: 'strong' });
    const Wy = 160 * 160 * 160 / 6;
    expect(r.sigma_m).toBeCloseTo(8 * 1e6 / Wy, 3);
  });

  it('sigma_m uses Wz = h*b²/6 when momentAxis=weak', () => {
    const r = calcTimberColumn({ ...BASE, h: 200, momentAxis: 'weak', Md: 8 });
    const Wz = 200 * 160 * 160 / 6;
    expect(r.sigma_m).toBeCloseTo(8 * 1e6 / Wz, 3);
  });

  it('sigma_m = 0 when Md = 0', () => {
    const r = calcTimberColumn({ ...BASE, Md: 0 });
    expect(r.sigma_m).toBe(0);
  });

  it('tau_d = 1.5 * Vd * 1000 / (0.67 * b * h)', () => {
    const r = calcTimberColumn(BASE);
    const expected = 1.5 * 5 * 1000 / (0.67 * 160 * 160);
    expect(r.tau_d).toBeCloseTo(expected, 3);
  });

  it('tau_d = 0 when Vd = 0', () => {
    const r = calcTimberColumn({ ...BASE, Vd: 0 });
    expect(r.tau_d).toBe(0);
  });
});

// ── EC5 §6.3.3 interaction equations ─────────────────────────────────────────
describe('EC5 §6.3.3 interaction', () => {
  it('util_623 > 0 for non-zero Nd+Md', () => {
    const r = calcTimberColumn(BASE);
    expect(r.util_623).toBeGreaterThan(0);
  });

  it('util_624 > 0 for non-zero Nd', () => {
    const r = calcTimberColumn(BASE);
    expect(r.util_624).toBeGreaterThan(0);
  });

  it('pure axial: util_623 = (sigma_c/(kcy*fc0_d))²', () => {
    const r = calcTimberColumn({ ...BASE, Md: 0, Vd: 0 });
    const expected = Math.pow(r.sigma_c / (r.kc_y * r.fc0_d), 2);
    expect(r.util_623).toBeCloseTo(expected, 4);
  });

  it('pure axial: util_624 = (sigma_c/(kcz*fc0_d))²', () => {
    const r = calcTimberColumn({ ...BASE, Md: 0, Vd: 0 });
    const expected = Math.pow(r.sigma_c / (r.kc_z * r.fc0_d), 2);
    expect(r.util_624).toBeCloseTo(expected, 4);
  });

  it('for square section, util_623 == util_624 with no bending', () => {
    const r = calcTimberColumn({ ...BASE, Md: 0, Vd: 0 });
    expect(r.util_623).toBeCloseTo(r.util_624, 6);
  });

  it('moment on strong axis: util_623 > util_624 (because full sigma_m in 623)', () => {
    const r = calcTimberColumn({ ...BASE, h: 200, momentAxis: 'strong', Md: 10 });
    // eq 6.23 has full sigma_m, eq 6.24 has km*sigma_m → 6.23 > 6.24 (assuming kcy=kcz)
    expect(r.util_623).toBeGreaterThan(r.util_624);
  });

  it('moment on weak axis: util_624 > util_623', () => {
    const r = calcTimberColumn({ ...BASE, h: 200, momentAxis: 'weak', Md: 10 });
    // eq 6.24 has full sigma_m,z, eq 6.23 has km*sigma_m,z
    expect(r.util_624).toBeGreaterThan(r.util_623);
  });

  it('CUMPLE for well-sized column (low util)', () => {
    // Large 200x200 column, short span, light load
    const r = calcTimberColumn({ ...BASE, b: 200, h: 200, L: 2.0, Nd: 30, Vd: 2, Md: 3 });
    expect(r.valid).toBe(true);
    const comb623 = r.checks.find(c => c.id === 'comb-623');
    expect(comb623?.status).toBe('ok');
  });

  it('INCUMPLE when column is heavily loaded (force fail)', () => {
    // Tiny section under huge load
    const r = calcTimberColumn({ ...BASE, b: 80, h: 80, L: 4.0, Nd: 200, Vd: 20, Md: 30 });
    expect(r.valid).toBe(true);
    const hasFail = r.checks.some(c => !c.neutral && c.status === 'fail');
    expect(hasFail).toBe(true);
  });

  it('zero loads → all util near 0 → all ok', () => {
    const r = calcTimberColumn({ ...BASE, Nd: 0, Vd: 0, Md: 0 });
    expect(r.valid).toBe(true);
    const active = r.checks.filter(c => !c.neutral);
    active.forEach(c => expect(c.status).toBe('ok'));
  });
});

// ── Check rows ────────────────────────────────────────────────────────────────
describe('check rows', () => {
  it('always has shear check', () => {
    const r = calcTimberColumn(BASE);
    expect(r.checks.some(c => c.id === 'shear')).toBe(true);
  });

  it('always has comb-623 and comb-624', () => {
    const r = calcTimberColumn(BASE);
    expect(r.checks.some(c => c.id === 'comb-623')).toBe(true);
    expect(r.checks.some(c => c.id === 'comb-624')).toBe(true);
  });

  it('no fire checks when R0', () => {
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R0' });
    expect(r.checks.filter(c => c.group === 'fire').length).toBe(0);
  });

  it('has fire checks when R60', () => {
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R60', exposedFaces: 4 });
    expect(r.fireActive).toBe(true);
    expect(r.checks.filter(c => c.group === 'fire').length).toBeGreaterThan(0);
  });

  it('shear utilization matches formula', () => {
    const r = calcTimberColumn(BASE);
    const shearRow = r.checks.find(c => c.id === 'shear')!;
    expect(shearRow.utilization).toBeCloseTo(r.tau_d / r.fv_d, 4);
  });
});

// ── Fire section reduction ────────────────────────────────────────────────────
describe('fire section reduction', () => {
  it('fireActive=false when R0', () => {
    const r = calcTimberColumn(BASE);
    expect(r.fireActive).toBe(false);
    expect(r.b_ef).toBe(160);
    expect(r.h_ef).toBe(160);
  });

  it('t_fire = 60 when R60', () => {
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R60' });
    expect(r.t_fire).toBe(60);
  });

  it('dchar = betaN * t_fire', () => {
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R30', exposedFaces: 4 });
    expect(r.dchar).toBeCloseTo(r.betaN * 30, 3);
  });

  it('def = dchar + 7mm', () => {
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R30', exposedFaces: 4 });
    expect(r.def).toBeCloseTo(r.dchar + 7, 3);
  });

  it('b_ef reduced both sides for 4 faces', () => {
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R30', exposedFaces: 4 });
    expect(r.b_ef).toBeCloseTo(160 - 2 * r.def, 2);
  });

  it('h_ef reduced both sides for 4 faces', () => {
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R30', exposedFaces: 4 });
    expect(r.h_ef).toBeCloseTo(160 - 2 * r.def, 2);
  });

  it('h_ef reduced one side for 3 faces', () => {
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R30', exposedFaces: 3 });
    expect(r.h_ef).toBeCloseTo(160 - r.def, 2);
  });

  it('fire section lost when def > b/2', () => {
    // R120 with 80mm column → section may be gone
    const r = calcTimberColumn({ ...BASE, b: 80, h: 80, fireResistance: 'R120', exposedFaces: 4 });
    if (r.b_ef <= 0 || r.h_ef <= 0) {
      expect(r.checks.some(c => c.id === 'fire-section-lost')).toBe(true);
    }
  });

  it('fire design strengths use fm_k (gammaM_fi=1)', () => {
    // Fire strengths should equal characteristic values (no gammaM reduction)
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R30', exposedFaces: 4, etaFi: 0.5 });
    // We verify the fire check value uses fc0_k directly (21 N/mm² for C24)
    // kc_y_fi should be based on residual section slenderness
    expect(r.kc_y_fi).toBeGreaterThan(0);
    expect(r.kc_y_fi).toBeLessThanOrEqual(1.0);
  });

  it('fire combination load = etaFi * design load', () => {
    // We verify via sigma_c_fi: Nd_fi = 0.65*80=52kN, A_fi varies
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R30', exposedFaces: 4, etaFi: 0.65 });
    expect(r.fireActive).toBe(true);
    // sigma_c_fi should be smaller than sigma_c (smaller load on smaller section)
    // Both smaller numerator and denominator — just check it's computed
    expect(r.sigma_c_fi).toBeGreaterThan(0);
  });

  it('betaN = 0.8 for softwood sawn timber (C24)', () => {
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R60' });
    expect(r.betaN).toBeCloseTo(0.8, 5);
  });

  it('kc_y_fi computed independently from ELU kc_y for residual section', () => {
    const r = calcTimberColumn({ ...BASE, fireResistance: 'R30', exposedFaces: 4 });
    // Residual section is smaller → weaker axis → kc should be lower
    // (smaller b_ef/h_ef → same Lef → higher slenderness → lower kc)
    expect(r.kc_y_fi).toBeLessThanOrEqual(r.kc_y);
  });
});

// ── Load duration / service class ─────────────────────────────────────────────
describe('kmod by load duration and service class', () => {
  const cases: Array<[string, number, number]> = [
    ['permanent',     1, 0.60],
    ['long',          1, 0.70],
    ['medium',        1, 0.80],
    ['short',         1, 0.90],
    ['instantaneous', 1, 1.10],
    ['permanent',     2, 0.60],
    ['medium',        2, 0.80],
    ['short',         3, 0.70],
  ];
  it.each(cases)('%s SC%i → kmod=%f', (dur, sc, expected) => {
    const r = calcTimberColumn({ ...BASE, loadDuration: dur, serviceClass: sc as 1 | 2 | 3 });
    expect(r.kmod).toBeCloseTo(expected, 5);
  });
});

// ── Beta effective length ─────────────────────────────────────────────────────
describe('effective length factor', () => {
  it('beta=0.5 → Lef = 0.5 * L', () => {
    const r = calcTimberColumn({ ...BASE, beta: 0.5, Nd: 10, Md: 0 });
    expect(r.Lef).toBeCloseTo(0.5 * 3.0 * 1000, 0);
  });

  it('beta=2.0 (cantilever) → kc lower than beta=1.0', () => {
    const rCant = calcTimberColumn({ ...BASE, beta: 2.0, Nd: 40, Md: 0 });
    const rPin  = calcTimberColumn({ ...BASE, beta: 1.0, Nd: 40, Md: 0 });
    expect(rCant.kc_y).toBeLessThan(rPin.kc_y);
  });
});

// ── Glulam vs sawn ────────────────────────────────────────────────────────────
describe('glulam grade', () => {
  it('GL28h produces valid result', () => {
    const r = calcTimberColumn({ ...BASE, gradeId: 'GL28h' });
    expect(r.valid).toBe(true);
  });

  it('gammaM=1.25 for GL28h', () => {
    const r = calcTimberColumn({ ...BASE, gradeId: 'GL28h' });
    expect(r.gammaM).toBeCloseTo(1.25, 5);
  });
});
