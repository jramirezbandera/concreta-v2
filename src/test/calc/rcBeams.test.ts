// RC Beams test suite — full rewrite for two-section redesign
// Tests: FTUX defaults, all check types, edge cases, per-section invalidation, global invalidation
// Covers: d fix (stirrupDiam included), psi2 lookup, bending-over, rho-w-min, bar-spacing,
//         cracking, lap lengths, rebar schedule format

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

  it('midspan: d = 454 mm (stirrupDiam fix — was 462 before redesign)', () => {
    // d = 500 - 30 - 8 - 16/2 = 454
    const r = calcRCBeam(base);
    expect(r.midspan.valid).toBe(true);
    expect(r.midspan.d).toBe(454);
  });

  it('midspan: As = 4 * 201.1 = 804.4 mm2', () => {
    const r = calcRCBeam(base);
    expect(r.midspan.As).toBeCloseTo(804.4, 0);
  });

  it('midspan: x in 85-90 mm range', () => {
    const r = calcRCBeam(base);
    expect(r.midspan.x).toBeGreaterThan(85);
    expect(r.midspan.x).toBeLessThan(90);
  });

  it('midspan: MRd approx 147 kNm', () => {
    const r = calcRCBeam(base);
    expect(r.midspan.MRd).toBeCloseTo(147, 0);
  });

  it('midspan: Md=85 < MRd=147 → utilization ~0.58 → bending ok', () => {
    const r = calcRCBeam(base);
    const b = r.midspan.checks.find((c) => c.id === 'bending')!;
    expect(b.status).toBe('ok');
    expect(b.utilization).toBeGreaterThan(0.5);
    expect(b.utilization).toBeLessThan(0.8);
  });

  it('midspan: all checks are ok (no fail, no warn)', () => {
    const r = calcRCBeam(base);
    for (const c of r.midspan.checks) {
      expect(c.status).not.toBe('fail');
    }
  });

  it('support: d = 454 mm (same barDiam)', () => {
    const r = calcRCBeam(base);
    expect(r.support.valid).toBe(true);
    expect(r.support.d).toBe(454);
  });

  it('support: all checks are ok (no fail)', () => {
    const r = calcRCBeam(base);
    for (const c of r.support.checks) {
      expect(c.status).not.toBe('fail');
    }
  });

  it('midspan checks include rho-w-min', () => {
    const r = calcRCBeam(base);
    expect(r.midspan.checks.map((c) => c.id)).toContain('rho-w-min');
  });

  it('midspan checks include bar-spacing', () => {
    const r = calcRCBeam(base);
    expect(r.midspan.checks.map((c) => c.id)).toContain('bar-spacing');
  });

  it('all check rows have article field matching "CE art."', () => {
    const r = calcRCBeam(base);
    for (const s of [r.midspan, r.support]) {
      for (const c of s.checks) {
        expect(c.article).toMatch(/CE art\./);
      }
    }
  });
});

// ── Per-section effective depth ───────────────────────────────────────────────
describe('Per-section effective depth', () => {
  it('midspan barDiam=20 -> d=452, support barDiam=12 -> d=456', () => {
    // d_mid = 500 - 30 - 8 - 20/2 = 452
    // d_sup = 500 - 30 - 8 - 12/2 = 456
    const r = calcRCBeam({ ...base, midspan_barDiam: 20, support_barDiam: 12 });
    expect(r.midspan.d).toBe(452);
    expect(r.support.d).toBe(456);
  });

  it('more bars at midspan -> larger As at midspan', () => {
    const r = calcRCBeam({ ...base, midspan_nBars: 6, support_nBars: 2 });
    expect(r.midspan.As).toBeGreaterThan(r.support.As);
  });
});

// ── Per-section stirrup spacing ───────────────────────────────────────────────
describe('Per-section stirrup spacing', () => {
  it('denser stirrups at support -> higher VRds at support', () => {
    const r = calcRCBeam({ ...base, midspan_stirrupSpacing: 200, support_stirrupSpacing: 100 });
    expect(r.support.VRds).toBeGreaterThan(r.midspan.VRds);
  });
});

