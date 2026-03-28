import { describe, it, expect } from 'vitest';
import { calcRCBeam } from '../../lib/calculations/rcBeams';
import { rcBeamDefaults } from '../../data/defaults';

// Reference hand calculation for FTUX defaults (b=300, h=500, 4φ16, fck=25, fyk=500):
//   d = 500 - 30 - 8 = 462 mm
//   As = 4 × 201.1 = 804.4 mm²
//   fcd = 25/1.5 = 16.67 MPa
//   fyd = 500/1.15 = 434.8 MPa
//   x = 804.4 × 434.8 / (0.8 × 300 × 16.67) = 349,873 / 4000.8 = 87.5 mm
//   MRd = 804.4 × 434.8 × (462 - 0.4 × 87.5) / 1e6 = 349,873 × 427.5 / 1e6 ≈ 149.6 kNm
//   Utilization Md/MRd = 85/149.6 = 0.568 → CUMPLE (< 80%)

describe('calcRCBeam — FTUX defaults (b300/h500/4φ16/fck25/Md85)', () => {
  const result = calcRCBeam(rcBeamDefaults);

  it('result is valid', () => {
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('effective depth d = 462 mm', () => {
    // d = h - cover - barDiam/2 = 500 - 30 - 8 = 462
    expect(result.d).toBeCloseTo(462, 0);
  });

  it('steel area As ≈ 804 mm²', () => {
    expect(result.As).toBeCloseTo(804.4, 0);
  });

  it('neutral axis x ≈ 87.5 mm', () => {
    expect(result.x).toBeCloseTo(87.5, 0);
  });

  it('MRd > 100 kNm', () => {
    expect(result.MRd).toBeGreaterThan(100);
  });

  it('bending check CUMPLE (utilization < 0.8)', () => {
    const bendingCheck = result.checks.find((c) => c.id === 'bending')!;
    expect(bendingCheck).toBeDefined();
    expect(bendingCheck.status).toBe('ok');
    expect(bendingCheck.utilization).toBeLessThan(0.8);
  });

  it('shear check present and CUMPLE', () => {
    const shearCheck = result.checks.find((c) => c.id === 'shear')!;
    expect(shearCheck).toBeDefined();
    expect(shearCheck.utilization).toBeLessThan(1.0);
  });

  it('cracking check present', () => {
    const crackCheck = result.checks.find((c) => c.id === 'cracking')!;
    expect(crackCheck).toBeDefined();
    expect(crackCheck.utilization).toBeGreaterThan(0);
  });

  it('all checks have CE article references', () => {
    result.checks.forEach((c) => {
      expect(c.article).toMatch(/CE art\./);
    });
  });
});

// ADVERTENCIA case — push Md to ~90% utilization
describe('calcRCBeam — ADVERTENCIA (high Md)', () => {
  const result = calcRCBeam({ ...rcBeamDefaults, Md: 130, VEd: 100 });

  it('result is valid', () => expect(result.valid).toBe(true));

  it('bending check is ADVERTENCIA or INCUMPLE', () => {
    const bendingCheck = result.checks.find((c) => c.id === 'bending')!;
    expect(bendingCheck.utilization).toBeGreaterThan(0.7);
  });
});

// INCUMPLE case — Md > MRd
describe('calcRCBeam — INCUMPLE (Md > MRd)', () => {
  // With only 2φ10 bars (As = 157 mm²), MRd ≈ 30 kNm — demand Md=85 >> capacity
  const result = calcRCBeam({ ...rcBeamDefaults, nBars: 2, barDiam: 10, Md: 85 });

  it('result is valid', () => expect(result.valid).toBe(true));

  it('bending check is FAIL', () => {
    const bendingCheck = result.checks.find((c) => c.id === 'bending')!;
    expect(bendingCheck.status).toBe('fail');
    expect(bendingCheck.utilization).toBeGreaterThan(1.0);
  });
});

// Edge cases
describe('calcRCBeam — edge cases', () => {
  it('b=0 returns invalid', () => {
    const r = calcRCBeam({ ...rcBeamDefaults, b: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('h <= cover + barDiam/2 returns invalid', () => {
    const r = calcRCBeam({ ...rcBeamDefaults, h: 30, cover: 30 });
    expect(r.valid).toBe(false);
  });

  it('Md=0 is a valid edge case (pure shear)', () => {
    const r = calcRCBeam({ ...rcBeamDefaults, Md: 0, Ms: 0 });
    expect(r.valid).toBe(true);
    const bendingCheck = r.checks.find((c) => c.id === 'bending')!;
    expect(bendingCheck.utilization).toBe(0);
  });

  it('exposure XC4 has tighter wk limit (0.2mm)', () => {
    const r = calcRCBeam({ ...rcBeamDefaults, exposureClass: 'XC4' });
    expect(r.wkMax).toBe(0.2);
  });
});
