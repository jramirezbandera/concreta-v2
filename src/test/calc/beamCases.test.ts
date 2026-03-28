import { describe, it, expect } from 'vitest';
import { BEAM_CASES } from '../../lib/calculations/beamCases';

// Reference values: w=10 kN/m, L=6 m
const w = 10;
const L = 6;

describe('BEAM_CASES — ss (simply supported)', () => {
  const s = BEAM_CASES.ss;

  it('MEd = wL²/8', () => {
    expect(s.MEd(w, L)).toBeCloseTo((w * L * L) / 8, 6);
  });

  it('VEd = wL/2', () => {
    expect(s.VEd(w, L)).toBeCloseTo((w * L) / 2, 6);
  });

  it('VEd_interaction = 0 (midspan section, no shear)', () => {
    expect(s.VEd_interaction(w, L)).toBe(0);
  });

  it('k_defl = 5/48', () => {
    expect(s.k_defl).toBeCloseTo(5 / 48, 8);
  });

  it('Lcr_factor = 1.0', () => {
    expect(s.Lcr_factor).toBe(1.0);
  });

  it('C1 = 1.13', () => {
    expect(s.C1).toBe(1.13);
  });
});

describe('BEAM_CASES — cantilever', () => {
  const s = BEAM_CASES.cantilever;

  it('MEd = wL²/2 (fixed-end moment)', () => {
    expect(s.MEd(w, L)).toBeCloseTo((w * L * L) / 2, 6);
  });

  it('VEd = wL (full reaction at wall)', () => {
    expect(s.VEd(w, L)).toBeCloseTo(w * L, 6);
  });

  it('VEd_interaction = wL (critical section at fixed support)', () => {
    expect(s.VEd_interaction(w, L)).toBeCloseTo(w * L, 6);
  });

  it('k_defl = 1/4', () => {
    expect(s.k_defl).toBeCloseTo(1 / 4, 8);
  });

  it('Lcr_factor = 2.0', () => {
    expect(s.Lcr_factor).toBe(2.0);
  });

  it('C1 = 1.0 (hogging moment, conservative)', () => {
    expect(s.C1).toBe(1.0);
  });

  it('MEd is 4× the ss value (wL²/2 vs wL²/8)', () => {
    expect(s.MEd(w, L)).toBeCloseTo(BEAM_CASES.ss.MEd(w, L) * 4, 6);
  });
});

describe('BEAM_CASES — fp (fixed-pinned)', () => {
  const s = BEAM_CASES.fp;

  it('MEd = wL²/8 (governing moment at fixed support)', () => {
    expect(s.MEd(w, L)).toBeCloseTo((w * L * L) / 8, 6);
  });

  it('VEd = 5wL/8 (larger reaction at fixed end)', () => {
    expect(s.VEd(w, L)).toBeCloseTo((5 * w * L) / 8, 6);
  });

  it('VEd_interaction = 5wL/8 (same as VEd for fixed support)', () => {
    expect(s.VEd_interaction(w, L)).toBeCloseTo((5 * w * L) / 8, 6);
  });

  it('VEd > ss VEd (asymmetric reactions)', () => {
    expect(s.VEd(w, L)).toBeGreaterThan(BEAM_CASES.ss.VEd(w, L));
  });

  it('k_defl ≈ 8/185.185', () => {
    expect(s.k_defl).toBeCloseTo(8 / 185.185, 5);
  });

  it('Lcr_factor = 1.0', () => {
    expect(s.Lcr_factor).toBe(1.0);
  });

  it('C1 = 1.13', () => {
    expect(s.C1).toBe(1.13);
  });
});

describe('BEAM_CASES — ff (fixed-fixed)', () => {
  const s = BEAM_CASES.ff;

  it('MEd = wL²/12 (fixed-end moment)', () => {
    expect(s.MEd(w, L)).toBeCloseTo((w * L * L) / 12, 6);
  });

  it('VEd = wL/2 (symmetric reactions)', () => {
    expect(s.VEd(w, L)).toBeCloseTo((w * L) / 2, 6);
  });

  it('VEd_interaction = wL/2 (shear at fixed support = midspan)', () => {
    expect(s.VEd_interaction(w, L)).toBeCloseTo((w * L) / 2, 6);
  });

  it('MEd < ss MEd (fixed ends reduce peak moment)', () => {
    expect(s.MEd(w, L)).toBeLessThan(BEAM_CASES.ss.MEd(w, L));
  });

  it('k_defl = 1/32', () => {
    expect(s.k_defl).toBeCloseTo(1 / 32, 8);
  });

  it('k_defl < ss k_defl (stiffer → less deflection)', () => {
    expect(s.k_defl).toBeLessThan(BEAM_CASES.ss.k_defl);
  });

  it('Lcr_factor = 1.0', () => {
    expect(s.Lcr_factor).toBe(1.0);
  });

  it('C1 = 1.13', () => {
    expect(s.C1).toBe(1.13);
  });
});

describe('BEAM_CASES — cross-type comparisons', () => {
  it('cantilever has highest MEd', () => {
    const meds = Object.values(BEAM_CASES).map((s) => s.MEd(w, L));
    const cantMed = BEAM_CASES.cantilever.MEd(w, L);
    expect(cantMed).toBe(Math.max(...meds));
  });

  it('ff has lowest MEd', () => {
    const meds = Object.values(BEAM_CASES).map((s) => s.MEd(w, L));
    const ffMed = BEAM_CASES.ff.MEd(w, L);
    expect(ffMed).toBe(Math.min(...meds));
  });

  it('cantilever has highest k_defl (worst deflection)', () => {
    const ks = Object.values(BEAM_CASES).map((s) => s.k_defl);
    expect(BEAM_CASES.cantilever.k_defl).toBe(Math.max(...ks));
  });

  it('ff has lowest k_defl (least deflection)', () => {
    const ks = Object.values(BEAM_CASES).map((s) => s.k_defl);
    expect(BEAM_CASES.ff.k_defl).toBe(Math.min(...ks));
  });

  it('only cantilever has Lcr_factor = 2.0', () => {
    expect(BEAM_CASES.cantilever.Lcr_factor).toBe(2.0);
    expect(BEAM_CASES.ss.Lcr_factor).toBe(1.0);
    expect(BEAM_CASES.fp.Lcr_factor).toBe(1.0);
    expect(BEAM_CASES.ff.Lcr_factor).toBe(1.0);
  });

  it('only cantilever has C1 = 1.0; others have C1 = 1.13', () => {
    expect(BEAM_CASES.cantilever.C1).toBe(1.0);
    expect(BEAM_CASES.ss.C1).toBe(1.13);
    expect(BEAM_CASES.fp.C1).toBe(1.13);
    expect(BEAM_CASES.ff.C1).toBe(1.13);
  });

  it('all specs have label and labelShort strings', () => {
    for (const [key, spec] of Object.entries(BEAM_CASES)) {
      expect(typeof spec.label).toBe('string');
      expect(spec.label.length).toBeGreaterThan(0);
      expect(typeof spec.labelShort).toBe('string');
      expect(spec.labelShort.length).toBeGreaterThan(0);
      // labelShort should be shorter or equal to label
      expect(spec.labelShort.length).toBeLessThanOrEqual(spec.label.length);
      void key;
    }
  });
});
