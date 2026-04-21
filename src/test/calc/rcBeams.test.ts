// RC Beams test suite — 4 bar layers (vano_bot, vano_top, apoyo_top, apoyo_bot)
// Tests: FTUX defaults, all check types, edge cases, per-section invalidation, global invalidation
// Covers: d fix (stirrupDiam included), psi2 lookup, bending-over, rho-w-min, bar-spacing,
//         cracking, lap lengths, rebar schedule format, comp bar As,min, s_max stirrup check

import { describe, expect, it } from 'vitest';
import { calcRCBeam } from '../../lib/calculations/rcBeams';
import { rcBeamDefaults } from '../../data/defaults';

// Shared base fixture — all tests clone and override as needed
const base = { ...rcBeamDefaults };

// ── FTUX defaults ────────────────────────────────────────────────────────────
describe('FTUX defaults', () => {
  it('result is valid', () => {
    const r = calcRCBeam(base);
    expect(r.valid).toBe(true);
  });

  it('vano: d = 454 mm (h=500, cover=30, stirrup=8, bar=16)', () => {
    // d = 500 - 30 - 8 - 16/2 = 454
    const r = calcRCBeam(base);
    expect(r.vano.valid).toBe(true);
    expect(r.vano.d).toBe(454);
  });

  it('vano: As (tension) = 4 * 201.1 = 804.4 mm2', () => {
    const r = calcRCBeam(base);
    expect(r.vano.As).toBeCloseTo(804.4, 0);
  });

  it('vano: AsComp (compression) = 2 * 113.1 = 226.2 mm2', () => {
    const r = calcRCBeam(base);
    expect(r.vano.AsComp).toBeCloseTo(226.2, 0);
  });

  it('vano: x in 85-90 mm range', () => {
    const r = calcRCBeam(base);
    expect(r.vano.x).toBeGreaterThan(85);
    expect(r.vano.x).toBeLessThan(90);
  });

  it('vano: MRd approx 147 kNm', () => {
    const r = calcRCBeam(base);
    expect(r.vano.MRd).toBeCloseTo(147, 0);
  });

  it('vano: Md=85 < MRd=147 → utilization ~0.58 → bending ok', () => {
    const r = calcRCBeam(base);
    const b = r.vano.checks.find((c) => c.id === 'bending')!;
    expect(b.status).toBe('ok');
    expect(b.utilization).toBeGreaterThan(0.5);
    expect(b.utilization).toBeLessThan(0.8);
  });

  it('vano: all checks are ok (no fail)', () => {
    const r = calcRCBeam(base);
    for (const c of r.vano.checks) {
      expect(c.status).not.toBe('fail');
    }
  });

  it('apoyo: d = 454 mm (same bar diam)', () => {
    const r = calcRCBeam(base);
    expect(r.apoyo.valid).toBe(true);
    expect(r.apoyo.d).toBe(454);
  });

  it('apoyo: all checks are ok (no fail)', () => {
    const r = calcRCBeam(base);
    for (const c of r.apoyo.checks) {
      expect(c.status).not.toBe('fail');
    }
  });

  it('vano checks include rho-w-min', () => {
    const r = calcRCBeam(base);
    expect(r.vano.checks.map((c) => c.id)).toContain('rho-w-min');
  });

  it('vano checks include bar-spacing', () => {
    const r = calcRCBeam(base);
    expect(r.vano.checks.map((c) => c.id)).toContain('bar-spacing');
  });

  it('vano checks include stirrup-spacing-max', () => {
    const r = calcRCBeam(base);
    expect(r.vano.checks.map((c) => c.id)).toContain('stirrup-spacing-max');
  });

  it('vano checks include as-min-comp', () => {
    const r = calcRCBeam(base);
    expect(r.vano.checks.map((c) => c.id)).toContain('as-min-comp');
  });

  it('all check rows have article field referencing CE code', () => {
    const r = calcRCBeam(base);
    for (const s of [r.vano, r.apoyo]) {
      for (const c of s.checks) {
        expect(c.article).toMatch(/CE (?:art\.|Anejo)/);
      }
    }
  });
});

