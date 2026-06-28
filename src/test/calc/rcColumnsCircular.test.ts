// Tests for the CIRCULAR RC column engine (true fork — calcRCColumnCirc).
// Anejo 19 / EC2. The rectangular suite (rcColumns.test.ts) stays untouched;
// here we cover the circular-only paths: segment concrete, resultant 2nd-order
// eccentricity (no phantom √2 — decision T2), chord bar spacing, checks, guards
// and the single N-M envelope.

import { describe, it, expect } from 'vitest';
import {
  calcRCColumn,
  buildColumnInteraction,
  segmentConcrete,
  NBARS_MIN_CIRC,
} from '../../lib/calculations/rcColumns';
import { rcColumnDefaults } from '../../data/defaults';
import { getConcrete, getFyd, Es } from '../../data/materials';

const D0 = rcColumnDefaults;
function circ(overrides: Partial<typeof D0> = {}): typeof D0 {
  return { ...D0, sectionType: 'circular', ...overrides } as typeof D0;
}

const ecu3 = 0.0035;

// Independent strip-integration reference for the circular Whitney segment.
// Different method than the engine's closed form → genuine cross-check.
function segmentRef(D: number, x: number, fcd: number, N = 20000) {
  const R = D / 2;
  const a = Math.min(0.8 * x, D);
  if (a <= 0) return { Nc: 0, yc: 0 };
  const dy = a / N;
  let area = 0, moment = 0;
  for (let i = 0; i < N; i++) {
    const y = (i + 0.5) * dy;
    const w = 2 * Math.sqrt(Math.max(0, R * R - (y - R) * (y - R)));
    const dA = w * dy;
    area += dA;
    moment += dA * y;
  }
  return { Nc: fcd * area, yc: moment / area };
}

// ── segmentConcrete — closed form vs independent strip reference ─────────────
describe('segmentConcrete (Whitney circular segment)', () => {
  const D = 400, fcd = 16.667, R = 200;

  // a = 0.8·x ⇒ for a/D = k, x = 1.25·k·D. Full compression (a=D) at x = 1.25·D.
  for (const k of [0.1, 0.3, 0.5, 0.8, 1.0]) {
    it(`area & centroid match strip reference at a/D=${k}`, () => {
      const x = 1.25 * k * D;
      const got = segmentConcrete(D, x, fcd);
      const ref = segmentRef(D, x, fcd);
      expect(got.Nc).toBeCloseTo(ref.Nc, -1);        // ~within 10 N·(scale) → rel <0.5%
      expect(got.Nc / ref.Nc).toBeCloseTo(1, 2);     // <0.5% on force
      expect(got.yc / ref.yc).toBeCloseTo(1, 2);     // <0.5% on centroid (drives MRd)
    });
  }

  it('full compression Nc = fcd·πR² is reached at x ≥ 1.25·D (not x = D)', () => {
    const atD = segmentConcrete(D, D, fcd).Nc;        // a = 0.8D → segmento, NO círculo
    const at125 = segmentConcrete(D, 1.25 * D, fcd).Nc; // a = D → círculo completo
    const full = fcd * Math.PI * R * R;
    expect(at125).toBeCloseTo(full, -1);
    expect(atD).toBeLessThan(full * 0.97);            // a 0.8D el área es claramente menor
  });

  it('a→0 (x→0) gives zero force', () => {
    expect(segmentConcrete(D, 0, fcd).Nc).toBe(0);
  });

  it('full-circle centroid sits at the section centre (yc = R)', () => {
    expect(segmentConcrete(D, 1.25 * D, fcd).yc).toBeCloseTo(R, 3);
  });
});

// ── Slenderness oracle ───────────────────────────────────────────────────────
describe('Circular column — slenderness', () => {
  it('λ = Lk/(D/4) = 35.0 for D=400, L=3.5, β=1', () => {
    const r = calcRCColumn(circ({ D: 400, L: 3.5, beta: 1 }));
    expect(r.valid).toBe(true);
    expect(r.lambda).toBeCloseTo(35.0, 1);
    expect(r.lambda_y).toBeCloseTo(r.lambda_z, 6); // single slenderness mirrored
  });
});

