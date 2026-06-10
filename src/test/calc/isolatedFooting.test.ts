// Isolated footing test suite — sigma_adm input + distribution classification
// Run: bun test src/test/calc/isolatedFooting.test.ts

import { describe, expect, it } from 'vitest';
import { calcIsolatedFooting } from '../../lib/calculations/isolatedFooting';
import { isolatedFootingDefaults } from '../../data/defaults';

const base = { ...isolatedFootingDefaults };
// base: B=L=1.8, h=0.6, bc=hc=0.4, Df=0.8, cover=60
//       sigma_adm=200 kPa, loadsAreFactored=false, loadFactor=1.35
//       N=300, Mx=My=H=0, fck=25, fyk=500, phi_x=phi_y=16, s_x=s_y=200
//       gamma_soil=18 kN/m3, mu_friction=0.5

// ── 1. FTUX defaults — trapezoidal, all OK ──────────────────────────────────

describe('FTUX defaults', () => {
  it('result is valid', () => {
    expect(calcIsolatedFooting(base).valid).toBe(true);
  });

  it('no check fails', () => {
    const r = calcIsolatedFooting(base);
    for (const c of r.checks) {
      expect(c.status, `check ${c.id} should not fail`).not.toBe('fail');
    }
  });

  it('defaults classify as trapezoidal (no eccentricity)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.distributionType).toBe('trapezoidal');
    expect(r.ex_sls).toBeCloseTo(0, 3);
    expect(r.ey_sls).toBeCloseTo(0, 3);
  });
});

// ── 2. Loads derivation — sin_mayorar mode ──────────────────────────────────

describe('Loads — sin_mayorar mode', () => {
  it('SLS = input, ELU = input · γ', () => {
    const r = calcIsolatedFooting({
      ...base, loadsAreFactored: false, loadFactor: 1.35,
      N: 200, Mx: 30, My: 40, H: 10,
    });
    expect(r.N_sls).toBeCloseTo(200, 3);
    expect(r.Mx_sls).toBeCloseTo(30, 3);
    expect(r.N_elu).toBeCloseTo(200 * 1.35, 3);
    expect(r.My_elu).toBeCloseTo(40 * 1.35, 3);
    expect(r.H_elu).toBeCloseTo(10 * 1.35, 3);
  });

  it('custom γ propagates correctly', () => {
    const r = calcIsolatedFooting({
      ...base, loadsAreFactored: false, loadFactor: 1.5, N: 100,
    });
    expect(r.N_elu).toBeCloseTo(150, 3);
  });
});

// ── 3. Loads derivation — mayoradas mode ─────────────────────────────────────

describe('Loads — mayoradas mode', () => {
  it('ELU = input, SLS = input / γ', () => {
    const r = calcIsolatedFooting({
      ...base, loadsAreFactored: true, loadFactor: 1.35,
      N: 270, Mx: 27, My: 13.5, H: 6.75,
    });
    expect(r.N_elu).toBeCloseTo(270, 3);
    expect(r.Mx_elu).toBeCloseTo(27, 3);
    expect(r.N_sls).toBeCloseTo(270 / 1.35, 3);
    expect(r.My_sls).toBeCloseTo(13.5 / 1.35, 3);
  });

  it('round-trip: factored=true with x → unfactored=false with x/γ produces same SLS', () => {
    const r1 = calcIsolatedFooting({ ...base, loadsAreFactored: true,  N: 405 });
    const r2 = calcIsolatedFooting({ ...base, loadsAreFactored: false, N: 300 });
    expect(r1.N_sls).toBeCloseTo(r2.N_sls, 3);
  });
});

// ── 4. Distribution classification ───────────────────────────────────────────

