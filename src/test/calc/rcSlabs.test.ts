// Forjados (reticular + losa maciza) — CE art. 21, 42, 44, 49.2.4
// Run: bun test src/test/calc/rcSlabs.test.ts

import { describe, expect, it } from 'vitest';
import { calcForjados, computeAnchorage } from '../../lib/calculations/rcSlabs';
import { solveRectangular, solveTSection, computeBEff } from '../../lib/calculations/rcTSection';
import { forjadosDefaults, type ForjadosInputs } from '../../data/defaults';
import { getConcrete, getFyd } from '../../data/materials';
import { getBarArea } from '../../data/rebar';

const base: ForjadosInputs = { ...forjadosDefaults };

// ── Pure math: solveRectangular ──────────────────────────────────────────────
describe('solveRectangular (Whitney block)', () => {
  it('x = As·fyd / (0.8·b·fcd)', () => {
    // As = 402mm² (2Ø16), b=120, fcd=25/1.5=16.667, fyd=500/1.15=434.78
    const As = 2 * getBarArea(16);
    const fcd = getConcrete(25).fcd;
    const fyd = getFyd(500);
    const { x } = solveRectangular(120, 310, As, fcd, fyd);
    const expected = (As * fyd) / (0.8 * 120 * fcd);
    expect(x).toBeCloseTo(expected, 3);
  });

  it('MRd = As·fyd·(d − 0.4·x) in kNm', () => {
    const As = 2 * getBarArea(16);
    const fcd = getConcrete(25).fcd;
    const fyd = getFyd(500);
    const { x, MRd } = solveRectangular(120, 310, As, fcd, fyd);
    const expected = (As * fyd * (310 - 0.4 * x)) / 1e6;
    expect(MRd).toBeCloseTo(expected, 4);
  });
});

// ── Pure math: computeBEff ──────────────────────────────────────────────────
describe('computeBEff', () => {
  it('intereje < L/5 → b_eff = intereje', () => {
    // L=5000, L0=0.7·L=3500, L0/5=700; intereje=600 < 700 → bEff = 600
    expect(computeBEff(600, 5000, 0.7, 120)).toBe(600);
  });

  it('intereje > L/5 → b_eff = L0/5', () => {
    // L=5000, L0=5000, L0/5=1000; intereje=1200 → bEff = 1000
    expect(computeBEff(1200, 5000, 1.0, 120)).toBe(1000);
  });

  it('never below b_w', () => {
    // intereje=100, L0/5=200, b_w=150 → clamp to 150
    expect(computeBEff(100, 1000, 1.0, 150)).toBe(150);
  });

  it('continuo-interior factor 0.7 reduces L0', () => {
    // L=6000 → L0 = 4200 → L0/5 = 840
    expect(computeBEff(2000, 6000, 0.7, 120)).toBe(840);
  });
});

// ── Pure math: solveTSection ─────────────────────────────────────────────────
describe('solveTSection', () => {
  const fcd = getConcrete(25).fcd;
  const fyd = getFyd(500);

  it('x ≤ h_f → rect-bEff branch', () => {
    // bEff=820, bWeb=120, hFlange=50, d=310, As=2Ø12=226mm²
    // x_rect = 226·434.78 / (0.8·820·16.667) = ~9mm ≤ 50 → rect-bEff
    const r = solveTSection(820, 120, 50, 310, 2 * getBarArea(12), fcd, fyd);
    expect(r.branch).toBe('rect-bEff');
    expect(r.x).toBeLessThanOrEqual(50);
  });

  it('x > h_f → t-real branch', () => {
    // Force huge As so rect x exceeds hFlange
    // As large → x_rect > 50 → enter T-real
    const As = 20 * getBarArea(20); // ~6283mm²
    const r = solveTSection(820, 120, 50, 310, As, fcd, fyd);
    expect(r.branch).toBe('t-real');
    expect(r.x).toBeGreaterThan(50);
  });

  it('t-real MRd = web + flange contributions', () => {
    const As = 20 * getBarArea(20);
    const bEff = 820, bWeb = 120, hFlange = 50, d = 310;
    const r = solveTSection(bEff, bWeb, hFlange, d, As, fcd, fyd);
    // Recompute manually
    const Asf = ((bEff - bWeb) * hFlange * fcd) / fyd;
    const AsWeb = As - Asf;
    const xWeb = (AsWeb * fyd) / (0.8 * bWeb * fcd);
    const MRdWeb = (AsWeb * fyd * (d - 0.4 * xWeb)) / 1e6;
    const MRdFlange = (Asf * fyd * (d - hFlange / 2)) / 1e6;
    expect(r.MRd).toBeCloseTo(MRdWeb + MRdFlange, 2);
  });

  it('Asf ≥ As fallback → rect-bEff', () => {
    // Tiny As, huge flange overhang → Asf ≥ As → fallback
    const As = getBarArea(6); // 28mm²
    const r = solveTSection(2000, 100, 50, 310, As, fcd, fyd);
    expect(r.branch).toBe('rect-bEff');
  });
});

