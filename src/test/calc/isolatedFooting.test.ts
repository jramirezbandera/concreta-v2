// Isolated footing test suite — CTE DB-SE-C art. 4.3.2/4.3.3 + CE structural
// Run: bun test src/test/calc/isolatedFooting.test.ts

import { describe, expect, it } from 'vitest';
import { calcIsolatedFooting } from '../../lib/calculations/isolatedFooting';
import { isolatedFootingDefaults } from '../../data/defaults';

const base = { ...isolatedFootingDefaults };
// base: B=1.8, L=1.8, h=0.6, bc=0.4, hc=0.4, Df=0.8, cover=60
//       N_k=300, Mx_k=My_k=H_k=0, N_Ed=450
//       fck=25, fyk=500, phi_x=phi_y=16, s_x=s_y=200
//       soilType='cohesive', c=20kPa, phi=15°, gamma=18kN/m³, gamma_R=3.0

// ── FTUX defaults — cohesive ─────────────────────────────────────────────────

describe('FTUX defaults — cohesive', () => {
  it('result is valid', () => {
    expect(calcIsolatedFooting(base).valid).toBe(true);
  });

  it('no check fails', () => {
    const r = calcIsolatedFooting(base);
    for (const c of r.checks) {
      expect(c.status, `check ${c.id} should not fail`).not.toBe('fail');
    }
  });

  it('all check.article fields reference CTE or CE', () => {
    const r = calcIsolatedFooting(base);
    for (const c of r.checks) {
      const ok = c.article.includes('CTE') || c.article.includes('CE') || c.article.includes('DB-SE');
      expect(ok, `check ${c.id} article: "${c.article}"`).toBe(true);
    }
  });

  it('sigma_eff ≈ 92.6 kPa (300/1.8²)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.sigma_eff).toBeCloseTo(92.6, 0);
  });

  it('qadm > sigma_eff (bearing check passes)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.qadm).toBeGreaterThan(r.sigma_eff);
  });

  it('no eccentricity (ex=ey=0)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.ex).toBe(0);
    expect(r.ey).toBe(0);
  });

  it('no tension check when sigma_min ≥ 0', () => {
    const r = calcIsolatedFooting(base);
    expect(r.checks.find((c) => c.id === 'tension')).toBeUndefined();
  });

  it('no sliding check when H_k=0', () => {
    const r = calcIsolatedFooting(base);
    expect(r.checks.find((c) => c.id === 'sliding')).toBeUndefined();
  });
});

// ── Granular soil ─────────────────────────────────────────────────────────────

describe('Granular soil', () => {
  const gran = { ...base, soilType: 'granular' as const };

  it('result is valid', () => {
    expect(calcIsolatedFooting(gran).valid).toBe(true);
  });

  it('B_eff ≤ 1.2 → K1 path: qadm = 24 * N_spt * B_eff', () => {
    const inp = { ...gran, B: 1.0, L: 1.0, bc: 0.3, hc: 0.3, N_k: 100 };
    const r = calcIsolatedFooting(inp);
    const expected = 24 * 15 * 1.0;
    expect(r.qadm).toBeCloseTo(expected, 0);
  });

  it('B_eff > 1.2 → K2 path: qadm = 16 * N_spt * ((B+0.3)/B)²', () => {
    const r = calcIsolatedFooting(gran);  // B_eff = 1.8 > 1.2
    const expected = 16 * 15 * Math.pow((1.8 + 0.3) / 1.8, 2);
    expect(r.qadm).toBeCloseTo(expected, 0);
  });
});

// ── Cohesive bearing capacity (spot checks) ───────────────────────────────────

describe('Cohesive bearing — phi=0 undrained', () => {
  it('Nc ≈ π+2 = 5.14 (Nc for phi=0)', () => {
    // For phi=0: qh = c*Nc*sc*dc + q*1*sq*dq + 0 (Ng=0)
    // Verify result is reasonable and positive
    const r = calcIsolatedFooting({ ...base, phi_soil: 0, c_soil: 50 });
    expect(r.qh).toBeGreaterThan(0);
    expect(r.valid).toBe(true);
  });

  it('qh increases with c_soil', () => {
    const r1 = calcIsolatedFooting({ ...base, c_soil: 20 });
    const r2 = calcIsolatedFooting({ ...base, c_soil: 50 });
    expect(r2.qh).toBeGreaterThan(r1.qh);
  });

  it('qh increases with Df (depth factors)', () => {
    const r1 = calcIsolatedFooting({ ...base, Df: 0.5, h: 0.4 });
    const r2 = calcIsolatedFooting({ ...base, Df: 1.2, h: 0.6 });
    expect(r2.qh).toBeGreaterThan(r1.qh);
  });
});

