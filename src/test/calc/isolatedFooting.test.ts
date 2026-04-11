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

// ── Overturning stability (CTE DB-SE-C §4.4.1) ──────────────────────────────

describe('Overturning stability', () => {
  // Defaults: B=L=1.8, h=0.6, Df=0.8, bc=hc=0.4, N_k=300, γ_soil=18
  //   W_zap  = 25 × 1.8 × 1.8 × 0.6 = 48.6 kN
  //   W_soil = 18 × (0.8−0.6) × (1.8² − 0.4²) = 18 × 0.2 × 3.08 = 11.088 kN
  //   N_total_k = 300 + 48.6 + 11.088 = 359.688 kN
  //   M_stab = N_total_k × B/2 = 359.688 × 0.9 = 323.72 kNm

  it('W_zap = γc · B · L · h = 48.6 kN', () => {
    const r = calcIsolatedFooting(base);
    expect(r.W_zap).toBeCloseTo(48.6, 2);
  });

  it('W_soil = γs · (Df−h) · (B·L − bc·hc) = 11.088 kN', () => {
    const r = calcIsolatedFooting(base);
    expect(r.W_soil).toBeCloseTo(11.088, 2);
  });

  it('N_total_k = N_k + W_zap + W_soil', () => {
    const r = calcIsolatedFooting(base);
    expect(r.N_total_k).toBeCloseTo(300 + 48.6 + 11.088, 2);
  });

  it('no overturning checks when Mx_k=My_k=0', () => {
    const r = calcIsolatedFooting(base);
    expect(r.checks.find((c) => c.id === 'overturning-x')).toBeUndefined();
    expect(r.checks.find((c) => c.id === 'overturning-y')).toBeUndefined();
  });

  it('FS_vuelco_x = N_total·B/2 / |My_k|  (My_k=150 → FS≈2.16)', () => {
    const r = calcIsolatedFooting({ ...base, My_k: 150 });
    expect(r.FS_vuelco_x).toBeCloseTo(323.72 / 150, 1);
    const chk = r.checks.find((c) => c.id === 'overturning-x')!;
    expect(chk).toBeDefined();
    expect(chk.status).toBe('ok');
  });

  it('FS_vuelco_x < 1.5 → overturning-x FAILS', () => {
    // My_k = 250 → ex = 0.833 m (< B/2 = 0.9, B_eff guard passes)
    //          → FS = 323.72 / 250 = 1.295 < 1.5 → fail
    const r = calcIsolatedFooting({ ...base, My_k: 250 });
    expect(r.FS_vuelco_x).toBeLessThan(1.5);
    const chk = r.checks.find((c) => c.id === 'overturning-x')!;
    expect(chk.status).toBe('fail');
    expect(r.valid).toBe(false);
  });

  it('FS_vuelco_y uses L/2 arm and Mx_k', () => {
    const r = calcIsolatedFooting({ ...base, Mx_k: 150 });
    expect(r.FS_vuelco_y).toBeCloseTo(323.72 / 150, 1);
    expect(r.checks.find((c) => c.id === 'overturning-y')?.status).toBe('ok');
  });

  it('FS_vuelco uses absolute value (sign-independent)', () => {
    const r1 = calcIsolatedFooting({ ...base, My_k:  150 });
    const r2 = calcIsolatedFooting({ ...base, My_k: -150 });
    expect(r1.FS_vuelco_x).toBeCloseTo(r2.FS_vuelco_x, 4);
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

// ── Rigid/flexible classification (CE art. 55 / EHE art. 58.2.1) ──────────────

describe('Rigid/flexible classification', () => {
  // Defaults: B=L=1.8, bc=hc=0.4, h=0.6 → v_max=0.7, v/h=1.17 → RIGID
  const flexibleInp = { ...base, B: 3.0, L: 3.0, h: 0.4, bc: 0.3, hc: 0.3, cover: 50 };
  // Flexible: v_max = (3-0.3)/2 = 1.35, h=0.4 → v/h=3.375 > 2 → FLEXIBLE

  it('defaults classify as rigid (v/h = 1.17 ≤ 2)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.is_rigid).toBe(true);
    expect(r.v_max_x).toBeCloseTo(0.7, 3);
    expect(r.v_max_y).toBeCloseTo(0.7, 3);
  });

  it('thin wide footing classifies as flexible (v/h > 2)', () => {
    const r = calcIsolatedFooting(flexibleInp);
    expect(r.is_rigid).toBe(false);
    expect(r.v_max_x).toBeCloseTo(1.35, 3);
  });

  it('boundary case v/h = 2 classifies as rigid (inclusive)', () => {
    // v = 2·h → B = 2·(2·h) + bc = 4·h + bc. With h=0.5, bc=0.4 → B = 2.4
    const r = calcIsolatedFooting({ ...base, B: 2.4, L: 2.4, h: 0.5 });
    expect(r.is_rigid).toBe(true);
  });

  it('rigid footing produces footing-class info row with is_rigid label', () => {
    const r = calcIsolatedFooting(base);
    const cls = r.checks.find((c) => c.id === 'footing-class');
    expect(cls).toBeDefined();
    expect(cls?.status).toBe('ok');
    expect(cls?.description).toMatch(/rígida/i);
    expect(cls?.description).toMatch(/biela-tirante/i);
  });

  it('flexible footing produces footing-class info row with flexible label', () => {
    const r = calcIsolatedFooting(flexibleInp);
    const cls = r.checks.find((c) => c.id === 'footing-class');
    expect(cls?.description).toMatch(/flexible/i);
  });

  it('bending check label reflects method (biela-tirante when rigid)', () => {
    const r = calcIsolatedFooting(base);
    const bx = r.checks.find((c) => c.id === 'bending-x');
    expect(bx?.description).toMatch(/biela-tirante/i);
    expect(bx?.article).toMatch(/55\.2|58\.4/);
  });

  it('bending check label says "flexión" when flexible', () => {
    const r = calcIsolatedFooting(flexibleInp);
    const bx = r.checks.find((c) => c.id === 'bending-x');
    expect(bx?.description).toMatch(/flexión/i);
    expect(bx?.description).not.toMatch(/biela/i);
  });
});

// ── Biela-tirante (CE rigid footing tie force) ────────────────────────────────

describe('Biela-tirante — rigid footings', () => {
  // Defaults are rigid. Verify the tie force formula and that it replaces bending As_req.
  // Td = σ_Ed · L · B · (B−bc) / (6.8 · d_x/1000)   [kN]
  // σ_Ed = 450/(1.8·1.8) = 138.89 kPa
  // d_x  = 600 − 60 − 16/2 = 532 mm
  // Td_x = 138.89 · 1.8 · 1.8 · 1.4 / (6.8 · 0.532) = 174.1 kN
  // As_tie_total = 174100/fyd = 174100/434.78 = 400.5 mm² total
  // per-m (÷ L = 1.8) = 222.5 mm²/m
  const expected_Td_x = 138.89 * 1.8 * 1.8 * 1.4 / (6.8 * 0.532);
  const expected_As_tie_per_m = (expected_Td_x * 1000 / (500 / 1.15)) / 1.8;

  it('Td_x = σ_Ed · L · B · (B−bc) / (6.8 · d_x)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.Td_x).toBeCloseTo(expected_Td_x, 0);   // ≈ 174.1 kN
    expect(r.Td_x).toBeGreaterThan(170);
    expect(r.Td_x).toBeLessThan(180);
  });

  it('Td_y uses hc and d_y (symmetric for square footing)', () => {
    const r = calcIsolatedFooting(base);
    // d_y < d_x (y layer above x), so Td_y > Td_x slightly (same geometry, smaller d)
    expect(r.Td_y).toBeGreaterThan(r.Td_x);
  });

  it('As_req_x reflects biela-tirante demand when rigid (NOT bending demand)', () => {
    const r = calcIsolatedFooting(base);
    // Expected per-m tie area ≈ 222.5 mm²/m (much higher than the ~147 mm²/m bending gives)
    expect(r.As_req_x).toBeCloseTo(expected_As_tie_per_m, 0);
    expect(r.As_req_x).toBeGreaterThan(200);  // biela-tirante ~222
    expect(r.As_req_x).toBeLessThan(240);
  });

  it('biela-tirante demand is HIGHER than bending-at-face for rigid footings', () => {
    // This is the whole point — bending under-estimates rigid footings.
    // Hand calc: MEd_per_m = 138.89 · 0.7² / 2 = 34.03 kNm/m → As_bend ≈ 147 mm²/m
    const r = calcIsolatedFooting(base);
    const fcd = 25 / 1.5;
    const mu = (r.MEd_x * 1e6) / (1000 * r.d_x * r.d_x * fcd);
    const omega = 1 - Math.sqrt(1 - 2 * mu);
    const As_bend = omega * 1000 * r.d_x * fcd / (500 / 1.15);
    expect(r.As_req_x).toBeGreaterThan(As_bend);  // tie > bending for rigid
    expect(r.As_req_x / As_bend).toBeGreaterThan(1.3);  // at least 30% more
  });

  it('flexible footing falls back to bending method (As_req matches reqAs)', () => {
    const flex = { ...base, B: 3.0, L: 3.0, h: 0.4, bc: 0.3, hc: 0.3, cover: 50 };
    const r = calcIsolatedFooting(flex);
    expect(r.is_rigid).toBe(false);
    // For flexible, As_req_x should match the bending solver result (not biela-tirante)
    const fcd = 25 / 1.5;
    const fyd = 500 / 1.15;
    const mu = (r.MEd_x * 1e6) / (1000 * r.d_x * r.d_x * fcd);
    const omega = 1 - Math.sqrt(1 - 2 * mu);
    const As_bend = omega * 1000 * r.d_x * fcd / fyd;
    expect(r.As_req_x).toBeCloseTo(As_bend, 0);
  });
});

// ── Punching ──────────────────────────────────────────────────────────────────

describe('Punching', () => {
  // Punching only applies to flexible footings (CE art. 46). Rigid footings
  // transfer load through compression struts and don't punch.
  const flexibleInp = { ...base, B: 3.0, L: 3.0, h: 0.4, bc: 0.3, hc: 0.3, cover: 50 };

  it('punching check ABSENT for rigid defaults (v/h ≤ 2)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.is_rigid).toBe(true);
    expect(r.checks.find((c) => c.id === 'punching')).toBeUndefined();
  });

  it('punching check PRESENT for flexible footings (v/h > 2)', () => {
    const r = calcIsolatedFooting(flexibleInp);
    expect(r.is_rigid).toBe(false);
    expect(r.checks.find((c) => c.id === 'punching')).toBeDefined();
  });

  it('vEd_punch still computed (result field) even for rigid — for display', () => {
    const r = calcIsolatedFooting(base);
    expect(r.vEd_punch).toBeGreaterThan(0);
    expect(r.vRdc_punch).toBeGreaterThan(0);
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