// ── Polar symmetry + resultant moment ────────────────────────────────────────
describe('Circular column — polar symmetry & resultant', () => {
  it('swapping MEdy↔MEdz leaves M_res, MRd and resUtil unchanged', () => {
    const a = calcRCColumn(circ({ D: 400, nBarsCirc: 8, circBarDiam: 20, MEdy: 30, MEdz: 10 }));
    const b = calcRCColumn(circ({ D: 400, nBarsCirc: 8, circBarDiam: 20, MEdy: 10, MEdz: 30 }));
    expect(a.M_res).toBeCloseTo(b.M_res!, 6);
    expect(a.MRd).toBeCloseTo(b.MRd!, 6);
    expect(a.resUtil).toBeCloseTo(b.resUtil!, 6);
  });

  it('off-axis rotation (My=Mz) gives same M_res as the equivalent single resultant', () => {
    // M1 = √(40²+40²) = 56.57 about the resultant direction.
    const diag = calcRCColumn(circ({ D: 450, nBarsCirc: 8, MEdy: 40, MEdz: 40 }));
    const single = calcRCColumn(circ({ D: 450, nBarsCirc: 8, MEdy: Math.hypot(40, 40), MEdz: 0 }));
    expect(diag.M_res).toBeCloseTo(single.M_res!, 4);
    expect(diag.MRd).toBeCloseTo(single.MRd!, 4);
  });

  it('odd bar count stays valid and symmetric under swap', () => {
    const a = calcRCColumn(circ({ D: 400, nBarsCirc: 7, MEdy: 25, MEdz: 12 }));
    const b = calcRCColumn(circ({ D: 400, nBarsCirc: 7, MEdy: 12, MEdz: 25 }));
    expect(a.valid).toBe(true);
    expect(a.M_res).toBeCloseTo(b.M_res!, 6);
  });
});

// ── T2: resultant-direction eccentricity, NO phantom √2 ──────────────────────
describe('Circular column — 2nd-order eccentricity (T2)', () => {
  it('pure axial uses ONE minimum ecc + ONE imperfection (no √2 inflation)', () => {
    // D=700 ⇒ e1 = D/30 = 23.33 mm (dominates the 20 mm floor).
    // Short (λ small) ⇒ e2 = 0. e_imp = Lk/400 = 2.5 mm. e_tot = 25.83 mm.
    // M_res = Nd·e_tot = 500e3 · 25.83 / 1e6 = 12.92 kNm. A per-axis hypot bug
    // would return √2·12.92 ≈ 18.3 kNm.
    const r = calcRCColumn(circ({ D: 700, L: 1.0, beta: 1, Nd: 500, MEdy: 0, MEdz: 0 }));
    expect(r.valid).toBe(true);
    expect(r.e2_y).toBe(0);
    expect(r.M_res).toBeCloseTo(12.92, 1);
  });

  it('short vs slender: e2 = 0 below λ_lim, e2 > 0 above', () => {
    const short = calcRCColumn(circ({ D: 400, L: 1.0, beta: 1 }));   // λ = 10
    const slender = calcRCColumn(circ({ D: 400, L: 5.0, beta: 1 })); // λ = 50
    expect(short.e2_y).toBe(0);
    expect(slender.e2_y).toBeGreaterThan(0);
  });
});

