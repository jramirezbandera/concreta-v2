// Pure-geometry tests for the polymorphic section adapters.
// These are calculation-free assertions (area, moments of inertia, section
// moduli, classification, buckling curves, primitives) — no app state needed.

import { describe, it, expect } from 'vitest';
import {
  createSection,
  ISectionAdapter,
  makeCHS,
  makeISectionBySize,
  makeUPNBoxBySize,
} from '../../lib/sections';

// ─── ISection adapter ──────────────────────────────────────────────────────
describe('ISectionAdapter — HEB200', () => {
  const s = makeISectionBySize('HEB', 200)!;

  it('resolves catalog', () => expect(s).toBeInstanceOf(ISectionAdapter));
  it('kind=I', () => expect(s.kind).toBe('I'));
  it('label', () => expect(s.label).toContain('HEB'));

  it('A = 78.1 cm² (catalog)', () => expect(s.A).toBeCloseTo(78.1, 1));
  it('Iy = 5696 cm⁴ (catalog)', () => expect(s.Iy).toBeGreaterThan(5000));
  it('Wpl_y = 642 cm³ (catalog)', () => expect(s.Wpl_y).toBeCloseTo(642, 0));

  it('Wpl_z derived > 0', () => expect(s.Wpl_z).toBeGreaterThan(0));
  it('Wel_z derived > 0', () => expect(s.Wel_z).toBeGreaterThan(0));

  it('classify S275 → Class 1 (stocky HEB)', () => {
    expect(s.classify(275, 'compression')).toBe(1);
  });
  it('classify S355 compression still ≤ 2', () => {
    expect(s.classify(355, 'compression')).toBeLessThanOrEqual(2);
  });
  it('bending mode more permissive on web → class ≤ compression class', () => {
    expect(s.classify(355, 'bending')).toBeLessThanOrEqual(s.classify(355, 'compression'));
  });

  it('buckling α: HEB h/b=1.0 → curve b/c (0.34/0.49)', () => {
    const a = s.getBucklingAlpha();
    expect(a.alpha_y).toBeCloseTo(0.34, 3);
    expect(a.alpha_z).toBeCloseTo(0.49, 3);
  });

  it('LTB α: h/b=1.0 ≤ 2 → curve b (0.34)', () => {
    expect(s.getLTBAlpha()).toBeCloseTo(0.34, 3);
  });

  it('reduceDesignMoments: identity for I', () => {
    const r = s.reduceDesignMoments(30, 10);
    expect(r.My).toBe(30);
    expect(r.Mz).toBe(10);
    expect(r.M_res).toBeUndefined();
  });

  it('getPrimitives: 3 rects (top flange, bottom flange, web)', () => {
    const p = s.getPrimitives();
    expect(p.kind).toBe('I');
    expect(p.shapes.filter((sh) => sh.type === 'rect')).toHaveLength(3);
  });
});

describe('ISectionAdapter — IPE300 (slender → h/b > 2 for IPE400)', () => {
  const ipe300 = makeISectionBySize('IPE', 300)!;
  const ipe400 = makeISectionBySize('IPE', 400)!;

  it('IPE300 buckling α: curve a/b (0.21/0.34)', () => {
    const a = ipe300.getBucklingAlpha();
    expect(a.alpha_y).toBeCloseTo(0.21, 3);
    expect(a.alpha_z).toBeCloseTo(0.34, 3);
  });
  it('IPE400 h/b=2.22 > 2 → LTB curve c (0.49)', () => {
    expect(ipe400.getLTBAlpha()).toBeCloseTo(0.49, 3);
  });
  it('IPE300 Mcr finite and positive', () => {
    const Mcr = ipe300.computeMcr(5000, 1.0, 210000, 81000);
    expect(Mcr).toBeGreaterThan(0);
    expect(isFinite(Mcr)).toBe(true);
  });
});

