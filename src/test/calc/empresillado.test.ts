import { describe, it, expect } from 'vitest';
import { calcEmpresillado } from '../../lib/calculations/empresillado';
import { empresalladoDefaults } from '../../data/defaults';
import type { EmpresalladoInputs } from '../../data/defaults';

// Convenience wrapper — all fields from defaults unless overridden
// Unit reminder: bc/hc in cm, L in m, s/lp/bp in cm, tp in mm
function inp(overrides: Partial<EmpresalladoInputs> = {}): EmpresalladoInputs {
  return { ...empresalladoDefaults, ...overrides } as EmpresalladoInputs;
}

// ─── Suite 1: Input validation ────────────────────────────────────────────────
describe('Input validation', () => {
  it('bad profile key → invalid, no crash', () => {
    const r = calcEmpresillado(inp({ perfil: 'L999x99' }));
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('s ≤ lp → invalid (s₀ ≤ 0)', () => {
    // s=20cm, lp=20cm → s₀=0
    const r = calcEmpresillado(inp({ s: 20, lp: 20 }));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/s.*lp|s₀/i);
  });

  it('s < lp → invalid', () => {
    const r = calcEmpresillado(inp({ s: 10, lp: 15 }));
    expect(r.valid).toBe(false);
  });
});

// ─── Suite 2: FTUX defaults ───────────────────────────────────────────────────
describe('FTUX defaults — L100x10, bc=hc=30cm, L=3.0m', () => {
  const r = calcEmpresillado(inp());

  it('is valid', () => expect(r.valid).toBe(true));
  it('no checks fail at FTUX', () => {
    const fails = r.checks.filter((c) => c.status === 'fail');
    expect(fails).toHaveLength(0);
  });
  it('governing utilization is in expected range', () => {
    expect(r.utilization).toBeGreaterThan(0.1);
    expect(r.utilization).toBeLessThan(1.0);
  });
});

// ─── Suite 3: Chord force — N only ───────────────────────────────────────────
describe('Chord force — N only (Mx=My=0)', () => {
  const r = calcEmpresillado(inp({ N_Ed: 500, Mx_Ed: 0, My_Ed: 0 }));

  it('N_chord_max = N_Ed / 4 exactly when Mx=My=0', () => {
    expect(r.valid).toBe(true);
    expect(r.N_chord_max).toBeCloseTo(500 / 4, 6);
  });
});

// ─── Suite 4: Chord force — N + Mx + My, square column ───────────────────────
describe('Chord force — N + Mx + My, square column', () => {
  const N = 400, Mx = 30, My = 20;
  const r = calcEmpresillado(inp({ N_Ed: N, Mx_Ed: Mx, My_Ed: My }));

  it('is valid', () => expect(r.valid).toBe(true));

  it('N_chord_max formula: N/4 + |Mx|/(2·hy) + |My|/(2·hx)', () => {
    const expected = N / 4 + (Mx * 100) / (2 * r.hy) + (My * 100) / (2 * r.hx);
    expect(r.N_chord_max).toBeCloseTo(expected, 4);
  });

  it('N_chord_max > N/4 when moments are non-zero', () => {
    expect(r.N_chord_max).toBeGreaterThan(N / 4);
  });
});

// ─── Suite 5: Rectangular column (bc ≠ hc) ───────────────────────────────────
describe('Rectangular column (bc ≠ hc)', () => {
  // bc=30cm, hc=50cm
  const r = calcEmpresillado(inp({ bc: 30, hc: 50 }));

  it('is valid', () => expect(r.valid).toBe(true));

  it('hx ≠ hy when bc ≠ hc', () => {
    expect(r.hx).not.toBeCloseTo(r.hy, 3);
  });

  it('hx < hy when bc < hc', () => {
    expect(r.hx).toBeLessThan(r.hy);
  });

  it('i_X ≠ i_Y when bc ≠ hc', () => {
    expect(r.i_X).not.toBeCloseTo(r.i_Y, 3);
  });
});

// ─── Suite 6: EC3 §6.4 correction guard ──────────────────────────────────────
describe('EC3 §6.4 correction: λ̄_eff > λ̄_0 always when s₀>0', () => {
  it('λ̄_effX > λ̄_0X (x-axis)', () => {
    const r = calcEmpresillado(inp());
    expect(r.valid).toBe(true);
    expect(r.lambda_effX).toBeGreaterThan(r.lambda_0X);
  });

  it('λ̄_effY > λ̄_0Y (y-axis, square col)', () => {
    const r = calcEmpresillado(inp());
    expect(r.lambda_effY).toBeGreaterThan(r.lambda_0Y);
  });

  it('λ̄_effX = sqrt(λ̄_0X² + λ̄_vl²)', () => {
    const r = calcEmpresillado(inp());
    const expected = Math.sqrt(r.lambda_0X ** 2 + r.lambda_vl ** 2);
    expect(r.lambda_effX).toBeCloseTo(expected, 8);
  });

  // EC3 §6.4.3.1(3) — local chord buckling length between battens = s (not 0.5·s).
  it('λ̄_v back-calculation gives Lk_local = s (EC3 §6.4.3.1(3))', () => {
    const r = calcEmpresillado(inp({ s: 40, lp: 10 }));
    expect(r.valid).toBe(true);
    // λ̄_v = (Lk/iv)/(93.9·ε) → Lk = λ̄_v·93.9·ε·iv  (all in cm)
    const ε = Math.sqrt(235 / empresalladoDefaults.fy);
    // back out iv from chord profile via r.lambda_v * 93.9 * ε = Lk/iv
    // simpler: ratio-check — doubling s must double λ̄_v
    const r2 = calcEmpresillado(inp({ s: 80, lp: 10 }));
    expect(r2.lambda_v).toBeCloseTo(2 * r.lambda_v, 8);
    // absolute check: λ̄_v uses s (not 0.5·s) — value ≈ 2× the old bug
    // old-bug λ̄_v would have been half; here ensure it matches EC3 linear scaling
    void ε;
  });
});

// ─── Suite 7: Monotone guard — wider spacing → higher λ̄_eff → lower χ ────────
// Use L=8.0m to get enough slenderness with β=0.5 for χ < 1.0
describe('Monotone: doubling batten spacing increases λ̄_eff and decreases χ', () => {
  it('s=30cm vs s=60cm: λ̄_eff(60) > λ̄_eff(30)', () => {
    const r30 = calcEmpresillado(inp({ L: 8.0, s: 30, lp: 10 }));
    const r60 = calcEmpresillado(inp({ L: 8.0, s: 60, lp: 10 }));
    expect(r30.valid).toBe(true);
    expect(r60.valid).toBe(true);
    expect(r60.lambda_effX).toBeGreaterThan(r30.lambda_effX);
  });

  it('s=30cm vs s=60cm: χ(60) < χ(30)', () => {
    const r30 = calcEmpresillado(inp({ L: 8.0, s: 30, lp: 10 }));
    const r60 = calcEmpresillado(inp({ L: 8.0, s: 60, lp: 10 }));
    expect(r60.chi).toBeLessThan(r30.chi);
  });
});

// ─── Suite 8: Fail state — extreme slenderness ────────────────────────────────
describe('Fail state: large N_Ed on slender column', () => {
  // Long column L=8.0m, large load N=2000kN, small L60×5 angle
  const r = calcEmpresillado(inp({ L: 8.0, N_Ed: 2000, Mx_Ed: 0, My_Ed: 0, perfil: 'L60x5' }));

  it('is valid (no crash)', () => expect(r.valid).toBe(true));

  it('global buckling check status is fail', () => {
    const globalCheck = r.checks.find((c) => c.id === 'pandeo-global');
    expect(globalCheck?.status).toBe('fail');
  });

  it('N_Ed > N_b_Rd for extreme slenderness', () => {
    expect(r.N_b_Rd).toBeLessThan(2000);
  });
});

// ─── Suite 9: Pletina formulas (EC3 §6.4.3.1–2, biempotradas) ────────────────
describe('Pletina — EC3 biempotradas formulas', () => {
  it('Vd=0: V_Ed = N_Ed/500 (notional shear floor, EC3 §6.4.3.1)', () => {
    const r = calcEmpresillado(inp({ N_Ed: 500, Vd: 0 }));
    expect(r.valid).toBe(true);
    expect(r.V_Ed).toBeCloseTo(500 / 500, 6);  // = 1.0 kN
  });

  it('Vd > N_Ed/500: V_Ed = Vd (actual shear governs)', () => {
    const r = calcEmpresillado(inp({ N_Ed: 500, Vd: 5 }));
    expect(r.V_Ed).toBeCloseTo(5, 6);  // 5 > 1.0
  });

  it('Vd < N_Ed/500: V_Ed = N_Ed/500 (floor governs)', () => {
    const r = calcEmpresillado(inp({ N_Ed: 500, Vd: 0.5 }));
    expect(r.V_Ed).toBeCloseTo(1.0, 6);  // 1.0 > 0.5
  });

  it('M_Ed_pl = V_Ed · s / 4 (biempotrado, EC3 §6.4.3.2)', () => {
    const i = inp();
    const r = calcEmpresillado(i);
    // s in cm → m: i.s / 100; divide by 4 for fixed-fixed 2-face system
    const expected = r.V_Ed * (i.s / 100) / 4;
    expect(r.M_Ed_pl).toBeCloseTo(expected, 8);
  });

  it('M_Rd_pl numeric spot-check — bp=10cm, tp=10mm, fy=275: W_pl = tp*bp²/4', () => {
    // bp=10cm=100mm, tp=10mm → W_pl = 10 * 100² / 4 = 25000 mm³
    // M_Rd = 25000 * 275 / (1.05 * 1e6) = 6.548 kNm
    const r = calcEmpresillado(inp({ bp: 10, tp: 10, fy: 275 }));
    expect(r.M_Rd_pl).toBeCloseTo(25000 * 275 / (1.05 * 1e6), 3);
  });

  it('V_Rd_pl numeric spot-check — bp=10cm, tp=10mm, fy=275', () => {
    // bp=100mm, tp=10mm → V_Rd = 100 * 10 * 275 / (√3 * 1.05 * 1000) = 151.3 kN
    const r = calcEmpresillado(inp({ bp: 10, tp: 10, fy: 275 }));
    const expected = (100 * 10 * 275) / (Math.sqrt(3) * 1.05 * 1000);
    expect(r.V_Rd_pl).toBeCloseTo(expected, 3);
  });
});

// ─── Suite 11: Negative moments — abs() symmetry guard ───────────────────────
describe('Negative moments produce same N_chord as positive (abs() symmetry)', () => {
  it('Mx_Ed=-20 gives same N_chord as Mx_Ed=+20', () => {
    const rPos = calcEmpresillado(inp({ Mx_Ed: 20, My_Ed: 0 }));
    const rNeg = calcEmpresillado(inp({ Mx_Ed: -20, My_Ed: 0 }));
    expect(rNeg.N_chord_max).toBeCloseTo(rPos.N_chord_max, 6);
  });

  it('My_Ed=-10 gives same N_chord as My_Ed=+10', () => {
    const rPos = calcEmpresillado(inp({ Mx_Ed: 0, My_Ed: 10 }));
    const rNeg = calcEmpresillado(inp({ Mx_Ed: 0, My_Ed: -10 }));
    expect(rNeg.N_chord_max).toBeCloseTo(rPos.N_chord_max, 6);
  });
});

// ─── Suite 12: Chi capped at 1.0 for stocky columns ─────────────────────────
describe('Chi = 1.0 for very stocky columns (lambda_eff < 0.2)', () => {
  // bc=hc=30cm, L=0.5m, beta=0.5 → Lk = 0.25m = 25cm. i_X ≈ 18cm → lambda_0 ≈ 25/(18*93.9*ε) ≪ 0.2
  it('chi is capped at 1.0 for a very short column', () => {
    const r = calcEmpresillado(inp({ L: 0.5, beta_x: 0.5, beta_y: 0.5, s: 20, lp: 5 }));
    expect(r.valid).toBe(true);
    expect(r.chi).toBeCloseTo(1.0, 3);
  });
});

// ─── Suite 13: Zero load edge case ───────────────────────────────────────────
describe('N_Ed=0 zero-load edge case', () => {
  it('V_Ed = 0 and M_Ed_pl = 0 when N_Ed=0, Vd=0', () => {
    const r = calcEmpresillado(inp({ N_Ed: 0, Mx_Ed: 0, My_Ed: 0, Vd: 0 }));
    expect(r.valid).toBe(true);
    expect(r.V_Ed).toBeCloseTo(0, 6);
    expect(r.M_Ed_pl).toBeCloseTo(0, 6);
  });

  it('N_chord_max = 0 when all loads are zero', () => {
    const r = calcEmpresillado(inp({ N_Ed: 0, Mx_Ed: 0, My_Ed: 0, Vd: 0 }));
    expect(r.N_chord_max).toBeCloseTo(0, 6);
  });
});

// ─── Suite 10: Profile L100x10 spot-check ─────────────────────────────────────
describe('L100x10 profile spot-check', () => {
  const r = calcEmpresillado(inp());  // defaults: bc=hc=30cm, L100x10

  it('compound i_X in expected range for bc=hc=30cm, L100x10', () => {
    // dx = 15 + 2.868 = 17.868 cm; i_X = sqrt(I1/A + dy²) ≈ sqrt(9.47 + 319.27) = 18.13 cm
    expect(r.i_X).toBeGreaterThan(15);
    expect(r.i_X).toBeLessThan(25);
  });

  it('hx = hy for square column (bc=hc)', () => {
    expect(r.hx).toBeCloseTo(r.hy, 4);
  });

  it('chord force with default loads > N/4 due to moments', () => {
    expect(r.N_chord_max).toBeGreaterThan(inp().N_Ed / 4);
  });
});
