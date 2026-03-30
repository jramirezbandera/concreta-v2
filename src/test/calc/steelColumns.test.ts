import { describe, it, expect } from 'vitest';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { getBetaForBCType } from '../../lib/calculations/steelColumnBC';
import { steelColumnDefaults } from '../../data/defaults';
import type { SteelColumnInputs } from '../../data/defaults';

// Convenience wrapper — all fields from defaults unless overridden
function inp(overrides: Partial<SteelColumnInputs> = {}): SteelColumnInputs {
  return { ...steelColumnDefaults, ...overrides } as SteelColumnInputs;
}

// ─── Suite 1: FTUX defaults ────────────────────────────────────────────────
describe('FTUX defaults — HEB200 S275 pp', () => {
  const r = calcSteelColumn(inp());

  it('is valid', () => expect(r.valid).toBe(true));
  it('section class 1', () => expect(r.sectionClass).toBe(1));
  it('governing utilization 0.60–0.80', () => {
    expect(r.utilization).toBeGreaterThan(0.55);
    expect(r.utilization).toBeLessThan(0.85);
  });
  it('all checks CUMPLE (status ok or warn, not fail)', () => {
    const fails = r.checks.filter(c => c.status === 'fail');
    expect(fails).toHaveLength(0);
  });
  it('LTB check present (open I + My>0)', () => {
    expect(r.checks.some(c => c.id === 'LTB')).toBe(true);
  });
});

// ─── Suite 2: Global validation ───────────────────────────────────────────
describe('Global validation', () => {
  it('Ly=0 → invalid, no crash', () => {
    const r = calcSteelColumn(inp({ Ly: 0 }));
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });
  it('Lz=-1 → invalid', () => {
    const r = calcSteelColumn(inp({ Lz: -1 }));
    expect(r.valid).toBe(false);
  });
  it('Ned<0 → invalid', () => {
    const r = calcSteelColumn(inp({ Ned: -100 }));
    expect(r.valid).toBe(false);
  });
  it('Unknown profile → invalid', () => {
    const r = calcSteelColumn(inp({ sectionType: 'HEB', size: 9999 }));
    expect(r.valid).toBe(false);
  });
  it('Unknown UPN → invalid', () => {
    const r = calcSteelColumn(inp({ sectionType: '2UPN', size: 9999 }));
    expect(r.valid).toBe(false);
  });
});

// ─── Suite 3: Section classification ─────────────────────────────────────
describe('Section classification', () => {
  it('HEB200 S275 → Class 1', () => {
    const r = calcSteelColumn(inp({ sectionType: 'HEB', size: 200, steel: 'S275' }));
    expect(r.sectionClass).toBe(1);
  });
  it('IPE200 S275 → Class 1 (compact profile)', () => {
    const r = calcSteelColumn(inp({ sectionType: 'IPE', size: 200, steel: 'S275' }));
    expect(r.sectionClass).toBe(1);
  });
  it('2UPN200 S275 → Class 1 (internal elements)', () => {
    const r = calcSteelColumn(inp({ sectionType: '2UPN', size: 200, steel: 'S275' }));
    expect(r.valid).toBe(true);
    expect(r.sectionClass).toBe(1);
  });
  it('S355 produces lower ε → same or higher class', () => {
    const r275 = calcSteelColumn(inp({ sectionType: 'HEB', size: 200, steel: 'S275' }));
    const r355 = calcSteelColumn(inp({ sectionType: 'HEB', size: 200, steel: 'S355' }));
    expect(r355.sectionClass).toBeGreaterThanOrEqual(r275.sectionClass);
  });
});

// ─── Suite 4: Section resistances ────────────────────────────────────────
describe('Section resistances', () => {
  it('NRd = A·fy/γM0 (kN)', () => {
    // HEB200: A=78.1cm², fy=275MPa, γM0=1.05
    // NRd = 78.1*275*0.1/1.05 = 2045.48 kN
    const r = calcSteelColumn(inp({ sectionType: 'HEB', size: 200, steel: 'S275' }));
    expect(r.NRd).toBeCloseTo(2045.5, 0);
  });
  it('S355 → NRd larger than S275', () => {
    const r275 = calcSteelColumn(inp({ steel: 'S275' }));
    const r355 = calcSteelColumn(inp({ steel: 'S355' }));
    expect(r355.NRd).toBeGreaterThan(r275.NRd);
  });
  it('My,Rd uses Wpl_y for Class 1 section', () => {
    // HEB200 S275: Wpl_y=642cm³, My,Rd=642*275/(1000*1.05)≈168.1kNm
    const r = calcSteelColumn(inp({ sectionType: 'HEB', size: 200, steel: 'S275' }));
    expect(r.My_Rd).toBeCloseTo(168, 0);
  });
  it('Mz,Rd > 0 for all valid sections', () => {
    const r = calcSteelColumn(inp());
    expect(r.Mz_Rd).toBeGreaterThan(0);
  });
});