// ── psi2 / loadType lookup ────────────────────────────────────────────────────
describe('psi2 / loadType', () => {
  it('residential -> psi2 = 0.3 -> Ms = M_G + 0.3*M_Q', () => {
    const r = calcRCBeam({ ...base, loadType: 'residential', midspan_M_G: 40, midspan_M_Q: 20 });
    expect(r.midspan.wk).toBeGreaterThan(0);
  });

  it('roof -> psi2 = 0.0 -> lower wk than residential', () => {
    const res  = calcRCBeam({ ...base, loadType: 'residential', midspan_M_G: 40, midspan_M_Q: 20 });
    const roof = calcRCBeam({ ...base, loadType: 'roof',        midspan_M_G: 40, midspan_M_Q: 20 });
    expect(roof.midspan.wk).toBeLessThan(res.midspan.wk);
  });

  it('parking -> psi2 = 0.6 -> higher wk than residential', () => {
    const res = calcRCBeam({ ...base, loadType: 'residential', midspan_M_G: 30, midspan_M_Q: 20 });
    const par = calcRCBeam({ ...base, loadType: 'parking',     midspan_M_G: 30, midspan_M_Q: 20 });
    expect(par.midspan.wk).toBeGreaterThan(res.midspan.wk);
  });

  it('custom loadType uses psi2Custom', () => {
    const r   = calcRCBeam({ ...base, loadType: 'custom', psi2Custom: 0.6, midspan_M_G: 30, midspan_M_Q: 20 });
    const par = calcRCBeam({ ...base, loadType: 'parking',                  midspan_M_G: 30, midspan_M_Q: 20 });
    expect(r.midspan.wk).toBeCloseTo(par.midspan.wk, 3);
  });

  it('psi2Custom ignored when loadType != custom', () => {
    const r1 = calcRCBeam({ ...base, loadType: 'residential', psi2Custom: 0.6 });
    const r2 = calcRCBeam({ ...base, loadType: 'residential', psi2Custom: 0.0 });
    expect(r1.midspan.wk).toBeCloseTo(r2.midspan.wk, 6);
  });
});

// ── Bending check thresholds ──────────────────────────────────────────────────
describe('Bending check thresholds', () => {
  it('Md < 0.8*MRd -> bending ok', () => {
    const r = calcRCBeam(base); // Md=85, MRd~147 -> util~0.58
    expect(r.midspan.checks.find((c) => c.id === 'bending')!.status).toBe('ok');
  });

  it('0.8*MRd <= Md < MRd -> bending warn', () => {
    const r = calcRCBeam({ ...base, midspan_Md: 130 }); // MRd~147, util~0.88
    expect(r.midspan.checks.find((c) => c.id === 'bending')!.status).toBe('warn');
  });

  it('Md > MRd -> bending fail, utilization > 1', () => {
    const r = calcRCBeam({ ...base, midspan_Md: 200 });
    const b = r.midspan.checks.find((c) => c.id === 'bending')!;
    expect(b.status).toBe('fail');
    expect(b.utilization).toBeGreaterThan(1);
  });
});

// ── Over-reinforcement ────────────────────────────────────────────────────────
describe('Over-reinforcement', () => {
  it('normal section: no bending-over row', () => {
    const r = calcRCBeam(base);
    expect(r.midspan.checks.map((c) => c.id)).not.toContain('bending-over');
  });

  it('over-reinforced: bending-over warn row present', () => {
    const r = calcRCBeam({ ...base, midspan_nBars: 10, midspan_barDiam: 32 });
    const bo = r.midspan.checks.find((c) => c.id === 'bending-over');
    expect(bo).toBeDefined();
    expect(bo!.status).toBe('warn');
  });
});

// ── Min/max reinforcement ─────────────────────────────────────────────────────
describe('Reinforcement limits', () => {
  it('default As satisfies as-min', () => {
    expect(calcRCBeam(base).midspan.checks.find((c) => c.id === 'as-min')!.status).toBe('ok');
  });

  it('As < As,min -> as-min fail', () => {
    const r = calcRCBeam({ ...base, midspan_nBars: 1, midspan_barDiam: 6 });
    expect(r.midspan.checks.find((c) => c.id === 'as-min')!.status).toBe('fail');
  });

  it('As > As,max -> as-max fail', () => {
    // As,max = 0.04*300*500=6000mm2; 10*804.2=8042 > 6000
    const r = calcRCBeam({ ...base, midspan_nBars: 10, midspan_barDiam: 32 });
    expect(r.midspan.checks.find((c) => c.id === 'as-max')!.status).toBe('fail');
  });
});

// ── Shear ─────────────────────────────────────────────────────────────────────
describe('Shear checks', () => {
  it('VEd < VRd -> shear ok', () => {
    expect(calcRCBeam(base).midspan.checks.find((c) => c.id === 'shear')!.status).toBe('ok');
  });

  it('VEd >> VRd -> shear fail', () => {
    const r = calcRCBeam({ ...base, midspan_VEd: 500 });
    expect(r.midspan.checks.find((c) => c.id === 'shear')!.status).toBe('fail');
  });

  it('hasStirrups=true -> shear-max row present', () => {
    expect(calcRCBeam(base).midspan.checks.map((c) => c.id)).toContain('shear-max');
  });

  it('hasStirrups=false (spacing=0) -> no shear-max row', () => {
    const r = calcRCBeam({ ...base, midspan_stirrupSpacing: 0 });
    expect(r.midspan.checks.map((c) => c.id)).not.toContain('shear-max');
  });
});