// ── calcForjados: FTUX defaults ──────────────────────────────────────────────
describe('calcForjados — FTUX defaults', () => {
  it('result is valid', () => {
    expect(calcForjados(base).valid).toBe(true);
  });

  it('reticular default: bEff > 0 and ≥ b_w', () => {
    const r = calcForjados(base);
    expect(r.bEff).toBeGreaterThan(0);
    expect(r.bEff).toBeGreaterThanOrEqual(base.bWeb as number);
  });

  it('vano uses rect-bEff branch with default 2Ø12 + 2Ø16 refuerzo', () => {
    // Base 2Ø12 + refuerzo 2Ø16 → x small → should stay inside the flange (hFlange=50)
    const r = calcForjados(base);
    expect(r.vano.branch).toBe('rect-bEff');
  });

  it('AsBase + AsRef = As (reticular vano)', () => {
    const r = calcForjados(base);
    // vano tracción: base_inf (2Ø12) + refuerzo_vano_inf (2Ø16)
    expect(r.vano.AsBase).toBeCloseTo(2 * getBarArea(12), 1);
    expect(r.vano.AsRef ).toBeCloseTo(2 * getBarArea(16), 1);
    expect(r.vano.As).toBeCloseTo(r.vano.AsBase + r.vano.AsRef, 1);
  });

  it('AsBase + AsRef = As (reticular apoyo)', () => {
    const r = calcForjados(base);
    // apoyo tracción: base_sup (2Ø12) + refuerzo_apoyo_sup (2Ø16)
    expect(r.apoyo.AsBase).toBeCloseTo(2 * getBarArea(12), 1);
    expect(r.apoyo.AsRef ).toBeCloseTo(2 * getBarArea(16), 1);
    expect(r.apoyo.As).toBeCloseTo(r.apoyo.AsBase + r.apoyo.AsRef, 1);
  });

  it('zero refuerzo → AsRef = 0 and As = AsBase', () => {
    const r = calcForjados({
      ...base,
      refuerzo_vano_inf_nBars: 0,
      refuerzo_apoyo_sup_nBars: 0,
    });
    expect(r.vano.AsRef).toBe(0);
    expect(r.apoyo.AsRef).toBe(0);
    expect(r.vano.As).toBeCloseTo(r.vano.AsBase, 1);
  });

  it('apoyo uses rect-bw branch', () => {
    const r = calcForjados(base);
    expect(r.apoyo.branch).toBe('rect-bw');
  });
});

// ── Reticular vs maciza ──────────────────────────────────────────────────────
describe('variant switch', () => {
  it('maciza: b flexión = 1000', () => {
    const r = calcForjados({ ...base, variant: 'maciza' });
    expect(r.vano.b).toBe(1000);
    expect(r.apoyo.b).toBe(1000);
  });

  it('maciza: bEff = 0, L0 = 0', () => {
    const r = calcForjados({ ...base, variant: 'maciza' });
    expect(r.bEff).toBe(0);
    expect(r.L0).toBe(0);
  });

  it('maciza: branch = rect', () => {
    const r = calcForjados({ ...base, variant: 'maciza' });
    expect(r.vano.branch).toBe('rect');
    expect(r.apoyo.branch).toBe('rect');
  });

  it('maciza: As aggregates base + refuerzo (per metre)', () => {
    // Defaults: base_inf Ø10/200 + refuerzo_vano_inf inactive (phi=0 → As_ref=0)
    const r = calcForjados({ ...base, variant: 'maciza' });
    const expectedAs = getBarArea(10) * (1000 / 200);
    expect(r.vano.AsBase).toBeCloseTo(expectedAs, 1);
    expect(r.vano.AsRef).toBe(0);
    expect(r.vano.As).toBeCloseTo(expectedAs, 1);
  });

  it('maciza apoyo: base + refuerzo summed', () => {
    // Defaults: base_sup Ø10/200 + refuerzo_apoyo_sup Ø12/200
    const r = calcForjados({ ...base, variant: 'maciza' });
    const expectedBase = getBarArea(10) * (1000 / 200);
    const expectedRef  = getBarArea(12) * (1000 / 200);
    expect(r.apoyo.AsBase).toBeCloseTo(expectedBase, 1);
    expect(r.apoyo.AsRef ).toBeCloseTo(expectedRef, 1);
    expect(r.apoyo.As).toBeCloseTo(expectedBase + expectedRef, 1);
  });
});

