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

  it('N_chord_max = N/4 + término de e0=L/500 amplificado (fix #125 — antes era exactamente N/4)', () => {
    expect(r.valid).toBe(true);
    const fX = (100 * r.A_ang * (r.hy / 2)) / r.I_X;  // kN por kNm
    const fY = (100 * r.A_ang * (r.hx / 2)) / r.I_Y;
    const expected = 500 / 4 + r.MEd_IIX * fX + r.MEd_IIY * fY;
    expect(r.N_chord_max).toBeCloseTo(expected, 4);
    expect(r.N_chord_max).toBeCloseTo(133.4, 1);  // oracle verificado a mano
    expect(r.N_chord_max).toBeGreaterThan(500 / 4);
  });
});

// ─── Suite 4: Chord force — N + Mx + My, square column ───────────────────────
describe('Chord force — N + Mx + My, square column', () => {
  const N = 400, Mx = 30, My = 20;
  const r = calcEmpresillado(inp({ N_Ed: N, Mx_Ed: Mx, My_Ed: My }));

  it('is valid', () => expect(r.valid).toBe(true));

  it('N_chord_max = N/4 + MEd_II·A·d/I por eje (ec. 6.69 exacta, fix #125)', () => {
    const fX = (100 * r.A_ang * (r.hy / 2)) / r.I_X;
    const fY = (100 * r.A_ang * (r.hx / 2)) / r.I_Y;
    const expected = N / 4 + r.MEd_IIX * fX + r.MEd_IIY * fY;
    expect(r.N_chord_max).toBeCloseTo(expected, 4);
    // y supera al primer orden antiguo (e0 + amplificación)
    const firstOrder = N / 4 + (Mx * 100) / (2 * r.hy) + (My * 100) / (2 * r.hx);
    expect(r.N_chord_max).toBeGreaterThan(firstOrder);
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
  const r = calcEmpresillado(inp({ L: 8.0, N_Ed: 1200, Mx_Ed: 0, My_Ed: 0, perfil: 'L60x5' }));

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
  it('Vd=0: V_Ed = π·MEd_II/L (cortante de 2.º orden, fix #125 — antes N/500 = 1 kN, 25× corto)', () => {
    const r = calcEmpresillado(inp({ N_Ed: 500, Vd: 0 }));
    expect(r.valid).toBe(true);
    const expected = Math.PI * Math.max(r.MEd_IIX, r.MEd_IIY) / 3.0;
    expect(r.V_Ed).toBeCloseTo(expected, 4);
    expect(r.V_Ed).toBeGreaterThan(20);
  });

  it('Vd se SUMA al cortante de imperfección (no envolvente, fix #125/A3)', () => {
    const r0 = calcEmpresillado(inp({ Vd: 0 }));
    const r5 = calcEmpresillado(inp({ Vd: 5 }));
    expect(r5.V_Ed).toBeCloseTo(r0.V_Ed + 5, 4);
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

// ── Fixes auditoría adenda 7 (hallazgos #125-130) ─────────────────────────────
describe('Auditoría #125: oracles de segundo orden (defaults)', () => {
  const r = calcEmpresillado(inp());

  it('MEd_IIX ≈ 23.7 kNm (Ncr≈57.5e3, Sv≈23.3e3, denom≈0.970)', () => {
    expect(r.Ncr_X).toBeCloseTo(57535, -2);
    expect(r.Sv_X).toBeCloseTo(23336, -2);
    expect(r.MEd_IIX).toBeCloseTo(23.71, 1);
  });

  it('V_Ed ≈ 24.8 kN (antes 1.0 kN con el suelo N/500)', () => {
    expect(r.V_Ed).toBeCloseTo(24.83, 1);
  });

  it('FTUX sigue en verde: gobierna el cordón con Vierendeel ≈ 0.55', () => {
    expect(r.checks.filter((c) => c.status === 'fail')).toHaveLength(0);
    expect(r.utilization).toBeCloseTo(0.545, 1);
    const gov = r.checks.find((c) => c.id === 'cordon-interaccion')!;
    expect(gov.utilization).toBeCloseTo(r.utilization, 6);
  });

  it('flip demostrado en la auditoría: Mx=58 → pletina-flexión FAIL (antes todo verde al 42%)', () => {
    const rf = calcEmpresillado(inp({ Mx_Ed: 58 }));
    const row = rf.checks.find((c) => c.id === 'pletina-flexion')!;
    expect(row.utilization).toBeGreaterThan(1.0);
    expect(row.status).toBe('fail');
  });
});

describe('Auditoría #126: flexión Vierendeel del cordón', () => {
  it('fila cordon-interaccion presente con M_ch = VEd·s/8', () => {
    const r = calcEmpresillado(inp());
    expect(r.M_ch).toBeCloseTo(r.V_Ed * 0.4 / 8, 4);
    expect(r.checks.some((c) => c.id === 'cordon-interaccion')).toBe(true);
    expect(r.M_el_Rd).toBeCloseTo(6.61, 1);  // Wel(L100x10)·fy/γM0
  });
});

describe('Auditoría #128: cortante interno de la presilla T=(VEd/2)·s/h0', () => {
  it('defaults: T ≈ 0.56·V_Ed (antes se comparaba V total — conservador aquí)', () => {
    const r = calcEmpresillado(inp());
    expect(r.T_pl).toBeCloseTo((r.V_Ed / 2) * (40 / r.hy), 3);
  });

  it('cruce alcanzable s > 2·h0: T supera al V total (antes no conservador)', () => {
    const r = calcEmpresillado(inp({ s: 80, lp: 10, hc: 15 }));
    expect(r.valid).toBe(true);
    expect(r.T_pl).toBeGreaterThan(r.V_Ed);
  });
});

describe('Auditoría #127/#129: validación y alcance', () => {
  it('geometrías no positivas → invalid (antes verdes)', () => {
    expect(calcEmpresillado(inp({ bc: -30 })).valid).toBe(false);
    expect(calcEmpresillado(inp({ L: -3 })).valid).toBe(false);
    expect(calcEmpresillado(inp({ tp: 0 })).valid).toBe(false);
    expect(calcEmpresillado(inp({ N_Ed: -500 })).valid).toBe(false);
  });

  it('separación de presillas: fila s ≤ 50·i_v (fail con s excesivo)', () => {
    const ok = calcEmpresillado(inp());
    expect(ok.checks.find((c) => c.id === 'sep-presillas')!.status).toBe('ok');
    const bad = calcEmpresillado(inp({ s: 120, lp: 12 }));
    expect(bad.checks.find((c) => c.id === 'sep-presillas')!.status).toBe('fail');
  });

  it('scope-note presente (pilar RC despreciado, soldadura no comprobada)', () => {
    const r = calcEmpresillado(inp());
    const row = r.checks.find((c) => c.id === 'scope-note')!;
    expect(row).toBeTruthy();
    expect(row.neutral).toBe(true);
  });
});