describe('Distribution classification', () => {
  it('small eccentricity → trapezoidal (ex < B/6)', () => {
    // B/6 = 0.3 m. ex = My/Ntot < 0.3 → trapezoidal
    const r = calcIsolatedFooting({ ...base, My: 50 });
    expect(r.distributionType).toBe('trapezoidal');
  });

  it('one eccentricity beyond core → bitriangular_uniaxial', () => {
    // ex must exceed B/6 only — push My way beyond core (~0.3 m → My ~ 110 kNm at N≈360)
    const r = calcIsolatedFooting({ ...base, My: 150 });
    expect(r.distributionType).toBe('bitriangular_uniaxial');
    expect(r.ex_over_B6).toBeGreaterThan(1);
  });

  it('both eccentricities beyond core → bitriangular_biaxial', () => {
    const r = calcIsolatedFooting({ ...base, My: 150, Mx: 150 });
    expect(r.distributionType).toBe('bitriangular_biaxial');
    expect(r.ex_over_B6).toBeGreaterThan(1);
    expect(r.ey_over_L6).toBeGreaterThan(1);
  });

  it('extreme eccentricity (ex ≥ B/2) → overturning_fail', () => {
    // Ntot ≈ 361 kN, B/2 = 0.9 m → My ≥ 325 kNm
    const r = calcIsolatedFooting({ ...base, My: 400 });
    expect(r.distributionType).toBe('overturning_fail');
    expect(r.sigma_max).toBe(Infinity);
  });

  it('núcleo rómbico: ex=B/8, ey=L/8 → contacto parcial biaxial (fix auditoría #10)', () => {
    // ex/B + ey/L = 0.25 > 1/6: σmin lineal = σc·(1−0.75−0.75) < 0 → hay
    // despegue real aunque ex ≤ B/6 y ey ≤ L/6 por separado. La condición
    // rectangular clasificaba trapezoidal y el clamp σmin=0 ocultaba el
    // despegue con σmax subestimada (lineal 277.7 < real 284.0 kPa aquí,
    // y la diferencia crece al alejarse del rombo).
    const r = calcIsolatedFooting({ ...base, Mx: 81, My: 81 });
    expect(r.distributionType).toBe('bitriangular_biaxial');
    expect(r.loaded_area_fraction).toBeLessThan(1);
    const Ntot = r.N_sls + r.W_footing + r.W_soil;
    const sigma_c = Ntot / (1.8 * 1.8);
    const lineal = sigma_c * (1 + 6 * r.ex_sls / 1.8 + 6 * r.ey_sls / 1.8);
    expect(r.sigma_max).toBeGreaterThan(lineal);
  });

  it('dentro del rombo (ex/B + ey/L ≤ 1/6) sigue trapezoidal con σmin ≥ 0 real', () => {
    const r = calcIsolatedFooting({ ...base, Mx: 25, My: 25 });
    expect(r.distributionType).toBe('trapezoidal');
    expect(r.ex_sls / 1.8 + r.ey_sls / 1.8).toBeLessThanOrEqual(1 / 6);
    expect(r.sigma_min).toBeGreaterThanOrEqual(0);
  });
});

// ── 5. Stress closed-forms ───────────────────────────────────────────────────

describe('Stress — closed-form values', () => {
  it('trapezoidal: σmax = N/A · (1 + 6e/B) at uniaxial small ecc', () => {
    // B = L = 1.8 → A = 3.24 m². N_sls is augmented by W_footing+W_soil.
    // W_footing = 25·1.8·1.8·0.6 = 48.6 kN; W_soil = 18·(0.8-0.6)·(3.24-0.16) = 11.088
    // Ntot = 300 + 48.6 + 11.088 = 359.688 kN; ex = 30/Ntot = 0.0834 m (< B/6=0.3)
    // σ_c = 110.95 kPa; σmax = σ_c·(1 + 6·0.0834/1.8) = 110.95·(1 + 0.278) = 141.8 kPa
    const r = calcIsolatedFooting({ ...base, My: 30 });
    expect(r.distributionType).toBe('trapezoidal');
    const Ntot = r.N_sls + r.W_footing + r.W_soil;
    const sigma_c = Ntot / (1.8 * 1.8);
    const expected = sigma_c * (1 + 6 * r.ex_sls / 1.8);
    expect(r.sigma_max).toBeCloseTo(expected, 1);
  });

  it('bitri uniaxial: σmax matches Meyerhof closed form 2N/(3·L·(B/2−ex))', () => {
    const r = calcIsolatedFooting({ ...base, My: 150 });
    expect(r.distributionType).toBe('bitriangular_uniaxial');
    const Ntot = r.N_sls + r.W_footing + r.W_soil;
    const expected = (2 * Ntot) / (3 * 1.8 * (1.8 / 2 - r.ex_sls));
    expect(r.sigma_max).toBeCloseTo(expected, 1);
    expect(r.sigma_min).toBe(0);
    expect(r.loaded_area_fraction).toBeLessThan(1);
  });
});

// ── 6. Stability ─────────────────────────────────────────────────────────────

