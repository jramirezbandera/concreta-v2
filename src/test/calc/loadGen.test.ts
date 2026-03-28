import { describe, it, expect } from 'vitest';
import { deriveFromLoads, GAMMA_G, GAMMA_Q } from '../../lib/calculations/loadGen';
import { steelBeamDefaults } from '../../data/defaults';

// Base inputs for all tests: A1 residential, bTrib=3m, L=6000mm, gk=1.0, qk=2.0
// Hand-calc reference:
//   Gk_line = 1.0 × 3.0 = 3.0 kN/m
//   Qk_line = 2.0 × 3.0 = 6.0 kN/m
//   wEd     = 1.35×3.0 + 1.50×6.0 = 4.05 + 9.0 = 13.05 kN/m
//   wSer    = 3.0 + 6.0 = 9.0 kN/m
//   MEd     = 13.05 × 6.0²/8 = 13.05 × 4.5 = 58.725 kNm
//   VEd     = 13.05 × 6.0/2  = 39.15 kN
//   Mser    = 9.0 × 6.0²/8   = 9.0 × 4.5 = 40.5 kNm

const base = {
  ...steelBeamDefaults,
  gk: 1.0,
  qk: 2.0,
  bTrib: 3.0,
  L: 6000,
  loadGenActive: true,
  useCategory: 'A1',
};

describe('deriveFromLoads — basic derivation', () => {
  it('A1 residential nominal values match hand-calc', () => {
    const r = deriveFromLoads(base);
    expect(r.Gk_line).toBeCloseTo(3.0, 6);
    expect(r.Qk_line).toBeCloseTo(6.0, 6);
    expect(r.wEd).toBeCloseTo(13.05, 6);
    expect(r.MEd).toBeCloseTo(58.725, 3);
    expect(r.VEd).toBeCloseTo(39.15, 3);
    expect(r.Mser).toBeCloseTo(40.5, 6);
  });

  it('VEd cross-check: VEd × 2 × 1000 ≈ wEd × L (mm units)', () => {
    const r = deriveFromLoads(base);
    expect(r.VEd * 2 * 1000).toBeCloseTo(r.wEd * base.L, 3);
  });

  it('Mser < MEd when qk > 0', () => {
    const r = deriveFromLoads(base);
    expect(r.Mser).toBeLessThan(r.MEd);
  });

  it('doubling bTrib doubles Gk_line, Qk_line, MEd, VEd, Mser', () => {
    const r1 = deriveFromLoads(base);
    const r2 = deriveFromLoads({ ...base, bTrib: 6.0 });
    expect(r2.Gk_line).toBeCloseTo(r1.Gk_line * 2, 6);
    expect(r2.Qk_line).toBeCloseTo(r1.Qk_line * 2, 6);
    expect(r2.MEd).toBeCloseTo(r1.MEd * 2, 6);
    expect(r2.VEd).toBeCloseTo(r1.VEd * 2, 6);
    expect(r2.Mser).toBeCloseTo(r1.Mser * 2, 6);
  });

  it('doubling L (mm) quadruples MEd and Mser, doubles VEd', () => {
    const r1 = deriveFromLoads(base);
    const r2 = deriveFromLoads({ ...base, L: 12000 });
    expect(r2.MEd).toBeCloseTo(r1.MEd * 4, 6);
    expect(r2.Mser).toBeCloseTo(r1.Mser * 4, 6);
    expect(r2.VEd).toBeCloseTo(r1.VEd * 2, 6);
  });
});

describe('deriveFromLoads — edge cases', () => {
  it('gk=0, qk=0 → all outputs = 0 (not NaN)', () => {
    const r = deriveFromLoads({ ...base, gk: 0, qk: 0 });
    expect(r.Gk_line).toBe(0);
    expect(r.Qk_line).toBe(0);
    expect(r.wEd).toBe(0);
    expect(r.MEd).toBe(0);
    expect(r.VEd).toBe(0);
    expect(r.Mser).toBe(0);
    expect(Number.isNaN(r.MEd)).toBe(false);
  });

  it('bTrib=0 → all outputs = 0 (not NaN, no division by bTrib)', () => {
    const r = deriveFromLoads({ ...base, bTrib: 0 });
    expect(r.Gk_line).toBe(0);
    expect(r.Qk_line).toBe(0);
    expect(r.MEd).toBe(0);
    expect(r.VEd).toBe(0);
    expect(r.Mser).toBe(0);
    expect(Number.isNaN(r.MEd)).toBe(false);
  });

  it('L=0 → MEd=0, VEd=0, Mser=0 (not NaN)', () => {
    const r = deriveFromLoads({ ...base, L: 0 });
    expect(r.MEd).toBe(0);
    expect(r.VEd).toBe(0);
    expect(r.Mser).toBe(0);
    expect(Number.isNaN(r.MEd)).toBe(false);
  });

  it('very short span (L=1000mm) → small MEd, valid result', () => {
    const r = deriveFromLoads({ ...base, L: 1000 });
    // MEd = 13.05 × 1.0²/8 = 1.63125 kNm
    expect(r.MEd).toBeCloseTo(1.63125, 3);
    expect(r.MEd).toBeGreaterThan(0);
  });

  it('γG=1.35 and γQ=1.50 match CTE DB-SE table 4.1', () => {
    expect(GAMMA_G).toBe(1.35);
    expect(GAMMA_Q).toBe(1.50);
  });
});