// ── Fisuración (wk) — only XC2+ ──────────────────────────────────────────────
describe('fisuración wk', () => {
  it('XC1 → no cracking check emitted', () => {
    const r = calcForjados({ ...base, exposureClass: 'XC1' });
    expect(r.vano.checks.some((c) => c.id === 'cracking')).toBe(false);
    expect(r.apoyo.checks.some((c) => c.id === 'cracking')).toBe(false);
  });

  it('XC2 → cracking check emitted in both zones', () => {
    const r = calcForjados({ ...base, exposureClass: 'XC2' });
    expect(r.vano.checks.some((c) => c.id === 'cracking')).toBe(true);
    expect(r.apoyo.checks.some((c) => c.id === 'cracking')).toBe(true);
  });

  it('XC3 wk > 0', () => {
    const r = calcForjados({ ...base, exposureClass: 'XC3' });
    expect(r.vano.wk).toBeGreaterThan(0);
  });
});

// ── Shear ────────────────────────────────────────────────────────────────────
describe('cortante', () => {
  it('stirrupsEnabled=false → check against VRd,c only', () => {
    const r = calcForjados({ ...base, stirrupsEnabled: false });
    expect(r.VRds).toBe(0);
    expect(r.VRdmax).toBe(0);
    expect(r.shearChecks.some((c) => c.description.includes('sin cercos'))).toBe(true);
  });

  it('stirrupsEnabled=true → VRds>0 and VRdmax>0', () => {
    const r = calcForjados({ ...base, stirrupsEnabled: true });
    expect(r.VRds).toBeGreaterThan(0);
    expect(r.VRdmax).toBeGreaterThan(0);
  });

  it('high VEd triggers fail when no stirrups', () => {
    const r = calcForjados({ ...base, stirrupsEnabled: false, VEd: 500 });
    const shear = r.shearChecks.find((c) => c.id === 'shear');
    expect(shear?.status).toBe('fail');
  });
});

// ── Cuantías ──────────────────────────────────────────────────────────────────
describe('cuantías mín/máx', () => {
  it('As,min check present in both zones', () => {
    const r = calcForjados(base);
    expect(r.vano.checks.some((c) => c.id === 'as-min')).toBe(true);
    expect(r.apoyo.checks.some((c) => c.id === 'as-min')).toBe(true);
  });

  it('As,max check present in both zones', () => {
    const r = calcForjados(base);
    expect(r.vano.checks.some((c) => c.id === 'as-max')).toBe(true);
    expect(r.apoyo.checks.some((c) => c.id === 'as-max')).toBe(true);
  });

  it('tiny As → As,min fails', () => {
    // Base 1Ø6 + no refuerzo → total ~28 mm², far below min
    const r = calcForjados({
      ...base,
      base_inf_nBars: 1, base_inf_barDiam: 6,
      refuerzo_vano_inf_nBars: 0,
    });
    const asMin = r.vano.checks.find((c) => c.id === 'as-min');
    expect(asMin?.status).toBe('fail');
  });
});