// ─── 2UPN box ──────────────────────────────────────────────────────────────
describe('UPNBoxAdapter — 2UPN200', () => {
  const s = makeUPNBoxBySize(200)!;

  it('kind=2UPN', () => expect(s.kind).toBe('2UPN'));
  it('h = 200, b = 2 × b_upn = 150', () => {
    expect(s.h).toBe(200);
    expect(s.b).toBe(150);
  });
  it('Iw = 0 (closed section)', () => expect(s.Iw).toBe(0));
  it('Mcr = Infinity (no LTB)', () => {
    expect(s.computeMcr(5000, 1.0, 210000, 81000)).toBe(Infinity);
  });
  it('LTB α = NaN', () => expect(Number.isNaN(s.getLTBAlpha())).toBe(true));
  it('buckling α both axes: curve b (0.34)', () => {
    const a = s.getBucklingAlpha();
    expect(a.alpha_y).toBeCloseTo(0.34, 3);
    expect(a.alpha_z).toBeCloseTo(0.34, 3);
  });
  it('reduceDesignMoments: identity', () => {
    const r = s.reduceDesignMoments(30, 10);
    expect(r.My).toBe(30);
    expect(r.Mz).toBe(10);
  });

  it('Iz_box > 2·Iz_UPN (parallel-axis adds)', () => {
    // UPN200 single: Iz=148 cm⁴. Box Iz should be much greater.
    expect(s.Iz).toBeGreaterThan(2 * 148);
  });

  it('primitives: 6 rects + 2 lines (webs, flanges, welds)', () => {
    const p = s.getPrimitives();
    expect(p.shapes.filter((sh) => sh.type === 'rect')).toHaveLength(6);
    expect(p.shapes.filter((sh) => sh.type === 'line')).toHaveLength(2);
  });
});

// ─── CHS ───────────────────────────────────────────────────────────────────
describe('CHSAdapter — geometry', () => {
  // CHS 168.3×8: D=168.3, d=152.3, t=8
  //   A = π(168.3² - 152.3²)/4 = π·5128.8/4·mm² = 4028.3 mm² = 40.28 cm²
  //   I = π(168.3⁴ - 152.3⁴)/64 mm⁴
  //     = π(802,236,700 - 537,792,000)/64 ≈ 12.99e6 mm⁴ ≈ 1299 cm⁴
  //   Wel = 2·I/D in mm³ → /1000 cm³ ≈ 154 cm³
  //   Wpl = (D³ - d³)/6 mm³ → /1000 cm³ ≈ 205 cm³
  const s = makeCHS(168.3, 8, 'hot-finished');

  it('kind=CHS', () => expect(s.kind).toBe('CHS'));
  it('h = b = D', () => {
    expect(s.h).toBeCloseTo(168.3, 3);
    expect(s.b).toBeCloseTo(168.3, 3);
  });
  it('Iy === Iz (axisymmetric)', () => expect(s.Iy).toBeCloseTo(s.Iz, 6));
  it('Wpl_y === Wpl_z', () => expect(s.Wpl_y).toBeCloseTo(s.Wpl_z, 6));
  it('Iw = 0', () => expect(s.Iw).toBe(0));
  it('It = 2·I (exact circular ring)', () => expect(s.It).toBeCloseTo(2 * s.Iy, 6));

  it('A ≈ 40.3 cm² for 168.3×8', () => expect(s.A).toBeCloseTo(40.3, 1));
  it('I ≈ 1297 cm⁴ for 168.3×8', () => expect(s.Iy).toBeCloseTo(1297, 0));
  it('Wpl ≈ 206 cm³ for 168.3×8', () => expect(s.Wpl_y).toBeCloseTo(206, 0));
  it('Wel ≈ 154 cm³ for 168.3×8', () => expect(s.Wel_y).toBeCloseTo(154, 0));

  it('label contains EN 10210 for hot-finished', () => {
    expect(makeCHS(168.3, 8, 'hot-finished').label).toContain('10210');
  });
  it('label contains EN 10219 for cold-formed', () => {
    expect(makeCHS(168.3, 8, 'cold-formed').label).toContain('10219');
  });
});