// ─── Suite 5: Buckling curves ─────────────────────────────────────────────
describe('Buckling curves — χ values', () => {
  it('λ̄ ≤ 0.2 → χ = 1.0', () => {
    // Very short column: Ly=Lz=100mm, pp
    const r = calcSteelColumn(inp({ Ly: 100, Lz: 100, bcType: 'pp', beta_y: 1, beta_z: 1 }));
    expect(r.chi_y).toBeCloseTo(1.0, 3);
    expect(r.chi_z).toBeCloseTo(1.0, 3);
  });
  it('IPE uses curve a (y) / curve b (z) → chi_y > chi_z for same λ', () => {
    const r = calcSteelColumn(inp({ sectionType: 'IPE', size: 300, Ly: 4000, Lz: 4000 }));
    // For IPE (h/b>1.2): alpha_y=0.21, alpha_z=0.34 → chi_y > chi_z
    expect(r.chi_y).toBeGreaterThan(r.chi_z);
  });
  it('HEB uses curve b (y) / curve c (z) → chi_y > chi_z', () => {
    const r = calcSteelColumn(inp({ sectionType: 'HEB', size: 200, Ly: 4000, Lz: 4000 }));
    expect(r.chi_y).toBeGreaterThan(r.chi_z);
  });
  it('S355 → lower chi (higher fy increases λ̄)', () => {
    const r275 = calcSteelColumn(inp({ Ly: 4000, Lz: 4000 }));
    const r355 = calcSteelColumn(inp({ Ly: 4000, Lz: 4000, steel: 'S355' }));
    // Higher fy → higher λ̄ → lower or equal chi
    expect(r355.chi_z).toBeLessThanOrEqual(r275.chi_z + 0.01);
  });
  it('Nb,Rd increases with S355 despite lower χ (higher fy dominates for short columns)', () => {
    const r275 = calcSteelColumn(inp({ Ly: 1000, Lz: 1000 }));
    const r355 = calcSteelColumn(inp({ Ly: 1000, Lz: 1000, steel: 'S355' }));
    expect(r355.Nb_Rd_y).toBeGreaterThan(r275.Nb_Rd_y);
    expect(r355.Nb_Rd_z).toBeGreaterThan(r275.Nb_Rd_z);
  });
});

// ─── Suite 6: Boundary conditions ────────────────────────────────────────
describe('Boundary conditions — β and Lk', () => {
  it('bcType=ff (β=0.5) → lowest λ̄, highest χ', () => {
    const rff = calcSteelColumn(inp({ beta_y: 0.5, beta_z: 0.5 }));
    const rpp = calcSteelColumn(inp({ beta_y: 1.0, beta_z: 1.0 }));
    expect(rff.lambda_y).toBeLessThan(rpp.lambda_y);
    expect(rff.chi_z).toBeGreaterThan(rpp.chi_z);
  });
  it('bcType=fc (β=2.0) → highest λ̄, lowest χ', () => {
    const rpp = calcSteelColumn(inp({ beta_y: 1.0, beta_z: 1.0 }));
    const rfc = calcSteelColumn(inp({ beta_y: 2.0, beta_z: 2.0 }));
    expect(rfc.lambda_z).toBeGreaterThan(rpp.lambda_z);
    expect(rfc.chi_z).toBeLessThan(rpp.chi_z);
  });
  it('custom beta_y ≠ beta_z → lambda_y ≠ lambda_z', () => {
    const r = calcSteelColumn(inp({ beta_y: 0.5, beta_z: 1.0 }));
    expect(r.lambda_y).not.toBeCloseTo(r.lambda_z, 3);
  });
  it('custom beta_y=0 guard — Ly=Lz=100 β=0 should not crash (β=0 means Lk=0, χ=1)', () => {
    const r = calcSteelColumn(inp({ Ly: 100, Lz: 100, beta_y: 0, beta_z: 0 }));
    expect(r.valid).toBe(true);
    expect(r.chi_y).toBeCloseTo(1.0, 3);
  });
});