// ── Bar spacing ───────────────────────────────────────────────────────────────
describe('separación barras', () => {
  it('reticular: spacing check emitted when nBars > 1', () => {
    // With 2Ø12 base + 2Ø16 refuerzo (4 bars @ same layer in nervio=120 is
    // tight), the check may resolve to 'bar-spacing-impossible' — still a
    // spacing evaluation.
    const r = calcForjados(base);
    const emitted = r.vano.checks.some(
      (c) => c.id === 'bar-spacing' || c.id === 'bar-spacing-impossible',
    );
    expect(emitted).toBe(true);
  });

  it('reticular: bars dont fit → bar-spacing-impossible', () => {
    // Base 10Ø20 in b_w=120 → way too many
    const r = calcForjados({
      ...base,
      base_inf_nBars: 10, base_inf_barDiam: 20,
      refuerzo_vano_inf_nBars: 0,
    });
    const fail = r.vano.checks.find((c) => c.id === 'bar-spacing-impossible');
    expect(fail?.status).toBe('fail');
  });

  it('maciza: uses bar-spacing-maciza check', () => {
    const r = calcForjados({ ...base, variant: 'maciza' });
    expect(r.vano.checks.some((c) => c.id === 'bar-spacing-maciza')).toBe(true);
  });
});

// ── Info checks ──────────────────────────────────────────────────────────────
describe('info checks (no bloqueantes)', () => {
  it('reticular: biaxial note', () => {
    const r = calcForjados(base);
    expect(r.infoChecks.some((c) => c.id === 'biaxial-note')).toBe(true);
  });

  it('maciza: armadura de reparto note (CE art. 42.3.6)', () => {
    const r = calcForjados({ ...base, variant: 'maciza' });
    expect(r.infoChecks.some((c) => c.id === 'armadura-reparto')).toBe(true);
  });
});