// ── Per-section effective depth ───────────────────────────────────────────────
describe('Per-section effective depth', () => {
  it('vano_bot_barDiam=20 -> d_vano=452, apoyo_top_barDiam=12 -> d_apoyo=456', () => {
    const r = calcRCBeam({ ...base, vano_bot_barDiam: 20, apoyo_top_barDiam: 12 });
    expect(r.vano.d).toBe(452);
    expect(r.apoyo.d).toBe(456);
  });

  it('more tension bars at vano -> larger As at vano', () => {
    const r = calcRCBeam({ ...base, vano_bot_nBars: 6, apoyo_top_nBars: 2 });
    expect(r.vano.As).toBeGreaterThan(r.apoyo.As);
  });
});

// ── Per-section stirrup spacing ───────────────────────────────────────────────
describe('Per-section stirrup spacing', () => {
  it('denser stirrups at apoyo -> higher VRds at apoyo', () => {
    const r = calcRCBeam({ ...base, vano_stirrupSpacing: 200, apoyo_stirrupSpacing: 100 });
    expect(r.apoyo.VRds).toBeGreaterThan(r.vano.VRds);
  });
});

// ── psi2 / loadType lookup ────────────────────────────────────────────────────
describe('psi2 / loadType', () => {
  it('residential -> psi2 = 0.3 -> wk > 0', () => {
    const r = calcRCBeam({ ...base, loadType: 'residential', vano_M_G: 40, vano_M_Q: 20 });
    expect(r.vano.wk).toBeGreaterThan(0);
  });

  it('roof -> psi2 = 0.0 -> lower wk than residential', () => {
    const res  = calcRCBeam({ ...base, loadType: 'residential', vano_M_G: 40, vano_M_Q: 20 });
    const roof = calcRCBeam({ ...base, loadType: 'roof',        vano_M_G: 40, vano_M_Q: 20 });
    expect(roof.vano.wk).toBeLessThan(res.vano.wk);
  });

  it('parking -> psi2 = 0.6 -> higher wk than residential', () => {
    const res = calcRCBeam({ ...base, loadType: 'residential', vano_M_G: 30, vano_M_Q: 20 });
    const par = calcRCBeam({ ...base, loadType: 'parking',     vano_M_G: 30, vano_M_Q: 20 });
    expect(par.vano.wk).toBeGreaterThan(res.vano.wk);
  });

  it('custom loadType uses psi2Custom', () => {
    const r   = calcRCBeam({ ...base, loadType: 'custom', psi2Custom: 0.6, vano_M_G: 30, vano_M_Q: 20 });
    const par = calcRCBeam({ ...base, loadType: 'parking',                  vano_M_G: 30, vano_M_Q: 20 });
    expect(r.vano.wk).toBeCloseTo(par.vano.wk, 3);
  });

  it('psi2Custom ignored when loadType != custom', () => {
    const r1 = calcRCBeam({ ...base, loadType: 'residential', psi2Custom: 0.6 });
    const r2 = calcRCBeam({ ...base, loadType: 'residential', psi2Custom: 0.0 });
    expect(r1.vano.wk).toBeCloseTo(r2.vano.wk, 6);
  });
});

// ── Bending check thresholds ──────────────────────────────────────────────────
describe('Bending check thresholds', () => {
  it('Md < 0.8*MRd -> bending ok', () => {
    const r = calcRCBeam(base); // Md=85, MRd~147 -> util~0.58
    expect(r.vano.checks.find((c) => c.id === 'bending')!.status).toBe('ok');
  });

  it('0.8*MRd <= Md < MRd -> bending warn', () => {
    const r = calcRCBeam({ ...base, vano_Md: 130 }); // MRd~147, util~0.88
    expect(r.vano.checks.find((c) => c.id === 'bending')!.status).toBe('warn');
  });

  it('Md > MRd -> bending fail, utilization > 1', () => {
    const r = calcRCBeam({ ...base, vano_Md: 200 });
    const b = r.vano.checks.find((c) => c.id === 'bending')!;
    expect(b.status).toBe('fail');
    expect(b.utilization).toBeGreaterThan(1);
  });
});

