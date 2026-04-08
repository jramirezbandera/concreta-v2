import { describe, it, expect } from 'vitest';
import { calcEmpresillado } from '../../lib/calculations/empresillado';
import { empresalladoDefaults } from '../../data/defaults';
import type { EmpresalladoInputs } from '../../data/defaults';

// Convenience wrapper — all fields from defaults unless overridden
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
    // s=200, lp=200 → s₀=0
    const r = calcEmpresillado(inp({ s: 200, lp: 200 }));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/s.*lp|s₀/i);
  });

  it('s < lp → invalid', () => {
    const r = calcEmpresillado(inp({ s: 100, lp: 150 }));
    expect(r.valid).toBe(false);
  });
});

// ─── Suite 2: FTUX defaults ───────────────────────────────────────────────────
describe('FTUX defaults — L100x10, bc=hc=300, L=3000', () => {
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
  const r = calcEmpresillado(inp({ bc: 300, hc: 500 }));

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
});

// ─── Suite 7: Monotone guard — wider spacing → higher λ̄_eff → lower χ ────────
// Use L=8000 to get enough slenderness with β=0.5 for χ < 1.0
describe('Monotone: doubling batten spacing increases λ̄_eff and decreases χ', () => {
  it('s=300 vs s=600: λ̄_eff(600) > λ̄_eff(300)', () => {
    const r300 = calcEmpresillado(inp({ L: 8000, s: 300, lp: 100 }));
    const r600 = calcEmpresillado(inp({ L: 8000, s: 600, lp: 100 }));
    expect(r300.valid).toBe(true);
    expect(r600.valid).toBe(true);
    expect(r600.lambda_effX).toBeGreaterThan(r300.lambda_effX);
  });

  it('s=300 vs s=600: χ(600) < χ(300)', () => {
    const r300 = calcEmpresillado(inp({ L: 8000, s: 300, lp: 100 }));
    const r600 = calcEmpresillado(inp({ L: 8000, s: 600, lp: 100 }));
    expect(r600.chi).toBeLessThan(r300.chi);
  });
});

// ─── Suite 8: Fail state — extreme slenderness ────────────────────────────────
describe('Fail state: large N_Ed on slender column', () => {
  // Long column L=8000mm, large load N=2000kN, small L60×5 angle
  const r = calcEmpresillado(inp({ L: 8000, N_Ed: 2000, Mx_Ed: 0, My_Ed: 0, perfil: 'L60x5' }));

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
    const expected = r.V_Ed * (i.s / 1000) / 4;  // s mm → m, /4 for 2-face fixed-fixed
    expect(r.M_Ed_pl).toBeCloseTo(expected, 8);
  });
});

// ─── Suite 10: Profile L100x10 spot-check ─────────────────────────────────────
describe('L100x10 profile spot-check', () => {
  const r = calcEmpresillado(inp());  // defaults use L100x10

  it('compound i_X in expected range for bc=hc=300, L100x10', () => {
    // dx = 30/2 + 2.868 = 17.868 cm; i_X = sqrt(I1/A + dy²) ≈ sqrt(9.47 + 319.27) = 18.13 cm
    expect(r.i_X).toBeGreaterThan(15);
    expect(r.i_X).toBeLessThan(25);
  });

  it('hx = hx symmetric for square column', () => {
    expect(r.hx).toBeCloseTo(r.hy, 4);
  });

  it('chord force with default loads ≈ 125 + moments contribution', () => {
    expect(r.N_chord_max).toBeGreaterThan(125);  // > N/4 due to moments
  });
});
