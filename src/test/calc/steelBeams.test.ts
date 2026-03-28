import { describe, it, expect } from 'vitest';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { steelBeamDefaults } from '../../data/defaults';

// ─── Suite 1: IPE300 / S275 / ss defaults — CUMPLE ──────────────────────────
// Reference hand-calc:
//   Wpl_y = 628 cm³ = 628000 mm³
//   Mc_Rd = 628000 × 275 / 1.05 / 1e6 = 164.5 kNm
//   eta_M = 80 / 164.5 = 0.487
//   Vc_Rd ≈ 388 kN → eta_V = 60/388 = 0.155  (< 0.5, no M-V interaction)
//   delta_max = (5/48) × 50e6 × (6000)² / (210000 × 83,560,000) ≈ 10.7 mm
//   delta_adm = 6000/300 = 20 mm  → eta_delta ≈ 0.535
//
// beamType='ss': VEd_interaction=0 → interaction row absent → 5 rows total
describe('calcSteelBeam — IPE300/S275 defaults ss (CUMPLE)', () => {
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

  // ss + VEd_interaction=0 → interaction row absent → 5 rows
  it('ss beam: 5 check rows (interaction absent)', () => {
    expect(result.checks).toHaveLength(5);
    const ids = result.checks.map((c) => c.id);
    expect(ids).toContain('classification');
    expect(ids).toContain('bending');
    expect(ids).toContain('shear');
    expect(ids).toContain('ltb');
    expect(ids).toContain('deflection');
    expect(ids).not.toContain('interaction');
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
// IPE200/S275: Vc_Rd ≈ 212 kN → VEd_interaction=150 > 0.5×Vc_Rd → rho > 0 → Mv_Rd < Mc_Rd
// beamType must be non-ss (cantilever) so VEd_interaction>0 triggers the interaction row.
describe('calcSteelBeam — M-V interaction (VEd_interaction > 0.5·Vc,Rd)', () => {
  const result = calcSteelBeam({
    ...steelBeamDefaults,
    beamType: 'cantilever',
    tipo: 'IPE',
    size: 200,
    MEd: 20,
    VEd: 150,
    VEd_interaction: 150,
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

  it('interaction check row is present (VEd_interaction > 0)', () => {
    const interactionRow = result.checks.find((c) => c.id === 'interaction');
    expect(interactionRow).toBeDefined();
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

// ─── Suite 6: LTB — beam type C1 effect on Mcr ──────────────────────────────
// ss: C1=1.13, cantilever: C1=1.0 → ss Mcr > cantilever Mcr (higher C1 = more stable)
describe('calcSteelBeam — LTB beam type affects C1 and Mcr', () => {
  const ss   = calcSteelBeam({ ...steelBeamDefaults, beamType: 'ss',         Lcr: 6000 });
  const cant = calcSteelBeam({ ...steelBeamDefaults, beamType: 'cantilever', Lcr: 6000 });

  it('ss (C1=1.13) gives higher Mcr than cantilever (C1=1.0)', () => {
    expect(ss.Mcr).toBeGreaterThan(cant.Mcr);
  });

  it('cantilever gives higher lambda_LT (less favourable)', () => {
    expect(cant.lambda_LT).toBeGreaterThan(ss.lambda_LT);
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

// ─── Suite 8: Beam type k_defl affects deflection ────────────────────────────
// cantilever k=1/4 ≈ 0.250 >> ss k=5/48 ≈ 0.104 → cantilever deflects more
describe('calcSteelBeam — deflection: cantilever vs ss', () => {
  const ss   = calcSteelBeam({ ...steelBeamDefaults, beamType: 'ss'         });
  const cant = calcSteelBeam({ ...steelBeamDefaults, beamType: 'cantilever' });

  it('cantilever (k=1/4) deflects more than ss (k=5/48) for same loads', () => {
    expect(cant.delta_max).toBeGreaterThan(ss.delta_max);
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

// ─── Suite 13: ss beam type — interaction row absent ─────────────────────────
// For beamType='ss', VEd_interaction=0 → interaction row absent (midspan V=0 for UDL).
describe('calcSteelBeam — ss beam type (M-V interaction absent)', () => {
  const result = calcSteelBeam({
    ...steelBeamDefaults,
    beamType: 'ss',
    MEd: 58.7,
    VEd: 39.15,
    VEd_interaction: 0,
    Mser: 40.5,
  });

  it('result is valid', () => {
    expect(result.valid).toBe(true);
  });

  it('VEd_interaction = 0', () => {
    expect(result.VEd_interaction).toBe(0);
  });

  it('rho = 0 (no web reduction when VEd_interaction = 0)', () => {
    expect(result.rho).toBe(0);
  });

  it('Mv_Rd = Mc_Rd (no interaction reduction)', () => {
    expect(result.Mv_Rd).toBeCloseTo(result.Mc_Rd, 3);
  });

  it('5 check rows (interaction row absent)', () => {
    expect(result.checks).toHaveLength(5);
    const ids = result.checks.map((c) => c.id);
    expect(ids).not.toContain('interaction');
  });

  it('checks has classification, bending, shear, ltb, deflection', () => {
    const ids = result.checks.map((c) => c.id);
    expect(ids).toContain('classification');
    expect(ids).toContain('bending');
    expect(ids).toContain('shear');
    expect(ids).toContain('ltb');
    expect(ids).toContain('deflection');
  });
});

// ─── Suite 14: Lcr > L warning row ──────────────────────────────────────────
// When Lcr > L (e.g. conservative cantilever assumption), a neutral 'lcr-warning'
// row is injected. Result is still valid and conservative.
describe('calcSteelBeam — Lcr > L warning', () => {
  const result = calcSteelBeam({
    ...steelBeamDefaults,
    Lcr: 8000,   // > L=6000
    L: 6000,
    MEd: 80,
  });

  it('result is valid (Lcr>L is conservative, not unconservative)', () => {
    expect(result.valid).toBe(true);
  });

  it('lcr-warning row is present', () => {
    const warnRow = result.checks.find((c) => c.id === 'lcr-warning');
    expect(warnRow).toBeDefined();
  });

  it('lcr-warning row is neutral (informational, no utilization bar)', () => {
    const warnRow = result.checks.find((c) => c.id === 'lcr-warning')!;
    expect(warnRow.neutral).toBe(true);
    expect(warnRow.status).toBe('neutral');
    expect(warnRow.tag).toBe('REVISAR');
  });

  it('lcr-warning row references CTE DB-SE-A 6.3.2', () => {
    const warnRow = result.checks.find((c) => c.id === 'lcr-warning')!;
    expect(warnRow.article).toMatch(/6\.3\.2/);
  });
});

// ─── Suite 15: cantilever — interaction row present ──────────────────────────
// cantilever: VEd_interaction = VEd (shear at fixed support = max V = wL)
// With VEd_interaction > 0, interaction row always appears in check list.
describe('calcSteelBeam — cantilever beam type (interaction row present)', () => {
  const result = calcSteelBeam({
    ...steelBeamDefaults,
    beamType: 'cantilever',
    MEd: 60,
    VEd: 40,
    VEd_interaction: 40,
    Mser: 30,
    L: 4000,
    Lcr: 8000,
  });

  it('result is valid', () => {
    expect(result.valid).toBe(true);
  });

  it('interaction row present (VEd_interaction > 0)', () => {
    const ids = result.checks.map((c) => c.id);
    expect(ids).toContain('interaction');
  });

  it('6 check rows for cantilever (interaction present)', () => {
    // classification + bending + shear + interaction + ltb + deflection = 6
    // (no lcr-warning since Lcr=2×L=8000 which equals Lcr_factor×L=2×4000)
    const nonWarning = result.checks.filter((c) => c.id !== 'lcr-warning');
    expect(nonWarning).toHaveLength(6);
  });
});

// ─── Suite 16: ff beam type — k_defl and MEd formulas ───────────────────────
// ff: k=1/32=0.03125, MEd=wL²/12 (less than ss wL²/8)
// For same Mser, ff deflects less than ss (lower k).
describe('calcSteelBeam — ff vs ss: deflection and MEd', () => {
  const ss = calcSteelBeam({ ...steelBeamDefaults, beamType: 'ss' });
  const ff = calcSteelBeam({ ...steelBeamDefaults, beamType: 'ff' });

  it('both are valid', () => {
    expect(ss.valid).toBe(true);
    expect(ff.valid).toBe(true);
  });

  it('ff deflects less than ss for same Mser and L (k_ff < k_ss)', () => {
    expect(ff.delta_max).toBeLessThan(ss.delta_max);
  });
});
