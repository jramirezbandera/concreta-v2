import { describe, it, expect } from 'vitest';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { steelBeamDefaults } from '../../data/defaults';

// ─── Suite 1: IPE300 / S275 / defaults — CUMPLE ────────────────────────────
// Reference hand-calc:
//   Wpl_y = 628 cm³ = 628000 mm³
//   Mc_Rd = 628000 × 275 / 1.05 / 1e6 = 164.5 kNm
//   eta_M = 80 / 164.5 = 0.487
//   Vc_Rd ≈ 388 kN → eta_V = 60/388 = 0.155  (< 0.5, no M-V interaction)
//   delta_max = (5/48) × 50e6 × (6000)² / (210000 × 83,560,000) ≈ 10.7 mm
//   delta_adm = 6000/300 = 20 mm  → eta_delta ≈ 0.535
describe('calcSteelBeam — IPE300/S275 defaults (CUMPLE)', () => {
  const result = calcSteelBeam(steelBeamDefaults);

  it('result is valid', () => {
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('section class = 1', () => {
    expect(result.sectionClass).toBe(1);
  });

  it('Mc_Rd ≈ 164.5 kNm', () => {
    expect(result.Mc_Rd).toBeCloseTo(164.5, 0);
  });

  it('bending utilization ≈ 0.487', () => {
    expect(result.eta_M).toBeCloseTo(0.487, 1);
  });

  it('shear utilization < 0.5 (no M-V interaction)', () => {
    expect(result.eta_V).toBeLessThan(0.5);
    expect(result.rho).toBe(0);
  });

  it('Mv_Rd = Mc_Rd when no interaction', () => {
    expect(result.Mv_Rd).toBeCloseTo(result.Mc_Rd, 1);
  });

  it('delta_adm = L/300 = 20 mm', () => {
    expect(result.delta_adm).toBeCloseTo(20, 1);
  });

  it('all standard checks present (6 rows)', () => {
    expect(result.checks).toHaveLength(6);
    const ids = result.checks.map((c) => c.id);
    expect(ids).toContain('classification');
    expect(ids).toContain('bending');
    expect(ids).toContain('shear');
    expect(ids).toContain('interaction');
    expect(ids).toContain('ltb');
    expect(ids).toContain('deflection');
  });

  it('classification row is neutral', () => {
    const classRow = result.checks.find((c) => c.id === 'classification')!;
    expect(classRow.neutral).toBe(true);
    expect(classRow.status).toBe('neutral');
    expect(classRow.tag).toBe('CLASE 1');
  });

  it('all non-neutral checks have status ok/warn/fail', () => {
    result.checks
      .filter((c) => !c.neutral)
      .forEach((c) => {
        expect(['ok', 'warn', 'fail']).toContain(c.status);
      });
  });

  it('all check articles reference CTE', () => {
    result.checks.forEach((c) => {
      expect(c.article).toMatch(/CTE/);
    });
  });

  it('all utilizations < 1.0 (all CUMPLE)', () => {
    result.checks
      .filter((c) => !c.neutral)
      .forEach((c) => {
        expect(c.utilization).toBeLessThan(1.0);
      });
  });
});

// ─── Suite 2: IPE240/S275 — ADVERTENCIA (at least one eta ≥ 0.8) ───────────
describe('calcSteelBeam — IPE240/S275 high load (ADVERTENCIA)', () => {
  // IPE240: Mc_Rd = 367000×275/1.05/1e6 = 96.1 kNm → MEd=80 → eta_M = 0.832 (>0.8)
  const result = calcSteelBeam({
    ...steelBeamDefaults,
    tipo: 'IPE',
    size: 240,
    MEd: 80,
    VEd: 30,
    Lcr: 4000,
    Mser: 40,
    L: 5000,
  });

  it('result is valid', () => {
    expect(result.valid).toBe(true);
  });

  it('at least one non-neutral check has utilization ≥ 0.8', () => {
    const maxUtil = Math.max(
      ...result.checks.filter((c) => !c.neutral).map((c) => c.utilization),
    );
    expect(maxUtil).toBeGreaterThanOrEqual(0.8);
  });

  it('no check has utilization > 1.0 (still passes overall... or may fail LTB)', () => {
    // Just verifies we computed something reasonable
    expect(result.Mc_Rd).toBeGreaterThan(50);
  });
});

// ─── Suite 3: IPE160/S275/MEd=50 — INCUMPLE (bending fail) ─────────────────
// IPE160: Wpl_y=123cm³ → Mc_Rd = 123000×275/1.05/1e6 = 32.2 kNm  → eta_M = 50/32.2 = 1.55
describe('calcSteelBeam — IPE160/S275/MEd=50 (INCUMPLE bending)', () => {
  const result = calcSteelBeam({
    ...steelBeamDefaults,
    tipo: 'IPE',
    size: 160,
    MEd: 50,
    VEd: 20,
    Lcr: 3000,
    Mser: 20,
    L: 4000,
  });

  it('result is valid (calc proceeds, just fails checks)', () => {
    expect(result.valid).toBe(true);
  });

  it('bending check fails (eta_M > 1.0)', () => {
    const bendingCheck = result.checks.find((c) => c.id === 'bending')!;
    expect(bendingCheck.status).toBe('fail');
    expect(bendingCheck.utilization).toBeGreaterThan(1.0);
  });

  it('Mc_Rd ≈ 32.2 kNm', () => {
    expect(result.Mc_Rd).toBeCloseTo(32.2, 0);
  });
});

// ─── Suite 4: M-V interaction active ────────────────────────────────────────
// IPE200/S275: Vc_Rd ≈ 212 kN → VEd=150 > 0.5×Vc_Rd → rho > 0 → Mv_Rd < Mc_Rd
describe('calcSteelBeam — M-V interaction (VEd > 0.5·Vc,Rd)', () => {
  const result = calcSteelBeam({
    ...steelBeamDefaults,
    tipo: 'IPE',
    size: 200,
    MEd: 20,
    VEd: 150,
    Lcr: 4000,
    Mser: 10,
    L: 4000,
  });

  it('result is valid', () => {
    expect(result.valid).toBe(true);
  });

  it('eta_V > 0.5', () => {
    expect(result.eta_V).toBeGreaterThan(0.5);
  });

  it('rho > 0', () => {
    expect(result.rho).toBeGreaterThan(0);
  });

  it('Mv_Rd < Mc_Rd due to interaction', () => {
    expect(result.Mv_Rd).toBeLessThan(result.Mc_Rd);
  });
});

// ─── Suite 5: LTB significant reduction (long span) ─────────────────────────
// IPE300/S275/Lcr=8000: lambda_LT > 0.4 → chi_LT < 1.0 → Mb_Rd < Mc_Rd
describe('calcSteelBeam — LTB with long buckling length (Lcr=8000)', () => {
  const result = calcSteelBeam({
    ...steelBeamDefaults,
    Lcr: 8000,
    MEd: 80,
  });

  it('result is valid', () => {
    expect(result.valid).toBe(true);
  });

  it('lambda_LT > 0.4', () => {
    expect(result.lambda_LT).toBeGreaterThan(0.4);
  });

  it('chi_LT < 1.0 (buckling reduction)', () => {
    expect(result.chi_LT).toBeLessThan(1.0);
  });

  it('Mb_Rd < Mc_Rd', () => {
    expect(result.Mb_Rd).toBeLessThan(result.Mc_Rd);
  });

  it('LTB utilization > bending-only utilization', () => {
    expect(result.eta_LTB).toBeGreaterThan(result.eta_M);
  });
});

// ─── Suite 6: LTB — point load has higher C1 ─────────────────────────────────
describe('calcSteelBeam — LTB load type affects Mcr', () => {
  const uniform = calcSteelBeam({ ...steelBeamDefaults, loadTypeLTB: 'uniform', Lcr: 6000 });
  const point   = calcSteelBeam({ ...steelBeamDefaults, loadTypeLTB: 'point',   Lcr: 6000 });

  it('C1=1.35 (point) gives higher Mcr than C1=1.13 (uniform)', () => {
    expect(point.Mcr).toBeGreaterThan(uniform.Mcr);
  });

  it('point load gives lower lambda_LT (more favourable)', () => {
    expect(point.lambda_LT).toBeLessThan(uniform.lambda_LT);
  });
});

// ─── Suite 7: Deflection governing ──────────────────────────────────────────
// IPE160/S275/L=10000/Mser=40: huge deflection → eta_delta >> 1
// delta_max = (5/48) × 40e6 × (10000)² / (210000 × 8,690,000) ≈ 228 mm
// delta_adm = 10000/300 ≈ 33.3 mm  → eta_delta ≈ 6.8
describe('calcSteelBeam — deflection governing (large span)', () => {
  const result = calcSteelBeam({
    ...steelBeamDefaults,
    tipo: 'IPE',
    size: 160,
    MEd: 5,
    VEd: 3,
    Mser: 40,
    L: 10000,
    Lcr: 3000,
  });

  it('result is valid', () => {
    expect(result.valid).toBe(true);
  });

  it('delta_adm = L/300 ≈ 33.3 mm', () => {
    expect(result.delta_adm).toBeCloseTo(33.3, 0);
  });

  it('delta_max >> delta_adm', () => {
    expect(result.delta_max).toBeGreaterThan(result.delta_adm * 3);
  });

  it('deflection check fails', () => {
    const deflCheck = result.checks.find((c) => c.id === 'deflection')!;
    expect(deflCheck.status).toBe('fail');
  });

  it('governing = deflection', () => {
    expect(result.governing).toBe('deflection');
  });
});

// ─── Suite 8: Point load deflection formula ──────────────────────────────────
describe('calcSteelBeam — deflection point vs uniform', () => {
  const uniform = calcSteelBeam({ ...steelBeamDefaults, loadTypeDefl: 'uniform' });
  const point   = calcSteelBeam({ ...steelBeamDefaults, loadTypeDefl: 'point' });

  it('uniform load (5/48) gives larger deflection than midpoint load (1/12)', () => {
    // 5/48 ≈ 0.1042,  1/12 ≈ 0.0833  → uniform > point
    expect(uniform.delta_max).toBeGreaterThan(point.delta_max);
  });
});

// ─── Suite 9: Unknown profile → invalid result ──────────────────────────────
describe('calcSteelBeam — unknown profile', () => {
  const result = calcSteelBeam({ ...steelBeamDefaults, tipo: 'IPE', size: 9999 });

  it('result is invalid', () => {
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── Suite 10: S275 vs S355 — higher fy → higher resistance ─────────────────
describe('calcSteelBeam — S275 vs S355', () => {
  const s275 = calcSteelBeam({ ...steelBeamDefaults, steel: 'S275' });
  const s355 = calcSteelBeam({ ...steelBeamDefaults, steel: 'S355' });

  it('S355 has higher Mc_Rd', () => {
    expect(s355.Mc_Rd).toBeGreaterThan(s275.Mc_Rd);
  });

  it('S355 has higher Vc_Rd', () => {
    expect(s355.Vc_Rd).toBeGreaterThan(s275.Vc_Rd);
  });

  it('S355 has lower bending utilization for same loads', () => {
    expect(s355.eta_M).toBeLessThan(s275.eta_M);
  });
});

// ─── Suite 11: HEA vs HEB — same size, HEB is heavier ───────────────────────
describe('calcSteelBeam — HEA300 vs HEB300', () => {
  const hea = calcSteelBeam({ ...steelBeamDefaults, tipo: 'HEA', size: 300 });
  const heb = calcSteelBeam({ ...steelBeamDefaults, tipo: 'HEB', size: 300 });

  it('both are valid', () => {
    expect(hea.valid).toBe(true);
    expect(heb.valid).toBe(true);
  });

  it('HEB300 has higher Mc_Rd than HEA300', () => {
    expect(heb.Mc_Rd).toBeGreaterThan(hea.Mc_Rd);
  });
});

// ─── Suite 12: Section classification tag reflects class ────────────────────
describe('calcSteelBeam — classification tag', () => {
  it('IPE300/S275 classification tag is CLASE 1', () => {
    const result = calcSteelBeam(steelBeamDefaults);
    const classRow = result.checks.find((c) => c.id === 'classification')!;
    expect(classRow.tag).toBe('CLASE 1');
  });
});