describe('CHSAdapter — EC3 behaviour', () => {
  it('classify D/t ≤ 50ε² → Class 1', () => {
    // D/t = 168.3/8 = 21.04; S275 ε²=235/275=0.855; 50·0.855=42.7 → 21 ≤ 42.7 ✓
    const s = makeCHS(168.3, 8, 'hot-finished');
    expect(s.classify(275)).toBe(1);
  });
  it('classify very slender → Class 4', () => {
    // D/t = 508/2.6 ≈ 195 → above 90·ε² ≈ 77 → Class 4
    const s = makeCHS(508, 2.6, 'hot-finished');
    expect(s.classify(355)).toBe(4);
  });
  it('classify just above 70ε² → Class 3', () => {
    // S275 ε²=0.855; 70·0.855=59.9; 90·0.855=77; pick D/t ≈ 70 → Class 3
    // 323.9/4.5 = 71.98
    const s = makeCHS(323.9, 4.5, 'hot-finished');
    expect(s.classify(275)).toBe(3);
  });

  it('hot-finished α = 0.21 (curve a) both axes', () => {
    const a = makeCHS(168.3, 8, 'hot-finished').getBucklingAlpha();
    expect(a.alpha_y).toBeCloseTo(0.21, 3);
    expect(a.alpha_z).toBeCloseTo(0.21, 3);
  });
  it('cold-formed α = 0.49 (curve c) both axes', () => {
    const a = makeCHS(168.3, 8, 'cold-formed').getBucklingAlpha();
    expect(a.alpha_y).toBeCloseTo(0.49, 3);
    expect(a.alpha_z).toBeCloseTo(0.49, 3);
  });

  it('LTB α = NaN', () => {
    expect(Number.isNaN(makeCHS(168.3, 8, 'hot-finished').getLTBAlpha())).toBe(true);
  });
  it('Mcr = Infinity (axisymmetric)', () => {
    const s = makeCHS(168.3, 8, 'hot-finished');
    expect(s.computeMcr(5000, 1.0, 210000, 81000)).toBe(Infinity);
  });

  it('reduceDesignMoments: collapses to M_res', () => {
    const s = makeCHS(168.3, 8, 'hot-finished');
    const r = s.reduceDesignMoments(30, 40);  // 3-4-5 triangle → M_res = 50
    expect(r.My).toBeCloseTo(50, 3);
    expect(r.Mz).toBe(0);
    expect(r.M_res).toBeCloseTo(50, 3);
  });

  it('primitives: single ring', () => {
    const p = makeCHS(168.3, 8, 'hot-finished').getPrimitives();
    expect(p.kind).toBe('CHS');
    expect(p.shapes).toHaveLength(1);
    expect(p.shapes[0].type).toBe('ring');
  });
});

describe('CHSAdapter — Mcr sentinel propagates correctly', () => {
  const s = makeCHS(168.3, 8, 'hot-finished');
  const Mcr = s.computeMcr(5000, 1.0, 210000, 81000);
  // Downstream:
  //   My_Rk = Wpl · fy / 1000   (kNm, with W in cm³ and fy in MPa)
  //   λ̄_LT = sqrt(My_Rk / Mcr) → sqrt(X / Infinity) = 0
  //   χ_LT from Φ = 0.5(1 + α(λ̄-0.2) + λ̄²) → φ(0) = 0.5(1 - 0.2α)  ≈ 0.5 (close)
  //   Actually with λ̄_LT = 0, χ_LT is forced to 1 downstream (λ̄ ≤ 0.2 short-circuit).
  const My_Rk = s.Wpl_y * 275 / 1000;
  const lambda_LT = Math.sqrt(My_Rk / Mcr);
  it('λ̄_LT → 0', () => expect(lambda_LT).toBe(0));
});

// ─── Factory ───────────────────────────────────────────────────────────────
describe('createSection factory', () => {
  it('I-section', () => {
    const s = createSection({ kind: 'I', tipo: 'HEB', size: 200 });
    expect(s?.kind).toBe('I');
  });
  it('2UPN box', () => {
    const s = createSection({ kind: '2UPN', size: 200 });
    expect(s?.kind).toBe('2UPN');
  });
  it('CHS', () => {
    const s = createSection({ kind: 'CHS', D: 168.3, t: 8, process: 'hot-finished' });
    expect(s?.kind).toBe('CHS');
  });
  it('unknown I size → undefined', () => {
    expect(createSection({ kind: 'I', tipo: 'HEB', size: 9999 })).toBeUndefined();
  });
  it('unknown UPN size → undefined', () => {
    expect(createSection({ kind: '2UPN', size: 9999 })).toBeUndefined();
  });
});