// ── Section model: NRd,max hand-check + reinforcement scaling ─────────────────
describe('Circular column — section model', () => {
  it('NRd,max matches hand calc (D=400, fck=25, 8Ø20)', () => {
    // fcd=16.667, Ac=π·200²=125663.7, As=8·π·100=2513.27, f_yc,d=min(434.8,400)=400.
    // NRd,max = 16.667·(125663.7−2513.27) + 400·2513.27 = 3.058e6 N.
    const r = calcRCColumn(circ({ D: 400, nBarsCirc: 8, circBarDiam: 20, Nd: 800 }));
    expect(r.NRd_max).toBeCloseTo(3058, -1); // kN, within ~10 kN
  });

  it('more bars ⇒ more steel ⇒ higher NRd,max and MRd', () => {
    const few = calcRCColumn(circ({ D: 450, nBarsCirc: 6, circBarDiam: 20, MEdy: 40 }));
    const many = calcRCColumn(circ({ D: 450, nBarsCirc: 12, circBarDiam: 20, MEdy: 40 }));
    expect(many.As_total).toBeGreaterThan(few.As_total);
    expect(many.NRd_max).toBeGreaterThan(few.NRd_max);
    expect(many.MRd!).toBeGreaterThan(few.MRd!);
  });

  it('end-to-end: reconstruct N,M at x_star from segmentConcrete + bar ring', () => {
    const fcd = getConcrete(25).fcd, fyd = getFyd(500), D = 400, R = 200;
    const cover = 30, stirrup = 6, phi = 20, n = 8;
    const Nd = 800;
    const r = calcRCColumn(circ({ D, nBarsCirc: n, circBarDiam: phi, Nd, MEdy: 60, MEdz: 0 }));
    expect(r.valid).toBe(true);
    const x = r.x_star!;
    const r_s = (D - 2 * cover - 2 * stirrup - phi) / 2;
    const Abar = Math.PI * (phi / 2) ** 2;
    const { Nc, yc } = segmentConcrete(D, x, fcd);
    let NRd = Nc, MRd = Nc * (D / 2 - yc);
    for (let i = 0; i < n; i++) {
      const y = R - r_s * Math.cos((2 * Math.PI * i) / n);
      const sig = Math.max(-fyd, Math.min(fyd, Es * ecu3 * (x - y) / x));
      NRd += Abar * sig;
      MRd += Abar * sig * (D / 2 - y);
    }
    expect(NRd).toBeCloseTo(Nd * 1e3, -2);          // equilibrio axial en x_star
    expect(MRd / 1e6).toBeCloseTo(r.MRd!, 1);       // momento resistente reconstruido
  });
});

// ── Checks: presence/absence + specific rules ────────────────────────────────
describe('Circular column — checks', () => {
  const ids = (overrides = {}) => calcRCColumn(circ(overrides)).checks.map((c) => c.id);

  it('has circular checks and omits rectangular ones', () => {
    const present = ids();
    for (const id of ['lambda', 'flexion-check', 'nm-res', 'bar-spacing-circ',
      'as-min', 'as-max', 'nBars-min', 'stirrup-diam', 'stirrup-spacing', 'nd-max']) {
      expect(present).toContain(id);
    }
    for (const id of ['lambda-z', 'cond-5.38a', 'cond-5.38b', 'bar-spacing-y',
      'bar-spacing-x', 'biaxial-check', 'nm-y', 'nm-z']) {
      expect(present).not.toContain(id);
    }
  });

  it('bar-spacing uses the chord and fails on a tight ring', () => {
    const r = calcRCColumn(circ({ D: 300, nBarsCirc: 20, circBarDiam: 20 }));
    const c = r.checks.find((ch) => ch.id === 'bar-spacing-circ')!;
    expect(c.status).toBe('fail');
  });

  it('stirrup-spacing least dimension is D for circular', () => {
    const r = calcRCColumn(circ({ D: 200, circBarDiam: 20, stirrupSpacing: 210 }));
    const c = r.checks.find((ch) => ch.id === 'stirrup-spacing')!;
    expect(c.limit).toContain('200'); // min(12·20=240, D=200, 300) = 200
    expect(c.status).toBe('fail');    // 210 > 200
  });

  it('nBars-min enforces the Anejo 19 minimum of 4', () => {
    expect(NBARS_MIN_CIRC).toBe(4);
    const ok = calcRCColumn(circ({ nBarsCirc: 4 }));
    expect(ok.checks.find((c) => c.id === 'nBars-min')!.status).toBe('ok');
  });
});

// ── Overload + axial branches ────────────────────────────────────────────────
describe('Circular column — overload & axial branches', () => {
  it('flexion-check fails under a large moment', () => {
    const r = calcRCColumn(circ({ D: 300, nBarsCirc: 6, MEdy: 400, MEdz: 0 }));
    const c = r.checks.find((ch) => ch.id === 'flexion-check')!;
    expect(c.status).toBe('fail');
  });

  it('nd-max fails (crushing) under a huge axial load', () => {
    const r = calcRCColumn(circ({ D: 300, Nd: 12000 }));
    const c = r.checks.find((ch) => ch.id === 'nd-max')!;
    expect(c.status).toBe('fail');
  });
});