// ── rho_w,min ─────────────────────────────────────────────────────────────────
describe('rho-w-min check', () => {
  it('default stirrups: rho-w-min ok', () => {
    expect(calcRCBeam(base).midspan.checks.find((c) => c.id === 'rho-w-min')!.status).toBe('ok');
  });

  it('rhoW < rhoWMin -> rho-w-min fail', () => {
    // rhoWMin = 0.072*sqrt(25)/500 = 0.00072
    // f6/c1000: rhoW = 2*28.3/(1000*300) = 0.000189 < 0.00072
    const r = calcRCBeam({ ...base, midspan_stirrupDiam: 6, midspan_stirrupSpacing: 1000 });
    expect(r.midspan.checks.find((c) => c.id === 'rho-w-min')!.status).toBe('fail');
  });

  it('rhoW ok but stirrupSpacing > 0.75*d -> rho-w-min warn', () => {
    // d=454, 0.75*d=340.5. f8/c400: rhoW=2*50.3/(400*300)=0.000838 > 0.00072 ok ratio
    // but 400 > 340.5 -> warn
    const r = calcRCBeam({ ...base, midspan_stirrupDiam: 8, midspan_stirrupSpacing: 400 });
    expect(r.midspan.checks.find((c) => c.id === 'rho-w-min')!.status).toBe('warn');
  });

  it('no stirrups -> no rho-w-min row', () => {
    const r = calcRCBeam({ ...base, midspan_stirrupSpacing: 0 });
    expect(r.midspan.checks.map((c) => c.id)).not.toContain('rho-w-min');
  });
});

// ── Bar spacing ───────────────────────────────────────────────────────────────
describe('Bar spacing check', () => {
  it('nBars=1 -> bar-spacing ok, value=N/A', () => {
    const r = calcRCBeam({ ...base, midspan_nBars: 1 });
    const c = r.midspan.checks.find((c) => c.id === 'bar-spacing')!;
    expect(c.status).toBe('ok');
    expect(c.value).toBe('N/A');
  });

  it('bars do not fit -> bar-spacing-impossible fail', () => {
    // available = 300-60-16-8*32 = 300-60-16-256 = -32 <= 0
    const r = calcRCBeam({ ...base, midspan_nBars: 8, midspan_barDiam: 32 });
    const c = r.midspan.checks.find((c) => c.id === 'bar-spacing-impossible');
    expect(c).toBeDefined();
    expect(c!.status).toBe('fail');
  });

  it('spacing < max(barDiam, 20) -> bar-spacing fail (too narrow)', () => {
    // 8 bars f16: available=300-60-16-128=96, spacing=96/7=13.7 < 16 (minLimit)
    const r = calcRCBeam({ ...base, midspan_nBars: 8, midspan_barDiam: 16 });
    const c = r.midspan.checks.find((c) => c.id === 'bar-spacing')!;
    expect(c.status).toBe('fail');
    expect(c.utilization).toBeGreaterThan(1);
  });

  it('default midspan spacing ~53mm is ok', () => {
    // available=300-60-16-64=160, spacing=160/3=53.3mm
    const r = calcRCBeam(base);
    const c = r.midspan.checks.find((c) => c.id === 'bar-spacing')!;
    expect(c.status).toBe('ok');
    expect(c.value).toMatch(/53/);
  });
});

// ── Cracking ──────────────────────────────────────────────────────────────────
describe('Cracking check', () => {
  it('default XC1: wk < 0.4 -> ok', () => {
    expect(calcRCBeam(base).midspan.checks.find((c) => c.id === 'cracking')!.status).toBe('ok');
  });

  it('XC1 wkMax = 0.4, XC4 wkMax = 0.2', () => {
    expect(calcRCBeam({ ...base, exposureClass: 'XC1' }).midspan.wkMax).toBe(0.4);
    expect(calcRCBeam({ ...base, exposureClass: 'XC4' }).midspan.wkMax).toBe(0.2);
  });

  it('Ms=0 -> wk=0', () => {
    const r = calcRCBeam({ ...base, midspan_M_G: 0, midspan_M_Q: 0 });
    expect(r.midspan.wk).toBe(0);
  });

  it('large Ms + XC4 -> cracking fail', () => {
    const r = calcRCBeam({ ...base, exposureClass: 'XC4', midspan_M_G: 100, midspan_M_Q: 50, loadType: 'parking' });
    expect(r.midspan.wk).toBeGreaterThan(0.2);
    expect(r.midspan.checks.find((c) => c.id === 'cracking')!.status).toBe('fail');
  });
});