// ── Over-reinforcement ────────────────────────────────────────────────────────
describe('Over-reinforcement', () => {
  it('normal section: no bending-over row', () => {
    const r = calcRCBeam(base);
    expect(r.vano.checks.map((c) => c.id)).not.toContain('bending-over');
  });

  it('over-reinforced: bending-over warn row present', () => {
    const r = calcRCBeam({ ...base, vano_bot_nBars: 10, vano_bot_barDiam: 32 });
    const bo = r.vano.checks.find((c) => c.id === 'bending-over');
    expect(bo).toBeDefined();
    expect(bo!.status).toBe('warn');
  });
});

// ── Min/max reinforcement ─────────────────────────────────────────────────────
describe('Reinforcement limits', () => {
  it('default As (tension) satisfies as-min', () => {
    expect(calcRCBeam(base).vano.checks.find((c) => c.id === 'as-min')!.status).toBe('ok');
  });

  it('As (tension) < As,min -> as-min fail', () => {
    const r = calcRCBeam({ ...base, vano_bot_nBars: 1, vano_bot_barDiam: 6 });
    expect(r.vano.checks.find((c) => c.id === 'as-min')!.status).toBe('fail');
  });

  it('default AsComp (compression) satisfies as-min-comp', () => {
    expect(calcRCBeam(base).vano.checks.find((c) => c.id === 'as-min-comp')!.status).toBe('ok');
  });

  it('AsComp (compression) < As,min -> as-min-comp fail', () => {
    const r = calcRCBeam({ ...base, vano_top_nBars: 1, vano_top_barDiam: 6 });
    expect(r.vano.checks.find((c) => c.id === 'as-min-comp')!.status).toBe('fail');
  });

  // CE art. 42.3.5 Tabla 42.3.5 — geometric minimum uses gross area b·h,
  // NOT the effective depth b·d. Regression for the ~10% unconservative bug.
  it('as-min geometric minimum uses b·h (CE art. 42.3.5), not b·d', () => {
    // Default beam: b=300, h=500 → AsMinGeom = 0.0028·300·500 = 420 mm²
    // Mechanical: 0.04·b·h·fcd/fyd = 0.04·300·500·(25/1.5)/(500/1.15)
    //           = 6000·(16.67/434.78) = 6000·0.03833 = 230.0 mm²
    // So geometric governs: As,min = 420 mm². A tiny As (e.g. 1∅6 = 28 mm²)
    // should force the fail branch and expose the limit in the check label.
    const r = calcRCBeam({ ...base, vano_bot_nBars: 1, vano_bot_barDiam: 6 });
    const asMin = r.vano.checks.find((c) => c.id === 'as-min')!;
    expect(asMin.status).toBe('fail');
    // Extract the limit from the value/limit fields (makeCheck stringifies)
    // — parse "As,min = 420 mm²"
    const match = (asMin.value ?? '').match(/As,min\s*=\s*(\d+)/);
    expect(match).toBeTruthy();
    const asMinParsed = Number(match![1]);
    // b·h → 420 mm²; with the buggy b·d it was ~380 mm² (for d≈452).
    // Assert the exact new value (± rounding) to catch any regression.
    expect(asMinParsed).toBe(420);
  });

  it('as-min scales with h when b·h is used', () => {
    // Doubling h from 500 → 1000 with same cover must exactly double
    // the geometric minimum (420 → 840). Under the old b·d formula the
    // ratio would be slightly different because d scales non-linearly with h.
    const r1 = calcRCBeam({ ...base, h: 500 });
    const r2 = calcRCBeam({ ...base, h: 1000 });
    const asMin1 = r1.vano.checks.find((c) => c.id === 'as-min')!;
    const asMin2 = r2.vano.checks.find((c) => c.id === 'as-min')!;
    const n1 = Number((asMin1.value ?? '').match(/As,min\s*=\s*(\d+)/)![1]);
    const n2 = Number((asMin2.value ?? '').match(/As,min\s*=\s*(\d+)/)![1]);
    expect(n2 / n1).toBeCloseTo(2.0, 2);
  });

  it('As,total > As,max -> as-max fail', () => {
    // As,max = 0.04*300*500=6000mm2; tension 10*804.2=8042 alone exceeds limit
    const r = calcRCBeam({ ...base, vano_bot_nBars: 10, vano_bot_barDiam: 32 });
    expect(r.vano.checks.find((c) => c.id === 'as-max')!.status).toBe('fail');
  });
});