// ── Guards ───────────────────────────────────────────────────────────────────
describe('Circular column — guards', () => {
  it('invalid when r_s ≤ 0 (diameter too small for cover+bars)', () => {
    const r = calcRCColumn(circ({ D: 80 }));
    expect(r.valid).toBe(false);
  });

  it('invalid when n < minimum bars', () => {
    const r = calcRCColumn(circ({ nBarsCirc: 3 }));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/barras/);
  });
});

// ── High-axial gap-zone (regression: NRd_Whitney must use full Ac) ───────────
describe('Circular column — high axial / Whitney saturation', () => {
  // D=350, fck=25 (fcd=16.667), 6Ø16: NRd_max≈2066 kN. The OLD NRd_Whitney
  // (0.8·fcd·Ac) was ≈1807 kN, so a valid load like 1950 kN (ned≈0.94) wrongly
  // entered the gap-zone branch and collapsed MRd to ~0.5 kNm. With NRd_Whitney
  // = fcd·Ac + As·fyd the bisection runs and MRd stays substantial.
  const hi = circ({ D: 350, nBarsCirc: 6, circBarDiam: 16, Nd: 1950, MEdy: 10, MEdz: 0 });

  it('MRd does NOT collapse for a valid high-axial load (gap-zone fired too early)', () => {
    const r = calcRCColumn(hi);
    expect(r.valid).toBe(true);
    const ndMax = r.checks.find((c) => c.id === 'nd-max')!;
    expect(ndMax.status).toBe('ok');           // 1950 < NRd_max ⇒ not crushing
    expect(r.MRd!).toBeGreaterThan(3);          // collapsed value was ~0.5 kNm
  });

  it('reinforced interaction envelope is monotonic in N and does not overshoot NRd_max', () => {
    const r = calcRCColumn(hi);
    const env = buildColumnInteraction(hi, r).y!.reinforced;
    for (let i = 1; i < env.length; i++) {
      expect(env[i].N).toBeGreaterThanOrEqual(env[i - 1].N - 1e-6);  // monótona
    }
    const maxN = Math.max(...env.map((p) => p.N));
    expect(maxN).toBeLessThanOrEqual(r.NRd_max + 1);                  // sin sobrepasar NRd_max
  });
});

// ── Interaction envelope (single curve) ──────────────────────────────────────
describe('Circular column — interaction diagram', () => {
  it('builds one envelope (y), z is null, closes at NRd,max', () => {
    const inp = circ({ D: 400, nBarsCirc: 8, circBarDiam: 20, Nd: 800, MEdy: 60 });
    const result = calcRCColumn(inp);
    const it_ = buildColumnInteraction(inp, result);
    expect(it_.valid).toBe(true);
    expect(it_.y).not.toBeNull();
    expect(it_.z).toBeNull();
    expect(it_.y!.reinforced.length).toBeGreaterThanOrEqual(2);
    const last = it_.y!.reinforced[it_.y!.reinforced.length - 1];
    expect(last.N).toBeCloseTo(result.NRd_max, -1);
    expect(last.M).toBeCloseTo(0, 3);
  });
});

// ── Backward compatibility ───────────────────────────────────────────────────
describe('Circular column — backward compatibility', () => {
  it('input without sectionType is treated as rectangular', () => {
    const { sectionType: _omit, ...noType } = rcColumnDefaults;
    const r = calcRCColumn(noType as typeof rcColumnDefaults);
    expect(r.sectionType).toBe('rectangular');
    expect(r.valid).toBe(true);
    const explicit = calcRCColumn({ ...rcColumnDefaults, sectionType: 'rectangular' });
    expect(r.As_total).toBeCloseTo(explicit.As_total, 6);
    expect(r.MRdy).toBeCloseTo(explicit.MRdy, 6);
  });
});