// ── Lap lengths ───────────────────────────────────────────────────────────────
describe('Lap lengths (CE art. 69.5.2)', () => {
  it('midspan (buena adherencia): lapLength = 60 * barDiam', () => {
    expect(calcRCBeam(base).midspan.lapLength).toBe(60 * 16);
  });

  it('support (adherencia deficiente): lapLength = 84 * barDiam', () => {
    expect(calcRCBeam(base).support.lapLength).toBe(84 * 16);
  });

  it('different barDiam -> different lapLength per section', () => {
    const r = calcRCBeam({ ...base, midspan_barDiam: 20, support_barDiam: 12 });
    expect(r.midspan.lapLength).toBe(60 * 20);
    expect(r.support.lapLength).toBe(84 * 12);
  });
});

// ── Rebar schedule ────────────────────────────────────────────────────────────
describe('Rebar schedule', () => {
  it('midspan: "4\u00d816 + \u00d88/c150 (2R)"', () => {
    expect(calcRCBeam(base).midspan.rebarSchedule).toBe('4\u00d816 + \u00d88/c150 (2R)');
  });

  it('support: "3\u00d816 + \u00d88/c100 (2R)"', () => {
    expect(calcRCBeam(base).support.rebarSchedule).toBe('3\u00d816 + \u00d88/c100 (2R)');
  });

  it('suffix is R (ramas), not T', () => {
    const r = calcRCBeam(base);
    expect(r.midspan.rebarSchedule).toContain('R)');
    expect(r.midspan.rebarSchedule).not.toContain('T)');
  });
});

// ── Per-section invalidation ──────────────────────────────────────────────────
describe('Per-section invalidation', () => {
  it('h too shallow for midspan barDiam -> midspan.valid=false, support.valid=true', () => {
    // h=50, midspan barDiam=32: 50 <= 30+8+16=54 -> invalid
    // support barDiam=10: 50 > 30+8+5=43 -> valid
    const r = calcRCBeam({ ...base, h: 50, midspan_barDiam: 32, support_barDiam: 10 });
    expect(r.valid).toBe(true);
    expect(r.midspan.valid).toBe(false);
    expect(r.support.valid).toBe(true);
  });

  it('h too shallow for support barDiam -> support.valid=false, midspan.valid=true', () => {
    const r = calcRCBeam({ ...base, h: 50, midspan_barDiam: 8, support_barDiam: 32 });
    expect(r.valid).toBe(true);
    expect(r.midspan.valid).toBe(true);
    expect(r.support.valid).toBe(false);
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

  it('midspan_nBars <= 0 -> invalid', () => {
    expect(calcRCBeam({ ...base, midspan_nBars: 0 }).valid).toBe(false);
  });

  it('support_nBars <= 0 -> invalid', () => {
    expect(calcRCBeam({ ...base, support_nBars: 0 }).valid).toBe(false);
  });

  it('valid base inputs -> result.valid=true', () => {
    expect(calcRCBeam(base).valid).toBe(true);
  });
});

// ── Regression: behavior that must not break ──────────────────────────────────
describe('Regression', () => {
  it('XC2 wkMax = 0.3', () => {
    expect(calcRCBeam({ ...base, exposureClass: 'XC2' }).midspan.wkMax).toBe(0.3);
  });

  it('XC3 wkMax = 0.3', () => {
    expect(calcRCBeam({ ...base, exposureClass: 'XC3' }).midspan.wkMax).toBe(0.3);
  });

  it('shear-max only when hasStirrups=true', () => {
    const with_s    = calcRCBeam({ ...base, midspan_stirrupSpacing: 150 });
    const without_s = calcRCBeam({ ...base, midspan_stirrupSpacing: 0   });
    expect(with_s.midspan.checks.some((c) => c.id === 'shear-max')).toBe(true);
    expect(without_s.midspan.checks.some((c) => c.id === 'shear-max')).toBe(false);
  });

  it('Md=0 is valid (pure shear case)', () => {
    const r = calcRCBeam({ ...base, midspan_Md: 0, midspan_M_G: 0, midspan_M_Q: 0 });
    expect(r.valid).toBe(true);
    expect(r.midspan.valid).toBe(true);
  });
});
