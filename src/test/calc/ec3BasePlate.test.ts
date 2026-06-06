import { describe, it, expect } from 'vitest';
import { BETA_J, fjd, effectiveOverhang } from '../../lib/calculations/ec3BasePlate';

describe('ec3BasePlate — fjd', () => {
  it('βj = 2/3', () => expect(BETA_J).toBeCloseTo(2 / 3, 10));

  it('fjd = βj·α·fcd with α=1 default', () => {
    // fcd=16.7 → 2/3·16.7 = 11.133
    expect(fjd(16.7)).toBeCloseTo(11.133, 3);
  });

  it('α scales fjd linearly', () => {
    expect(fjd(16.7, 2)).toBeCloseTo(2 * fjd(16.7, 1), 6);
  });

  it('custom βj overrides', () => {
    expect(fjd(20, 1, 1)).toBeCloseTo(20, 6);
  });

  it('fcd=0 → 0', () => expect(fjd(0)).toBe(0));
});

describe('ec3BasePlate — effectiveOverhang', () => {
  it('c = t·√(fyd/(3·fjd))', () => {
    // t=20, fyd=261.9, fjd=11.133 → 20·√(261.9/33.4) = 20·2.801 = 56.02
    expect(effectiveOverhang(20, 261.9, 11.133)).toBeCloseTo(56.02, 1);
  });

  it('flange c (t=10.5) matches hand calc', () => {
    // UPN160 tf=10.5, fyd=261.9, fjd=11.133 → 10.5·2.801 = 29.41
    expect(effectiveOverhang(10.5, 261.9, 11.133)).toBeCloseTo(29.41, 1);
  });

  it('fjd→0 guarded (no div-by-zero / Infinity)', () => {
    const c = effectiveOverhang(20, 261.9, 0);
    expect(Number.isFinite(c)).toBe(true);
  });
});