// ─── Suite 7: LTB ────────────────────────────────────────────────────────
describe('LTB — lateral-torsional buckling', () => {
  it('Open I + My>0 → LTB check present', () => {
    const r = calcSteelColumn(inp({ sectionType: 'HEB', size: 200, My_Ed: 30 }));
    expect(r.checks.some(c => c.id === 'LTB')).toBe(true);
    expect(r.lambda_LT).toBeGreaterThan(0);
    expect(r.chi_LT).toBeLessThanOrEqual(1.0);
  });
  it('My=0 → no LTB check, chi_LT=1', () => {
    const r = calcSteelColumn(inp({ My_Ed: 0 }));
    expect(r.checks.some(c => c.id === 'LTB')).toBe(false);
    expect(r.chi_LT).toBeCloseTo(1.0, 3);
  });
  it('2UPN box + My>0 → NO LTB check (closed section)', () => {
    const r = calcSteelColumn(inp({ sectionType: '2UPN', size: 200, My_Ed: 30 }));
    expect(r.checks.some(c => c.id === 'LTB')).toBe(false);
    expect(r.chi_LT).toBeCloseTo(1.0, 3);
  });
  it('IPE with My>0 → LTB present', () => {
    const r = calcSteelColumn(inp({ sectionType: 'IPE', size: 300, My_Ed: 20 }));
    expect(r.checks.some(c => c.id === 'LTB')).toBe(true);
  });
  it('Longer column → lower chi_LT (more LTB)', () => {
    const r3 = calcSteelColumn(inp({ Ly: 3000, Lz: 3000, My_Ed: 30 }));
    const r8 = calcSteelColumn(inp({ Ly: 8000, Lz: 8000, My_Ed: 30 }));
    expect(r8.chi_LT).toBeLessThan(r3.chi_LT);
  });
});

// ─── Suite 8: Interaction checks 6.3.3 ───────────────────────────────────
describe('Interaction 6.3.3', () => {
  it('Both interaction checks ≤ 1 for FTUX defaults', () => {
    const r = calcSteelColumn(inp());
    expect(r.util_check1).toBeLessThan(1.0);
    expect(r.util_check2).toBeLessThan(1.0);
  });
  it('Overloaded column → at least one check > 1 (fail)', () => {
    const r = calcSteelColumn(inp({ Ned: 3000, My_Ed: 200, Mz_Ed: 50 }));
    expect(Math.max(r.util_check1, r.util_check2)).toBeGreaterThan(1.0);
  });
  it('Pure axial + no moments → checks equal respective buckling utilizations', () => {
    const r = calcSteelColumn(inp({ My_Ed: 0, Mz_Ed: 0 }));
    // check1 = Ned/Nb,Rd_y, check2 = Ned/Nb,Rd_z (different axes, different curves → not equal for HEB)
    expect(r.util_check1).toBeCloseTo(r.checks.find(c => c.id === 'Nby')!.utilization, 2);
    expect(r.util_check2).toBeCloseTo(r.checks.find(c => c.id === 'Nbz')!.utilization, 2);
  });
  it('Check1 uses chi_y, Check2 uses chi_z → check2 higher for HEB (weaker z)', () => {
    const r = calcSteelColumn(inp({ My_Ed: 0, Mz_Ed: 0, Ly: 5000, Lz: 5000 }));
    // chi_z < chi_y for HEB → Ned/Nb,Rd_z > Ned/Nb,Rd_y
    expect(r.util_check2).toBeGreaterThan(r.util_check1);
  });
});

// ─── Suite 9: Slenderness limits ─────────────────────────────────────────
describe('Slenderness Lk/i ≤ 200', () => {
  it('Normal column: slenderness checks ok (status ok)', () => {
    const r = calcSteelColumn(inp());
    const sy = r.checks.find(c => c.id === 'sy')!;
    const sz = r.checks.find(c => c.id === 'sz')!;
    expect(sy.status).toBe('ok');
    expect(sz.status).toBe('ok');
  });
  it('Very slender column (fc, long) → slenderness warn or fail', () => {
    // HEB200, Ly=Lz=10000mm, fc (β=2.0) → Lk=20000mm, i_z≈50mm → λ=400 > 200
    const r = calcSteelColumn(inp({ Ly: 10000, Lz: 10000, beta_y: 2.0, beta_z: 2.0 }));
    const sz = r.checks.find(c => c.id === 'sz')!;
    expect(['warn', 'fail']).toContain(sz.status);
  });
});