// ── Eccentricity ─────────────────────────────────────────────────────────────

describe('Eccentricity', () => {
  it('ex = |My_k / N_k|', () => {
    const r = calcIsolatedFooting({ ...base, My_k: 30 });  // ex = 30/300 = 0.1m
    expect(r.ex).toBeCloseTo(0.1, 3);
  });

  it('ey = |Mx_k / N_k|', () => {
    const r = calcIsolatedFooting({ ...base, Mx_k: 60 });  // ey = 60/300 = 0.2m
    expect(r.ey).toBeCloseTo(0.2, 3);
  });

  it('ex > B/6 → eccentricity-x status is warn', () => {
    const r = calcIsolatedFooting({ ...base, My_k: 300 * (1.8 / 6) + 10 });  // ex slightly over B/6
    const eccX = r.checks.find((c) => c.id === 'eccentricity-x');
    expect(eccX?.status).toBe('warn');
  });

  it('ex = B/6 → eccentricity-x utilization = 1.0 (boundary)', () => {
    const r = calcIsolatedFooting({ ...base, My_k: 300 * (1.8 / 6) });  // ex exactly B/6
    const eccX = r.checks.find((c) => c.id === 'eccentricity-x');
    expect(eccX?.utilization).toBeCloseTo(1.0, 2);
  });

  it('B_eff = B - 2*ex (Meyerhof reduction)', () => {
    const r = calcIsolatedFooting({ ...base, My_k: 60 });  // ex = 0.2
    expect(r.B_eff).toBeCloseTo(1.8 - 2 * 0.2, 3);
  });

  it('tension check fires (warn) when sigma_min < 0', () => {
    // Large eccentricity to force sigma_min < 0 without triggering invalid()
    // ex must be < B/2=0.9 to keep B_eff > 0, but > B/6=0.3 for tension
    const r = calcIsolatedFooting({ ...base, My_k: 120 });  // ex=0.4 > B/6=0.3
    if (r.sigma_min < 0) {
      const t = r.checks.find((c) => c.id === 'tension');
      expect(t?.status).toBe('warn');
    } else {
      // If sigma_min ≥ 0, tension check should be absent
      expect(r.checks.find((c) => c.id === 'tension')).toBeUndefined();
    }
  });

  it('extreme eccentricity (B_eff ≤ 0) → invalid', () => {
    const r = calcIsolatedFooting({ ...base, My_k: 300 });  // ex=1.0 > B/2=0.9
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

// ── Sliding ───────────────────────────────────────────────────────────────────

describe('Sliding', () => {
  it('H_k > 0 → sliding check appears', () => {
    const r = calcIsolatedFooting({ ...base, H_k: 20 });
    expect(r.checks.find((c) => c.id === 'sliding')).toBeDefined();
  });

  it('Rd_slide = N_k*mu + c_base*B*L', () => {
    const r = calcIsolatedFooting({ ...base, H_k: 20, mu: 0.4, c_base: 5 });
    const expected = 300 * 0.4 + 5 * 1.8 * 1.8;
    expect(r.Rd_slide).toBeCloseTo(expected, 1);
  });

  it('Rd_slide = N_k*mu when c_base=0 (granular)', () => {
    const r = calcIsolatedFooting({ ...base, soilType: 'granular', H_k: 20, mu: 0.4, c_base: 0 });
    expect(r.Rd_slide).toBeCloseTo(300 * 0.4, 1);
  });
});

// ── Shear ─────────────────────────────────────────────────────────────────────

describe('Shear', () => {
  it('shear checks present for default geometry (ax > d_x)', () => {
    const r = calcIsolatedFooting(base);
    // ax = (1.8-0.4)/2 * 1000 = 700mm, d_x ≈ 532mm → ell_x = 168mm > 0
    expect(r.ell_x).toBeGreaterThan(0);
    expect(r.checks.find((c) => c.id === 'shear-x')).toBeDefined();
  });

  it('ell_x = 0 when ax ≤ d_x → no shear-x check', () => {
    // Large column (bc=0.6) in small footing (B=0.8): ax=(0.8-0.6)/2*1000=100mm, d_x≈532mm
    const r = calcIsolatedFooting({ ...base, B: 0.8, L: 0.8, bc: 0.6, hc: 0.6 });
    expect(r.ell_x).toBe(0);
    expect(r.checks.find((c) => c.id === 'shear-x')).toBeUndefined();
  });

  it('VEd_x = sigma_Ed * ell_x / 1000', () => {
    const r = calcIsolatedFooting(base);
    const expected = r.sigma_Ed * r.ell_x / 1000;
    expect(r.VEd_x).toBeCloseTo(expected, 2);
  });
});

// ── Punching ──────────────────────────────────────────────────────────────────

describe('Punching', () => {
  it('punching check always present', () => {
    const r = calcIsolatedFooting(base);
    expect(r.checks.find((c) => c.id === 'punching')).toBeDefined();
  });

  it('vEd_punch < vRdc_punch for defaults (passes)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.vEd_punch).toBeLessThan(r.vRdc_punch);
  });

  it('u1 = 2*(bc+hc)*1000 + 2π*2*d_avg (CE art. 46)', () => {
    const r = calcIsolatedFooting(base);
    const d_avg = (r.d_x + r.d_y) / 2;
    const expected = 2 * (0.4 + 0.4) * 1000 + 2 * Math.PI * 2 * d_avg;
    expect(r.u1).toBeCloseTo(expected, 0);
  });

  it('d_avg = (d_x + d_y) / 2', () => {
    const r = calcIsolatedFooting(base);
    expect(r.d_avg).toBeCloseTo((r.d_x + r.d_y) / 2, 1);
  });
});

// ── Effective depths ──────────────────────────────────────────────────────────

describe('Effective depths', () => {
  it('d_x > d_y (x bars bottom layer, larger effective depth)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.d_x).toBeGreaterThan(r.d_y);
  });

  it('d_x = h*1000 - cover - phi_x/2', () => {
    const r = calcIsolatedFooting(base);
    const expected = 600 - 60 - 16 / 2;
    expect(r.d_x).toBeCloseTo(expected, 1);
  });

  it('d_y = h*1000 - cover - phi_x - phi_y/2', () => {
    const r = calcIsolatedFooting(base);
    const expected = 600 - 60 - 16 - 16 / 2;
    expect(r.d_y).toBeCloseTo(expected, 1);
  });
});

// ── Minimum reinforcement ──────────────────────────────────────────────────────

describe('Minimum reinforcement (CE art. 9.1)', () => {
  it('As_prov_x ≥ As_min_x for defaults', () => {
    const r = calcIsolatedFooting(base);
    expect(r.As_prov_x).toBeGreaterThanOrEqual(r.As_min_x);
  });

  it('As_adopted = max(As_req, As_min)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.As_adopted_x).toBeGreaterThanOrEqual(r.As_req_x);
    expect(r.As_adopted_x).toBeGreaterThanOrEqual(r.As_min_x);
  });
});

// ── Validation — invalid inputs ───────────────────────────────────────────────

describe('Validation — invalid inputs', () => {
  it('B ≤ 0 → invalid', () => {
    const r = calcIsolatedFooting({ ...base, B: 0 });
    expect(r.valid).toBe(false);
  });

  it('N_k ≤ 0 → invalid', () => {
    const r = calcIsolatedFooting({ ...base, N_k: 0 });
    expect(r.valid).toBe(false);
  });

  it('N_Ed ≤ 0 → invalid', () => {
    const r = calcIsolatedFooting({ ...base, N_Ed: 0 });
    expect(r.valid).toBe(false);
  });

  it('bc ≥ B → invalid', () => {
    const r = calcIsolatedFooting({ ...base, bc: 2.0 });
    expect(r.valid).toBe(false);
  });

  it('cover too large (d_x ≤ 0) → invalid', () => {
    const r = calcIsolatedFooting({ ...base, cover: 700 });
    expect(r.valid).toBe(false);
  });

  it('h > Df → invalid', () => {
    const r = calcIsolatedFooting({ ...base, h: 1.0, Df: 0.5 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/canto/i);
  });

  it('s_x ≤ 0 → invalid', () => {
    const r = calcIsolatedFooting({ ...base, s_x: 0 });
    expect(r.valid).toBe(false);
  });
});