// ── Shear ─────────────────────────────────────────────────────────────────────
describe('Shear checks', () => {
  it('VEd < VRd -> shear ok', () => {
    expect(calcRCBeam(base).vano.checks.find((c) => c.id === 'shear')!.status).toBe('ok');
  });

  it('VEd >> VRd -> shear fail', () => {
    const r = calcRCBeam({ ...base, vano_VEd: 500 });
    expect(r.vano.checks.find((c) => c.id === 'shear')!.status).toBe('fail');
  });

  it('hasStirrups=true -> shear-max row present', () => {
    expect(calcRCBeam(base).vano.checks.map((c) => c.id)).toContain('shear-max');
  });

  it('hasStirrups=false (spacing=0) -> no shear-max row', () => {
    const r = calcRCBeam({ ...base, vano_stirrupSpacing: 0 });
    expect(r.vano.checks.map((c) => c.id)).not.toContain('shear-max');
  });
});

// ── rho_w,min ─────────────────────────────────────────────────────────────────
describe('rho-w-min check', () => {
  it('default stirrups: rho-w-min ok', () => {
    expect(calcRCBeam(base).vano.checks.find((c) => c.id === 'rho-w-min')!.status).toBe('ok');
  });

  it('rhoW < rhoWMin -> rho-w-min fail', () => {
    // rhoWMin = 0.072*sqrt(25)/500 = 0.00072
    // f6/c1000: rhoW = 2*28.3/(1000*300) = 0.000189 < 0.00072
    const r = calcRCBeam({ ...base, vano_stirrupDiam: 6, vano_stirrupSpacing: 1000 });
    expect(r.vano.checks.find((c) => c.id === 'rho-w-min')!.status).toBe('fail');
  });

  it('rhoW ok but stirrupSpacing > 0.75*d -> rho-w-min warn', () => {
    // d=454, 0.75*d=340.5. f8/c400: rhoW=2*50.3/(400*300)=0.000838 > 0.00072 ok ratio
    // but 400 > 340.5 -> warn
    const r = calcRCBeam({ ...base, vano_stirrupDiam: 8, vano_stirrupSpacing: 400 });
    expect(r.vano.checks.find((c) => c.id === 'rho-w-min')!.status).toBe('warn');
  });

  it('no stirrups -> no rho-w-min row', () => {
    const r = calcRCBeam({ ...base, vano_stirrupSpacing: 0 });
    expect(r.vano.checks.map((c) => c.id)).not.toContain('rho-w-min');
  });
});

// ── Stirrup max spacing ───────────────────────────────────────────────────────
describe('stirrup-spacing-max check', () => {
  it('default spacing 150mm < s,max(0.75*454=340mm) -> ok', () => {
    expect(calcRCBeam(base).vano.checks.find((c) => c.id === 'stirrup-spacing-max')!.status).toBe('ok');
  });

  it('spacing > min(0.75*d, 300) -> stirrup-spacing-max fail', () => {
    // d=454, s,max=min(340.5,300)=300. spacing=350>300 -> fail
    const r = calcRCBeam({ ...base, vano_stirrupSpacing: 350 });
    expect(r.vano.checks.find((c) => c.id === 'stirrup-spacing-max')!.status).toBe('fail');
  });

  it('spacing=300mm -> stirrup-spacing-max ok (boundary)', () => {
    const r = calcRCBeam({ ...base, vano_stirrupSpacing: 300 });
    const ch = r.vano.checks.find((c) => c.id === 'stirrup-spacing-max')!;
    expect(ch.utilization).toBeCloseTo(1.0, 1);
  });

  it('no stirrups (spacing=0) -> no stirrup-spacing-max row', () => {
    const r = calcRCBeam({ ...base, vano_stirrupSpacing: 0 });
    expect(r.vano.checks.map((c) => c.id)).not.toContain('stirrup-spacing-max');
  });
});