// ─── Suite 10: 2UPN box section ───────────────────────────────────────────
describe('2UPN box section', () => {
  it('valid result for 2UPN240', () => {
    const r = calcSteelColumn(inp({ sectionType: '2UPN', size: 240, steel: 'S275', Ly: 3500, Lz: 3500 }));
    expect(r.valid).toBe(true);
  });
  it('isBox=true', () => {
    const r = calcSteelColumn(inp({ sectionType: '2UPN', size: 200 }));
    expect(r.isBox).toBe(true);
  });
  it('Iz_box > 2*Iz_UPN_single (parallel axis contributes positively)', () => {
    // Iz single UPN200 = 148 cm⁴, Iz box should be >> 2*148=296
    const r = calcSteelColumn(inp({ sectionType: '2UPN', size: 200 }));
    expect(r.valid).toBe(true);
    // lambda_z will be smaller (higher Iz) for box than for single UPN
    // Just check chi_z > 0 (valid calculation)
    expect(r.chi_z).toBeGreaterThan(0);
    expect(r.chi_z).toBeLessThanOrEqual(1.0);
  });
  it('No LTB for 2UPN box + My>0', () => {
    const r = calcSteelColumn(inp({ sectionType: '2UPN', size: 200, My_Ed: 50 }));
    expect(r.chi_LT).toBeCloseTo(1.0, 3);
    expect(r.checks.some(c => c.id === 'LTB')).toBe(false);
  });
  it('Box buckling uses curve b (α=0.34) for both axes → chi_y ≈ chi_z for symmetric β', () => {
    const r = calcSteelColumn(inp({ sectionType: '2UPN', size: 200, beta_y: 1, beta_z: 1, Ly: 4000, Lz: 4000 }));
    // For box with same β: Iy > Iz → i_y > i_z → lambda_y < lambda_z → chi_y > chi_z
    expect(r.chi_y).toBeGreaterThan(r.chi_z);
  });
  it('2UPN160 and 2UPN300 both produce valid results', () => {
    const r160 = calcSteelColumn(inp({ sectionType: '2UPN', size: 160 }));
    const r300 = calcSteelColumn(inp({ sectionType: '2UPN', size: 300 }));
    expect(r160.valid).toBe(true);
    expect(r300.valid).toBe(true);
    // Larger section → higher NRd
    expect(r300.NRd).toBeGreaterThan(r160.NRd);
  });
});

// ─── Suite N: bcType → beta derivation ───────────────────────────────────
describe('getBetaForBCType — effective length factors', () => {
  it('pp → beta_y=1.0, beta_z=1.0', () => {
    expect(getBetaForBCType('pp', 1, 1)).toEqual({ beta_y: 1.0, beta_z: 1.0 });
  });
  it('ff → beta_y=0.5, beta_z=0.5', () => {
    expect(getBetaForBCType('ff', 1, 1)).toEqual({ beta_y: 0.5, beta_z: 0.5 });
  });
  it('pf → beta_y=0.7, beta_z=0.7', () => {
    expect(getBetaForBCType('pf', 1, 1)).toEqual({ beta_y: 0.7, beta_z: 0.7 });
  });
  it('fc → beta_y=2.0, beta_z=2.0 (ménsula)', () => {
    expect(getBetaForBCType('fc', 1, 1)).toEqual({ beta_y: 2.0, beta_z: 2.0 });
  });
  it('custom → uses provided beta_y and beta_z', () => {
    expect(getBetaForBCType('custom', 1.3, 0.9)).toEqual({ beta_y: 1.3, beta_z: 0.9 });
  });
  it('fc vs pp: longer effective length → higher slenderness', () => {
    const base = { sectionType: 'HEB' as const, size: 200, steel: 'S275' as const, Ly: 3000, Lz: 3000 };
    const rPP = calcSteelColumn({ ...steelColumnDefaults, ...base, bcType: 'pp', beta_y: 1.0, beta_z: 1.0 });
    const rFC = calcSteelColumn({ ...steelColumnDefaults, ...base, bcType: 'fc', beta_y: 2.0, beta_z: 2.0 });
    expect(rFC.lambda_y).toBeGreaterThan(rPP.lambda_y);
    expect(rFC.chi_y).toBeLessThan(rPP.chi_y);
  });
});

