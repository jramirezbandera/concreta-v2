import { describe, expect, it } from 'vitest';
import {
  cmToMm,
  mmToCm,
  mToMm,
  rcSectionAreaM2,
  steelAreaM2,
} from '../../../features/fem-analysis/adapters/units';

describe('units adapter', () => {
  it('cmToMm: 30 cm → 300 mm (HA b=30cm to RCBeamInputs.b)', () => {
    expect(cmToMm(30)).toBe(300);
  });

  it('cmToMm: 50 cm → 500 mm', () => {
    expect(cmToMm(50)).toBe(500);
  });

  it('mmToCm round-trip: cmToMm followed by mmToCm returns original', () => {
    const original = 30;
    expect(mmToCm(cmToMm(original))).toBeCloseTo(original, 10);
  });

  it('mToMm: 6 m → 6000 mm', () => {
    expect(mToMm(6)).toBe(6000);
  });

  it('rcSectionAreaM2: 30×50 cm → 0.15 m² (b·h·1e-4)', () => {
    expect(rcSectionAreaM2(30, 50)).toBeCloseTo(0.15, 6);
  });

  it('rcSectionAreaM2: 25×40 cm → 0.10 m²', () => {
    expect(rcSectionAreaM2(25, 40)).toBeCloseTo(0.10, 6);
  });

  it('steelAreaM2: IPE 240 (A=39.1 cm²) → 0.00391 m²', () => {
    expect(steelAreaM2(39.1)).toBeCloseTo(0.00391, 6);
  });

  it('steelAreaM2: HEB 200 (A=78.1 cm²) → 0.00781 m²', () => {
    expect(steelAreaM2(78.1)).toBeCloseTo(0.00781, 6);
  });
});