// ── Invalid inputs ───────────────────────────────────────────────────────────
describe('input validation', () => {
  it('h ≤ 0 → invalid', () => {
    const r = calcForjados({ ...base, h: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('b_w ≤ 0 (reticular) → invalid', () => {
    const r = calcForjados({ ...base, bWeb: 0 });
    expect(r.valid).toBe(false);
  });

  it('Ø/s ≤ 0 (maciza base) → invalid', () => {
    const r = calcForjados({ ...base, variant: 'maciza', base_inf_s_mac: 0 });
    expect(r.valid).toBe(false);
  });

  it('invalid exposure class → invalid', () => {
    const r = calcForjados({ ...base, exposureClass: 'FOO' });
    expect(r.valid).toBe(false);
  });

  it('cover so large d ≤ 0 → invalid', () => {
    const r = calcForjados({ ...base, cover: 500 });
    expect(r.valid).toBe(false);
  });
});

// ── Tipo vano → L0 factor ────────────────────────────────────────────────────
describe('tipo vano L0 factor', () => {
  it('biapoyado: L0 = L', () => {
    const r = calcForjados({ ...base, tipoVano: 'biapoyado', spanLength: 5000 });
    expect(r.L0).toBe(5000);
  });

  it('continuo-extremo: L0 = 0.85 L', () => {
    const r = calcForjados({ ...base, tipoVano: 'continuo-extremo', spanLength: 5000 });
    expect(r.L0).toBeCloseTo(4250, 0);
  });

  it('continuo-interior: L0 = 0.70 L', () => {
    const r = calcForjados({ ...base, tipoVano: 'continuo-interior', spanLength: 5000 });
    expect(r.L0).toBeCloseTo(3500, 0);
  });

  it('voladizo: L0 = 2 L', () => {
    const r = calcForjados({ ...base, tipoVano: 'voladizo', spanLength: 3000 });
    expect(r.L0).toBe(6000);
  });
});

// ── Anclaje (CE art. 69.5.1.1) ──────────────────────────────────────────────
describe('computeAnchorage (CE art. 69.5.1.1)', () => {
  it('lb_rqd = (Ø/4)·(fyd/fbd) for Pos I', () => {
    // Ø16, fck=25 → fctm≈2.6, fctd=fctm/1.5
    // Pos I (inf, h=350) → η1=1, fbd = 2.25·1·1·fctd
    // fyd = 500/1.15
    const mat = getConcrete(25);
    const fyd = getFyd(500);
    const fctd = mat.fctm / 1.5;
    const fbd  = 2.25 * 1.0 * 1.0 * fctd;
    const expected = (16 / 4) * (fyd / fbd);
    const a = computeAnchorage(16, mat.fctm, fyd, 'inf', 350);
    expect(a.position).toBe('I');
    expect(a.lb_rqd).toBeCloseTo(expected, 2);
  });

  it('Pos II when cara=sup AND h > 300', () => {
    const mat = getConcrete(25);
    const fyd = getFyd(500);
    const a = computeAnchorage(16, mat.fctm, fyd, 'sup', 350);
    expect(a.position).toBe('II');
  });

  it('Pos I when cara=sup AND h ≤ 300 (losa fina)', () => {
    const mat = getConcrete(25);
    const fyd = getFyd(500);
    const a = computeAnchorage(12, mat.fctm, fyd, 'sup', 200);
    expect(a.position).toBe('I');
  });

  it('lb_min = max(0.3·lb_rqd, 10·Ø, 100 mm)', () => {
    const mat = getConcrete(25);
    const fyd = getFyd(500);
    const a = computeAnchorage(16, mat.fctm, fyd, 'inf', 350);
    const expected = Math.max(0.3 * a.lb_rqd, 10 * 16, 100);
    expect(a.lb_min).toBeCloseTo(expected, 3);
  });

  it('Pos II (η1=0.7) → lb_rqd is ~1/0.7 larger than Pos I', () => {
    const mat = getConcrete(25);
    const fyd = getFyd(500);
    const posI  = computeAnchorage(16, mat.fctm, fyd, 'inf', 350);
    const posII = computeAnchorage(16, mat.fctm, fyd, 'sup', 350);
    expect(posII.lb_rqd / posI.lb_rqd).toBeCloseTo(1 / 0.7, 2);
  });
});

describe('anchorage checks emitted', () => {
  it('reticular defaults → 2 anchorage checks per zone (base + refuerzo)', () => {
    const r = calcForjados(base);
    const vanoAnch  = r.vano.checks.filter((c) => c.id.startsWith('anchorage-'));
    const apoyoAnch = r.apoyo.checks.filter((c) => c.id.startsWith('anchorage-'));
    expect(vanoAnch.length).toBe(2);
    expect(apoyoAnch.length).toBe(2);
    expect(vanoAnch.every((c) => c.article === 'CE art. 69.5.1.1')).toBe(true);
  });

  it('no refuerzo → only 1 anchorage check per zone (base only)', () => {
    const r = calcForjados({
      ...base,
      refuerzo_vano_inf_nBars: 0,
      refuerzo_apoyo_sup_nBars: 0,
    });
    const vanoAnch  = r.vano.checks.filter((c) => c.id.startsWith('anchorage-'));
    const apoyoAnch = r.apoyo.checks.filter((c) => c.id.startsWith('anchorage-'));
    expect(vanoAnch.length).toBe(1);
    expect(apoyoAnch.length).toBe(1);
    expect(vanoAnch[0].id).toBe('anchorage-base-inf');
    expect(apoyoAnch[0].id).toBe('anchorage-base-sup');
  });

  it('maciza: refuerzo_vano vacío (phi=0) → sólo base en vano', () => {
    // Defaults: refuerzo_vano_inf_phi_mac=0 → refuerzo inactivo
    const r = calcForjados({ ...base, variant: 'maciza' });
    const vanoAnch  = r.vano.checks.filter((c) => c.id.startsWith('anchorage-'));
    const apoyoAnch = r.apoyo.checks.filter((c) => c.id.startsWith('anchorage-'));
    expect(vanoAnch.length).toBe(1);
    expect(vanoAnch[0].id).toBe('anchorage-base-inf');
    // apoyo default: base + refuerzo Ø12/200
    expect(apoyoAnch.length).toBe(2);
  });

  it('anchorage checks are non-blocking (status=ok, utilization=0)', () => {
    const r = calcForjados(base);
    const anch = [...r.vano.checks, ...r.apoyo.checks]
      .filter((c) => c.id.startsWith('anchorage-'));
    for (const c of anch) {
      expect(c.status).toBe('ok');
      expect(c.utilization).toBe(0);
    }
  });

  it('d_eff uses max Ø of tension face when refuerzo is larger', () => {
    // Base 2Ø12 + refuerzo 2Ø16 → d uses Ø16
    const r = calcForjados(base);
    const stirrupV = 0; // stirrupsEnabled=false in defaults
    const expectedDVano = (base.h as number) - (base.cover as number) - stirrupV - 16 / 2;
    expect(r.vano.d).toBeCloseTo(expectedDVano, 1);
  });

  it('d_eff uses base Ø when refuerzo is absent', () => {
    const r = calcForjados({ ...base, refuerzo_vano_inf_nBars: 0 });
    // Base 2Ø12 only → d uses Ø12
    const expectedDVano = (base.h as number) - (base.cover as number) - 0 - 12 / 2;
    expect(r.vano.d).toBeCloseTo(expectedDVano, 1);
  });
});