describe('Stability', () => {
  it('no overturn check when M = 0 (no destabilizing moment)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.checks.find((c) => c.id === 'overturn-x')).toBeUndefined();
    expect(r.checks.find((c) => c.id === 'overturn-y')).toBeUndefined();
  });

  it('FS_overturn_x = M_stab / M_dest with M_dest = |My_elu| + |H_elu|·h', () => {
    const r = calcIsolatedFooting({ ...base, My: 100 });
    // M_stab_x = (W_footing + W_soil) · B/2 = (48.6 + 11.088) · 0.9 = 53.72 kNm
    // M_dest_x = |My_elu| = 100·1.35 = 135 kNm
    expect(r.M_stab_x).toBeCloseTo((r.W_footing + r.W_soil) * 0.9, 2);
    expect(r.M_dest_x).toBeCloseTo(135, 2);
    expect(r.FS_overturn_x).toBeCloseTo(r.M_stab_x / 135, 3);
    expect(r.checks.find((c) => c.id === 'overturn-x')).toBeDefined();
  });

  it('FS_sliding = μ·(N_elu + W_footing + W_soil) / |H_elu|', () => {
    const r = calcIsolatedFooting({ ...base, H: 20 });
    const Ntot_elu = r.N_elu + r.W_footing + r.W_soil;
    const expected = (0.5 * Ntot_elu) / Math.abs(r.H_elu);
    expect(r.FS_sliding).toBeCloseTo(expected, 3);
    expect(r.checks.find((c) => c.id === 'sliding')).toBeDefined();
  });
});

// ── 7. Rigid / flexible classification (CE art. 55) ─────────────────────────

describe('Rigid / flexible classification', () => {
  it('defaults classify as rigid (v_max = 0.7, h = 0.6 → v/h = 1.17 ≤ 2)', () => {
    const r = calcIsolatedFooting(base);
    expect(r.isRigid).toBe(true);
    expect(r.v_max).toBeCloseTo(0.7, 3);
  });

  it('thin wide footing classifies as flexible (v/h > 2)', () => {
    const r = calcIsolatedFooting({ ...base, B: 3.0, L: 3.0, h: 0.4, bc: 0.3, hc: 0.3, cover: 50, Df: 0.6 });
    expect(r.isRigid).toBe(false);
    expect(r.v_max).toBeGreaterThan(2 * 0.4);
  });
});

// ── 7b. Shear oracle (fix auditoría #2: VRd = vRdc·d, no vRdc·1000) ─────────

describe('Shear VRd oracle — CE art. 44', () => {
  it('flexible B=L=3, h=0.4: VRd_x = vRdc·d_x ≈ 140.8 kN/m (oracle manual)', () => {
    // Hand-calc:
    //   N_elu = 300·1.35 = 405 kN; ex=ey=0 → σ_Ed = 405/(3·3) = 45 kPa
    //   d_x = 400 − 50 − 16/2 = 342 mm
    //   ell_x = (3000−300)/2 − 342 = 1008 mm → VEd_x = 45·1.008 = 45.36 kN/m
    //   As_prov = (201.06/200)·1000 = 1005.3 mm²/m → ρl = 0.00294
    //   k = 1 + √(200/342) = 1.765
    //   vRdc = max(0.12·1.765·(100·0.00294·25)^⅓, 0.035·1.765^1.5·√25)
    //        = max(0.412, 0.410) = 0.412 N/mm²
    //   VRd_x = 0.412·342 = 140.8 kN/m → util = 45.36/140.8 = 0.322
    // Pre-fix, VRd = vRdc·1000 = 412 kN/m (×2.9 sobreestimado, como si d=1000).
    const r = calcIsolatedFooting({ ...base, B: 3.0, L: 3.0, h: 0.4, bc: 0.3, hc: 0.3, cover: 50, Df: 0.6 });
    const cx = r.checks.find((c) => c.id === 'cortante-x')!;
    expect(cx.valueNum).toBeCloseTo(45.36, 2);
    expect(cx.limitNum).toBeCloseTo(140.8, 0);
    expect(cx.utilization).toBeCloseTo(0.322, 2);
  });
});

// ── 8. Validation — invalid inputs ──────────────────────────────────────────

describe('Validation', () => {
  it('h > Df → invalid', () => {
    const r = calcIsolatedFooting({ ...base, h: 1.0, Df: 0.5 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/canto/i);
  });

  it('sigma_adm ≤ 0 → invalid', () => {
    const r = calcIsolatedFooting({ ...base, sigma_adm: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/σadm/i);
  });
});