// ── Bar spacing ───────────────────────────────────────────────────────────────
describe('Bar spacing check', () => {
  it('nBars=1 -> bar-spacing ok, value=N/A', () => {
    const r = calcRCBeam({ ...base, vano_bot_nBars: 1 });
    const c = r.vano.checks.find((c) => c.id === 'bar-spacing')!;
    expect(c.status).toBe('ok');
    expect(c.value).toBe('N/A');
  });

  it('bars do not fit -> bar-spacing-impossible fail', () => {
    // available = 300-60-16-8*32 = 300-60-16-256 = -32 <= 0
    const r = calcRCBeam({ ...base, vano_bot_nBars: 8, vano_bot_barDiam: 32 });
    const c = r.vano.checks.find((c) => c.id === 'bar-spacing-impossible');
    expect(c).toBeDefined();
    expect(c!.status).toBe('fail');
  });

  it('spacing < max(barDiam, 20) -> bar-spacing fail (too narrow)', () => {
    // 8 bars f16: available=300-60-16-128=96, spacing=96/7=13.7 < 16 (minLimit)
    const r = calcRCBeam({ ...base, vano_bot_nBars: 8, vano_bot_barDiam: 16 });
    const c = r.vano.checks.find((c) => c.id === 'bar-spacing')!;
    expect(c.status).toBe('fail');
    expect(c.utilization).toBeGreaterThan(1);
  });

  it('default vano spacing ~53mm is ok', () => {
    // available=300-60-16-64=160, spacing=160/3=53.3mm
    const r = calcRCBeam(base);
    const c = r.vano.checks.find((c) => c.id === 'bar-spacing')!;
    expect(c.status).toBe('ok');
    expect(c.value).toMatch(/53/);
  });
});

// ── Cracking ──────────────────────────────────────────────────────────────────
describe('Cracking check', () => {
  it('default XC1: wk < 0.4 -> ok', () => {
    expect(calcRCBeam(base).vano.checks.find((c) => c.id === 'cracking')!.status).toBe('ok');
  });

  it('XC1 wkMax = 0.4, XC4 wkMax = 0.2', () => {
    expect(calcRCBeam({ ...base, exposureClass: 'XC1' }).vano.wkMax).toBe(0.4);
    expect(calcRCBeam({ ...base, exposureClass: 'XC4' }).vano.wkMax).toBe(0.2);
  });

  it('Ms=0 -> wk=0', () => {
    const r = calcRCBeam({ ...base, vano_M_G: 0, vano_M_Q: 0 });
    expect(r.vano.wk).toBe(0);
  });

  it('large Ms + XC4 -> cracking fail', () => {
    const r = calcRCBeam({ ...base, exposureClass: 'XC4', vano_M_G: 100, vano_M_Q: 50, loadType: 'parking' });
    expect(r.vano.wk).toBeGreaterThan(0.2);
    expect(r.vano.checks.find((c) => c.id === 'cracking')!.status).toBe('fail');
  });
});

// ── Lap lengths ───────────────────────────────────────────────────────────────
describe('Lap lengths (CE art. 69.5.2)', () => {
  it('vano (buena adherencia): lapLength = 60 * barDiam', () => {
    expect(calcRCBeam(base).vano.lapLength).toBe(60 * 16);
  });

  it('apoyo (adherencia deficiente): lapLength = 84 * barDiam', () => {
    expect(calcRCBeam(base).apoyo.lapLength).toBe(84 * 16);
  });

  it('different tension barDiam -> different lapLength per section', () => {
    const r = calcRCBeam({ ...base, vano_bot_barDiam: 20, apoyo_top_barDiam: 12 });
    expect(r.vano.lapLength).toBe(60 * 20);
    expect(r.apoyo.lapLength).toBe(84 * 12);
  });
});

// ── Rebar schedule ────────────────────────────────────────────────────────────
describe('Rebar schedule', () => {
  it('vano: "4\u00d816(t) + 2\u00d812(c) + \u00d88/c150 (2R)"', () => {
    expect(calcRCBeam(base).vano.rebarSchedule).toBe('4\u00d816(t) + 2\u00d812(c) + \u00d88/c150 (2R)');
  });

  it('apoyo: "3\u00d816(t) + 2\u00d812(c) + \u00d88/c100 (2R)"', () => {
    expect(calcRCBeam(base).apoyo.rebarSchedule).toBe('3\u00d816(t) + 2\u00d812(c) + \u00d88/c100 (2R)');
  });

  it('suffix is R (ramas), not T', () => {
    const r = calcRCBeam(base);
    expect(r.vano.rebarSchedule).toContain('R)');
    expect(r.vano.rebarSchedule).not.toContain('T)');
  });
});

// ── Per-section invalidation ──────────────────────────────────────────────────
describe('Per-section invalidation', () => {
  it('h too shallow for vano tension barDiam -> vano.valid=false, apoyo.valid=true', () => {
    // h=50, vano_bot barDiam=32: 50 <= 30+8+16=54 -> invalid
    // apoyo_top barDiam=10: 50 > 30+8+5=43 -> valid
    const r = calcRCBeam({ ...base, h: 50, vano_bot_barDiam: 32, apoyo_top_barDiam: 10 });
    expect(r.valid).toBe(true);
    expect(r.vano.valid).toBe(false);
    expect(r.apoyo.valid).toBe(true);
  });

  it('h too shallow for apoyo tension barDiam -> apoyo.valid=false, vano.valid=true', () => {
    const r = calcRCBeam({ ...base, h: 50, vano_bot_barDiam: 8, apoyo_top_barDiam: 32 });
    expect(r.valid).toBe(true);
    expect(r.vano.valid).toBe(true);
    expect(r.apoyo.valid).toBe(false);
  });
});

// ── Global input validation ───────────────────────────────────────────────────
describe('Global input validation', () => {
  it('b <= 0 -> invalid', () => {
    expect(calcRCBeam({ ...base, b: 0 }).valid).toBe(false);
    expect(calcRCBeam({ ...base, b: -1 }).valid).toBe(false);
  });

  it('h <= 0 -> invalid', () => {
    expect(calcRCBeam({ ...base, h: 0 }).valid).toBe(false);
  });

  it('cover <= 0 -> invalid', () => {
    expect(calcRCBeam({ ...base, cover: 0 }).valid).toBe(false);
  });

  it('fck < 12 -> invalid', () => {
    expect(calcRCBeam({ ...base, fck: 10 }).valid).toBe(false);
  });

  it('fck > 90 -> invalid', () => {
    expect(calcRCBeam({ ...base, fck: 95 }).valid).toBe(false);
  });

  it('exposureClass not in {XC1,XC2,XC3,XC4} -> invalid', () => {
    expect(calcRCBeam({ ...base, exposureClass: 'XD1' }).valid).toBe(false);
  });

  it('vano_bot_nBars <= 0 -> invalid', () => {
    expect(calcRCBeam({ ...base, vano_bot_nBars: 0 }).valid).toBe(false);
  });

  it('apoyo_top_nBars <= 0 -> invalid', () => {
    expect(calcRCBeam({ ...base, apoyo_top_nBars: 0 }).valid).toBe(false);
  });

  it('valid base inputs -> result.valid=true', () => {
    expect(calcRCBeam(base).valid).toBe(true);
  });
});

// ── Regression: behavior that must not break ──────────────────────────────────
describe('Regression', () => {
  it('XC2 wkMax = 0.3', () => {
    expect(calcRCBeam({ ...base, exposureClass: 'XC2' }).vano.wkMax).toBe(0.3);
  });

  it('XC3 wkMax = 0.3', () => {
    expect(calcRCBeam({ ...base, exposureClass: 'XC3' }).vano.wkMax).toBe(0.3);
  });

  it('shear-max only when hasStirrups=true', () => {
    const with_s    = calcRCBeam({ ...base, vano_stirrupSpacing: 150 });
    const without_s = calcRCBeam({ ...base, vano_stirrupSpacing: 0   });
    expect(with_s.vano.checks.some((c) => c.id === 'shear-max')).toBe(true);
    expect(without_s.vano.checks.some((c) => c.id === 'shear-max')).toBe(false);
  });

  it('Md=0 is valid (pure shear case)', () => {
    const r = calcRCBeam({ ...base, vano_Md: 0, vano_M_G: 0, vano_M_Q: 0 });
    expect(r.valid).toBe(true);
    expect(r.vano.valid).toBe(true);
  });

  it('result has vano and apoyo keys (not midspan/support)', () => {
    const r = calcRCBeam(base);
    expect(r).toHaveProperty('vano');
    expect(r).toHaveProperty('apoyo');
    expect(r).not.toHaveProperty('midspan');
    expect(r).not.toHaveProperty('support');
  });
});

// ── Stirrup leg spacing (CE Anejo 19 art. 9.2.2(8)) ──────────────────────────
describe('stirrup-legs-spacing (CE Anejo 19 art. 9.2.2(8))', () => {
  it('nLegs=2, standard beam -> ok (s_t=224 < 340 mm limit)', () => {
    // b=300, h=500, cover=30, stirrupDiam=8, stirrupLegs=2
    // inner = 300 - 60 - 16 = 224; s_t = 224/1 = 224
    // d = 500 - 30 - 8 - 8 = 454; s_t_max = min(0.75*454, 600) = 340
    const r = calcRCBeam({ ...base, b: 300, h: 500, cover: 30, vano_stirrupDiam: 8, vano_stirrupLegs: 2 });
    const c = r.vano.checks.find((ch) => ch.id === 'stirrup-legs-spacing')!;
    expect(c).toBeDefined();
    expect(c.status).toBe('ok');
  });

  it('nLegs=2, very wide beam -> fail (s_t=1124 > 265 mm limit)', () => {
    // b=1200, h=400, cover=30, stirrupDiam=8, stirrupLegs=2
    // inner = 1200 - 60 - 16 = 1124; s_t = 1124/1 = 1124
    // d = 400 - 30 - 8 - 8 = 354; s_t_max = min(0.75*354, 600) = min(265, 600) = 265
    const r = calcRCBeam({
      ...base, b: 1200, h: 400, cover: 30,
      vano_stirrupDiam: 8, vano_stirrupLegs: 2, vano_bot_barDiam: 16,
    });
    const c = r.vano.checks.find((ch) => ch.id === 'stirrup-legs-spacing')!;
    expect(c).toBeDefined();
    expect(c.status).toBe('fail');
  });

  it('nLegs=3, standard beam -> ok (s_t=162 < 415 mm limit)', () => {
    // b=400, h=600, cover=30, stirrupDiam=8, stirrupLegs=3
    // inner = 400 - 60 - 16 = 324; s_t = 324/2 = 162
    // d = 600 - 30 - 8 - 8 = 554; s_t_max = min(0.75*554, 600) = min(415, 600) = 415
    const r = calcRCBeam({ ...base, b: 400, h: 600, cover: 30, vano_stirrupDiam: 8, vano_stirrupLegs: 3 });
    const c = r.vano.checks.find((ch) => ch.id === 'stirrup-legs-spacing')!;
    expect(c).toBeDefined();
    expect(c.status).toBe('ok');
  });

  it('check id present in vano checks', () => {
    const r = calcRCBeam(base);
    expect(r.vano.checks.find((c) => c.id === 'stirrup-legs-spacing')).toBeDefined();
  });

  it('check id present in apoyo checks', () => {
    const r = calcRCBeam(base);
    expect(r.apoyo.checks.find((c) => c.id === 'stirrup-legs-spacing')).toBeDefined();
  });
});
